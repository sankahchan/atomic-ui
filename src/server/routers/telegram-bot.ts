/**
 * Telegram Bot Router
 *
 * This router handles Telegram bot configuration and management.
 * The bot allows users to request their VPN keys via Telegram commands.
 */

import { z } from 'zod';
import { router, adminProcedure, protectedProcedure } from '../trpc';
import { db } from '@/lib/db';
import { TRPCError } from '@trpc/server';
import { writeAuditLog } from '@/lib/audit';
import {
  hasNotificationManageScope,
  hasTelegramAnnouncementManageScope,
  hasTelegramReviewManageScope,
} from '@/lib/admin-scope';
import { runTelegramDigestCycle } from '@/lib/services/telegram-digest';
import { normalizeLocalizedTemplateMap } from '@/lib/localized-templates';
import { coerceSupportedLocale } from '@/lib/i18n/config';
import {
  buildDefaultTelegramTemplateMap,
  DEFAULT_TELEGRAM_KEY_NOT_FOUND_MESSAGES,
  DEFAULT_TELEGRAM_WELCOME_MESSAGES,
} from '@/lib/services/telegram-copy';
import {
  TELEGRAM_SALES_SETTING_KEY,
  normalizeTelegramSalesSettings,
  telegramSalesPlanCodeSchema,
  telegramSalesSettingsSchema,
} from '@/lib/services/telegram-sales';
import {
  dispatchTelegramAnnouncement,
  getTelegramAnnouncementAudienceMap,
  listTelegramAnnouncementTargetOptions,
  type TelegramAnnouncementAudience,
  type TelegramAnnouncementType,
} from '@/lib/services/telegram-announcements';
import {
  approveTelegramOrder,
  approveTelegramPremiumSupportRequest,
  approveTelegramServerChangeRequest,
  dismissTelegramPremiumSupportRequest,
  handleTelegramPremiumSupportRequest,
  rejectTelegramOrder,
  rejectTelegramServerChangeRequest,
  replyTelegramPremiumSupportRequest,
  runTelegramSalesDigestCycle,
  updateTelegramOrderDraft,
} from '@/lib/services/telegram-bot';
import { parseDynamicRoutingPreferences } from '@/lib/services/dynamic-subscription-routing';

const TELEGRAM_ORDER_ACTIVE_WORKFLOW_STATUSES = new Set([
  'AWAITING_KEY_SELECTION',
  'AWAITING_PLAN',
  'AWAITING_MONTHS',
  'AWAITING_SERVER_SELECTION',
  'AWAITING_KEY_NAME',
  'AWAITING_PAYMENT_METHOD',
  'AWAITING_PAYMENT_PROOF',
  'PENDING_REVIEW',
  'APPROVED',
]);

type TelegramOrderRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type TelegramOrderRiskReason =
  | 'duplicate_proof'
  | 'repeated_rejections'
  | 'payment_history_mismatch'
  | 'retry_pattern'
  | 'multiple_open_orders'
  | 'resubmitted_proof';

const telegramAnnouncementAudienceSchema = z.enum([
  'ACTIVE_USERS',
  'STANDARD_USERS',
  'PREMIUM_USERS',
  'TRIAL_USERS',
]);

const telegramAnnouncementTypeSchema = z.enum([
  'INFO',
  'ANNOUNCEMENT',
  'PROMO',
  'NEW_SERVER',
  'MAINTENANCE',
]);

const telegramAnnouncementTemplateNameSchema = z.string().trim().min(2).max(80);
const telegramAnnouncementTargetFiltersSchema = z.object({
  tag: z.string().trim().min(1).max(64).nullable().optional(),
  serverId: z.string().trim().min(1).max(64).nullable().optional(),
  countryCode: z.string().trim().length(2).nullable().optional(),
});

function assertTelegramReviewScope(scope?: string | null) {
  if (!hasTelegramReviewManageScope(scope)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'You do not have permission to manage Telegram review workflows.',
    });
  }
}

function assertTelegramAnnouncementScope(scope?: string | null) {
  if (!hasTelegramAnnouncementManageScope(scope)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'You do not have permission to manage Telegram announcements or bot operations.',
    });
  }
}

function computeTelegramOrderRisk(input: {
  order: {
    id: string;
    duplicateProofOrderCode?: string | null;
    paymentProofRevision?: number | null;
    retryOfOrderId?: string | null;
  };
  identityOrders: Array<{
    id: string;
    status: string;
    createdAt: Date;
    rejectionReasonCode?: string | null;
    retryOfOrderId?: string | null;
  }>;
}) {
  let score = 0;
  const reasons: TelegramOrderRiskReason[] = [];
  const now = Date.now();
  const previousOrders = input.identityOrders.filter((candidate) => candidate.id !== input.order.id);
  const previousRejectedOrders = previousOrders.filter((candidate) => candidate.status === 'REJECTED');
  const recentRejectedOrders = previousRejectedOrders.filter(
    (candidate) => now - candidate.createdAt.getTime() <= 30 * 24 * 60 * 60 * 1000,
  );
  const mismatchHistoryCount = previousRejectedOrders.filter((candidate) =>
    candidate.rejectionReasonCode === 'wrong_payment_method' ||
    candidate.rejectionReasonCode === 'amount_mismatch',
  ).length;
  const retryCount = input.identityOrders.filter((candidate) => Boolean(candidate.retryOfOrderId)).length;
  const openOrders = input.identityOrders.filter((candidate) =>
    TELEGRAM_ORDER_ACTIVE_WORKFLOW_STATUSES.has(candidate.status),
  ).length;

  if (input.order.duplicateProofOrderCode) {
    score += 45;
    reasons.push('duplicate_proof');
  }

  if ((input.order.paymentProofRevision ?? 0) > 1) {
    score += 10;
    reasons.push('resubmitted_proof');
  }

  if (recentRejectedOrders.length >= 2 || previousRejectedOrders.length >= 3) {
    score += 20;
    reasons.push('repeated_rejections');
  } else if (previousRejectedOrders.length >= 1) {
    score += 10;
    reasons.push('repeated_rejections');
  }

  if (mismatchHistoryCount >= 1) {
    score += 10;
    reasons.push('payment_history_mismatch');
  }

  if (input.order.retryOfOrderId || retryCount >= 2) {
    score += input.order.retryOfOrderId ? 15 : 10;
    reasons.push('retry_pattern');
  }

  if (openOrders > 1) {
    score += 10;
    reasons.push('multiple_open_orders');
  }

  const riskScore = Math.min(100, score);
  const riskLevel: TelegramOrderRiskLevel =
    riskScore >= 70
      ? 'CRITICAL'
      : riskScore >= 45
        ? 'HIGH'
        : riskScore >= 20
          ? 'MEDIUM'
          : 'LOW';

  return {
    riskScore,
    riskLevel,
    riskReasons: Array.from(new Set(reasons)),
  };
}

async function ensureTelegramOrderAssignmentAccess(input: {
  orderId: string;
  userId?: string | null;
}) {
  const order = await db.telegramOrder.findUnique({
    where: { id: input.orderId },
    select: {
      id: true,
      orderCode: true,
      status: true,
      assignedReviewerUserId: true,
      assignedReviewerEmail: true,
    },
  });

  if (!order) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Telegram order not found.',
    });
  }

  if (
    order.assignedReviewerUserId &&
    order.assignedReviewerUserId !== input.userId
  ) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: `This order is claimed by ${order.assignedReviewerEmail || 'another admin'}.`,
    });
  }

  return order;
}

/**
 * Telegram Bot Settings Schema
 */
