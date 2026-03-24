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
import { decorateOutlineAccessUrl } from '@/lib/outline-access-url';
import { subscriptionThemeIds } from '@/lib/subscription-themes';
import { slugifyPublicName, normalizePublicSlug, isValidPublicSlug } from '@/lib/public-slug';
import {
  buildDynamicOutlineUrl,
  buildDynamicSharePageUrl,
  buildDynamicShortShareUrl,
} from '@/lib/subscription-links';
import {
  collectTrafficActivity,
  TRAFFIC_ACTIVE_WINDOW_MS,
} from '@/lib/services/traffic-activity';
import {
  getDynamicRoutingAlgorithmHint,
  getDynamicRoutingAlgorithmLabel,
  getSelfManagedServerCandidate,
  normalizeDynamicRoutingPreferences,
  parseDynamicRoutingPreferences,
  rankDynamicAccessKeyCandidates,
  rankDynamicServerCandidates,
  resolveDynamicPinState,
  selectDynamicAccessKeyForClient,
} from '@/lib/services/dynamic-subscription-routing';
import { getDynamicKeySubscriptionAnalytics } from '@/lib/services/subscription-events';
import {
  DYNAMIC_ROUTING_EVENT_TYPES,
  getDynamicRoutingAlerts,
  getDynamicRoutingTimeline,
  recordDynamicRoutingEvent,
} from '@/lib/services/dynamic-routing-events';
import {
  createDynamicKeyTelegramConnectLink,
  sendDynamicKeySharePageToTelegram,
} from '@/lib/services/telegram-bot';

const routingWeightsSchema = z.record(z.number().positive()).optional();
const sessionStickinessSchema = z.enum(['NONE', 'DRAIN']).default('DRAIN');
const rotationTriggerSchema = z.enum(['SCHEDULED', 'USAGE', 'HEALTH', 'COMBINED']).default('SCHEDULED');

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
  loadBalancerAlgorithm: z.enum(['IP_HASH', 'RANDOM', 'ROUND_ROBIN', 'LEAST_LOAD']).default('IP_HASH'),
  preferredServerIds: z.array(z.string()).optional(),
  preferredCountryCodes: z.array(z.string()).optional(),
  preferredServerWeights: routingWeightsSchema,
  preferredCountryWeights: routingWeightsSchema,
  preferredRegionMode: z.enum(['PREFER', 'ONLY']).default('PREFER'),
  sessionStickinessMode: sessionStickinessSchema,
  drainGraceMinutes: z.number().int().min(1).max(240).default(20),
  publicSlug: z.string().min(3).max(32).optional().nullable(),
  subscriptionWelcomeMessage: z.string().max(500).optional().nullable(),
  sharePageEnabled: z.boolean().optional(),
  rotationEnabled: z.boolean().optional(),
  rotationInterval: z.enum(['NEVER', 'DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY']).optional(),
  rotationTriggerMode: rotationTriggerSchema,
  rotationUsageThresholdPercent: z.number().int().min(50).max(100).default(85),
  rotateOnHealthFailure: z.boolean().optional(),
  appliedTemplateId: z.string().optional().nullable(),
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
  loadBalancerAlgorithm: z.enum(['IP_HASH', 'RANDOM', 'ROUND_ROBIN', 'LEAST_LOAD']).optional(),
  preferredServerIds: z.array(z.string()).optional(),
  preferredCountryCodes: z.array(z.string()).optional(),
  preferredServerWeights: routingWeightsSchema,
  preferredCountryWeights: routingWeightsSchema,
  preferredRegionMode: z.enum(['PREFER', 'ONLY']).optional(),
  sessionStickinessMode: sessionStickinessSchema.optional(),
  drainGraceMinutes: z.number().int().min(1).max(240).optional(),
  // Subscription page customization
  subscriptionTheme: z.enum(subscriptionThemeIds).optional().nullable(),
  coverImage: z.string().url().optional().nullable(),
  coverImageType: z.enum(['url', 'gradient', 'upload']).optional().nullable(),
  contactLinks: z.string().optional().nullable(), // JSON string of contact links
  subscriptionWelcomeMessage: z.string().max(500).optional().nullable(),
  sharePageEnabled: z.boolean().optional(),
  // New fields for tags and owner
  owner: z.string().max(100).optional().nullable(),
  tags: z.string().max(500).optional().nullable(),
  publicSlug: z.string().min(3).max(32).optional().nullable(),
  rotationTriggerMode: rotationTriggerSchema.optional(),
  rotationUsageThresholdPercent: z.number().int().min(50).max(100).optional(),
  rotateOnHealthFailure: z.boolean().optional(),
  appliedTemplateId: z.string().optional().nullable(),
});

const dynamicKeyTemplateSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(100),
  description: z.string().max(280).optional().nullable(),
  type: z.enum(['SELF_MANAGED', 'MANUAL']).default('SELF_MANAGED'),
  notes: z.string().max(500).optional().nullable(),
  dataLimitGB: z.number().positive().optional().nullable(),
  dataLimitResetStrategy: z.enum(['NEVER', 'DAILY', 'WEEKLY', 'MONTHLY']).default('NEVER'),
  expirationType: z.enum(['NEVER', 'FIXED_DATE', 'DURATION_FROM_CREATION', 'START_ON_FIRST_USE']).default('NEVER'),
  durationDays: z.number().int().positive().optional().nullable(),
  method: z.enum(['chacha20-ietf-poly1305', 'aes-128-gcm', 'aes-192-gcm', 'aes-256-gcm']).default('chacha20-ietf-poly1305'),
  serverTagIds: z.array(z.string()).optional(),
  loadBalancerAlgorithm: z.enum(['IP_HASH', 'RANDOM', 'ROUND_ROBIN', 'LEAST_LOAD']).default('IP_HASH'),
  preferredServerIds: z.array(z.string()).optional(),
  preferredCountryCodes: z.array(z.string()).optional(),
  preferredServerWeights: routingWeightsSchema,
  preferredCountryWeights: routingWeightsSchema,
  preferredRegionMode: z.enum(['PREFER', 'ONLY']).default('PREFER'),
  sessionStickinessMode: sessionStickinessSchema,
  drainGraceMinutes: z.number().int().min(1).max(240).default(20),
  rotationEnabled: z.boolean().optional(),
  rotationInterval: z.enum(['NEVER', 'DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY']).default('NEVER'),
  rotationTriggerMode: rotationTriggerSchema,
  rotationUsageThresholdPercent: z.number().int().min(50).max(100).default(85),
  rotateOnHealthFailure: z.boolean().optional(),
  sharePageEnabled: z.boolean().optional(),
  subscriptionTheme: z.enum(subscriptionThemeIds).optional().nullable(),
  subscriptionWelcomeMessage: z.string().max(500).optional().nullable(),
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

function serializeRoutingPreferences(
  preferences: ReturnType<typeof normalizeDynamicRoutingPreferences>,
) {
  return {
    preferredServerIdsJson: JSON.stringify(preferences.preferredServerIds),
    preferredCountryCodesJson: JSON.stringify(preferences.preferredCountryCodes),
    preferredServerWeightsJson: JSON.stringify(preferences.preferredServerWeights),
    preferredCountryWeightsJson: JSON.stringify(preferences.preferredCountryWeights),
    preferredRegionMode: preferences.preferredRegionMode,
    sessionStickinessMode: preferences.sessionStickinessMode,
    drainGraceMinutes: preferences.drainGraceMinutes,
  };
}

function parseDynamicTemplate(template: {
  preferredServerIdsJson: string;
  preferredCountryCodesJson: string;
  preferredServerWeightsJson: string;
  preferredCountryWeightsJson: string;
  preferredRegionMode: string;
  sessionStickinessMode: string;
  drainGraceMinutes: number;
}) {
  return parseDynamicRoutingPreferences({
    preferredServerIdsJson: template.preferredServerIdsJson,
    preferredCountryCodesJson: template.preferredCountryCodesJson,
    preferredServerWeightsJson: template.preferredServerWeightsJson,
    preferredCountryWeightsJson: template.preferredCountryWeightsJson,
    preferredRegionMode: template.preferredRegionMode,
    sessionStickinessMode: template.sessionStickinessMode,
    drainGraceMinutes: template.drainGraceMinutes,
  });
}

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

async function generateUniqueDynamicKeySlug(name: string, excludeId?: string) {
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
    const [dynamicExisting, accessExisting] = await Promise.all([
      db.dynamicAccessKey.findFirst({
        where: {
          publicSlug: candidate,
          ...(excludeId ? { NOT: { id: excludeId } } : {}),
        },
        select: { id: true },
      }),
      db.accessKey.findFirst({
        where: {
          publicSlug: candidate,
        },
        select: { id: true },
      }),
    ]);

    if (!dynamicExisting && !accessExisting) {
      return candidate;
    }
  }

  while (true) {
    const candidate = buildCandidate(generateRandomString(6).toLowerCase());
    const [dynamicExisting, accessExisting] = await Promise.all([
      db.dynamicAccessKey.findFirst({
        where: {
          publicSlug: candidate,
          ...(excludeId ? { NOT: { id: excludeId } } : {}),
        },
        select: { id: true },
      }),
      db.accessKey.findFirst({
        where: {
          publicSlug: candidate,
        },
        select: { id: true },
      }),
    ]);

    if (!dynamicExisting && !accessExisting) {
      return candidate;
    }
  }
}

