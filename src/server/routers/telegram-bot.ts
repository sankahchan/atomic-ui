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
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const limit = input?.limit ?? 25;
      const statuses = input?.statuses?.filter(Boolean);

      const orders = await db.telegramOrder.findMany({
        where: statuses?.length
          ? {
              status: {
                in: statuses,
              },
            }
          : undefined,
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

      const keys = relatedKeyIds.length
        ? await db.accessKey.findMany({
            where: {
              id: {
                in: relatedKeyIds,
              },
            },
            select: {
              id: true,
              name: true,
              publicSlug: true,
              subscriptionToken: true,
            },
          })
        : [];
      const keysById = new Map(keys.map((key) => [key.id, key]));

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
