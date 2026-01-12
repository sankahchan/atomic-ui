/**
 * Dynamic Access Keys Router
 *
 * This router handles all Dynamic Access Key (DAK) operations including:
 * - Creating, reading, updating, and deleting dynamic keys
 * - Attaching and detaching regular access keys
 * - Managing subscription URLs
 *
 * Dynamic Access Keys provide a stable subscription URL that doesn't change
 * even when the underlying keys or servers change.
 */

import { z } from 'zod';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { db } from '@/lib/db';
import { TRPCError } from '@trpc/server';
import { generateRandomString } from '@/lib/utils';

/**
 * Schema for creating a new Dynamic Access Key
 */
const createDAKSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  type: z.enum(['SELF_MANAGED', 'MANUAL']).default('SELF_MANAGED'),
  email: z.string().email().optional().nullable(),
  telegramId: z.string().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  dataLimitGB: z.number().positive().optional().nullable(),
  expirationType: z.enum(['NEVER', 'FIXED_DATE', 'DURATION_FROM_CREATION', 'START_ON_FIRST_USE']).default('NEVER'),
  expiresAt: z.date().optional().nullable(),
  durationDays: z.number().int().positive().optional().nullable(),
  serverTagIds: z.array(z.string()).optional(),
  // Protocol obfuscation prefix (deprecated, use method)
  prefix: z.string().max(16).optional().nullable(),
  // Encryption method
  method: z.enum(['chacha20-ietf-poly1305', 'aes-128-gcm', 'aes-192-gcm', 'aes-256-gcm']).optional().nullable(),
});

/**
 * Schema for updating a Dynamic Access Key
 */
const updateDAKSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100).optional(),
  type: z.enum(['SELF_MANAGED', 'MANUAL']).optional(),
  email: z.string().email().optional().nullable(),
  telegramId: z.string().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  dataLimitGB: z.number().positive().optional().nullable(),
  expirationType: z.enum(['NEVER', 'FIXED_DATE', 'DURATION_FROM_CREATION', 'START_ON_FIRST_USE']).optional(),
  expiresAt: z.date().optional().nullable(),
  durationDays: z.number().int().positive().optional().nullable(),
  status: z.enum(['ACTIVE', 'DISABLED', 'EXPIRED', 'DEPLETED']).optional(),
  serverTagIds: z.array(z.string()).optional(),
  // Protocol obfuscation prefix
  prefix: z.string().max(16).optional().nullable(),
});

/**
 * Schema for listing Dynamic Access Keys
 */
const listDAKSchema = z.object({
  search: z.string().optional(),
  type: z.enum(['SELF_MANAGED', 'MANUAL']).optional(),
  status: z.enum(['ACTIVE', 'DISABLED', 'EXPIRED', 'DEPLETED', 'PENDING']).optional(),
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
      return { expiresAt: null, status: 'ACTIVE' };
    default:
      return { expiresAt: null, status: 'ACTIVE' };
  }
};

