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
import { sanitizeTelegramHtmlMessage } from '@/lib/services/telegram-message-validation';
import {
  getTelegramSalesSettings,
  normalizeTelegramSupportLink,
} from '@/lib/services/telegram-sales';
import {
  type SendTelegramMessageResult,
  type TelegramNotificationPreferenceKey,
} from '@/lib/services/telegram-domain-types';
import { getJwtSecretString } from '@/lib/session-secret';
import { escapeHtml } from '@/lib/services/telegram-ui';
import {
  getTelegramAdminBotCommands,
  getTelegramUserBotCommands,
  type TelegramBotCommandDefinition,
} from '@/lib/services/telegram-callbacks';
import {
  resolveTelegramWebhookSecret,
  TELEGRAM_WEBHOOK_SECRET_HEADER,
} from '@/lib/telegram-webhook-secret';
import {
  parseTelegramBotSettingsValue,
  serializeTelegramBotSettingsValue,
  telegramBotSettingsNeedSecretMigration,
} from '@/lib/telegram-bot-settings';

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';
const TELEGRAM_API_TIMEOUT_MS = 15_000;
const TELEGRAM_API_RETRY_DELAY_MS = 750;
const TELEGRAM_API_RETRYABLE_CODES = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EAI_AGAIN',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
]);
const TELEGRAM_COMMAND_SYNC_SIGNATURE = new Map<string, string>();
const TELEGRAM_COMMAND_SYNC_FAILURE_SIGNATURE = new Set<string>();
const TELEGRAM_MALFORMED_CHANNEL_WARNINGS = new Set<string>();

type TelegramCommandScope = {
  type: string;
  chat_id?: number;
};

type TelegramCommandSyncSet = {
  cacheKey: string;
  commands: TelegramBotCommandDefinition[];
  languageCode?: string;
  scope?: TelegramCommandScope;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractTelegramErrorCode(error: unknown) {
  if (!error || typeof error !== 'object') {
    return null;
  }

  const directCode = (error as { code?: unknown }).code;
  if (typeof directCode === 'string' && directCode.trim()) {
    return directCode.trim();
  }

  const cause = (error as { cause?: unknown }).cause;
  if (cause && typeof cause === 'object') {
    const causeCode = (cause as { code?: unknown }).code;
    if (typeof causeCode === 'string' && causeCode.trim()) {
      return causeCode.trim();
    }
  }

  return null;
}

function isRetryableTelegramTransportError(error: unknown) {
  const code = extractTelegramErrorCode(error);
  return code ? TELEGRAM_API_RETRYABLE_CODES.has(code) : false;
}

function summarizeTelegramTransportError(error: unknown) {
  if (error instanceof Error) {
    const code = extractTelegramErrorCode(error);
    if (code) {
      return `${error.message} (${code})`;
    }
    return error.message;
  }

  const code = extractTelegramErrorCode(error);
  if (code) {
    return `Telegram request failed (${code})`;
  }

  return 'Telegram request failed';
}

function withTelegramRequestTimeout(init: RequestInit = {}) {
  return {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(TELEGRAM_API_TIMEOUT_MS),
  } satisfies RequestInit;
}

async function fetchTelegramApi(
  url: string,
  init: RequestInit,
  options?: {
    retries?: number;
  },
) {
  const retries = options?.retries ?? 1;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fetch(url, withTelegramRequestTimeout(init));
    } catch (error) {
      if (attempt >= retries || !isRetryableTelegramTransportError(error)) {
        throw error;
      }
      await sleep(TELEGRAM_API_RETRY_DELAY_MS * (attempt + 1));
    }
  }

  throw new Error('Telegram request failed');
}

async function getTelegramErrorDescription(response: Response, fallback: string) {
  let description = fallback;
  try {
    const data = (await response.json()) as { description?: unknown };
    if (typeof data.description === 'string' && data.description.trim().length > 0) {
      description = data.description;
    }
  } catch {
    // Keep the fallback description.
  }

  return description;
}

export type TelegramParseMode = 'HTML' | 'Markdown' | 'MarkdownV2';

