/**
 * Access Keys Router
 * 
 * This router handles all access key operations including:
 * - Creating, reading, updating, and deleting keys
 * - Managing data limits and expiration
 * - Generating QR codes and subscription URLs
 * - Bulk operations for efficiency
 * - Traffic tracking and status updates
 */

import { z } from 'zod';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { db } from '@/lib/db';
import { createOutlineClient } from '@/lib/outline-api';
import { TRPCError } from '@trpc/server';
import { generateRandomString } from '@/lib/utils';
import { logger } from '@/lib/logger';
import QRCode from 'qrcode';
import { Prisma } from '@prisma/client';
import { formatTagsForStorage } from '@/lib/tags';

/**
 * Validation schema for creating a new access key.
 * 
 * The key will be created both in Atomic-UI's database and on the
 * Outline server. If the Outline server operation fails, the
 * database transaction is rolled back.
 */
/**
 * Supported encryption methods for Shadowsocks
 */
const ENCRYPTION_METHODS = [
  'chacha20-ietf-poly1305',
  'aes-128-gcm',
  'aes-192-gcm',
  'aes-256-gcm',
] as const;

const createKeySchema = z.object({
  serverId: z.string(),
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email().optional().nullable(),
  telegramId: z.string().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  userId: z.string().optional().nullable(),

  // Data limit in GB (converted to bytes in the mutation)
  dataLimitGB: z.number().positive().optional().nullable(),
  dataLimitResetStrategy: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'NEVER']).optional(),

  // Expiration settings
  expirationType: z.enum(['NEVER', 'FIXED_DATE', 'DURATION_FROM_CREATION', 'START_ON_FIRST_USE']),
  expiresAt: z.date().optional().nullable(),
  durationDays: z.number().int().positive().optional().nullable(),

  // Encryption method
  method: z.enum(ENCRYPTION_METHODS).optional(),

  // Optional features
  prefix: z.string().max(16).optional().nullable(),
});

/**
 * Schema for updating an existing key.
 */
const updateKeySchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional().nullable(),
  telegramId: z.string().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  userId: z.string().optional().nullable(),
  dataLimitGB: z.number().positive().optional().nullable(),
  dataLimitResetStrategy: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'NEVER']).optional(),
  expirationType: z.enum(['NEVER', 'FIXED_DATE', 'DURATION_FROM_CREATION', 'START_ON_FIRST_USE']).optional(),
  expiresAt: z.date().optional().nullable(),
  durationDays: z.number().int().positive().optional().nullable(),
  status: z.enum(['ACTIVE', 'DISABLED', 'EXPIRED', 'DEPLETED', 'PENDING']).optional(),
  prefix: z.string().max(16).optional().nullable(),
  subscriptionTheme: z.enum([
    'dark', 'light', 'purple', 'blue', 'green', 'orange', 'pink', 'red',
    'glassPurple', 'glassBlue', 'glassCyan', 'glassGreen', 'glassPink', 'glassOrange', 'glassNeutral'
  ]).optional().nullable(),
  coverImage: z.string().url().optional().nullable(),
  coverImageType: z.enum(['url', 'gradient', 'upload']).optional().nullable(),
  contactLinks: z.string().optional().nullable(), // JSON string of contact links
  // New fields for tags and owner
  owner: z.string().max(100).optional().nullable(),
  tags: z.string().max(500).optional().nullable(), // Comma-separated tags, will be normalized
  // Bandwidth alert settings
  autoDisableOnLimit: z.boolean().optional(),
});

/**
 * Schema for bulk key creation.
 */
const bulkCreateSchema = z.object({
  serverIds: z.array(z.string()).min(1),
  count: z.number().int().min(1).max(100),
  namePrefix: z.string().min(1).max(50),
  dataLimitGB: z.number().positive().optional().nullable(),
  expirationType: z.enum(['NEVER', 'FIXED_DATE', 'DURATION_FROM_CREATION', 'START_ON_FIRST_USE']),
  durationDays: z.number().int().positive().optional().nullable(),
});

/**
 * Schema for listing keys with filters.
 */
const listKeysSchema = z.object({
  serverId: z.string().optional(),
  status: z.enum(['ACTIVE', 'DISABLED', 'EXPIRED', 'DEPLETED', 'PENDING']).optional(),
  search: z.string().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  unattachedOnly: z.boolean().optional(),
  userId: z.string().optional(),
  // New filters for quick segments
  online: z.boolean().optional(),
  expiring7d: z.boolean().optional(),
  overQuota: z.boolean().optional(),
  inactive30d: z.boolean().optional(),
  // Tag/owner filters
  tag: z.string().optional(),
  owner: z.string().optional(),
});

// Helper function to convert GB to bytes
const gbToBytes = (gb: number): bigint => BigInt(Math.floor(gb * 1024 * 1024 * 1024));

// Helper function to calculate expiration based on type
const calculateExpiration = (
  expirationType: string,
  expiresAt?: Date | null,
  durationDays?: number | null
): { expiresAt: Date | null; status: string } => {
  switch (expirationType) {
    case 'FIXED_DATE':
      return {
        expiresAt: expiresAt ?? null,
        status: 'ACTIVE',
      };
    case 'DURATION_FROM_CREATION':
      if (durationDays) {
        const expires = new Date();
        expires.setDate(expires.getDate() + durationDays);
        return { expiresAt: expires, status: 'ACTIVE' };
      }
      return { expiresAt: null, status: 'ACTIVE' };
    case 'START_ON_FIRST_USE':
      return { expiresAt: null, status: 'PENDING' };
    default:
      return { expiresAt: null, status: 'ACTIVE' };
  }
};