async function resolveDynamicKeySlug(requestedSlug: string | null | undefined, name: string, excludeId?: string) {
  if (!requestedSlug) {
    return generateUniqueDynamicKeySlug(name, excludeId);
  }

  const normalizedSlug = normalizePublicSlug(requestedSlug);
  if (!normalizedSlug || !isValidPublicSlug(normalizedSlug)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Slug must use only lowercase letters, numbers, and hyphens.',
    });
  }

  const [dynamicExisting, accessExisting] = await Promise.all([
    db.dynamicAccessKey.findFirst({
      where: {
        publicSlug: normalizedSlug,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    }),
    db.accessKey.findFirst({
      where: {
        publicSlug: normalizedSlug,
      },
      select: { id: true },
    }),
  ]);

  if (dynamicExisting || accessExisting) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: 'That short link is already in use.',
    });
  }

  return normalizedSlug;
}

export const dynamicKeysRouter = router({
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
          message: 'Slug must be 3-32 characters and use only lowercase letters, numbers, and hyphens.',
        };
      }

      const [dynamicExisting, accessExisting] = await Promise.all([
        db.dynamicAccessKey.findFirst({
          where: {
            publicSlug: normalizedSlug,
            ...(input.excludeId ? { NOT: { id: input.excludeId } } : {}),
          },
          select: { id: true },
        }),
        db.accessKey.findFirst({
          where: {
            publicSlug: normalizedSlug,
          },
          select: { id: true },
        }),
      ]);

      return {
        normalizedSlug,
        available: !dynamicExisting && !accessExisting,
        valid: true,
        message: dynamicExisting || accessExisting ? 'That short link is already in use.' : 'This short link is available.',
      };
    }),

  listTemplates: protectedProcedure.query(async () => {
    const templates = await db.dynamicKeyTemplate.findMany({
      orderBy: [
        { updatedAt: 'desc' },
        { name: 'asc' },
      ],
    });

    return templates.map((template) => {
      const routingPreferences = parseDynamicTemplate(template);
      return {
        id: template.id,
        name: template.name,
        description: template.description,
        type: template.type as 'SELF_MANAGED' | 'MANUAL',
        notes: template.notes,
        dataLimitGB: template.dataLimitBytes ? Number(template.dataLimitBytes) / (1024 * 1024 * 1024) : null,
        dataLimitResetStrategy: template.dataLimitResetStrategy,
        expirationType: template.expirationType,
        durationDays: template.durationDays,
        method: template.method,
        serverTagIds: JSON.parse(template.serverTagsJson || '[]') as string[],
        loadBalancerAlgorithm: template.loadBalancerAlgorithm as 'IP_HASH' | 'RANDOM' | 'ROUND_ROBIN' | 'LEAST_LOAD',
        preferredServerIds: routingPreferences.preferredServerIds,
        preferredCountryCodes: routingPreferences.preferredCountryCodes,
        preferredServerWeights: routingPreferences.preferredServerWeights,
        preferredCountryWeights: routingPreferences.preferredCountryWeights,
        preferredRegionMode: routingPreferences.preferredRegionMode,
        sessionStickinessMode: routingPreferences.sessionStickinessMode,
        drainGraceMinutes: routingPreferences.drainGraceMinutes,
        rotationEnabled: template.rotationEnabled,
        rotationInterval: template.rotationInterval,
        rotationTriggerMode: template.rotationTriggerMode as 'SCHEDULED' | 'USAGE' | 'HEALTH' | 'COMBINED',
        rotationUsageThresholdPercent: template.rotationUsageThresholdPercent,
        rotateOnHealthFailure: template.rotateOnHealthFailure,
        sharePageEnabled: template.sharePageEnabled,
        subscriptionTheme: template.subscriptionTheme,
        subscriptionWelcomeMessage: template.subscriptionWelcomeMessage,
        createdAt: template.createdAt,
        updatedAt: template.updatedAt,
      };
    });
  }),

  createTemplate: adminProcedure
    .input(dynamicKeyTemplateSchema)
    .mutation(async ({ input }) => {
      const routingPreferences = normalizeDynamicRoutingPreferences({
        preferredServerIds: input.preferredServerIds,
        preferredCountryCodes: input.preferredCountryCodes,
        preferredServerWeights: input.preferredServerWeights,
        preferredCountryWeights: input.preferredCountryWeights,
        preferredRegionMode: input.preferredRegionMode,
        sessionStickinessMode: input.sessionStickinessMode,
        drainGraceMinutes: input.drainGraceMinutes,
      });

      const template = await db.dynamicKeyTemplate.create({
        data: {
          name: input.name,
          description: input.description,
          type: input.type,
          notes: input.notes,
          dataLimitBytes: input.dataLimitGB ? gbToBytes(input.dataLimitGB) : null,
          dataLimitResetStrategy: input.dataLimitResetStrategy,
          expirationType: input.expirationType,
          durationDays: input.durationDays,
          method: input.method,
          serverTagsJson: JSON.stringify(input.serverTagIds || []),
          loadBalancerAlgorithm: input.loadBalancerAlgorithm,
          ...serializeRoutingPreferences(routingPreferences),
          rotationEnabled: input.rotationEnabled ?? false,
          rotationInterval: input.rotationInterval,
          rotationTriggerMode: input.rotationTriggerMode,
          rotationUsageThresholdPercent: input.rotationUsageThresholdPercent,
          rotateOnHealthFailure: input.rotateOnHealthFailure ?? false,
          sharePageEnabled: input.sharePageEnabled ?? true,
          subscriptionTheme: input.subscriptionTheme,
          subscriptionWelcomeMessage: input.subscriptionWelcomeMessage,
        },
      });

      return { id: template.id };
    }),

  updateTemplate: adminProcedure
    .input(dynamicKeyTemplateSchema.extend({ id: z.string() }))
    .mutation(async ({ input }) => {
      const routingPreferences = normalizeDynamicRoutingPreferences({
        preferredServerIds: input.preferredServerIds,
        preferredCountryCodes: input.preferredCountryCodes,
        preferredServerWeights: input.preferredServerWeights,
        preferredCountryWeights: input.preferredCountryWeights,
        preferredRegionMode: input.preferredRegionMode,
        sessionStickinessMode: input.sessionStickinessMode,
        drainGraceMinutes: input.drainGraceMinutes,
      });

      await db.dynamicKeyTemplate.update({
        where: { id: input.id },
        data: {
          name: input.name,
          description: input.description,
          type: input.type,
          notes: input.notes,
          dataLimitBytes: input.dataLimitGB ? gbToBytes(input.dataLimitGB) : null,
          dataLimitResetStrategy: input.dataLimitResetStrategy,
          expirationType: input.expirationType,
          durationDays: input.durationDays,
          method: input.method,
          serverTagsJson: JSON.stringify(input.serverTagIds || []),
          loadBalancerAlgorithm: input.loadBalancerAlgorithm,
          ...serializeRoutingPreferences(routingPreferences),
          rotationEnabled: input.rotationEnabled ?? false,
          rotationInterval: input.rotationInterval,
          rotationTriggerMode: input.rotationTriggerMode,
          rotationUsageThresholdPercent: input.rotationUsageThresholdPercent,
          rotateOnHealthFailure: input.rotateOnHealthFailure ?? false,
          sharePageEnabled: input.sharePageEnabled ?? true,
          subscriptionTheme: input.subscriptionTheme,
          subscriptionWelcomeMessage: input.subscriptionWelcomeMessage,
        },
      });

      return { success: true };
    }),

  deleteTemplate: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await db.dynamicKeyTemplate.delete({
        where: { id: input.id },
      });

      return { success: true };
    }),

  applyTemplate: adminProcedure
    .input(z.object({ id: z.string(), templateId: z.string().nullable() }))
    .mutation(async ({ input }) => {
      const dak = await db.dynamicAccessKey.findUnique({
        where: { id: input.id },
        select: { id: true, name: true },
      });

      if (!dak) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Dynamic Access Key not found',
        });
      }

      if (!input.templateId) {
        await db.dynamicAccessKey.update({
          where: { id: input.id },
          data: { appliedTemplateId: null },
        });

        return { success: true };
      }

      const template = await db.dynamicKeyTemplate.findUnique({
        where: { id: input.templateId },
      });

      if (!template) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Template not found',
        });
      }

      const routingPreferences = parseDynamicTemplate(template);
      await db.dynamicAccessKey.update({
        where: { id: input.id },
        data: {
          type: template.type,
          notes: template.notes,
          dataLimitBytes: template.dataLimitBytes,
          dataLimitResetStrategy: template.dataLimitResetStrategy,
          expirationType: template.expirationType,
          durationDays: template.durationDays,
          method: template.method,
          serverTagsJson: template.serverTagsJson,
          loadBalancerAlgorithm: template.loadBalancerAlgorithm,
          ...serializeRoutingPreferences(routingPreferences),
          rotationEnabled: template.rotationEnabled,
          rotationInterval: template.rotationInterval,
          rotationTriggerMode: template.rotationTriggerMode,
          rotationUsageThresholdPercent: template.rotationUsageThresholdPercent,
          rotateOnHealthFailure: template.rotateOnHealthFailure,
          sharePageEnabled: template.sharePageEnabled,
          subscriptionTheme: template.subscriptionTheme,
          subscriptionWelcomeMessage: template.subscriptionWelcomeMessage,
          appliedTemplateId: template.id,
        },
      });

      await recordDynamicRoutingEvent({
        dynamicAccessKeyId: input.id,
        eventType: DYNAMIC_ROUTING_EVENT_TYPES.TEST_RUN,
        reason: `Applied dynamic key template "${template.name}".`,
        metadata: {
          templateId: template.id,
          templateName: template.name,
        },
      });

      return { success: true };
    }),

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

      // Quick filter: Traffic Active (recent observed traffic)
      if (online) {
        const onlineThreshold = new Date(Date.now() - TRAFFIC_ACTIVE_WINDOW_MS);
        where.status = 'ACTIVE';
        where.lastTrafficAt = { gte: onlineThreshold };
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
          { lastTrafficAt: null },
          { lastTrafficAt: { lt: thirtyDaysAgo } },
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
        const routingPreferences = parseDynamicRoutingPreferences({
          preferredServerIdsJson: dak.preferredServerIdsJson,
          preferredCountryCodesJson: dak.preferredCountryCodesJson,
          preferredServerWeightsJson: dak.preferredServerWeightsJson,
          preferredCountryWeightsJson: dak.preferredCountryWeightsJson,
          preferredRegionMode: dak.preferredRegionMode,
          sessionStickinessMode: dak.sessionStickinessMode,
          drainGraceMinutes: dak.drainGraceMinutes,
        });
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
          publicSlug: dak.publicSlug,
          dataLimitBytes: dak.dataLimitBytes,
          usedBytes: dak.usedBytes,
          usagePercent,
          expiresAt: dak.expiresAt,
          daysRemaining,
          prefix: dak.prefix,
          method: dak.method,
          loadBalancerAlgorithm: dak.loadBalancerAlgorithm as 'IP_HASH' | 'RANDOM' | 'ROUND_ROBIN' | 'LEAST_LOAD',
          serverTagIds: JSON.parse(dak.serverTagsJson || '[]') as string[],
          preferredServerIds: routingPreferences.preferredServerIds,
          preferredCountryCodes: routingPreferences.preferredCountryCodes,
          preferredServerWeights: routingPreferences.preferredServerWeights,
          preferredCountryWeights: routingPreferences.preferredCountryWeights,
          preferredRegionMode: routingPreferences.preferredRegionMode,
          sessionStickinessMode: routingPreferences.sessionStickinessMode,
          drainGraceMinutes: routingPreferences.drainGraceMinutes,
          rotationEnabled: dak.rotationEnabled,
          rotationInterval: dak.rotationInterval,
          rotationTriggerMode: dak.rotationTriggerMode,
          rotationUsageThresholdPercent: dak.rotationUsageThresholdPercent,
          rotateOnHealthFailure: dak.rotateOnHealthFailure,
          appliedTemplateId: dak.appliedTemplateId,
          attachedKeysCount: dak._count.accessKeys,
          createdAt: dak.createdAt,
          updatedAt: dak.updatedAt,
          userId: dak.userId,
          owner: dak.owner,
          tags: dak.tags,
          firstUsedAt: dak.firstUsedAt,
          lastTrafficAt: dak.lastTrafficAt,
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
          appliedTemplate: {
            select: {
              id: true,
              name: true,
            },
          },
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

      const pinState = await resolveDynamicPinState({
        dynamicAccessKeyId: dak.id,
        pinnedAccessKeyId: dak.pinnedAccessKeyId,
        pinnedServerId: dak.pinnedServerId,
        pinnedAt: dak.pinnedAt,
        pinExpiresAt: dak.pinExpiresAt,
      });

      const publicSlug = dak.publicSlug || await generateUniqueDynamicKeySlug(dak.name, dak.id);
      const routingPreferences = parseDynamicRoutingPreferences({
        preferredServerIdsJson: dak.preferredServerIdsJson,
        preferredCountryCodesJson: dak.preferredCountryCodesJson,
        preferredServerWeightsJson: dak.preferredServerWeightsJson,
        preferredCountryWeightsJson: dak.preferredCountryWeightsJson,
        preferredRegionMode: dak.preferredRegionMode,
        sessionStickinessMode: dak.sessionStickinessMode,
        drainGraceMinutes: dak.drainGraceMinutes,
      });

      if (!dak.publicSlug) {
        await db.dynamicAccessKey.update({
          where: { id: dak.id },
          data: { publicSlug },
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
        publicSlug,
        dataLimitBytes: dak.dataLimitBytes,
        usedBytes: dak.usedBytes,
        expiresAt: dak.expiresAt,
        expirationType: dak.expirationType,
        durationDays: dak.durationDays,
        firstUsedAt: dak.firstUsedAt,
        lastTrafficAt: dak.lastTrafficAt,
        prefix: dak.prefix,
        method: dak.method,
        loadBalancerAlgorithm: dak.loadBalancerAlgorithm as 'IP_HASH' | 'RANDOM' | 'ROUND_ROBIN' | 'LEAST_LOAD',
        serverTagIds: JSON.parse(dak.serverTagsJson || '[]') as string[],
        preferredServerIds: routingPreferences.preferredServerIds,
        preferredCountryCodes: routingPreferences.preferredCountryCodes,
        preferredServerWeights: routingPreferences.preferredServerWeights,
        preferredCountryWeights: routingPreferences.preferredCountryWeights,
        preferredRegionMode: routingPreferences.preferredRegionMode,
        sessionStickinessMode: routingPreferences.sessionStickinessMode,
        drainGraceMinutes: routingPreferences.drainGraceMinutes,
        accessKeys: dak.accessKeys.map((key) => ({
          ...key,
          accessUrl: decorateOutlineAccessUrl(key.accessUrl, key.name),
        })),
        // Subscription page customization
        subscriptionTheme: dak.subscriptionTheme,
        coverImage: dak.coverImage,
        coverImageType: dak.coverImageType,
        contactLinks: dak.contactLinks ? JSON.parse(dak.contactLinks) : null,
        subscriptionWelcomeMessage: dak.subscriptionWelcomeMessage,
        sharePageEnabled: dak.sharePageEnabled,
        // Rotation settings
        rotationEnabled: dak.rotationEnabled,
        rotationInterval: dak.rotationInterval,
        rotationTriggerMode: dak.rotationTriggerMode,
        rotationUsageThresholdPercent: dak.rotationUsageThresholdPercent,
        rotateOnHealthFailure: dak.rotateOnHealthFailure,
        lastRotatedAt: dak.lastRotatedAt,
        nextRotationAt: dak.nextRotationAt,
        rotationCount: dak.rotationCount,
        lastResolvedAccessKeyId: dak.lastResolvedAccessKeyId,
        lastResolvedServerId: dak.lastResolvedServerId,
        lastResolvedAt: dak.lastResolvedAt,
        pinnedAccessKeyId: pinState.pinnedAccessKeyId,
        pinnedServerId: pinState.pinnedServerId,
        pinnedAt: pinState.pinnedAt,
        pinExpiresAt: pinState.pinExpiresAt,
        appliedTemplateId: dak.appliedTemplateId,
        appliedTemplate: dak.appliedTemplate,
        createdAt: dak.createdAt,
        updatedAt: dak.updatedAt,
      };
    }),

  getSharePageAnalytics: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const dak = await db.dynamicAccessKey.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          userId: true,
        },
      });

      if (!dak) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Dynamic Access Key not found',
        });
      }

      if (ctx.user.role !== 'ADMIN' && dak.userId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to view this key',
        });
      }

      return getDynamicKeySubscriptionAnalytics(input.id);
    }),

  getRoutingDiagnostics: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const dak = await db.dynamicAccessKey.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          userId: true,
          type: true,
          status: true,
          loadBalancerAlgorithm: true,
          lastSelectedKeyIndex: true,
          serverTagsJson: true,
          preferredServerIdsJson: true,
          preferredCountryCodesJson: true,
          preferredServerWeightsJson: true,
          preferredCountryWeightsJson: true,
          preferredRegionMode: true,
          sessionStickinessMode: true,
          drainGraceMinutes: true,
          lastTrafficAt: true,
          usedBytes: true,
          dataLimitBytes: true,
          lastResolvedAccessKeyId: true,
          lastResolvedServerId: true,
          lastResolvedAt: true,
          pinnedAccessKeyId: true,
          pinnedServerId: true,
          pinnedAt: true,
          pinExpiresAt: true,
          rotationTriggerMode: true,
          rotationUsageThresholdPercent: true,
          rotateOnHealthFailure: true,
          appliedTemplate: {
            select: {
              id: true,
              name: true,
            },
          },
          accessKeys: {
            where: {
              status: 'ACTIVE',
            },
            select: {
              id: true,
              name: true,
              accessUrl: true,
              status: true,
              usedBytes: true,
              lastTrafficAt: true,
              lastUsedAt: true,
              createdAt: true,
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

      if (ctx.user.role !== 'ADMIN' && dak.userId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to view this key',
        });
      }

      const pinState = await resolveDynamicPinState({
        dynamicAccessKeyId: dak.id,
        pinnedAccessKeyId: dak.pinnedAccessKeyId,
        pinnedServerId: dak.pinnedServerId,
        pinnedAt: dak.pinnedAt,
        pinExpiresAt: dak.pinExpiresAt,
      });

      const algorithm = dak.loadBalancerAlgorithm as 'IP_HASH' | 'RANDOM' | 'ROUND_ROBIN' | 'LEAST_LOAD';
      const viewerIp = ctx.clientIp ?? null;
      const activeKeys = dak.accessKeys.filter((key) => Boolean(key.server));
      const accessKeyIds = activeKeys.map((key) => key.id);
      const serverTagIds = JSON.parse(dak.serverTagsJson || '[]') as string[];
      const routingPreferences = parseDynamicRoutingPreferences({
        preferredServerIdsJson: dak.preferredServerIdsJson,
        preferredCountryCodesJson: dak.preferredCountryCodesJson,
        preferredServerWeightsJson: dak.preferredServerWeightsJson,
        preferredCountryWeightsJson: dak.preferredCountryWeightsJson,
        preferredRegionMode: dak.preferredRegionMode,
        sessionStickinessMode: dak.sessionStickinessMode,
        drainGraceMinutes: dak.drainGraceMinutes,
      });

      const [sessions, analytics, preferredServers, candidateServers, routingTimeline, routingAlerts] = await Promise.all([
        accessKeyIds.length > 0
          ? db.connectionSession.findMany({
              where: {
                accessKeyId: { in: accessKeyIds },
              },
              orderBy: [
                { lastActiveAt: 'desc' },
                { startedAt: 'desc' },
              ],
              take: 25,
              include: {
                accessKey: {
                  select: {
                    id: true,
                    name: true,
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
            })
          : Promise.resolve([]),
        getDynamicKeySubscriptionAnalytics(input.id),
        routingPreferences.preferredServerIds.length > 0
          ? db.server.findMany({
              where: {
                id: { in: routingPreferences.preferredServerIds },
              },
              select: {
                id: true,
                name: true,
                countryCode: true,
              },
            })
          : Promise.resolve([]),
        db.server.findMany({
          where: {
            isActive: true,
            ...(serverTagIds.length > 0
              ? {
                  tags: {
                    some: {
                      tagId: { in: serverTagIds },
                    },
                  },
                }
              : {}),
          },
          select: {
            id: true,
            name: true,
            countryCode: true,
          },
        }),
        getDynamicRoutingTimeline(input.id, 20),
        getDynamicRoutingAlerts({
          dynamicAccessKeyId: input.id,
          usedBytes: dak.usedBytes,
          dataLimitBytes: dak.dataLimitBytes,
        }),
      ]);
      const orderedPreferredServers = routingPreferences.preferredServerIds
        .map((serverId) => preferredServers.find((server) => server.id === serverId))
        .filter((server): server is NonNullable<typeof preferredServers[number]> => Boolean(server));

      const latestSessionByKeyId = new Map<
        string,
        {
          sessionId: string;
          startedAt: Date;
          lastActiveAt: Date;
          isActive: boolean;
          bytesUsed: bigint;
          keyName: string;
          serverName: string;
          serverCountry: string | null;
        }
      >();

      for (const session of sessions) {
        if (!session.accessKey) {
          continue;
        }

        if (!latestSessionByKeyId.has(session.accessKey.id)) {
          latestSessionByKeyId.set(session.accessKey.id, {
            sessionId: session.id,
            startedAt: session.startedAt,
            lastActiveAt: session.lastActiveAt,
            isActive: session.isActive,
            bytesUsed: session.bytesUsed,
            keyName: session.accessKey.name,
            serverName: session.accessKey.server?.name || 'Unknown',
            serverCountry: session.accessKey.server?.countryCode || null,
          });
        }
      }

      const keysWithLastSeen = activeKeys
        .map((key) => {
          const latestSession = latestSessionByKeyId.get(key.id);
          const lastSeenAt = latestSession?.lastActiveAt ?? key.lastTrafficAt ?? key.lastUsedAt ?? key.createdAt;
          return {
            keyId: key.id,
            keyName: key.name,
            serverId: key.server?.id || null,
            serverName: key.server?.name || 'Unknown',
            serverCountry: key.server?.countryCode || null,
            lastSeenAt,
            lastTrafficAt: key.lastTrafficAt ?? null,
            isActive: latestSession?.isActive ?? false,
            bytesUsed: key.usedBytes.toString(),
          };
        })
        .sort((left, right) => right.lastSeenAt.getTime() - left.lastSeenAt.getTime());

      const recentBackends = keysWithLastSeen.slice(0, 4).map((item) => ({
        ...item,
        lastSeenAt: item.lastSeenAt.toISOString(),
        lastTrafficAt: item.lastTrafficAt?.toISOString() ?? null,
      }));

      const sessionTimeline = [...sessions]
        .filter((session) => session.accessKey)
        .sort((left, right) => left.lastActiveAt.getTime() - right.lastActiveAt.getTime());

      const recentBackendSwitches: Array<{
        fromKeyId: string;
        fromKeyName: string;
        fromServerName: string;
        toKeyId: string;
        toKeyName: string;
        toServerName: string;
        switchedAt: string;
      }> = [];

      let previousSession: (typeof sessionTimeline)[number] | null = null;
      for (const session of sessionTimeline) {
        if (!session.accessKey) {
          continue;
        }

        if (
          previousSession?.accessKey &&
          previousSession.accessKey.id !== session.accessKey.id
        ) {
          recentBackendSwitches.push({
            fromKeyId: previousSession.accessKey.id,
            fromKeyName: previousSession.accessKey.name,
            fromServerName: previousSession.accessKey.server?.name || 'Unknown',
            toKeyId: session.accessKey.id,
            toKeyName: session.accessKey.name,
            toServerName: session.accessKey.server?.name || 'Unknown',
            switchedAt: session.lastActiveAt.toISOString(),
          });
        }

        previousSession = session;
      }

      let currentSelection: {
        mode: 'ATTACHED_KEY' | 'SELF_MANAGED_KEY' | 'SELF_MANAGED_CANDIDATE';
        keyId?: string | null;
        keyName?: string | null;
        serverId?: string | null;
        serverName: string;
        serverCountry: string | null;
        reason: string;
        lastTrafficAt?: string | null;
      } | null = null;
      let pinnedBackend: {
        mode: 'ATTACHED_KEY' | 'SELF_MANAGED_SERVER';
        keyId?: string | null;
        keyName?: string | null;
        serverId: string;
        serverName: string;
        serverCountry: string | null;
        pinnedAt: string | null;
        pinExpiresAt: string | null;
      } | null = null;

      let selectionNote: string | null = null;
      let candidateRanking: Array<{
        keyId?: string;
        keyName?: string;
        serverId: string;
        serverName: string;
        serverCountry: string | null;
        weight: number;
        preferenceScope: 'COUNTRY' | 'SERVER' | 'NONE' | 'UNRESTRICTED' | 'FALLBACK';
        loadScore: number | null;
        effectiveScore: number | null;
        reason: string;
      }> = [];

      if (dak.type === 'MANUAL') {
        if (algorithm === 'RANDOM' && activeKeys.length > 1) {
          selectionNote = 'Random routing changes per fetch. Use Test Client URL to inspect the live backend right now.';
        } else {
          candidateRanking = await rankDynamicAccessKeyCandidates({
            accessKeys: activeKeys.map((key) => ({
              id: key.id,
              name: key.name,
              status: key.status,
              lastTrafficAt: key.lastTrafficAt,
              lastUsedAt: key.lastUsedAt,
              server: {
                id: key.server!.id,
                name: key.server!.name,
                countryCode: key.server!.countryCode,
              },
            })),
            preferences: routingPreferences,
            serverTagIds,
          });
          const selection = await selectDynamicAccessKeyForClient({
            dakId: dak.id,
            accessKeys: activeKeys.map((key) => ({
              id: key.id,
              name: key.name,
              status: key.status,
              lastTrafficAt: key.lastTrafficAt,
              lastUsedAt: key.lastUsedAt,
              server: {
                id: key.server!.id,
                name: key.server!.name,
                countryCode: key.server!.countryCode,
              },
            })),
            algorithm,
            clientIp: viewerIp || '127.0.0.1',
            lastSelectedKeyIndex: dak.lastSelectedKeyIndex,
            pinnedAccessKeyId: pinState.pinnedAccessKeyId,
            preferredServerIds: routingPreferences.preferredServerIds,
            preferredCountryCodes: routingPreferences.preferredCountryCodes,
            preferredServerWeights: routingPreferences.preferredServerWeights,
            preferredCountryWeights: routingPreferences.preferredCountryWeights,
            preferredRegionMode: routingPreferences.preferredRegionMode,
            sessionStickinessMode: routingPreferences.sessionStickinessMode,
            drainGraceMinutes: routingPreferences.drainGraceMinutes,
            persistRoundRobin: false,
          });

          if (selection) {
            currentSelection = {
              mode: 'ATTACHED_KEY',
              keyId: selection.key.id,
              keyName: selection.key.name,
              serverId: selection.key.server.id,
              serverName: selection.key.server.name,
              serverCountry: selection.key.server.countryCode ?? null,
              reason: selection.selectionReason,
              lastTrafficAt: selection.key.lastTrafficAt?.toISOString() ?? null,
            };
          }
        }

        if (pinState.pinnedAccessKeyId) {
          const pinnedKey = activeKeys.find((key) => key.id === pinState.pinnedAccessKeyId);
          if (pinnedKey?.server) {
            pinnedBackend = {
              mode: 'ATTACHED_KEY',
              keyId: pinnedKey.id,
              keyName: pinnedKey.name,
              serverId: pinnedKey.server.id,
              serverName: pinnedKey.server.name,
              serverCountry: pinnedKey.server.countryCode ?? null,
              pinnedAt: pinState.pinnedAt?.toISOString() ?? null,
              pinExpiresAt: pinState.pinExpiresAt?.toISOString() ?? null,
            };
          }
        }
      } else {
        const sortedSelfManagedKeys = [...activeKeys]
          .filter((key) => key.name.startsWith('self-managed-dak-'))
          .sort((left, right) => {
            const leftTime = (left.lastTrafficAt ?? left.lastUsedAt ?? left.createdAt).getTime();
            const rightTime = (right.lastTrafficAt ?? right.lastUsedAt ?? right.createdAt).getTime();
            return rightTime - leftTime;
          });
        const pinnedSelfManagedKey = pinState.pinnedAccessKeyId
          ? sortedSelfManagedKeys.find((key) => key.id === pinState.pinnedAccessKeyId)
          : pinState.pinnedServerId
            ? sortedSelfManagedKeys.find((key) => key.server?.id === pinState.pinnedServerId)
            : null;
        const activeSelfManagedKey = pinnedSelfManagedKey ?? sortedSelfManagedKeys[0];

        if (activeSelfManagedKey?.server) {
          currentSelection = {
            mode: 'SELF_MANAGED_KEY',
            keyId: activeSelfManagedKey.id,
            keyName: activeSelfManagedKey.name,
            serverId: activeSelfManagedKey.server.id,
            serverName: activeSelfManagedKey.server.name,
            serverCountry: activeSelfManagedKey.server.countryCode ?? null,
            reason: pinnedSelfManagedKey
              ? 'Operator pin forced routing to the current self-managed backend until the pin is cleared.'
              : 'An active self-managed backend already exists and will be reused until it rotates or is replaced.',
            lastTrafficAt: activeSelfManagedKey.lastTrafficAt?.toISOString() ?? null,
          };
        } else {
          candidateRanking = await rankDynamicServerCandidates({
            servers: candidateServers.map((server) => ({
              id: server.id,
              name: server.name,
              countryCode: server.countryCode,
            })),
            preferences: routingPreferences,
            serverTagIds,
          });
          const candidate = await getSelfManagedServerCandidate({
            dakId: dak.id,
            serverTagIds,
            algorithm,
            clientIp: viewerIp || '127.0.0.1',
            lastSelectedKeyIndex: dak.lastSelectedKeyIndex,
            pinnedServerId: pinState.pinnedServerId,
            preferredServerIds: routingPreferences.preferredServerIds,
            preferredCountryCodes: routingPreferences.preferredCountryCodes,
            preferredServerWeights: routingPreferences.preferredServerWeights,
            preferredCountryWeights: routingPreferences.preferredCountryWeights,
            preferredRegionMode: routingPreferences.preferredRegionMode,
            sessionStickinessMode: routingPreferences.sessionStickinessMode,
            drainGraceMinutes: routingPreferences.drainGraceMinutes,
            persistRoundRobin: false,
          });

          if (candidate) {
            currentSelection = {
              mode: 'SELF_MANAGED_CANDIDATE',
              serverId: candidate.serverId,
              serverName: candidate.serverName,
              serverCountry: candidate.countryCode,
              reason: candidate.reason,
            };
          } else {
            selectionNote = 'No active server currently matches this dynamic key. Add or activate servers before the next fetch.';
          }
        }

        if (activeSelfManagedKey?.server) {
          pinnedBackend = pinState.pinnedAccessKeyId || pinState.pinnedServerId
            ? {
                mode: 'ATTACHED_KEY',
                keyId: activeSelfManagedKey.id,
                keyName: activeSelfManagedKey.name,
                serverId: activeSelfManagedKey.server.id,
                serverName: activeSelfManagedKey.server.name,
                serverCountry: activeSelfManagedKey.server.countryCode ?? null,
                pinnedAt: pinState.pinnedAt?.toISOString() ?? null,
                pinExpiresAt: pinState.pinExpiresAt?.toISOString() ?? null,
              }
            : null;
        } else if (pinState.pinnedServerId) {
          const pinnedServer = candidateServers.find((server) => server.id === pinState.pinnedServerId);
          if (pinnedServer) {
            pinnedBackend = {
              mode: 'SELF_MANAGED_SERVER',
              serverId: pinnedServer.id,
              serverName: pinnedServer.name,
              serverCountry: pinnedServer.countryCode ?? null,
              pinnedAt: pinState.pinnedAt?.toISOString() ?? null,
              pinExpiresAt: pinState.pinExpiresAt?.toISOString() ?? null,
            };
          }
        }
      }

      return {
        algorithm,
        algorithmLabel: getDynamicRoutingAlgorithmLabel(algorithm),
        algorithmHint: getDynamicRoutingAlgorithmHint(algorithm),
        viewerIp,
        preferredRegionMode: routingPreferences.preferredRegionMode,
        preferredServerIds: routingPreferences.preferredServerIds,
        preferredServers: orderedPreferredServers,
        preferredCountryCodes: routingPreferences.preferredCountryCodes,
        preferredServerWeights: routingPreferences.preferredServerWeights,
        preferredCountryWeights: routingPreferences.preferredCountryWeights,
        sessionStickinessMode: routingPreferences.sessionStickinessMode,
        drainGraceMinutes: routingPreferences.drainGraceMinutes,
        attachedActiveKeys: activeKeys.length,
        selectionNote,
        currentSelection,
        lastResolvedBackend: recentBackends[0] ?? null,
        recentBackends,
        recentBackendSwitches: recentBackendSwitches.slice(-4).reverse(),
        candidateRanking,
        routingTimeline: routingTimeline.map((event) => ({
          ...event,
          createdAt: event.createdAt.toISOString(),
        })),
        routingAlerts: routingAlerts,
        lastResolvedAccessKeyId: dak.lastResolvedAccessKeyId,
        lastResolvedServerId: dak.lastResolvedServerId,
        lastResolvedAt: dak.lastResolvedAt?.toISOString() ?? null,
        pinnedAccessKeyId: pinState.pinnedAccessKeyId,
        pinnedServerId: pinState.pinnedServerId,
        pinnedAt: pinState.pinnedAt?.toISOString() ?? null,
        pinExpiresAt: pinState.pinExpiresAt?.toISOString() ?? null,
        pinnedBackend,
        rotationTriggerMode: dak.rotationTriggerMode,
        rotationUsageThresholdPercent: dak.rotationUsageThresholdPercent,
        rotateOnHealthFailure: dak.rotateOnHealthFailure,
        appliedTemplate: dak.appliedTemplate,
        lastSharePageViewAt: analytics.lastViewedAt?.toISOString() ?? null,
        lastSharePageCopyAt: analytics.lastCopiedAt?.toISOString() ?? null,
        lastSharePageOpenAppAt:
          analytics.recentEvents.find((event) => event.eventType === 'OPEN_APP')?.createdAt.toISOString() ?? null,
      };
    }),

  pinBackend: adminProcedure
    .input(z.object({
      id: z.string(),
      accessKeyId: z.string().optional().nullable(),
      serverId: z.string().optional().nullable(),
      expiresInMinutes: z.number().int().min(5).max(7 * 24 * 60).optional().nullable(),
    }))
    .mutation(async ({ input }) => {
      const dak = await db.dynamicAccessKey.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          name: true,
          type: true,
          accessKeys: {
            where: { status: 'ACTIVE' },
            select: {
              id: true,
              name: true,
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

      if (!input.accessKeyId && !input.serverId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Choose a backend key or server to pin.',
        });
      }

      let pinnedAccessKeyId: string | null = null;
      let pinnedServerId: string | null = null;
      let pinnedLabel = dak.name;
      let fromKeyId: string | null = null;
      let fromKeyName: string | null = null;
      let fromServerId: string | null = null;
      let fromServerName: string | null = null;

      if (input.accessKeyId) {
        const matchedKey = dak.accessKeys.find((key) => key.id === input.accessKeyId);
        if (!matchedKey?.server) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'That backend key is no longer available for pinning.',
          });
        }

        pinnedAccessKeyId = matchedKey.id;
        pinnedServerId = matchedKey.server.id;
        pinnedLabel = matchedKey.server.name;
        fromKeyId = matchedKey.id;
        fromKeyName = matchedKey.name;
        fromServerId = matchedKey.server.id;
        fromServerName = matchedKey.server.name;
      } else if (input.serverId) {
        if (dak.type === 'MANUAL') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Manual dynamic keys must pin a specific attached backend key.',
          });
        }

        const matchedServer = await db.server.findUnique({
          where: { id: input.serverId },
          select: {
            id: true,
            name: true,
            countryCode: true,
          },
        });

        if (!matchedServer) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'That server is no longer available for pinning.',
          });
        }

        pinnedServerId = matchedServer.id;
        pinnedLabel = matchedServer.name;
        fromServerId = matchedServer.id;
        fromServerName = matchedServer.name;
      }

      const updated = await db.dynamicAccessKey.update({
        where: { id: input.id },
        data: {
          pinnedAccessKeyId,
          pinnedServerId,
          pinnedAt: new Date(),
          pinExpiresAt: input.expiresInMinutes
            ? new Date(Date.now() + input.expiresInMinutes * 60_000)
            : null,
        },
        select: {
          pinnedAccessKeyId: true,
          pinnedServerId: true,
          pinnedAt: true,
          pinExpiresAt: true,
        },
      });

      await recordDynamicRoutingEvent({
        dynamicAccessKeyId: input.id,
        eventType: DYNAMIC_ROUTING_EVENT_TYPES.PIN_APPLIED,
        reason: `Pinned routing to ${pinnedLabel}.`,
        fromKeyId,
        fromKeyName,
        fromServerId,
        fromServerName,
        metadata: {
          mode: dak.type,
          expiresInMinutes: input.expiresInMinutes ?? null,
        },
      });

      return updated;
    }),

  clearPinnedBackend: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const existing = await db.dynamicAccessKey.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          pinnedAccessKeyId: true,
          pinnedServerId: true,
          pinExpiresAt: true,
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Dynamic Access Key not found',
        });
      }

      const updated = await db.dynamicAccessKey.update({
        where: { id: input.id },
        data: {
          pinnedAccessKeyId: null,
          pinnedServerId: null,
          pinnedAt: null,
          pinExpiresAt: null,
        },
        select: {
          pinnedAccessKeyId: true,
          pinnedServerId: true,
          pinnedAt: true,
          pinExpiresAt: true,
        },
      });

      if (existing.pinnedAccessKeyId || existing.pinnedServerId) {
        await recordDynamicRoutingEvent({
          dynamicAccessKeyId: input.id,
          eventType: DYNAMIC_ROUTING_EVENT_TYPES.PIN_CLEARED,
          reason: 'Cleared the operator pin and returned routing control to the live policy.',
          fromKeyId: existing.pinnedAccessKeyId,
          fromServerId: existing.pinnedServerId,
        });
      }

      return updated;
    }),

  simulateFailover: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const dak = await db.dynamicAccessKey.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          type: true,
          name: true,
          serverTagsJson: true,
          preferredServerIdsJson: true,
          preferredCountryCodesJson: true,
          preferredServerWeightsJson: true,
          preferredCountryWeightsJson: true,
          preferredRegionMode: true,
          sessionStickinessMode: true,
          drainGraceMinutes: true,
          lastResolvedAccessKeyId: true,
          lastResolvedServerId: true,
          pinnedAccessKeyId: true,
          pinnedServerId: true,
          pinnedAt: true,
          pinExpiresAt: true,
          accessKeys: {
            where: { status: 'ACTIVE' },
            select: {
              id: true,
              name: true,
              lastTrafficAt: true,
              lastUsedAt: true,
              createdAt: true,
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

      const routingPreferences = parseDynamicRoutingPreferences({
        preferredServerIdsJson: dak.preferredServerIdsJson,
        preferredCountryCodesJson: dak.preferredCountryCodesJson,
        preferredServerWeightsJson: dak.preferredServerWeightsJson,
        preferredCountryWeightsJson: dak.preferredCountryWeightsJson,
        preferredRegionMode: dak.preferredRegionMode,
        sessionStickinessMode: dak.sessionStickinessMode,
        drainGraceMinutes: dak.drainGraceMinutes,
      });
      const pinState = await resolveDynamicPinState({
        dynamicAccessKeyId: dak.id,
        pinnedAccessKeyId: dak.pinnedAccessKeyId,
        pinnedServerId: dak.pinnedServerId,
        pinnedAt: dak.pinnedAt,
        pinExpiresAt: dak.pinExpiresAt,
      });

      if (dak.type === 'MANUAL') {
        const activeKeys = dak.accessKeys.filter((key) => Boolean(key.server));
        const ranking = await rankDynamicAccessKeyCandidates({
          accessKeys: activeKeys.map((key) => ({
            id: key.id,
            name: key.name,
            status: 'ACTIVE',
            lastTrafficAt: key.lastTrafficAt,
            lastUsedAt: key.lastUsedAt,
            server: {
              id: key.server!.id,
              name: key.server!.name,
              countryCode: key.server!.countryCode,
            },
          })),
          preferences: routingPreferences,
          serverTagIds: JSON.parse(dak.serverTagsJson || '[]') as string[],
        });

        const currentKeyId = pinState.pinnedAccessKeyId || dak.lastResolvedAccessKeyId;
        const target = ranking.find((candidate) => candidate.keyId && candidate.keyId !== currentKeyId);

        if (!target) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'No alternate backend is available to simulate a failover.',
          });
        }

        await recordDynamicRoutingEvent({
          dynamicAccessKeyId: dak.id,
          eventType: DYNAMIC_ROUTING_EVENT_TYPES.FAILOVER_SIMULATION,
          reason: `A simulated failover would move this key to ${target.serverName}.`,
          fromKeyId: currentKeyId ?? null,
          fromServerId: pinState.pinnedServerId || dak.lastResolvedServerId,
          toKeyId: target.keyId,
          toKeyName: target.keyName,
          toServerId: target.serverId,
          toServerName: target.serverName,
          metadata: {
            mode: 'MANUAL',
          },
        });

        return {
          mode: 'ATTACHED_KEY' as const,
          target,
        };
      }

      const serverTagIds = JSON.parse(dak.serverTagsJson || '[]') as string[];
      const candidateServers = await db.server.findMany({
        where: {
          isActive: true,
          ...(serverTagIds.length > 0
            ? {
                tags: {
                  some: {
                    tagId: { in: serverTagIds },
                  },
                },
              }
            : {}),
        },
        select: {
          id: true,
          name: true,
          countryCode: true,
        },
      });

      const ranking = await rankDynamicServerCandidates({
        servers: candidateServers.map((server) => ({
          id: server.id,
          name: server.name,
          countryCode: server.countryCode,
        })),
        preferences: routingPreferences,
        serverTagIds,
      });

      const currentServerId = pinState.pinnedServerId || dak.lastResolvedServerId;
      const target = ranking.find((candidate) => candidate.serverId !== currentServerId);

      if (!target) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No alternate server is available to simulate a failover.',
        });
      }

      await recordDynamicRoutingEvent({
        dynamicAccessKeyId: dak.id,
        eventType: DYNAMIC_ROUTING_EVENT_TYPES.FAILOVER_SIMULATION,
        reason: `A simulated failover would move this key to ${target.serverName}.`,
        fromServerId: currentServerId,
        toServerId: target.serverId,
        toServerName: target.serverName,
        metadata: {
          mode: 'SELF_MANAGED',
        },
      });

      return {
        mode: 'SELF_MANAGED_SERVER' as const,
        target,
      };
    }),

  testCandidates: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const dak = await db.dynamicAccessKey.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          type: true,
          serverTagsJson: true,
          preferredServerIdsJson: true,
          preferredCountryCodesJson: true,
          preferredServerWeightsJson: true,
          preferredCountryWeightsJson: true,
          preferredRegionMode: true,
          sessionStickinessMode: true,
          drainGraceMinutes: true,
          accessKeys: {
            where: { status: 'ACTIVE' },
            select: {
              id: true,
              name: true,
              lastTrafficAt: true,
              lastUsedAt: true,
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

      const serverTagIds = JSON.parse(dak.serverTagsJson || '[]') as string[];
      const routingPreferences = parseDynamicRoutingPreferences({
        preferredServerIdsJson: dak.preferredServerIdsJson,
        preferredCountryCodesJson: dak.preferredCountryCodesJson,
        preferredServerWeightsJson: dak.preferredServerWeightsJson,
        preferredCountryWeightsJson: dak.preferredCountryWeightsJson,
        preferredRegionMode: dak.preferredRegionMode,
        sessionStickinessMode: dak.sessionStickinessMode,
        drainGraceMinutes: dak.drainGraceMinutes,
      });

      let candidates: Array<{
        keyId?: string;
        keyName?: string;
        serverId: string;
        serverName: string;
        serverCountry: string | null;
        weight: number;
        preferenceScope: 'COUNTRY' | 'SERVER' | 'NONE' | 'UNRESTRICTED' | 'FALLBACK';
        loadScore: number | null;
        effectiveScore: number | null;
        reason: string;
      }> = [];

      if (dak.type === 'MANUAL') {
        candidates = await rankDynamicAccessKeyCandidates({
          accessKeys: dak.accessKeys
            .filter((key) => Boolean(key.server))
            .map((key) => ({
              id: key.id,
              name: key.name,
              status: 'ACTIVE',
              lastTrafficAt: key.lastTrafficAt,
              lastUsedAt: key.lastUsedAt,
              server: {
                id: key.server!.id,
                name: key.server!.name,
                countryCode: key.server!.countryCode,
              },
            })),
          preferences: routingPreferences,
          serverTagIds,
        });
      } else {
        const candidateServers = await db.server.findMany({
          where: {
            isActive: true,
            ...(serverTagIds.length > 0
              ? {
                  tags: {
                    some: {
                      tagId: { in: serverTagIds },
                    },
                  },
                }
              : {}),
          },
          select: {
            id: true,
            name: true,
            countryCode: true,
          },
        });

        candidates = await rankDynamicServerCandidates({
          servers: candidateServers.map((server) => ({
            id: server.id,
            name: server.name,
            countryCode: server.countryCode,
          })),
          preferences: routingPreferences,
          serverTagIds,
        });
      }

      await recordDynamicRoutingEvent({
        dynamicAccessKeyId: dak.id,
        eventType: DYNAMIC_ROUTING_EVENT_TYPES.TEST_RUN,
        reason: `Ran a candidate routing test across ${candidates.length} backend option${candidates.length === 1 ? '' : 's'}.`,
        metadata: {
          candidateCount: candidates.length,
          mode: dak.type,
        },
      });

      return {
        testedAt: new Date().toISOString(),
        mode: dak.type as 'MANUAL' | 'SELF_MANAGED',
        candidates,
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
      const publicSlug = await resolveDynamicKeySlug(input.publicSlug, input.name);
      const routingPreferences = normalizeDynamicRoutingPreferences({
        preferredServerIds: input.preferredServerIds,
        preferredCountryCodes: input.preferredCountryCodes,
        preferredServerWeights: input.preferredServerWeights,
        preferredCountryWeights: input.preferredCountryWeights,
        preferredRegionMode: input.preferredRegionMode,
        sessionStickinessMode: input.sessionStickinessMode,
        drainGraceMinutes: input.drainGraceMinutes,
      });
      const now = new Date();
      const rotationInterval = input.rotationInterval ?? 'NEVER';
      const rotationEnabled = input.rotationEnabled ?? false;
      const nextRotationAt = rotationEnabled && rotationInterval !== 'NEVER'
        ? (await import('@/lib/services/key-rotation')).calculateNextRotation(rotationInterval, now)
        : null;

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
          publicSlug,
          dataLimitBytes: input.dataLimitGB ? gbToBytes(input.dataLimitGB) : null,
          dataLimitResetStrategy: input.dataLimitResetStrategy,
          expirationType: input.expirationType,
          expiresAt,
          durationDays: input.durationDays,
          status,
          serverTagsJson: JSON.stringify(input.serverTagIds || []),
          ...serializeRoutingPreferences(routingPreferences),
          prefix: input.prefix,
          method: input.method || 'chacha20-ietf-poly1305',
          loadBalancerAlgorithm: input.loadBalancerAlgorithm,
          subscriptionWelcomeMessage: input.subscriptionWelcomeMessage,
          sharePageEnabled: input.sharePageEnabled ?? true,
          rotationEnabled,
          rotationInterval,
          rotationTriggerMode: input.rotationTriggerMode,
          rotationUsageThresholdPercent: input.rotationUsageThresholdPercent,
          rotateOnHealthFailure: input.rotateOnHealthFailure ?? false,
          nextRotationAt,
          appliedTemplateId: input.appliedTemplateId,
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
        publicSlug: dak.publicSlug,
        dataLimitBytes: dak.dataLimitBytes,
        usedBytes: dak.usedBytes,
        expiresAt: dak.expiresAt,
        loadBalancerAlgorithm: dak.loadBalancerAlgorithm as 'IP_HASH' | 'RANDOM' | 'ROUND_ROBIN' | 'LEAST_LOAD',
        serverTagIds: JSON.parse(dak.serverTagsJson || '[]') as string[],
        preferredServerIds: routingPreferences.preferredServerIds,
        preferredCountryCodes: routingPreferences.preferredCountryCodes,
        preferredServerWeights: routingPreferences.preferredServerWeights,
        preferredCountryWeights: routingPreferences.preferredCountryWeights,
        preferredRegionMode: routingPreferences.preferredRegionMode,
        sessionStickinessMode: routingPreferences.sessionStickinessMode,
        drainGraceMinutes: routingPreferences.drainGraceMinutes,
        rotationEnabled: dak.rotationEnabled,
        rotationInterval: dak.rotationInterval,
        rotationTriggerMode: dak.rotationTriggerMode,
        rotationUsageThresholdPercent: dak.rotationUsageThresholdPercent,
        rotateOnHealthFailure: dak.rotateOnHealthFailure,
        appliedTemplateId: dak.appliedTemplateId,
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
      const {
        id,
        serverTagIds,
        dataLimitGB,
        dataLimitResetStrategy,
        email,
        telegramId,
        userId,
        notes,
        prefix,
        loadBalancerAlgorithm,
        preferredServerIds,
        preferredCountryCodes,
        preferredServerWeights,
        preferredCountryWeights,
        preferredRegionMode,
        sessionStickinessMode,
        drainGraceMinutes,
        subscriptionTheme,
        coverImage,
        coverImageType,
        contactLinks,
        subscriptionWelcomeMessage,
        sharePageEnabled,
        owner,
        tags,
        publicSlug,
        rotationTriggerMode,
        rotationUsageThresholdPercent,
        rotateOnHealthFailure,
        appliedTemplateId,
        ...data
      } = input;

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

      if (
        preferredServerIds !== undefined ||
        preferredCountryCodes !== undefined ||
        preferredRegionMode !== undefined
      ) {
        const routingPreferences = normalizeDynamicRoutingPreferences({
          preferredServerIds:
            preferredServerIds !== undefined
              ? preferredServerIds
              : parseDynamicRoutingPreferences({
                  preferredServerIdsJson: existing.preferredServerIdsJson,
                  preferredServerWeightsJson: existing.preferredServerWeightsJson,
                  preferredCountryWeightsJson: existing.preferredCountryWeightsJson,
                  preferredCountryCodesJson: existing.preferredCountryCodesJson,
                  preferredRegionMode: existing.preferredRegionMode,
                  sessionStickinessMode: existing.sessionStickinessMode,
                  drainGraceMinutes: existing.drainGraceMinutes,
                }).preferredServerIds,
          preferredCountryCodes:
            preferredCountryCodes !== undefined
              ? preferredCountryCodes
              : parseDynamicRoutingPreferences({
                  preferredCountryCodesJson: existing.preferredCountryCodesJson,
                  preferredServerWeightsJson: existing.preferredServerWeightsJson,
                  preferredCountryWeightsJson: existing.preferredCountryWeightsJson,
                  preferredServerIdsJson: existing.preferredServerIdsJson,
                  preferredRegionMode: existing.preferredRegionMode,
                  sessionStickinessMode: existing.sessionStickinessMode,
                  drainGraceMinutes: existing.drainGraceMinutes,
                }).preferredCountryCodes,
          preferredServerWeights:
            preferredServerWeights !== undefined
              ? preferredServerWeights
              : parseDynamicRoutingPreferences({
                  preferredServerWeightsJson: existing.preferredServerWeightsJson,
                  preferredCountryWeightsJson: existing.preferredCountryWeightsJson,
                  preferredServerIdsJson: existing.preferredServerIdsJson,
                  preferredCountryCodesJson: existing.preferredCountryCodesJson,
                  preferredRegionMode: existing.preferredRegionMode,
                  sessionStickinessMode: existing.sessionStickinessMode,
                  drainGraceMinutes: existing.drainGraceMinutes,
                }).preferredServerWeights,
          preferredCountryWeights:
            preferredCountryWeights !== undefined
              ? preferredCountryWeights
              : parseDynamicRoutingPreferences({
                  preferredCountryWeightsJson: existing.preferredCountryWeightsJson,
                  preferredServerWeightsJson: existing.preferredServerWeightsJson,
                  preferredServerIdsJson: existing.preferredServerIdsJson,
                  preferredCountryCodesJson: existing.preferredCountryCodesJson,
                  preferredRegionMode: existing.preferredRegionMode,
                  sessionStickinessMode: existing.sessionStickinessMode,
                  drainGraceMinutes: existing.drainGraceMinutes,
                }).preferredCountryWeights,
          preferredRegionMode:
            preferredRegionMode !== undefined
              ? preferredRegionMode
              : parseDynamicRoutingPreferences({
                  preferredServerIdsJson: existing.preferredServerIdsJson,
                  preferredCountryCodesJson: existing.preferredCountryCodesJson,
                  preferredServerWeightsJson: existing.preferredServerWeightsJson,
                  preferredCountryWeightsJson: existing.preferredCountryWeightsJson,
                  preferredRegionMode: existing.preferredRegionMode,
                  sessionStickinessMode: existing.sessionStickinessMode,
                  drainGraceMinutes: existing.drainGraceMinutes,
                }).preferredRegionMode,
          sessionStickinessMode:
            sessionStickinessMode !== undefined
              ? sessionStickinessMode
              : parseDynamicRoutingPreferences({
                  preferredServerIdsJson: existing.preferredServerIdsJson,
                  preferredCountryCodesJson: existing.preferredCountryCodesJson,
                  preferredServerWeightsJson: existing.preferredServerWeightsJson,
                  preferredCountryWeightsJson: existing.preferredCountryWeightsJson,
                  preferredRegionMode: existing.preferredRegionMode,
                  sessionStickinessMode: existing.sessionStickinessMode,
                  drainGraceMinutes: existing.drainGraceMinutes,
                }).sessionStickinessMode,
          drainGraceMinutes:
            drainGraceMinutes !== undefined
              ? drainGraceMinutes
              : parseDynamicRoutingPreferences({
                  preferredServerIdsJson: existing.preferredServerIdsJson,
                  preferredCountryCodesJson: existing.preferredCountryCodesJson,
                  preferredServerWeightsJson: existing.preferredServerWeightsJson,
                  preferredCountryWeightsJson: existing.preferredCountryWeightsJson,
                  preferredRegionMode: existing.preferredRegionMode,
                  sessionStickinessMode: existing.sessionStickinessMode,
                  drainGraceMinutes: existing.drainGraceMinutes,
                }).drainGraceMinutes,
        });

        Object.assign(updateData, serializeRoutingPreferences(routingPreferences));
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

      if (subscriptionWelcomeMessage !== undefined) {
        updateData.subscriptionWelcomeMessage = subscriptionWelcomeMessage;
      }

      if (sharePageEnabled !== undefined) {
        updateData.sharePageEnabled = sharePageEnabled;
      }

      if (rotationTriggerMode !== undefined) {
        updateData.rotationTriggerMode = rotationTriggerMode;
      }

      if (rotationUsageThresholdPercent !== undefined) {
        updateData.rotationUsageThresholdPercent = rotationUsageThresholdPercent;
      }

      if (rotateOnHealthFailure !== undefined) {
        updateData.rotateOnHealthFailure = rotateOnHealthFailure;
      }

      if (appliedTemplateId !== undefined) {
        updateData.appliedTemplateId = appliedTemplateId;
      }

      if (publicSlug !== undefined) {
        updateData.publicSlug = await resolveDynamicKeySlug(publicSlug, data.name || existing.name, id);
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
        publicSlug: dak.publicSlug,
        dataLimitBytes: dak.dataLimitBytes,
        usedBytes: dak.usedBytes,
        expiresAt: dak.expiresAt,
        loadBalancerAlgorithm: dak.loadBalancerAlgorithm as 'IP_HASH' | 'RANDOM' | 'ROUND_ROBIN' | 'LEAST_LOAD',
        serverTagIds: JSON.parse(dak.serverTagsJson || '[]') as string[],
        preferredServerIds: parseDynamicRoutingPreferences({
          preferredServerIdsJson: dak.preferredServerIdsJson,
        }).preferredServerIds,
        preferredCountryCodes: parseDynamicRoutingPreferences({
          preferredCountryCodesJson: dak.preferredCountryCodesJson,
        }).preferredCountryCodes,
        preferredRegionMode: parseDynamicRoutingPreferences({
          preferredRegionMode: dak.preferredRegionMode,
        }).preferredRegionMode,
        attachedKeysCount: dak._count.accessKeys,
        createdAt: dak.createdAt,
        updatedAt: dak.updatedAt,
      };
    }),

  regeneratePublicSlug: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const existing = await db.dynamicAccessKey.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          name: true,
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Dynamic Access Key not found',
        });
      }

      const publicSlug = await generateUniqueDynamicKeySlug(existing.name, existing.id);
      const dak = await db.dynamicAccessKey.update({
        where: { id: input.id },
        data: { publicSlug },
        select: {
          id: true,
          publicSlug: true,
        },
      });

      return dak;
    }),

  regenerateDynamicUrl: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const existing = await db.dynamicAccessKey.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          dynamicUrl: true,
          name: true,
          publicSlug: true,
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Dynamic Access Key not found',
        });
      }

      const dynamicUrl = generateRandomString(32);
      await db.dynamicAccessKey.update({
        where: { id: input.id },
        data: { dynamicUrl },
      });

      return {
        dynamicUrl,
        sharePageUrl: buildDynamicSharePageUrl(dynamicUrl),
        clientUrl: buildDynamicOutlineUrl(dynamicUrl, existing.name),
        shortSharePageUrl: existing.publicSlug ? buildDynamicShortShareUrl(existing.publicSlug) : null,
        shortClientUrl: existing.publicSlug ? buildDynamicOutlineUrl(existing.publicSlug, existing.name, { shortPath: true }) : null,
      };
    }),

  generateTelegramConnectLink: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const dak = await db.dynamicAccessKey.findUnique({
        where: { id: input.id },
        select: { id: true },
      });

      if (!dak) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Dynamic Access Key not found',
        });
      }

      try {
        return await createDynamicKeyTelegramConnectLink({
          dynamicAccessKeyId: input.id,
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
      try {
        return await sendDynamicKeySharePageToTelegram({
          dynamicAccessKeyId: input.id,
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
                accessUrl: decorateOutlineAccessUrl(newOutlineKey.accessUrl, key.name),
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
            data: { isActive: false, endedAt: new Date(), endedReason: 'KEY_DISABLED' },
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
                    accessUrl: decorateOutlineAccessUrl(newOutlineKey.accessUrl, key.name),
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
                data: { isActive: false, endedAt: new Date(), endedReason: 'KEY_DISABLED' },
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
   * Get aggregated connection sessions for a Dynamic Access Key.
   * Combines sessions from all attached access keys.
   */
  getConnectionSessions: protectedProcedure
    .input(
      z.object({
        dakId: z.string(),
        includeInactive: z.boolean().default(true),
        limit: z.number().int().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const dak = await db.dynamicAccessKey.findUnique({
        where: { id: input.dakId },
        select: {
          id: true,
          userId: true,
          accessKeys: {
            select: {
              id: true,
              estimatedDevices: true,
              peakDevices: true,
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

      // Authorization check
      if (ctx.user.role !== 'ADMIN' && dak.userId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to view this key',
        });
      }

      // Get all access key IDs attached to this DAK
      const accessKeyIds = dak.accessKeys.map((k) => k.id);

      if (accessKeyIds.length === 0) {
        return {
          estimatedDevices: 0,
          peakDevices: 0,
          activeCount: 0,
          sessions: [],
        };
      }

      // Fetch sessions from all attached access keys
      const sessions = await db.connectionSession.findMany({
        where: {
          accessKeyId: { in: accessKeyIds },
          ...(input.includeInactive ? {} : { isActive: true }),
        },
        orderBy: { startedAt: 'desc' },
        take: input.limit,
        include: {
          accessKey: {
            select: {
              name: true,
              server: {
                select: {
                  name: true,
                  countryCode: true,
                },
              },
            },
          },
        },
      });

      // Calculate aggregated stats
      const totalEstimatedDevices = dak.accessKeys.reduce(
        (sum, k) => sum + (k.estimatedDevices || 0),
        0
      );
      const maxPeakDevices = dak.accessKeys.reduce(
        (max, k) => Math.max(max, k.peakDevices || 0),
        0
      );
      const activeCount = sessions.filter((s) => s.isActive).length;

      // Calculate session durations
      const sessionsWithDuration = sessions.map((session) => {
        const endTime = session.endedAt || new Date();
        const durationMs = endTime.getTime() - session.startedAt.getTime();
        const durationMinutes = Math.round(durationMs / 60000);

        return {
          id: session.id,
          startedAt: session.startedAt,
          endedAt: session.endedAt,
          isActive: session.isActive,
          bytesUsed: session.bytesUsed.toString(),
          durationMinutes,
          keyName: session.accessKey?.name || 'Unknown',
          serverName: session.accessKey?.server?.name || 'Unknown',
          serverCountry: session.accessKey?.server?.countryCode,
        };
      });

      // Fetch recent subscription events to show subscriber IPs/Devices
      const subscriptionEvents = await db.subscriptionPageEvent.findMany({
        where: {
          dynamicAccessKeyId: input.dakId,
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

      // Deduplicate by IP
      const uniqueDevicesMap = new Map();
      for (const event of subscriptionEvents) {
        if (!uniqueDevicesMap.has(event.ip)) {
          uniqueDevicesMap.set(event.ip, {
            ip: event.ip,
            userAgent: event.userAgent,
            platform: event.platform,
            lastSeenAt: event.createdAt,
          });
        }
      }
      const subscriberDevices = Array.from(uniqueDevicesMap.values());

      return {
        estimatedDevices: totalEstimatedDevices,
        peakDevices: maxPeakDevices,
        activeCount,
        sessions: sessionsWithDuration,
        subscriberDevices,
      };
    }),

  /**
   * Get live metrics for dynamic keys by refreshing recent observed traffic.
   */
  getLiveMetrics: protectedProcedure.query(async () => {
    const result = await collectTrafficActivity({ persist: false });

    return result.dynamicKeys.map((dak) => ({
      id: dak.id,
      usedBytes: dak.usedBytes.toString(),
      isOnline: dak.isTrafficActive,
    }));
  }),

  /**
   * Update rotation settings for a Dynamic Access Key
   */
  updateRotation: adminProcedure
    .input(
      z.object({
        id: z.string(),
        rotationEnabled: z.boolean(),
        rotationInterval: z.enum(['NEVER', 'DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY']),
        rotationTriggerMode: rotationTriggerSchema,
        rotationUsageThresholdPercent: z.number().int().min(50).max(100),
        rotateOnHealthFailure: z.boolean(),
      })
    )
    .mutation(async ({ input }) => {
      const { calculateNextRotation } = await import('@/lib/services/key-rotation');

      const dak = await db.dynamicAccessKey.findUnique({
        where: { id: input.id },
      });

      if (!dak) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Dynamic Access Key not found',
        });
      }

      const now = new Date();
      const nextRotationAt = input.rotationEnabled && input.rotationInterval !== 'NEVER'
        ? calculateNextRotation(input.rotationInterval, now)
        : null;

      await db.dynamicAccessKey.update({
        where: { id: input.id },
        data: {
          rotationEnabled: input.rotationEnabled,
          rotationInterval: input.rotationInterval,
          rotationTriggerMode: input.rotationTriggerMode,
          rotationUsageThresholdPercent: input.rotationUsageThresholdPercent,
          rotateOnHealthFailure: input.rotateOnHealthFailure,
          nextRotationAt,
        },
      });

      return { success: true, nextRotationAt };
    }),

  /**
   * Manually trigger key rotation for a Dynamic Access Key
   */
  rotateNow: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const { triggerManualRotation } = await import('@/lib/services/key-rotation');

      const dak = await db.dynamicAccessKey.findUnique({
        where: { id: input.id },
      });

      if (!dak) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Dynamic Access Key not found',
        });
      }

      const result = await triggerManualRotation(input.id);

      if (!result.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Rotation failed: ${result.error}`,
        });
      }

      return { success: true };
    }),

  /**
   * List distribution links for a Dynamic Access Key
   */
  listDistributionLinks: protectedProcedure
    .input(z.object({ dakId: z.string() }))
    .query(async ({ input, ctx }) => {
      const dak = await db.dynamicAccessKey.findUnique({
        where: { id: input.dakId },
        select: { userId: true },
      });

      if (!dak || (ctx.user.role !== 'ADMIN' && dak.userId !== ctx.user.id)) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      return db.accessDistributionLink.findMany({
        where: { dynamicKeyId: input.dakId },
        orderBy: { createdAt: 'desc' },
      });
    }),

  /**
   * Create an expiring distribution link
   */
  createDistributionLink: protectedProcedure
    .input(z.object({
      dakId: z.string(),
      maxUses: z.number().int().min(1).max(100).optional().nullable(),
      expiresInHours: z.number().int().min(1).max(720).optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      const dak = await db.dynamicAccessKey.findUnique({
        where: { id: input.dakId },
        select: { userId: true },
      });

      if (!dak || (ctx.user.role !== 'ADMIN' && dak.userId !== ctx.user.id)) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      let expiresAt: Date | null = null;
      if (input.expiresInHours) {
        expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + input.expiresInHours);
      }

      const token = generateRandomString(32);

      const link = await db.accessDistributionLink.create({
        data: {
          dynamicKeyId: input.dakId,
          token,
          maxUses: input.maxUses || null,
          expiresAt,
        },
      });

      return link;
    }),

  /**
   * Delete a distribution link
   */
  deleteDistributionLink: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const link = await db.accessDistributionLink.findUnique({
        where: { id: input.id },
        include: { dynamicKey: { select: { userId: true } } },
      });

      if (!link || (ctx.user.role !== 'ADMIN' && link.dynamicKey.userId !== ctx.user.id)) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      await db.accessDistributionLink.delete({
        where: { id: input.id },
      });

      return { success: true };
    }),
});
