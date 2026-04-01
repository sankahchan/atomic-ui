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
import { formatTagsForStorage, mergeTagsForStorage, summarizeStoredTags } from '@/lib/tags';
import { canAssignKeysToServer } from '@/lib/services/server-lifecycle';
import { selectLeastLoadedServer } from '@/lib/services/load-balancer';
import { decorateOutlineAccessUrl } from '@/lib/outline-access-url';
import {
  buildAccessDistributionLinkUrl,
  buildSharePageUrl,
  buildShortClientUrl,
  buildShortShareUrl,
  buildSubscriptionApiUrl,
} from '@/lib/subscription-links';
import { subscriptionThemeIds } from '@/lib/subscription-themes';
import {
  buildPublicSlugSuggestionCandidates,
  isReservedPublicSlug,
  isValidPublicSlug,
  normalizePublicSlug,
  slugifyPublicName,
} from '@/lib/public-slug';
import {
  collectTrafficActivity,
  isTrafficActive,
  TRAFFIC_ACTIVE_WINDOW_MS,
} from '@/lib/services/traffic-activity';
import {
  createAccessKeyTelegramConnectLink,
  sendAccessKeyRenewalReminder,
  sendAccessKeyLifecycleTelegramNotification,
  sendAccessKeySupportMessage,
  sendAccessKeySharePageToTelegram,
} from '@/lib/services/telegram-bot';
import {
  getAccessKeySubscriptionAnalytics,
  SUBSCRIPTION_EVENT_TYPES,
} from '@/lib/services/subscription-events';
import {
  computeArchiveAfterAt,
  parseQuotaAlertThresholds,
  stringifyQuotaAlertThresholds,
} from '@/lib/access-key-policies';
import { getGeoIpCountry } from '@/lib/security';
import { writeAuditLog } from '@/lib/audit';
import {
  hasSharePagePassword,
  hashSharePagePassword,
} from '@/lib/share-page-protection';
import { replaceAccessKeyServer } from '@/lib/services/server-migration';

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
  serverId: z.string().optional().nullable(),
  assignmentMode: z.enum(['MANUAL', 'AUTO']).default('MANUAL'),
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
  subscriptionTheme: z.enum(subscriptionThemeIds).optional().nullable(),
  coverImage: z.string().url().optional().nullable(),
  coverImageType: z.enum(['url', 'gradient', 'upload']).optional().nullable(),
  contactLinks: z.string().optional().nullable(),
  subscriptionWelcomeMessage: z.string().max(500).optional().nullable(),
  publicSlug: z.string().min(3).max(32).optional().nullable(),
  sharePageEnabled: z.boolean().optional(),
  clientLinkEnabled: z.boolean().optional(),
  telegramDeliveryEnabled: z.boolean().optional(),
  sharePagePassword: z.string().max(128).optional().nullable(),
  sharePageAccessExpiresAt: z.date().optional().nullable(),
  tags: z.string().max(500).optional().nullable(),
  autoDisableOnLimit: z.boolean().optional(),
  autoDisableOnExpire: z.boolean().optional(),
  autoArchiveAfterDays: z.number().int().min(0).max(365).optional().nullable(),
  quotaAlertThresholds: z.string().optional().nullable(),
  autoRenewPolicy: z.enum(['NONE', 'EXTEND_DURATION']).optional(),
  autoRenewDurationDays: z.number().int().min(1).max(3650).optional().nullable(),
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
  subscriptionTheme: z.enum(subscriptionThemeIds).optional().nullable(),
  coverImage: z.string().url().optional().nullable(),
  coverImageType: z.enum(['url', 'gradient', 'upload']).optional().nullable(),
  contactLinks: z.string().optional().nullable(), // JSON string of contact links
  subscriptionWelcomeMessage: z.string().max(500).optional().nullable(),
  publicSlug: z.string().min(3).max(32).optional().nullable(),
  sharePageEnabled: z.boolean().optional(),
  clientLinkEnabled: z.boolean().optional(),
  telegramDeliveryEnabled: z.boolean().optional(),
  sharePagePassword: z.string().max(128).optional().nullable(),
  sharePageAccessExpiresAt: z.date().optional().nullable(),
  // New fields for tags and owner
  owner: z.string().max(100).optional().nullable(),
  tags: z.string().max(500).optional().nullable(), // Comma-separated tags, will be normalized
  // Bandwidth alert settings
  autoDisableOnLimit: z.boolean().optional(),
  autoDisableOnExpire: z.boolean().optional(),
  autoArchiveAfterDays: z.number().int().min(0).max(365).optional().nullable(),
  quotaAlertThresholds: z.string().optional().nullable(),
  autoRenewPolicy: z.enum(['NONE', 'EXTEND_DURATION']).optional(),
  autoRenewDurationDays: z.number().int().min(1).max(3650).optional().nullable(),
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

