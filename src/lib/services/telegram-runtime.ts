import { db } from '@/lib/db';
import { coerceSupportedLocale, type SupportedLocale } from '@/lib/i18n/config';
import {
  normalizeLocalizedTemplateMap,
  type LocalizedTemplateMap,
} from '@/lib/localized-templates';
import {
  buildDefaultTelegramTemplateMap,
  DEFAULT_TELEGRAM_KEY_NOT_FOUND_MESSAGES,
  DEFAULT_TELEGRAM_WELCOME_MESSAGES,
} from '@/lib/services/telegram-copy';
import { getTelegramSalesSettings } from '@/lib/services/telegram-sales';
import { escapeHtml } from '@/lib/services/telegram-ui';

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';

export type TelegramParseMode = 'HTML' | 'Markdown';

export interface TelegramConfig {
  botToken: string;
  botUsername?: string;
  adminChatIds: string[];
  welcomeMessage?: string;
  keyNotFoundMessage?: string;
  localizedWelcomeMessages?: LocalizedTemplateMap;
  localizedKeyNotFoundMessages?: LocalizedTemplateMap;
  dailyDigestEnabled?: boolean;
  dailyDigestHour?: number;
  dailyDigestMinute?: number;
  digestLookbackHours?: number;
  defaultLanguage?: SupportedLocale;
  showLanguageSelectorOnStart?: boolean;
}

export interface SendMessageOptions {
  parseMode?: TelegramParseMode;
  replyMarkup?: Record<string, unknown>;
  disableWebPagePreview?: boolean;
}

export async function getTelegramDefaultLocale(): Promise<SupportedLocale> {
  const [botSetting, appSetting] = await Promise.all([
    db.settings.findUnique({
      where: { key: 'telegram_bot' },
      select: { value: true },
    }),
    db.settings.findUnique({
      where: { key: 'defaultLanguage' },
      select: { value: true },
    }),
  ]);

  if (botSetting?.value) {
    try {
      const parsed = JSON.parse(botSetting.value) as Record<string, unknown>;
      const configured = coerceSupportedLocale(
        typeof parsed.defaultLanguage === 'string' ? parsed.defaultLanguage : undefined,
      );
      if (configured) {
        return configured;
      }
    } catch {
      // Ignore malformed bot settings and fall back to the app default.
    }
  }

  return coerceSupportedLocale(appSetting?.value) || 'en';
}

export async function getTelegramUserProfile(
  telegramUserId: string,
  telegramChatId?: string | null,
) {
  return db.telegramUserProfile.findFirst({
    where: {
      OR: [
        { telegramUserId },
        ...(telegramChatId ? [{ telegramChatId }] : []),
      ],
    },
  });
}

export async function upsertTelegramUserProfile(input: {
  telegramUserId: string;
  telegramChatId?: string | null;
  username?: string | null;
  displayName?: string | null;
  locale?: SupportedLocale | null;
}) {
  const existing = await db.telegramUserProfile.findUnique({
    where: { telegramUserId: input.telegramUserId },
    select: { telegramUserId: true },
  });

  if (!existing) {
    return db.telegramUserProfile.create({
      data: {
        telegramUserId: input.telegramUserId,
        telegramChatId: input.telegramChatId || null,
        username: input.username || null,
        displayName: input.displayName || null,
        locale: input.locale || null,
      },
    });
  }

  return db.telegramUserProfile.update({
    where: { telegramUserId: input.telegramUserId },
    data: {
      telegramChatId: input.telegramChatId || null,
      username: input.username || null,
      displayName: input.displayName || null,
      ...(input.locale ? { locale: input.locale } : {}),
    },
  });
}

export async function setTelegramPendingPremiumReply(input: {
  telegramUserId: string;
  telegramChatId?: string | null;
  requestId?: string | null;
}) {
  return db.telegramUserProfile.upsert({
    where: { telegramUserId: input.telegramUserId },
    create: {
      telegramUserId: input.telegramUserId,
      telegramChatId: input.telegramChatId || null,
      pendingPremiumSupportRequestId: input.requestId || null,
      pendingPremiumReplyStartedAt: input.requestId ? new Date() : null,
    },
    update: {
      telegramChatId: input.telegramChatId || null,
      pendingPremiumSupportRequestId: input.requestId || null,
      pendingPremiumReplyStartedAt: input.requestId ? new Date() : null,
    },
  });
}

export async function getTelegramPendingPremiumReply(input: {
  telegramUserId: string;
  telegramChatId?: string | null;
}) {
  const profile = await getTelegramUserProfile(input.telegramUserId, input.telegramChatId);
  if (!profile?.pendingPremiumSupportRequestId) {
    return null;
  }

  return {
    requestId: profile.pendingPremiumSupportRequestId,
    startedAt: profile.pendingPremiumReplyStartedAt || null,
  };
}