const telegramSettingsSchema = z.object({
  botToken: z.string().min(1, 'Bot token is required'),
  botUsername: z.string().optional(),
  welcomeMessage: z.string().optional(),
  keyNotFoundMessage: z.string().optional(),
  localizedWelcomeMessages: z.record(z.string(), z.string()).optional().default({}),
  localizedKeyNotFoundMessages: z.record(z.string(), z.string()).optional().default({}),
  isEnabled: z.boolean().default(true),
  adminChatIds: z.array(z.string()).optional().default([]),
  dailyDigestEnabled: z.boolean().default(false),
  dailyDigestHour: z.number().int().min(0).max(23).default(9),
  dailyDigestMinute: z.number().int().min(0).max(59).default(0),
  digestLookbackHours: z.number().int().min(1).max(168).default(24),
  defaultLanguage: z.enum(['en', 'my']).default('en'),
  showLanguageSelectorOnStart: z.boolean().default(true),
});

export const telegramBotRouter = router({
  /**
   * Get Telegram bot settings.
   */
  getSettings: protectedProcedure.query(async () => {
    const settings = await db.settings.findUnique({
      where: { key: 'telegram_bot' },
    });

    if (!settings) {
      return {
        botToken: '',
        botUsername: '',
        welcomeMessage: DEFAULT_TELEGRAM_WELCOME_MESSAGES.en,
        keyNotFoundMessage: DEFAULT_TELEGRAM_KEY_NOT_FOUND_MESSAGES.en,
        localizedWelcomeMessages: buildDefaultTelegramTemplateMap(DEFAULT_TELEGRAM_WELCOME_MESSAGES),
        localizedKeyNotFoundMessages: buildDefaultTelegramTemplateMap(
          DEFAULT_TELEGRAM_KEY_NOT_FOUND_MESSAGES,
        ),
        isEnabled: false,
        adminChatIds: [],
        dailyDigestEnabled: false,
        dailyDigestHour: 9,
        dailyDigestMinute: 0,
        digestLookbackHours: 24,
        defaultLanguage: 'en',
        showLanguageSelectorOnStart: true,
      };
    }

    try {
      const parsed = JSON.parse(settings.value);
      return {
        botToken: parsed.botToken || '',
        botUsername: parsed.botUsername || '',
        welcomeMessage: parsed.welcomeMessage || DEFAULT_TELEGRAM_WELCOME_MESSAGES.en,
        keyNotFoundMessage: parsed.keyNotFoundMessage || DEFAULT_TELEGRAM_KEY_NOT_FOUND_MESSAGES.en,
        localizedWelcomeMessages: buildDefaultTelegramTemplateMap(
          DEFAULT_TELEGRAM_WELCOME_MESSAGES,
          parsed.localizedWelcomeMessages,
        ),
        localizedKeyNotFoundMessages: buildDefaultTelegramTemplateMap(
          DEFAULT_TELEGRAM_KEY_NOT_FOUND_MESSAGES,
          parsed.localizedKeyNotFoundMessages,
        ),
        isEnabled: parsed.isEnabled ?? false,
        adminChatIds: parsed.adminChatIds || [],
        dailyDigestEnabled: parsed.dailyDigestEnabled ?? false,
        dailyDigestHour: parsed.dailyDigestHour ?? 9,
        dailyDigestMinute: parsed.dailyDigestMinute ?? 0,
        digestLookbackHours: parsed.digestLookbackHours ?? 24,
        defaultLanguage: coerceSupportedLocale(parsed.defaultLanguage) || 'en',
        showLanguageSelectorOnStart: parsed.showLanguageSelectorOnStart ?? true,
      };
    } catch {
      return {
        botToken: '',
        botUsername: '',
        welcomeMessage: DEFAULT_TELEGRAM_WELCOME_MESSAGES.en,
        keyNotFoundMessage: DEFAULT_TELEGRAM_KEY_NOT_FOUND_MESSAGES.en,
        localizedWelcomeMessages: buildDefaultTelegramTemplateMap(DEFAULT_TELEGRAM_WELCOME_MESSAGES),
        localizedKeyNotFoundMessages: buildDefaultTelegramTemplateMap(
          DEFAULT_TELEGRAM_KEY_NOT_FOUND_MESSAGES,
        ),
        isEnabled: false,
        adminChatIds: [],
        dailyDigestEnabled: false,
        dailyDigestHour: 9,
        dailyDigestMinute: 0,
        digestLookbackHours: 24,
        defaultLanguage: 'en',
        showLanguageSelectorOnStart: true,
      };
    }
  }),

  /**
   * Update Telegram bot settings.
   */
  updateSettings: adminProcedure
    .input(telegramSettingsSchema)
    .mutation(async ({ ctx, input }) => {
      assertTelegramAnnouncementScope(ctx.user.adminScope);
      await db.settings.upsert({
        where: { key: 'telegram_bot' },
        create: {
          key: 'telegram_bot',
          value: JSON.stringify(input),
        },
        update: {
          value: JSON.stringify(input),
        },
      });

      return { success: true };
    }),

  getSalesConfig: adminProcedure.query(async () => {
    const settings = await db.settings.findUnique({
      where: { key: TELEGRAM_SALES_SETTING_KEY },
      select: { value: true },
    });

    if (!settings) {
      return normalizeTelegramSalesSettings(null);
    }

    try {
      return normalizeTelegramSalesSettings(JSON.parse(settings.value));
    } catch {
      return normalizeTelegramSalesSettings(null);
    }
  }),

  updateSalesConfig: adminProcedure
    .input(telegramSalesSettingsSchema)
    .mutation(async ({ ctx, input }) => {
      assertTelegramAnnouncementScope(ctx.user.adminScope);
      const normalized = normalizeTelegramSalesSettings(input);

      await db.settings.upsert({
        where: { key: TELEGRAM_SALES_SETTING_KEY },
        create: {
          key: TELEGRAM_SALES_SETTING_KEY,
          value: JSON.stringify(normalized),
        },
        update: {
          value: JSON.stringify(normalized),
        },
      });

      return normalized;
    }),

  listOrders: adminProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).default(25),
          statuses: z.array(z.string()).optional(),
          kinds: z.array(z.enum(['NEW', 'RENEW'])).optional(),
          query: z.string().max(120).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      assertTelegramReviewScope(ctx.user.adminScope);
      const limit = input?.limit ?? 25;
      const statuses = input?.statuses?.filter(Boolean);
      const kinds = input?.kinds?.filter(Boolean);
      const query = input?.query?.trim();

      const filters: Array<Record<string, unknown>> = [];

      if (statuses?.length) {
        filters.push({
          status: {
            in: statuses,
          },
        });
      }

      if (kinds?.length) {
        filters.push({
          kind: {
            in: kinds,
          },
        });
      }

      if (query) {
        filters.push({
          OR: [
            { orderCode: { contains: query } },
            { telegramUsername: { contains: query } },
            { telegramUserId: { contains: query } },
            { requestedName: { contains: query } },
            { requestedEmail: { contains: query } },
            { planName: { contains: query } },
          ],
        });
      }

      const orders = await db.telegramOrder.findMany({
        where: filters.length ? { AND: filters } : undefined,
        orderBy: [{ createdAt: 'desc' }],
        take: limit,
        include: {
          reviewedBy: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      });

      const relatedKeyIds = Array.from(
        new Set(
          orders.flatMap((order) =>
            [order.targetAccessKeyId, order.approvedAccessKeyId].filter(
              (value): value is string => Boolean(value),
            ),
          ),
        ),
      );
      const relatedDynamicKeyIds = Array.from(
        new Set(
          orders.flatMap((order) =>
            [order.targetDynamicKeyId, order.approvedDynamicKeyId].filter(
              (value): value is string => Boolean(value),
            ),
          ),
        ),
      );
      const telegramUserIds = Array.from(new Set(orders.map((order) => order.telegramUserId).filter(Boolean)));
      const telegramChatIds = Array.from(new Set(orders.map((order) => order.telegramChatId).filter(Boolean)));
      const requestedEmails = Array.from(
        new Set(
          orders
            .map((order) => order.requestedEmail?.trim().toLowerCase())
            .filter((value): value is string => Boolean(value)),
        ),
      );

      const keys =
        relatedKeyIds.length || telegramUserIds.length || telegramChatIds.length || requestedEmails.length
        ? await db.accessKey.findMany({
            where: {
              OR: [
                ...(relatedKeyIds.length
                  ? [
                      {
                        id: {
                          in: relatedKeyIds,
                        },
                      },
                    ]
                  : []),
                ...(telegramUserIds.length
                  ? [
                      {
                        telegramId: {
                          in: telegramUserIds,
                        },
                      },
                    ]
                  : []),
                ...(telegramChatIds.length
                  ? [
                      {
                        user: {
                          telegramChatId: {
                            in: telegramChatIds,
                          },
                        },
                      },
                    ]
                  : []),
                ...(requestedEmails.length
                  ? [
                      {
                        email: {
                          in: requestedEmails,
                        },
                      },
                    ]
                  : []),
              ],
            },
            select: {
              id: true,
              name: true,
              status: true,
              email: true,
              telegramId: true,
              usedBytes: true,
              dataLimitBytes: true,
              expiresAt: true,
              publicSlug: true,
              subscriptionToken: true,
              user: {
                select: {
                  telegramChatId: true,
                },
              },
            },
          })
        : [];
      const keysById = new Map(keys.map((key) => [key.id, key]));
      const dynamicKeys =
        relatedDynamicKeyIds.length || telegramUserIds.length || telegramChatIds.length || requestedEmails.length
          ? await db.dynamicAccessKey.findMany({
              where: {
                OR: [
                  ...(relatedDynamicKeyIds.length
                    ? [
                        {
                          id: {
                            in: relatedDynamicKeyIds,
                          },
                        },
                      ]
                    : []),
                  ...(telegramUserIds.length
                    ? [
                        {
                          telegramId: {
                            in: telegramUserIds,
                          },
                        },
                      ]
                    : []),
                  ...(telegramChatIds.length
                    ? [
                        {
                          user: {
                            telegramChatId: {
                              in: telegramChatIds,
                            },
                          },
                        },
                      ]
                    : []),
                  ...(requestedEmails.length
                    ? [
                        {
                          email: {
                            in: requestedEmails,
                          },
                        },
                      ]
                    : []),
                ],
              },
              select: {
                id: true,
                name: true,
                status: true,
                email: true,
                telegramId: true,
                usedBytes: true,
                dataLimitBytes: true,
                expiresAt: true,
                publicSlug: true,
                dynamicUrl: true,
                user: {
                  select: {
                    telegramChatId: true,
                  },
                },
              },
            })
          : [];
      const dynamicKeysById = new Map(dynamicKeys.map((key) => [key.id, key]));

      const profiles =
        telegramUserIds.length || telegramChatIds.length
          ? await db.telegramUserProfile.findMany({
              where: {
                OR: [
                  ...(telegramUserIds.length
                    ? [
                        {
                          telegramUserId: {
                            in: telegramUserIds,
                          },
                        },
                      ]
                    : []),
                  ...(telegramChatIds.length
                    ? [
                        {
                          telegramChatId: {
                            in: telegramChatIds,
                          },
                        },
                      ]
                    : []),
                ],
              },
              select: {
                telegramUserId: true,
                telegramChatId: true,
                username: true,
                displayName: true,
                locale: true,
                createdAt: true,
                updatedAt: true,
              },
            })
          : [];

      const relatedOrders =
        telegramUserIds.length || telegramChatIds.length
          ? await db.telegramOrder.findMany({
              where: {
                OR: [
                  ...(telegramUserIds.length
                    ? [
                        {
                          telegramUserId: {
                            in: telegramUserIds,
                          },
                        },
                      ]
                    : []),
                  ...(telegramChatIds.length
                    ? [
                        {
                          telegramChatId: {
                            in: telegramChatIds,
                          },
                        },
                      ]
                    : []),
                ],
              },
              orderBy: [{ createdAt: 'desc' }],
              take: Math.max(limit * 6, 120),
              select: {
                id: true,
                orderCode: true,
                status: true,
                kind: true,
                telegramUserId: true,
                telegramChatId: true,
                requestedEmail: true,
                planName: true,
                retryOfOrderId: true,
                rejectionReasonCode: true,
                approvedAccessKeyId: true,
                approvedDynamicKeyId: true,
                createdAt: true,
                fulfilledAt: true,
                rejectedAt: true,
              },
            })
          : [];

      const normalizeEmail = (value?: string | null) => value?.trim().toLowerCase() || null;
      const matchesOrderIdentity = (
        order: (typeof orders)[number],
        candidate: {
          telegramUserId?: string | null;
          telegramChatId?: string | null;
          requestedEmail?: string | null;
        },
      ) => {
        if (candidate.telegramUserId && candidate.telegramUserId === order.telegramUserId) {
          return true;
        }

        if (candidate.telegramChatId && candidate.telegramChatId === order.telegramChatId) {
          return true;
        }

        const orderEmail = normalizeEmail(order.requestedEmail);
        const candidateEmail = normalizeEmail(candidate.requestedEmail);
        return Boolean(orderEmail && candidateEmail && orderEmail === candidateEmail);
      };

      type CustomerLinkedKey = {
        id: string;
        type: 'ACCESS_KEY' | 'DYNAMIC_KEY';
        name: string;
        status: string;
        email: string | null;
        publicSlug: string | null;
        usedBytes: string;
        dataLimitBytes: string | null;
        expiresAt: Date | null;
      };

      return orders.map((order) => {
        const identityOrders = relatedOrders.filter((candidate) => matchesOrderIdentity(order, candidate));
        const risk = computeTelegramOrderRisk({
          order,
          identityOrders,
        });
        const accessLinkedEntries: Array<[string, CustomerLinkedKey]> = keys
          .filter((key) => {
            const emailMatch =
              normalizeEmail(order.requestedEmail) &&
              normalizeEmail(key.email) === normalizeEmail(order.requestedEmail);
            return (
              key.id === order.targetAccessKeyId ||
              key.id === order.approvedAccessKeyId ||
              key.telegramId === order.telegramUserId ||
              key.user?.telegramChatId === order.telegramChatId ||
              emailMatch
            );
          })
          .map((key) => [
            `access:${key.id}`,
            {
              id: key.id,
              type: 'ACCESS_KEY',
              name: key.name,
              status: key.status,
              email: key.email,
              publicSlug: key.publicSlug,
              usedBytes: key.usedBytes.toString(),
              dataLimitBytes: key.dataLimitBytes?.toString() ?? null,
              expiresAt: key.expiresAt,
            },
          ]);

        const dynamicLinkedEntries: Array<[string, CustomerLinkedKey]> = dynamicKeys
          .filter((key) => {
            const emailMatch =
              normalizeEmail(order.requestedEmail) &&
              normalizeEmail(key.email) === normalizeEmail(order.requestedEmail);
            return (
              key.id === order.targetDynamicKeyId ||
              key.id === order.approvedDynamicKeyId ||
              key.telegramId === order.telegramUserId ||
              key.user?.telegramChatId === order.telegramChatId ||
              emailMatch
            );
          })
          .map((key) => [
            `dynamic:${key.id}`,
            {
              id: key.id,
              type: 'DYNAMIC_KEY',
              name: key.name,
              status: key.status,
              email: key.email,
              publicSlug: key.publicSlug,
              usedBytes: key.usedBytes.toString(),
              dataLimitBytes: key.dataLimitBytes?.toString() ?? null,
              expiresAt: key.expiresAt,
            },
          ]);

        return {
          ...order,
          dataLimitBytes: order.dataLimitBytes?.toString() ?? null,
          deliveryType: order.deliveryType ?? 'ACCESS_KEY',
          dynamicTemplateId: order.dynamicTemplateId ?? null,
          targetAccessKeyName: order.targetAccessKeyId
            ? keysById.get(order.targetAccessKeyId)?.name ?? null
            : null,
          targetDynamicKeyName: order.targetDynamicKeyId
            ? dynamicKeysById.get(order.targetDynamicKeyId)?.name ?? null
            : null,
          approvedAccessKeyName: order.approvedAccessKeyId
            ? keysById.get(order.approvedAccessKeyId)?.name ?? null
            : null,
          approvedAccessKeySlug: order.approvedAccessKeyId
            ? keysById.get(order.approvedAccessKeyId)?.publicSlug ?? null
            : null,
          approvedDynamicKeyName: order.approvedDynamicKeyId
            ? dynamicKeysById.get(order.approvedDynamicKeyId)?.name ?? null
            : null,
          approvedDynamicKeySlug: order.approvedDynamicKeyId
            ? dynamicKeysById.get(order.approvedDynamicKeyId)?.publicSlug ?? null
            : null,
          customerProfile:
            profiles.find(
              (profile) =>
                profile.telegramUserId === order.telegramUserId ||
                profile.telegramChatId === order.telegramChatId,
            ) ?? null,
          customerLinkedKeys: Array.from(
            new Map<string, CustomerLinkedKey>([
              ...accessLinkedEntries,
              ...dynamicLinkedEntries,
            ]).values(),
          ).slice(0, 5),
          customerRecentOrders: identityOrders
            .filter((candidate) => candidate.id !== order.id)
            .slice(0, 4)
            .map((candidate) => ({
              id: candidate.id,
              orderCode: candidate.orderCode,
              status: candidate.status,
              kind: candidate.kind,
              planName: candidate.planName,
              approvedAccessKeyName: candidate.approvedAccessKeyId
                ? keysById.get(candidate.approvedAccessKeyId)?.name ?? null
                : null,
              approvedDynamicKeyName: candidate.approvedDynamicKeyId
                ? dynamicKeysById.get(candidate.approvedDynamicKeyId)?.name ?? null
                : null,
              createdAt: candidate.createdAt,
              fulfilledAt: candidate.fulfilledAt,
              rejectedAt: candidate.rejectedAt,
            })),
          riskScore: risk.riskScore,
          riskLevel: risk.riskLevel,
          riskReasons: risk.riskReasons,
          assignedReviewerUserId: order.assignedReviewerUserId,
          assignedReviewerEmail: order.assignedReviewerEmail,
          assignedAt: order.assignedAt,
          customerSummary: (() => {
            const lastFulfilled = identityOrders.find((candidate) => candidate.status === 'FULFILLED');
            return {
              totalOrders: identityOrders.length,
              pendingOrders: identityOrders.filter((candidate) => candidate.status === 'PENDING_REVIEW').length,
              fulfilledOrders: identityOrders.filter((candidate) => candidate.status === 'FULFILLED').length,
              rejectedOrders: identityOrders.filter((candidate) => candidate.status === 'REJECTED').length,
              lastOrderAt: identityOrders[0]?.createdAt ?? null,
              lastFulfilledAt: lastFulfilled?.fulfilledAt ?? lastFulfilled?.createdAt ?? null,
            };
          })(),
        };
      });
    }),

  listOrderReviewers: adminProcedure.query(async ({ ctx }) => {
    assertTelegramReviewScope(ctx.user.adminScope);
    const reviewers = await db.user.findMany({
      where: {
        role: 'ADMIN',
      },
      orderBy: [{ email: 'asc' }],
      select: {
        id: true,
        email: true,
        role: true,
      },
    });

    return reviewers.map((reviewer) => ({
      id: reviewer.id,
      email: reviewer.email,
      role: reviewer.role,
    }));
  }),

  claimOrder: adminProcedure
    .input(
      z.object({
        orderId: z.string(),
        claimed: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertTelegramReviewScope(ctx.user.adminScope);
      const order = await db.telegramOrder.findUnique({
        where: { id: input.orderId },
        select: {
          id: true,
          orderCode: true,
          status: true,
          assignedReviewerUserId: true,
          assignedReviewerEmail: true,
          assignedAt: true,
        },
      });

      if (!order) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Telegram order not found.',
        });
      }

      if (order.status !== 'PENDING_REVIEW') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Only pending-review orders can be claimed.',
        });
      }

      if (input.claimed) {
        if (order.assignedReviewerUserId && order.assignedReviewerUserId !== ctx.user.id) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `This order is already claimed by ${order.assignedReviewerEmail || 'another admin'}.`,
          });
        }

        const claimedOrder = await db.telegramOrder.update({
          where: { id: order.id },
          data: {
            assignedReviewerUserId: ctx.user.id,
            assignedReviewerEmail: ctx.user.email || null,
            assignedAt: new Date(),
          },
          select: {
            id: true,
            orderCode: true,
            assignedReviewerUserId: true,
            assignedReviewerEmail: true,
            assignedAt: true,
          },
        });

        await writeAuditLog({
          userId: ctx.user.id,
          action: 'TELEGRAM_ORDER_CLAIMED',
          entity: 'TELEGRAM_ORDER',
          entityId: order.id,
          details: {
            orderCode: order.orderCode,
            assignedReviewerEmail: ctx.user.email || null,
          },
        });

        return claimedOrder;
      }

      if (order.assignedReviewerUserId && order.assignedReviewerUserId !== ctx.user.id) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `This order is claimed by ${order.assignedReviewerEmail || 'another admin'}.`,
        });
      }

      const releasedOrder = await db.telegramOrder.update({
        where: { id: order.id },
        data: {
          assignedReviewerUserId: null,
          assignedReviewerEmail: null,
          assignedAt: null,
        },
        select: {
          id: true,
          orderCode: true,
          assignedReviewerUserId: true,
          assignedReviewerEmail: true,
          assignedAt: true,
        },
      });

      await writeAuditLog({
        userId: ctx.user.id,
        action: 'TELEGRAM_ORDER_RELEASED',
        entity: 'TELEGRAM_ORDER',
        entityId: order.id,
        details: {
          orderCode: order.orderCode,
          previousAssignedReviewerEmail: order.assignedReviewerEmail || null,
        },
      });

      return releasedOrder;
    }),

  assignOrderReviewer: adminProcedure
    .input(
      z.object({
        orderId: z.string(),
        reviewerUserId: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertTelegramReviewScope(ctx.user.adminScope);
      const order = await db.telegramOrder.findUnique({
        where: { id: input.orderId },
        select: {
          id: true,
          orderCode: true,
          status: true,
          assignedReviewerUserId: true,
          assignedReviewerEmail: true,
          assignedAt: true,
        },
      });

      if (!order) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Telegram order not found.',
        });
      }

      if (order.status !== 'PENDING_REVIEW') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Only pending-review orders can be reassigned.',
        });
      }

      let nextReviewer: { id: string; email: string; role: string } | null = null;
      if (input.reviewerUserId) {
        nextReviewer = await db.user.findUnique({
          where: { id: input.reviewerUserId },
          select: {
            id: true,
            email: true,
            role: true,
          },
        });

        if (!nextReviewer || nextReviewer.role !== 'ADMIN') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Selected reviewer is not a valid admin.',
          });
        }
      }

      const isUnchanged =
        (nextReviewer?.id || null) === (order.assignedReviewerUserId || null) &&
        (nextReviewer?.email || null) === (order.assignedReviewerEmail || null);

      if (isUnchanged) {
        return {
          id: order.id,
          orderCode: order.orderCode,
          assignedReviewerUserId: order.assignedReviewerUserId,
          assignedReviewerEmail: order.assignedReviewerEmail,
          assignedAt: order.assignedAt,
        };
      }

      const updatedOrder = await db.telegramOrder.update({
        where: { id: order.id },
        data: {
          assignedReviewerUserId: nextReviewer?.id || null,
          assignedReviewerEmail: nextReviewer?.email || null,
          assignedAt: nextReviewer ? new Date() : null,
        },
        select: {
          id: true,
          orderCode: true,
          assignedReviewerUserId: true,
          assignedReviewerEmail: true,
          assignedAt: true,
        },
      });

      await writeAuditLog({
        userId: ctx.user.id,
        action: nextReviewer ? 'TELEGRAM_ORDER_REASSIGNED' : 'TELEGRAM_ORDER_UNASSIGNED',
        entity: 'TELEGRAM_ORDER',
        entityId: order.id,
        details: {
          orderCode: order.orderCode,
          previousAssignedReviewerEmail: order.assignedReviewerEmail || null,
          assignedReviewerEmail: nextReviewer?.email || null,
        },
      });

      return updatedOrder;
    }),

  applyOrderMacro: adminProcedure
    .input(
      z.object({
        orderId: z.string(),
        macro: z.enum([
          'APPROVE_QUICK',
          'REJECT_DUPLICATE',
          'REJECT_BLURRY',
          'REJECT_WRONG_AMOUNT',
          'REJECT_WRONG_METHOD',
        ]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertTelegramReviewScope(ctx.user.adminScope);
      const order = await ensureTelegramOrderAssignmentAccess({
        orderId: input.orderId,
        userId: ctx.user.id,
      });

      if (order.status !== 'PENDING_REVIEW') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Only pending-review orders can use review macros.',
        });
      }

      if (input.macro === 'APPROVE_QUICK') {
        const result = await approveTelegramOrder({
          orderId: input.orderId,
          reviewedByUserId: ctx.user.id,
          reviewerName: ctx.user.email || undefined,
          adminNote: 'Approved with quick-review macro.',
        });

        await writeAuditLog({
          userId: ctx.user.id,
          action: 'TELEGRAM_ORDER_MACRO_APPLIED',
          entity: 'TELEGRAM_ORDER',
          entityId: input.orderId,
          details: {
            orderCode: order.orderCode,
            macro: input.macro,
          },
        });

        return {
          action: 'APPROVED' as const,
          result,
        };
      }

      const reasonCode =
        input.macro === 'REJECT_DUPLICATE'
          ? 'duplicate_payment'
          : input.macro === 'REJECT_BLURRY'
            ? 'proof_unclear'
            : input.macro === 'REJECT_WRONG_AMOUNT'
              ? 'amount_mismatch'
              : 'wrong_payment_method';

      const result = await rejectTelegramOrder({
        orderId: input.orderId,
        reviewedByUserId: ctx.user.id,
        reviewerName: ctx.user.email || undefined,
        adminNote: `Rejected with quick-review macro: ${reasonCode}.`,
        reasonCode,
      });

      await writeAuditLog({
        userId: ctx.user.id,
        action: 'TELEGRAM_ORDER_MACRO_APPLIED',
        entity: 'TELEGRAM_ORDER',
        entityId: input.orderId,
        details: {
          orderCode: order.orderCode,
          macro: input.macro,
          reasonCode,
        },
      });

      return {
        action: 'REJECTED' as const,
        result,
      };
    }),

  listServerChangeRequests: adminProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).default(25),
          statuses: z.array(z.string()).optional(),
          query: z.string().max(120).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      assertTelegramReviewScope(ctx.user.adminScope);
      const limit = input?.limit ?? 25;
      const statuses = input?.statuses?.filter(Boolean);
      const query = input?.query?.trim();

      const filters: Array<Record<string, unknown>> = [];
      if (statuses?.length) {
        filters.push({
          status: {
            in: statuses,
          },
        });
      }

      if (query) {
        filters.push({
          OR: [
            { requestCode: { contains: query } },
            { telegramUsername: { contains: query } },
            { telegramUserId: { contains: query } },
            { currentServerName: { contains: query } },
            { requestedServerName: { contains: query } },
            {
              accessKey: {
                name: {
                  contains: query,
                },
              },
            },
          ],
        });
      }

      const requests = await db.telegramServerChangeRequest.findMany({
        where: filters.length ? { AND: filters } : undefined,
        orderBy: [{ createdAt: 'desc' }],
        take: limit,
        include: {
          accessKey: {
            select: {
              id: true,
              name: true,
              status: true,
              telegramId: true,
              email: true,
              usedBytes: true,
              dataLimitBytes: true,
              expiresAt: true,
              publicSlug: true,
              serverChangeCount: true,
              serverChangeLimit: true,
            },
          },
        },
      });

      return requests.map((request) => ({
        ...request,
        accessKey: {
          ...request.accessKey,
          usedBytes: request.accessKey.usedBytes.toString(),
          dataLimitBytes: request.accessKey.dataLimitBytes?.toString() ?? null,
        },
        remainingChangesBeforeApproval: Math.max(
          0,
          request.accessKey.serverChangeLimit - request.accessKey.serverChangeCount,
        ),
        remainingChangesAfterApproval: Math.max(
          0,
          request.accessKey.serverChangeLimit - request.accessKey.serverChangeCount - 1,
        ),
      }));
    }),

  listPremiumSupportRequests: adminProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).default(25),
          statuses: z.array(z.string()).optional(),
          requestTypes: z.array(z.enum(['REGION_CHANGE', 'ROUTE_ISSUE'])).optional(),
          query: z.string().max(120).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      assertTelegramReviewScope(ctx.user.adminScope);
      const limit = input?.limit ?? 25;
      const statuses = input?.statuses?.filter(Boolean);
      const requestTypes = input?.requestTypes?.filter(Boolean);
      const query = input?.query?.trim();

      const filters: Array<Record<string, unknown>> = [];
      if (statuses?.length) {
        filters.push({ status: { in: statuses } });
      }
      if (requestTypes?.length) {
        filters.push({ requestType: { in: requestTypes } });
      }
      if (query) {
        filters.push({
          OR: [
            { requestCode: { contains: query } },
            { telegramUsername: { contains: query } },
            { telegramUserId: { contains: query } },
            { requestedRegionCode: { contains: query } },
            { currentResolvedServerName: { contains: query } },
            {
              dynamicAccessKey: {
                name: {
                  contains: query,
                },
              },
            },
          ],
        });
      }

      const requests = await (db as any).telegramPremiumSupportRequest.findMany({
        where: filters.length ? { AND: filters } : undefined,
        orderBy: [{ updatedAt: 'desc' }],
        take: limit,
        include: {
          reviewedBy: {
            select: {
              id: true,
              email: true,
            },
          },
          linkedOutageIncident: {
            select: {
              id: true,
              incidentCode: true,
              status: true,
              startedAt: true,
              userAlertSentAt: true,
              migrationTargetServerName: true,
              recoveredAt: true,
            },
          },
          dynamicAccessKey: {
            select: {
              id: true,
              name: true,
              status: true,
              dynamicUrl: true,
              publicSlug: true,
              lastResolvedServerId: true,
              lastResolvedAt: true,
              preferredCountryCodesJson: true,
              preferredRegionMode: true,
              pinnedServerId: true,
              pinExpiresAt: true,
              notes: true,
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
          },
          replies: {
            orderBy: [{ createdAt: 'asc' }],
            take: 12,
          },
        },
      });

      return requests.map((request: any) => {
        const preferredCountries = parseDynamicRoutingPreferences({
          preferredCountryCodesJson: request.dynamicAccessKey.preferredCountryCodesJson,
          preferredRegionMode: request.dynamicAccessKey.preferredRegionMode,
        }).preferredCountryCodes;
        const attachedCountries = Array.from(
          new Set(
            request.dynamicAccessKey.accessKeys
              .map((accessKey: any) => accessKey.server?.countryCode?.toUpperCase())
              .filter((value: any): value is string => Boolean(value)),
          ),
        );
        const availableRegionCodes = Array.from(
          new Set([
            ...preferredCountries.map((code) => code.toUpperCase()),
            ...attachedCountries,
            request.requestedRegionCode?.toUpperCase() || '',
          ].filter(Boolean)),
        );
        const availablePinServers = Array.from(
          new Map(
            request.dynamicAccessKey.accessKeys
              .filter((accessKey: any) => accessKey.server)
              .map((accessKey: any) => [
                accessKey.server!.id,
                {
                  id: accessKey.server!.id,
                  name: accessKey.server!.name,
                  countryCode: accessKey.server!.countryCode || null,
                },
              ]),
          ).values(),
        );

        return {
          ...request,
          linkedOutage: request.linkedOutageIncident
            ? {
                id: request.linkedOutageIncident.id,
                incidentCode: request.linkedOutageIncident.incidentCode,
                status: request.linkedOutageIncident.status,
                startedAt: request.linkedOutageIncident.startedAt,
                userAlertSentAt: request.linkedOutageIncident.userAlertSentAt,
                migrationTargetServerName: request.linkedOutageIncident.migrationTargetServerName,
                recoveredAt: request.linkedOutageIncident.recoveredAt,
                serverId: request.linkedOutageServerId,
                serverName: request.linkedOutageServerName,
              }
            : null,
          dynamicAccessKey: {
            ...request.dynamicAccessKey,
            availableRegionCodes,
            availablePinServers,
          },
        };
      });
    }),

  replyPremiumSupportRequest: adminProcedure
    .input(
      z.object({
        requestId: z.string(),
        adminNote: z.string().max(1000).optional().nullable(),
        customerMessage: z.string().min(1).max(1000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertTelegramReviewScope(ctx.user.adminScope);
      return replyTelegramPremiumSupportRequest({
        requestId: input.requestId,
        reviewedByUserId: ctx.user.id,
        reviewerName: ctx.user.email || null,
        adminNote: input.adminNote,
        customerMessage: input.customerMessage,
      });
    }),

  approveOrder: adminProcedure
    .input(
      z.object({
        orderId: z.string(),
        adminNote: z.string().max(1000).optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertTelegramReviewScope(ctx.user.adminScope);
      await ensureTelegramOrderAssignmentAccess({
        orderId: input.orderId,
        userId: ctx.user.id,
      });
      return approveTelegramOrder({
        orderId: input.orderId,
        reviewedByUserId: ctx.user.id,
        reviewerName: ctx.user.email || null,
        adminNote: input.adminNote,
      });
    }),

  updateOrderDraft: adminProcedure
    .input(
      z.object({
        orderId: z.string(),
        planCode: telegramSalesPlanCodeSchema.optional().nullable(),
        durationMonths: z.number().int().min(1).max(24).optional().nullable(),
        selectedServerId: z.string().optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertTelegramReviewScope(ctx.user.adminScope);
      await ensureTelegramOrderAssignmentAccess({
        orderId: input.orderId,
        userId: ctx.user.id,
      });
      return updateTelegramOrderDraft({
        orderId: input.orderId,
        updatedByUserId: ctx.user.id,
        updaterName: ctx.user.email || null,
        planCode: input.planCode,
        durationMonths: input.durationMonths,
        selectedServerId: input.selectedServerId,
      });
    }),

  rejectOrder: adminProcedure
    .input(
      z.object({
        orderId: z.string(),
        adminNote: z.string().max(1000).optional().nullable(),
        customerMessage: z.string().max(1000).optional().nullable(),
        reasonCode: z.string().max(64).optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertTelegramReviewScope(ctx.user.adminScope);
      await ensureTelegramOrderAssignmentAccess({
        orderId: input.orderId,
        userId: ctx.user.id,
      });
      return rejectTelegramOrder({
        orderId: input.orderId,
        reviewedByUserId: ctx.user.id,
        reviewerName: ctx.user.email || null,
        adminNote: input.adminNote,
        customerMessage: input.customerMessage,
        reasonCode: input.reasonCode,
      });
    }),

  approveServerChangeRequest: adminProcedure
    .input(
      z.object({
        requestId: z.string(),
        adminNote: z.string().max(1000).optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertTelegramReviewScope(ctx.user.adminScope);
      return approveTelegramServerChangeRequest({
        requestId: input.requestId,
        reviewedByUserId: ctx.user.id,
        reviewerName: ctx.user.email || null,
        adminNote: input.adminNote,
      });
    }),

  rejectServerChangeRequest: adminProcedure
    .input(
      z.object({
        requestId: z.string(),
        adminNote: z.string().max(1000).optional().nullable(),
        customerMessage: z.string().max(1000).optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertTelegramReviewScope(ctx.user.adminScope);
      return rejectTelegramServerChangeRequest({
        requestId: input.requestId,
        reviewedByUserId: ctx.user.id,
        reviewerName: ctx.user.email || null,
        adminNote: input.adminNote,
        customerMessage: input.customerMessage,
      });
    }),

  approvePremiumSupportRequest: adminProcedure
    .input(
      z.object({
        requestId: z.string(),
        adminNote: z.string().max(1000).optional().nullable(),
        customerMessage: z.string().max(1000).optional().nullable(),
        approvedRegionCode: z.string().max(16).optional().nullable(),
        pinServerId: z.string().optional().nullable(),
        pinExpiresInMinutes: z.number().int().min(5).max(7 * 24 * 60).optional().nullable(),
        appendNoteToKey: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertTelegramReviewScope(ctx.user.adminScope);
      return approveTelegramPremiumSupportRequest({
        requestId: input.requestId,
        reviewedByUserId: ctx.user.id,
        reviewerName: ctx.user.email || null,
        adminNote: input.adminNote,
        customerMessage: input.customerMessage,
        approvedRegionCode: input.approvedRegionCode,
        pinServerId: input.pinServerId,
        pinExpiresInMinutes: input.pinExpiresInMinutes,
        appendNoteToKey: input.appendNoteToKey,
      });
    }),

  handlePremiumSupportRequest: adminProcedure
    .input(
      z.object({
        requestId: z.string(),
        adminNote: z.string().max(1000).optional().nullable(),
        customerMessage: z.string().max(1000).optional().nullable(),
        pinServerId: z.string().optional().nullable(),
        pinExpiresInMinutes: z.number().int().min(5).max(7 * 24 * 60).optional().nullable(),
        appendNoteToKey: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertTelegramReviewScope(ctx.user.adminScope);
      return handleTelegramPremiumSupportRequest({
        requestId: input.requestId,
        reviewedByUserId: ctx.user.id,
        reviewerName: ctx.user.email || null,
        adminNote: input.adminNote,
        customerMessage: input.customerMessage,
        pinServerId: input.pinServerId,
        pinExpiresInMinutes: input.pinExpiresInMinutes,
        appendNoteToKey: input.appendNoteToKey,
      });
    }),

  dismissPremiumSupportRequest: adminProcedure
    .input(
      z.object({
        requestId: z.string(),
        adminNote: z.string().max(1000).optional().nullable(),
        customerMessage: z.string().max(1000).optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertTelegramReviewScope(ctx.user.adminScope);
      return dismissTelegramPremiumSupportRequest({
        requestId: input.requestId,
        reviewedByUserId: ctx.user.id,
        reviewerName: ctx.user.email || null,
        adminNote: input.adminNote,
        customerMessage: input.customerMessage,
      });
    }),

  /**
   * Test the bot connection.
   */
  testConnection: adminProcedure
    .input(z.object({ botToken: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertTelegramAnnouncementScope(ctx.user.adminScope);
      try {
        const response = await fetch(`https://api.telegram.org/bot${input.botToken}/getMe`);
        const data = await response.json();

        if (!data.ok) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: data.description || 'Invalid bot token',
          });
        }

        return {
          success: true,
          botUsername: data.result.username,
          botName: data.result.first_name,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to connect to Telegram: ${(error as Error).message}`,
        });
      }
    }),

  /**
   * Get webhook info.
   */
  getWebhookInfo: adminProcedure.query(async ({ ctx }) => {
    assertTelegramAnnouncementScope(ctx.user.adminScope);
    const settings = await db.settings.findUnique({
      where: { key: 'telegram_bot' },
    });

    if (!settings) {
      return { webhookSet: false };
    }

    try {
      const parsed = JSON.parse(settings.value);
      if (!parsed.botToken) {
        return { webhookSet: false };
      }

      const response = await fetch(`https://api.telegram.org/bot${parsed.botToken}/getWebhookInfo`);
      const data = await response.json();

      return {
        webhookSet: !!data.result?.url,
        webhookUrl: data.result?.url || null,
        pendingUpdateCount: data.result?.pending_update_count || 0,
        lastErrorDate: data.result?.last_error_date || null,
        lastErrorMessage: data.result?.last_error_message || null,
      };
    } catch {
      return { webhookSet: false };
    }
  }),

  /**
   * Set webhook URL for the bot.
   */
  setWebhook: adminProcedure
    .input(z.object({ webhookUrl: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      assertTelegramAnnouncementScope(ctx.user.adminScope);
      const settings = await db.settings.findUnique({
        where: { key: 'telegram_bot' },
      });

      if (!settings) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Bot settings not configured',
        });
      }

      const parsed = JSON.parse(settings.value);
      if (!parsed.botToken) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Bot token not configured',
        });
      }

      const response = await fetch(
        `https://api.telegram.org/bot${parsed.botToken}/setWebhook`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: input.webhookUrl,
            allowed_updates: ['message', 'callback_query'],
          }),
        },
      );
      const data = await response.json();

      if (!data.ok) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: data.description || 'Failed to set webhook',
        });
      }

      return { success: true };
    }),

  /**
   * Delete webhook.
   */
  deleteWebhook: adminProcedure.mutation(async ({ ctx }) => {
    assertTelegramAnnouncementScope(ctx.user.adminScope);
    const settings = await db.settings.findUnique({
      where: { key: 'telegram_bot' },
    });

    if (!settings) {
      return { success: true };
    }

    const parsed = JSON.parse(settings.value);
    if (!parsed.botToken) {
      return { success: true };
    }

    const response = await fetch(`https://api.telegram.org/bot${parsed.botToken}/deleteWebhook`);
    const data = await response.json();

    return { success: data.ok };
  }),

  runDigestNow: adminProcedure.mutation(async ({ ctx }) => {
    assertTelegramAnnouncementScope(ctx.user.adminScope);
    const result = await runTelegramDigestCycle({ force: true });

    if (result.skipped) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Telegram digest skipped: ${result.reason}`,
      });
    }

    return result;
  }),

  runSalesDigestNow: adminProcedure.mutation(async ({ ctx }) => {
    assertTelegramAnnouncementScope(ctx.user.adminScope);
    const result = await runTelegramSalesDigestCycle({ force: true });

    if (result.skipped) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Telegram sales digest skipped: ${result.reason}`,
      });
    }

    return result;
  }),

  getAnnouncementAudienceCounts: adminProcedure
    .input(telegramAnnouncementTargetFiltersSchema.optional())
    .query(async ({ ctx, input }) => {
      assertTelegramAnnouncementScope(ctx.user.adminScope);
      const audienceMap = await getTelegramAnnouncementAudienceMap(input);
      return {
        ACTIVE_USERS: audienceMap.ACTIVE_USERS.length,
        STANDARD_USERS: audienceMap.STANDARD_USERS.length,
        PREMIUM_USERS: audienceMap.PREMIUM_USERS.length,
        TRIAL_USERS: audienceMap.TRIAL_USERS.length,
      };
    }),

  listAnnouncementTargetOptions: adminProcedure.query(async ({ ctx }) => {
    assertTelegramAnnouncementScope(ctx.user.adminScope);
    return listTelegramAnnouncementTargetOptions();
  }),

  sendAnnouncement: adminProcedure
    .input(
      z.object({
        audience: telegramAnnouncementAudienceSchema.default('ACTIVE_USERS'),
        type: telegramAnnouncementTypeSchema.default('ANNOUNCEMENT'),
        filters: telegramAnnouncementTargetFiltersSchema.optional(),
        title: z.string().trim().min(3).max(120),
        message: z.string().trim().min(10).max(2000),
        heroImageUrl: z.string().trim().max(1000).optional().nullable(),
        includeSupportButton: z.boolean().default(true),
        scheduledFor: z.string().datetime().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertTelegramAnnouncementScope(ctx.user.adminScope);
      const audienceMap = await getTelegramAnnouncementAudienceMap(input.filters);
      const chatIds = audienceMap[input.audience];
      if (chatIds.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No Telegram users matched the selected audience.',
        });
      }

      const scheduledFor = input.scheduledFor ? new Date(input.scheduledFor) : null;
      if (scheduledFor && Number.isNaN(scheduledFor.getTime())) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invalid schedule time.',
        });
      }

      const targetServer = input.filters?.serverId
        ? await db.server.findUnique({
            where: { id: input.filters.serverId },
            select: { id: true, name: true, countryCode: true },
          })
        : null;

      const announcement = await db.telegramAnnouncement.create({
        data: {
          audience: input.audience,
          type: input.type,
          targetTag: input.filters?.tag?.trim().toLowerCase() || null,
          targetServerId: targetServer?.id || null,
          targetServerName: targetServer?.name || null,
          targetCountryCode: (input.filters?.countryCode || targetServer?.countryCode || null)?.trim().toUpperCase() || null,
          title: input.title.trim(),
          message: input.message.trim(),
          heroImageUrl: input.heroImageUrl?.trim() || null,
          includeSupportButton: input.includeSupportButton,
          status: scheduledFor && scheduledFor.getTime() > Date.now() ? 'SCHEDULED' : 'PROCESSING',
          scheduledFor,
          totalRecipients: chatIds.length,
          createdByUserId: ctx.user.id,
          createdByEmail: ctx.user.email ?? null,
        },
      });

      let sentCount = 0;
      let failedCount = 0;
      let status = announcement.status;
      let scheduled = status === 'SCHEDULED';

      if (!scheduled) {
        const result = await dispatchTelegramAnnouncement({
          announcementId: announcement.id,
        });
        if (result.skipped) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Announcement skipped: ${result.reason}`,
          });
        }
        sentCount = result.sentCount;
        failedCount = result.failedCount;
        status = result.status;
      }

      await writeAuditLog({
        userId: ctx.user.id,
        ip: ctx.clientIp,
        action: scheduled ? 'TELEGRAM_ANNOUNCEMENT_SCHEDULE' : 'TELEGRAM_ANNOUNCEMENT_SEND',
        entity: 'TELEGRAM',
        entityId: announcement.id,
        details: {
          audience: input.audience,
          type: input.type,
          title: input.title,
          includeSupportButton: input.includeSupportButton,
          sentCount,
          failedCount,
          scheduledFor: scheduledFor?.toISOString() ?? null,
          filters: input.filters ?? null,
          heroImageUrl: input.heroImageUrl?.trim() || null,
        },
      });

      return {
        announcementId: announcement.id,
        audience: input.audience,
        sentCount,
        failedCount,
        scheduled,
        status,
      };
    }),

  listAnnouncementHistory: adminProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(50).default(10),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      assertTelegramAnnouncementScope(ctx.user.adminScope);
      const announcements = await db.telegramAnnouncement.findMany({
        orderBy: [{ createdAt: 'desc' }],
        take: input?.limit ?? 10,
        include: {
          deliveries: {
            where: { status: 'FAILED' },
            orderBy: [{ updatedAt: 'desc' }],
            take: 5,
            select: {
              id: true,
              chatId: true,
              error: true,
              updatedAt: true,
            },
          },
        },
      });

      return announcements;
    }),

  getAnnouncementAnalytics: adminProcedure
    .input(
      z
        .object({
          range: z.enum(['7d', '30d', '90d']).default('30d'),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      assertTelegramAnnouncementScope(ctx.user.adminScope);
      const range = input?.range || '30d';
      const cutoff = new Date(
        Date.now() -
          (range === '7d' ? 7 : range === '90d' ? 90 : 30) * 24 * 60 * 60 * 1000,
      );

      const announcements = await db.telegramAnnouncement.findMany({
        where: {
          OR: [{ createdAt: { gte: cutoff } }, { sentAt: { gte: cutoff } }],
        },
        include: {
          deliveries: {
            select: {
              status: true,
              openCount: true,
              clickCount: true,
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }],
      });

      const byType = new Map<string, {
        announcements: number;
        totalRecipients: number;
        sentCount: number;
        failedCount: number;
        openCount: number;
        clickCount: number;
      }>();
      const byAudience = new Map<string, {
        announcements: number;
        totalRecipients: number;
        sentCount: number;
        failedCount: number;
      }>();

      let totalRecipients = 0;
      let totalSent = 0;
      let totalFailed = 0;
      let totalOpenCount = 0;
      let totalClickCount = 0;
      let resendAttempts = 0;
      let resendRecovered = 0;

      for (const announcement of announcements) {
        totalRecipients += announcement.totalRecipients;
        totalSent += announcement.sentCount;
        totalFailed += announcement.failedCount;
        resendAttempts += announcement.resendAttemptCount;
        resendRecovered += announcement.resendRecoveredCount;

        const typeSummary = byType.get(announcement.type) || {
          announcements: 0,
          totalRecipients: 0,
          sentCount: 0,
          failedCount: 0,
          openCount: 0,
          clickCount: 0,
        };
        typeSummary.announcements += 1;
        typeSummary.totalRecipients += announcement.totalRecipients;
        typeSummary.sentCount += announcement.sentCount;
        typeSummary.failedCount += announcement.failedCount;

        const audienceSummary = byAudience.get(announcement.audience) || {
          announcements: 0,
          totalRecipients: 0,
          sentCount: 0,
          failedCount: 0,
        };
        audienceSummary.announcements += 1;
        audienceSummary.totalRecipients += announcement.totalRecipients;
        audienceSummary.sentCount += announcement.sentCount;
        audienceSummary.failedCount += announcement.failedCount;

        for (const delivery of announcement.deliveries) {
          totalOpenCount += delivery.openCount;
          totalClickCount += delivery.clickCount;
          typeSummary.openCount += delivery.openCount;
          typeSummary.clickCount += delivery.clickCount;
        }

        byType.set(announcement.type, typeSummary);
        byAudience.set(announcement.audience, audienceSummary);
      }

      return {
        range,
        totals: {
          announcements: announcements.length,
          recipients: totalRecipients,
          sentCount: totalSent,
          failedCount: totalFailed,
          openCount: totalOpenCount,
          clickCount: totalClickCount,
          deliverySuccessRate: totalRecipients > 0 ? totalSent / totalRecipients : 0,
          openRate: totalSent > 0 ? totalOpenCount / totalSent : 0,
          clickRate: totalSent > 0 ? totalClickCount / totalSent : 0,
          resendAttempts,
          resendRecovered,
          resendRecoveryRate: resendAttempts > 0 ? resendRecovered / resendAttempts : 0,
        },
        byType: Array.from(byType.entries())
          .map(([type, summary]) => ({
            type,
            ...summary,
            deliverySuccessRate:
              summary.totalRecipients > 0 ? summary.sentCount / summary.totalRecipients : 0,
            openRate: summary.sentCount > 0 ? summary.openCount / summary.sentCount : 0,
            clickRate: summary.sentCount > 0 ? summary.clickCount / summary.sentCount : 0,
          }))
          .sort((left, right) => right.sentCount - left.sentCount || left.type.localeCompare(right.type)),
        byAudience: Array.from(byAudience.entries())
          .map(([audience, summary]) => ({
            audience,
            ...summary,
            deliverySuccessRate:
              summary.totalRecipients > 0 ? summary.sentCount / summary.totalRecipients : 0,
          }))
          .sort((left, right) => right.sentCount - left.sentCount || left.audience.localeCompare(right.audience)),
      };
    }),

  dispatchScheduledAnnouncement: adminProcedure
    .input(
      z.object({
        announcementId: z.string().cuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertTelegramAnnouncementScope(ctx.user.adminScope);
      const announcement = await db.telegramAnnouncement.findUnique({
        where: { id: input.announcementId },
        select: {
          id: true,
          status: true,
          title: true,
        },
      });

      if (!announcement) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Announcement not found.',
        });
      }

      const result = await dispatchTelegramAnnouncement({
        announcementId: input.announcementId,
      });
      if (result.skipped) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Announcement skipped: ${result.reason}`,
        });
      }

      await writeAuditLog({
        userId: ctx.user.id,
        ip: ctx.clientIp,
        action: 'TELEGRAM_ANNOUNCEMENT_DISPATCH',
        entity: 'TELEGRAM',
        entityId: input.announcementId,
        details: {
          title: announcement.title,
          sentCount: result.sentCount,
          failedCount: result.failedCount,
        },
      });

      return result;
    }),

  resendAnnouncementFailed: adminProcedure
    .input(
      z.object({
        announcementId: z.string().cuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertTelegramAnnouncementScope(ctx.user.adminScope);
      const failedCount = await db.telegramAnnouncementDelivery.count({
        where: {
          announcementId: input.announcementId,
          status: 'FAILED',
        },
      });

      if (failedCount === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No failed deliveries to resend.',
        });
      }

      const result = await dispatchTelegramAnnouncement({
        announcementId: input.announcementId,
        resendFailedOnly: true,
      });
      if (result.skipped) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Announcement skipped: ${result.reason}`,
        });
      }

      await writeAuditLog({
        userId: ctx.user.id,
        ip: ctx.clientIp,
        action: 'TELEGRAM_ANNOUNCEMENT_RESEND_FAILED',
        entity: 'TELEGRAM',
        entityId: input.announcementId,
        details: {
          resentFailedCount: failedCount,
          sentDelta: result.sentDelta,
          failedDelta: result.failedDelta,
        },
      });

      return result;
    }),

  listAnnouncementTemplates: adminProcedure.query(async ({ ctx }) => {
    assertTelegramAnnouncementScope(ctx.user.adminScope);
    return db.telegramAnnouncementTemplate.findMany({
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }),

  saveAnnouncementTemplate: adminProcedure
    .input(
      z.object({
        templateId: z.string().cuid().optional(),
        name: telegramAnnouncementTemplateNameSchema,
        audience: telegramAnnouncementAudienceSchema.default('ACTIVE_USERS'),
        type: telegramAnnouncementTypeSchema.default('ANNOUNCEMENT'),
        filters: telegramAnnouncementTargetFiltersSchema.optional(),
        title: z.string().trim().min(3).max(120),
        message: z.string().trim().min(10).max(2000),
        heroImageUrl: z.string().trim().max(1000).optional().nullable(),
        includeSupportButton: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertTelegramAnnouncementScope(ctx.user.adminScope);
      const targetServer = input.filters?.serverId
        ? await db.server.findUnique({
            where: { id: input.filters.serverId },
            select: { id: true, name: true, countryCode: true },
          })
        : null;
      const data = {
        name: input.name.trim(),
        audience: input.audience,
        type: input.type,
        targetTag: input.filters?.tag?.trim().toLowerCase() || null,
        targetServerId: targetServer?.id || null,
        targetServerName: targetServer?.name || null,
        targetCountryCode: (input.filters?.countryCode || targetServer?.countryCode || null)?.trim().toUpperCase() || null,
        title: input.title.trim(),
        message: input.message.trim(),
        heroImageUrl: input.heroImageUrl?.trim() || null,
        includeSupportButton: input.includeSupportButton,
        createdByUserId: ctx.user.id,
        createdByEmail: ctx.user.email ?? null,
      };

      if (input.templateId) {
        return db.telegramAnnouncementTemplate.update({
          where: { id: input.templateId },
          data,
        });
      }

      return db.telegramAnnouncementTemplate.create({
        data,
      });
    }),

  deleteAnnouncementTemplate: adminProcedure
    .input(
      z.object({
        templateId: z.string().cuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertTelegramAnnouncementScope(ctx.user.adminScope);
      await db.telegramAnnouncementTemplate.delete({
        where: { id: input.templateId },
      });
      return { success: true };
    }),
});
