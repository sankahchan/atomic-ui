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
import { createOutlineClient } from '@/lib/outline-api';
import { logger } from '@/lib/logger';
import { formatTagsForStorage } from '@/lib/tags';

/**
 * Schema for creating a new Dynamic Access Key
 */
const createDAKSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  type: z.enum(['SELF_MANAGED', 'MANUAL']).default('SELF_MANAGED'),
  email: z.string().email().optional().nullable(),
  telegramId: z.string().optional().nullable(),
  userId: z.string().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  dataLimitGB: z.number().positive().optional().nullable(),
  dataLimitResetStrategy: z.enum(['NEVER', 'DAILY', 'WEEKLY', 'MONTHLY']).default('NEVER'),
  expirationType: z.enum(['NEVER', 'FIXED_DATE', 'DURATION_FROM_CREATION', 'START_ON_FIRST_USE']).default('NEVER'),
  expiresAt: z.date().optional().nullable(),
  durationDays: z.number().int().positive().optional().nullable(),
  serverTagIds: z.array(z.string()).optional(),
  // Protocol obfuscation prefix (deprecated, use method)
  prefix: z.string().max(16).optional().nullable(),
  // Encryption method
  method: z.enum(['chacha20-ietf-poly1305', 'aes-128-gcm', 'aes-192-gcm', 'aes-256-gcm']).optional().nullable(),
  // Load balancer algorithm
  loadBalancerAlgorithm: z.enum(['IP_HASH', 'RANDOM', 'ROUND_ROBIN']).default('IP_HASH'),
});

/**
 * Schema for updating a Dynamic Access Key
 */
// Valid themes for subscription pages
const SUBSCRIPTION_THEMES = [
  'dark', 'light', 'purple', 'blue', 'green', 'orange', 'pink', 'red',
  'glassPurple', 'glassBlue', 'glassCyan', 'glassGreen', 'glassPink', 'glassOrange', 'glassNeutral'
] as const;

const updateDAKSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100).optional(),
  type: z.enum(['SELF_MANAGED', 'MANUAL']).optional(),
  email: z.string().email().optional().nullable(),
  telegramId: z.string().optional().nullable(),
  userId: z.string().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  dataLimitGB: z.number().positive().optional().nullable(),
  dataLimitResetStrategy: z.enum(['NEVER', 'DAILY', 'WEEKLY', 'MONTHLY']).optional(),
  expirationType: z.enum(['NEVER', 'FIXED_DATE', 'DURATION_FROM_CREATION', 'START_ON_FIRST_USE']).optional(),
  expiresAt: z.date().optional().nullable(),
  durationDays: z.number().int().positive().optional().nullable(),
  status: z.enum(['ACTIVE', 'DISABLED', 'EXPIRED', 'DEPLETED']).optional(),
  serverTagIds: z.array(z.string()).optional(),
  // Protocol obfuscation prefix
  prefix: z.string().max(16).optional().nullable(),
  // Load balancer algorithm
  loadBalancerAlgorithm: z.enum(['IP_HASH', 'RANDOM', 'ROUND_ROBIN']).optional(),
  // Subscription page customization
  subscriptionTheme: z.enum(SUBSCRIPTION_THEMES).optional().nullable(),
  coverImage: z.string().url().optional().nullable(),
  coverImageType: z.enum(['url', 'gradient', 'upload']).optional().nullable(),
  contactLinks: z.string().optional().nullable(), // JSON string of contact links
  // New fields for tags and owner
  owner: z.string().max(100).optional().nullable(),
  tags: z.string().max(500).optional().nullable(),
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
    .query(async ({ ctx, input }) => {
      const { search, type, status, page, pageSize, online, expiring7d, overQuota, inactive30d, tag, owner } = input;

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

      // Role-based filtering: Users see only their own keys
      if (ctx.user.role !== 'ADMIN') {
        where.userId = ctx.user.id;
      }

      // Admin can filter by specific userId
      if (ctx.user.role === 'ADMIN' && (input as Record<string, unknown>).userId) {
        where.userId = (input as Record<string, unknown>).userId;
      }

      // Quick filter: Online (firstUsedAt within 90s AND not disabled)
      if (online) {
        const onlineThreshold = new Date(Date.now() - 90 * 1000);
        where.firstUsedAt = { gte: onlineThreshold };
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

      // Quick filter: Inactive for 30 days
      if (inactive30d) {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        where.OR = [
          { firstUsedAt: null },
          { firstUsedAt: { lt: thirtyDaysAgo } },
        ];
      }

      // Tag filter
      if (tag) {
        const normalizedTag = tag.trim().toLowerCase();
        where.tags = { contains: `,${normalizedTag},` };
      }

      // Owner filter
      if (owner) {
        where.owner = { contains: owner };
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
      let items = daks.map((dak) => {
        let daysRemaining: number | null = null;
        if (dak.expiresAt) {
          const diffMs = dak.expiresAt.getTime() - now.getTime();
          daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        }

        const usagePercent = dak.dataLimitBytes
          ? Math.round((Number(dak.usedBytes) / Number(dak.dataLimitBytes)) * 100)
          : 0;

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
          usagePercent,
          expiresAt: dak.expiresAt,
          daysRemaining,
          prefix: dak.prefix,
          method: dak.method,
          loadBalancerAlgorithm: dak.loadBalancerAlgorithm as 'IP_HASH' | 'RANDOM' | 'ROUND_ROBIN',
          serverTagIds: JSON.parse(dak.serverTagsJson || '[]') as string[],
          attachedKeysCount: dak._count.accessKeys,
          createdAt: dak.createdAt,
          updatedAt: dak.updatedAt,
          userId: dak.userId,
          owner: dak.owner,
          tags: dak.tags,
          firstUsedAt: dak.firstUsedAt,
        };
      });

      // Quick filter: Over 80% quota (post-fetch filter since it compares two fields)
      if (overQuota) {
        items = items.filter(
          (item) => item.dataLimitBytes && item.usagePercent >= 80
        );
      }

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
    .query(async ({ ctx, input }) => {
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
        });
      }

      // Authorization check: User can only access their own key
      if (ctx.user.role !== 'ADMIN' && dak.userId !== ctx.user.id) {
        // Allow if user owns an attached key? Maybe strict ownership for DAK is better.
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to view this key',
        });
      }

      return {
        id: dak.id,
        name: dak.name,
        type: dak.type as 'SELF_MANAGED' | 'MANUAL',
        status: dak.status as 'ACTIVE' | 'DISABLED' | 'EXPIRED' | 'DEPLETED',
        email: dak.email,
        telegramId: dak.telegramId,
        userId: dak.userId,
        notes: dak.notes,
        dynamicUrl: dak.dynamicUrl,
        dataLimitBytes: dak.dataLimitBytes,
        usedBytes: dak.usedBytes,
        expiresAt: dak.expiresAt,
        expirationType: dak.expirationType,
        durationDays: dak.durationDays,
        firstUsedAt: dak.firstUsedAt,
        prefix: dak.prefix,
        loadBalancerAlgorithm: dak.loadBalancerAlgorithm as 'IP_HASH' | 'RANDOM' | 'ROUND_ROBIN',
        serverTagIds: JSON.parse(dak.serverTagsJson || '[]') as string[],
        accessKeys: dak.accessKeys,
        // Subscription page customization
        subscriptionTheme: dak.subscriptionTheme,
        coverImage: dak.coverImage,
        coverImageType: dak.coverImageType,
        contactLinks: dak.contactLinks ? JSON.parse(dak.contactLinks) : null,
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
          type: input.type, // SELF_MANAGED or MANUAL - determines key creation behavior
          email: input.email,
          telegramId: input.telegramId,
          userId: input.userId, // Assign to user if provided
          notes: input.notes,
          dynamicUrl,
          dataLimitBytes: input.dataLimitGB ? gbToBytes(input.dataLimitGB) : null,
          dataLimitResetStrategy: input.dataLimitResetStrategy,
          expirationType: input.expirationType,
          expiresAt,
          durationDays: input.durationDays,
          status,
          serverTagsJson: JSON.stringify(input.serverTagIds || []),
          prefix: input.prefix,
          method: input.method || 'chacha20-ietf-poly1305',
          loadBalancerAlgorithm: input.loadBalancerAlgorithm,
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
        loadBalancerAlgorithm: dak.loadBalancerAlgorithm as 'IP_HASH' | 'RANDOM' | 'ROUND_ROBIN',
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
      const { id, serverTagIds, dataLimitGB, dataLimitResetStrategy, email, telegramId, userId, notes, prefix, loadBalancerAlgorithm, subscriptionTheme, coverImage, coverImageType, contactLinks, owner, tags, ...data } = input;

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

      if (userId !== undefined) {
        updateData.userId = userId;
      }

      if (notes !== undefined) {
        updateData.notes = notes;
      }

      if (dataLimitGB !== undefined) {
        updateData.dataLimitBytes = dataLimitGB ? gbToBytes(dataLimitGB) : null;
      }

      if (dataLimitResetStrategy !== undefined) {
        updateData.dataLimitResetStrategy = dataLimitResetStrategy;
      }

      if (serverTagIds !== undefined) {
        updateData.serverTagsJson = JSON.stringify(serverTagIds);
      }

      if (prefix !== undefined) {
        updateData.prefix = prefix;
      }

      if (loadBalancerAlgorithm !== undefined) {
        updateData.loadBalancerAlgorithm = loadBalancerAlgorithm;
      }

      // Subscription page customization
      if (subscriptionTheme !== undefined) {
        updateData.subscriptionTheme = subscriptionTheme;
      }

      if (coverImage !== undefined) {
        updateData.coverImage = coverImage;
      }

      if (coverImageType !== undefined) {
        updateData.coverImageType = coverImageType;
      }

      if (contactLinks !== undefined) {
        updateData.contactLinks = contactLinks;
      }

      // Handle owner field
      if (owner !== undefined) {
        updateData.owner = owner;
      }

      // Handle tags field (normalize for storage)
      if (tags !== undefined) {
        updateData.tags = tags ? formatTagsForStorage(tags) : '';
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
      } else if (data.expiresAt !== undefined) {
        // Allow updating expiresAt directly without changing expirationType
        updateData.expiresAt = data.expiresAt;
        updateData.expirationType = 'FIXED_DATE';
      } else if (data.durationDays !== undefined && data.durationDays !== null) {
        // Recalculate expiresAt from durationDays
        const newExpiry = new Date();
        newExpiry.setDate(newExpiry.getDate() + data.durationDays);
        updateData.expiresAt = newExpiry;
        updateData.durationDays = data.durationDays;
        updateData.expirationType = 'DURATION_FROM_CREATION';
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
        loadBalancerAlgorithm: dak.loadBalancerAlgorithm as 'IP_HASH' | 'RANDOM' | 'ROUND_ROBIN',
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
   *
   * When disabling a DAK, all its attached access keys are also disabled
   * (deleted from Outline servers). When enabling, they are recreated.
   */
  toggleStatus: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const dak = await db.dynamicAccessKey.findUnique({
        where: { id: input.id },
        include: {
          accessKeys: {
            include: {
              server: true,
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

      const isCurrentlyDisabled = dak.status === 'DISABLED';
      const newStatus = isCurrentlyDisabled ? 'ACTIVE' : 'DISABLED';

      // Disable/Enable all attached access keys on Outline servers
      for (const key of dak.accessKeys) {
        const client = createOutlineClient(key.server.apiUrl, key.server.apiCertSha256);

        if (isCurrentlyDisabled) {
          // ENABLE: Recreate keys on Outline
          try {
            const newOutlineKey = await client.createAccessKey({
              name: key.name,
              method: key.method || undefined,
            });

            if (key.dataLimitBytes) {
              const serverLimit = Math.max(0, Number(key.usageOffset) + Number(key.dataLimitBytes));
              await client.setAccessKeyDataLimit(newOutlineKey.id, serverLimit);
            }

            await db.accessKey.update({
              where: { id: key.id },
              data: {
                status: 'ACTIVE',
                outlineKeyId: newOutlineKey.id,
                accessUrl: newOutlineKey.accessUrl,
                password: newOutlineKey.password,
                port: newOutlineKey.port,
                method: newOutlineKey.method,
                disabledAt: null,
                disabledOutlineKeyId: null,
              },
            });
          } catch (error) {
            logger.error(`Failed to re-enable key ${key.id}`, error);
          }
        } else {
          // DISABLE: Delete keys from Outline
          try {
            await client.deleteAccessKey(key.outlineKeyId);
          } catch (error) {
            logger.error(`Failed to delete key ${key.outlineKeyId}`, error);
          }

          await db.accessKey.update({
            where: { id: key.id },
            data: {
              status: 'DISABLED',
              disabledAt: new Date(),
              disabledOutlineKeyId: key.outlineKeyId,
              estimatedDevices: 0,
            },
          });

          // Close active sessions
          await db.connectionSession.updateMany({
            where: { accessKeyId: key.id, isActive: true },
            data: { isActive: false, endedAt: new Date() },
          });
        }
      }

      // Update the DAK status
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
   * Bulk enable/disable multiple Dynamic Access Keys.
   *
   * When disabling: Disables all attached access keys (deletes from Outline).
   * When enabling: Re-enables all attached access keys (recreates on Outline).
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

      for (const dakId of input.ids) {
        try {
          const dak = await db.dynamicAccessKey.findUnique({
            where: { id: dakId },
            include: {
              accessKeys: {
                include: { server: true },
              },
            },
          });

          if (!dak) {
            results.failed++;
            results.errors.push({ id: dakId, name: 'Unknown', error: 'Dynamic key not found' });
            continue;
          }

          const isCurrentlyDisabled = dak.status === 'DISABLED';

          // Skip if already in desired state
          if (input.enable && !isCurrentlyDisabled) {
            results.success++;
            continue;
          }
          if (!input.enable && isCurrentlyDisabled) {
            results.success++;
            continue;
          }

          // Process all attached access keys
          for (const key of dak.accessKeys) {
            const client = createOutlineClient(key.server.apiUrl, key.server.apiCertSha256);

            if (input.enable) {
              // ENABLE: Recreate keys on Outline
              try {
                const newOutlineKey = await client.createAccessKey({
                  name: key.name,
                  method: key.method || undefined,
                });

                if (key.dataLimitBytes) {
                  const serverLimit = Math.max(0, Number(key.usageOffset) + Number(key.dataLimitBytes));
                  await client.setAccessKeyDataLimit(newOutlineKey.id, serverLimit);
                }

                await db.accessKey.update({
                  where: { id: key.id },
                  data: {
                    status: 'ACTIVE',
                    outlineKeyId: newOutlineKey.id,
                    accessUrl: newOutlineKey.accessUrl,
                    password: newOutlineKey.password,
                    port: newOutlineKey.port,
                    method: newOutlineKey.method,
                    disabledAt: null,
                    disabledOutlineKeyId: null,
                  },
                });
              } catch (error) {
                logger.error(`Failed to re-enable key ${key.id}`, error);
              }
            } else {
              // DISABLE: Delete keys from Outline
              try {
                await client.deleteAccessKey(key.outlineKeyId);
              } catch (error) {
                logger.error(`Failed to delete key ${key.outlineKeyId}`, error);
              }

              await db.accessKey.update({
                where: { id: key.id },
                data: {
                  status: 'DISABLED',
                  disabledAt: new Date(),
                  disabledOutlineKeyId: key.outlineKeyId,
                  estimatedDevices: 0,
                },
              });

              // Close active sessions
              await db.connectionSession.updateMany({
                where: { accessKeyId: key.id, isActive: true },
                data: { isActive: false, endedAt: new Date() },
              });
            }
          }

          // Update the DAK status
          const newStatus = input.enable ? 'ACTIVE' : 'DISABLED';
          await db.dynamicAccessKey.update({
            where: { id: dakId },
            data: { status: newStatus },
          });

          results.success++;
        } catch (error) {
          results.failed++;
          results.errors.push({ id: dakId, name: 'Unknown', error: (error as Error).message });
        }
      }

      return results;
    }),

  /**
   * Bulk extend expiration for multiple Dynamic Access Keys.
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
          const dak = await db.dynamicAccessKey.findUnique({ where: { id } });

          if (dak) {
            let newExpiresAt: Date;

            if (dak.expiresAt) {
              // Add days to existing expiration
              newExpiresAt = new Date(dak.expiresAt);
              newExpiresAt.setDate(newExpiresAt.getDate() + input.days);
            } else {
              // Set from now if no previous expiration
              newExpiresAt = new Date();
              newExpiresAt.setDate(newExpiresAt.getDate() + input.days);
            }

            // Update key
            await db.dynamicAccessKey.update({
              where: { id },
              data: {
                expiresAt: newExpiresAt,
                expirationType: 'FIXED_DATE',
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
   * Bulk add tags to multiple Dynamic Access Keys.
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
          const dak = await db.dynamicAccessKey.findUnique({
            where: { id },
            select: { tags: true },
          });

          if (!dak) {
            results.failed++;
            continue;
          }

          // Parse existing tags (stored as ,tag1,tag2, format)
          const existingTags = (dak.tags || '')
            .split(',')
            .filter(Boolean)
            .map(t => t.trim().toLowerCase());

          // Merge with new tags (no duplicates)
          const mergedTags = Array.from(new Set([...existingTags, ...newTags]));
          const formattedTags = mergedTags.length > 0 ? `,${mergedTags.join(',')},` : '';

          await db.dynamicAccessKey.update({
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
   * Bulk remove tags from multiple Dynamic Access Keys.
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
          const dak = await db.dynamicAccessKey.findUnique({
            where: { id },
            select: { tags: true },
          });

          if (!dak) {
            results.failed++;
            continue;
          }

          // Parse existing tags
          const existingTags = (dak.tags || '')
            .split(',')
            .filter(Boolean)
            .map(t => t.trim().toLowerCase());

          // Remove specified tags
          const remainingTags = existingTags.filter(t => !tagsToRemove.includes(t));
          const formattedTags = remainingTags.length > 0 ? `,${remainingTags.join(',')},` : '';

          await db.dynamicAccessKey.update({
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
    // List raw usage for all active dynamic keys for client-side delta tracking
    const activeDaks = await db.dynamicAccessKey.findMany({
      where: {
        status: 'ACTIVE',
      },
      select: {
        id: true,
        usedBytes: true,
      },
    });

    return activeDaks.map(dak => ({
      id: dak.id,
      usedBytes: dak.usedBytes.toString(),
    }));
  }),

  /**
   * Get live metrics for dynamic keys by fetching from Outline servers directly.
   * Aggregates traffic from all attached access keys and updates firstUsedAt for keys with new traffic.
   */
  getLiveMetrics: protectedProcedure.query(async () => {
    // Get all active dynamic keys with their attached access keys and current usage
    const activeDaks = await db.dynamicAccessKey.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        usedBytes: true, // Need current bytes for comparison
        accessKeys: {
          select: {
            id: true,
            outlineKeyId: true,
            usageOffset: true,
            server: {
              select: {
                id: true,
                apiUrl: true,
                apiCertSha256: true,
                isActive: true,
              },
            },
          },
        },
      },
    });

    // Build a map of DAK id -> current stored bytes for comparison
    const dakStoredBytesMap = new Map<string, bigint>();
    for (const dak of activeDaks) {
      dakStoredBytesMap.set(dak.id, dak.usedBytes);
    }

    // Collect unique servers and their keys
    const serverKeysMap = new Map<string, {
      apiUrl: string;
      apiCertSha256: string;
      keys: Array<{ id: string; outlineKeyId: string; usageOffset: bigint | null; dakId: string }>;
    }>();

    for (const dak of activeDaks) {
      for (const key of dak.accessKeys) {
        if (!key.server.isActive) continue;

        if (!serverKeysMap.has(key.server.id)) {
          serverKeysMap.set(key.server.id, {
            apiUrl: key.server.apiUrl,
            apiCertSha256: key.server.apiCertSha256,
            keys: [],
          });
        }
        serverKeysMap.get(key.server.id)!.keys.push({
          id: key.id,
          outlineKeyId: key.outlineKeyId,
          usageOffset: key.usageOffset,
          dakId: dak.id,
        });
      }
    }

    // Fetch metrics from each server
    const dakUsageMap = new Map<string, bigint>();

    await Promise.all(
      Array.from(serverKeysMap.entries()).map(async ([, serverData]) => {
        try {
          const client = createOutlineClient(serverData.apiUrl, serverData.apiCertSha256);
          const metrics = await client.getMetrics();

          if (metrics?.bytesTransferredByUserId) {
            for (const key of serverData.keys) {
              const rawBytes = metrics.bytesTransferredByUserId[key.outlineKeyId] ??
                metrics.bytesTransferredByUserId[String(key.outlineKeyId)] ?? 0;

              const offset = Number(key.usageOffset || 0);
              const effectiveBytes = BigInt(rawBytes < offset ? rawBytes : rawBytes - offset);

              const currentTotal = dakUsageMap.get(key.dakId) || BigInt(0);
              dakUsageMap.set(key.dakId, currentTotal + effectiveBytes);
            }
          }
        } catch {
          // Server unreachable - skip silently for live metrics
        }
      })
    );

    // Find DAKs with new traffic and update firstUsedAt (non-blocking)
    const daksWithNewTraffic: string[] = [];
    Array.from(dakUsageMap.entries()).forEach(([dakId, newUsedBytes]) => {
      const storedBytes = dakStoredBytesMap.get(dakId) || BigInt(0);
      if (newUsedBytes > storedBytes) {
        daksWithNewTraffic.push(dakId);
      }
    });

    if (daksWithNewTraffic.length > 0) {
      db.dynamicAccessKey.updateMany({
        where: { id: { in: daksWithNewTraffic } },
        data: { firstUsedAt: new Date() },
      }).catch(() => {
        // Silently ignore update errors - this is a best-effort optimization
      });
    }

    return Array.from(dakUsageMap.entries()).map(([id, usedBytes]) => ({
      id,
      usedBytes: usedBytes.toString(),
    }));
  }),
});