export interface TelegramConfig {
  botToken: string;
  botUsername?: string;
  webhookSecretToken?: string;
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

async function setTelegramMyCommands(
  botToken: string,
  commands: TelegramBotCommandDefinition[],
  options?: {
    languageCode?: string;
    scope?: TelegramCommandScope;
  },
) {
  const response = await fetchTelegramApi(`${TELEGRAM_API_BASE}${botToken}/setMyCommands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      commands,
      ...(options?.languageCode ? { language_code: options.languageCode } : {}),
      ...(options?.scope ? { scope: options.scope } : {}),
    }),
  });

  if (!response.ok) {
    const description = await getTelegramErrorDescription(response, `setMyCommands failed with status ${response.status}`);
    throw new Error(description);
  }
}

async function ensureTelegramMyCommands(botToken: string, adminChatIds: string[] = []) {
  const uniqueAdminChatIds = Array.from(
    new Set(
      adminChatIds
        .map((value) => value.trim())
        .filter((value) => /^-?\d+$/.test(value))
        .map((value) => Number.parseInt(value, 10))
        .filter((value) => Number.isSafeInteger(value)),
    ),
  );
  const commandSets: TelegramCommandSyncSet[] = [
    { cacheKey: `${botToken}:default`, commands: getTelegramUserBotCommands('en') },
    { cacheKey: `${botToken}:my`, commands: getTelegramUserBotCommands('my'), languageCode: 'my' },
    ...uniqueAdminChatIds.flatMap((chatId) => ([
      {
        cacheKey: `${botToken}:admin:${chatId}:default`,
        commands: getTelegramAdminBotCommands('en'),
        scope: { type: 'chat', chat_id: chatId },
      },
      {
        cacheKey: `${botToken}:admin:${chatId}:my`,
        commands: getTelegramAdminBotCommands('my'),
        languageCode: 'my',
        scope: { type: 'chat', chat_id: chatId },
      },
    ])),
  ];

  for (const commandSet of commandSets) {
    const signature = JSON.stringify({
      languageCode: commandSet.languageCode || null,
      scope: commandSet.scope || null,
      commands: commandSet.commands,
    });
    if (TELEGRAM_COMMAND_SYNC_SIGNATURE.get(commandSet.cacheKey) === signature) {
      continue;
    }

    await setTelegramMyCommands(
      botToken,
      commandSet.commands,
      {
        languageCode: commandSet.languageCode,
        scope: commandSet.scope,
      },
    );
    TELEGRAM_COMMAND_SYNC_SIGNATURE.set(commandSet.cacheKey, signature);
  }
}

async function ensureTelegramMyCommandsSafely(botToken: string, adminChatIds: string[] = []) {
  const failureKey = `${botToken}:${adminChatIds.map((value) => value.trim()).sort().join(',')}`;
  try {
    await ensureTelegramMyCommands(botToken, adminChatIds);
    TELEGRAM_COMMAND_SYNC_FAILURE_SIGNATURE.delete(failureKey);
  } catch (error) {
    if (!TELEGRAM_COMMAND_SYNC_FAILURE_SIGNATURE.has(failureKey)) {
      TELEGRAM_COMMAND_SYNC_FAILURE_SIGNATURE.add(failureKey);
      console.error('Failed to sync Telegram command menus:', error);
    }
  }
}

export interface SendMessageOptions {
  parseMode?: TelegramParseMode;
  replyMarkup?: Record<string, unknown>;
  disableWebPagePreview?: boolean;
}

export interface AnswerTelegramCallbackQueryOptions {
  text?: string;
  showAlert?: boolean;
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
    const parsed = parseTelegramBotSettingsValue(botSetting.value);
    const configured = coerceSupportedLocale(
      typeof parsed?.defaultLanguage === 'string' ? parsed.defaultLanguage : undefined,
    );
    if (configured) {
      return configured;
    }
  }

  return coerceSupportedLocale(appSetting?.value) || 'en';
}

export async function getTelegramUserProfile(
  telegramUserId: string,
  telegramChatId?: string | null,
) {
  const profileByUserId = await db.telegramUserProfile.findUnique({
    where: { telegramUserId },
  });

  if (profileByUserId) {
    return profileByUserId;
  }

  if (!telegramChatId) {
    return null;
  }

  return db.telegramUserProfile.findFirst({
    where: {
      telegramChatId,
    },
    orderBy: {
      updatedAt: 'desc',
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

export type { TelegramNotificationPreferenceKey };

export function getTelegramNotificationPreferenceLabel(
  key: TelegramNotificationPreferenceKey,
  locale: SupportedLocale,
) {
  const isMyanmar = locale === 'my';
  switch (key) {
    case 'promo':
      return isMyanmar ? 'Promotion notice' : 'Promotion notices';
    case 'maintenance':
      return isMyanmar ? 'Maintenance notice' : 'Maintenance notices';
    case 'receipt':
      return isMyanmar ? 'Receipt notice' : 'Receipt notices';
    case 'support':
      return isMyanmar ? 'Support update' : 'Support updates';
    default:
      return key;
  }
}

export function getTelegramNotificationPreferenceField(
  key: TelegramNotificationPreferenceKey,
) {
  switch (key) {
    case 'promo':
      return 'allowPromoAnnouncements' as const;
    case 'maintenance':
      return 'allowMaintenanceNotices' as const;
    case 'receipt':
      return 'allowReceiptNotifications' as const;
    case 'support':
      return 'allowSupportUpdates' as const;
    default:
      return 'allowPromoAnnouncements' as const;
  }
}

export async function updateTelegramNotificationPreference(input: {
  telegramUserId: string;
  telegramChatId?: string | null;
  preference: TelegramNotificationPreferenceKey;
  enabled: boolean;
}) {
  const field = getTelegramNotificationPreferenceField(input.preference);
  return db.telegramUserProfile.upsert({
    where: { telegramUserId: input.telegramUserId },
    create: {
      telegramUserId: input.telegramUserId,
      telegramChatId: input.telegramChatId || null,
      [field]: input.enabled,
    },
    update: {
      telegramChatId: input.telegramChatId || null,
      [field]: input.enabled,
    },
  });
}

export async function getTelegramNotificationPreferences(input: {
  telegramUserId: string;
  telegramChatId?: string | null;
}) {
  const profile = await getTelegramUserProfile(input.telegramUserId, input.telegramChatId || null);
  return {
    promo: profile?.allowPromoAnnouncements ?? true,
    maintenance: profile?.allowMaintenanceNotices ?? true,
    receipt: profile?.allowReceiptNotifications ?? true,
    support: profile?.allowSupportUpdates ?? true,
  };
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

export async function setTelegramPendingSupportReply(input: {
  telegramUserId: string;
  telegramChatId?: string | null;
  threadId?: string | null;
}) {
  return db.telegramUserProfile.upsert({
    where: { telegramUserId: input.telegramUserId },
    create: {
      telegramUserId: input.telegramUserId,
      telegramChatId: input.telegramChatId || null,
      pendingSupportThreadId: input.threadId || null,
      pendingSupportReplyStartedAt: input.threadId ? new Date() : null,
    },
    update: {
      telegramChatId: input.telegramChatId || null,
      pendingSupportThreadId: input.threadId || null,
      pendingSupportReplyStartedAt: input.threadId ? new Date() : null,
    },
  });
}

export async function getTelegramPendingSupportReply(input: {
  telegramUserId: string;
  telegramChatId?: string | null;
}) {
  const profile = await getTelegramUserProfile(input.telegramUserId, input.telegramChatId || null);
  if (!profile?.pendingSupportThreadId) {
    return null;
  }

  return {
    threadId: profile.pendingSupportThreadId,
    startedAt: profile.pendingSupportReplyStartedAt || null,
  };
}

export async function setTelegramPendingAdminFlow(input: {
  telegramUserId: string;
  telegramChatId?: string | null;
  flow?: string | null;
}) {
  return db.telegramUserProfile.upsert({
    where: { telegramUserId: input.telegramUserId },
    create: {
      telegramUserId: input.telegramUserId,
      telegramChatId: input.telegramChatId || null,
      pendingAdminFlow: input.flow || null,
      pendingAdminFlowStartedAt: input.flow ? new Date() : null,
    },
    update: {
      telegramChatId: input.telegramChatId || null,
      pendingAdminFlow: input.flow || null,
      pendingAdminFlowStartedAt: input.flow ? new Date() : null,
    },
  });
}

export async function getTelegramPendingAdminFlow(input: {
  telegramUserId: string;
  telegramChatId?: string | null;
}) {
  const profile = await getTelegramUserProfile(input.telegramUserId, input.telegramChatId || null);
  if (!profile?.pendingAdminFlow) {
    return null;
  }

  return {
    flow: profile.pendingAdminFlow,
    startedAt: profile.pendingAdminFlowStartedAt || null,
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
            orderBy: {
              updatedAt: 'desc',
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

  return (
    normalizeTelegramSupportLink(salesSettings.supportLink) ||
    normalizeTelegramSupportLink(defaults.supportLink) ||
    null
  );
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

export function getTelegramWebhookSecret(botToken: string, persistedSecret?: unknown) {
  return resolveTelegramWebhookSecret({
    botToken,
    persistedSecret,
    configuredSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
    jwtSecret: getJwtSecretString(),
  });
}

async function ensurePersistedTelegramWebhookSecret(config: Record<string, unknown>) {
  const botToken =
    typeof config.botToken === 'string' && config.botToken.trim().length > 0
      ? config.botToken
      : null;
  if (!botToken) {
    return null;
  }

  const storedSecret =
    typeof config.webhookSecretToken === 'string' && config.webhookSecretToken.trim().length > 0
      ? config.webhookSecretToken.trim()
      : null;
  const webhookSecretToken = getTelegramWebhookSecret(botToken, storedSecret);

  if (!storedSecret) {
    try {
      await db.settings.update({
        where: { key: 'telegram_bot' },
        data: {
          value: serializeTelegramBotSettingsValue({
            ...config,
            webhookSecretToken,
          }),
        },
      });
    } catch (error) {
      console.error('Failed to persist Telegram webhook secret:', error);
    }
  }

  return webhookSecretToken;
}

export async function getTelegramConfig(): Promise<TelegramConfig | null> {
  const settings = await db.settings.findUnique({ where: { key: 'telegram_bot' } });
  if (settings) {
    const config = parseTelegramBotSettingsValue(settings.value);
    if (config?.isEnabled && typeof config.botToken === 'string' && config.botToken.trim()) {
      if (telegramBotSettingsNeedSecretMigration(settings.value)) {
        void db.settings
          .update({
            where: { key: 'telegram_bot' },
            data: { value: serializeTelegramBotSettingsValue(config) },
          })
          .catch((error) => {
            console.error('Failed to migrate Telegram bot secrets to encrypted storage:', error);
          });
      }

      const localizedWelcomeMessages = buildDefaultTelegramTemplateMap(
        DEFAULT_TELEGRAM_WELCOME_MESSAGES,
        config.localizedWelcomeMessages,
      );
      const localizedKeyNotFoundMessages = buildDefaultTelegramTemplateMap(
        DEFAULT_TELEGRAM_KEY_NOT_FOUND_MESSAGES,
        config.localizedKeyNotFoundMessages,
      );
      const adminChatIds = Array.isArray(config.adminChatIds)
        ? config.adminChatIds.filter(
            (value): value is string => typeof value === 'string' && value.trim().length > 0,
          )
        : [];

      const webhookSecretToken = await ensurePersistedTelegramWebhookSecret(config);
      await ensureTelegramMyCommandsSafely(config.botToken, adminChatIds);

      return {
        botToken: config.botToken,
        botUsername:
          typeof config.botUsername === 'string' && config.botUsername.trim()
            ? config.botUsername
            : undefined,
        webhookSecretToken: webhookSecretToken || getTelegramWebhookSecret(config.botToken),
        adminChatIds,
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
        await ensureTelegramMyCommandsSafely(botToken, adminChatIds);
        return {
          botToken,
          botUsername:
            typeof config.botUsername === 'string' && config.botUsername.trim()
              ? config.botUsername
              : undefined,
          webhookSecretToken: getTelegramWebhookSecret(botToken, config.webhookSecretToken),
          adminChatIds,
          dailyDigestEnabled: false,
          dailyDigestHour: 9,
          dailyDigestMinute: 0,
          digestLookbackHours: 24,
          defaultLanguage: await getTelegramDefaultLocale(),
          showLanguageSelectorOnStart: true,
        };
      }
    } catch (error) {
      const warningKey = channel.id;
      if (!TELEGRAM_MALFORMED_CHANNEL_WARNINGS.has(warningKey)) {
        TELEGRAM_MALFORMED_CHANNEL_WARNINGS.add(warningKey);
        console.error('Ignoring malformed Telegram notification channel config:', {
          channelId: channel.id,
          error,
        });
      }
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
  const result = await sendTelegramMessageDetailed(botToken, chatId, text, options);
  return result.success;
}

export async function sendTelegramMessageDetailed(
  botToken: string,
  chatId: number | string,
  text: string,
  options: SendMessageOptions = {},
): Promise<SendTelegramMessageResult> {
  const parseMode = options.parseMode || 'HTML';
  const preparedMessage =
    parseMode === 'HTML'
      ? sanitizeTelegramHtmlMessage(text)
      : { text, changed: false, invalidTags: [], invalidCharactersRemoved: false };

  if (preparedMessage.changed) {
    console.warn(
      `Sanitized Telegram HTML message for ${chatId}; escaped unsupported tags: ${preparedMessage.invalidTags.join(', ') || 'none'}${preparedMessage.invalidCharactersRemoved ? '; removed invalid UTF-8/control characters' : ''}`,
    );
  }

  try {
    const response = await fetchTelegramApi(`${TELEGRAM_API_BASE}${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: preparedMessage.text,
        parse_mode: parseMode,
        reply_markup: options.replyMarkup,
        disable_web_page_preview: options.disableWebPagePreview ?? true,
      }),
    });

    if (!response.ok) {
      const description = await getTelegramErrorDescription(response, `Telegram request failed with status ${response.status}`);
      console.error(`Failed to send Telegram message to ${chatId}:`, description);
      return {
        success: false,
        status: response.status,
        error: description,
      };
    }

    return {
      success: true,
      status: response.status,
    };
  } catch (error) {
    const description = summarizeTelegramTransportError(error);
    console.error('Failed to send Telegram message:', description);
    return {
      success: false,
      status: null,
      error: description,
    };
  }
}

