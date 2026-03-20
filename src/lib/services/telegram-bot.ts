/**
 * Telegram Bot Service
 *
 * Telegram is treated as a first-class user/admin surface:
 * - onboarding via deep-link /start tokens
 * - direct share-page delivery
 * - user self-service commands
 * - admin operational commands
 * - admin alerts and scheduled digest delivery
 */

import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import QRCode from 'qrcode';
import si from 'systeminformation';
import { db } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit';
import { createOutlineClient } from '@/lib/outline-api';
import { decorateOutlineAccessUrl } from '@/lib/outline-access-url';
import {
  buildDynamicOutlineUrl,
  buildDynamicSharePageUrl,
  buildDynamicShortClientUrl,
  buildDynamicShortShareUrl,
  buildDynamicSubscriptionApiUrl,
  buildSharePageUrl,
  buildShortShareUrl,
  buildSubscriptionApiUrl,
} from '@/lib/subscription-links';
import {
  recordSubscriptionPageEvent,
  SUBSCRIPTION_EVENT_TYPES,
} from '@/lib/services/subscription-events';
import { canAssignKeysToServer } from '@/lib/services/server-lifecycle';
import { formatBytes, generateRandomString } from '@/lib/utils';

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';
const TELEGRAM_CONNECT_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type TelegramParseMode = 'HTML' | 'Markdown';

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      is_bot: boolean;
      first_name: string;
      username?: string;
    };
    chat: {
      id: number;
      type: string;
    };
    date: number;
    text?: string;
  };
}

export interface TelegramConfig {
  botToken: string;
  botUsername?: string;
  adminChatIds: string[];
  welcomeMessage?: string;
  keyNotFoundMessage?: string;
  dailyDigestEnabled?: boolean;
  dailyDigestHour?: number;
  dailyDigestMinute?: number;
  digestLookbackHours?: number;
}

interface SendMessageOptions {
  parseMode?: TelegramParseMode;
  replyMarkup?: Record<string, unknown>;
  disableWebPagePreview?: boolean;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getCommandKeyboard(isAdmin: boolean) {
  const keyboard = [
    [{ text: '/usage' }, { text: '/mykeys' }],
    [{ text: '/sub' }, { text: '/support' }],
    [{ text: '/renew' }, { text: '/help' }],
  ];

  if (isAdmin) {
    keyboard.push([{ text: '/status' }, { text: '/expiring' }]);
    keyboard.push([{ text: '/find' }, { text: '/sysinfo' }]);
  }

  return {
    keyboard,
    resize_keyboard: true,
    one_time_keyboard: false,
  };
}

function getFlagEmoji(countryCode: string) {
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

function formatExpirationSummary(key: {
  expiresAt?: Date | null;
  expirationType?: string | null;
  durationDays?: number | null;
}) {
  if (!key.expiresAt) {
    if (key.expirationType === 'START_ON_FIRST_USE') {
      return key.durationDays ? `Starts on first use (${key.durationDays} days)` : 'Starts on first use';
    }

    return 'Never';
  }

  const remainingMs = key.expiresAt.getTime() - Date.now();
  const daysLeft = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));

  if (daysLeft <= 0) {
    return `Expired on ${key.expiresAt.toLocaleDateString()}`;
  }

  return `${daysLeft} day(s) left (${key.expiresAt.toLocaleDateString()})`;
}

async function getSubscriptionDefaults() {
  const settings = await db.settings.findMany({
    where: {
      key: {
        in: ['supportLink', 'subscriptionWelcomeMessage'],
      },
    },
    select: {
      key: true,
      value: true,
    },
  });

  const settingsMap = new Map(settings.map((item) => [item.key, item.value]));

  return {
    supportLink: settingsMap.get('supportLink') || null,
    welcomeMessage: settingsMap.get('subscriptionWelcomeMessage') || null,
  };
}

async function getTelegramBotUsername(botToken: string, configuredUsername?: string | null) {
  if (configuredUsername && configuredUsername.trim()) {
    return configuredUsername.replace(/^@/, '').trim();
  }

  try {
    const response = await fetch(`${TELEGRAM_API_BASE}${botToken}/getMe`);
    const data = (await response.json()) as {
      ok?: boolean;
      result?: {
        username?: string;
      };
    };

    if (data.ok && data.result?.username) {
      return data.result.username.replace(/^@/, '').trim();
    }
  } catch (error) {
    console.error('Failed to resolve Telegram bot username:', error);
  }

  return null;
}

async function ensureAccessKeySubscriptionToken(accessKeyId: string, existingToken?: string | null) {
  if (existingToken) {
    return existingToken;
  }

  const token = generateRandomString(32);
  await db.accessKey.update({
    where: { id: accessKeyId },
    data: { subscriptionToken: token },
  });
  return token;
}