const accessDistributionLinkSchema = z.object({
  id: z.string(),
  label: z.string().trim().max(80).optional().nullable(),
  note: z.string().trim().max(280).optional().nullable(),
  expiresAt: z.date(),
  maxUses: z.number().int().min(1).max(1000).optional().nullable(),
  lang: z.string().optional().nullable(),
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

async function generateUniqueAccessKeySlug(name: string, excludeId?: string) {
  const baseSlug = slugifyPublicName(name);

  const buildCandidate = (suffix?: string) => {
    if (!suffix) {
      return baseSlug;
    }

    const maxBaseLength = Math.max(3, 32 - suffix.length - 1);
    return `${baseSlug.slice(0, maxBaseLength).replace(/-+$/g, '')}-${suffix}`;
  };

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const suffix = attempt === 0 ? '' : String(attempt);
    const candidate = buildCandidate(suffix || undefined);
    if (await isAccessKeySlugAvailable(candidate, excludeId)) {
      return candidate;
    }
  }

  while (true) {
    const candidate = buildCandidate(generateRandomString(6).toLowerCase());
    if (await isAccessKeySlugAvailable(candidate, excludeId)) {
      return candidate;
    }
  }
}

async function findAccessKeySlugConflict(slug: string, excludeId?: string) {
  const [accessExisting, dynamicExisting, historicalExisting] = await Promise.all([
    db.accessKey.findFirst({
      where: {
        publicSlug: slug,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    }),
    db.dynamicAccessKey.findFirst({
      where: { publicSlug: slug },
      select: { id: true },
    }),
    (db as any).accessKeySlugHistory.findUnique({
      where: { slug },
      select: { accessKeyId: true },
    }),
  ]);

  if (accessExisting) {
    return {
      type: 'accessKey' as const,
      ownerKeyId: accessExisting.id,
    };
  }

  if (dynamicExisting) {
    return {
      type: 'dynamicKey' as const,
      ownerKeyId: dynamicExisting.id,
    };
  }

  if (historicalExisting && historicalExisting.accessKeyId !== excludeId) {
    return {
      type: 'historicalAccessKey' as const,
      ownerKeyId: historicalExisting.accessKeyId,
    };
  }

  return null;
}

async function isAccessKeySlugAvailable(slug: string, excludeId?: string) {
  if (!slug || !isValidPublicSlug(slug) || isReservedPublicSlug(slug)) {
    return false;
  }

  const conflict = await findAccessKeySlugConflict(slug, excludeId);
  return !conflict;
}

async function buildAvailableAccessKeySlugSuggestions(
  value: string,
  excludeId?: string,
  limit = 5,
) {
  const suggestions: string[] = [];

  for (const candidate of buildPublicSlugSuggestionCandidates(value, 14)) {
    if (suggestions.length >= limit) {
      break;
    }

    if (await isAccessKeySlugAvailable(candidate, excludeId)) {
      suggestions.push(candidate);
    }
  }

  let suffix = 1;
  const normalizedBase = normalizePublicSlug(value) || slugifyPublicName(value);
  while (suggestions.length < limit && suffix <= 50) {
    const candidate = normalizePublicSlug(`${normalizedBase}-${suffix}`);
    suffix += 1;
    if (!candidate || suggestions.includes(candidate)) {
      continue;
    }
    if (await isAccessKeySlugAvailable(candidate, excludeId)) {
      suggestions.push(candidate);
    }
  }

  return suggestions;
}

async function recordAccessKeySlugHistory(
  tx: Prisma.TransactionClient,
  accessKeyId: string,
  previousSlug: string | null | undefined,
  nextSlug: string | null | undefined,
) {
  const normalizedPrevious = normalizePublicSlug(previousSlug ?? '');
  const normalizedNext = normalizePublicSlug(nextSlug ?? '');

  if (!normalizedPrevious || normalizedPrevious === normalizedNext) {
    return;
  }

  await (tx as any).accessKeySlugHistory.upsert({
    where: { slug: normalizedPrevious },
    update: {
      accessKeyId,
      createdAt: new Date(),
    },
    create: {
      accessKeyId,
      slug: normalizedPrevious,
    },
  });
}

async function resolveAccessKeySlug(requestedSlug: string | null | undefined, name: string, excludeId?: string) {
  if (!requestedSlug) {
    return generateUniqueAccessKeySlug(name, excludeId);
  }

  const normalizedSlug = normalizePublicSlug(requestedSlug);
  if (!normalizedSlug || !isValidPublicSlug(normalizedSlug)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Slug must use only lowercase letters, numbers, and hyphens.',
    });
  }

  if (isReservedPublicSlug(normalizedSlug)) {
    const suggestions = await buildAvailableAccessKeySlugSuggestions(normalizedSlug, excludeId, 3);
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: suggestions.length > 0
        ? `That short link is reserved. Try: ${suggestions.join(', ')}`
        : 'That short link is reserved.',
    });
  }

  const conflict = await findAccessKeySlugConflict(normalizedSlug, excludeId);
  if (conflict) {
    const suggestions = await buildAvailableAccessKeySlugSuggestions(normalizedSlug, excludeId, 3);
    throw new TRPCError({
      code: 'CONFLICT',
      message: suggestions.length > 0
        ? `That short link is already in use. Try: ${suggestions.join(', ')}`
        : 'That short link is already in use.',
    });
  }

  return normalizedSlug;
}

