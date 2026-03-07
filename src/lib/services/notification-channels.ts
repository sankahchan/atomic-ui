import { createHmac } from 'crypto';
import { z } from 'zod';
import { db } from '@/lib/db';
import { sendNotificationEmail } from '@/lib/services/email';
import { sendTelegramMessage } from '@/lib/services/telegram-bot';

export const MAX_NOTIFICATION_COOLDOWN_MINUTES = 24 * 60;
export const MAX_NOTIFICATION_WEBHOOK_HEADERS = 15;
export const NOTIFICATION_WEBHOOK_SIGNATURE_HEADER = 'X-Atomic-Signature';
export const NOTIFICATION_WEBHOOK_TIMESTAMP_HEADER = 'X-Atomic-Timestamp';
export const NOTIFICATION_WEBHOOK_EVENT_HEADER = 'X-Atomic-Event';
export const NOTIFICATION_WEBHOOK_RESERVED_HEADERS = [
  'content-type',
  'content-length',
  'host',
  'user-agent',
  NOTIFICATION_WEBHOOK_EVENT_HEADER.toLowerCase(),
  NOTIFICATION_WEBHOOK_TIMESTAMP_HEADER.toLowerCase(),
  NOTIFICATION_WEBHOOK_SIGNATURE_HEADER.toLowerCase(),
] as const;

export const notificationChannelTypeSchema = z.enum(['TELEGRAM', 'EMAIL', 'WEBHOOK']);
export const notificationEventSchema = z.enum([
  'SERVER_DOWN',
  'SERVER_UP',
  'SERVER_SLOW',
  'KEY_EXPIRING',
  'KEY_EXPIRED',
  'TRAFFIC_WARNING',
  'TRAFFIC_DEPLETED',
  'AUDIT_ALERT',
]);

export const notificationChannelSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: notificationChannelTypeSchema,
  isActive: z.boolean(),
  config: z.record(z.string(), z.string()).default({}),
  events: z.array(notificationEventSchema).default([]),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export type NotificationChannelType = z.infer<typeof notificationChannelTypeSchema>;
export type NotificationEvent = z.infer<typeof notificationEventSchema>;
export type ParsedNotificationChannel = z.infer<typeof notificationChannelSchema>;

const notificationCooldownConfigSchema = z.object({
  defaultCooldownMinutes: z.number().int().min(0).max(MAX_NOTIFICATION_COOLDOWN_MINUTES),
  eventCooldowns: z.record(notificationEventSchema, z.number().int().min(0).max(MAX_NOTIFICATION_COOLDOWN_MINUTES)),
});
const webhookHeaderNamePattern = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

function parseRecordStringArray(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    const result = z.array(z.string()).safeParse(parsed);
    return result.success ? result.data : [];
  } catch {
    return [];
  }
}

function parseRecordConfig(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    );
  } catch {
    return {};
  }
}

export function parseNotificationChannelRecord(record: {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  config: string;
  events: string;
  createdAt?: Date;
  updatedAt?: Date;
}): ParsedNotificationChannel | null {
  const result = notificationChannelSchema.safeParse({
    id: record.id,
    name: record.name,
    type: record.type,
    isActive: record.isActive,
    config: parseRecordConfig(record.config),
    events: parseRecordStringArray(record.events).filter((event): event is NotificationEvent =>
      notificationEventSchema.safeParse(event).success,
    ),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });

  return result.success ? result.data : null;
}

export function channelSupportsEvent(channel: ParsedNotificationChannel, event: NotificationEvent) {
  return channel.events.length === 0 || channel.events.includes(event);
}

export function isValidWebhookHeaderName(name: string) {
  return webhookHeaderNamePattern.test(name);
}

function parseConfigInteger(value: string | undefined) {
  if (!value) {
    return 0;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return Math.min(parsed, MAX_NOTIFICATION_COOLDOWN_MINUTES);
}

function parseEventCooldowns(value: string | undefined) {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    const result = z.record(notificationEventSchema, z.coerce.number().int().min(0).max(MAX_NOTIFICATION_COOLDOWN_MINUTES)).safeParse(parsed);
    return result.success ? result.data : {};
  } catch {
    return {};
  }
}

function parseWebhookHeaders(value: string | undefined) {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const headers: Record<string, string> = {};

    for (const [key, headerValue] of Object.entries(parsed)) {
      if (typeof headerValue !== 'string') {
        continue;
      }

      const normalizedKey = key.trim();
      if (!isValidWebhookHeaderName(normalizedKey)) {
        continue;
      }

      if (
        NOTIFICATION_WEBHOOK_RESERVED_HEADERS.includes(
          normalizedKey.toLowerCase() as (typeof NOTIFICATION_WEBHOOK_RESERVED_HEADERS)[number],
        )
      ) {
        continue;
      }

      headers[normalizedKey] = headerValue;
    }

    return headers;
  } catch {
    return {};
  }
}

