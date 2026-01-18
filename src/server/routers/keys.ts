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
import QRCode from 'qrcode';

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
      const { serverId, status, search, page, pageSize } = input;

      // Build the where clause
      const where: Record<string, unknown> = {};

      // Role-based filtering: Users see only their own keys
      if (ctx.user.role !== 'ADMIN') {
        where.userId = ctx.user.id;
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

      // Admin can filter by specific userId
      if (ctx.user.role === 'ADMIN' && (input as any).userId) {
        where.userId = (input as any).userId;
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
      const keysWithStats = keys.map((key) => {
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
   * Toggle key enabled/disabled status.
   *
   * Quickly enable or disable a key without deleting it.
   */
  toggleStatus: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const key = await db.accessKey.findUnique({
        where: { id: input.id },
      });

      if (!key) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Access key not found',
        });
      }

      // Toggle between ACTIVE and DISABLED
      const newStatus = key.status === 'DISABLED' ? 'ACTIVE' : 'DISABLED';

      const updatedKey = await db.accessKey.update({
        where: { id: input.id },
        data: { status: newStatus },
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
   * Get online/active users (keys with recent traffic activity).
   *
   * Similar to 3x-ui, a key is considered "online" if it had traffic during
   * the most recent sync. We use the `lastUsedAt` timestamp which is updated
   * when any traffic delta is detected.
   *
   * The logic:
   * 1. Find when the most recent sync happened (server.lastSyncAt)
   * 2. Get keys with lastUsedAt within a window around that sync time
   * 3. Only those keys are considered "online"
   *
   * This ensures users show as offline once they stop using VPN.
   */
  getOnlineUsers: protectedProcedure.query(async () => {
    // Find the most recent sync time from any server
    const latestServer = await db.server.findFirst({
      where: { isActive: true },
      orderBy: { lastSyncAt: 'desc' },
      select: { lastSyncAt: true },
    });

    if (!latestServer?.lastSyncAt) {
      return {
        onlineCount: 0,
        onlineKeyIds: [],
        lastSyncAt: null,
      };
    }

    const lastSyncAt = latestServer.lastSyncAt;

    // Only consider the sync valid if it happened within the last 2 minutes
    // (if no sync in 2 minutes, consider all users offline)
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);

    if (lastSyncAt < twoMinutesAgo) {
      return {
        onlineCount: 0,
        onlineKeyIds: [],
        lastSyncAt,
      };
    }

    // Keys are considered "online" if lastUsedAt is within 30 seconds of the last sync
    // This accounts for sync processing time across multiple servers
    const syncWindow = new Date(lastSyncAt.getTime() - 30 * 1000);

    // Find keys with recent activity
    const onlineKeys = await db.accessKey.findMany({
      where: {
        status: 'ACTIVE',
        lastUsedAt: {
          gte: syncWindow,
        },
      },
      select: {
        id: true,
      },
    });

    const activeKeyIds = onlineKeys.map(key => key.id);

    return {
      onlineCount: activeKeyIds.length,
      onlineKeyIds: activeKeyIds,
      lastSyncAt,
    };
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
});