export async function setTelegramUserLocale(input: {
  telegramUserId: string;
  telegramChatId?: string | null;
  username?: string | null;
  displayName?: string | null;
  locale: SupportedLocale;
}) {
  await upsertTelegramUserProfile(input);
  await db.telegramOrder.updateMany({
    where: {
      telegramUserId: input.telegramUserId,
      ...(input.telegramChatId ? { telegramChatId: input.telegramChatId } : {}),
      status: {
        in: [
          'AWAITING_KEY_SELECTION',
          'AWAITING_PLAN',
          'AWAITING_MONTHS',
          'AWAITING_SERVER_SELECTION',
          'AWAITING_KEY_NAME',
          'AWAITING_PAYMENT_METHOD',
          'AWAITING_PAYMENT_PROOF',
          'PENDING_REVIEW',
          'APPROVED',
        ],
      },
    },
    data: {
      locale: input.locale,
    },
  });
}

export async function getTelegramConversationLocale(input: {
  telegramUserId: string | number;
  telegramChatId?: string | number | null;
}) {
  const profile = await getTelegramUserProfile(
    String(input.telegramUserId),
    input.telegramChatId ? String(input.telegramChatId) : null,
  );

  return coerceSupportedLocale(profile?.locale) || (await getTelegramDefaultLocale());
}

export async function resolveTelegramLocaleForRecipient(input: {
  telegramUserId?: string | null;
  telegramChatId?: string | null;
  fallbackLocale?: SupportedLocale;
}) {
  if (input.telegramUserId || input.telegramChatId) {
    const profile = input.telegramUserId
      ? await getTelegramUserProfile(input.telegramUserId, input.telegramChatId || null)
      : input.telegramChatId
        ? await db.telegramUserProfile.findFirst({
            where: {
              telegramChatId: input.telegramChatId,
            },
          })
        : null;
    const locale = coerceSupportedLocale(profile?.locale);
    if (locale) {
      return locale;
    }
  }

  return input.fallbackLocale || (await getTelegramDefaultLocale());
}