export async function editTelegramMessageText(
  botToken: string,
  chatId: number | string,
  messageId: number,
  text: string,
  options: SendMessageOptions = {},
): Promise<SendTelegramMessageResult> {
  const parseMode = options.parseMode || 'HTML';
  const preparedMessage =
    parseMode === 'HTML'
      ? sanitizeTelegramHtmlMessage(text)
      : { text, changed: false, invalidTags: [], invalidCharactersRemoved: false };

  if (preparedMessage.changed) {
    console.warn(
      `Sanitized Telegram HTML edit for ${chatId}/${messageId}; escaped unsupported tags: ${preparedMessage.invalidTags.join(', ') || 'none'}${preparedMessage.invalidCharactersRemoved ? '; removed invalid UTF-8/control characters' : ''}`,
    );
  }

  try {
    const response = await fetchTelegramApi(`${TELEGRAM_API_BASE}${botToken}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text: preparedMessage.text,
        parse_mode: parseMode,
        reply_markup: options.replyMarkup,
        disable_web_page_preview: options.disableWebPagePreview ?? true,
      }),
    });

    if (!response.ok) {
      const description = await getTelegramErrorDescription(response, `Telegram edit request failed with status ${response.status}`);
      console.error(`Failed to edit Telegram message ${chatId}/${messageId}:`, description);
      return {
        success: false,
        status: response.status,
        error: description,
      };
    }

    return {
      success: true,
      status: response.status,
    };
  } catch (error) {
    const description = summarizeTelegramTransportError(error);
    console.error('Failed to edit Telegram message:', description);
    return {
      success: false,
      status: null,
      error: description,
    };
  }
}

export async function answerTelegramCallbackQuery(
  botToken: string,
  callbackQueryId: string,
  input?: string | AnswerTelegramCallbackQueryOptions,
) {
  const options =
    typeof input === 'string'
      ? {
          text: input,
          showAlert: false,
        }
      : {
          text: input?.text,
          showAlert: input?.showAlert ?? false,
        };

  try {
    const response = await fetchTelegramApi(`${TELEGRAM_API_BASE}${botToken}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text: options.text,
        show_alert: options.showAlert,
      }),
    });

    return response.ok;
  } catch (error) {
    console.error('Failed to answer Telegram callback query:', summarizeTelegramTransportError(error));
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
  const preparedCaption =
    caption && caption.trim()
      ? sanitizeTelegramHtmlMessage(caption)
      : null;

  if (preparedCaption?.changed) {
    console.warn(
      `Sanitized Telegram HTML caption for ${chatId}; escaped unsupported tags: ${preparedCaption.invalidTags.join(', ')}`,
    );
  }

  try {
    const formData = new FormData();
    formData.append('chat_id', chatId.toString());
    const blob = new Blob([new Uint8Array(photo)], { type: 'image/png' });
    formData.append('photo', blob, 'qrcode.png');

    if (preparedCaption?.text) {
      formData.append('caption', preparedCaption.text);
      formData.append('parse_mode', 'HTML');
    }

    const response = await fetchTelegramApi(`${TELEGRAM_API_BASE}${botToken}/sendPhoto`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const description = await getTelegramErrorDescription(response, `Telegram photo request failed with status ${response.status}`);
      console.error(`Failed to send Telegram photo to ${chatId}:`, description);
    }
  } catch (error) {
    console.error(`Error sending Telegram photo to ${chatId}:`, summarizeTelegramTransportError(error));
  }
}

