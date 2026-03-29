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
  telegramSalesSettingsSchema,
} from '@/lib/services/telegram-sales';
import {
  approveTelegramOrder,
  rejectTelegramOrder,
} from '@/lib/services/telegram-bot';

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
                approvedAccessKeyId: true,
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

      return orders.map((order) => ({
        ...order,
        dataLimitBytes: order.dataLimitBytes?.toString() ?? null,
        targetAccessKeyName: order.targetAccessKeyId
          ? keysById.get(order.targetAccessKeyId)?.name ?? null
          : null,
        approvedAccessKeyName: order.approvedAccessKeyId
          ? keysById.get(order.approvedAccessKeyId)?.name ?? null
          : null,
        approvedAccessKeySlug: order.approvedAccessKeyId
          ? keysById.get(order.approvedAccessKeyId)?.publicSlug ?? null
          : null,
        customerProfile:
          profiles.find(
            (profile) =>
              profile.telegramUserId === order.telegramUserId ||
              profile.telegramChatId === order.telegramChatId,
          ) ?? null,
        customerLinkedKeys: Array.from(
          new Map(
            keys
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
                key.id,
                {
                  id: key.id,
                  name: key.name,
                  status: key.status,
                  email: key.email,
                  publicSlug: key.publicSlug,
                  usedBytes: key.usedBytes.toString(),
                  dataLimitBytes: key.dataLimitBytes?.toString() ?? null,
                  expiresAt: key.expiresAt,
                },
              ]),
          ).values(),
        ).slice(0, 5),
        customerRecentOrders: relatedOrders
          .filter((candidate) => candidate.id !== order.id && matchesOrderIdentity(order, candidate))
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
            createdAt: candidate.createdAt,
            fulfilledAt: candidate.fulfilledAt,
            rejectedAt: candidate.rejectedAt,
          })),
        customerSummary: (() => {
          const identityOrders = relatedOrders.filter((candidate) => matchesOrderIdentity(order, candidate));
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
      }));
    }),

  approveOrder: adminProcedure
    .input(
      z.object({
        orderId: z.string(),
        adminNote: z.string().max(1000).optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return approveTelegramOrder({
        orderId: input.orderId,
        reviewedByUserId: ctx.user.id,
        reviewerName: ctx.user.email || null,
        adminNote: input.adminNote,
      });
    }),

  rejectOrder: adminProcedure
    .input(
      z.object({
        orderId: z.string(),
        adminNote: z.string().max(1000).optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return rejectTelegramOrder({
        orderId: input.orderId,
        reviewedByUserId: ctx.user.id,
        reviewerName: ctx.user.email || null,
        adminNote: input.adminNote,
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
        `https://api.telegram.org/bot${parsed.botToken}/setWebhook?url=${encodeURIComponent(input.webhookUrl)}`
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
});