export async function getSubscriptionDefaults() {
  const settings = await db.settings.findMany({
    where: {
      key: {
        in: [
          'supportLink',
          'subscriptionWelcomeMessage',
          'subscriptionLocalizedWelcomeMessages',
          'defaultLanguage',
        ],
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
    localizedWelcomeMessages: normalizeLocalizedTemplateMap(
      settingsMap.get('subscriptionLocalizedWelcomeMessages'),
    ),
    defaultLanguage: coerceSupportedLocale(settingsMap.get('defaultLanguage')) || 'en',
  };
}

export async function getTelegramSupportLink() {
  const [salesSettings, defaults] = await Promise.all([
    getTelegramSalesSettings(),
    getSubscriptionDefaults(),
  ]);

  return salesSettings.supportLink?.trim() || defaults.supportLink || null;
}

export async function getTelegramBotUsername(
  botToken: string,
  configuredUsername?: string | null,
) {
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

export async function getTelegramConfig(): Promise<TelegramConfig | null> {
  const settings = await db.settings.findUnique({ where: { key: 'telegram_bot' } });
  if (settings) {
    try {
      const config = JSON.parse(settings.value) as Record<string, unknown>;
      if (config.isEnabled && typeof config.botToken === 'string' && config.botToken.trim()) {
        const localizedWelcomeMessages = buildDefaultTelegramTemplateMap(
          DEFAULT_TELEGRAM_WELCOME_MESSAGES,
          config.localizedWelcomeMessages,
        );
        const localizedKeyNotFoundMessages = buildDefaultTelegramTemplateMap(
          DEFAULT_TELEGRAM_KEY_NOT_FOUND_MESSAGES,
          config.localizedKeyNotFoundMessages,
        );

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
              : DEFAULT_TELEGRAM_WELCOME_MESSAGES.en,
          keyNotFoundMessage:
            typeof config.keyNotFoundMessage === 'string' && config.keyNotFoundMessage.trim()
              ? config.keyNotFoundMessage
              : DEFAULT_TELEGRAM_KEY_NOT_FOUND_MESSAGES.en,
          localizedWelcomeMessages,
          localizedKeyNotFoundMessages,
          dailyDigestEnabled: Boolean(config.dailyDigestEnabled),
          dailyDigestHour:
            typeof config.dailyDigestHour === 'number' ? config.dailyDigestHour : 9,
          dailyDigestMinute:
            typeof config.dailyDigestMinute === 'number' ? config.dailyDigestMinute : 0,
          digestLookbackHours:
            typeof config.digestLookbackHours === 'number' ? config.digestLookbackHours : 24,
          defaultLanguage:
            coerceSupportedLocale(
              typeof config.defaultLanguage === 'string' ? config.defaultLanguage : undefined,
            ) || (await getTelegramDefaultLocale()),
          showLanguageSelectorOnStart:
            typeof config.showLanguageSelectorOnStart === 'boolean'
              ? config.showLanguageSelectorOnStart
              : true,
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
          defaultLanguage: await getTelegramDefaultLocale(),
          showLanguageSelectorOnStart: true,
        };
      }
    } catch {
      // Ignore malformed channels and keep looking.
    }
  }

  return null;
}

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

export async function answerTelegramCallbackQuery(
  botToken: string,
  callbackQueryId: string,
  text?: string,
) {
  try {
    const response = await fetch(`${TELEGRAM_API_BASE}${botToken}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text,
      }),
    });

    return response.ok;
  } catch (error) {
    console.error('Failed to answer Telegram callback query:', error);
    return false;
  }
}

export async function sendAdminAlert(
  message: string,
  options: SendMessageOptions = {},
): Promise<void> {
  const config = await getTelegramConfig();
  if (!config) {
    return;
  }

  for (const chatId of config.adminChatIds) {
    await sendTelegramMessage(config.botToken, chatId, message, options);
  }
}

export async function sendServerIssueNoticeToTelegram(input: {
  chatIds: string[];
  serverName: string;
  noticeType: 'ISSUE' | 'DOWNTIME' | 'MAINTENANCE';
  message: string;
}) {
  const config = await getTelegramConfig();
  if (!config || input.chatIds.length === 0) {
    return {
      sentCount: 0,
    };
  }

  const supportLink = await getTelegramSupportLink();
  const prefix =
    input.noticeType === 'DOWNTIME'
      ? '🚨 <b>Server downtime notice</b>'
      : input.noticeType === 'MAINTENANCE'
        ? '🛠 <b>Server maintenance notice</b>'
        : '⚠️ <b>Server issue notice</b>';
  const lines = [
    prefix,
    '',
    `🖥 <b>${escapeHtml(input.serverName)}</b>`,
    escapeHtml(input.message.trim()),
  ];

  const uniqueChatIds = Array.from(
    new Set(input.chatIds.map((chatId) => chatId.trim()).filter((chatId) => chatId.length > 0)),
  );

  let sentCount = 0;
  for (const chatId of uniqueChatIds) {
    const sent = await sendTelegramMessage(config.botToken, chatId, lines.join('\n'), {
      replyMarkup: supportLink
        ? {
            inline_keyboard: [[{ text: 'Support', url: supportLink }]],
          }
        : undefined,
    });
    if (sent) {
      sentCount += 1;
    }
  }

  return { sentCount };
}

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

export async function sendTelegramPhotoUrl(
  botToken: string,
  chatId: number | string,
  photoUrl: string,
  caption?: string,
) {
  const trimmedPhotoUrl = photoUrl.trim();
  if (!trimmedPhotoUrl) {
    return;
  }

  try {
    const response = await fetch(`${TELEGRAM_API_BASE}${botToken}/sendPhoto`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId.toString(),
        photo: trimmedPhotoUrl,
        caption,
        parse_mode: caption ? 'HTML' : undefined,
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      console.error(`Failed to send Telegram photo URL to ${chatId}:`, data.description);
    }
  } catch (error) {
    console.error(`Error sending Telegram photo URL to ${chatId}:`, error);
  }
}

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

export async function copyTelegramMessage(
  botToken: string,
  fromChatId: number | string,
  messageId: number,
  toChatId: number | string,
) {
  try {
    const response = await fetch(`${TELEGRAM_API_BASE}${botToken}/copyMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from_chat_id: fromChatId,
        message_id: messageId,
        chat_id: toChatId,
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      console.error(`Failed to copy Telegram message to ${toChatId}:`, data.description);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Failed to copy Telegram message:', error);
    return false;
  }
}

export async function loadAccessKeyForMessaging(accessKeyId: string) {
  return db.accessKey.findUnique({
    where: { id: accessKeyId },
    include: {
      server: true,
      user: true,
    },
  });
}

export async function loadDynamicAccessKeyForMessaging(dynamicAccessKeyId: string) {
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

export function resolveTelegramChatIdForKey(key: {
  telegramId?: string | null;
  user?: { telegramChatId?: string | null } | null;
}) {
  return key.telegramId || key.user?.telegramChatId || null;
}

export function resolveTelegramChatIdForDynamicKey(key: {
  telegramId?: string | null;
  user?: { telegramChatId?: string | null } | null;
}) {
  return key.telegramId || key.user?.telegramChatId || null;
}
