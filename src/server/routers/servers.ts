/**
 * Servers Router
 * 
 * This router handles all server-related operations including:
 * - Listing and filtering servers
 * - Adding new Outline servers
 * - Updating server configuration
 * - Deleting servers
 * - Syncing server data from Outline API
 * - Testing server connectivity
 */

import { z } from 'zod';
import { router, protectedProcedure, adminProcedure, publicProcedure } from '../trpc';
import { db } from '@/lib/db';
import { createOutlineClient, parseOutlineConfig } from '@/lib/outline-api';
import { TRPCError } from '@trpc/server';
import { logger } from '@/lib/logger';
import { acquireSyncLock, releaseSyncLock, getSyncLockStatus } from '@/lib/sync-lock';
import { writeAuditLog } from '@/lib/audit';
import { CONNECTION_SESSION_TIMEOUT_MS } from '@/lib/services/session-management';
import { canAssignKeysToServer, serverLifecycleModeSchema } from '@/lib/services/server-lifecycle';

/**
 * Input validation schema for creating a new server.
 * 
 * The apiUrl should be the full URL from the Outline Manager installation,
 * including the management port and access key path. The certSha256 is the
 * SHA-256 fingerprint of the server's self-signed certificate.
 */
const createServerSchema = z.object({
  name: z.string().min(1, 'Server name is required').max(100),
  apiUrl: z.string().url('Invalid API URL'),
  apiCertSha256: z.string().min(64).max(64),
  location: z.string().max(100).optional(),
  countryCode: z.string().length(2).optional(),
  isDefault: z.boolean().optional(),
  lifecycleMode: serverLifecycleModeSchema.optional(),
  lifecycleNote: z.string().max(280).optional().nullable(),
  tagIds: z.array(z.string()).optional(),
  enableHealthCheck: z.boolean().default(true),
});

/**
 * Input validation schema for updating an existing server.
 * All fields are optional since partial updates are common.
 */
const updateServerSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100).optional(),
  location: z.string().max(100).optional().nullable(),
  countryCode: z.string().length(2).optional().nullable(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  lifecycleMode: serverLifecycleModeSchema.optional(),
  lifecycleNote: z.string().max(280).optional().nullable(),
  maxKeys: z.number().int().positive().optional().nullable(),
  tagIds: z.array(z.string()).optional(),
});

/**
 * Schema for parsing Outline Manager configuration.
 * This allows users to paste the entire JSON output from installation.
 */
const parseConfigSchema = z.object({
  config: z.string(),
});

// Ignore tiny Outline counter drift and only treat a more meaningful burst as
// real recent activity for sessions and user-facing traffic presence.
const MIN_SESSION_KEEPALIVE_BYTES = 64 * 1024;
// Require the same stronger burst before refreshing "last seen".
const MIN_MEANINGFUL_ACTIVITY_BYTES = 64 * 1024;