async function getActiveNotificationChannelIds(event: string) {
  const { channelSupportsEvent, parseNotificationChannelRecord } = await import(
    '@/lib/services/notification-channels'
  );

  const channels = await db.notificationChannel.findMany({
    where: {
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      type: true,
      config: true,
      events: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return channels
    .map((channel) => parseNotificationChannelRecord(channel))
    .filter((channel): channel is NonNullable<typeof channel> => Boolean(channel))
    .filter((channel) => channelSupportsEvent(channel, event as never))
    .map((channel) => channel.id);
}

async function enqueueChannelNotification(input: {
  event: string;
  message: string;
  accessKeyId?: string;
  payload?: Record<string, unknown>;
  cooldownKey?: string;
}) {
  const channelIds = await getActiveNotificationChannelIds(input.event);
  if (channelIds.length === 0) {
    return null;
  }

  const { enqueueNotificationsForChannels } = await import('@/lib/services/notification-queue');

  return enqueueNotificationsForChannels({
    channelIds,
    event: input.event,
    message: input.message,
    payload: input.payload,
    accessKeyId: input.accessKeyId,
    cooldownKey: input.cooldownKey,
  });
}

/**
 * Get Telegram bot configuration from database.
 */
export async function getTelegramConfig(): Promise<TelegramConfig | null> {
  const settings = await db.settings.findUnique({ where: { key: 'telegram_bot' } });
  if (settings) {
    try {
      const config = JSON.parse(settings.value) as Record<string, unknown>;
      if (config.isEnabled && typeof config.botToken === 'string' && config.botToken.trim()) {
        return {
          botToken: config.botToken,
          botUsername:
            typeof config.botUsername === 'string' && config.botUsername.trim()
              ? config.botUsername
              : undefined,
          adminChatIds: Array.isArray(config.adminChatIds)
            ? config.adminChatIds.filter(
                (value): value is string => typeof value === 'string' && value.trim().length > 0,
              )
            : [],
          welcomeMessage:
            typeof config.welcomeMessage === 'string' && config.welcomeMessage.trim()
              ? config.welcomeMessage
              : undefined,
          keyNotFoundMessage:
            typeof config.keyNotFoundMessage === 'string' && config.keyNotFoundMessage.trim()
              ? config.keyNotFoundMessage
              : undefined,
          dailyDigestEnabled: Boolean(config.dailyDigestEnabled),
          dailyDigestHour:
            typeof config.dailyDigestHour === 'number' ? config.dailyDigestHour : 9,
          dailyDigestMinute:
            typeof config.dailyDigestMinute === 'number' ? config.dailyDigestMinute : 0,
          digestLookbackHours:
            typeof config.digestLookbackHours === 'number' ? config.digestLookbackHours : 24,
        };
      }
    } catch {
      // Fall through to channel-based configuration.
    }
  }

  const channels = await db.notificationChannel.findMany({
    where: {
      type: 'TELEGRAM',
      isActive: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  for (const channel of channels) {
    try {
      const config = JSON.parse(channel.config) as Record<string, unknown>;
      const botToken =
        (typeof config.botToken === 'string' && config.botToken.trim()) ||
        process.env.TELEGRAM_BOT_TOKEN ||
        null;
      const adminChatIds = Array.isArray(config.adminChatIds)
        ? config.adminChatIds.filter(
            (value): value is string => typeof value === 'string' && value.trim().length > 0,
          )
        : typeof config.chatId === 'string' && config.chatId.trim().length > 0
          ? [config.chatId]
          : [];

      if (botToken && adminChatIds.length > 0) {
        return {
          botToken,
          botUsername:
            typeof config.botUsername === 'string' && config.botUsername.trim()
              ? config.botUsername
              : undefined,
          adminChatIds,
          dailyDigestEnabled: false,
          dailyDigestHour: 9,
          dailyDigestMinute: 0,
          digestLookbackHours: 24,
        };
      }
    } catch {
      // Ignore malformed channels and keep looking.
    }
  }

  return null;
}

/**
 * Send a message to a Telegram chat.
 */
export async function sendTelegramMessage(
  botToken: string,
  chatId: number | string,
  text: string,
  options: SendMessageOptions = {},
): Promise<boolean> {
  try {
    const response = await fetch(`${TELEGRAM_API_BASE}${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: options.parseMode || 'HTML',
        reply_markup: options.replyMarkup,
        disable_web_page_preview: options.disableWebPagePreview ?? true,
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      console.error(`Failed to send Telegram message to ${chatId}:`, data.description);
    }

    return response.ok;
  } catch (error) {
    console.error('Failed to send Telegram message:', error);
    return false;
  }
}

/**
 * Send an alert to all admin chat IDs.
 */
export async function sendAdminAlert(
  message: string,
  options: SendMessageOptions = {},
): Promise<void> {
  const config = await getTelegramConfig();
  if (!config) return;

  for (const chatId of config.adminChatIds) {
    await sendTelegramMessage(config.botToken, chatId, message, options);
  }
}

/**
 * Send a photo to a Telegram chat.
 */
export async function sendTelegramPhoto(
  botToken: string,
  chatId: number | string,
  photo: Buffer,
  caption?: string,
) {
  try {
    const formData = new FormData();
    formData.append('chat_id', chatId.toString());
    const blob = new Blob([new Uint8Array(photo)], { type: 'image/png' });
    formData.append('photo', blob, 'qrcode.png');

    if (caption) {
      formData.append('caption', caption);
      formData.append('parse_mode', 'HTML');
    }

    const response = await fetch(`${TELEGRAM_API_BASE}${botToken}/sendPhoto`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const data = await response.json();
      console.error(`Failed to send Telegram photo to ${chatId}:`, data.description);
    }
  } catch (error) {
    console.error(`Error sending Telegram photo to ${chatId}:`, error);
  }
}

/**
 * Send a document to a Telegram chat.
 */
export async function sendTelegramDocument(
  botToken: string,
  chatId: number | string,
  document: Buffer,
  filename: string,
  caption?: string,
) {
  try {
    const formData = new FormData();
    formData.append('chat_id', chatId.toString());
    const blob = new Blob([new Uint8Array(document)], { type: 'application/octet-stream' });
    formData.append('document', blob, filename);

    if (caption) {
      formData.append('caption', caption);
      formData.append('parse_mode', 'HTML');
    }

    const response = await fetch(`${TELEGRAM_API_BASE}${botToken}/sendDocument`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const data = await response.json();
      console.error(`Failed to send Telegram document to ${chatId}:`, data.description);
    }
  } catch (error) {
    console.error(`Error sending Telegram document to ${chatId}:`, error);
  }
}

async function loadAccessKeyForMessaging(accessKeyId: string) {
  return db.accessKey.findUnique({
    where: { id: accessKeyId },
    include: {
      server: true,
      user: true,
    },
  });
}

async function loadDynamicAccessKeyForMessaging(dynamicAccessKeyId: string) {
  return db.dynamicAccessKey.findUnique({
    where: { id: dynamicAccessKeyId },
    include: {
      user: true,
      accessKeys: {
        include: {
          server: true,
        },
      },
    },
  });
}

function resolveTelegramChatIdForKey(key: {
  telegramId?: string | null;
  user?: { telegramChatId?: string | null } | null;
}) {
  return key.telegramId || key.user?.telegramChatId || null;
}

function resolveTelegramChatIdForDynamicKey(key: {
  telegramId?: string | null;
  user?: { telegramChatId?: string | null } | null;
}) {
  return key.telegramId || key.user?.telegramChatId || null;
}

function getDynamicKeyMessagingUrls(
  key: {
    dynamicUrl?: string | null;
    publicSlug?: string | null;
    name: string;
  },
  source?: string | null,
) {
  const sharePageUrl = key.publicSlug
    ? buildDynamicShortShareUrl(key.publicSlug, { source: source || undefined })
    : key.dynamicUrl
      ? buildDynamicSharePageUrl(key.dynamicUrl, { source: source || undefined })
      : null;
  const subscriptionUrl = key.publicSlug
    ? buildDynamicShortClientUrl(key.publicSlug, { source: source || undefined })
    : key.dynamicUrl
      ? buildDynamicSubscriptionApiUrl(key.dynamicUrl, { source: source || undefined })
      : null;
  const outlineClientUrl = key.publicSlug
    ? buildDynamicOutlineUrl(key.publicSlug, key.name, {
        source: source || undefined,
        shortPath: true,
      })
    : key.dynamicUrl
      ? buildDynamicOutlineUrl(key.dynamicUrl, key.name, {
          source: source || undefined,
        })
      : null;

  return {
    sharePageUrl,
    subscriptionUrl,
    outlineClientUrl,
  };
}

export async function createAccessKeyTelegramConnectLink(input: {
  accessKeyId: string;
  createdByUserId?: string | null;
}) {
  const config = await getTelegramConfig();
  if (!config) {
    throw new Error('Telegram bot is not configured.');
  }

  const key = await db.accessKey.findUnique({
    where: { id: input.accessKeyId },
    select: {
      id: true,
      userId: true,
      name: true,
    },
  });

  if (!key) {
    throw new Error('Access key not found.');
  }

  const botUsername = await getTelegramBotUsername(config.botToken, config.botUsername);
  if (!botUsername) {
    throw new Error('Unable to resolve the Telegram bot username.');
  }

  const token = generateRandomString(24);
  const expiresAt = new Date(Date.now() + TELEGRAM_CONNECT_TOKEN_TTL_MS);

  await db.telegramLinkToken.create({
    data: {
      token,
      accessKeyId: key.id,
      userId: key.userId,
      createdByUserId: input.createdByUserId ?? null,
      expiresAt,
    },
  });

  return {
    startToken: token,
    botUsername,
    expiresAt,
    url: `https://t.me/${botUsername}?start=${token}`,
  };
}

export async function createDynamicKeyTelegramConnectLink(input: {
  dynamicAccessKeyId: string;
  createdByUserId?: string | null;
}) {
  const config = await getTelegramConfig();
  if (!config) {
    throw new Error('Telegram bot is not configured.');
  }

  const key = await db.dynamicAccessKey.findUnique({
    where: { id: input.dynamicAccessKeyId },
    select: {
      id: true,
      userId: true,
      name: true,
    },
  });

  if (!key) {
    throw new Error('Dynamic key not found.');
  }

  const botUsername = await getTelegramBotUsername(config.botToken, config.botUsername);
  if (!botUsername) {
    throw new Error('Unable to resolve the Telegram bot username.');
  }

  const token = generateRandomString(24);
  const expiresAt = new Date(Date.now() + TELEGRAM_CONNECT_TOKEN_TTL_MS);

  await db.telegramLinkToken.create({
    data: {
      token,
      kind: 'DYNAMIC_KEY_CONNECT',
      dynamicAccessKeyId: key.id,
      userId: key.userId,
      createdByUserId: input.createdByUserId ?? null,
      expiresAt,
    },
  });

  return {
    startToken: token,
    botUsername,
    expiresAt,
    url: `https://t.me/${botUsername}?start=${token}`,
  };
}

export async function sendAccessKeySharePageToTelegram(input: {
  accessKeyId: string;
  chatId?: string | number | null;
  reason?:
    | 'CREATED'
    | 'RESENT'
    | 'LINKED'
    | 'KEY_ENABLED'
    | 'USAGE_REQUEST'
    | 'SUBSCRIPTION_REQUEST';
  source?: string | null;
  includeQr?: boolean;
}) {
  const config = await getTelegramConfig();
  if (!config) {
    throw new Error('Telegram bot is not configured.');
  }

  const key = await loadAccessKeyForMessaging(input.accessKeyId);
  if (!key) {
    throw new Error('Access key not found.');
  }

  const destinationChatId =
    (input.chatId ? String(input.chatId) : null) || resolveTelegramChatIdForKey(key);
  if (!destinationChatId) {
    throw new Error('This key is not linked to a Telegram chat yet.');
  }

  const token = await ensureAccessKeySubscriptionToken(key.id, key.subscriptionToken);
  const sharePageUrl = key.publicSlug
    ? buildShortShareUrl(key.publicSlug, { source: input.source || 'telegram' })
    : buildSharePageUrl(token, { source: input.source || 'telegram' });
  const subscriptionUrl = buildSubscriptionApiUrl(token, { source: input.source || 'telegram' });
  const defaults = await getSubscriptionDefaults();
  const welcomeMessage = key.subscriptionWelcomeMessage?.trim() || defaults.welcomeMessage?.trim() || '';
  const supportLink = defaults.supportLink;

  const reasonTitle =
    input.reason === 'CREATED'
      ? '🎉 <b>Your access key is ready</b>'
      : input.reason === 'KEY_ENABLED'
        ? '✅ <b>Your access key has been re-enabled</b>'
        : input.reason === 'LINKED'
          ? '🔗 <b>Telegram linked successfully</b>'
          : input.reason === 'USAGE_REQUEST'
            ? '📊 <b>Your VPN access details</b>'
            : input.reason === 'SUBSCRIPTION_REQUEST'
              ? '📎 <b>Your subscription links</b>'
              : '📨 <b>Your share page</b>';

  const lines = [
    reasonTitle,
    '',
    `🔑 Key: <b>${escapeHtml(key.name)}</b>`,
    `🖥 Server: ${escapeHtml(key.server.name)}${key.server.countryCode ? ` ${getFlagEmoji(key.server.countryCode)}` : ''}`,
    `📈 Status: ${escapeHtml(key.status)}`,
    `⏳ Expiration: ${escapeHtml(formatExpirationSummary(key))}`,
    key.dataLimitBytes ? `📦 Quota: ${formatBytes(key.usedBytes)} / ${formatBytes(key.dataLimitBytes)}` : '📦 Quota: Unlimited',
    '',
    welcomeMessage ? escapeHtml(welcomeMessage) : 'Open the share page below for install steps, manual setup, and the latest connection details.',
    '',
    `🌐 Share page: ${sharePageUrl}`,
    `🔄 Subscription URL: ${subscriptionUrl}`,
  ];

  const inlineKeyboard: Array<Array<{ text: string; url: string }>> = [
    [{ text: 'Open Share Page', url: sharePageUrl }],
    [{ text: 'Open Subscription URL', url: subscriptionUrl }],
  ];

  if (supportLink) {
    inlineKeyboard.push([{ text: 'Get Support', url: supportLink }]);
  }

  await sendTelegramMessage(config.botToken, destinationChatId, lines.join('\n'), {
    replyMarkup: { inline_keyboard: inlineKeyboard },
  });

  if (input.includeQr ?? true) {
    try {
      const qrBuffer = await QRCode.toBuffer(key.accessUrl || sharePageUrl, {
        width: 300,
        margin: 2,
      });
      await sendTelegramPhoto(
        config.botToken,
        destinationChatId,
        qrBuffer,
        'Scan this QR code with your VPN client if direct import is unavailable.',
      );
    } catch (error) {
      console.error('Failed to generate Telegram QR code:', error);
    }
  }

  await recordSubscriptionPageEvent({
    accessKeyId: key.id,
    eventType: SUBSCRIPTION_EVENT_TYPES.TELEGRAM_SENT,
    source: input.source || 'telegram',
    metadata: {
      reason: input.reason || 'RESENT',
      destinationChatId,
    },
  });

  await writeAuditLog({
    action: 'TELEGRAM_SHARE_SENT',
    entity: 'ACCESS_KEY',
    entityId: key.id,
    details: {
      reason: input.reason || 'RESENT',
      destinationChatId,
      sharePageUrl,
    },
  });

  return {
    sharePageUrl,
    subscriptionUrl,
    destinationChatId,
  };
}

export async function sendDynamicKeySharePageToTelegram(input: {
  dynamicAccessKeyId: string;
  chatId?: string | number | null;
  reason?:
    | 'CREATED'
    | 'RESENT'
    | 'LINKED'
    | 'KEY_ENABLED'
    | 'USAGE_REQUEST'
    | 'SUBSCRIPTION_REQUEST';
  source?: string | null;
  includeQr?: boolean;
}) {
  const config = await getTelegramConfig();
  if (!config) {
    throw new Error('Telegram bot is not configured.');
  }

  const key = await loadDynamicAccessKeyForMessaging(input.dynamicAccessKeyId);
  if (!key) {
    throw new Error('Dynamic key not found.');
  }

  const destinationChatId =
    (input.chatId ? String(input.chatId) : null) || resolveTelegramChatIdForDynamicKey(key);
  if (!destinationChatId) {
    throw new Error('This dynamic key is not linked to a Telegram chat yet.');
  }

  const { sharePageUrl, subscriptionUrl, outlineClientUrl } = getDynamicKeyMessagingUrls(
    key,
    input.source || 'telegram',
  );
  if (!subscriptionUrl || !outlineClientUrl) {
    throw new Error('This dynamic key does not have a usable client URL yet.');
  }

  const defaults = await getSubscriptionDefaults();
  const welcomeMessage = key.subscriptionWelcomeMessage?.trim() || defaults.welcomeMessage?.trim() || '';
  const supportLink = defaults.supportLink;
  const attachedCount = key.accessKeys.length;
  const uniqueServers = Array.from(
    new Set(
      key.accessKeys
        .map((attachedKey) => attachedKey.server?.name)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const coverageSummary =
    uniqueServers.length > 0
      ? uniqueServers.slice(0, 3).join(', ') + (uniqueServers.length > 3 ? ` +${uniqueServers.length - 3} more` : '')
      : 'Auto-selected at fetch time';

  const reasonTitle =
    input.reason === 'CREATED'
      ? '🎉 <b>Your dynamic key is ready</b>'
      : input.reason === 'KEY_ENABLED'
        ? '✅ <b>Your dynamic key has been re-enabled</b>'
        : input.reason === 'LINKED'
          ? '🔗 <b>Telegram linked successfully</b>'
          : input.reason === 'USAGE_REQUEST'
            ? '📊 <b>Your dynamic VPN access details</b>'
            : input.reason === 'SUBSCRIPTION_REQUEST'
              ? '📎 <b>Your dynamic subscription links</b>'
              : '📨 <b>Your dynamic share page</b>';

  const lines = [
    reasonTitle,
    '',
    `🔁 Key: <b>${escapeHtml(key.name)}</b>`,
    `🧭 Mode: ${escapeHtml(key.type === 'SELF_MANAGED' ? 'Self-Managed' : 'Manual')}`,
    `🖥 Backends: ${attachedCount} attached key(s)`,
    `🌍 Coverage: ${escapeHtml(coverageSummary)}`,
    `📈 Status: ${escapeHtml(key.status)}`,
    `⏳ Expiration: ${escapeHtml(formatExpirationSummary(key))}`,
    key.dataLimitBytes ? `📦 Quota: ${formatBytes(key.usedBytes)} / ${formatBytes(key.dataLimitBytes)}` : '📦 Quota: Unlimited',
    '',
    welcomeMessage
      ? escapeHtml(welcomeMessage)
      : key.sharePageEnabled
        ? 'Open the share page below for install steps, manual setup, and the latest backend details.'
        : 'The share page is disabled for this key. Use the client endpoint below inside Outline or another compatible client.',
  ];

  if (key.sharePageEnabled && sharePageUrl) {
    lines.push('', `🌐 Share page: ${sharePageUrl}`);
  }

  lines.push(`🔄 Client endpoint: ${subscriptionUrl}`);
  lines.push(`⚡ Outline client URL: ${outlineClientUrl}`);

  const inlineKeyboard: Array<Array<{ text: string; url: string }>> = [];
  if (key.sharePageEnabled && sharePageUrl) {
    inlineKeyboard.push([{ text: 'Open Share Page', url: sharePageUrl }]);
  }
  inlineKeyboard.push([{ text: 'Open Client Endpoint', url: subscriptionUrl }]);

  if (supportLink) {
    inlineKeyboard.push([{ text: 'Get Support', url: supportLink }]);
  }

  await sendTelegramMessage(config.botToken, destinationChatId, lines.join('\n'), {
    replyMarkup: { inline_keyboard: inlineKeyboard },
  });

  if (input.includeQr ?? true) {
    try {
      const qrBuffer = await QRCode.toBuffer(outlineClientUrl, {
        width: 300,
        margin: 2,
      });
      await sendTelegramPhoto(
        config.botToken,
        destinationChatId,
        qrBuffer,
        'Scan this QR code with Outline or another compatible client if direct import is unavailable.',
      );
    } catch (error) {
      console.error('Failed to generate Telegram QR code for dynamic key:', error);
    }
  }

  await recordSubscriptionPageEvent({
    dynamicAccessKeyId: key.id,
    eventType: SUBSCRIPTION_EVENT_TYPES.TELEGRAM_SENT,
    source: input.source || 'telegram',
    metadata: {
      reason: input.reason || 'RESENT',
      destinationChatId,
      sharePageEnabled: key.sharePageEnabled,
    },
  });

  await writeAuditLog({
    action: 'TELEGRAM_SHARE_SENT',
    entity: 'DYNAMIC_ACCESS_KEY',
    entityId: key.id,
    details: {
      reason: input.reason || 'RESENT',
      destinationChatId,
      sharePageUrl,
      subscriptionUrl,
    },
  });

  return {
    sharePageUrl,
    subscriptionUrl,
    outlineClientUrl,
    destinationChatId,
  };
}

export async function sendAccessKeyLifecycleTelegramNotification(input: {
  accessKeyId: string;
  type:
    | 'CREATED'
    | 'DISABLED'
    | 'ENABLED'
    | 'EXPIRING_7D'
    | 'EXPIRING_1D'
    | 'EXPIRED';
  daysLeft?: number;
}) {
  if (input.type === 'CREATED' || input.type === 'ENABLED') {
    return sendAccessKeySharePageToTelegram({
      accessKeyId: input.accessKeyId,
      reason: input.type === 'CREATED' ? 'CREATED' : 'KEY_ENABLED',
      source: 'telegram_notification',
    });
  }

  const config = await getTelegramConfig();
  if (!config) {
    return null;
  }

  const key = await loadAccessKeyForMessaging(input.accessKeyId);
  if (!key) {
    return null;
  }

  const destinationChatId = resolveTelegramChatIdForKey(key);
  if (!destinationChatId) {
    return null;
  }

  const { supportLink } = await getSubscriptionDefaults();
  const includeSharePage = input.type === 'EXPIRING_7D' || input.type === 'EXPIRING_1D';
  const token = includeSharePage
    ? await ensureAccessKeySubscriptionToken(key.id, key.subscriptionToken)
    : null;
  const sharePageUrl = token
    ? (
        key.publicSlug
          ? buildShortShareUrl(key.publicSlug, { source: 'telegram_notification' })
          : buildSharePageUrl(token, { source: 'telegram_notification' })
      )
    : null;

  const lines =
    input.type === 'DISABLED'
      ? [
          '⛔ <b>Your access key has been disabled</b>',
          '',
          `🔑 ${escapeHtml(key.name)}`,
          'Traffic is blocked until the key is re-enabled by an administrator.',
        ]
      : input.type === 'EXPIRING_7D'
        ? [
            '⏳ <b>Your access key will expire soon</b>',
            '',
            `🔑 ${escapeHtml(key.name)}`,
            `There are about ${input.daysLeft ?? 7} day(s) left before expiration.`,
          ]
        : input.type === 'EXPIRING_1D'
          ? [
              '⚠️ <b>Your access key expires very soon</b>',
              '',
              `🔑 ${escapeHtml(key.name)}`,
              `Only about ${input.daysLeft ?? 1} day(s) remain.`,
            ]
          : [
              '⌛ <b>Your access key has expired</b>',
              '',
              `🔑 ${escapeHtml(key.name)}`,
              'The key is no longer active. Contact support if it should be renewed.',
            ];

  if (sharePageUrl) {
    lines.push('', `Share page: ${sharePageUrl}`);
  }
  if (supportLink) {
    lines.push(`Support: ${supportLink}`);
  }

  const buttons = sharePageUrl ? [[{ text: 'Open Share Page', url: sharePageUrl }]] : [];
  if (supportLink) {
    buttons.push([{ text: 'Get Support', url: supportLink }]);
  }

  await sendTelegramMessage(config.botToken, destinationChatId, lines.join('\n'), {
    replyMarkup: buttons.length > 0 ? { inline_keyboard: buttons } : undefined,
  });

  await recordSubscriptionPageEvent({
    accessKeyId: key.id,
    eventType: SUBSCRIPTION_EVENT_TYPES.TELEGRAM_SENT,
    source: 'telegram_notification',
    metadata: {
      notificationType: input.type,
      destinationChatId,
      sharePageIncluded: Boolean(sharePageUrl),
    },
  });

  await writeAuditLog({
    action: 'TELEGRAM_NOTIFICATION_SENT',
    entity: 'ACCESS_KEY',
    entityId: key.id,
    details: {
      notificationType: input.type,
      destinationChatId,
      sharePageIncluded: Boolean(sharePageUrl),
    },
  });

  return {
    sharePageUrl,
    destinationChatId,
  };
}

export async function sendRenewalRequestToAdmins(input: {
  accessKeyId: string;
  requesterTelegramId: string;
  requesterName: string;
}) {
  const key = await db.accessKey.findUnique({
    where: { id: input.accessKeyId },
    include: {
      server: true,
      user: true,
    },
  });

  if (!key) {
    throw new Error('Access key not found.');
  }

  const token = await ensureAccessKeySubscriptionToken(key.id, key.subscriptionToken);
  const sharePageUrl = key.publicSlug
    ? buildShortShareUrl(key.publicSlug, { source: 'telegram_renew_request' })
    : buildSharePageUrl(token, { source: 'telegram_renew_request' });
  const message = [
    '🔁 <b>Renewal requested from Telegram</b>',
    '',
    `Requester: <b>${escapeHtml(input.requesterName)}</b>`,
    `Telegram ID: <code>${escapeHtml(input.requesterTelegramId)}</code>`,
    `Key: <b>${escapeHtml(key.name)}</b>`,
    `Server: ${escapeHtml(key.server.name)}`,
    key.email ? `Email: ${escapeHtml(key.email)}` : '',
    '',
    `Share page: ${sharePageUrl}`,
  ]
    .filter(Boolean)
    .join('\n');

  await sendAdminAlert(message);
  await writeAuditLog({
    action: 'TELEGRAM_RENEWAL_REQUEST',
    entity: 'ACCESS_KEY',
    entityId: key.id,
    details: {
      requesterTelegramId: input.requesterTelegramId,
      requesterName: input.requesterName,
      sharePageUrl,
    },
  });

  return {
    keyId: key.id,
    sharePageUrl,
  };
}

async function markTelegramLinkTokenConsumed(input: {
  token: string;
  chatId: string;
  telegramUserId: string;
}) {
  const linkToken = await db.telegramLinkToken.findUnique({
    where: { token: input.token },
    include: {
      accessKey: {
        include: {
          server: true,
          user: true,
        },
      },
      dynamicAccessKey: {
        include: {
          user: true,
        },
      },
    },
  });

  if (!linkToken) {
    return { status: 'missing' as const };
  }

  if (linkToken.consumedAt && linkToken.consumedByChatId === input.chatId) {
    return {
      status: 'already-linked' as const,
      accessKeyId: linkToken.accessKey?.id ?? null,
      dynamicAccessKeyId: linkToken.dynamicAccessKey?.id ?? null,
    };
  }

  if (linkToken.expiresAt.getTime() < Date.now()) {
    return { status: 'expired' as const };
  }

  if (!linkToken.accessKey && !linkToken.dynamicAccessKey) {
    return { status: 'missing-key' as const };
  }

  await db.$transaction(async (tx) => {
    if (linkToken.accessKey) {
      await tx.accessKey.update({
        where: { id: linkToken.accessKey.id },
        data: {
          telegramId: input.telegramUserId,
        },
      });
    }

    if (linkToken.dynamicAccessKey) {
      await tx.dynamicAccessKey.update({
        where: { id: linkToken.dynamicAccessKey.id },
        data: {
          telegramId: input.telegramUserId,
        },
      });
    }

    if (linkToken.userId) {
      await tx.user.update({
        where: { id: linkToken.userId },
        data: {
          telegramChatId: input.chatId,
        },
      });
    }

    await tx.telegramLinkToken.update({
      where: { id: linkToken.id },
      data: {
        consumedAt: new Date(),
        consumedByChatId: input.chatId,
      },
    });
  });

  if (linkToken.accessKey) {
    await recordSubscriptionPageEvent({
      accessKeyId: linkToken.accessKey.id,
      eventType: SUBSCRIPTION_EVENT_TYPES.TELEGRAM_CONNECTED,
      source: 'telegram_start',
      metadata: {
        telegramUserId: input.telegramUserId,
        chatId: input.chatId,
      },
    });

    await writeAuditLog({
      action: 'TELEGRAM_LINK_COMPLETED',
      entity: 'ACCESS_KEY',
      entityId: linkToken.accessKey.id,
      details: {
        telegramUserId: input.telegramUserId,
        chatId: input.chatId,
      },
    });
  }

  if (linkToken.dynamicAccessKey) {
    await recordSubscriptionPageEvent({
      dynamicAccessKeyId: linkToken.dynamicAccessKey.id,
      eventType: SUBSCRIPTION_EVENT_TYPES.TELEGRAM_CONNECTED,
      source: 'telegram_start',
      metadata: {
        telegramUserId: input.telegramUserId,
        chatId: input.chatId,
      },
    });

    await writeAuditLog({
      action: 'TELEGRAM_LINK_COMPLETED',
      entity: 'DYNAMIC_ACCESS_KEY',
      entityId: linkToken.dynamicAccessKey.id,
      details: {
        telegramUserId: input.telegramUserId,
        chatId: input.chatId,
      },
    });
  }

  return {
    status: 'linked' as const,
    accessKeyId: linkToken.accessKey?.id ?? null,
    dynamicAccessKeyId: linkToken.dynamicAccessKey?.id ?? null,
  };
}

async function findLinkedAccessKeys(chatId: number, telegramUserId: number, includeInactive = false) {
  return db.accessKey.findMany({
    where: {
      OR: [{ telegramId: String(telegramUserId) }, { user: { telegramChatId: String(chatId) } }],
      ...(includeInactive
        ? {}
        : {
            status: {
              in: ['ACTIVE', 'PENDING'],
            },
          }),
    },
    include: {
      server: true,
      user: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
}

async function resolveAdminKeyQuery(query: string) {
  const trimmed = query.trim();
  if (!trimmed) {
    return { kind: 'empty' as const };
  }

  const byId = await db.accessKey.findUnique({
    where: { id: trimmed },
    include: {
      server: true,
      user: true,
    },
  });

  if (byId) {
    return { kind: 'single' as const, key: byId };
  }

  const byOutlineId = await db.accessKey.findFirst({
    where: { outlineKeyId: trimmed },
    include: {
      server: true,
      user: true,
    },
  });

  if (byOutlineId) {
    return { kind: 'single' as const, key: byOutlineId };
  }

  const matches = await db.accessKey.findMany({
    where: {
      OR: [
        { name: { contains: trimmed } },
        { email: { contains: trimmed } },
        { telegramId: { contains: trimmed } },
        { user: { email: { contains: trimmed } } },
      ],
    },
    include: {
      server: true,
      user: true,
    },
    take: 5,
    orderBy: { updatedAt: 'desc' },
  });

  if (matches.length === 1) {
    return { kind: 'single' as const, key: matches[0] };
  }

  return {
    kind: 'many' as const,
    matches,
  };
}

async function setAccessKeyEnabledState(accessKeyId: string, enable: boolean) {
  const key = await db.accessKey.findUnique({
    where: { id: accessKeyId },
    include: {
      server: true,
      user: true,
    },
  });

  if (!key) {
    throw new Error('Access key not found.');
  }

  const client = createOutlineClient(key.server.apiUrl, key.server.apiCertSha256);
  const isCurrentlyDisabled = key.status === 'DISABLED';

  if (enable) {
    if (!isCurrentlyDisabled) {
      return key;
    }

    const assignmentCheck = canAssignKeysToServer(key.server);
    if (!assignmentCheck.allowed) {
      throw new Error(assignmentCheck.reason);
    }

    const recreated = await client.createAccessKey({
      name: key.name,
      method: key.method || undefined,
    });

    if (key.dataLimitBytes) {
      await client.setAccessKeyDataLimit(recreated.id, Number(key.dataLimitBytes));
    }

    return db.accessKey.update({
      where: { id: key.id },
      data: {
        status: 'ACTIVE',
        outlineKeyId: recreated.id,
        accessUrl: decorateOutlineAccessUrl(recreated.accessUrl, key.name),
        password: recreated.password,
        port: recreated.port,
        method: recreated.method,
        disabledAt: null,
        disabledOutlineKeyId: null,
        usageOffset: BigInt(-Number(key.usedBytes)),
      },
      include: {
        server: true,
        user: true,
      },
    });
  }

  if (isCurrentlyDisabled) {
    return key;
  }

  try {
    await client.deleteAccessKey(key.outlineKeyId);
  } catch (error) {
    console.warn(`Failed to delete key ${key.outlineKeyId} from Outline:`, error);
  }

  await db.connectionSession.updateMany({
    where: {
      accessKeyId: key.id,
      isActive: true,
    },
    data: {
      isActive: false,
      endedAt: new Date(),
      endedReason: 'KEY_DISABLED',
    },
  });

  return db.accessKey.update({
    where: { id: key.id },
    data: {
      status: 'DISABLED',
      disabledAt: new Date(),
      disabledOutlineKeyId: key.outlineKeyId,
      estimatedDevices: 0,
    },
    include: {
      server: true,
      user: true,
    },
  });
}

async function handleStartCommand(
  chatId: number,
  telegramUserId: number,
  username: string,
  isAdmin: boolean,
  botToken: string,
  argsText: string,
): Promise<string | null> {
  const trimmedArgs = argsText.trim();

  if (trimmedArgs) {
    const linkResult = await markTelegramLinkTokenConsumed({
      token: trimmedArgs,
      chatId: String(chatId),
      telegramUserId: String(telegramUserId),
    });

    if (linkResult.status === 'linked' || linkResult.status === 'already-linked') {
      await sendTelegramMessage(
        botToken,
        chatId,
        `✅ Telegram linked for <b>${escapeHtml(username)}</b>.\n\nUse /usage or /mykeys to fetch your keys any time.`,
        {
          replyMarkup: getCommandKeyboard(isAdmin),
        },
      );

      if (linkResult.accessKeyId) {
        try {
          await sendAccessKeySharePageToTelegram({
            accessKeyId: linkResult.accessKeyId,
            chatId: String(chatId),
            reason: 'LINKED',
            source: 'telegram_start',
          });
        } catch (error) {
          console.error('Failed to send share page after Telegram link:', error);
        }
      }

      if (linkResult.dynamicAccessKeyId) {
        try {
          await sendDynamicKeySharePageToTelegram({
            dynamicAccessKeyId: linkResult.dynamicAccessKeyId,
            chatId: String(chatId),
            reason: 'LINKED',
            source: 'telegram_start',
          });
        } catch (error) {
          console.error('Failed to send dynamic share page after Telegram link:', error);
        }
      }

      return null;
    }

    const errorMessage =
      linkResult.status === 'expired'
        ? '⚠️ This Telegram link has expired. Ask the admin to generate a new one.'
        : '❌ That Telegram link is not valid anymore. Ask the admin for a fresh link.';

    await sendTelegramMessage(botToken, chatId, errorMessage, {
      replyMarkup: getCommandKeyboard(isAdmin),
    });
    return null;
  }

  const existingUser = await db.user.findFirst({
    where: { telegramChatId: String(chatId) },
  });

  if (existingUser) {
    await sendTelegramMessage(
      botToken,
      chatId,
      `✅ Welcome back, <b>${escapeHtml(username)}</b>!\n\nYour account is already linked. Use /usage or /mykeys any time.`,
      {
        replyMarkup: getCommandKeyboard(isAdmin),
      },
    );
    return null;
  }

  const key = await db.accessKey.findFirst({
    where: { telegramId: String(telegramUserId) },
    include: { user: true },
  });

  if (key?.user) {
    await db.user.update({
      where: { id: key.user.id },
      data: { telegramChatId: String(chatId) },
    });

    await sendTelegramMessage(
      botToken,
      chatId,
      `✅ Account linked successfully!\n\nWelcome, <b>${escapeHtml(username)}</b>! Use /usage or /mykeys to fetch your keys.`,
      {
        replyMarkup: getCommandKeyboard(isAdmin),
      },
    );
    return null;
  }

  const config = await getTelegramConfig();
  const adminMsg = isAdmin ? '\n\nYou are recognized as an administrator.' : '';
  const welcomeMessage =
    config?.welcomeMessage ||
    'Send your email address, or ask your admin to generate a Telegram connect link from your key.';

  await sendTelegramMessage(
    botToken,
    chatId,
    `👋 Hello, <b>${escapeHtml(username)}</b>!${adminMsg}\n\n${escapeHtml(welcomeMessage)}\n\nYour Telegram ID: <code>${telegramUserId}</code>`,
    {
      replyMarkup: getCommandKeyboard(isAdmin),
    },
  );
  return null;
}

async function handleEmailLink(chatId: number, telegramUserId: number, email: string) {
  const keys = await db.accessKey.findMany({
    where: {
      email: email.toLowerCase(),
      status: { in: ['ACTIVE', 'PENDING', 'DISABLED'] },
    },
  });

  if (keys.length === 0) {
    return `❌ No keys found for email: ${escapeHtml(email)}`;
  }

  await db.accessKey.updateMany({
    where: { email: email.toLowerCase() },
    data: { telegramId: String(telegramUserId) },
  });

  const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
  if (user) {
    await db.user.update({
      where: { id: user.id },
      data: { telegramChatId: String(chatId) },
    });
  }

  return `✅ Linked ${keys.length} key(s) to this Telegram account.\n\nUse /usage or /sub to receive your access details.`;
}

async function handleUsageCommand(
  chatId: number,
  telegramUserId: number,
  botToken: string,
): Promise<string> {
  const keys = await findLinkedAccessKeys(chatId, telegramUserId, false);

  if (keys.length === 0) {
    const config = await getTelegramConfig();
    return (
      config?.keyNotFoundMessage ||
      '❌ No VPN keys are linked to this Telegram account yet.\n\nSend your email address or use a Telegram connect link from the admin.'
    );
  }

  let response = '📊 <b>Your VPN Usage</b>\n\n';

  for (const key of keys) {
    const usedBytes = Number(key.usedBytes);
    const limitBytes = key.dataLimitBytes ? Number(key.dataLimitBytes) : null;
    const usageText = limitBytes
      ? `${formatBytes(key.usedBytes)} / ${formatBytes(key.dataLimitBytes!)} (${Math.round((usedBytes / limitBytes) * 100)}%)`
      : `${formatBytes(key.usedBytes)} / Unlimited`;

    response += `${key.status === 'ACTIVE' ? '🟢' : '🔵'} <b>${escapeHtml(key.name)}</b>\n`;
    response += `   📡 ${escapeHtml(key.server.name)}${key.server.countryCode ? ` ${getFlagEmoji(key.server.countryCode)}` : ''}\n`;
    response += `   📈 ${usageText}\n`;
    response += `   ⏳ ${escapeHtml(formatExpirationSummary(key))}\n\n`;

    if (key.accessUrl) {
      setTimeout(async () => {
        try {
          await sendAccessKeySharePageToTelegram({
            accessKeyId: key.id,
            chatId: String(chatId),
            reason: 'USAGE_REQUEST',
            source: 'telegram_usage',
            includeQr: true,
          });
        } catch (error) {
          console.error('Failed to send usage share page via Telegram:', error);
        }
      }, 500);
    }
  }

  return response;
}

async function handleMyKeysCommand(chatId: number, telegramUserId: number): Promise<string> {
  const keys = await findLinkedAccessKeys(chatId, telegramUserId, true);

  if (keys.length === 0) {
    return '❌ No linked keys found for this Telegram account.';
  }

  const lines = ['🗂 <b>Your linked keys</b>', ''];

  for (const key of keys) {
    const token = await ensureAccessKeySubscriptionToken(key.id, key.subscriptionToken);
    const sharePageUrl = key.publicSlug
      ? buildShortShareUrl(key.publicSlug, { source: 'telegram_mykeys' })
      : buildSharePageUrl(token, { source: 'telegram_mykeys' });
    lines.push(
      `• <b>${escapeHtml(key.name)}</b>`,
      `  ID: <code>${key.id}</code>`,
      `  Status: ${escapeHtml(key.status)}`,
      `  Server: ${escapeHtml(key.server.name)}`,
      `  Share page: ${sharePageUrl}`,
      '',
    );
  }

  return lines.join('\n');
}

async function handleSubscriptionLinksCommand(
  chatId: number,
  telegramUserId: number,
): Promise<string> {
  const keys = await findLinkedAccessKeys(chatId, telegramUserId, false);

  if (keys.length === 0) {
    return '❌ No active keys are linked to this Telegram account.';
  }

  for (const key of keys) {
    try {
      await sendAccessKeySharePageToTelegram({
        accessKeyId: key.id,
        chatId: String(chatId),
        reason: 'SUBSCRIPTION_REQUEST',
        source: 'telegram_sub',
        includeQr: true,
      });
    } catch (error) {
      console.error('Failed to send subscription link via Telegram:', error);
    }
  }

  return `📎 Sent ${keys.length} share page(s) to this chat.`;
}

async function handleSupportCommand(): Promise<string> {
  const { supportLink } = await getSubscriptionDefaults();

  if (!supportLink) {
    return 'ℹ️ No support link is configured right now.';
  }

  return `🛟 Support: ${supportLink}`;
}

async function handleUserServerCommand(chatId: number, telegramUserId: number): Promise<string> {
  const keys = await findLinkedAccessKeys(chatId, telegramUserId, true);

  if (keys.length === 0) {
    return '❌ No linked keys found for this Telegram account.';
  }

  const grouped = new Map<
    string,
    { name: string; countryCode: string | null; keyCount: number; activeCount: number }
  >();

  for (const key of keys) {
    const current = grouped.get(key.serverId) || {
      name: key.server.name,
      countryCode: key.server.countryCode,
      keyCount: 0,
      activeCount: 0,
    };

    current.keyCount += 1;
    if (key.status === 'ACTIVE' || key.status === 'PENDING') {
      current.activeCount += 1;
    }
    grouped.set(key.serverId, current);
  }

  const lines = ['🖥 <b>Your servers</b>', ''];
  for (const server of Array.from(grouped.values())) {
    lines.push(
      `• ${escapeHtml(server.name)}${server.countryCode ? ` ${getFlagEmoji(server.countryCode)}` : ''}`,
      `  Keys: ${server.keyCount} total, ${server.activeCount} active`,
      '',
    );
  }

  return lines.join('\n');
}

async function handleRenewCommand(
  chatId: number,
  telegramUserId: number,
  username: string,
  argsText: string,
): Promise<string> {
  const keys = await findLinkedAccessKeys(chatId, telegramUserId, true);

  if (keys.length === 0) {
    return '❌ No linked keys found for this Telegram account.';
  }

  const requestedKeys =
    argsText.trim().length > 0
      ? keys.filter((key) => key.name.toLowerCase().includes(argsText.trim().toLowerCase()))
      : keys;

  if (requestedKeys.length === 0) {
    return `❌ No linked key matched "${escapeHtml(argsText.trim())}".`;
  }

  for (const key of requestedKeys) {
    await sendRenewalRequestToAdmins({
      accessKeyId: key.id,
      requesterTelegramId: String(telegramUserId),
      requesterName: username,
    });
  }

  return `✅ Renewal request sent for ${requestedKeys.length} key(s). An administrator has been notified.`;
}

async function handleStatusCommand(): Promise<string> {
  const servers = await db.server.findMany({
    where: { isActive: true },
    include: { healthCheck: true, _count: { select: { accessKeys: true } } },
  });

  if (servers.length === 0) return '❌ No servers configured.';

  let response = '🖥️ <b>Server Status</b>\n\n';

  for (const server of servers) {
    const status = server.healthCheck?.lastStatus || 'UNKNOWN';
    const statusEmoji =
      status === 'UP' ? '🟢' : status === 'DOWN' ? '🔴' : status === 'SLOW' ? '🟡' : '⚪';
    const latency = server.healthCheck?.lastLatencyMs;
    const uptime = server.healthCheck?.uptimePercent?.toFixed(1) || '-';

    response += `${statusEmoji} <b>${escapeHtml(server.name)}</b>\n`;
    response += `   • Status: ${status}\n`;
    response += `   • Latency: ${latency ? `${latency}ms` : '-'}\n`;
    response += `   • Uptime: ${uptime}%\n`;
    response += `   • Keys: ${server._count.accessKeys}\n\n`;
  }

  return response;
}

async function handleExpiringCommand(argsText: string): Promise<string> {
  const requestedDays = Number.parseInt(argsText.trim(), 10);
  const days = Number.isFinite(requestedDays) && requestedDays > 0 ? Math.min(requestedDays, 30) : 7;
  const now = new Date();
  const end = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const keys = await db.accessKey.findMany({
    where: {
      status: { in: ['ACTIVE', 'PENDING'] },
      expiresAt: {
        gte: now,
        lte: end,
      },
    },
    include: {
      server: true,
    },
    orderBy: {
      expiresAt: 'asc',
    },
    take: 10,
  });

  if (keys.length === 0) {
    return `✅ No keys are expiring in the next ${days} day(s).`;
  }

  const lines = [`⏳ <b>Keys expiring in the next ${days} day(s)</b>`, ''];
  for (const key of keys) {
    lines.push(
      `• <b>${escapeHtml(key.name)}</b>`,
      `  ID: <code>${key.id}</code>`,
      `  Server: ${escapeHtml(key.server.name)}`,
      `  Expires: ${key.expiresAt?.toLocaleString() || 'Unknown'}`,
      '',
    );
  }

  return lines.join('\n');
}

async function handleFindCommand(argsText: string): Promise<string> {
  const query = argsText.trim();
  if (!query) {
    return '🔎 Usage: /find <name, email, Telegram ID, key ID, or Outline ID>';
  }

  const result = await resolveAdminKeyQuery(query);

  if (result.kind === 'single') {
    const key = result.key;
    return [
      '🔎 <b>Key found</b>',
      '',
      `Name: <b>${escapeHtml(key.name)}</b>`,
      `ID: <code>${key.id}</code>`,
      `Outline ID: <code>${escapeHtml(key.outlineKeyId)}</code>`,
      `Status: ${escapeHtml(key.status)}`,
      `Server: ${escapeHtml(key.server.name)}`,
      key.email ? `Email: ${escapeHtml(key.email)}` : '',
      key.telegramId ? `Telegram: <code>${escapeHtml(key.telegramId)}</code>` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (result.kind === 'many') {
    if (result.matches.length === 0) {
      return `❌ No access keys matched "${escapeHtml(query)}".`;
    }

    return [
      `🔎 <b>Matches for "${escapeHtml(query)}"</b>`,
      '',
      ...result.matches.flatMap((key) => [
        `• <b>${escapeHtml(key.name)}</b>`,
        `  ID: <code>${key.id}</code>`,
        `  Status: ${escapeHtml(key.status)} • ${escapeHtml(key.server.name)}`,
        '',
      ]),
    ].join('\n');
  }

  return '❌ Please provide a key identifier or search term.';
}

async function handleAdminToggleCommand(
  argsText: string,
  enable: boolean,
): Promise<string> {
  const query = argsText.trim();
  if (!query) {
    return enable ? 'Usage: /enable <key-id>' : 'Usage: /disable <key-id>';
  }

  const result = await resolveAdminKeyQuery(query);
  if (result.kind !== 'single') {
    if (result.kind === 'many' && result.matches.length > 0) {
      return [
        '⚠️ Multiple keys matched. Use one of these exact IDs:',
        '',
        ...result.matches.map((key) => `• <code>${key.id}</code> — ${escapeHtml(key.name)}`),
      ].join('\n');
    }

    return '❌ Key not found.';
  }

  const updatedKey = await setAccessKeyEnabledState(result.key.id, enable);
  await sendAccessKeyLifecycleTelegramNotification({
    accessKeyId: updatedKey.id,
    type: enable ? 'ENABLED' : 'DISABLED',
  });

  await writeAuditLog({
    action: enable ? 'TELEGRAM_ADMIN_KEY_ENABLED' : 'TELEGRAM_ADMIN_KEY_DISABLED',
    entity: 'ACCESS_KEY',
    entityId: updatedKey.id,
    details: {
      via: 'telegram_bot',
    },
  });

  return enable
    ? `✅ Re-enabled <b>${escapeHtml(updatedKey.name)}</b>.`
    : `⛔ Disabled <b>${escapeHtml(updatedKey.name)}</b>.`;
}

async function handleResendCommand(argsText: string): Promise<string> {
  const query = argsText.trim();
  if (!query) {
    return 'Usage: /resend <key-id>';
  }

  const result = await resolveAdminKeyQuery(query);
  if (result.kind !== 'single') {
    if (result.kind === 'many' && result.matches.length > 0) {
      return [
        '⚠️ Multiple keys matched. Use one exact ID:',
        '',
        ...result.matches.map((key) => `• <code>${key.id}</code> — ${escapeHtml(key.name)}`),
      ].join('\n');
    }

    return '❌ Key not found.';
  }

  try {
    await sendAccessKeySharePageToTelegram({
      accessKeyId: result.key.id,
      reason: 'RESENT',
      source: 'telegram_admin_resend',
      includeQr: true,
    });
  } catch (error) {
    return `❌ Failed to resend: ${escapeHtml((error as Error).message)}`;
  }

  return `📨 Resent the share page for <b>${escapeHtml(result.key.name)}</b>.`;
}

async function handleSysInfoCommand(chatId: number, botToken: string): Promise<string> {
  await sendTelegramMessage(botToken, chatId, '🔄 Gathering system information...');

  try {
    const [cpu, mem, disk, osInfo] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.osInfo(),
    ]);

    const totalDisk = disk.reduce((acc, item) => acc + item.size, 0);
    const usedDisk = disk.reduce((acc, item) => acc + item.used, 0);
    const usedDiskPercent = totalDisk > 0 ? (usedDisk / totalDisk) * 100 : 0;

    return [
      '<b>System Information</b> 🖥️',
      '',
      `<b>OS:</b> ${escapeHtml(`${osInfo.distro} ${osInfo.release}`)}`,
      `<b>CPU Load:</b> ${cpu.currentLoad.toFixed(1)}%`,
      `<b>Memory:</b> ${formatBytes(BigInt(mem.active))} / ${formatBytes(BigInt(mem.total))} (${((mem.active / mem.total) * 100).toFixed(1)}%)`,
      `<b>Disk:</b> ${formatBytes(BigInt(usedDisk))} / ${formatBytes(BigInt(totalDisk))} (${usedDiskPercent.toFixed(1)}%)`,
    ].join('\n');
  } catch (error) {
    console.error('Sysinfo error:', error);
    return '❌ Failed to retrieve system information.';
  }
}

async function handleBackupCommand(chatId: number, botToken: string): Promise<string | null> {
  await sendTelegramMessage(botToken, chatId, '📦 Creating backup... please wait.');

  try {
    const backupDir = path.join(process.cwd(), 'storage', 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup-${timestamp}.zip`;
    const filePath = path.join(backupDir, filename);
    const output = fs.createWriteStream(filePath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    await new Promise<void>((resolve, reject) => {
      output.on('close', () => resolve());
      archive.on('error', reject);
      archive.pipe(output);

      const dbUrl = process.env.DATABASE_URL;
      if (dbUrl && dbUrl.includes('file:')) {
        const relativePath = dbUrl.replace('file:', '');
        const dbPath = path.isAbsolute(relativePath)
          ? relativePath
          : path.resolve(process.cwd(), 'prisma', relativePath.replace(/^\.\//, ''));

        if (fs.existsSync(dbPath)) {
          archive.file(dbPath, { name: 'atomic-ui.db' });
        }
      }

      archive.finalize();
    });

    const fileBuffer = fs.readFileSync(filePath);
    await sendTelegramDocument(
      botToken,
      chatId,
      fileBuffer,
      filename,
      `Backup created at ${new Date().toLocaleString()}`,
    );

    return null;
  } catch (error) {
    console.error('Backup error:', error);
    return `❌ Backup failed: ${escapeHtml((error as Error).message)}`;
  }
}

async function handleHelpCommand(
  chatId: number,
  botToken: string,
  isAdmin: boolean,
): Promise<null> {
  let message = `📚 <b>Available Commands</b>

/start - Link your Telegram account
/usage - Fetch your usage and QR/setup info
/mykeys - List linked keys and IDs
/sub - Receive your share pages
/support - Show the configured support link
/server - Show the servers behind your keys
/renew - Request renewal from an admin
/help - Show this help message`;

  if (isAdmin) {
    message += `\n\n<b>Admin Commands</b>
/status - Server status summary
/expiring [days] - Keys expiring soon
/find &lt;query&gt; - Search for a key
/disable &lt;key-id&gt; - Disable a key
/enable &lt;key-id&gt; - Re-enable a key
/resend &lt;key-id&gt; - Resend the share page
/sysinfo - System resource usage
/backup - Create and download a backup`;
  }

  message += `\n\nYou can also send your email address directly to link this Telegram account.`;

  await sendTelegramMessage(botToken, chatId, message, {
    replyMarkup: getCommandKeyboard(isAdmin),
  });

  return null;
}

/**
 * Handle incoming Telegram message.
 */
export async function handleTelegramUpdate(update: TelegramUpdate): Promise<string | null> {
  const message = update.message;
  if (!message || !message.text) return null;

  const chatId = message.chat.id;
  const telegramUserId = message.from.id;
  const username = message.from.username || message.from.first_name;
  const text = message.text.trim();

  const config = await getTelegramConfig();
  if (!config) return null;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (emailRegex.test(text)) {
    return handleEmailLink(chatId, telegramUserId, text);
  }

  const commandMatch = text.match(/^\/(\w+)(?:@\w+)?(?:\s+(.*))?$/);
  if (!commandMatch) return null;

  const command = commandMatch[1].toLowerCase();
  const argsText = commandMatch[2] || '';
  const isAdmin =
    config.adminChatIds.includes(String(telegramUserId)) ||
    config.adminChatIds.includes(String(chatId));

  switch (command) {
    case 'start':
      return handleStartCommand(
        chatId,
        telegramUserId,
        username,
        isAdmin,
        config.botToken,
        argsText,
      );
    case 'usage':
    case 'mykey':
    case 'key':
      return handleUsageCommand(chatId, telegramUserId, config.botToken);
    case 'mykeys':
      return handleMyKeysCommand(chatId, telegramUserId);
    case 'sub':
      return handleSubscriptionLinksCommand(chatId, telegramUserId);
    case 'support':
      return handleSupportCommand();
    case 'server':
      return isAdmin && !argsText.trim() ? handleStatusCommand() : handleUserServerCommand(chatId, telegramUserId);
    case 'renew':
      return handleRenewCommand(chatId, telegramUserId, username, argsText);
    case 'status':
      return isAdmin ? handleStatusCommand() : '❌ This command is only available to administrators.';
    case 'expiring':
      return isAdmin ? handleExpiringCommand(argsText) : '❌ This command is only available to administrators.';
    case 'find':
      return isAdmin ? handleFindCommand(argsText) : '❌ This command is only available to administrators.';
    case 'disable':
      return isAdmin ? handleAdminToggleCommand(argsText, false) : '❌ This command is only available to administrators.';
    case 'enable':
      return isAdmin ? handleAdminToggleCommand(argsText, true) : '❌ This command is only available to administrators.';
    case 'resend':
      return isAdmin ? handleResendCommand(argsText) : '❌ This command is only available to administrators.';
    case 'sysinfo':
      return isAdmin ? handleSysInfoCommand(chatId, config.botToken) : '❌ This command is only available to administrators.';
    case 'backup':
      return isAdmin ? handleBackupCommand(chatId, config.botToken) : '❌ This command is only available to administrators.';
    case 'help':
      return handleHelpCommand(chatId, config.botToken, isAdmin);
    default:
      return '❓ Unknown command. Use /help to see the available commands.';
  }
}

export async function sendTelegramDigestToAdmins(input?: {
  now?: Date;
}) {
  const config = await getTelegramConfig();
  if (!config || config.adminChatIds.length === 0) {
    return { sent: false, reason: 'not-configured' as const };
  }

  const now = input?.now || new Date();
  const lookbackHours = config.digestLookbackHours || 24;
  const since = new Date(now.getTime() - lookbackHours * 60 * 60 * 1000);

  const [activeKeys, pendingKeys, depletedKeys, expiringSoon, openIncidents, healthCounts, recentViews] =
    await Promise.all([
      db.accessKey.count({ where: { status: 'ACTIVE' } }),
      db.accessKey.count({ where: { status: 'PENDING' } }),
      db.accessKey.count({ where: { status: 'DEPLETED' } }),
      db.accessKey.count({
        where: {
          status: { in: ['ACTIVE', 'PENDING'] },
          expiresAt: {
            gte: now,
            lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),
      db.incident.count({
        where: {
          status: 'OPEN',
        },
      }),
      db.healthCheck.groupBy({
        by: ['lastStatus'],
        _count: { lastStatus: true },
      }),
      db.subscriptionPageEvent.count({
        where: {
          createdAt: {
            gte: since,
          },
        },
      }),
    ]);

  const healthSummary = {
    up: 0,
    slow: 0,
    down: 0,
    unknown: 0,
  };

  for (const row of healthCounts) {
    switch (row.lastStatus) {
      case 'UP':
        healthSummary.up = row._count.lastStatus;
        break;
      case 'SLOW':
        healthSummary.slow = row._count.lastStatus;
        break;
      case 'DOWN':
        healthSummary.down = row._count.lastStatus;
        break;
      default:
        healthSummary.unknown += row._count.lastStatus;
        break;
    }
  }

  const message = [
    '🧾 <b>Atomic-UI Telegram Digest</b>',
    '',
    `Window: last ${lookbackHours} hour(s)`,
    `Active keys: ${activeKeys}`,
    `Pending keys: ${pendingKeys}`,
    `Depleted keys: ${depletedKeys}`,
    `Expiring in 7 days: ${expiringSoon}`,
    `Open incidents: ${openIncidents}`,
    `Subscription page events: ${recentViews}`,
    '',
    `Server health: ${healthSummary.up} up, ${healthSummary.slow} slow, ${healthSummary.down} down, ${healthSummary.unknown} unknown`,
  ].join('\n');

  for (const chatId of config.adminChatIds) {
    await sendTelegramMessage(config.botToken, chatId, message);
  }

  await writeAuditLog({
    action: 'TELEGRAM_DIGEST_SENT',
    entity: 'TELEGRAM',
    details: {
      adminChats: config.adminChatIds.length,
      lookbackHours,
      activeKeys,
      expiringSoon,
      openIncidents,
      recentViews,
    },
  });

  return {
    sent: true as const,
    adminChats: config.adminChatIds.length,
    lookbackHours,
  };
}