export const keysRouter = router({
  checkPublicSlugAvailability: adminProcedure
    .input(
      z.object({
        slug: z.string().min(1),
        excludeId: z.string().optional(),
      }),
    )
    .query(async ({ input }) => {
      const normalizedSlug = normalizePublicSlug(input.slug);

      if (!normalizedSlug || normalizedSlug.length < 3 || !isValidPublicSlug(normalizedSlug)) {
        return {
          normalizedSlug,
          available: false,
          valid: false,
          reserved: false,
          suggestions: [],
          message: 'Slug must be 3-32 characters and use only lowercase letters, numbers, and hyphens.',
        };
      }

      const reserved = isReservedPublicSlug(normalizedSlug);
      const conflict = reserved
        ? { type: 'reserved' as const, ownerKeyId: null }
        : await findAccessKeySlugConflict(normalizedSlug, input.excludeId);
      const suggestions =
        reserved || conflict
          ? await buildAvailableAccessKeySlugSuggestions(normalizedSlug, input.excludeId)
          : [];

      return {
        normalizedSlug,
        available: !reserved && !conflict,
        valid: true,
        reserved,
        reclaimedFromHistory: conflict?.type === 'historicalAccessKey' && conflict.ownerKeyId === input.excludeId,
        suggestions,
        message: reserved
          ? 'That short link is reserved.'
          : conflict
            ? 'That short link is already in use.'
            : 'This short link is available.',
      };
    }),

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

      // Quick filter: Traffic Active (recent observed traffic)
      if (online) {
        const onlineThreshold = new Date(Date.now() - TRAFFIC_ACTIVE_WINDOW_MS);
        where.status = 'ACTIVE';
        where.lastTrafficAt = {
          gte: onlineThreshold,
        };
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
          slugHistory: {
            take: 8,
            orderBy: { createdAt: 'desc' },
          },
          distributionLinks: {
            take: 12,
            orderBy: { createdAt: 'desc' },
          },
        },
      } as any);

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

      const nextToken = key.subscriptionToken || generateRandomString(32);
      const nextPublicSlug = key.publicSlug || await generateUniqueAccessKeySlug(key.name, key.id);

      if (!key.subscriptionToken || !key.publicSlug) {
        await db.accessKey.update({
          where: { id: input.id },
          data: {
            subscriptionToken: nextToken,
            publicSlug: nextPublicSlug,
          },
        });
      }

      const [supportActivity, openIncidents, auditTrail, billingHistory] = await Promise.all([
        db.auditLog.findMany({
          where: {
            entity: 'ACCESS_KEY',
            entityId: key.id,
            action: {
              in: [
                'TELEGRAM_SHARE_SENT',
                'ACCESS_KEY_RENEWAL_REMINDER_SENT',
                'ACCESS_KEY_SUPPORT_MESSAGE_SENT',
                'ACCESS_KEY_PROBLEM_REPORTED',
              ],
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 8,
          select: {
            id: true,
            action: true,
            details: true,
            createdAt: true,
          },
        }),
        db.incident.findMany({
          where: {
            sourceType: 'MANUAL',
            status: {
              in: ['OPEN', 'ACKNOWLEDGED'],
            },
            metadata: {
              contains: `"accessKeyId":"${key.id}"`,
            },
          },
          orderBy: { openedAt: 'desc' },
          take: 6,
          select: {
            id: true,
            title: true,
            severity: true,
            status: true,
            openedAt: true,
            assignedUserEmail: true,
          },
        }),
        db.auditLog.findMany({
          where: {
            entity: 'ACCESS_KEY',
            entityId: key.id,
          },
          orderBy: { createdAt: 'desc' },
          take: 12,
          select: {
            id: true,
            action: true,
            details: true,
            ip: true,
            createdAt: true,
            userId: true,
          },
        }),
        db.telegramOrder.findMany({
          where: {
            OR: [
              { targetAccessKeyId: key.id },
              { approvedAccessKeyId: key.id },
            ],
          },
          orderBy: { createdAt: 'desc' },
          take: 12,
          select: {
            id: true,
            orderCode: true,
            kind: true,
            status: true,
            planCode: true,
            planName: true,
            priceAmount: true,
            priceCurrency: true,
            paymentMethodCode: true,
            paymentMethodLabel: true,
            requestedEmail: true,
            retentionSource: true,
            reviewedAt: true,
            fulfilledAt: true,
            rejectedAt: true,
            createdAt: true,
            reviewedBy: {
              select: {
                email: true,
              },
            },
          },
        }),
      ]);

      return {
        ...key,
        subscriptionToken: nextToken,
        publicSlug: nextPublicSlug,
        accessUrl: decorateOutlineAccessUrl(key.accessUrl, key.name),
        distributionLinks: (key as any).distributionLinks ?? [],
        supportActivity: supportActivity.map((entry) => ({
          ...entry,
          details: entry.details ? JSON.parse(entry.details) : null,
        })),
        auditTrail: auditTrail.map((entry) => ({
          ...entry,
          details: entry.details ? JSON.parse(entry.details) : null,
        })),
        billingHistory: billingHistory.map((order) => ({
          ...order,
          reviewedByEmail: order.reviewedBy?.email || null,
        })),
        openIncidents,
      };
    }),

  /**
   * Get recent traffic diagnostics for a single access key.
   *
   * This powers the "Traffic Active" UI with a fresher server-side snapshot
   * without forcing the detail page to infer presence from older page data.
   */
  getActivitySnapshot: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const key = await db.accessKey.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          userId: true,
          status: true,
          lastTrafficAt: true,
          lastUsedAt: true,
          estimatedDevices: true,
          peakDevices: true,
          outlineKeyId: true,
        },
      });

      if (!key) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Access key not found',
        });
      }

      if (ctx.user.role !== 'ADMIN' && key.userId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to view this key',
        });
      }

      const [collectorResult, activeSessions] = await Promise.all([
        collectTrafficActivity({ keyIds: [input.id], persist: false }),
        db.connectionSession.count({
          where: {
            accessKeyId: input.id,
            isActive: true,
          },
        }),
      ]);

      const observedKey = collectorResult.accessKeys.find((item) => item.id === input.id);
      const refreshedKey = await db.accessKey.findUnique({
        where: { id: input.id },
        select: {
          lastTrafficAt: true,
          lastUsedAt: true,
          estimatedDevices: true,
          peakDevices: true,
        },
      });

      const lastTrafficAt = observedKey?.lastTrafficAt ?? refreshedKey?.lastTrafficAt ?? key.lastTrafficAt;
      const lastUsedAt = refreshedKey?.lastUsedAt ?? key.lastUsedAt;
      const estimatedDevices = refreshedKey?.estimatedDevices ?? key.estimatedDevices;
      const peakDevices = refreshedKey?.peakDevices ?? key.peakDevices;

      return {
        id: key.id,
        status: key.status,
        outlineKeyId: key.outlineKeyId,
        lastTrafficAt: lastTrafficAt?.toISOString() ?? null,
        lastUsedAt: lastUsedAt?.toISOString() ?? null,
        isTrafficActive: observedKey
          ? observedKey.isTrafficActive
          : isTrafficActive(lastTrafficAt, collectorResult.now),
        recentTrafficDeltaBytes: (observedKey?.recentTrafficDeltaBytes ?? BigInt(0)).toString(),
        activeSessions,
        estimatedDevices,
        peakDevices,
        activityWindowSeconds: Math.round(TRAFFIC_ACTIVE_WINDOW_MS / 1000),
      };
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
    .mutation(async ({ ctx, input }) => {
      let targetServerId = input.serverId ?? null;

      if (input.assignmentMode === 'AUTO') {
        const recommendedServer = await selectLeastLoadedServer();
        if (!recommendedServer) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'No assignable server is available for automatic placement.',
          });
        }

        targetServerId = recommendedServer.serverId;
      }

      if (!targetServerId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Please select a server or use automatic placement.',
        });
      }

      // Fetch the server
      const server = await db.server.findUnique({
        where: { id: targetServerId },
      });

      if (!server) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Server not found',
        });
      }

      const assignmentCheck = canAssignKeysToServer(server);
      if (!assignmentCheck.allowed) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: assignmentCheck.reason,
        });
      }

      // Create Outline client
      const client = createOutlineClient(server.apiUrl, server.apiCertSha256);

      const publicSlug = await resolveAccessKeySlug(input.publicSlug, input.name);

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
            serverId: targetServerId,
            accessUrl: decorateOutlineAccessUrl(outlineKey.accessUrl, input.name),
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
            subscriptionTheme: input.subscriptionTheme,
            coverImage: input.coverImage,
            coverImageType: input.coverImageType,
            contactLinks: input.contactLinks,
            subscriptionWelcomeMessage: input.subscriptionWelcomeMessage,
            sharePageEnabled: input.sharePageEnabled ?? true,
            clientLinkEnabled: input.clientLinkEnabled ?? true,
            telegramDeliveryEnabled: input.telegramDeliveryEnabled ?? true,
            sharePagePasswordHash: hasSharePagePassword(input.sharePagePassword)
              ? hashSharePagePassword(input.sharePagePassword!)
              : null,
            sharePageAccessExpiresAt: input.sharePageAccessExpiresAt ?? null,
            autoDisableOnLimit: input.autoDisableOnLimit ?? true,
            autoDisableOnExpire: input.autoDisableOnExpire ?? true,
            autoArchiveAfterDays: input.autoArchiveAfterDays ?? 0,
            quotaAlertThresholds: stringifyQuotaAlertThresholds(input.quotaAlertThresholds),
            quotaAlertsSent: '[]',
            autoRenewPolicy: input.autoRenewPolicy ?? 'NONE',
            autoRenewDurationDays: input.autoRenewDurationDays ?? null,
            subscriptionToken: generateRandomString(32),
            publicSlug,
            tags: mergeTagsForStorage(input.tags, 'web'),
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

        await writeAuditLog({
          userId: ctx.user.id,
          ip: ctx.clientIp,
          action: 'ACCESS_KEY_CREATED',
          entity: 'ACCESS_KEY',
          entityId: accessKey.id,
          details: {
            serverId: targetServerId,
            sharePageEnabled: accessKey.sharePageEnabled,
            clientLinkEnabled: accessKey.clientLinkEnabled,
            telegramDeliveryEnabled: accessKey.telegramDeliveryEnabled,
            publicSlug: accessKey.publicSlug,
          },
        });

        void sendAccessKeyLifecycleTelegramNotification({
          accessKeyId: accessKey.id,
          type: 'CREATED',
        }).catch((notificationError) => {
          logger.warn('Failed to send Telegram create notification', notificationError);
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
    .mutation(async ({ ctx, input }) => {
      const { id, publicSlug, ...data } = input;
      let resolvedPublicSlug: string | undefined;

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

        if (
          data.expirationType !== undefined ||
          data.expiresAt !== undefined ||
          data.durationDays !== undefined
        ) {
          updateData.expirationWarningStage = null;
          updateData.lastWarningSentAt = null;
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

        if (data.subscriptionWelcomeMessage !== undefined) {
          updateData.subscriptionWelcomeMessage = data.subscriptionWelcomeMessage;
        }

        if (publicSlug !== undefined) {
          resolvedPublicSlug = await resolveAccessKeySlug(publicSlug, data.name || existingKey.name, id);
          updateData.publicSlug = resolvedPublicSlug;
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

        if (data.autoDisableOnExpire !== undefined) {
          updateData.autoDisableOnExpire = data.autoDisableOnExpire;
        }

        if (data.autoArchiveAfterDays !== undefined) {
          updateData.autoArchiveAfterDays = data.autoArchiveAfterDays ?? 0;
        }

        if (data.quotaAlertThresholds !== undefined) {
          updateData.quotaAlertThresholds = stringifyQuotaAlertThresholds(data.quotaAlertThresholds);
          updateData.quotaAlertsSent = '[]';
        }

        if (data.autoRenewPolicy !== undefined) {
          updateData.autoRenewPolicy = data.autoRenewPolicy;
        }

        if (data.autoRenewDurationDays !== undefined) {
          updateData.autoRenewDurationDays = data.autoRenewDurationDays;
        }

        if (data.sharePageEnabled !== undefined) {
          updateData.sharePageEnabled = data.sharePageEnabled;
        }

        if (data.clientLinkEnabled !== undefined) {
          updateData.clientLinkEnabled = data.clientLinkEnabled;
        }

        if (data.telegramDeliveryEnabled !== undefined) {
          updateData.telegramDeliveryEnabled = data.telegramDeliveryEnabled;
        }

        if (data.sharePagePassword !== undefined) {
          updateData.sharePagePasswordHash = hasSharePagePassword(data.sharePagePassword)
            ? hashSharePagePassword(data.sharePagePassword!)
            : null;
        }

        if (data.sharePageAccessExpiresAt !== undefined) {
          updateData.sharePageAccessExpiresAt = data.sharePageAccessExpiresAt ?? null;
        }

        // Reset bandwidth alert flags when data limit changes
        if (data.dataLimitGB !== undefined) {
          updateData.bandwidthAlertAt80 = false;
          updateData.bandwidthAlertAt90 = false;
          updateData.quotaAlertsSent = '[]';
        }

        // Update the database record
        const accessKey = await db.$transaction(async (tx) => {
          if (resolvedPublicSlug && resolvedPublicSlug !== existingKey.publicSlug) {
            await recordAccessKeySlugHistory(tx, id, existingKey.publicSlug, resolvedPublicSlug);
            await (tx as any).accessKeySlugHistory.deleteMany({
              where: {
                accessKeyId: id,
                slug: resolvedPublicSlug,
              },
            });
          }

          return tx.accessKey.update({
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
        });

        if (data.status && data.status !== existingKey.status) {
          if (data.status === 'DISABLED') {
            void sendAccessKeyLifecycleTelegramNotification({
              accessKeyId: accessKey.id,
              type: 'DISABLED',
            }).catch((notificationError) => {
              logger.warn('Failed to send Telegram disabled notification', notificationError);
            });
          }

          if (data.status === 'ACTIVE' && existingKey.status === 'DISABLED') {
            void sendAccessKeyLifecycleTelegramNotification({
              accessKeyId: accessKey.id,
              type: 'ENABLED',
            }).catch((notificationError) => {
              logger.warn('Failed to send Telegram enabled notification', notificationError);
            });
          }
        }

        await writeAuditLog({
          userId: ctx.user.id,
          ip: ctx.clientIp,
          action: 'ACCESS_KEY_UPDATED',
          entity: 'ACCESS_KEY',
          entityId: accessKey.id,
          details: {
            updatedFields: Object.keys(updateData),
            publicSlug: accessKey.publicSlug,
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
          accessUrl: decorateOutlineAccessUrl(key.accessUrl, key.name),
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

      const accessUrl = decorateOutlineAccessUrl(key?.accessUrl, key?.name);

      if (!key || !accessUrl) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Access key not found or has no access URL',
        });
      }

      try {
        // Generate QR code as base64 PNG
        const qrCode = await QRCode.toDataURL(accessUrl, {
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
        const assignmentCheck = canAssignKeysToServer(server);
        if (!assignmentCheck.allowed) {
          results.failed += input.count;
          results.errors.push(`${server.name}: ${assignmentCheck.reason}`);
          continue;
        }

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
                accessUrl: decorateOutlineAccessUrl(outlineKey.accessUrl, keyName),
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
            const assignmentCheck = canAssignKeysToServer(key.server);
            if (!assignmentCheck.allowed) {
              throw new Error(assignmentCheck.reason);
            }

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
                accessUrl: decorateOutlineAccessUrl(newOutlineKey.accessUrl, key.name),
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
              data: { isActive: false, endedAt: new Date(), endedReason: 'KEY_DISABLED' },
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
              accessUrl: decorateOutlineAccessUrl(key.accessUrl, key.name),
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
        const assignmentCheck = canAssignKeysToServer(key.server);
        if (!assignmentCheck.allowed) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: assignmentCheck.reason,
          });
        }

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
              accessUrl: decorateOutlineAccessUrl(newOutlineKey.accessUrl, key.name),
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

          void sendAccessKeyLifecycleTelegramNotification({
            accessKeyId: updatedKey.id,
            type: 'ENABLED',
          }).catch((notificationError) => {
            logger.warn('Failed to send Telegram enabled notification', notificationError);
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

        void sendAccessKeyLifecycleTelegramNotification({
          accessKeyId: updatedKey.id,
          type: 'DISABLED',
        }).catch((notificationError) => {
          logger.warn('Failed to send Telegram disabled notification', notificationError);
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
            endedReason: 'KEY_ARCHIVED',
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
          publicSlug: true,
        },
      });

      if (!key) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Access key not found',
        });
      }

      let token = key.subscriptionToken;
      let publicSlug = key.publicSlug;
      if (!token || !publicSlug) {
        token = token || generateRandomString(32);
        publicSlug = publicSlug || await generateUniqueAccessKeySlug(key.name, key.id);
        await db.accessKey.update({
          where: { id: input.id },
          data: {
            subscriptionToken: token,
            publicSlug,
          },
        });
      }

      return {
        subscriptionUrl: buildSubscriptionApiUrl(token),
        sharePageUrl: publicSlug ? buildShortShareUrl(publicSlug) : buildSharePageUrl(token),
        shortSharePageUrl: publicSlug ? buildShortShareUrl(publicSlug) : null,
        shortClientUrl: publicSlug ? buildShortClientUrl(publicSlug) : null,
        accessUrl: decorateOutlineAccessUrl(key.accessUrl, key.name),
        token,
        publicSlug,
      };
    }),

  updateShareProtection: adminProcedure
    .input(
      z.object({
        id: z.string(),
        password: z.string().max(128).optional().nullable(),
        clearPassword: z.boolean().optional(),
        accessExpiresAt: z.date().optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await db.accessKey.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          sharePagePasswordHash: true,
          sharePageAccessExpiresAt: true,
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Access key not found',
        });
      }

      const nextPasswordHash = input.clearPassword
        ? null
        : input.password !== undefined
          ? (typeof input.password === 'string' && hasSharePagePassword(input.password)
              ? hashSharePagePassword(input.password)
              : null)
          : existing.sharePagePasswordHash;
      const nextExpiry = input.accessExpiresAt !== undefined
        ? input.accessExpiresAt ?? null
        : existing.sharePageAccessExpiresAt;

      const updated = await db.accessKey.update({
        where: { id: input.id },
        data: {
          sharePagePasswordHash: nextPasswordHash,
          sharePageAccessExpiresAt: nextExpiry,
        },
        select: {
          id: true,
          sharePageAccessExpiresAt: true,
          sharePagePasswordHash: true,
        },
      });

      await writeAuditLog({
        userId: ctx.user.id,
        ip: ctx.clientIp,
        action: 'ACCESS_KEY_SHARE_PROTECTION_UPDATED',
        entity: 'ACCESS_KEY',
        entityId: input.id,
        details: {
          passwordProtected: Boolean(updated.sharePagePasswordHash),
          accessExpiresAt: updated.sharePageAccessExpiresAt?.toISOString() ?? null,
          clearedPassword: Boolean(input.clearPassword),
        },
      });

      return {
        ...updated,
        hasPassword: Boolean(updated.sharePagePasswordHash),
      };
    }),

  createDistributionLink: adminProcedure
    .input(accessDistributionLinkSchema)
    .mutation(async ({ ctx, input }) => {
      const key = await db.accessKey.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          name: true,
        },
      });

      if (!key) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Access key not found',
        });
      }

      const link = await db.accessDistributionLink.create({
        data: {
          accessKeyId: input.id,
          token: generateRandomString(32),
          label: input.label || null,
          note: input.note || null,
          expiresAt: input.expiresAt,
          maxUses: input.maxUses ?? null,
        },
      });

      const url = buildAccessDistributionLinkUrl(link.token, {
        lang: input.lang,
      });

      await writeAuditLog({
        userId: ctx.user.id,
        ip: ctx.clientIp,
        action: 'ACCESS_KEY_DISTRIBUTION_LINK_CREATED',
        entity: 'ACCESS_KEY',
        entityId: input.id,
        details: {
          linkId: link.id,
          label: link.label,
          expiresAt: link.expiresAt.toISOString(),
          maxUses: link.maxUses,
          url,
        },
      });

      return {
        ...link,
        url,
      };
    }),

  revokeDistributionLink: adminProcedure
    .input(
      z.object({
        id: z.string(),
        linkId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const link = await db.accessDistributionLink.findFirst({
        where: {
          id: input.linkId,
          accessKeyId: input.id,
        },
        select: {
          id: true,
          token: true,
          label: true,
        },
      });

      if (!link) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Distribution link not found',
        });
      }

      await db.accessDistributionLink.delete({
        where: { id: link.id },
      });

      await writeAuditLog({
        userId: ctx.user.id,
        ip: ctx.clientIp,
        action: 'ACCESS_KEY_DISTRIBUTION_LINK_REVOKED',
        entity: 'ACCESS_KEY',
        entityId: input.id,
        details: {
          linkId: link.id,
          label: link.label,
          token: link.token,
        },
      });

      return { success: true };
    }),

  /**
   * Regenerate the public subscription/share page token for a key.
   *
   * This immediately invalidates the previous shared link.
   */
  regenerateSubscriptionToken: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const key = await db.accessKey.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          subscriptionToken: true,
        },
      });

      if (!key) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Access key not found',
        });
      }

      const token = generateRandomString(32);
      await db.accessKey.update({
        where: { id: input.id },
        data: { subscriptionToken: token },
      });

      await writeAuditLog({
        userId: ctx.user.id,
        ip: ctx.clientIp,
        action: 'ACCESS_KEY_SHARE_TOKEN_REGENERATED',
        entity: 'ACCESS_KEY',
        entityId: input.id,
        details: { token },
      });

      return {
        token,
        sharePageUrl: buildSharePageUrl(token),
      };
    }),

  regeneratePublicSlug: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await db.accessKey.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          name: true,
          subscriptionToken: true,
          publicSlug: true,
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Access key not found',
        });
      }

      const publicSlug = await generateUniqueAccessKeySlug(existing.name, existing.id);
      const key = await db.$transaction(async (tx) => {
        await recordAccessKeySlugHistory(tx, existing.id, existing.publicSlug, publicSlug);
        await (tx as any).accessKeySlugHistory.deleteMany({
          where: {
            accessKeyId: existing.id,
            slug: publicSlug,
          },
        });

        return tx.accessKey.update({
          where: { id: input.id },
          data: { publicSlug },
          select: {
            id: true,
            publicSlug: true,
            subscriptionToken: true,
          },
        });
      });

      await writeAuditLog({
        userId: ctx.user.id,
        ip: ctx.clientIp,
        action: 'ACCESS_KEY_PUBLIC_SLUG_REGENERATED',
        entity: 'ACCESS_KEY',
        entityId: input.id,
        details: {
          publicSlug,
        },
      });

      return {
        ...key,
        sharePageUrl: buildShortShareUrl(publicSlug),
        shortClientUrl: buildShortClientUrl(publicSlug),
      };
    }),

  generateTelegramConnectLink: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const key = await db.accessKey.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          telegramDeliveryEnabled: true,
        },
      });

      if (!key) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Access key not found',
        });
      }

      if (!key.telegramDeliveryEnabled) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Telegram delivery is disabled for this key.',
        });
      }

      try {
        return await createAccessKeyTelegramConnectLink({
          accessKeyId: input.id,
          createdByUserId: ctx.user.id,
        });
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: (error as Error).message,
        });
      }
    }),

  sendSharePageViaTelegram: adminProcedure
    .input(
      z.object({
        id: z.string(),
        reason: z
          .enum(['CREATED', 'RESENT', 'LINKED', 'KEY_ENABLED', 'USAGE_REQUEST', 'SUBSCRIPTION_REQUEST'])
          .optional(),
        chatId: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const key = await db.accessKey.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          telegramDeliveryEnabled: true,
        },
      });

      if (!key) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Access key not found',
        });
      }

      if (!key.telegramDeliveryEnabled) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Telegram delivery is disabled for this key.',
        });
      }

      try {
        return await sendAccessKeySharePageToTelegram({
          accessKeyId: input.id,
          chatId: input.chatId,
          reason: input.reason,
          source: 'dashboard',
        });
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: (error as Error).message,
        });
      }
    }),

  resendAccess: adminProcedure
    .input(
      z.object({
        id: z.string(),
        chatId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const key = await db.accessKey.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          telegramDeliveryEnabled: true,
        },
      });

      if (!key) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Access key not found',
        });
      }

      if (!key.telegramDeliveryEnabled) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Telegram delivery is disabled for this key.',
        });
      }

      try {
        const result = await sendAccessKeySharePageToTelegram({
          accessKeyId: input.id,
          chatId: input.chatId,
          reason: 'RESENT',
          source: 'dashboard_support',
        });

        await writeAuditLog({
          userId: ctx.user.id,
          ip: ctx.clientIp,
          action: 'ACCESS_KEY_ACCESS_RESENT',
          entity: 'ACCESS_KEY',
          entityId: input.id,
          details: {
            destinationChatId: result.destinationChatId,
            sharePageUrl: result.sharePageUrl,
          },
        });

        return result;
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: (error as Error).message,
        });
      }
    }),

  sendRenewalReminder: adminProcedure
    .input(
      z.object({
        id: z.string(),
        chatId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await sendAccessKeyRenewalReminder({
          accessKeyId: input.id,
          chatId: input.chatId,
          source: 'dashboard_support',
        });

        await writeAuditLog({
          userId: ctx.user.id,
          ip: ctx.clientIp,
          action: 'ACCESS_KEY_RENEWAL_REMINDER_TRIGGERED',
          entity: 'ACCESS_KEY',
          entityId: input.id,
          details: {
            destinationChatId: result.destinationChatId,
          },
        });

        return result;
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: (error as Error).message,
        });
      }
    }),

  sendSupportMessage: adminProcedure
    .input(
      z.object({
        id: z.string(),
        message: z.string().trim().min(1).max(1500),
        chatId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await sendAccessKeySupportMessage({
          accessKeyId: input.id,
          message: input.message,
          chatId: input.chatId,
          source: 'dashboard_support',
        });

        await writeAuditLog({
          userId: ctx.user.id,
          ip: ctx.clientIp,
          action: 'ACCESS_KEY_SUPPORT_MESSAGE_TRIGGERED',
          entity: 'ACCESS_KEY',
          entityId: input.id,
          details: {
            destinationChatId: result.destinationChatId,
            message: input.message,
          },
        });

        return result;
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: (error as Error).message,
        });
      }
    }),

  reportProblem: adminProcedure
    .input(
      z.object({
        id: z.string(),
        severity: z.enum(['critical', 'warning', 'info']).default('warning'),
        summary: z.string().trim().min(1).max(1500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const key = await db.accessKey.findUnique({
        where: { id: input.id },
        include: {
          server: {
            select: {
              id: true,
              name: true,
              countryCode: true,
            },
          },
          user: {
            select: {
              email: true,
            },
          },
        },
      });

      if (!key) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Access key not found',
        });
      }

      const metadata = {
        accessKeyId: key.id,
        accessKeyName: key.name,
        serverId: key.serverId,
        serverName: key.server?.name ?? null,
        keyEmail: key.email,
        userEmail: key.user?.email ?? null,
      };

      const incident = await db.incident.create({
        data: {
          sourceType: 'MANUAL',
          serverId: key.serverId,
          title: `Access key issue: ${key.name}`,
          summary: input.summary,
          severity: input.severity,
          status: 'OPEN',
          countryCode: key.server?.countryCode ?? null,
          affectedKeyCount: 1,
          affectedUserCount: key.email || key.user?.email ? 1 : 0,
          metadata: JSON.stringify(metadata),
        },
      });

      await db.incidentEvent.create({
        data: {
          incidentId: incident.id,
          type: 'OPENED',
          severity: input.severity,
          title: `Problem reported for ${key.name}`,
          message: input.summary,
          details: JSON.stringify(metadata),
          actorUserId: ctx.user.id,
          actorEmail: ctx.user.email,
        },
      });

      await writeAuditLog({
        userId: ctx.user.id,
        ip: ctx.clientIp,
        action: 'ACCESS_KEY_PROBLEM_REPORTED',
        entity: 'ACCESS_KEY',
        entityId: key.id,
        details: {
          incidentId: incident.id,
          severity: input.severity,
          summary: input.summary,
        },
      });

      return {
        incidentId: incident.id,
        status: incident.status,
      };
    }),

  replaceServer: adminProcedure
    .input(
      z.object({
        id: z.string(),
        targetServerId: z.string(),
        notifyUser: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const key = await db.accessKey.findUnique({
          where: { id: input.id },
          include: {
            server: true,
            user: {
              select: {
                id: true,
                email: true,
                telegramChatId: true,
              },
            },
          },
        });

        if (!key) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Access key not found',
          });
        }

        const { updatedKey, sourceServer, targetServer } = await replaceAccessKeyServer(
          input.id,
          input.targetServerId,
        );

        if (!updatedKey) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Access key replacement completed but the updated key could not be loaded.',
          });
        }

        if (input.notifyUser && key.telegramDeliveryEnabled) {
          try {
            await sendAccessKeySharePageToTelegram({
              accessKeyId: updatedKey.id,
              chatId: key.telegramId || key.user?.telegramChatId || undefined,
              reason: 'RESENT',
              source: 'dashboard_server_replace',
            });
          } catch (error) {
            logger.warn(
              `Failed to notify Telegram user for replaced access key ${key.id}: ${
                (error as Error).message
              }`,
            );
          }
        }

        await writeAuditLog({
          userId: ctx.user.id,
          ip: ctx.clientIp,
          action: 'ACCESS_KEY_SERVER_REPLACED',
          entity: 'ACCESS_KEY',
          entityId: key.id,
          details: {
            sourceServerId: sourceServer.id,
            sourceServerName: sourceServer.name,
            targetServerId: targetServer.id,
            targetServerName: targetServer.name,
            serverChangeCount: key.serverChangeCount + 1,
            serverChangeLimit: key.serverChangeLimit,
            notifyUser: input.notifyUser,
          },
        });

        return {
          success: true,
          keyId: updatedKey.id,
          keyName: updatedKey.name,
          targetServerId: targetServer.id,
          targetServerName: targetServer.name,
          serverChangeCount: updatedKey.serverChangeCount,
          serverChangeLimit: updatedKey.serverChangeLimit,
          remainingChanges: Math.max(0, updatedKey.serverChangeLimit - updatedKey.serverChangeCount),
        };
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: (error as Error).message || 'Failed to replace server for this key.',
        });
      }
    }),

  getSharePageAnalytics: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const key = await db.accessKey.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          userId: true,
        },
      });

      if (!key) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Access key not found',
        });
      }

      if (ctx.user.role !== 'ADMIN' && key.userId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to view this key',
        });
      }

      return getAccessKeySubscriptionAnalytics(input.id);
    }),

  getHealthDiagnostics: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const key = await db.accessKey.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          userId: true,
          status: true,
          lastTrafficAt: true,
          lastUsedAt: true,
          usedBytes: true,
          estimatedDevices: true,
        },
      });

      if (!key) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Access key not found',
        });
      }

      if (ctx.user.role !== 'ADMIN' && key.userId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to view this key',
        });
      }

      const [analytics, activeSessionCount, latestDeviceEvent] = await Promise.all([
        getAccessKeySubscriptionAnalytics(input.id),
        db.connectionSession.count({
          where: {
            accessKeyId: input.id,
            isActive: true,
          },
        }),
        db.subscriptionPageEvent.findFirst({
          where: {
            accessKeyId: input.id,
            ip: { not: null },
          },
          orderBy: { createdAt: 'desc' },
          select: {
            ip: true,
            platform: true,
            userAgent: true,
            createdAt: true,
          },
        }),
      ]);

      const geo = await getGeoIpCountry(latestDeviceEvent?.ip);
      const active = activeSessionCount > 0 || isTrafficActive(key.lastTrafficAt, new Date());

      return {
        lastClientFetchAt: analytics.lastClientFetchAt,
        lastQrScanAt: analytics.lastQrScanAt,
        lastSharePageVisitAt: analytics.lastViewedAt,
        lastTelegramSendAt: analytics.lastTelegramSentAt,
        lastCopyAt: analytics.lastCopiedAt,
        lastSeenIp: geo.ip,
        lastSeenCountryCode: geo.countryCode,
        lastSeenPlatform: latestDeviceEvent?.platform ?? null,
        lastSeenUserAgent: latestDeviceEvent?.userAgent ?? null,
        activeSessionCount,
        estimatedDevices: key.estimatedDevices,
        lastTrafficAt: key.lastTrafficAt,
        lastUsedAt: key.lastUsedAt,
        usedBytes: key.usedBytes.toString(),
        status: key.status,
        isActivelyUsed: active,
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
          decorateOutlineAccessUrl(key.accessUrl, key.name) || '',
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
          accessUrl: decorateOutlineAccessUrl(key.accessUrl, key.name),
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
    const [total, active, expired, depleted, pending, tagRows] = await Promise.all([
      db.accessKey.count(),
      db.accessKey.count({ where: { status: 'ACTIVE' } }),
      db.accessKey.count({ where: { status: 'EXPIRED' } }),
      db.accessKey.count({ where: { status: 'DEPLETED' } }),
      db.accessKey.count({ where: { status: 'PENDING' } }),
      db.accessKey.findMany({
        select: {
          tags: true,
        },
      }),
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
    const tagSummary = summarizeStoredTags(tagRows.map((row) => row.tags));

    return {
      total,
      active,
      expired,
      depleted,
      pending,
      expiringIn24h,
      totalUsedBytes,
      totalDataLimitBytes,
      sourceCounts: tagSummary.sourceCounts,
      topTags: tagSummary.topTags,
    };
  }),

  /**
   * Get traffic-active users (keys with recent observed traffic).
   */
  getOnlineUsers: protectedProcedure.query(async () => {
    const now = new Date();
    const onlineThreshold = new Date(now.getTime() - TRAFFIC_ACTIVE_WINDOW_MS);

    const activeKeys = await db.accessKey.findMany({
      where: {
        status: 'ACTIVE',
        lastTrafficAt: {
          gte: onlineThreshold,
        },
      },
      select: {
        id: true,
        usedBytes: true,
        lastUsedAt: true,
        lastTrafficAt: true,
        estimatedDevices: true,
      },
    });

    return activeKeys.map(key => ({
      id: key.id,
      usedBytes: key.usedBytes.toString(),
      lastUsedAt: key.lastUsedAt?.toISOString() || null,
      isOnline: isTrafficActive(key.lastTrafficAt, now),
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

      const subscriptionEvents = await db.subscriptionPageEvent.findMany({
        where: {
          accessKeyId: input.keyId,
          ip: { not: null },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          ip: true,
          userAgent: true,
          createdAt: true,
          platform: true,
        },
      });

      const uniqueDevices = new Map<
        string,
        {
          ip: string | null;
          userAgent: string | null;
          platform: string | null;
          lastSeenAt: Date;
          countryCode: string | null;
        }
      >();

      for (const event of subscriptionEvents) {
        if (!event.ip || uniqueDevices.has(event.ip)) {
          continue;
        }

        const geo = await getGeoIpCountry(event.ip);
        uniqueDevices.set(event.ip, {
          ip: geo.ip,
          userAgent: event.userAgent,
          platform: event.platform,
          lastSeenAt: event.createdAt,
          countryCode: geo.countryCode,
        });
      }

      return {
        sessions: sessionsWithDuration,
        activeCount: sessions.filter((s) => s.isActive).length,
        estimatedDevices: key.estimatedDevices,
        peakDevices: key.peakDevices,
        subscriberDevices: Array.from(uniqueDevices.values()),
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
   * Traffic-active status comes from recent observed traffic, while usedBytes is
   * refreshed directly from Outline for responsive UI updates.
   */
  getLiveMetrics: protectedProcedure.query(async () => {
    const result = await collectTrafficActivity({ persist: false });

    return result.accessKeys.map((key) => ({
      id: key.id,
      usedBytes: key.usedBytes.toString(),
      isOnline: key.isTrafficActive,
      lastTrafficAt: key.lastTrafficAt?.toISOString() ?? null,
      recentTrafficDeltaBytes: key.recentTrafficDeltaBytes.toString(),
    }));
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

      const assignmentCheck = canAssignKeysToServer(targetServer);
      if (!assignmentCheck.allowed) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: assignmentCheck.reason });
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
              accessUrl: decorateOutlineAccessUrl(newKey.accessUrl, key.name),
              password: newKey.password,
              port: newKey.port,
              method: newKey.method,
              usageOffset: -key.usedBytes,
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

  /**
   * Get 7-day sparkline data for a batch of access keys.
   *
   * Aggregates TrafficLog deltaBytes per day for the last 7 days.
   * Returns a map of keyId → daily data points.
   */
  getSparklines: protectedProcedure
    .input(z.object({
      keyIds: z.array(z.string()).max(100),
    }))
    .query(async ({ input }) => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const logs = await db.trafficLog.findMany({
        where: {
          accessKeyId: { in: input.keyIds },
          recordedAt: { gte: sevenDaysAgo },
        },
        orderBy: { recordedAt: 'asc' },
        select: {
          accessKeyId: true,
          deltaBytes: true,
          recordedAt: true,
        },
      });

      // Group by keyId and aggregate per day
      const sparklines: Record<string, { date: string; bytes: number }[]> = {};

      for (const log of logs) {
        const day = log.recordedAt.toISOString().split('T')[0];
        if (!sparklines[log.accessKeyId]) {
          sparklines[log.accessKeyId] = [];
        }
        const existing = sparklines[log.accessKeyId].find((d) => d.date === day);
        if (existing) {
          existing.bytes += Number(log.deltaBytes);
        } else {
          sparklines[log.accessKeyId].push({ date: day, bytes: Number(log.deltaBytes) });
        }
      }

      return sparklines;
    }),
});