export const serversRouter = router({
  /**
   * List all servers with optional filtering.
   * 
   * Returns servers with their related tags, health check status,
   * and key counts. Results can be filtered by active status and tags.
   */
  list: adminProcedure
    .input(
      z.object({
        includeInactive: z.boolean().optional(),
        tagIds: z.array(z.string()).optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      // Build the where clause based on filters
      const where: Record<string, unknown> = {};

      if (!input?.includeInactive) {
        where.isActive = true;
      }

      if (input?.tagIds && input.tagIds.length > 0) {
        where.tags = {
          some: {
            tagId: { in: input.tagIds },
          },
        };
      }

      // Fetch servers with all related data
      const servers = await db.server.findMany({
        where,
        include: {
          tags: {
            include: {
              tag: true,
            },
          },
          healthCheck: true,
          _count: {
            select: {
              accessKeys: true,
            },
          },
        },
        orderBy: [
          { sortOrder: 'asc' },
          { name: 'asc' },
        ],
      });

      // Get total bandwidth per server using aggregate query
      const bandwidthByServer = await db.accessKey.groupBy({
        by: ['serverId'],
        _sum: {
          usedBytes: true,
        },
        where: {
          serverId: { in: servers.map((s) => s.id) },
        },
      });

      const bandwidthMap = new Map(
        bandwidthByServer.map((b) => [b.serverId, b._sum.usedBytes ?? BigInt(0)])
      );

      // Get active key counts per server
      const activeKeysByServer = await db.accessKey.groupBy({
        by: ['serverId'],
        _count: true,
        where: {
          serverId: { in: servers.map((s) => s.id) },
          status: 'ACTIVE',
        },
      });

      const activeKeysMap = new Map(
        activeKeysByServer.map((a) => [a.serverId, a._count])
      );

      // Transform the data to flatten the tags structure and calculate metrics
      return servers.map((server) => {
        return {
          ...server,
          tags: server.tags.map((st) => st.tag),
          metrics: {
            totalBandwidth: bandwidthMap.get(server.id) ?? BigInt(0),
            activeKeys: activeKeysMap.get(server.id) ?? 0,
            totalKeys: server._count.accessKeys,
          },
        };
      });
    }),

  /**
   * Get a single server by ID with full details.
   * 
   * Includes all related data and fetches fresh metrics
   * from the Outline API if the server is reachable.
   */
  getById: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const server = await db.server.findUnique({
        where: { id: input.id },
        include: {
          tags: {
            include: {
              tag: true,
            },
          },
          healthCheck: true,
          outageState: true,
          accessKeys: {
            take: 100,
            orderBy: { createdAt: 'desc' },
          },
          _count: {
            select: {
              accessKeys: true,
            },
          },
        },
      });

      if (!server) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Server not found',
        });
      }

      return {
        ...server,
        tags: server.tags.map((st) => st.tag),
      };
    }),

  /**
   * Add a new Outline server to Atomic-UI.
   * 
   * This procedure validates the connection to the Outline server,
   * fetches its information, and stores it in the database. If the
   * server is unreachable, an error is thrown.
   * 
   * The procedure also creates a health check record for the server
   * if enabled, allowing automated monitoring of server availability.
   */
  create: adminProcedure
    .input(createServerSchema)
    .mutation(async ({ ctx, input }) => {
      // Create an Outline client to test the connection
      const client = createOutlineClient(input.apiUrl, input.apiCertSha256);

      // Fetch server info to validate the connection
      let serverInfo;
      try {
        serverInfo = await client.getServerInfo();
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Failed to connect to Outline server: ${(error as Error).message}`,
        });
      }

      // Check if this API URL already exists
      const existing = await db.server.findFirst({
        where: { apiUrl: input.apiUrl },
      });

      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'A server with this API URL already exists',
        });
      }

      // If this is set as default, unset any existing default
      if (input.isDefault) {
        await db.server.updateMany({
          where: { isDefault: true },
          data: { isDefault: false },
        });
      }

      // Create the server record
      const server = await db.server.create({
        data: {
          name: input.name,
          apiUrl: input.apiUrl,
          apiCertSha256: input.apiCertSha256,
          location: input.location,
          countryCode: input.countryCode,
          isDefault: input.isDefault ?? false,
          lifecycleMode: input.lifecycleMode ?? 'ACTIVE',
          lifecycleNote: input.lifecycleNote ?? null,
          lifecycleChangedAt: new Date(),
          outlineServerId: serverInfo.serverId,
          outlineName: serverInfo.name,
          outlineVersion: serverInfo.version,
          hostnameForAccessKeys: serverInfo.hostnameForAccessKeys,
          portForNewAccessKeys: serverInfo.portForNewAccessKeys,
          metricsEnabled: serverInfo.metricsEnabled,
          lastSyncAt: new Date(),
          // Connect tags if provided
          tags: input.tagIds
            ? {
              create: input.tagIds.map((tagId) => ({
                tag: { connect: { id: tagId } },
              })),
            }
            : undefined,
        },
        include: {
          tags: {
            include: {
              tag: true,
            },
          },
        },
      });

      // Create health check record if enabled
      if (input.enableHealthCheck) {
        await db.healthCheck.create({
          data: {
            serverId: server.id,
            isEnabled: true,
            lastStatus: 'UP',
            lastLatencyMs: 0,
            lastCheckedAt: new Date(),
          },
        });
      }

      await writeAuditLog({
        userId: ctx.user.id,
        ip: ctx.clientIp,
        action: 'SERVER_CREATE',
        entity: 'SERVER',
        entityId: server.id,
        details: {
          name: server.name,
          location: server.location,
          countryCode: server.countryCode,
          isDefault: server.isDefault,
          lifecycleMode: server.lifecycleMode,
          lifecycleNote: server.lifecycleNote,
        },
      });

      return {
        ...server,
        tags: server.tags.map((st) => st.tag),
      };
    }),

  /**
   * Update an existing server's configuration.
   * 
   * This allows updating the display name, location, tags, and
   * other metadata. The API URL and certificate cannot be changed;
   * to update those, delete and recreate the server.
   */
  update: adminProcedure
    .input(updateServerSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, tagIds, ...data } = input;

      // Check if the server exists
      const existing = await db.server.findUnique({
        where: { id },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Server not found',
        });
      }

      // If setting as default, unset any existing default
      if (data.isDefault) {
        await db.server.updateMany({
          where: { isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }

      // Update the server
      const server = await db.server.update({
        where: { id },
        data: {
          ...data,
          ...(data.lifecycleMode || data.lifecycleNote !== undefined
            ? {
                lifecycleChangedAt: new Date(),
              }
            : {}),
          // Update tags if provided
          tags: tagIds
            ? {
              deleteMany: {},
              create: tagIds.map((tagId) => ({
                tag: { connect: { id: tagId } },
              })),
            }
            : undefined,
        },
        include: {
          tags: {
            include: {
              tag: true,
            },
          },
          healthCheck: true,
        },
      });

      await writeAuditLog({
        userId: ctx.user.id,
        ip: ctx.clientIp,
        action: 'SERVER_UPDATE',
        entity: 'SERVER',
        entityId: server.id,
        details: {
          name: server.name,
          location: server.location,
          countryCode: server.countryCode,
          isDefault: server.isDefault,
          isActive: server.isActive,
          lifecycleMode: server.lifecycleMode,
          lifecycleNote: server.lifecycleNote,
        },
      });

      return {
        ...server,
        tags: server.tags.map((st) => st.tag),
      };
    }),

  setLifecycleMode: adminProcedure
    .input(
      z.object({
        id: z.string(),
        lifecycleMode: serverLifecycleModeSchema,
        lifecycleNote: z.string().max(280).optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await db.server.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          name: true,
          lifecycleMode: true,
          lifecycleNote: true,
          isActive: true,
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Server not found',
        });
      }

      const server = await db.server.update({
        where: { id: input.id },
        data: {
          lifecycleMode: input.lifecycleMode,
          lifecycleNote: input.lifecycleNote?.trim() || null,
          lifecycleChangedAt: new Date(),
        },
        select: {
          id: true,
          name: true,
          lifecycleMode: true,
          lifecycleNote: true,
          lifecycleChangedAt: true,
          isActive: true,
        },
      });

      if (input.lifecycleMode === 'MAINTENANCE') {
        const { markServerOutageDetected } = await import('@/lib/services/server-outage');
        await markServerOutageDetected({
          serverId: server.id,
          cause: 'MANUAL_OUTAGE',
        });
      } else if ((existing.lifecycleMode as string | null) === 'MAINTENANCE') {
        const { markServerOutageRecovered } = await import('@/lib/services/server-outage');
        await markServerOutageRecovered(server.id);
      }

      await writeAuditLog({
        userId: ctx.user.id,
        ip: ctx.clientIp,
        action: 'SERVER_LIFECYCLE_UPDATE',
        entity: 'SERVER',
        entityId: server.id,
        details: {
          name: server.name,
          previousMode: existing.lifecycleMode,
          previousNote: existing.lifecycleNote,
          lifecycleMode: server.lifecycleMode,
          lifecycleNote: server.lifecycleNote,
          isActive: server.isActive,
        },
      });

      return server;
    }),

  outageReplace: adminProcedure
    .input(
      z.object({
        sourceServerId: z.string(),
        targetServerId: z.string(),
        gracePeriodHours: z.number().int().min(2).max(3).default(3),
        notifyUsers: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.sourceServerId === input.targetServerId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Source and target servers must be different.',
        });
      }

      try {
        const { executeServerOutageReplacement } = await import('@/lib/services/server-outage');
        const result = await executeServerOutageReplacement(input);

        await writeAuditLog({
          userId: ctx.user.id,
          ip: ctx.clientIp,
          action: 'SERVER_OUTAGE_REPLACEMENT',
          entity: 'SERVER',
          entityId: input.sourceServerId,
          details: {
            sourceServerId: result.sourceServer.id,
            sourceServerName: result.sourceServer.name,
            targetServerId: result.targetServer.id,
            targetServerName: result.targetServer.name,
            migrated: result.migrated,
            failed: result.failed,
            total: result.total,
            gracePeriodHours: input.gracePeriodHours,
            notifyUsers: input.notifyUsers,
            recoveryNotifications: result.recoveryNotifications,
          },
        });

        return result;
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: (error as Error).message || 'Failed to replace outage keys.',
        });
      }
    }),

  /**
   * Delete a server and all its associated data.
   * 
   * WARNING: This is a destructive operation that removes the server
   * from Atomic-UI, but does NOT delete the keys from the actual
   * Outline server. This is intentional to prevent accidental deletion
   * of active VPN connections.
   */
  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const server = await db.server.findUnique({
        where: { id: input.id },
      });

      if (!server) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Server not found',
        });
      }

      // Delete the server (cascades to related records)
      await db.server.delete({
        where: { id: input.id },
      });

      await writeAuditLog({
        userId: ctx.user.id,
        ip: ctx.clientIp,
        action: 'SERVER_DELETE',
        entity: 'SERVER',
        entityId: server.id,
        details: {
          name: server.name,
          apiUrl: server.apiUrl,
        },
      });

      return { success: true };
    }),

  /**
   * Sync server data from the Outline API.
   * 
   * This fetches the latest server information, access keys, and
   * metrics from the Outline server and updates the local database.
   * It should be called periodically or when the user requests a refresh.
   */
  sync: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const server = await db.server.findUnique({
        where: { id: input.id },
      });

      if (!server) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Server not found',
        });
      }

      const client = createOutlineClient(server.apiUrl, server.apiCertSha256);

      try {
        // Fetch server info
        const serverInfo = await client.getServerInfo();

        // Fetch all access keys
        const outlineKeys = await client.listAccessKeys();

        // Always try to fetch metrics (the metricsEnabled flag might be stale)
        let metrics: { bytesTransferredByUserId: Record<string, number> } | null = null;
        try {
          metrics = await client.getMetrics();
          logger.verbose('sync', 'Metrics fetched for server sync', {
            serverId: server.id,
            keyCount: Object.keys(metrics?.bytesTransferredByUserId || {}).length,
          });
        } catch (metricsError) {
          logger.warn(`Could not fetch metrics for server ${server.name}`, (metricsError as Error).message);
        }

        // Update server info in database
        await db.server.update({
          where: { id: input.id },
          data: {
            outlineServerId: serverInfo.serverId,
            outlineName: serverInfo.name,
            outlineVersion: serverInfo.version,
            hostnameForAccessKeys: serverInfo.hostnameForAccessKeys,
            portForNewAccessKeys: serverInfo.portForNewAccessKeys,
            metricsEnabled: serverInfo.metricsEnabled,
            lastSyncAt: new Date(),
          },
        });

        // Sync access keys - update existing, add new ones
        for (const outlineKey of outlineKeys) {
          const existingKey = await db.accessKey.findUnique({
            where: {
              serverId_outlineKeyId: {
                serverId: input.id,
                outlineKeyId: outlineKey.id,
              },
            },
          });

          // Get traffic data for this key - try both string and number key formats
          const keyId = outlineKey.id;
          const usedBytes = metrics?.bytesTransferredByUserId?.[keyId] ??
            metrics?.bytesTransferredByUserId?.[String(keyId)] ?? 0;

          if (existingKey) {
            // Calculate effective usage (metric - offset)
            const metricBytes = Number(usedBytes);
            const offset = Number(existingKey.usageOffset || 0);

            // If metric < offset, server might have been reset or reinstalled. Adjust offset to 0 conservatively?
            // Or assume metric is accurate and offset is stale? 
            // Better to assume offset is valid unless metric < offset, in which case offset = 0.

            const effectiveUsedBytes = (metricBytes < offset)
              ? metricBytes // Server reset scenario
              : metricBytes - offset;

            const previousUsedBytes = Number(existingKey.usedBytes);
            const bytesTransferred = effectiveUsedBytes - previousUsedBytes;

            logger.verbose('sync', `Key usage delta calculated for ${outlineKey.name || keyId}`, {
              serverId: server.id,
              outlineKeyId: keyId,
              metricBytes,
              offset,
              effectiveUsedBytes,
              bytesTransferred,
            });

            // Prepare update data
            const updateData: Record<string, unknown> = {
              accessUrl: outlineKey.accessUrl,
              password: outlineKey.password,
              port: outlineKey.port,
              method: outlineKey.method,
              // Keep local data limit if we are managing it?
              // If strategy is set, we treat dataLimitBytes as Period Limit and ignore server limit for DB update?
              // But serversRouter usually trusts Outline.
              // Logic: If strategy != NEVER, we trust our DB dataLimitBytes more than Server Limit?
              // The server limit will be set to (Limit + Offset).
              // So if we sync back from server, we might get (Limit + Offset).
              // We should probably NOT overwrite dataLimitBytes if strategy != 'NEVER'.
            };

            // Should we update dataLimitBytes from server? 
            // Only if strategy is NEVER (default behavior).
            if (!existingKey.dataLimitResetStrategy || existingKey.dataLimitResetStrategy === 'NEVER') {
              updateData.dataLimitBytes = outlineKey.dataLimit?.bytes
                ? BigInt(outlineKey.dataLimit.bytes)
                : null;
            }

            updateData.usedBytes = BigInt(effectiveUsedBytes);

            // If metric < offset (server reset), update offset to 0
            if (metricBytes < offset) {
              updateData.usageOffset = BigInt(0);
            }

            // Check if PENDING key has been used - activate it and start expiration timer
            if (existingKey.status === 'PENDING' && effectiveUsedBytes > 0) {
              const now = new Date();
              updateData.status = 'ACTIVE';
              updateData.firstUsedAt = now;

              // Calculate expiration based on durationDays if set
              if (existingKey.durationDays) {
                const expiresAt = new Date(now);
                expiresAt.setDate(expiresAt.getDate() + existingKey.durationDays);
                updateData.expiresAt = expiresAt;
              }
            }

            // Check if ACTIVE key has exceeded data limit - mark as depleted
            const dataLimit = (existingKey.dataLimitBytes) ? Number(existingKey.dataLimitBytes) : null;
            if (existingKey.status === 'ACTIVE' && dataLimit && effectiveUsedBytes >= dataLimit) {
              // Double check server status is respected? 
              // If periodic limit, we rely on server having blocked it OR we block it here.
              // Outline Server doesn't have "DISABLED" state for depletion, it just drops packets.
              // But we mark it as DEPLETED in UI.
              updateData.status = 'DEPLETED';
              logger.info(`Key ${outlineKey.name || keyId} depleted during server sync`, {
                serverId: server.id,
                outlineKeyId: keyId,
                effectiveUsedBytes,
                dataLimit,
              });
            }

            const hasSessionTraffic = bytesTransferred >= MIN_SESSION_KEEPALIVE_BYTES;
            const hasMeaningfulTraffic = bytesTransferred >= MIN_MEANINGFUL_ACTIVITY_BYTES;
            if (hasSessionTraffic) {
              updateData.lastTrafficAt = new Date();
            }
            if (hasMeaningfulTraffic) {
              updateData.lastUsedAt = new Date();
            }

            // Update existing key
            await db.accessKey.update({
              where: { id: existingKey.id },
              data: updateData,
            });

            // Session tracking for device estimation
            const now = new Date();

            if (hasSessionTraffic) {
              // Check for active session
              const activeSession = await db.connectionSession.findFirst({
                where: {
                  accessKeyId: existingKey.id,
                  isActive: true,
                },
                orderBy: { startedAt: 'desc' },
              });

              if (activeSession) {
                // Update existing session
                await db.connectionSession.update({
                  where: { id: activeSession.id },
                  data: {
                    lastActiveAt: now,
                    bytesUsed: { increment: BigInt(bytesTransferred) },
                  },
                });
              } else {
                // Create new session
                await db.connectionSession.create({
                  data: {
                    accessKeyId: existingKey.id,
                    bytesUsed: BigInt(bytesTransferred),
                  },
                });
              }

              // Update device count
              const activeSessionCount = await db.connectionSession.count({
                where: {
                  accessKeyId: existingKey.id,
                  isActive: true,
                },
              });

              await db.accessKey.update({
                where: { id: existingKey.id },
                data: {
                  estimatedDevices: activeSessionCount,
                  peakDevices: Math.max(existingKey.peakDevices || 0, activeSessionCount),
                },
              });
            } else {
              // No traffic - close stale sessions
              await db.connectionSession.updateMany({
                where: {
                  accessKeyId: existingKey.id,
                  isActive: true,
                  lastActiveAt: {
                    lt: new Date(now.getTime() - CONNECTION_SESSION_TIMEOUT_MS),
                  },
                },
                data: {
                  isActive: false,
                  endedAt: now,
                  endedReason: 'INACTIVITY_TIMEOUT',
                },
              });

              // Update device count after closing sessions
              const activeSessionCount = await db.connectionSession.count({
                where: {
                  accessKeyId: existingKey.id,
                  isActive: true,
                },
              });

              if (activeSessionCount !== existingKey.estimatedDevices) {
                await db.accessKey.update({
                  where: { id: existingKey.id },
                  data: { estimatedDevices: activeSessionCount },
                });
              }
            }

            // Create TrafficLog entry if there was meaningful traffic since last sync
            const MIN_TRAFFIC_THRESHOLD = 100 * 1024; // 100KB threshold for logging
            if (bytesTransferred >= MIN_TRAFFIC_THRESHOLD) {
              logger.verbose('sync', `Creating traffic log for ${outlineKey.name || keyId}`, {
                serverId: server.id,
                outlineKeyId: keyId,
                bytesTransferred,
              });
              await db.trafficLog.create({
                data: {
                  accessKeyId: existingKey.id,
                  bytesUsed: BigInt(effectiveUsedBytes),
                  deltaBytes: BigInt(bytesTransferred),
                  recordedAt: new Date(),
                },
              });
            }
          } else {
            // Create new key record (discovered from Outline)
            await db.accessKey.create({
              data: {
                outlineKeyId: outlineKey.id,
                name: outlineKey.name || `Key ${outlineKey.id}`,
                serverId: input.id,
                accessUrl: outlineKey.accessUrl,
                password: outlineKey.password,
                port: outlineKey.port,
                method: outlineKey.method,
                dataLimitBytes: outlineKey.dataLimit?.bytes
                  ? BigInt(outlineKey.dataLimit.bytes)
                  : null,
                usedBytes: BigInt(usedBytes),
              },
            });
          }
        }

        // Find keys in our database that no longer exist on the server
        const outlineKeyIds = outlineKeys.map((k) => k.id);
        const orphanedKeys = await db.accessKey.findMany({
          where: {
            serverId: input.id,
            outlineKeyId: { notIn: outlineKeyIds },
          },
        });

        // Mark orphaned keys as deleted (or actually delete them)
        if (orphanedKeys.length > 0) {
          await db.accessKey.deleteMany({
            where: {
              id: { in: orphanedKeys.map((k) => k.id) },
            },
          });
        }

        const result = {
          success: true,
          keysFound: outlineKeys.length,
          keysCreated: outlineKeys.length - (await db.accessKey.count({
            where: { serverId: input.id },
          })),
          keysRemoved: orphanedKeys.length,
        };

        await writeAuditLog({
          userId: ctx.user.id,
          ip: ctx.clientIp,
          action: 'SERVER_SYNC',
          entity: 'SERVER',
          entityId: server.id,
          details: {
            name: server.name,
            keysFound: result.keysFound,
            keysRemoved: result.keysRemoved,
          },
        });

        return result;
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to sync server: ${(error as Error).message}`,
        });
      }
    }),

  /**
   * Get active connection count and live bandwidth by checking metric deltas.
   * This estimates "Active Connections" by seeing which keys are transmitting data.
   */
  getLiveStats: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const server = await db.server.findUnique({
        where: { id: input.id },
      });

      if (!server) return { activeConnections: 0, bandwidthBps: 0 };

      const client = createOutlineClient(server.apiUrl, server.apiCertSha256);

      try {
        // First snapshot
        const metrics1 = await client.getMetrics();

        // Wait 1 second to calculate rate
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Second snapshot
        const metrics2 = await client.getMetrics();

        // Calculate delta
        let activeConnections = 0;
        let bandwidthBps = 0;
        const keyStats: Record<string, number> = {};

        const m1 = metrics1?.bytesTransferredByUserId || {};
        const m2 = metrics2?.bytesTransferredByUserId || {};

        for (const keyId in m2) {
          const start = m1[keyId] || 0;
          const end = m2[keyId] || 0;
          const delta = end - start;

          if (delta > 0) {
            activeConnections++;
            bandwidthBps += delta;
            keyStats[keyId] = delta;
          }
        }

        return {
          activeConnections,
          bandwidthBps,
          keyStats,
        };
      } catch (error) {
        logger.error('Failed to get live stats', error);
        return { activeConnections: 0, bandwidthBps: 0 };
      }
    }),

  /**
   * Get load statistics for all active servers.
   * Used by the load balancer UI to display server load distribution.
   */
  getLoadStats: adminProcedure
    .input(z.object({
      serverTagIds: z.array(z.string()).optional(),
    }).optional())
    .query(async ({ input }) => {
      const { getServerLoadStats } = await import('@/lib/services/load-balancer');
      return getServerLoadStats(input?.serverTagIds);
    }),

  /**
   * Recommend the best current target for new access keys.
   */
  recommendAssignmentTarget: adminProcedure
    .input(z.object({
      serverTagIds: z.array(z.string()).optional(),
    }).optional())
    .query(async ({ input }) => {
      const { selectLeastLoadedServer } = await import('@/lib/services/load-balancer');
      return selectLeastLoadedServer(input?.serverTagIds);
    }),

  /**
   * Generate rebalance recommendations for overloaded servers.
   */
  rebalancePlan: adminProcedure
    .input(z.object({
      serverIds: z.array(z.string()).optional(),
      maxMoves: z.number().int().min(1).max(10).default(3),
    }).optional())
    .query(async ({ input }) => {
      const { getServerRebalancePlan } = await import('@/lib/services/load-balancer');
      return getServerRebalancePlan({
        serverIds: input?.serverIds,
        maxMoves: input?.maxMoves,
      });
    }),

  /**
   * Trigger the scheduled rebalance cycle manually.
   */
  runScheduledRebalance: adminProcedure
    .mutation(async () => {
      const { runScheduledRebalanceCycle } = await import('@/lib/services/load-balancer');
      return runScheduledRebalanceCycle();
    }),

  /**
   * Apply one rebalance recommendation by moving selected keys.
   */
  applyRebalance: adminProcedure
    .input(z.object({
      sourceServerId: z.string(),
      targetServerId: z.string(),
      keyIds: z.array(z.string()).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.sourceServerId === input.targetServerId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Source and target servers must be different.',
        });
      }

      const targetServer = await db.server.findUnique({
        where: { id: input.targetServerId },
        include: {
          _count: {
            select: {
              accessKeys: {
                where: {
                  status: { in: ['ACTIVE', 'PENDING'] },
                },
              },
            },
          },
        },
      });

      if (!targetServer) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Target server not found.',
        });
      }

      const assignmentCheck = canAssignKeysToServer(targetServer);
      if (!assignmentCheck.allowed) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: assignmentCheck.reason,
        });
      }

      if (
        targetServer.maxKeys &&
        targetServer._count.accessKeys + input.keyIds.length > targetServer.maxKeys
      ) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Target server does not have enough free capacity for this rebalance.',
        });
      }

      const { migrateKeys } = await import('@/lib/services/server-migration');
      const result = await migrateKeys(
        input.sourceServerId,
        input.targetServerId,
        input.keyIds,
        true,
      );

      await writeAuditLog({
        userId: ctx.user.id,
        action: 'SERVER_REBALANCED',
        entity: 'SERVER',
        entityId: input.sourceServerId,
        details: {
          sourceServerId: input.sourceServerId,
          targetServerId: input.targetServerId,
          keyIds: input.keyIds,
          migrated: result.migrated,
          failed: result.failed,
        },
        ip: ctx.clientIp,
      });

      return result;
    }),

  /**
   * Get current sync lock status
   */
  getSyncStatus: adminProcedure.query(() => {
    return getSyncLockStatus();
  }),

  /**
   * Sync all active servers at once.
   *
   * This is useful for auto-sync functionality to keep all keys updated.
   * Uses a lock to prevent concurrent sync operations.
   */
  syncAll: adminProcedure.mutation(async ({ ctx }) => {
    // Try to acquire sync lock
    const operationId = `sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const lockResult = acquireSyncLock(operationId);
    
    if (!lockResult.acquired) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: `Sync already in progress${lockResult.lockedFor ? ` (running for ${Math.round(lockResult.lockedFor / 1000)}s)` : ''}. Please wait for it to complete.`,
      });
    }

    try {
      // Get all active servers
      const servers = await db.server.findMany({
        where: { isActive: true },
      });

      const results: { serverId: string; serverName: string; success: boolean; error?: string }[] = [];

    for (const server of servers) {
      const client = createOutlineClient(server.apiUrl, server.apiCertSha256);

      try {
        // Fetch server info
        const serverInfo = await client.getServerInfo();

        // Fetch all access keys
        const outlineKeys = await client.listAccessKeys();

        // Always try to fetch metrics
        let metrics: { bytesTransferredByUserId: Record<string, number> } | null = null;
        try {
          metrics = await client.getMetrics();
        } catch {
          // Metrics might not be enabled
        }

        // Fetch existing keys for this server in one query
        // Exclude DISABLED keys since they're deleted from Outline
        const existingKeys = await db.accessKey.findMany({
          where: { 
            serverId: server.id,
            status: { not: 'DISABLED' },
          },
        });
        const existingKeyMap = new Map(
          existingKeys.map(k => [`${k.serverId}_${k.outlineKeyId}`, k])
        );

        // Collect all database operations to batch in a transaction
        type DbOperation = 
          | { type: 'updateAccessKey'; id: string; data: Record<string, unknown> }
          | { type: 'updateSession'; id: string; data: { lastActiveAt: Date; bytesUsed: { increment: bigint } } }
          | { type: 'createSession'; data: { accessKeyId: string; bytesUsed: bigint } }
          | { type: 'closeStaleSession'; accessKeyId: string; before: Date }
          | { type: 'createTrafficLog'; data: { accessKeyId: string; bytesUsed: bigint; deltaBytes: bigint; recordedAt: Date } };

        const dbOperations: DbOperation[] = [];
        const sessionUpdates: { keyId: string; hasTraffic: boolean; bytesTransferred: number; existingKey: typeof existingKeys[0] }[] = [];

        const now = new Date();

        // Process each outline key and collect updates
        for (const outlineKey of outlineKeys) {
          const existingKey = existingKeyMap.get(`${server.id}_${outlineKey.id}`);
          if (!existingKey) continue;

          const keyId = outlineKey.id;
          const usedBytes = metrics?.bytesTransferredByUserId?.[keyId] ??
            metrics?.bytesTransferredByUserId?.[String(keyId)] ?? 0;

          // Calculate effective usage (metric - offset)
          const metricBytes = Number(usedBytes);
          const offset = Number(existingKey.usageOffset || 0);

          const effectiveUsedBytes = (metricBytes < offset)
            ? metricBytes // Server reset scenario
            : metricBytes - offset;

          const previousUsedBytes = Number(existingKey.usedBytes);
          const bytesTransferred = effectiveUsedBytes - previousUsedBytes;

          logger.verbose('sync', `syncAll usage delta calculated for ${outlineKey.name || keyId}`, {
            serverId: server.id,
            outlineKeyId: keyId,
            metricBytes,
            effectiveUsedBytes,
            bytesTransferred,
          });

          const updateData: Record<string, unknown> = {
            accessUrl: outlineKey.accessUrl,
            password: outlineKey.password,
            port: outlineKey.port,
            method: outlineKey.method,
          };

          if (!existingKey.dataLimitResetStrategy || existingKey.dataLimitResetStrategy === 'NEVER') {
            updateData.dataLimitBytes = outlineKey.dataLimit?.bytes
              ? BigInt(outlineKey.dataLimit.bytes)
              : null;
          }

          updateData.usedBytes = BigInt(effectiveUsedBytes);

          if (metricBytes < offset) {
            updateData.usageOffset = BigInt(0);
          }

          // Check if PENDING key has been used - activate it
          if (existingKey.status === 'PENDING' && effectiveUsedBytes > 0) {
            updateData.status = 'ACTIVE';
            updateData.firstUsedAt = now;

            if (existingKey.durationDays) {
              const expiresAt = new Date(now);
              expiresAt.setDate(expiresAt.getDate() + existingKey.durationDays);
              updateData.expiresAt = expiresAt;
            }
          }

          // Check if ACTIVE key is expired
          if (existingKey.status === 'ACTIVE' && existingKey.expiresAt && existingKey.expiresAt <= now) {
            updateData.status = 'EXPIRED';
            logger.info(`Key ${outlineKey.name || keyId} expired during syncAll`, {
              serverId: server.id,
              outlineKeyId: keyId,
            });
          }

          // Check if ACTIVE key has exceeded data limit - mark as depleted
          const dbLimit = existingKey.dataLimitBytes ? Number(existingKey.dataLimitBytes) : null;

          if (existingKey.status === 'ACTIVE' && dbLimit && effectiveUsedBytes >= dbLimit) {
            updateData.status = 'DEPLETED';
            logger.debug(`📉 [syncAll] Key ${keyId} (${outlineKey.name}) depleted - used ${effectiveUsedBytes} of ${dbLimit} bytes`);
          }

          const hasSessionTraffic = bytesTransferred >= MIN_SESSION_KEEPALIVE_BYTES;
          const hasMeaningfulTraffic = bytesTransferred >= MIN_MEANINGFUL_ACTIVITY_BYTES;
          if (hasSessionTraffic) {
            updateData.lastTrafficAt = now;
          }
          if (hasMeaningfulTraffic) {
            updateData.lastUsedAt = now;
          }

          dbOperations.push({ type: 'updateAccessKey', id: existingKey.id, data: updateData });

          // Track session updates for later processing
          sessionUpdates.push({ keyId: existingKey.id, hasTraffic: hasSessionTraffic, bytesTransferred, existingKey });

          // Create TrafficLog for significant traffic
          const MIN_TRAFFIC_THRESHOLD = 100 * 1024;
          if (bytesTransferred >= MIN_TRAFFIC_THRESHOLD) {
            logger.debug(`📊 [syncAll] Creating traffic log for Key ${keyId}: ${bytesTransferred} bytes`);
            dbOperations.push({
              type: 'createTrafficLog',
              data: {
                accessKeyId: existingKey.id,
                bytesUsed: BigInt(effectiveUsedBytes),
                deltaBytes: BigInt(bytesTransferred),
                recordedAt: now,
              },
            });
          }
        }

        // Execute all key updates and traffic logs in a single transaction
        await db.$transaction(async (tx) => {
          // Update server info
          await tx.server.update({
            where: { id: server.id },
            data: {
              outlineServerId: serverInfo.serverId,
              outlineName: serverInfo.name,
              outlineVersion: serverInfo.version,
              hostnameForAccessKeys: serverInfo.hostnameForAccessKeys,
              portForNewAccessKeys: serverInfo.portForNewAccessKeys,
              metricsEnabled: serverInfo.metricsEnabled,
              lastSyncAt: now,
            },
          });

          // Process all collected operations
          for (const op of dbOperations) {
            if (op.type === 'updateAccessKey') {
              await tx.accessKey.update({
                where: { id: op.id },
                data: op.data,
              });
            } else if (op.type === 'createTrafficLog') {
              await tx.trafficLog.create({ data: op.data });
            }
          }

          // Process session tracking within the same transaction
          for (const { keyId, hasTraffic, bytesTransferred, existingKey } of sessionUpdates) {
            if (hasTraffic) {
              const activeSession = await tx.connectionSession.findFirst({
                where: { accessKeyId: keyId, isActive: true },
                orderBy: { startedAt: 'desc' },
              });

              if (activeSession) {
                await tx.connectionSession.update({
                  where: { id: activeSession.id },
                  data: {
                    lastActiveAt: now,
                    bytesUsed: { increment: BigInt(bytesTransferred) },
                  },
                });
              } else {
                await tx.connectionSession.create({
                  data: { accessKeyId: keyId, bytesUsed: BigInt(bytesTransferred) },
                });
              }

              const activeSessionCount = await tx.connectionSession.count({
                where: { accessKeyId: keyId, isActive: true },
              });

              await tx.accessKey.update({
                where: { id: keyId },
                data: {
                  estimatedDevices: activeSessionCount,
                  peakDevices: Math.max(existingKey.peakDevices || 0, activeSessionCount),
                },
              });
            } else {
              await tx.connectionSession.updateMany({
                where: {
                  accessKeyId: keyId,
                  isActive: true,
                  lastActiveAt: { lt: new Date(now.getTime() - CONNECTION_SESSION_TIMEOUT_MS) },
                },
                data: { isActive: false, endedAt: now, endedReason: 'INACTIVITY_TIMEOUT' },
              });

              const activeSessionCount = await tx.connectionSession.count({
                where: { accessKeyId: keyId, isActive: true },
              });

              if (activeSessionCount !== existingKey.estimatedDevices) {
                await tx.accessKey.update({
                  where: { id: keyId },
                  data: { estimatedDevices: activeSessionCount },
                });
              }
            }
          }
        });

        // Auto-archive expired and depleted keys (store for 3 months)
        const keysToArchive = await db.accessKey.findMany({
          where: {
            serverId: server.id,
            OR: [{ status: 'EXPIRED' }, { status: 'DEPLETED' }],
          },
          include: {
            server: { select: { name: true, location: true } },
          },
        });

        // Delete from Outline server first (outside transaction as it's external)
        for (const keyToArchive of keysToArchive) {
          try {
            await client.deleteAccessKey(keyToArchive.outlineKeyId);
            logger.debug(`🗑️ [syncAll] Deleted ${keyToArchive.status} key from Outline: ${keyToArchive.name} (${keyToArchive.outlineKeyId})`);
          } catch (deleteError) {
            logger.error(`Failed to delete key ${keyToArchive.outlineKeyId} from Outline: ${(deleteError as Error).message}`);
          }
        }

        // Archive all keys in a single transaction
        if (keysToArchive.length > 0) {
          const deleteAfter = new Date();
          deleteAfter.setMonth(deleteAfter.getMonth() + 3);

          await db.$transaction(async (tx) => {
            for (const keyToArchive of keysToArchive) {
              await tx.archivedKey.create({
                data: {
                  originalKeyId: keyToArchive.id,
                  outlineKeyId: keyToArchive.outlineKeyId,
                  name: keyToArchive.name,
                  email: keyToArchive.email,
                  telegramId: keyToArchive.telegramId,
                  notes: keyToArchive.notes,
                  serverName: keyToArchive.server.name,
                  serverLocation: keyToArchive.server.location,
                  accessUrl: keyToArchive.accessUrl,
                  dataLimitBytes: keyToArchive.dataLimitBytes,
                  usedBytes: keyToArchive.usedBytes,
                  expirationType: keyToArchive.expirationType,
                  expiresAt: keyToArchive.expiresAt,
                  durationDays: keyToArchive.durationDays,
                  archiveReason: keyToArchive.status,
                  originalStatus: keyToArchive.status,
                  firstUsedAt: keyToArchive.firstUsedAt,
                  lastUsedAt: keyToArchive.lastUsedAt,
                  createdAt: keyToArchive.createdAt,
                  deleteAfter,
                },
              });

              await tx.accessKey.delete({ where: { id: keyToArchive.id } });
              logger.debug(`📦 [syncAll] Archived ${keyToArchive.status} key: ${keyToArchive.name}`);
            }
          });
        }

        results.push({ serverId: server.id, serverName: server.name, success: true });
      } catch (error) {
        results.push({
          serverId: server.id,
          serverName: server.name,
          success: false,
          error: (error as Error).message,
        });
      }
    }

      await writeAuditLog({
        userId: ctx.user.id,
        ip: ctx.clientIp,
        action: 'SERVER_SYNC_ALL',
        entity: 'SERVER',
        details: {
          totalServers: results.length,
          successfulServers: results.filter((result) => result.success).length,
          failedServers: results.filter((result) => !result.success).length,
        },
      });

      return { results, syncedAt: new Date() };
    } finally {
      // Always release the lock when done
      releaseSyncLock(operationId);
    }
  }),

  /**
   * Test connection to an Outline server.
   *
   * This is useful for validating API credentials before adding a server
   * or for troubleshooting connectivity issues.
   */
  testConnection: adminProcedure
    .input(
      z.object({
        apiUrl: z.string().url(),
        apiCertSha256: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const client = createOutlineClient(input.apiUrl, input.apiCertSha256);

      try {
        const startTime = Date.now();
        const serverInfo = await client.getServerInfo();
        const latency = Date.now() - startTime;

        return {
          success: true,
          latency,
          serverInfo: {
            name: serverInfo.name,
            version: serverInfo.version,
            hostname: serverInfo.hostnameForAccessKeys,
            port: serverInfo.portForNewAccessKeys,
          },
        };
      } catch (error) {
        return {
          success: false,
          error: (error as Error).message,
        };
      }
    }),

  /**
   * Parse Outline Manager configuration JSON.
   * 
   * This helper allows users to paste the entire output from the
   * Outline Manager installation script and extracts the API URL
   * and certificate fingerprint.
   */
  parseConfig: publicProcedure
    .input(parseConfigSchema)
    .mutation(({ input }) => {
      const result = parseOutlineConfig(input.config);

      if (!result) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invalid Outline Manager configuration format',
        });
      }

      return result;
    }),

  // ============================================
  // Server Migration
  // ============================================

  /**
   * Preview keys that will be migrated between servers.
   * Returns source/target server info and the list of eligible keys.
   */
  migrationPreview: adminProcedure
    .input(
      z.object({
        sourceServerId: z.string(),
        targetServerId: z.string(),
        keyIds: z.array(z.string()).optional(),
      })
    )
    .query(async ({ input }) => {
      const { getMigrationPreview } = await import('@/lib/services/server-migration');
      return getMigrationPreview(
        input.sourceServerId,
        input.targetServerId,
        input.keyIds,
      );
    }),

  /**
   * Migrate access keys from one server to another.
   * Creates new keys on the target, updates DB, and optionally deletes from source.
   */
  migrateKeys: adminProcedure
    .input(
      z.object({
        sourceServerId: z.string(),
        targetServerId: z.string(),
        keyIds: z.array(z.string()),
        deleteFromSource: z.boolean().default(true),
      })
    )
    .mutation(async ({ input }) => {
      if (input.sourceServerId === input.targetServerId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Source and target servers must be different',
        });
      }

      const { migrateKeys } = await import('@/lib/services/server-migration');
      return migrateKeys(
        input.sourceServerId,
        input.targetServerId,
        input.keyIds,
        input.deleteFromSource,
      );
    }),

  // ============================================
  // Export / Import
  // ============================================

  /**
   * Export servers as JSON for backup or migration to another instance.
   * Includes server config, tags, and health check settings.
   */
  exportServers: adminProcedure
    .input(z.object({
      serverIds: z.array(z.string()).optional(),
    }).optional())
    .query(async ({ input }) => {
      const where: Record<string, unknown> = {};
      if (input?.serverIds && input.serverIds.length > 0) {
        where.id = { in: input.serverIds };
      }

      const servers = await db.server.findMany({
        where,
        include: {
          tags: { include: { tag: true } },
          healthCheck: true,
        },
        orderBy: { sortOrder: 'asc' },
      });

      const exported = servers.map((s) => ({
        name: s.name,
        apiUrl: s.apiUrl,
        apiCertSha256: s.apiCertSha256,
        location: s.location,
        countryCode: s.countryCode,
        isDefault: s.isDefault,
        isActive: s.isActive,
        maxKeys: s.maxKeys,
        lifecycleMode: s.lifecycleMode,
        lifecycleNote: s.lifecycleNote,
        sortOrder: s.sortOrder,
        hostnameForAccessKeys: s.hostnameForAccessKeys,
        portForNewAccessKeys: s.portForNewAccessKeys,
        metricsEnabled: s.metricsEnabled,
        tags: s.tags.map((t) => t.tag.name),
        healthCheck: s.healthCheck ? {
          isEnabled: s.healthCheck.isEnabled,
          checkIntervalMins: s.healthCheck.checkIntervalMins,
          latencyThresholdMs: s.healthCheck.latencyThresholdMs,
        } : null,
      }));

      return {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        serverCount: exported.length,
        servers: exported,
      };
    }),

  /**
   * Import servers from a JSON export.
   * Creates new servers and their associated tags.
   * Validates connectivity before saving.
   */
  importServers: adminProcedure
    .input(z.object({
      servers: z.array(z.object({
        name: z.string().min(1).max(100),
        apiUrl: z.string().url(),
        apiCertSha256: z.string().min(64).max(64),
        location: z.string().max(100).optional().nullable(),
        countryCode: z.string().length(2).optional().nullable(),
        isDefault: z.boolean().optional(),
        isActive: z.boolean().optional(),
        maxKeys: z.number().int().positive().optional().nullable(),
        lifecycleMode: serverLifecycleModeSchema.optional(),
        lifecycleNote: z.string().max(280).optional().nullable(),
        sortOrder: z.number().int().optional(),
        tags: z.array(z.string()).optional(),
        healthCheck: z.object({
          isEnabled: z.boolean(),
          checkIntervalMins: z.number().int().positive().optional(),
          latencyThresholdMs: z.number().int().positive().optional(),
        }).optional().nullable(),
      })),
      skipValidation: z.boolean().default(false),
    }))
    .mutation(async ({ input }) => {
      const results: { imported: number; skipped: number; failed: number; errors: string[] } = {
        imported: 0,
        skipped: 0,
        failed: 0,
        errors: [],
      };

      for (const serverData of input.servers) {
        try {
          // Check if server with same apiUrl already exists
          const existing = await db.server.findFirst({
            where: { apiUrl: serverData.apiUrl },
          });

          if (existing) {
            results.skipped++;
            results.errors.push(`"${serverData.name}" skipped — server with same API URL already exists`);
            continue;
          }

          // Optionally validate connection
          if (!input.skipValidation) {
            try {
              const client = createOutlineClient(serverData.apiUrl, serverData.apiCertSha256);
              await client.getServerInfo();
            } catch {
              results.failed++;
              results.errors.push(`"${serverData.name}" failed — could not connect to Outline API`);
              continue;
            }
          }

          // Resolve tags — create if they don't exist
          const tagIds: string[] = [];
          if (serverData.tags && serverData.tags.length > 0) {
            for (const tagName of serverData.tags) {
              let tag = await db.tag.findUnique({ where: { name: tagName } });
              if (!tag) {
                tag = await db.tag.create({ data: { name: tagName } });
              }
              tagIds.push(tag.id);
            }
          }

          // Create server
          const server = await db.server.create({
            data: {
              name: serverData.name,
              apiUrl: serverData.apiUrl,
              apiCertSha256: serverData.apiCertSha256,
              location: serverData.location ?? null,
              countryCode: serverData.countryCode ?? null,
              isDefault: serverData.isDefault ?? false,
              isActive: serverData.isActive ?? true,
              maxKeys: serverData.maxKeys ?? null,
              lifecycleMode: serverData.lifecycleMode ?? 'ACTIVE',
              lifecycleNote: serverData.lifecycleNote ?? null,
              lifecycleChangedAt: new Date(),
              sortOrder: serverData.sortOrder ?? 0,
              tags: tagIds.length > 0
                ? { create: tagIds.map((id) => ({ tagId: id })) }
                : undefined,
            },
          });

          // Create health check record
          if (serverData.healthCheck) {
            await db.healthCheck.create({
              data: {
                serverId: server.id,
                isEnabled: serverData.healthCheck.isEnabled,
                checkIntervalMins: serverData.healthCheck.checkIntervalMins ?? 5,
                latencyThresholdMs: serverData.healthCheck.latencyThresholdMs ?? 500,
                lastStatus: 'UNKNOWN',
              },
            });
          } else {
            await db.healthCheck.create({
              data: {
                serverId: server.id,
                isEnabled: true,
                lastStatus: 'UNKNOWN',
              },
            });
          }

          results.imported++;
        } catch (error) {
          results.failed++;
          results.errors.push(`"${serverData.name}" failed — ${(error as Error).message}`);
        }
      }

      return results;
    }),
});