export const dynamicKeysRouter = router({
  /**
   * List Dynamic Access Keys with filtering and pagination
   */
  list: protectedProcedure
    .input(listDAKSchema)
    .query(async ({ input }) => {
      const { search, type, status, page, pageSize } = input;

      // Build the where clause
      const where: Record<string, unknown> = {};

      if (type) {
        where.type = type;
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

      // Get total count for pagination
      const total = await db.dynamicAccessKey.count({ where });

      // Fetch DAKs with attached keys count
      const daks = await db.dynamicAccessKey.findMany({
        where,
        include: {
          _count: {
            select: { accessKeys: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      });

      // Transform the data and calculate days remaining
      const now = new Date();
      const items = daks.map((dak) => {
        let daysRemaining: number | null = null;
        if (dak.expiresAt) {
          const diffMs = dak.expiresAt.getTime() - now.getTime();
          daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        }

        return {
          id: dak.id,
          name: dak.name,
          type: dak.type as 'SELF_MANAGED' | 'MANUAL',
          status: dak.status as 'ACTIVE' | 'DISABLED' | 'EXPIRED' | 'DEPLETED',
          email: dak.email,
          telegramId: dak.telegramId,
          notes: dak.notes,
          dynamicUrl: dak.dynamicUrl,
          dataLimitBytes: dak.dataLimitBytes,
          usedBytes: dak.usedBytes,
          expiresAt: dak.expiresAt,
          expirationType: dak.expirationType,
          durationDays: dak.durationDays,
          daysRemaining,
          prefix: dak.prefix,
          method: dak.method,
          serverTagIds: JSON.parse(dak.serverTagsJson || '[]') as string[],
          attachedKeysCount: dak._count.accessKeys,
          createdAt: dak.createdAt,
          updatedAt: dak.updatedAt,
        };
      });

      return {
        items,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
        hasMore: page * pageSize < total,
      };
    }),

  /**
   * Get a single Dynamic Access Key by ID with attached keys
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const dak = await db.dynamicAccessKey.findUnique({
        where: { id: input.id },
        include: {
          accessKeys: {
            include: {
              server: {
                select: {
                  id: true,
                  name: true,
                  countryCode: true,
                },
              },
            },
          },
        },
      });

      if (!dak) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Dynamic Access Key not found',
        });
      }

      return {
        id: dak.id,
        name: dak.name,
        type: dak.type as 'SELF_MANAGED' | 'MANUAL',
        status: dak.status as 'ACTIVE' | 'DISABLED' | 'EXPIRED' | 'DEPLETED',
        email: dak.email,
        telegramId: dak.telegramId,
        notes: dak.notes,
        dynamicUrl: dak.dynamicUrl,
        dataLimitBytes: dak.dataLimitBytes,
        usedBytes: dak.usedBytes,
        expiresAt: dak.expiresAt,
        expirationType: dak.expirationType,
        durationDays: dak.durationDays,
        firstUsedAt: dak.firstUsedAt,
        prefix: dak.prefix,
        serverTagIds: JSON.parse(dak.serverTagsJson || '[]') as string[],
        accessKeys: dak.accessKeys,
        createdAt: dak.createdAt,
        updatedAt: dak.updatedAt,
      };
    }),

  /**
   * Create a new Dynamic Access Key
   */
  create: adminProcedure
    .input(createDAKSchema)
    .mutation(async ({ input }) => {
      // Calculate expiration
      const { expiresAt, status } = calculateExpiration(
        input.expirationType,
        input.expiresAt,
        input.durationDays
      );

      // Generate unique dynamic URL token
      const dynamicUrl = generateRandomString(32);

      // Create the DAK
      const dak = await db.dynamicAccessKey.create({
        data: {
          name: input.name,
          type: input.type,
          email: input.email,
          telegramId: input.telegramId,
          notes: input.notes,
          dynamicUrl,
          dataLimitBytes: input.dataLimitGB ? gbToBytes(input.dataLimitGB) : null,
          expirationType: input.expirationType,
          expiresAt,
          durationDays: input.durationDays,
          status,
          serverTagsJson: JSON.stringify(input.serverTagIds || []),
          prefix: input.prefix,
          method: input.method || 'chacha20-ietf-poly1305',
        },
        include: {
          _count: {
            select: { accessKeys: true },
          },
        },
      });

      return {
        id: dak.id,
        name: dak.name,
        type: dak.type as 'SELF_MANAGED' | 'MANUAL',
        status: dak.status as 'ACTIVE' | 'DISABLED' | 'EXPIRED' | 'DEPLETED',
        dynamicUrl: dak.dynamicUrl,
        dataLimitBytes: dak.dataLimitBytes,
        usedBytes: dak.usedBytes,
        expiresAt: dak.expiresAt,
        serverTagIds: JSON.parse(dak.serverTagsJson || '[]') as string[],
        attachedKeysCount: dak._count.accessKeys,
        createdAt: dak.createdAt,
      };
    }),

  /**
   * Update a Dynamic Access Key
   */
  update: adminProcedure
    .input(updateDAKSchema)
    .mutation(async ({ input }) => {
      const { id, serverTagIds, dataLimitGB, email, telegramId, notes, prefix, ...data } = input;

      // Check if DAK exists
      const existing = await db.dynamicAccessKey.findUnique({
        where: { id },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Dynamic Access Key not found',
        });
      }

      // Prepare update data
      const updateData: Record<string, unknown> = { ...data };

      if (email !== undefined) {
        updateData.email = email;
      }

      if (telegramId !== undefined) {
        updateData.telegramId = telegramId;
      }

      if (notes !== undefined) {
        updateData.notes = notes;
      }

      if (dataLimitGB !== undefined) {
        updateData.dataLimitBytes = dataLimitGB ? gbToBytes(dataLimitGB) : null;
      }

      if (serverTagIds !== undefined) {
        updateData.serverTagsJson = JSON.stringify(serverTagIds);
      }

      if (prefix !== undefined) {
        updateData.prefix = prefix;
      }

      // Recalculate expiration if type changed
      if (data.expirationType) {
        const { expiresAt, status } = calculateExpiration(
          data.expirationType,
          data.expiresAt,
          data.durationDays
        );
        updateData.expiresAt = expiresAt;
        if (!data.status) {
          updateData.status = status;
        }
      }

      const dak = await db.dynamicAccessKey.update({
        where: { id },
        data: updateData,
        include: {
          _count: {
            select: { accessKeys: true },
          },
        },
      });

      return {
        id: dak.id,
        name: dak.name,
        type: dak.type as 'SELF_MANAGED' | 'MANUAL',
        status: dak.status as 'ACTIVE' | 'DISABLED' | 'EXPIRED' | 'DEPLETED',
        dynamicUrl: dak.dynamicUrl,
        dataLimitBytes: dak.dataLimitBytes,
        usedBytes: dak.usedBytes,
        expiresAt: dak.expiresAt,
        serverTagIds: JSON.parse(dak.serverTagsJson || '[]') as string[],
        attachedKeysCount: dak._count.accessKeys,
        createdAt: dak.createdAt,
        updatedAt: dak.updatedAt,
      };
    }),

  /**
   * Delete a Dynamic Access Key
   * Note: This detaches all associated AccessKeys but doesn't delete them
   */
  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const dak = await db.dynamicAccessKey.findUnique({
        where: { id: input.id },
      });

      if (!dak) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Dynamic Access Key not found',
        });
      }

      // Detach all access keys first (set dynamicKeyId to null)
      await db.accessKey.updateMany({
        where: { dynamicKeyId: input.id },
        data: { dynamicKeyId: null },
      });

      // Delete the DAK
      await db.dynamicAccessKey.delete({
        where: { id: input.id },
      });

      return { success: true };
    }),

  /**
   * Toggle the status of a Dynamic Access Key between ACTIVE and DISABLED
   */
  toggleStatus: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const dak = await db.dynamicAccessKey.findUnique({
        where: { id: input.id },
      });

      if (!dak) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Dynamic Access Key not found',
        });
      }

      // Toggle between ACTIVE and DISABLED
      const newStatus = dak.status === 'DISABLED' ? 'ACTIVE' : 'DISABLED';

      const updated = await db.dynamicAccessKey.update({
        where: { id: input.id },
        data: { status: newStatus },
      });

      return {
        id: updated.id,
        name: updated.name,
        status: updated.status as 'ACTIVE' | 'DISABLED' | 'EXPIRED' | 'DEPLETED',
      };
    }),

  /**
   * Bulk delete multiple Dynamic Access Keys
   */
  bulkDelete: adminProcedure
    .input(z.object({ ids: z.array(z.string()) }))
    .mutation(async ({ input }) => {
      let successCount = 0;
      let failedCount = 0;

      for (const id of input.ids) {
        try {
          // Detach all access keys first
          await db.accessKey.updateMany({
            where: { dynamicKeyId: id },
            data: { dynamicKeyId: null },
          });

          // Delete the DAK
          await db.dynamicAccessKey.delete({
            where: { id },
          });

          successCount++;
        } catch {
          failedCount++;
        }
      }

      return {
        success: successCount,
        failed: failedCount,
      };
    }),

  /**
   * Attach an AccessKey to a Dynamic Access Key
   */
  attachKey: adminProcedure
    .input(
      z.object({
        dakId: z.string(),
        keyId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      // Verify DAK exists
      const dak = await db.dynamicAccessKey.findUnique({
        where: { id: input.dakId },
      });

      if (!dak) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Dynamic Access Key not found',
        });
      }

      // Verify AccessKey exists
      const key = await db.accessKey.findUnique({
        where: { id: input.keyId },
      });

      if (!key) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Access Key not found',
        });
      }

      // Check if key is already attached to another DAK
      if (key.dynamicKeyId && key.dynamicKeyId !== input.dakId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Access Key is already attached to another Dynamic Key',
        });
      }

      // Attach the key
      await db.accessKey.update({
        where: { id: input.keyId },
        data: { dynamicKeyId: input.dakId },
      });

      return { success: true };
    }),

  /**
   * Detach an AccessKey from a Dynamic Access Key
   */
  detachKey: adminProcedure
    .input(
      z.object({
        dakId: z.string(),
        keyId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      // Verify the key is attached to this DAK
      const key = await db.accessKey.findUnique({
        where: { id: input.keyId },
      });

      if (!key) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Access Key not found',
        });
      }

      if (key.dynamicKeyId !== input.dakId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Access Key is not attached to this Dynamic Key',
        });
      }

      // Detach the key
      await db.accessKey.update({
        where: { id: input.keyId },
        data: { dynamicKeyId: null },
      });

      return { success: true };
    }),

  /**
   * Get statistics about Dynamic Access Keys
   */
  stats: protectedProcedure.query(async () => {
    const [total, selfManaged, manual, active] = await Promise.all([
      db.dynamicAccessKey.count(),
      db.dynamicAccessKey.count({ where: { type: 'SELF_MANAGED' } }),
      db.dynamicAccessKey.count({ where: { type: 'MANUAL' } }),
      db.dynamicAccessKey.count({ where: { status: 'ACTIVE' } }),
    ]);

    // Get total usage across all dynamic keys
    const usageResult = await db.dynamicAccessKey.aggregate({
      _sum: {
        usedBytes: true,
      },
    });
    const totalUsedBytes = usageResult._sum.usedBytes?.toString() || '0';

    // Get total data limit across all keys (for keys that have limits)
    const limitResult = await db.dynamicAccessKey.aggregate({
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
      selfManaged,
      manual,
      active,
      totalUsedBytes,
      totalDataLimitBytes,
    };
  }),

  /**
   * Get online/active users for dynamic keys.
   *
   * A dynamic key is considered "online" if any of its attached
   * access keys have had traffic in the MOST RECENT sync, similar to
   * how X-UI handles online status detection.
   */
  getOnlineUsers: protectedProcedure.query(async () => {
    // First, find the most recent traffic log timestamp to determine when last sync happened
    const latestLog = await db.trafficLog.findFirst({
      orderBy: {
        recordedAt: 'desc',
      },
      select: {
        recordedAt: true,
      },
    });

    if (!latestLog) {
      return {
        onlineCount: 0,
        onlineDakIds: [],
        lastSyncAt: null,
      };
    }

    // Allow a 30-second tolerance window for logs created in the same sync batch
    const syncWindow = new Date(latestLog.recordedAt.getTime() - 30 * 1000);

    // Only consider the sync valid if it happened within the last 2 minutes
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);

    if (latestLog.recordedAt < twoMinutesAgo) {
      return {
        onlineCount: 0,
        onlineDakIds: [],
        lastSyncAt: latestLog.recordedAt,
      };
    }

    // Get access keys with traffic from the most recent sync that are attached to dynamic keys
    const recentLogs = await db.trafficLog.findMany({
      where: {
        recordedAt: {
          gte: syncWindow,
        },
        bytesUsed: {
          gt: 0,
        },
        accessKey: {
          dynamicKeyId: {
            not: null,
          },
        },
      },
      include: {
        accessKey: {
          select: {
            dynamicKeyId: true,
          },
        },
      },
      distinct: ['accessKeyId'],
    });

    // Get unique dynamic key IDs that have active traffic
    const onlineDakIdsArray = recentLogs
      .map(log => log.accessKey.dynamicKeyId)
      .filter((id): id is string => id !== null);

    // Remove duplicates using filter
    const onlineDakIds = onlineDakIdsArray.filter(
      (id, index) => onlineDakIdsArray.indexOf(id) === index
    );

    return {
      onlineCount: onlineDakIds.length,
      onlineDakIds,
      lastSyncAt: latestLog.recordedAt,
    };
  }),
});