export const keysRouter = router({
  /**
   * List access keys with filtering and pagination.
   * 
   * Supports filtering by server, status, and search term.
   * Returns paginated results with usage statistics.
   * 
   * For non-admin users, restricts results to their own keys.
   */
  list: protectedProcedure
    .input(listKeysSchema)
    .query(async ({ ctx, input }) => {
      const { serverId, status, search, page, pageSize, unattachedOnly, online, expiring7d, overQuota, inactive30d, tag, owner } = input;

      // Build the where clause
      const where: Prisma.AccessKeyWhereInput = {};

      // Role-based filtering: Users see only their own keys, admins can filter by userId
      if (ctx.user.role !== 'ADMIN') {
        where.userId = ctx.user.id;
      } else if (input.userId) {
        where.userId = input.userId;
      }

      if (serverId) {
        where.serverId = serverId;
      }

      if (status) {
        where.status = status;
      }

      if (search) {
        where.OR = [
          { name: { contains: search } },
          { email: { contains: search } },
          { telegramId: { contains: search } },
        ];
      }

      if (unattachedOnly) {
        where.dynamicKeyId = null;
      }

      // Quick filter: Online (lastUsedAt within 90s AND not disabled)
      if (online) {
        const onlineThreshold = new Date(Date.now() - 90 * 1000);
        where.lastUsedAt = { gte: onlineThreshold };
        where.status = { not: 'DISABLED' };
      }

      // Quick filter: Expiring within 7 days
      if (expiring7d) {
        const now = new Date();
        const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        where.expiresAt = {
          gte: now,
          lte: sevenDaysFromNow,
        };
      }

      // Quick filter: Inactive for 30 days (lastUsedAt older than 30 days OR null)
      if (inactive30d) {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        where.OR = [
          { lastUsedAt: null },
          { lastUsedAt: { lt: thirtyDaysAgo } },
        ];
      }

      // Tag filter (using contains with delimiters for safer matching)
      if (tag) {
        const normalizedTag = tag.trim().toLowerCase();
        where.tags = { contains: `,${normalizedTag},` };
      }

      // Owner filter
      if (owner) {
        where.owner = { contains: owner };
      }

      // Get total count for pagination
      const total = await db.accessKey.count({ where });

      // Fetch keys with server info
      const keys = await db.accessKey.findMany({
        where,
        include: {
          server: {
            select: {
              id: true,
              name: true,
              countryCode: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      });

      // Calculate usage percentages and remaining time
      let keysWithStats = keys.map((key) => {
        const usagePercent = key.dataLimitBytes
          ? Math.round((Number(key.usedBytes) / Number(key.dataLimitBytes)) * 100)
          : 0;

        let daysRemaining: number | null = null;
        if (key.expiresAt) {
          const now = new Date();
          const diffTime = key.expiresAt.getTime() - now.getTime();
          daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        }

        return {
          ...key,
          usagePercent,
          daysRemaining,
          isExpiringSoon: daysRemaining !== null && daysRemaining <= 3 && daysRemaining > 0,
          isTrafficWarning: usagePercent >= 80 && usagePercent < 100,
        };
      });

      // Quick filter: Over 80% quota (post-fetch filter since it compares two fields)
      if (overQuota) {
        keysWithStats = keysWithStats.filter(
          (key) => key.dataLimitBytes && key.usagePercent >= 80
        );
      }

      return {
        items: keysWithStats,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
        hasMore: page * pageSize < total,
      };
    }),

  /**
   * Get a single access key by ID with full details.
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const key = await db.accessKey.findUnique({
        where: { id: input.id },
        include: {
          server: {
            select: {
              id: true,
              name: true,
              countryCode: true,
              location: true,
              apiUrl: true,
              apiCertSha256: true,
            },
          },
          trafficLogs: {
            take: 30,
            orderBy: { recordedAt: 'desc' },
          },
          sessions: {
            take: 10,
            orderBy: { startedAt: 'desc' },
          },
        },
      });

      if (!key) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Access key not found',
        });
      }

      // Authorization check: User can only access their own key
      if (ctx.user.role !== 'ADMIN' && key.userId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to view this key',
        });
      }

      // Auto-generate subscriptionToken if missing (for older keys)
      if (!key.subscriptionToken) {
        const newToken = generateRandomString(32);
        await db.accessKey.update({
          where: { id: input.id },
          data: { subscriptionToken: newToken },
        });
        // Return updated key with the new token
        return { ...key, subscriptionToken: newToken };
      }

      return key;
    }),

  /**
   * Create a new access key.
   * 
   * This creates the key on the Outline server first, then stores
   * the metadata in Atomic-UI's database. If the Outline operation
   * fails, no database record is created.
   */
  create: adminProcedure
    .input(createKeySchema)
    .mutation(async ({ input }) => {
      // Fetch the server
      const server = await db.server.findUnique({
        where: { id: input.serverId },
      });

      if (!server) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Server not found',
        });
      }

      // Create Outline client
      const client = createOutlineClient(server.apiUrl, server.apiCertSha256);

      try {
        // Create the key on Outline server
        const outlineKey = await client.createAccessKey({
          name: input.name,
          method: input.method,
        });

        // Set data limit if specified
        if (input.dataLimitGB) {
          const limitBytes = gbToBytes(input.dataLimitGB);
          await client.setAccessKeyDataLimit(outlineKey.id, Number(limitBytes));
        }

        // Calculate expiration
        const { expiresAt, status } = calculateExpiration(
          input.expirationType,
          input.expiresAt,
          input.durationDays
        );

        // Create the database record
        const accessKey = await db.accessKey.create({
          data: {
            outlineKeyId: outlineKey.id,
            name: input.name,
            email: input.email,
            telegramId: input.telegramId,
            notes: input.notes,
            userId: input.userId, // Assign to user if provided
            serverId: input.serverId,
            accessUrl: outlineKey.accessUrl,
            password: outlineKey.password,
            port: outlineKey.port,
            method: outlineKey.method,
            dataLimitBytes: input.dataLimitGB ? gbToBytes(input.dataLimitGB) : null,
            dataLimitResetStrategy: input.dataLimitResetStrategy || 'NEVER',
            expirationType: input.expirationType,
            expiresAt,
            durationDays: input.durationDays,
            status,
            prefix: input.prefix,
            subscriptionToken: generateRandomString(32),
          },
          include: {
            server: {
              select: {
                id: true,
                name: true,
                countryCode: true,
              },
            },
          },
        });

        return accessKey;
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to create access key: ${(error as Error).message}`,
        });
      }
    }),

  /**
   * Update an existing access key.
   * 
   * Updates both the Outline server (for name and data limit) and
   * the local database (for all metadata).
   */
  update: adminProcedure
    .input(updateKeySchema)
    .mutation(async ({ input }) => {
      const { id, ...data } = input;

      // Fetch the key with server info
      const existingKey = await db.accessKey.findUnique({
        where: { id },
        include: {
          server: true,
        },
      });

      if (!existingKey) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Access key not found',
        });
      }

      // Create Outline client
      const client = createOutlineClient(
        existingKey.server.apiUrl,
        existingKey.server.apiCertSha256
      );

      try {
        // Update name on Outline if changed
        if (data.name && data.name !== existingKey.name) {
          await client.renameAccessKey(existingKey.outlineKeyId, data.name);
        }

        // Update data limit on Outline if changed
        if (data.dataLimitGB !== undefined) {
          if (data.dataLimitGB) {
            const limitBytes = gbToBytes(data.dataLimitGB);
            await client.setAccessKeyDataLimit(existingKey.outlineKeyId, Number(limitBytes));
          } else {
            await client.removeAccessKeyDataLimit(existingKey.outlineKeyId);
          }
        }

        // Prepare database update
        const updateData: Record<string, unknown> = {};

        if (data.name) updateData.name = data.name;
        if (data.email !== undefined) updateData.email = data.email;
        if (data.telegramId !== undefined) updateData.telegramId = data.telegramId;
        if (data.notes !== undefined) updateData.notes = data.notes;
        if (data.userId !== undefined) updateData.userId = data.userId;
        if (data.prefix !== undefined) updateData.prefix = data.prefix;
        if (data.status) updateData.status = data.status;

        if (data.dataLimitGB !== undefined) {
          updateData.dataLimitBytes = data.dataLimitGB ? gbToBytes(data.dataLimitGB) : null;
        }

        if (data.dataLimitResetStrategy) {
          updateData.dataLimitResetStrategy = data.dataLimitResetStrategy;
          // If setting a strategy, establish the baseline (reset logic will handle the rest)
          // But we don't change usageOffset here, so "usedBytes" remains "Total Usage" until next sync or reset.
          // This is safe.
        }

        if (data.expirationType) {
          updateData.expirationType = data.expirationType;
          const { expiresAt, status } = calculateExpiration(
            data.expirationType,
            data.expiresAt,
            data.durationDays
          );
          updateData.expiresAt = expiresAt;
          if (data.status === undefined) {
            updateData.status = status;
          }
        } else if (data.expiresAt !== undefined) {
          // Allow updating expiresAt directly without changing expirationType
          updateData.expiresAt = data.expiresAt;
          updateData.expirationType = 'FIXED_DATE';
        } else if (data.durationDays !== undefined && data.durationDays !== null) {
          // Recalculate expiresAt from durationDays
          const newExpiry = new Date();
          newExpiry.setDate(newExpiry.getDate() + data.durationDays);
          updateData.expiresAt = newExpiry;
          updateData.expirationType = 'DURATION_FROM_CREATION';
        }

        if (data.durationDays !== undefined) {
          updateData.durationDays = data.durationDays;
        }

        if (data.subscriptionTheme !== undefined) {
          updateData.subscriptionTheme = data.subscriptionTheme;
        }

        if (data.coverImage !== undefined) {
          updateData.coverImage = data.coverImage;
        }

        if (data.coverImageType !== undefined) {
          updateData.coverImageType = data.coverImageType;
        }

        if (data.contactLinks !== undefined) {
          updateData.contactLinks = data.contactLinks;
        }

        // Handle owner field
        if (data.owner !== undefined) {
          updateData.owner = data.owner;
        }

        // Handle tags field (normalize for storage)
        if (data.tags !== undefined) {
          updateData.tags = data.tags ? formatTagsForStorage(data.tags) : '';
        }

        // Handle bandwidth alert settings
        if (data.autoDisableOnLimit !== undefined) {
          updateData.autoDisableOnLimit = data.autoDisableOnLimit;
        }

        // Reset bandwidth alert flags when data limit changes
        if (data.dataLimitGB !== undefined) {
          updateData.bandwidthAlertAt80 = false;
          updateData.bandwidthAlertAt90 = false;
        }

        // Update the database record
        const accessKey = await db.accessKey.update({
          where: { id },
          data: updateData,
          include: {
            server: {
              select: {
                id: true,
                name: true,
                countryCode: true,
              },
            },
          },
        });

        return accessKey;
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to update access key: ${(error as Error).message}`,
        });
      }
    }),

  /**
   * Delete an access key.
   *
   * Removes the key from the Outline server and archives it in the database.
   * The key becomes immediately unusable but its data is kept for 3 months.
   */
  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const key = await db.accessKey.findUnique({
        where: { id: input.id },
        include: {
          server: true,
        },
      });

      if (!key) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Access key not found',
        });
      }

      // Create Outline client
      const client = createOutlineClient(key.server.apiUrl, key.server.apiCertSha256);

      try {
        // Delete from Outline server
        await client.deleteAccessKey(key.outlineKeyId);
      } catch (error) {
        // Log the error but continue with archiving
        console.error(`Failed to delete key from Outline: ${(error as Error).message}`);
      }

      // Archive the key (keep for 3 months)
      const deleteAfter = new Date();
      deleteAfter.setMonth(deleteAfter.getMonth() + 3);

      await db.archivedKey.create({
        data: {
          originalKeyId: key.id,
          outlineKeyId: key.outlineKeyId,
          name: key.name,
          email: key.email,
          telegramId: key.telegramId,
          notes: key.notes,
          serverName: key.server.name,
          serverLocation: key.server.location,
          accessUrl: key.accessUrl,
          dataLimitBytes: key.dataLimitBytes,
          usedBytes: key.usedBytes,
          expirationType: key.expirationType,
          expiresAt: key.expiresAt,
          durationDays: key.durationDays,
          archiveReason: 'DELETED',
          originalStatus: key.status,
          firstUsedAt: key.firstUsedAt,
          lastUsedAt: key.lastUsedAt,
          createdAt: key.createdAt,
          deleteAfter,
        },
      });

      // Delete from database
      await db.accessKey.delete({
        where: { id: input.id },
      });

      return { success: true };
    }),

  /**
   * Generate a QR code for the access key.
   * 
   * Returns a base64-encoded PNG image of the QR code that can be
   * displayed directly in an img tag or downloaded.
   */
  generateQRCode: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const key = await db.accessKey.findUnique({
        where: { id: input.id },
      });

      if (!key || !key.accessUrl) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Access key not found or has no access URL',
        });
      }

      try {
        // Generate QR code as base64 PNG
        const qrCode = await QRCode.toDataURL(key.accessUrl, {
          width: 300,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#ffffff',
          },
        });

        return { qrCode };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to generate QR code: ${(error as Error).message}`,
        });
      }
    }),

  /**
   * Create multiple keys at once (bulk creation).
   * 
   * Creates the specified number of keys on the selected servers.
   * Keys are named with the prefix followed by a number.
   */
  bulkCreate: adminProcedure
    .input(bulkCreateSchema)
    .mutation(async ({ input }) => {
      const results: { success: number; failed: number; errors: string[] } = {
        success: 0,
        failed: 0,
        errors: [],
      };

      // Fetch all selected servers
      const servers = await db.server.findMany({
        where: { id: { in: input.serverIds } },
      });

      if (servers.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No servers found',
        });
      }

      // Create keys on each server
      for (const server of servers) {
        const client = createOutlineClient(server.apiUrl, server.apiCertSha256);

        for (let i = 1; i <= input.count; i++) {
          const keyName = `${input.namePrefix}_${server.name}_${i}`;

          try {
            // Create on Outline
            const outlineKey = await client.createAccessKey({ name: keyName });

            // Set data limit if specified
            if (input.dataLimitGB) {
              const limitBytes = gbToBytes(input.dataLimitGB);
              await client.setAccessKeyDataLimit(outlineKey.id, Number(limitBytes));
            }

            // Calculate expiration
            const { expiresAt, status } = calculateExpiration(
              input.expirationType,
              null,
              input.durationDays
            );

            // Create database record
            await db.accessKey.create({
              data: {
                outlineKeyId: outlineKey.id,
                name: keyName,
                serverId: server.id,
                accessUrl: outlineKey.accessUrl,
                password: outlineKey.password,
                port: outlineKey.port,
                method: outlineKey.method,
                dataLimitBytes: input.dataLimitGB ? gbToBytes(input.dataLimitGB) : null,
                expirationType: input.expirationType,
                expiresAt,
                durationDays: input.durationDays,
                status,
                subscriptionToken: generateRandomString(32),
              },
            });

            results.success++;
          } catch (error) {
            results.failed++;
            results.errors.push(`${keyName}: ${(error as Error).message}`);
          }
        }
      }

      return results;
    }),

  /**
   * Delete multiple keys at once.
   */
  bulkDelete: adminProcedure
    .input(z.object({ ids: z.array(z.string()) }))
    .mutation(async ({ input }) => {
      const results = { success: 0, failed: 0 };

      for (const id of input.ids) {
        try {
          const key = await db.accessKey.findUnique({
            where: { id },
            include: { server: true },
          });

          if (key) {
            const client = createOutlineClient(key.server.apiUrl, key.server.apiCertSha256);

            try {
              await client.deleteAccessKey(key.outlineKeyId);
            } catch {
              // Continue even if Outline deletion fails
            }

            await db.accessKey.delete({ where: { id } });
            results.success++;
          }
        } catch {
          results.failed++;
        }
      }

      return results;
    }),

  /**
   * Bulk enable/disable multiple keys.
   *
   * When disabling: Deletes keys from Outline servers (stops traffic immediately).
   * When enabling: Recreates keys on Outline servers.
   */
  bulkToggleStatus: adminProcedure
    .input(z.object({
      ids: z.array(z.string()),
      enable: z.boolean(), // true = enable, false = disable
    }))
    .mutation(async ({ input }) => {
      const results: {
        success: number;
        failed: number;
        errors: { id: string; name: string; error: string }[];
      } = { success: 0, failed: 0, errors: [] };

      for (const id of input.ids) {
        try {
          const key = await db.accessKey.findUnique({
            where: { id },
            include: { server: true },
          });

          if (!key) {
            results.failed++;
            results.errors.push({ id, name: 'Unknown', error: 'Key not found' });
            continue;
          }

          const client = createOutlineClient(key.server.apiUrl, key.server.apiCertSha256);
          const isCurrentlyDisabled = key.status === 'DISABLED';

          // Skip if already in desired state
          if (input.enable && !isCurrentlyDisabled) {
            results.success++;
            continue;
          }
          if (!input.enable && isCurrentlyDisabled) {
            results.success++;
            continue;
          }

          if (input.enable) {
            // ENABLE: Recreate the key on Outline server
            const newOutlineKey = await client.createAccessKey({
              name: key.name,
              method: key.method || undefined,
            });

            // Preserve existing usage by setting a negative offset
            const preservedUsageOffset = -Number(key.usedBytes);

            if (key.dataLimitBytes) {
              const serverLimit = Number(key.dataLimitBytes);
              await client.setAccessKeyDataLimit(newOutlineKey.id, serverLimit);
            }

            await db.accessKey.update({
              where: { id },
              data: {
                status: 'ACTIVE',
                outlineKeyId: newOutlineKey.id,
                accessUrl: newOutlineKey.accessUrl,
                password: newOutlineKey.password,
                port: newOutlineKey.port,
                method: newOutlineKey.method,
                disabledAt: null,
                disabledOutlineKeyId: null,
                // Set negative offset to preserve the existing usedBytes during sync
                usageOffset: BigInt(preservedUsageOffset),
              },
            });
          } else {
            // DISABLE: Delete the key from Outline server
            try {
              await client.deleteAccessKey(key.outlineKeyId);
            } catch (error) {
              logger.error(`Failed to delete key ${key.outlineKeyId} from Outline`, error);
            }

            await db.accessKey.update({
              where: { id },
              data: {
                status: 'DISABLED',
                disabledAt: new Date(),
                disabledOutlineKeyId: key.outlineKeyId,
                estimatedDevices: 0,
              },
            });

            // Close any active sessions
            await db.connectionSession.updateMany({
              where: { accessKeyId: key.id, isActive: true },
              data: { isActive: false, endedAt: new Date() },
            });
          }

          results.success++;
        } catch (error) {
          results.failed++;
          results.errors.push({
            id,
            name: 'Unknown',
            error: (error as Error).message
          });
        }
      }

      return results;
    }),

  /**
   * Bulk add tags to multiple keys.
   */
  bulkAddTags: adminProcedure
    .input(z.object({
      ids: z.array(z.string()),
      tags: z.string(), // Comma-separated tags to add
    }))
    .mutation(async ({ input }) => {
      const results = { success: 0, failed: 0 };
      const newTags = input.tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);

      if (newTags.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No valid tags provided',
        });
      }

      for (const id of input.ids) {
        try {
          const key = await db.accessKey.findUnique({
            where: { id },
            select: { tags: true },
          });

          if (!key) {
            results.failed++;
            continue;
          }

          // Parse existing tags (stored as ,tag1,tag2, format)
          const existingTags = (key.tags || '')
            .split(',')
            .filter(Boolean)
            .map(t => t.trim().toLowerCase());

          // Merge with new tags (no duplicates)
          const mergedTags = Array.from(new Set([...existingTags, ...newTags]));
          const formattedTags = mergedTags.length > 0 ? `,${mergedTags.join(',')},` : '';

          await db.accessKey.update({
            where: { id },
            data: { tags: formattedTags },
          });

          results.success++;
        } catch {
          results.failed++;
        }
      }

      return results;
    }),

  /**
   * Bulk remove tags from multiple keys.
   */
  bulkRemoveTags: adminProcedure
    .input(z.object({
      ids: z.array(z.string()),
      tags: z.string(), // Comma-separated tags to remove
    }))
    .mutation(async ({ input }) => {
      const results = { success: 0, failed: 0 };
      const tagsToRemove = input.tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);

      if (tagsToRemove.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No valid tags provided',
        });
      }

      for (const id of input.ids) {
        try {
          const key = await db.accessKey.findUnique({
            where: { id },
            select: { tags: true },
          });

          if (!key) {
            results.failed++;
            continue;
          }

          // Parse existing tags
          const existingTags = (key.tags || '')
            .split(',')
            .filter(Boolean)
            .map(t => t.trim().toLowerCase());

          // Remove specified tags
          const remainingTags = existingTags.filter(t => !tagsToRemove.includes(t));
          const formattedTags = remainingTags.length > 0 ? `,${remainingTags.join(',')},` : '';

          await db.accessKey.update({
            where: { id },
            data: { tags: formattedTags },
          });

          results.success++;
        } catch {
          results.failed++;
        }
      }

      return results;
    }),

  /**
   * Bulk archive multiple keys.
   *
   * Archives keys to the ArchivedKey table and deletes them from Outline and the main table.
   */
  bulkArchive: adminProcedure
    .input(z.object({ ids: z.array(z.string()) }))
    .mutation(async ({ input }) => {
      const results: {
        success: number;
        failed: number;
        errors: { id: string; name: string; error: string }[];
      } = { success: 0, failed: 0, errors: [] };

      const deleteAfter = new Date();
      deleteAfter.setMonth(deleteAfter.getMonth() + 3);

      for (const id of input.ids) {
        try {
          const key = await db.accessKey.findUnique({
            where: { id },
            include: { server: true },
          });

          if (!key) {
            results.failed++;
            results.errors.push({ id, name: 'Unknown', error: 'Key not found' });
            continue;
          }

          // Delete from Outline server (ignore errors)
          try {
            const client = createOutlineClient(key.server.apiUrl, key.server.apiCertSha256);
            await client.deleteAccessKey(key.outlineKeyId);
          } catch (error) {
            logger.error(`Failed to delete key from Outline during archive: ${(error as Error).message}`);
          }

          // Create archived key record
          await db.archivedKey.create({
            data: {
              originalKeyId: key.id,
              outlineKeyId: key.outlineKeyId,
              name: key.name,
              email: key.email,
              telegramId: key.telegramId,
              notes: key.notes,
              serverName: key.server.name,
              serverLocation: key.server.location,
              accessUrl: key.accessUrl,
              dataLimitBytes: key.dataLimitBytes,
              usedBytes: key.usedBytes,
              expirationType: key.expirationType,
              expiresAt: key.expiresAt,
              durationDays: key.durationDays,
              archiveReason: 'ARCHIVED',
              originalStatus: key.status,
              firstUsedAt: key.firstUsedAt,
              lastUsedAt: key.lastUsedAt,
              createdAt: key.createdAt,
              deleteAfter,
            },
          });

          // Delete from database
          await db.accessKey.delete({ where: { id } });

          results.success++;
        } catch (error) {
          results.failed++;
          results.errors.push({ id, name: 'Unknown', error: (error as Error).message });
        }
      }

      return results;
    }),

  /**
   * Bulk extend expiration for multiple keys.
   * 
   * Adds the specified number of days to the current expiration date.
   * If a key has no expiration, it sets it to now + days.
   * Also reactivates expired keys.
   */
  bulkExtend: adminProcedure
    .input(z.object({
      ids: z.array(z.string()),
      days: z.number().int().positive(),
    }))
    .mutation(async ({ input }) => {
      const results = { success: 0, failed: 0 };

      for (const id of input.ids) {
        try {
          const key = await db.accessKey.findUnique({ where: { id } });

          if (key) {
            let newExpiresAt: Date;

            if (key.expiresAt) {
              // Add days to existing expiration
              newExpiresAt = new Date(key.expiresAt);
              newExpiresAt.setDate(newExpiresAt.getDate() + input.days);
            } else {
              // Set from now if no previous expiration
              newExpiresAt = new Date();
              newExpiresAt.setDate(newExpiresAt.getDate() + input.days);
            }

            // Update key
            await db.accessKey.update({
              where: { id },
              data: {
                expiresAt: newExpiresAt,
                expirationType: 'FIXED_DATE', // Switch to fixed date to be safe
                status: 'ACTIVE', // Reactivate if it was expired
              },
            });

            results.success++;
          }
        } catch {
          results.failed++;
        }
      }

      return results;
    }),

  /**
   * Toggle key enabled/disabled status.
   *
   * DISABLE: Deletes the key from the Outline server (stops traffic immediately)
   *          but keeps the key in Atomic-UI DB for potential re-enabling.
   * ENABLE:  Recreates the key on the Outline server with the same settings.
   *
   * This ensures disabled keys truly cannot be used - Outline has no native
   * "disable" endpoint, so we must delete/recreate.
   */
  toggleStatus: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const key = await db.accessKey.findUnique({
        where: { id: input.id },
        include: {
          server: true,
        },
      });

      if (!key) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Access key not found',
        });
      }

      const client = createOutlineClient(key.server.apiUrl, key.server.apiCertSha256);
      const isCurrentlyDisabled = key.status === 'DISABLED';

      if (isCurrentlyDisabled) {
        // === ENABLE: Recreate the key on Outline server ===
        try {
          // Try to recreate with the original key ID if possible
          const newOutlineKey = await client.createAccessKey({
            name: key.name,
            method: key.method || undefined,
            // Note: Outline may not preserve the same ID, so we create new
          });

          // Preserve existing usage by setting a negative offset
          // New Outline key starts at 0, but we want to preserve the old usedBytes
          // So we set usageOffset = -usedBytes, meaning effectiveUsage = 0 - (-usedBytes) = usedBytes
          const preservedUsageOffset = -Number(key.usedBytes);

          // Set data limit if the key had one
          if (key.dataLimitBytes) {
            // The server limit should be: preservedUsage + remainingAllowance
            // remainingAllowance = dataLimitBytes - usedBytes
            // serverLimit = usedBytes + (dataLimitBytes - usedBytes) = dataLimitBytes
            // But since new key starts at 0, we need to account for the preserved usage
            const serverLimit = Number(key.dataLimitBytes);
            await client.setAccessKeyDataLimit(newOutlineKey.id, serverLimit);
          }

          // Update DB with new Outline key details, preserving usage data
          const updatedKey = await db.accessKey.update({
            where: { id: input.id },
            data: {
              status: 'ACTIVE',
              outlineKeyId: newOutlineKey.id,
              accessUrl: newOutlineKey.accessUrl,
              password: newOutlineKey.password,
              port: newOutlineKey.port,
              method: newOutlineKey.method,
              disabledAt: null,
              disabledOutlineKeyId: null,
              // Set negative offset to preserve the existing usedBytes during sync
              usageOffset: BigInt(preservedUsageOffset),
            },
            include: {
              server: {
                select: {
                  id: true,
                  name: true,
                  countryCode: true,
                },
              },
            },
          });

          return updatedKey;
        } catch (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to re-enable key on Outline server: ${(error as Error).message}`,
          });
        }
      } else {
        // === DISABLE: Delete the key from Outline server ===
        try {
          await client.deleteAccessKey(key.outlineKeyId);
        } catch (error) {
          // Log but don't fail - key might already be deleted
          logger.error(`Failed to delete key ${key.outlineKeyId} from Outline`, error);
        }

        // Update DB to mark as disabled (keep all settings for re-enabling)
        const updatedKey = await db.accessKey.update({
          where: { id: input.id },
          data: {
            status: 'DISABLED',
            disabledAt: new Date(),
            disabledOutlineKeyId: key.outlineKeyId,
            // Clear online tracking since key is disabled
            estimatedDevices: 0,
          },
          include: {
            server: {
              select: {
                id: true,
                name: true,
                countryCode: true,
              },
            },
          },
        });

        // Close any active sessions for this key
        await db.connectionSession.updateMany({
          where: {
            accessKeyId: key.id,
            isActive: true,
          },
          data: {
            isActive: false,
            endedAt: new Date(),
          },
        });

        return updatedKey;
      }
    }),

  /**
   * Get subscription URL for a key.
   *
   * Subscription URLs allow clients to auto-update their config.
   */
  getSubscriptionUrl: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const key = await db.accessKey.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          subscriptionToken: true,
          accessUrl: true,
          name: true,
        },
      });

      if (!key) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Access key not found',
        });
      }

      // Generate subscription token if it doesn't exist
      let token = key.subscriptionToken;
      if (!token) {
        token = generateRandomString(32);
        await db.accessKey.update({
          where: { id: input.id },
          data: { subscriptionToken: token },
        });
      }

      // The subscription URL format - clients can fetch this to get the access URL
      // This will be handled by a public API endpoint
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const basePath = process.env.PANEL_PATH || '';
      const subscriptionUrl = `${baseUrl}${basePath}/api/subscription/${token}`;

      return {
        subscriptionUrl,
        accessUrl: key.accessUrl,
        token,
      };
    }),

  /**
   * Export keys as JSON or CSV.
   */
  export: protectedProcedure
    .input(
      z.object({
        serverIds: z.array(z.string()).optional(),
        status: z.enum(['ACTIVE', 'DISABLED', 'EXPIRED', 'DEPLETED', 'PENDING']).optional(),
        format: z.enum(['json', 'csv']).default('json'),
      })
    )
    .query(async ({ input }) => {
      const where: Record<string, unknown> = {};

      if (input.serverIds && input.serverIds.length > 0) {
        where.serverId = { in: input.serverIds };
      }

      if (input.status) {
        where.status = input.status;
      }

      const keys = await db.accessKey.findMany({
        where,
        include: {
          server: {
            select: {
              name: true,
              countryCode: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (input.format === 'csv') {
        // Generate CSV
        const headers = ['Name', 'Email', 'Server', 'Status', 'Access URL', 'Data Used', 'Data Limit', 'Expires At', 'Created At'];
        const rows = keys.map((key) => [
          key.name,
          key.email || '',
          key.server.name,
          key.status,
          key.accessUrl || '',
          key.usedBytes.toString(),
          key.dataLimitBytes?.toString() || 'Unlimited',
          key.expiresAt?.toISOString() || 'Never',
          key.createdAt.toISOString(),
        ]);

        const csv = [headers.join(','), ...rows.map((row) => row.map((cell) => `"${cell}"`).join(','))].join('\n');
        return { data: csv, format: 'csv' as const };
      }

      // Return JSON
      return {
        data: keys.map((key) => ({
          name: key.name,
          email: key.email,
          server: key.server.name,
          status: key.status,
          accessUrl: key.accessUrl,
          usedBytes: key.usedBytes.toString(),
          dataLimitBytes: key.dataLimitBytes?.toString() || null,
          expiresAt: key.expiresAt?.toISOString() || null,
          createdAt: key.createdAt.toISOString(),
        })),
        format: 'json' as const,
      };
    }),

  /**
   * Get statistics about access keys.
   */
  stats: protectedProcedure.query(async () => {
    const [total, active, expired, depleted, pending] = await Promise.all([
      db.accessKey.count(),
      db.accessKey.count({ where: { status: 'ACTIVE' } }),
      db.accessKey.count({ where: { status: 'EXPIRED' } }),
      db.accessKey.count({ where: { status: 'DEPLETED' } }),
      db.accessKey.count({ where: { status: 'PENDING' } }),
    ]);

    // Get keys expiring in 24 hours
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const expiringIn24h = await db.accessKey.count({
      where: {
        status: 'ACTIVE',
        expiresAt: {
          lte: tomorrow,
          gte: new Date(),
        },
      },
    });

    // Get total usage across all keys
    const usageResult = await db.accessKey.aggregate({
      _sum: {
        usedBytes: true,
      },
    });
    const totalUsedBytes = usageResult._sum.usedBytes?.toString() || '0';

    // Get total data limit across all keys (for keys that have limits)
    const limitResult = await db.accessKey.aggregate({
      _sum: {
        dataLimitBytes: true,
      },
      where: {
        dataLimitBytes: {
          not: null,
        },
      },
    });
    const totalDataLimitBytes = limitResult._sum.dataLimitBytes?.toString() || '0';

    return {
      total,
      active,
      expired,
      depleted,
      pending,
      expiringIn24h,
      totalUsedBytes,
      totalDataLimitBytes,
    };
  }),

  /**
   * Get online/active users (keys with active connection sessions).
   *
   * A key is considered "online" if:
   * - It has status ACTIVE (not DISABLED, EXPIRED, etc.)
   * - AND it has recent traffic (lastUsedAt within ONLINE_WINDOW)
   *
   * DISABLED keys are always offline since they're deleted from Outline.
   */
  getOnlineUsers: protectedProcedure.query(async () => {
    // Only fetch ACTIVE keys - disabled keys are always offline
    const activeKeys = await db.accessKey.findMany({
      where: {
        status: 'ACTIVE',
      },
      select: {
        id: true,
        usedBytes: true,
        lastUsedAt: true,
        estimatedDevices: true,
      },
    });

    // Online = lastUsedAt within 30 seconds for more responsive detection
    const ONLINE_WINDOW_MS = 30 * 1000;
    const now = Date.now();

    return activeKeys.map(key => ({
      id: key.id,
      usedBytes: key.usedBytes.toString(),
      lastUsedAt: key.lastUsedAt?.toISOString() || null,
      isOnline: key.lastUsedAt 
        ? (now - key.lastUsedAt.getTime()) <= ONLINE_WINDOW_MS
        : false,
      estimatedDevices: key.estimatedDevices,
    }));
  }),

  /**
   * Get key alerts for notifications page.
   * Returns keys that:
   * - Have reached 80% or more of their data limit
   * - Are expiring within 7 days
   */
  getKeyAlerts: protectedProcedure.query(async () => {
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Get all active keys with data limits or expiration dates
    const keys = await db.accessKey.findMany({
      where: {
        status: 'ACTIVE',
        OR: [
          // Keys with data limits (to check 80% usage)
          { dataLimitBytes: { not: null } },
          // Keys expiring within 7 days
          {
            expiresAt: {
              lte: sevenDaysFromNow,
              gte: now,
            },
          },
        ],
      },
      include: {
        server: {
          select: {
            name: true,
            countryCode: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Separate into traffic warning and expiring keys
    const trafficWarningKeys: Array<{
      id: string;
      name: string;
      email: string | null;
      serverName: string;
      usedBytes: string;
      dataLimitBytes: string;
      usagePercent: number;
    }> = [];

    const expiringKeys: Array<{
      id: string;
      name: string;
      email: string | null;
      serverName: string;
      expiresAt: Date;
      daysRemaining: number;
    }> = [];

    for (const key of keys) {
      // Check for traffic warning (80%+ usage)
      if (key.dataLimitBytes) {
        const usagePercent = Math.round(
          (Number(key.usedBytes) / Number(key.dataLimitBytes)) * 100
        );
        if (usagePercent >= 80) {
          trafficWarningKeys.push({
            id: key.id,
            name: key.name,
            email: key.email,
            serverName: key.server.name,
            usedBytes: key.usedBytes.toString(),
            dataLimitBytes: key.dataLimitBytes.toString(),
            usagePercent,
          });
        }
      }

      // Check for expiring soon (within 7 days)
      if (key.expiresAt && key.expiresAt <= sevenDaysFromNow && key.expiresAt >= now) {
        const diffMs = key.expiresAt.getTime() - now.getTime();
        const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        expiringKeys.push({
          id: key.id,
          name: key.name,
          email: key.email,
          serverName: key.server.name,
          expiresAt: key.expiresAt,
          daysRemaining,
        });
      }
    }

    // Sort by severity
    trafficWarningKeys.sort((a, b) => b.usagePercent - a.usagePercent);
    expiringKeys.sort((a, b) => a.daysRemaining - b.daysRemaining);

    return {
      trafficWarningKeys,
      expiringKeys,
      totalAlerts: trafficWarningKeys.length + expiringKeys.length,
      trafficWarningCount: trafficWarningKeys.length,
      expiringCount: expiringKeys.length,
    };
  }),

  /**
   * Get connection sessions for a key.
   * Returns both active and historical sessions.
   */
  getConnectionSessions: protectedProcedure
    .input(
      z.object({
        keyId: z.string(),
        includeInactive: z.boolean().default(true),
        limit: z.number().int().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const key = await db.accessKey.findUnique({
        where: { id: input.keyId },
        select: { id: true, userId: true, estimatedDevices: true, peakDevices: true },
      });

      if (!key) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Access key not found',
        });
      }

      // Authorization check
      if (ctx.user.role !== 'ADMIN' && key.userId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to view this key',
        });
      }

      const sessions = await db.connectionSession.findMany({
        where: {
          accessKeyId: input.keyId,
          ...(input.includeInactive ? {} : { isActive: true }),
        },
        orderBy: { startedAt: 'desc' },
        take: input.limit,
      });

      // Calculate session durations
      const sessionsWithDuration = sessions.map((session) => {
        const endTime = session.endedAt || new Date();
        const durationMs = endTime.getTime() - session.startedAt.getTime();
        const durationMinutes = Math.round(durationMs / 60000);

        return {
          ...session,
          bytesUsed: session.bytesUsed.toString(),
          durationMinutes,
        };
      });

      return {
        sessions: sessionsWithDuration,
        activeCount: sessions.filter((s) => s.isActive).length,
        estimatedDevices: key.estimatedDevices,
        peakDevices: key.peakDevices,
      };
    }),

  /**
   * Get active connections count for all keys.
   * Used for dashboard overview.
   */
  getActiveConnectionsOverview: protectedProcedure.query(async () => {
    const activeSessions = await db.connectionSession.groupBy({
      by: ['accessKeyId'],
      where: { isActive: true },
      _count: { id: true },
    });

    const totalActiveSessions = activeSessions.reduce(
      (sum, item) => sum + item._count.id,
      0
    );

    const keysWithActiveSessions = activeSessions.length;

    return {
      totalActiveSessions,
      keysWithActiveSessions,
      sessionsByKey: activeSessions.map((item) => ({
        keyId: item.accessKeyId,
        count: item._count.id,
      })),
    };
  }),

  /**
   * Get live metrics directly from Outline servers.
   * This fetches real-time traffic data and updates lastUsedAt for keys with new traffic,
   * enabling responsive online status detection without requiring full sync.
   */
  getLiveMetrics: protectedProcedure.query(async () => {
    const servers = await db.server.findMany({
      where: { isActive: true },
      select: {
        id: true,
        apiUrl: true,
        apiCertSha256: true,
        accessKeys: {
          where: { status: 'ACTIVE' },
          select: {
            id: true,
            outlineKeyId: true,
            usageOffset: true,
            usedBytes: true, // Need current bytes for comparison
          },
        },
      },
    });

    const results: Array<{ id: string; usedBytes: string }> = [];
    const keysWithNewTraffic: string[] = [];

    // Build a map of key id -> current stored bytes for comparison
    const keyBytesMap = new Map<string, bigint>();
    for (const server of servers) {
      for (const key of server.accessKeys) {
        keyBytesMap.set(key.id, key.usedBytes);
      }
    }

    await Promise.all(
      servers.map(async (server) => {
        try {
          const client = createOutlineClient(server.apiUrl, server.apiCertSha256);
          const metrics = await client.getMetrics();

          if (metrics?.bytesTransferredByUserId) {
            for (const key of server.accessKeys) {
              const keyId = key.outlineKeyId;
              const rawBytes = metrics.bytesTransferredByUserId[keyId] ??
                metrics.bytesTransferredByUserId[String(keyId)] ?? 0;

              const offset = Number(key.usageOffset || 0);
              const effectiveBytes = rawBytes < offset ? rawBytes : rawBytes - offset;

              results.push({
                id: key.id,
                usedBytes: effectiveBytes.toString(),
              });

              // Check if traffic increased - mark for lastUsedAt update
              const storedBytes = keyBytesMap.get(key.id) || BigInt(0);
              if (BigInt(effectiveBytes) > storedBytes) {
                keysWithNewTraffic.push(key.id);
              }
            }
          }
        } catch {
          // Server unreachable - skip silently for live metrics
        }
      })
    );

    // Batch update lastUsedAt for keys with new traffic (non-blocking)
    if (keysWithNewTraffic.length > 0) {
      db.accessKey.updateMany({
        where: { id: { in: keysWithNewTraffic } },
        data: { lastUsedAt: new Date() },
      }).catch(() => {
        // Silently ignore update errors - this is a best-effort optimization
      });
    }

    return results;
  }),

  /**
   * Bulk move keys to a different server.
   *
   * For each key, creates a new key on the target Outline server,
   * copies settings (data limit, name), updates DB, and deletes
   * the old key from the source server.
   */
  bulkMove: adminProcedure
    .input(z.object({
      ids: z.array(z.string()),
      targetServerId: z.string(),
      deleteFromSource: z.boolean().default(true),
    }))
    .mutation(async ({ input }) => {
      const results: { success: number; failed: number; errors: { id: string; name: string; error: string }[] } = {
        success: 0,
        failed: 0,
        errors: [],
      };

      const targetServer = await db.server.findUnique({ where: { id: input.targetServerId } });
      if (!targetServer) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Target server not found' });
      }

      const { createOutlineClient: createClient } = await import('@/lib/outline-api');
      const targetClient = createClient(targetServer.apiUrl, targetServer.apiCertSha256);

      for (const id of input.ids) {
        try {
          const key = await db.accessKey.findUnique({
            where: { id },
            include: { server: true },
          });

          if (!key) {
            results.failed++;
            results.errors.push({ id, name: 'Unknown', error: 'Key not found' });
            continue;
          }

          if (key.serverId === input.targetServerId) {
            results.failed++;
            results.errors.push({ id, name: key.name, error: 'Already on target server' });
            continue;
          }

          // Create key on target server
          const newKey = await targetClient.createAccessKey({
            name: key.name,
            method: key.method || 'chacha20-ietf-poly1305',
          });

          // Copy data limit
          if (key.dataLimitBytes) {
            try {
              await targetClient.setAccessKeyDataLimit(newKey.id, Number(key.dataLimitBytes));
            } catch {
              // Non-critical
            }
          }

          // Update DB
          await db.accessKey.update({
            where: { id },
            data: {
              serverId: input.targetServerId,
              outlineKeyId: newKey.id,
              accessUrl: newKey.accessUrl,
              password: newKey.password,
              port: newKey.port,
              method: newKey.method,
              usageOffset: key.usedBytes,
            },
          });

          // Delete from source
          if (input.deleteFromSource) {
            try {
              const sourceClient = createClient(key.server.apiUrl, key.server.apiCertSha256);
              await sourceClient.deleteAccessKey(key.outlineKeyId);
            } catch {
              // Non-critical — old key will eventually become orphaned
            }
          }

          results.success++;
        } catch (error) {
          results.failed++;
          results.errors.push({ id, name: id, error: (error as Error).message });
        }
      }

      return results;
    }),
});