export async function sendTelegramPhotoUrl(
  botToken: string,
  chatId: number | string,
  photoUrl: string,
  caption?: string,
  options?: {
    replyMarkup?: Record<string, unknown>;
  },
) {
  const trimmedPhotoUrl = photoUrl.trim();
  if (!trimmedPhotoUrl) {
    return false;
  }

  const preparedCaption =
    caption && caption.trim()
      ? sanitizeTelegramHtmlMessage(caption)
      : null;

  if (preparedCaption?.changed) {
    console.warn(
      `Sanitized Telegram HTML photo-url caption for ${chatId}; escaped unsupported tags: ${preparedCaption.invalidTags.join(', ')}`,
    );
  }

  try {
    const response = await fetchTelegramApi(`${TELEGRAM_API_BASE}${botToken}/sendPhoto`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId.toString(),
        photo: trimmedPhotoUrl,
        caption: preparedCaption?.text,
        parse_mode: preparedCaption?.text ? 'HTML' : undefined,
        reply_markup: options?.replyMarkup,
      }),
    });

    if (!response.ok) {
      const description = await getTelegramErrorDescription(response, `Telegram photo URL request failed with status ${response.status}`);
      console.error(`Failed to send Telegram photo URL to ${chatId}:`, description);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`Error sending Telegram photo URL to ${chatId}:`, summarizeTelegramTransportError(error));
    return false;
  }
}