function buildWebhookSignature(secret: string, timestamp: string, body: string) {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

export function normalizeNotificationEvent(event: string): NotificationEvent | null {
  const normalized = event.startsWith('TEST_') ? event.slice(5) : event;
  const result = notificationEventSchema.safeParse(normalized);
  return result.success ? result.data : null;
}

export function isTestNotificationEvent(event: string) {
  return event.startsWith('TEST_');
}

export function getNotificationChannelRules(channel: ParsedNotificationChannel) {
  const result = notificationCooldownConfigSchema.parse({
    defaultCooldownMinutes: parseConfigInteger(channel.config.cooldownMinutes),
    eventCooldowns: parseEventCooldowns(channel.config.eventCooldowns),
  });

  return result;
}

export function getNotificationCooldownMinutes(channel: ParsedNotificationChannel, event: string) {
  if (isTestNotificationEvent(event)) {
    return 0;
  }

  const normalizedEvent = normalizeNotificationEvent(event);
  const rules = getNotificationChannelRules(channel);

  if (normalizedEvent && typeof rules.eventCooldowns[normalizedEvent] === 'number') {
    return rules.eventCooldowns[normalizedEvent];
  }

  return rules.defaultCooldownMinutes;
}

async function getTelegramBotToken(config: Record<string, string>) {
  if (process.env.TELEGRAM_BOT_TOKEN) {
    return process.env.TELEGRAM_BOT_TOKEN;
  }

  if (config.botToken) {
    return config.botToken;
  }

  const telegramSettings = await db.settings.findUnique({
    where: { key: 'telegram_bot' },
    select: { value: true },
  });

  if (!telegramSettings) {
    return null;
  }

  try {
    const parsed = JSON.parse(telegramSettings.value) as Record<string, unknown>;
    return typeof parsed.botToken === 'string' && parsed.botToken.trim() ? parsed.botToken : null;
  } catch {
    return null;
  }
}

async function sendTelegramChannelMessage(channel: ParsedNotificationChannel, message: string) {
  const botToken = await getTelegramBotToken(channel.config);
  const chatId = channel.config.chatId;

  if (!botToken) {
    throw new Error('Telegram bot token is not configured');
  }

  if (!chatId) {
    throw new Error('Telegram chat ID is not configured');
  }

  const success = await sendTelegramMessage(botToken, chatId, message);
  if (!success) {
    throw new Error('Telegram API rejected the message');
  }
}

async function sendWebhookChannelMessage(
  channel: ParsedNotificationChannel,
  event: string,
  message: string,
  payload?: Record<string, unknown>,
  rawWebhookBody = false,
) {
  const url = channel.config.url;
  if (!url) {
    throw new Error('Webhook URL is not configured');
  }

  const body = rawWebhookBody
    ? JSON.stringify(payload ?? {})
    : JSON.stringify({
        type: 'notification',
        channelId: channel.id,
        channelName: channel.name,
        message,
        timestamp: new Date().toISOString(),
        ...(payload ?? {}),
      });

  const customHeaders = parseWebhookHeaders(channel.config.headers);
  const requestHeaders: Record<string, string> = {
    ...customHeaders,
    'Content-Type': 'application/json',
    'User-Agent': 'Atomic-UI/1.0',
    [NOTIFICATION_WEBHOOK_EVENT_HEADER]: event,
  };

  if (channel.config.signingSecret) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    requestHeaders[NOTIFICATION_WEBHOOK_TIMESTAMP_HEADER] = timestamp;
    requestHeaders[NOTIFICATION_WEBHOOK_SIGNATURE_HEADER] = buildWebhookSignature(
      channel.config.signingSecret,
      timestamp,
      body,
    );
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: requestHeaders,
    body,
  });

  if (!response.ok) {
    throw new Error(`Webhook request failed with status ${response.status}`);
  }
}

async function sendEmailChannelMessage(
  channel: ParsedNotificationChannel,
  event: string,
  message: string,
) {
  const recipients = (channel.config.email || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (recipients.length === 0) {
    throw new Error('Email recipient is not configured');
  }

  await sendNotificationEmail({
    to: recipients,
    event,
    message,
  });
}

export async function sendNotificationToChannel({
  channel,
  event,
  message,
  payload,
  accessKeyId,
  rawWebhookBody = false,
  logResult = true,
}: {
  channel: ParsedNotificationChannel;
  event: string;
  message: string;
  payload?: Record<string, unknown>;
  accessKeyId?: string;
  rawWebhookBody?: boolean;
  logResult?: boolean;
}) {
  try {
    switch (channel.type) {
      case 'TELEGRAM':
        await sendTelegramChannelMessage(channel, message);
        break;
      case 'WEBHOOK':
        await sendWebhookChannelMessage(channel, event, message, payload, rawWebhookBody);
        break;
      case 'EMAIL':
        await sendEmailChannelMessage(channel, event, message);
        break;
      default:
        throw new Error(`Unsupported channel type: ${channel.type}`);
    }

    if (logResult) {
      await db.notificationLog.create({
        data: {
          channelId: channel.id,
          event,
          message,
          status: 'SUCCESS',
          accessKeyId,
        },
      });
    }

    return { success: true as const };
  } catch (error) {
    if (logResult) {
      await db.notificationLog.create({
        data: {
          channelId: channel.id,
          event,
          message,
          status: 'FAILED',
          error: error instanceof Error ? error.message : 'Unknown notification error',
          accessKeyId,
        },
      });
    }

    return {
      success: false as const,
      error: error instanceof Error ? error.message : 'Unknown notification error',
    };
  }
}
