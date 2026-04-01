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
    .mutation(async ({ input }) => {
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
    .mutation(async ({ input }) => {
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
    .query(async ({ input }) => {
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

  listOrderReviewers: adminProcedure.query(async () => {
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
    .query(async ({ input }) => {
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
    .query(async ({ input }) => {
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
    .mutation(async ({ input }) => {
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
  getWebhookInfo: adminProcedure.query(async () => {
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
    .mutation(async ({ input }) => {
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
  deleteWebhook: adminProcedure.mutation(async () => {
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

  runDigestNow: adminProcedure.mutation(async () => {
    const result = await runTelegramDigestCycle({ force: true });

    if (result.skipped) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Telegram digest skipped: ${result.reason}`,
      });
    }

    return result;
  }),

  runSalesDigestNow: adminProcedure.mutation(async () => {
    const result = await runTelegramSalesDigestCycle({ force: true });

    if (result.skipped) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Telegram sales digest skipped: ${result.reason}`,
      });
    }

    return result;
  }),
});