export async function sendTelegramDocument(
  botToken: string,
  chatId: number | string,
  document: Buffer,
  filename: string,
  caption?: string,
  options?: {
    replyMarkup?: Record<string, unknown>;
  },
) {
  const preparedCaption =
    caption && caption.trim()
      ? sanitizeTelegramHtmlMessage(caption)
      : null;

  if (preparedCaption?.changed) {
    console.warn(
      `Sanitized Telegram HTML document caption for ${chatId}; escaped unsupported tags: ${preparedCaption.invalidTags.join(', ')}`,
    );
  }

  try {
    const formData = new FormData();
    formData.append('chat_id', chatId.toString());
    const blob = new Blob([new Uint8Array(document)], { type: 'application/octet-stream' });
    formData.append('document', blob, filename);

    if (preparedCaption?.text) {
      formData.append('caption', preparedCaption.text);
      formData.append('parse_mode', 'HTML');
    }
    if (options?.replyMarkup) {
      formData.append('reply_markup', JSON.stringify(options.replyMarkup));
    }

    const response = await fetchTelegramApi(`${TELEGRAM_API_BASE}${botToken}/sendDocument`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const description = await getTelegramErrorDescription(response, `Telegram document request failed with status ${response.status}`);
      console.error(`Failed to send Telegram document to ${chatId}:`, description);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`Error sending Telegram document to ${chatId}:`, summarizeTelegramTransportError(error));
    return false;
  }
}

export async function copyTelegramMessage(
  botToken: string,
  fromChatId: number | string,
  messageId: number,
  toChatId: number | string,
) {
  try {
    const response = await fetchTelegramApi(`${TELEGRAM_API_BASE}${botToken}/copyMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from_chat_id: fromChatId,
        message_id: messageId,
        chat_id: toChatId,
      }),
    });

    if (!response.ok) {
      const description = await getTelegramErrorDescription(response, `Telegram copy request failed with status ${response.status}`);
      console.error(`Failed to copy Telegram message to ${toChatId}:`, description);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Failed to copy Telegram message:', summarizeTelegramTransportError(error));
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
