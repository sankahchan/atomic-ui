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

/**
 * Telegram Bot Settings Schema
 */
const telegramSettingsSchema = z.object({
  botToken: z.string().min(1, 'Bot token is required'),
  botUsername: z.string().optional(),
  welcomeMessage: z.string().optional(),
  keyNotFoundMessage: z.string().optional(),
  isEnabled: z.boolean().default(true),
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
        welcomeMessage: 'Welcome! Send your Telegram ID or email to get your VPN key.',
        keyNotFoundMessage: 'No key found for your account. Please contact the administrator.',
        isEnabled: false,
      };
    }

    try {
      const parsed = JSON.parse(settings.value);
      return {
        botToken: parsed.botToken || '',
        botUsername: parsed.botUsername || '',
        welcomeMessage: parsed.welcomeMessage || 'Welcome! Send your Telegram ID or email to get your VPN key.',
        keyNotFoundMessage: parsed.keyNotFoundMessage || 'No key found for your account. Please contact the administrator.',
        isEnabled: parsed.isEnabled ?? false,
      };
    } catch {
      return {
        botToken: '',
        botUsername: '',
        welcomeMessage: 'Welcome! Send your Telegram ID or email to get your VPN key.',
        keyNotFoundMessage: 'No key found for your account. Please contact the administrator.',
        isEnabled: false,
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
});
