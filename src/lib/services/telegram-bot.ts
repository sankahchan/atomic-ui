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
  buildSubscriptionClientUrl,
} from '@/lib/subscription-links';
import {
  recordSubscriptionPageEvent,
  SUBSCRIPTION_EVENT_TYPES,
} from '@/lib/services/subscription-events';
import { canAssignKeysToServer } from '@/lib/services/server-lifecycle';
import { selectLeastLoadedServer } from '@/lib/services/load-balancer';
import { coerceSupportedLocale, type SupportedLocale } from '@/lib/i18n/config';
import {
  normalizeLocalizedTemplateMap,
  resolveLocalizedTemplate,
  type LocalizedTemplateMap,
} from '@/lib/localized-templates';
import {
  buildDefaultTelegramTemplateMap,
  DEFAULT_TELEGRAM_KEY_NOT_FOUND_MESSAGES,
  DEFAULT_TELEGRAM_WELCOME_MESSAGES,
} from '@/lib/services/telegram-copy';
import {
  TELEGRAM_ORDER_ACTIVE_STATUSES,
  TELEGRAM_ORDER_TERMINAL_STATUSES,
  formatTelegramSalesPlanSummary,
  generateTelegramOrderCode,
  getTelegramSalesSettings,
  listEnabledTelegramSalesPaymentMethods,
  resolveTelegramSalesPaymentMethod,
  resolveTelegramSalesPaymentInstructions,
  resolveTelegramSalesPaymentMethodLabel,
  resolveTelegramSalesPaymentMethodNote,
  resolveTelegramSalesPlan,
  resolveTelegramSalesPlanLabel,
  resolveTelegramSalesPriceLabel,
  type TelegramOrderActiveStatus,
  type TelegramOrderTerminalStatus,
  type TelegramSalesPaymentMethod,
  type TelegramSalesPlan,
  type TelegramSalesPlanCode,
} from '@/lib/services/telegram-sales';
import { computeArchiveAfterAt } from '@/lib/access-key-policies';
import {
  buildPublicSlugSuggestionCandidates,
  isReservedPublicSlug,
  isValidPublicSlug,
  normalizePublicSlug,
  slugifyPublicName,
} from '@/lib/public-slug';
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
    caption?: string;
    photo?: Array<{
      file_id: string;
      file_unique_id: string;
      width: number;
      height: number;
      file_size?: number;
    }>;
    document?: {
      file_id: string;
      file_unique_id: string;
      file_name?: string;
      mime_type?: string;
      file_size?: number;
    };
  };
  callback_query?: {
    id: string;
    from: {
      id: number;
      is_bot: boolean;
      first_name: string;
      username?: string;
    };
    message?: {
      message_id: number;
      chat: {
        id: number;
        type: string;
      };
    };
    data?: string;
  };
}

type TelegramMessage = NonNullable<TelegramUpdate['message']>;
type TelegramCallbackQuery = NonNullable<TelegramUpdate['callback_query']>;

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
    [{ text: '/buy' }, { text: '/renew' }],
    [{ text: '/orders' }, { text: '/mykeys' }],
    [{ text: '/usage' }, { text: '/sub' }],
    [{ text: '/support' }, { text: '/language' }],
    [{ text: '/cancel' }, { text: '/help' }],
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

const TELEGRAM_LOCALE_CALLBACK_PREFIX = 'locale';
const TELEGRAM_ORDER_REVIEW_CALLBACK_PREFIX = 'order-review';
const TELEGRAM_ORDER_ACTION_CALLBACK_PREFIX = 'ord';

type TelegramLocaleSelectorContext = 'start' | 'switch';
type TelegramOrderReviewAction = 'approve' | 'reject';
type TelegramOrderUserAction = 'pl' | 'ky' | 'sv' | 'pm' | 'pay' | 'up' | 'st' | 'ca';

function buildTelegramLocaleSelectorKeyboard(
  context: TelegramLocaleSelectorContext,
  startArgs?: string,
) {
  const suffix = startArgs ? `:${startArgs}` : '';
  return {
    inline_keyboard: [[
      { text: 'English', callback_data: `${TELEGRAM_LOCALE_CALLBACK_PREFIX}:en:${context}${suffix}` },
      { text: 'မြန်မာ', callback_data: `${TELEGRAM_LOCALE_CALLBACK_PREFIX}:my:${context}${suffix}` },
    ]],
  };
}

function buildTelegramLocaleSelectorMessage(context: TelegramLocaleSelectorContext) {
  if (context === 'switch') {
    return '🌐 Choose your language / ဘာသာစကား ရွေးချယ်ပါ';
  }

  return [
    '👋 Welcome to Atomic-UI Telegram Bot',
    '🌐 Choose your language to continue.',
    '',
    '👋 Atomic-UI Telegram bot မှ ကြိုဆိုပါတယ်',
    '🌐 ဆက်လုပ်ရန် ဘာသာစကား ရွေးချယ်ပါ။',
  ].join('\n');
}

function parseTelegramLocaleCallbackData(data?: string | null) {
  if (!data) {
    return null;
  }

  const parts = data.split(':');
  if (parts.length < 3 || parts[0] !== TELEGRAM_LOCALE_CALLBACK_PREFIX) {
    return null;
  }

  const locale = coerceSupportedLocale(parts[1]);
  const context = parts[2] === 'switch' ? 'switch' : parts[2] === 'start' ? 'start' : null;
  if (!locale || !context) {
    return null;
  }

  return {
    locale,
    context,
    startArgs: parts.slice(3).join(':').trim(),
  } as const;
}

function buildTelegramOrderReviewCallbackData(
  action: TelegramOrderReviewAction,
  orderId: string,
) {
  return `${TELEGRAM_ORDER_REVIEW_CALLBACK_PREFIX}:${action}:${orderId}`;
}

function parseTelegramOrderReviewCallbackData(data?: string | null) {
  if (!data) {
    return null;
  }

  const parts = data.split(':');
  if (parts.length !== 3 || parts[0] !== TELEGRAM_ORDER_REVIEW_CALLBACK_PREFIX) {
    return null;
  }

  const action =
    parts[1] === 'approve'
      ? 'approve'
      : parts[1] === 'reject'
        ? 'reject'
        : null;
  const orderId = parts[2]?.trim();

  if (!action || !orderId) {
    return null;
  }

  return {
    action,
    orderId,
  } as const;
}

function buildTelegramOrderActionCallbackData(
  action: TelegramOrderUserAction,
  primary: string,
  secondary?: string,
) {
  return secondary
    ? `${TELEGRAM_ORDER_ACTION_CALLBACK_PREFIX}:${action}:${primary}:${secondary}`
    : `${TELEGRAM_ORDER_ACTION_CALLBACK_PREFIX}:${action}:${primary}`;
}

function parseTelegramOrderActionCallbackData(data?: string | null) {
  if (!data) {
    return null;
  }

  const parts = data.split(':');
  if (parts.length < 3 || parts[0] !== TELEGRAM_ORDER_ACTION_CALLBACK_PREFIX) {
    return null;
  }

  const action = parts[1];
  if (!['pl', 'ky', 'sv', 'pm', 'pay', 'up', 'st', 'ca'].includes(action)) {
    return null;
  }

  return {
    action: action as TelegramOrderUserAction,
    primary: parts[2]?.trim() || '',
    secondary: parts[3]?.trim() || null,
  };
}

function getFlagEmoji(countryCode: string) {
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

async function getTelegramDefaultLocale(): Promise<SupportedLocale> {
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

async function getTelegramUserProfile(
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

async function upsertTelegramUserProfile(input: {
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

async function setTelegramUserLocale(input: {
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
        in: [...TELEGRAM_ORDER_ACTIVE_STATUSES],
      },
    },
    data: {
      locale: input.locale,
    },
  });
}

async function getTelegramConversationLocale(input: {
  telegramUserId: string | number;
  telegramChatId?: string | number | null;
}) {
  const profile = await getTelegramUserProfile(
    String(input.telegramUserId),
    input.telegramChatId ? String(input.telegramChatId) : null,
  );

  return (
    coerceSupportedLocale(profile?.locale) ||
    (await getTelegramDefaultLocale())
  );
}

async function resolveTelegramLocaleForRecipient(input: {
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

function getTelegramUi(locale: SupportedLocale) {
  const isMyanmar = locale === 'my';

  return {
    unlimited: isMyanmar ? 'အကန့်အသတ်မရှိ' : 'Unlimited',
    startsOnFirstUse: (days?: number | null) =>
      isMyanmar
        ? days
          ? `ပထမအသုံးပြုချိန်မှ စတင်မည် (${days} ရက်)`
          : 'ပထမအသုံးပြုချိန်မှ စတင်မည်'
        : days
          ? `Starts on first use (${days} days)`
          : 'Starts on first use',
    never: isMyanmar ? 'မကုန်ဆုံးပါ' : 'Never',
    expiredOn: (date: string) => (isMyanmar ? `${date} တွင် သက်တမ်းကုန်ပြီး` : `Expired on ${date}`),
    daysLeft: (days: number, date: string) =>
      isMyanmar ? `${days} ရက်ခန့် ကျန်သည် (${date})` : `${days} day(s) left (${date})`,
    openSharePage: isMyanmar ? 'Share Page ဖွင့်မည်' : 'Open Share Page',
    openSubscriptionUrl: isMyanmar ? 'Subscription URL ဖွင့်မည်' : 'Open Subscription URL',
    openClientEndpoint: isMyanmar ? 'Client Endpoint ဖွင့်မည်' : 'Open Client Endpoint',
    getSupport: isMyanmar ? 'အကူအညီ ရယူမည်' : 'Get Support',
    accessShareFallback: isMyanmar
      ? 'အောက်ပါ share page ကိုဖွင့်ပြီး install လုပ်နည်း၊ manual setup နှင့် နောက်ဆုံး connection အသေးစိတ်ကို ကြည့်နိုင်ပါသည်။'
      : 'Open the share page below for install steps, manual setup, and the latest connection details.',
    dynamicShareFallback: isMyanmar
      ? 'အောက်ပါ share page ကိုဖွင့်ပြီး install လုပ်နည်း၊ manual setup နှင့် backend အသေးစိတ်ကို ကြည့်နိုင်ပါသည်။'
      : 'Open the share page below for install steps, manual setup, and the latest backend details.',
    dynamicShareDisabledFallback: isMyanmar
      ? 'ဤ key အတွက် share page ကို ပိတ်ထားသည်။ Outline သို့မဟုတ် compatible client ထဲတွင် အောက်ပါ client endpoint ကို အသုံးပြုပါ။'
      : 'The share page is disabled for this key. Use the client endpoint below inside Outline or another compatible client.',
    accessQrCaption: isMyanmar
      ? 'Direct import မရပါက ဤ QR code ကို သင့် VPN client ဖြင့် scan လုပ်ပါ။'
      : 'Scan this QR code with your VPN client if direct import is unavailable.',
    dynamicQrCaption: isMyanmar
      ? 'Direct import မရပါက Outline သို့မဟုတ် compatible client ဖြင့် ဤ QR code ကို scan လုပ်ပါ။'
      : 'Scan this QR code with Outline or another compatible client if direct import is unavailable.',
    accessReasonTitle: (reason?: string) =>
      reason === 'CREATED'
        ? (isMyanmar ? '🎉 <b>သင့် access key အသင့်ဖြစ်ပါပြီ</b>' : '🎉 <b>Your access key is ready</b>')
        : reason === 'KEY_ENABLED'
          ? (isMyanmar ? '✅ <b>သင့် access key ကို ပြန်ဖွင့်ပြီးပါပြီ</b>' : '✅ <b>Your access key has been re-enabled</b>')
          : reason === 'LINKED'
            ? (isMyanmar ? '🔗 <b>Telegram ချိတ်ဆက်မှု အောင်မြင်ပါသည်</b>' : '🔗 <b>Telegram linked successfully</b>')
            : reason === 'USAGE_REQUEST'
              ? (isMyanmar ? '📊 <b>သင့် VPN အသုံးပြုမှု အသေးစိတ်</b>' : '📊 <b>Your VPN access details</b>')
              : reason === 'SUBSCRIPTION_REQUEST'
                ? (isMyanmar ? '📎 <b>သင့် subscription link များ</b>' : '📎 <b>Your subscription links</b>')
                : (isMyanmar ? '📨 <b>သင့် share page</b>' : '📨 <b>Your share page</b>'),
    dynamicReasonTitle: (reason?: string) =>
      reason === 'CREATED'
        ? (isMyanmar ? '🎉 <b>သင့် dynamic key အသင့်ဖြစ်ပါပြီ</b>' : '🎉 <b>Your dynamic key is ready</b>')
        : reason === 'KEY_ENABLED'
          ? (isMyanmar ? '✅ <b>သင့် dynamic key ကို ပြန်ဖွင့်ပြီးပါပြီ</b>' : '✅ <b>Your dynamic key has been re-enabled</b>')
          : reason === 'LINKED'
            ? (isMyanmar ? '🔗 <b>Telegram ချိတ်ဆက်မှု အောင်မြင်ပါသည်</b>' : '🔗 <b>Telegram linked successfully</b>')
            : reason === 'USAGE_REQUEST'
              ? (isMyanmar ? '📊 <b>သင့် dynamic VPN အသေးစိတ်</b>' : '📊 <b>Your dynamic VPN access details</b>')
              : reason === 'SUBSCRIPTION_REQUEST'
                ? (isMyanmar ? '📎 <b>သင့် dynamic subscription link များ</b>' : '📎 <b>Your dynamic subscription links</b>')
                : (isMyanmar ? '📨 <b>သင့် dynamic share page</b>' : '📨 <b>Your dynamic share page</b>'),
    modeSelfManaged: isMyanmar ? 'Self-Managed' : 'Self-Managed',
    modeManual: isMyanmar ? 'Manual' : 'Manual',
    coverageAutoSelected: isMyanmar ? 'Fetch လုပ်ချိန်တွင် အလိုအလျောက် ရွေးမည်' : 'Auto-selected at fetch time',
    lifecycleDisabledTitle: isMyanmar ? '⛔ <b>သင့် access key ကို ပိတ်ထားပါသည်</b>' : '⛔ <b>Your access key has been disabled</b>',
    lifecycleDisabledBody: isMyanmar ? 'Administrator က ပြန်ဖွင့်ပေးသည့်အထိ traffic ကို အသုံးမပြုနိုင်ပါ။' : 'Traffic is blocked until the key is re-enabled by an administrator.',
    lifecycleExpiring7Title: isMyanmar ? '⏳ <b>သင့် access key သက်တမ်း မကြာမီကုန်မည်</b>' : '⏳ <b>Your access key will expire soon</b>',
    lifecycleExpiring7Body: (days: number) => isMyanmar ? `သက်တမ်းကုန်ရန် ${days} ရက်ခန့် ကျန်ပါသည်။` : `There are about ${days} day(s) left before expiration.`,
    lifecycleExpiring3Title: isMyanmar ? '⚠️ <b>သင့် access key သက်တမ်း အလွန်နီးကပ်ပါပြီ</b>' : '⚠️ <b>Your access key expires very soon</b>',
    lifecycleExpiring3Body: (days: number) => isMyanmar ? `${days} ရက်ခန့်သာ ကျန်ပါသည်။` : `Only about ${days} day(s) remain.`,
    lifecycleExpiredTitle: isMyanmar ? '⌛ <b>သင့် access key သက်တမ်းကုန်သွားပါပြီ</b>' : '⌛ <b>Your access key has expired</b>',
    lifecycleExpiredBody: isMyanmar ? 'ဤ key ကို မလုပ်ဆောင်နိုင်တော့ပါ။ သက်တမ်းတိုးလိုပါက support ကို ဆက်သွယ်ပါ။' : 'The key is no longer active. Contact support if it should be renewed.',
    startLinked: (username: string) => isMyanmar ? `✅ <b>${username}</b> အတွက် Telegram ချိတ်ဆက်ပြီးပါပြီ။\n\nလိုအပ်သည့်အချိန်တွင် /usage သို့မဟုတ် /mykeys ကို အသုံးပြုနိုင်ပါသည်။` : `✅ Telegram linked for <b>${username}</b>.\n\nUse /usage or /mykeys to fetch your keys any time.`,
    linkExpired: isMyanmar ? '⚠️ ဤ Telegram link သက်တမ်းကုန်သွားပါပြီ။ Admin ထံမှ link အသစ်တောင်းပါ။' : '⚠️ This Telegram link has expired. Ask the admin to generate a new one.',
    linkInvalid: isMyanmar ? '❌ ဤ Telegram link ကို မသုံးနိုင်တော့ပါ။ Admin ထံမှ link အသစ်တောင်းပါ။' : '❌ That Telegram link is not valid anymore. Ask the admin for a fresh link.',
    welcomeBack: (username: string) => isMyanmar ? `✅ ပြန်လည်ကြိုဆိုပါသည်၊ <b>${username}</b>!\n\nသင့် account သည် ချိတ်ဆက်ပြီးဖြစ်သည်။ /usage သို့မဟုတ် /mykeys ကို အချိန်မရွေး အသုံးပြုနိုင်ပါသည်။` : `✅ Welcome back, <b>${username}</b>!\n\nYour account is already linked. Use /usage or /mykeys any time.`,
    accountLinked: (username: string) => isMyanmar ? `✅ Account ချိတ်ဆက်မှု အောင်မြင်ပါသည်!\n\nကြိုဆိုပါသည်၊ <b>${username}</b>! /usage သို့မဟုတ် /mykeys ကို အသုံးပြုနိုင်ပါသည်။` : `✅ Account linked successfully!\n\nWelcome, <b>${username}</b>! Use /usage or /mykeys to fetch your keys.`,
    adminRecognized: isMyanmar ? '\n\nသင့်ကို administrator အဖြစ် သတ်မှတ်ထားပါသည်။' : '\n\nYou are recognized as an administrator.',
    languagePrompt: isMyanmar ? '🌐 ဘာသာစကား ရွေးချယ်ပါ။' : '🌐 Choose your language.',
    languagePromptDesc: isMyanmar
      ? 'ဆက်သွယ်မှုများ၊ order flow နှင့် key ပို့ပေးခြင်းတို့ကို သင့်ရွေးချယ်ထားသော ဘာသာစကားဖြင့် ဆက်လုပ်ပေးပါမည်။'
      : 'The bot will continue in your selected language for orders, support, and key delivery.',
    languageChanged: (languageName: string) =>
      isMyanmar
        ? `✅ ဘာသာစကားကို <b>${languageName}</b> သို့ ပြောင်းပြီးပါပြီ။`
        : `✅ Language updated to <b>${languageName}</b>.`,
    languageCommandHelp: isMyanmar
      ? '/language - ဘော့ ဘာသာစကားကို ပြောင်းမည်'
      : '/language - Change the bot language',
    hello: (username: string, welcome: string, telegramUserId: number, adminMsg: string) =>
      isMyanmar
        ? `👋 မင်္ဂလာပါ၊ <b>${username}</b>!${adminMsg}\n\n${welcome}\n\n<b>အသုံးဝင်သော command များ</b>\n• /buy - key အသစ်မှာယူရန်\n• /renew - လက်ရှိ key ကို သက်တမ်းတိုးရန်\n• /orders - သင့် order များကို ကြည့်ရန်\n• /mykeys - ချိတ်ထားသော key များကို ကြည့်ရန်\n\nသင့် Telegram ID: <code>${telegramUserId}</code>`
        : `👋 Hello, <b>${username}</b>!${adminMsg}\n\n${welcome}\n\n<b>Quick commands</b>\n• /buy - order a new key\n• /renew - renew an existing key\n• /orders - view your recent orders\n• /mykeys - view your linked keys\n\nYour Telegram ID: <code>${telegramUserId}</code>`,
    defaultWelcome: DEFAULT_TELEGRAM_WELCOME_MESSAGES[locale],
    emailNoKeys: (email: string) => isMyanmar ? `❌ ${email} အတွက် key မတွေ့ပါ။` : `❌ No keys found for email: ${email}`,
    emailLinked: (count: number) => isMyanmar ? `✅ Key ${count} ခုကို ဤ Telegram account နှင့် ချိတ်ဆက်ပြီးပါပြီ။\n\nအသုံးပြုမှုနှင့် share page ရယူရန် /usage သို့မဟုတ် /sub ကို အသုံးပြုပါ။` : `✅ Linked ${count} key(s) to this Telegram account.\n\nUse /usage or /sub to receive your usage details and share pages.`,
    keyNotFoundDefault: DEFAULT_TELEGRAM_KEY_NOT_FOUND_MESSAGES[locale],
    usageTitle: isMyanmar ? '📊 <b>သင့် VPN အသုံးပြုမှု</b>\n\n' : '📊 <b>Your VPN Usage</b>\n\n',
    myKeysEmpty: isMyanmar ? '❌ ဤ Telegram account နှင့် ချိတ်ထားသော key မရှိပါ။' : '❌ No linked keys found for this Telegram account.',
    myKeysTitle: isMyanmar ? '🗂 <b>သင့်နှင့် ချိတ်ထားသော key များ</b>' : '🗂 <b>Your linked keys</b>',
    subEmpty: isMyanmar ? '❌ ဤ Telegram account နှင့် ချိတ်ထားသော active key မရှိပါ။' : '❌ No active keys are linked to this Telegram account.',
    subSent: (count: number) => isMyanmar ? `📎 Share page ${count} ခုကို ဤ chat သို့ ပို့ပြီးပါပြီ။` : `📎 Sent ${count} share page(s) to this chat.`,
    noSupportLink: isMyanmar ? 'ℹ️ လက်ရှိ support link မသတ်မှတ်ရသေးပါ။' : 'ℹ️ No support link is configured right now.',
    supportLabel: isMyanmar ? '🛟 အကူအညီ' : '🛟 Support',
    keyLabel: isMyanmar ? 'Key' : 'Key',
    serverLabel: isMyanmar ? 'Server' : 'Server',
    statusLineLabel: isMyanmar ? 'Status' : 'Status',
    expirationLabel: isMyanmar ? 'Expiration' : 'Expiration',
    quotaLabel: isMyanmar ? 'Quota' : 'Quota',
    sharePageLabel: isMyanmar ? 'Share page' : 'Share page',
    subscriptionUrlLabel: isMyanmar ? 'Subscription URL' : 'Subscription URL',
    clientEndpointLabel: isMyanmar ? 'Client endpoint' : 'Client endpoint',
    outlineClientUrlLabel: isMyanmar ? 'Outline client URL' : 'Outline client URL',
    modeLabel: isMyanmar ? 'Mode' : 'Mode',
    backendsLabel: isMyanmar ? 'Backends' : 'Backends',
    coverageLabel: isMyanmar ? 'Coverage' : 'Coverage',
    idLabel: isMyanmar ? 'ID' : 'ID',
    emailLabel: isMyanmar ? 'Email' : 'Email',
    telegramIdLabel: isMyanmar ? 'Telegram ID' : 'Telegram ID',
    requesterLabel: isMyanmar ? 'Requester' : 'Requester',
    serversTitle: isMyanmar ? '🖥 <b>သင့် server များ</b>' : '🖥 <b>Your servers</b>',
    renewNoMatch: (query: string) => isMyanmar ? `❌ "${query}" နှင့် ကိုက်ညီသော linked key မရှိပါ။` : `❌ No linked key matched "${query}".`,
    renewSent: (count: number) => isMyanmar ? `✅ Key ${count} ခုအတွက် သက်တမ်းတိုးရန် တောင်းဆိုချက် ပို့ပြီးပါပြီ။ Administrator ကို အသိပေးထားပါသည်။` : `✅ Renewal request sent for ${count} key(s). An administrator has been notified.`,
    buyDisabled: isMyanmar ? 'ℹ️ ယခုအချိန်တွင် Telegram မှ key အသစ် မမှာယူနိုင်သေးပါ။' : 'ℹ️ New key orders are not available through Telegram right now.',
    renewDisabled: isMyanmar ? 'ℹ️ ယခုအချိန်တွင် Telegram မှ renewal မလုပ်နိုင်သေးပါ။' : 'ℹ️ Renewals are not available through Telegram right now.',
    activeOrderPendingReview: (code: string) =>
      isMyanmar
        ? `⏳ Order <b>${code}</b> ကို review စောင့်နေဆဲဖြစ်ပါသည်။ Screenshot အသစ် မပို့ပါနှင့်။ Admin အတည်ပြုပြီးနောက် access ကို ဤ chat ထဲသို့ ပို့ပေးပါမည်။`
        : `⏳ Order <b>${code}</b> is still waiting for review. Do not send another screenshot yet. Your access details will be delivered here after admin approval.`,
    orderCancelled: (code: string) =>
      isMyanmar
        ? `🛑 Order <b>${code}</b> ကို ပယ်ဖျက်ပြီးပါပြီ။`
        : `🛑 Order <b>${code}</b> has been cancelled.`,
    noOrderToCancel: isMyanmar ? 'ℹ️ ပယ်ဖျက်ရန် pending Telegram order မရှိပါ။' : 'ℹ️ There is no pending Telegram order to cancel.',
    paymentProofRequired: isMyanmar
      ? '🧾 ငွေပေးချေပြီး payment screenshot ကို photo သို့မဟုတ် document အဖြစ် ဤ chat ထဲပို့ပေးပါ။ Amount, transfer ID နှင့် အချိန်ကို ရှင်းလင်းစွာ မြင်ရပါမည်။'
      : '🧾 After payment, send the payment screenshot here as a photo or document. Make sure the amount, transfer ID, and time are clearly visible.',
    orderPlanPrompt: (code: string) =>
      isMyanmar
        ? `🛒 <b>Order ${code}</b>\n\nအောက်ပါစာရင်းထဲမှ လိုချင်သော plan ကို ရွေးချယ်ပါ။ Button ကိုနှိပ်နိုင်သလို နံပါတ်ဖြင့် reply လည်း လုပ်နိုင်ပါသည်။`
        : `🛒 <b>Order ${code}</b>\n\nChoose one of the plans below. You can tap a button or reply with the plan number.`,
    orderMonthsPrompt: isMyanmar
      ? '📆 Unlimited plan အတွက် လအရေအတွက်ကို ပို့ပါ။ အနည်းဆုံး 3 လ ဖြစ်ရပါမည်။'
      : '📆 Send the number of months for the unlimited plan. The minimum is 3 months.',
    orderServerPrompt: (code: string) =>
      isMyanmar
        ? `🖥 <b>Order ${code}</b>\n\nအသုံးပြုလိုသော server ကို ရွေးပါ။ Button ကိုနှိပ်နိုင်သလို စာရင်းနံပါတ်ကို reply လုပ်နိုင်ပါသည်။`
        : `🖥 <b>Order ${code}</b>\n\nChoose the server you prefer. You can tap a button or reply with the server number.`,
    orderNamePrompt: isMyanmar
      ? '✍️ Key တွင် ပြမည့် အမည်ကို ပို့ပါ။ ဥပမာ - John iPhone 15'
      : '✍️ Send the name that should appear on the key. Example: John iPhone 15',
    orderPaymentMethodPrompt: (code: string) =>
      isMyanmar
        ? `💳 <b>Order ${code}</b>\n\nငွေပေးချေမည့် payment method ကို ရွေးပါ။ Button ကိုနှိပ်နိုင်သလို စာရင်းနံပါတ်ကို reply လည်း လုပ်နိုင်ပါသည်။`
        : `💳 <b>Order ${code}</b>\n\nChoose the payment method you will use. You can tap a button or reply with the number.`,
    renewTargetPrompt: (code: string) =>
      isMyanmar
        ? `🔄 <b>Renewal ${code}</b>\n\nသက်တမ်းတိုးလိုသော key ကို အောက်ပါစာရင်းမှ နံပါတ်ဖြင့် reply လုပ်ပါ။`
        : `🔄 <b>Renewal ${code}</b>\n\nReply with the number of the key you want to renew from the list below.`,
    invalidPlanChoice: isMyanmar ? '❌ စာရင်းထဲက plan နံပါတ်တစ်ခုကို ရွေးပေးပါ။' : '❌ Reply with one of the listed plan numbers.',
    invalidMonths: isMyanmar ? '❌ လအရေအတွက်ကို 3 နှင့်အထက် ဂဏန်းဖြင့် ပို့ပေးပါ။' : '❌ Send a number of months that is 3 or greater.',
    invalidRenewChoice: isMyanmar ? '❌ စာရင်းထဲက key နံပါတ်ကို ပို့ပေးပါ။' : '❌ Reply with one of the key numbers from the list.',
    invalidServerChoice: isMyanmar ? '❌ စာရင်းထဲက server တစ်ခုကို ရွေးပေးပါ။' : '❌ Reply with one of the listed servers.',
    invalidPaymentMethodChoice: isMyanmar
      ? '❌ စာရင်းထဲက payment method တစ်ခုကို ရွေးပေးပါ။'
      : '❌ Reply with one of the listed payment methods.',
    invalidOrderName: isMyanmar ? '❌ Key အမည်ကို စာလုံး 2 လုံးမှ 100 လုံးအတွင်း ပို့ပေးပါ။' : '❌ Send a key name between 2 and 100 characters.',
    freeTrialUnavailable: isMyanmar
      ? 'ℹ️ Free trial ကို new user တစ်ဦးအတွက် တစ်ကြိမ်သာ ရရှိနိုင်ပါသည်။'
      : 'ℹ️ The free trial is only available once for each new user.',
    orderProofPending: (code: string) =>
      isMyanmar
        ? `📨 Order <b>${code}</b> အတွက် payment proof ကို လက်ခံပြီးပါပြီ။ Admin review စောင့်နေပါသည်။ အတည်ပြုပြီးနောက် key ကို ဤ chat ထဲသို့ ပို့ပေးပါမည်။`
        : `📨 Payment proof received for order <b>${code}</b>. It is now waiting for admin review. Your key will be delivered here after approval.`,
    orderPaymentMethodReminder: (code: string) =>
      isMyanmar
        ? `⏰ Order <b>${code}</b> သည် payment method မရွေးရသေးပါ။ ဆက်လက်လုပ်ဆောင်ရန် နည်းလမ်းတစ်ခုကို ရွေးပေးပါ။`
        : `⏰ Order <b>${code}</b> is still waiting for a payment method. Choose one to continue.`,
    orderPaymentProofReminder: (code: string) =>
      isMyanmar
        ? `⏰ Order <b>${code}</b> သည် payment screenshot မရသေးပါ။ ငွေပေးချေပြီးဖြစ်ပါက screenshot ကို ဤ chat ထဲသို့ ပို့ပေးပါ။`
        : `⏰ Order <b>${code}</b> is still waiting for your payment screenshot. If you have already paid, send the screenshot in this chat.`,
    orderExpiredUnpaid: (code: string) =>
      isMyanmar
        ? `⌛ Order <b>${code}</b> ကို ငွေပေးချေမှု မပြီးစီးသေးသဖြင့် အလိုအလျောက် ပိတ်လိုက်ပါပြီ။ အဆင်သင့်ဖြစ်သည့်အချိန်တွင် /buy သို့မဟုတ် /renew ဖြင့် ပြန်စနိုင်ပါသည်။`
        : `⌛ Order <b>${code}</b> expired because payment was not completed in time. Start again with /buy or /renew when you're ready.`,
    orderExpiredUnpaidNote: isMyanmar
      ? 'Payment မပြီးစီးသေးသဖြင့် order ကို အလိုအလျောက် ပိတ်လိုက်ပါသည်။'
      : 'This order was automatically cancelled because payment was not completed in time.',
    orderRejected: (code: string, note?: string | null) =>
      isMyanmar
        ? `❌ Order <b>${code}</b> ကို ငြင်းပယ်ထားပါသည်။${note ? `\n\nမှတ်ချက်: ${note}` : ''}\n\nလိုအပ်ပါက screenshot အသစ်ဖြင့် /buy သို့မဟုတ် /renew ကို ပြန်စနိုင်ပါသည်။`
        : `❌ Order <b>${code}</b> was rejected.${note ? `\n\nNote: ${note}` : ''}\n\nIf needed, you can start again with /buy or /renew and send a new screenshot.`,
    orderApproved: (code: string) =>
      isMyanmar
        ? `✅ Order <b>${code}</b> ကို အတည်ပြုပြီးပါပြီ။ Access details ကို ယခု ဤ chat ထဲသို့ ပို့ပေးပါမည်။`
        : `✅ Order <b>${code}</b> has been approved. Your access details will be delivered in the next message.`,
    orderSupportHint: isMyanmar
      ? 'အတည်ပြုမခံရသေးခင် မည်သည့်အချိန်မဆို /cancel ဖြင့် လက်ရှိ order ကို ပယ်ဖျက်နိုင်ပါသည်။'
      : 'Before approval, you can cancel the current order at any time with /cancel.',
    orderActionPayNow: isMyanmar ? 'ငွေပေးချေမှု လမ်းညွှန်' : 'Pay now',
    orderActionUploadProof: isMyanmar ? 'Screenshot ပို့ရန်' : 'Upload screenshot',
    orderActionCheckStatus: isMyanmar ? 'အခြေအနေ စစ်ရန်' : 'Check status',
    orderActionCancel: isMyanmar ? 'Order ပယ်ရန်' : 'Cancel order',
    orderActionRenewKey: isMyanmar ? 'ဤ key ကို သက်တမ်းတိုးရန်' : 'Renew this key',
    orderActionChoosePlan: isMyanmar ? 'Plan ရွေးရန်' : 'Choose plan',
    orderActionSelectKey: isMyanmar ? 'Key ရွေးရန်' : 'Select key',
    orderActionSelectServer: isMyanmar ? 'Server ရွေးရန်' : 'Choose server',
    orderActionChoosePaymentMethod: isMyanmar ? 'Payment method ရွေးရန်' : 'Choose payment method',
    orderActionSelectedPlan: (label: string) =>
      isMyanmar ? `ရွေးထားသော plan: ${label}` : `Selected plan: ${label}`,
    orderActionSelectedKey: (label: string) =>
      isMyanmar ? `ရွေးထားသော key: ${label}` : `Selected key: ${label}`,
    orderActionSelectedServer: (label: string) =>
      isMyanmar ? `ရွေးထားသော server: ${label}` : `Selected server: ${label}`,
    orderActionSelectedPaymentMethod: (label: string) =>
      isMyanmar ? `ရွေးထားသော payment method: ${label}` : `Selected payment method: ${label}`,
    orderActionCancelledInline: (code: string) =>
      isMyanmar ? `Order ${code} ကို ပယ်ဖျက်ပြီးပါပြီ။` : `Cancelled order ${code}.`,
    orderActionAlreadyClosed: isMyanmar ? 'ဤ order ကို ပိတ်ပြီး ဖြစ်ပါသည်။' : 'This order is already closed.',
    orderActionNotReadyForPayment: isMyanmar
      ? 'ဤ order သည် payment screenshot ပို့ရန် အဆင့်သို့ မရောက်သေးပါ။'
      : 'This order is not ready for payment proof yet.',
    orderActionStatusMissing: isMyanmar ? 'Order ကို မတွေ့ပါ။' : 'Order not found.',
    orderActionSent: isMyanmar ? 'အသေးစိတ်ကို Telegram တွင် ပို့ပြီးပါပြီ။' : 'Details sent in Telegram.',
    myKeysRenewHint: isMyanmar
      ? 'အောက်ပါ button များဖြင့် key ကို တိုက်ရိုက် သက်တမ်းတိုးနိုင်ပါသည်။'
      : 'Use the buttons below to renew a specific key directly.',
    orderReviewAlertTitle: isMyanmar ? '🧾 <b>Telegram order ကို စစ်ဆေးရန် လိုအပ်ပါသည်</b>' : '🧾 <b>Telegram order needs review</b>',
    orderReviewPanelLabel: isMyanmar ? 'Panel တွင် စစ်ဆေးရန်' : 'Review in panel',
    orderApproveActionLabel: isMyanmar ? 'Telegram မှ အတည်ပြုရန်' : 'Approve in Telegram',
    orderRejectActionLabel: isMyanmar ? 'Telegram မှ ပယ်ရန်' : 'Reject in Telegram',
    orderReviewActionUnauthorized: isMyanmar ? 'ဤ action ကို admin များသာ လုပ်နိုင်ပါသည်။' : 'Only admins can perform this action.',
    orderReviewActionApproved: (code: string) =>
      isMyanmar ? `Order ${code} ကို Telegram မှ အတည်ပြုပြီးပါပြီ။` : `Approved order ${code} from Telegram.`,
    orderReviewActionRejected: (code: string) =>
      isMyanmar ? `Order ${code} ကို Telegram မှ ပယ်လိုက်ပါပြီ။` : `Rejected order ${code} from Telegram.`,
    orderReviewActionFailed: (message: string) =>
      isMyanmar ? `Telegram action မအောင်မြင်ပါ: ${message}` : `Telegram action failed: ${message}`,
    paymentInstructionsLabel: isMyanmar ? 'ငွေပေးချေမှု လမ်းညွှန်' : 'Payment instructions',
    paymentMethodsLabel: isMyanmar ? 'ငွေပေးချေမှု အကောင့်များ' : 'Payment methods',
    paymentMethodLabel: isMyanmar ? 'ရွေးထားသော ငွေပေးချေမှုနည်းလမ်း' : 'Payment method',
    planLabel: isMyanmar ? 'Plan' : 'Plan',
    priceLabel: isMyanmar ? 'စျေးနှုန်း' : 'Price',
    orderCodeLabel: isMyanmar ? 'Order' : 'Order',
    orderTypeLabel: isMyanmar ? 'Order အမျိုးအစား' : 'Order type',
    orderStatusTitle: isMyanmar ? '🧾 <b>Order အခြေအနေ</b>' : '🧾 <b>Order status</b>',
    ordersTitle: isMyanmar ? '🧾 <b>သင့် recent orders များ</b>' : '🧾 <b>Your recent orders</b>',
    ordersEmpty: isMyanmar ? 'ℹ️ ဤ Telegram account အတွက် order မရှိသေးပါ။ /buy သို့မဟုတ် /renew ဖြင့် စတင်နိုင်ပါသည်။' : 'ℹ️ There are no orders for this Telegram account yet. Start with /buy or /renew.',
    ordersHint: isMyanmar ? 'ပိုအသေးစိတ်ကြည့်ရန် /order <order-code> သို့မဟုတ် /order ကို အသုံးပြုပါ။' : 'Use /order <order-code> or /order to view one order in detail.',
    orderStatusUsage: isMyanmar ? 'အသုံးပြုပုံ: /order သို့မဟုတ် /order <ORDER-CODE>' : 'Usage: /order or /order <ORDER-CODE>',
    orderStatusNotFound: (code: string) =>
      isMyanmar
        ? `❌ <b>${code}</b> နှင့် ကိုက်ညီသော order မတွေ့ပါ။`
        : `❌ No order matched <b>${code}</b>.`,
    orderStatusLatestNotFound: isMyanmar
      ? 'ℹ️ ကြည့်ရန် order မရှိသေးပါ။ /buy သို့မဟုတ် /renew ဖြင့် စတင်နိုင်ပါသည်။'
      : 'ℹ️ There is no order to show yet. Start with /buy or /renew.',
    createdAtLabel: isMyanmar ? 'စတင်ချိန်' : 'Created',
    paymentSubmittedLabel: isMyanmar ? 'Proof ပို့ချိန်' : 'Proof submitted',
    reviewedAtLabel: isMyanmar ? 'Admin စစ်ဆေးချိန်' : 'Reviewed',
    fulfilledAtLabel: isMyanmar ? 'ပြီးစီးချိန်' : 'Fulfilled',
    rejectedAtLabel: isMyanmar ? 'ပယ်ချိန်' : 'Rejected',
    durationLabel: isMyanmar ? 'သက်တမ်းကာလ' : 'Duration',
    preferredServerLabel: isMyanmar ? 'ရွေးထားသော server' : 'Preferred server',
    deliveredKeyLabel: isMyanmar ? 'ထုတ်ပေးထားသော key' : 'Delivered key',
    latestOrderHint: isMyanmar ? 'နောက်ဆုံး order ကို ပြထားပါသည်။' : 'Showing the latest order.',
    orderKindNew: isMyanmar ? 'အသစ်' : 'New',
    orderKindRenew: isMyanmar ? 'သက်တမ်းတိုး' : 'Renewal',
    orderStatusAwaitingKeySelection: isMyanmar ? 'Key ရွေးချယ်ရန် စောင့်နေသည်' : 'Awaiting key selection',
    orderStatusAwaitingPlan: isMyanmar ? 'Plan ရွေးချယ်ရန် စောင့်နေသည်' : 'Awaiting plan selection',
    orderStatusAwaitingMonths: isMyanmar ? 'လအရေအတွက် စောင့်နေသည်' : 'Awaiting month count',
    orderStatusAwaitingServerSelection: isMyanmar ? 'Server ရွေးချယ်ရန် စောင့်နေသည်' : 'Awaiting server selection',
    orderStatusAwaitingKeyName: isMyanmar ? 'Key အမည် စောင့်နေသည်' : 'Awaiting key name',
    orderStatusAwaitingPaymentMethod: isMyanmar ? 'Payment method ရွေးရန် စောင့်နေသည်' : 'Awaiting payment method',
    orderStatusAwaitingPaymentProof: isMyanmar ? 'Payment proof စောင့်နေသည်' : 'Awaiting payment proof',
    orderStatusPendingReview: isMyanmar ? 'Admin စစ်ဆေးရန် စောင့်နေသည်' : 'Pending review',
    orderStatusApproved: isMyanmar ? 'အတည်ပြုထားပြီး ဖြစ်သည်' : 'Approved',
    orderStatusFulfilled: isMyanmar ? 'ပြီးစီးထားသည်' : 'Fulfilled',
    orderStatusRejected: isMyanmar ? 'ပယ်ထားသည်' : 'Rejected',
    orderStatusCancelled: isMyanmar ? 'ပယ်ဖျက်ထားသည်' : 'Cancelled',
    paymentProofLabel: isMyanmar ? 'Proof' : 'Proof',
    requestedNameLabel: isMyanmar ? 'တောင်းဆိုထားသော အမည်' : 'Requested name',
    renewalTargetLabel: isMyanmar ? 'သက်တမ်းတိုးမည့် key' : 'Renew target',
    accountNameLabel: isMyanmar ? 'အကောင့်အမည်' : 'Account name',
    accountNumberLabel: isMyanmar ? 'အကောင့်နံပါတ်' : 'Account number',
    serverAutoSelect: isMyanmar ? 'အကောင်းဆုံး server ကို အလိုအလျောက် ရွေးမည်' : 'Auto-select the best server',
    adminNote: isMyanmar ? 'Admin note' : 'Admin note',
    statusNoServers: isMyanmar ? '❌ Server မသတ်မှတ်ရသေးပါ။' : '❌ No servers configured.',
    statusTitle: isMyanmar ? '🖥️ <b>Server အခြေအနေ</b>\n\n' : '🖥️ <b>Server Status</b>\n\n',
    statusLabel: isMyanmar ? 'အခြေအနေ' : 'Status',
    latencyLabel: isMyanmar ? 'Latency' : 'Latency',
    uptimeLabel: isMyanmar ? 'Uptime' : 'Uptime',
    keysLabel: isMyanmar ? 'Key များ' : 'Keys',
    expiringNone: (days: number) => isMyanmar ? `✅ နောက် ${days} ရက်အတွင်း သက်တမ်းကုန်မည့် key မရှိပါ။` : `✅ No keys are expiring in the next ${days} day(s).`,
    expiringTitle: (days: number) => isMyanmar ? `⏳ <b>နောက် ${days} ရက်အတွင်း သက်တမ်းကုန်မည့် key များ</b>` : `⏳ <b>Keys expiring in the next ${days} day(s)</b>`,
    findUsage: isMyanmar ? '🔎 အသုံးပြုပုံ: /find <name, email, Telegram ID, key ID, or Outline ID>' : '🔎 Usage: /find <name, email, Telegram ID, key ID, or Outline ID>',
    findKeyFound: isMyanmar ? '🔎 <b>Key ကို တွေ့ရှိပါသည်</b>' : '🔎 <b>Key found</b>',
    findNoMatches: (query: string) => isMyanmar ? `❌ "${query}" နှင့် ကိုက်ညီသော access key မရှိပါ။` : `❌ No access keys matched "${query}".`,
    findMatches: (query: string) => isMyanmar ? `🔎 <b>"${query}" အတွက် ကိုက်ညီမှုများ</b>` : `🔎 <b>Matches for "${query}"</b>`,
    findProvideQuery: isMyanmar ? '❌ Key ID သို့မဟုတ် ရှာဖွေရန် စာသားတစ်ခု ထည့်ပါ။' : '❌ Please provide a key identifier or search term.',
    adminOnly: isMyanmar ? '❌ ဤ command ကို administrator များသာ အသုံးပြုနိုင်ပါသည်။' : '❌ This command is only available to administrators.',
    enableUsage: isMyanmar ? 'အသုံးပြုပုံ: /enable <key-id>' : 'Usage: /enable <key-id>',
    disableUsage: isMyanmar ? 'အသုံးပြုပုံ: /disable <key-id>' : 'Usage: /disable <key-id>',
    multiMatchUseIds: isMyanmar ? '⚠️ Key အများအပြား ကိုက်ညီနေပါသည်။ အောက်ပါ ID များထဲမှ တစ်ခုကို တိတိကျကျ အသုံးပြုပါ:' : '⚠️ Multiple keys matched. Use one of these exact IDs:',
    keyNotFound: isMyanmar ? '❌ Key မတွေ့ပါ။' : '❌ Key not found.',
    keyEnabled: (name: string) => isMyanmar ? `✅ <b>${name}</b> ကို ပြန်ဖွင့်ပြီးပါပြီ။` : `✅ Re-enabled <b>${name}</b>.`,
    keyDisabled: (name: string) => isMyanmar ? `⛔ <b>${name}</b> ကို ပိတ်လိုက်ပါပြီ။` : `⛔ Disabled <b>${name}</b>.`,
    resendUsage: isMyanmar ? 'အသုံးပြုပုံ: /resend <key-id>' : 'Usage: /resend <key-id>',
    resendMulti: isMyanmar ? '⚠️ Key အများအပြား ကိုက်ညီနေပါသည်။ တိတိကျကျ ID တစ်ခုကို အသုံးပြုပါ:' : '⚠️ Multiple keys matched. Use one exact ID:',
    resendFailed: (message: string) => isMyanmar ? `❌ ပြန်ပို့မှု မအောင်မြင်ပါ: ${message}` : `❌ Failed to resend: ${message}`,
    resendSuccess: (name: string) => isMyanmar ? `📨 <b>${name}</b> အတွက် share page ကို ပြန်ပို့ပြီးပါပြီ။` : `📨 Resent the share page for <b>${name}</b>.`,
    sysinfoGathering: isMyanmar ? '🔄 System information စုဆောင်းနေပါသည်...' : '🔄 Gathering system information...',
    sysinfoTitle: isMyanmar ? '<b>System Information</b> 🖥️' : '<b>System Information</b> 🖥️',
    sysinfoOs: isMyanmar ? 'OS' : 'OS',
    sysinfoCpu: isMyanmar ? 'CPU Load' : 'CPU Load',
    sysinfoMemory: isMyanmar ? 'Memory' : 'Memory',
    sysinfoDisk: isMyanmar ? 'Disk' : 'Disk',
    sysinfoFailed: isMyanmar ? '❌ System information မရယူနိုင်ပါ။' : '❌ Failed to retrieve system information.',
    backupCreating: isMyanmar ? '📦 Backup ဖန်တီးနေပါသည်... ကျေးဇူးပြု၍ ခဏစောင့်ပါ။' : '📦 Creating backup... please wait.',
    backupCaption: (date: string) => isMyanmar ? `${date} တွင် backup ဖန်တီးထားပါသည်` : `Backup created at ${date}`,
    backupFailed: (message: string) => isMyanmar ? `❌ Backup မအောင်မြင်ပါ: ${message}` : `❌ Backup failed: ${message}`,
    helpTitle: isMyanmar ? '📚 <b>အသုံးပြုနိုင်သော Command များ</b>' : '📚 <b>Available Commands</b>',
    helpEmailHint: isMyanmar ? 'ဤ Telegram account ကို ချိတ်ရန် သင့် email ကို တိုက်ရိုက် ပို့နိုင်ပါသည်။' : 'You can also send your email address directly to link this Telegram account.',
    unknownCommand: isMyanmar ? '❓ မသိသော command ဖြစ်သည်။ အသုံးပြုနိုင်သော command များကို ကြည့်ရန် /help ကို အသုံးပြုပါ။' : '❓ Unknown command. Use /help to see the available commands.',
    digestTitle: isMyanmar ? '🧾 <b>Atomic-UI Telegram အနှစ်ချုပ်</b>' : '🧾 <b>Atomic-UI Telegram Digest</b>',
    digestWindow: (hours: number) => isMyanmar ? `အချိန်ကာလ: နောက်ဆုံး ${hours} နာရီ` : `Window: last ${hours} hour(s)`,
    digestActiveKeys: isMyanmar ? 'Active key များ' : 'Active keys',
    digestPendingKeys: isMyanmar ? 'Pending key များ' : 'Pending keys',
    digestDepletedKeys: isMyanmar ? 'Depleted key များ' : 'Depleted keys',
    digestExpiringSoon: isMyanmar ? '၇ ရက်အတွင်း သက်တမ်းကုန်မည်' : 'Expiring in 7 days',
    digestOpenIncidents: isMyanmar ? 'ဖွင့်ထားသော incident များ' : 'Open incidents',
    digestEvents: isMyanmar ? 'Subscription page event များ' : 'Subscription page events',
    digestServerHealth: isMyanmar ? 'Server health' : 'Server health',
    digestHealthSummary: (up: number, slow: number, down: number, unknown: number) =>
      isMyanmar
        ? `${up} up, ${slow} slow, ${down} down, ${unknown} unknown`
        : `${up} up, ${slow} slow, ${down} down, ${unknown} unknown`,
  };
}

function formatExpirationSummary(key: {
  expiresAt?: Date | null;
  expirationType?: string | null;
  durationDays?: number | null;
}, locale: SupportedLocale = 'en') {
  const ui = getTelegramUi(locale);
  const localeCode = locale === 'my' ? 'my-MM' : 'en-US';
  if (!key.expiresAt) {
    if (key.expirationType === 'START_ON_FIRST_USE') {
      return ui.startsOnFirstUse(key.durationDays);
    }

    return ui.never;
  }

  const remainingMs = key.expiresAt.getTime() - Date.now();
  const daysLeft = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));
  const dateText = key.expiresAt.toLocaleDateString(localeCode);

  if (daysLeft <= 0) {
    return ui.expiredOn(dateText);
  }

  return ui.daysLeft(daysLeft, dateText);
}

async function getSubscriptionDefaults() {
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

async function getTelegramSupportLink() {
  const [salesSettings, defaults] = await Promise.all([
    getTelegramSalesSettings(),
    getSubscriptionDefaults(),
  ]);

  return salesSettings.supportLink?.trim() || defaults.supportLink || null;
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

function formatTelegramOrderStateLine(order: {
  orderCode: string;
  planName?: string | null;
  planCode?: string | null;
  durationMonths?: number | null;
  durationDays?: number | null;
  requestedName?: string | null;
}) {
  const parts = [`#${order.orderCode}`];
  if (order.planName || order.planCode) {
    parts.push(order.planName || order.planCode || '');
  }
  if (order.durationMonths) {
    parts.push(`${order.durationMonths}m`);
  }
  if (order.durationDays) {
    parts.push(`${order.durationDays}d`);
  }
  if (order.requestedName) {
    parts.push(order.requestedName);
  }
  return parts.join(' • ');
}

function formatTelegramDateTime(value: Date | null | undefined, locale: SupportedLocale) {
  if (!value) {
    return '—';
  }

  return value.toLocaleString(locale === 'my' ? 'my-MM' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTelegramOrderStatusLabel(status: string, ui: ReturnType<typeof getTelegramUi>) {
  switch (status) {
    case 'AWAITING_KEY_SELECTION':
      return ui.orderStatusAwaitingKeySelection;
    case 'AWAITING_PLAN':
      return ui.orderStatusAwaitingPlan;
    case 'AWAITING_MONTHS':
      return ui.orderStatusAwaitingMonths;
    case 'AWAITING_SERVER_SELECTION':
      return ui.orderStatusAwaitingServerSelection;
    case 'AWAITING_KEY_NAME':
      return ui.orderStatusAwaitingKeyName;
    case 'AWAITING_PAYMENT_METHOD':
      return ui.orderStatusAwaitingPaymentMethod;
    case 'AWAITING_PAYMENT_PROOF':
      return ui.orderStatusAwaitingPaymentProof;
    case 'PENDING_REVIEW':
      return ui.orderStatusPendingReview;
    case 'APPROVED':
      return ui.orderStatusApproved;
    case 'FULFILLED':
      return ui.orderStatusFulfilled;
    case 'REJECTED':
      return ui.orderStatusRejected;
    case 'CANCELLED':
      return ui.orderStatusCancelled;
    default:
      return status;
  }
}

function formatTelegramOrderKindLabel(kind: string, ui: ReturnType<typeof getTelegramUi>) {
  return kind === 'RENEW' ? ui.orderKindRenew : ui.orderKindNew;
}

function normalizeTelegramOrderLookupCodes(input: string) {
  const trimmed = input.trim().toUpperCase();
  if (!trimmed) {
    return [];
  }

  return trimmed.startsWith('ORD-') ? [trimmed] : [trimmed, `ORD-${trimmed}`];
}

async function listTelegramOrdersForUser(chatId: number, telegramUserId: number, limit = 5) {
  return db.telegramOrder.findMany({
    where: {
      OR: [
        { telegramChatId: String(chatId) },
        { telegramUserId: String(telegramUserId) },
      ],
    },
    orderBy: [{ createdAt: 'desc' }],
    take: limit,
  });
}

async function findTelegramOrderForUser(input: {
  chatId: number;
  telegramUserId: number;
  lookupCode?: string;
}) {
  const ownerFilter = {
    OR: [
      { telegramChatId: String(input.chatId) },
      { telegramUserId: String(input.telegramUserId) },
    ],
  };

  if (!input.lookupCode) {
    return db.telegramOrder.findFirst({
      where: ownerFilter,
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  const candidates = normalizeTelegramOrderLookupCodes(input.lookupCode);
  if (!candidates.length) {
    return null;
  }

  return db.telegramOrder.findFirst({
    where: {
      AND: [
        ownerFilter,
        {
          orderCode: {
            in: candidates,
          },
        },
      ],
    },
  });
}

async function buildTelegramOrderStatusMessage(input: {
  order: Awaited<ReturnType<typeof findTelegramOrderForUser>>;
  locale: SupportedLocale;
}) {
  const order = input.order;
  if (!order) {
    return null;
  }

  const locale = input.locale;
  const ui = getTelegramUi(locale);
  const lines = [
    ui.orderStatusTitle,
    '',
    `${ui.orderCodeLabel}: <b>${escapeHtml(order.orderCode)}</b>`,
    `${ui.statusLineLabel}: <b>${escapeHtml(formatTelegramOrderStatusLabel(order.status, ui))}</b>`,
    `${ui.orderTypeLabel}: ${escapeHtml(formatTelegramOrderKindLabel(order.kind, ui))}`,
  ];

  if (order.planName || order.planCode) {
    lines.push(`${ui.planLabel}: <b>${escapeHtml(order.planName || order.planCode || '')}</b>`);
  }

  if (order.priceLabel) {
    lines.push(`${ui.priceLabel}: ${escapeHtml(order.priceLabel)}`);
  }

  if (order.durationMonths) {
    lines.push(
      `${ui.durationLabel}: ${escapeHtml(
        locale === 'my'
          ? `${order.durationMonths} လ`
          : `${order.durationMonths} month${order.durationMonths === 1 ? '' : 's'}`,
      )}`,
    );
  }

  if (order.durationDays) {
    lines.push(
      `${ui.durationLabel}: ${escapeHtml(
        locale === 'my'
          ? `${order.durationDays} ရက်`
          : `${order.durationDays} day${order.durationDays === 1 ? '' : 's'}`,
      )}`,
    );
  }

  if (order.requestedName) {
    lines.push(`${ui.requestedNameLabel}: <b>${escapeHtml(order.requestedName)}</b>`);
  }

  if (order.requestedEmail) {
    lines.push(`${ui.emailLabel}: <code>${escapeHtml(order.requestedEmail)}</code>`);
  }

  if (order.kind === 'RENEW' && order.targetAccessKeyId) {
    lines.push(`${ui.renewalTargetLabel}: <code>${escapeHtml(order.targetAccessKeyId)}</code>`);
  }

  if (order.selectedServerName) {
    const flag = order.selectedServerCountryCode ? ` ${getFlagEmoji(order.selectedServerCountryCode)}` : '';
    lines.push(`${ui.preferredServerLabel}: <b>${escapeHtml(order.selectedServerName)}${flag}</b>`);
  }

  if (order.paymentMethodLabel) {
    lines.push(`${ui.paymentMethodLabel}: <b>${escapeHtml(order.paymentMethodLabel)}</b>`);
  }

  lines.push(`${ui.createdAtLabel}: ${escapeHtml(formatTelegramDateTime(order.createdAt, locale))}`);

  if (order.paymentSubmittedAt) {
    lines.push(
      `${ui.paymentSubmittedLabel}: ${escapeHtml(formatTelegramDateTime(order.paymentSubmittedAt, locale))}`,
    );
  }

  if (order.reviewedAt) {
    lines.push(`${ui.reviewedAtLabel}: ${escapeHtml(formatTelegramDateTime(order.reviewedAt, locale))}`);
  }

  if (order.fulfilledAt) {
    lines.push(
      `${ui.fulfilledAtLabel}: ${escapeHtml(formatTelegramDateTime(order.fulfilledAt, locale))}`,
    );
  }

  if (order.rejectedAt) {
    lines.push(
      `${ui.rejectedAtLabel}: ${escapeHtml(formatTelegramDateTime(order.rejectedAt, locale))}`,
    );
  }

  if (order.adminNote?.trim()) {
    lines.push('', `${ui.adminNote}:`, escapeHtml(order.adminNote.trim()));
  }

  const relatedKeyId = order.approvedAccessKeyId || order.targetAccessKeyId;
  if (relatedKeyId) {
    const key = await db.accessKey.findUnique({
      where: { id: relatedKeyId },
      select: {
        id: true,
        name: true,
        publicSlug: true,
        subscriptionToken: true,
        sharePageEnabled: true,
        clientLinkEnabled: true,
      },
    });

    if (key) {
      const token = key.subscriptionToken
        ? key.subscriptionToken
        : await ensureAccessKeySubscriptionToken(key.id, key.subscriptionToken);

      const sharePageUrl = key.sharePageEnabled
        ? key.publicSlug
          ? buildShortShareUrl(key.publicSlug, { source: 'telegram_order_status', lang: locale })
          : buildSharePageUrl(token, { source: 'telegram_order_status', lang: locale })
        : null;

      const outlineClientUrl = key.clientLinkEnabled
        ? key.publicSlug
          ? buildSubscriptionClientUrl(key.publicSlug, key.name, {
              source: 'telegram_order_status',
              shortPath: true,
            })
          : buildSubscriptionClientUrl(token, key.name, {
              source: 'telegram_order_status',
            })
        : null;

      lines.push('', `${ui.deliveredKeyLabel}: <b>${escapeHtml(key.name)}</b>`);

      if (sharePageUrl) {
        lines.push(`🌐 ${ui.sharePageLabel}: ${sharePageUrl}`);
      }

      if (outlineClientUrl) {
        lines.push(`⚡ ${ui.outlineClientUrlLabel}: <code>${escapeHtml(outlineClientUrl)}</code>`);
      }
    }
  }

  if (order.status === 'AWAITING_PAYMENT_PROOF' || order.status === 'PENDING_REVIEW') {
    lines.push('', ui.orderSupportHint);
  }

  return lines.join('\n');
}

async function handleOrdersCommand(
  chatId: number,
  telegramUserId: number,
  locale: SupportedLocale,
  botToken: string,
) {
  const ui = getTelegramUi(locale);
  const orders = await listTelegramOrdersForUser(chatId, telegramUserId, 6);
  if (!orders.length) {
    return ui.ordersEmpty;
  }

  const lines = [ui.ordersTitle, ''];
  for (const order of orders) {
    lines.push(
      `• ${escapeHtml(
        formatTelegramOrderStateLine({
          orderCode: order.orderCode,
          planName: order.planName,
          planCode: order.planCode,
          durationMonths: order.durationMonths,
          durationDays: order.durationDays,
          requestedName: order.requestedName,
        }),
      )}`,
    );
    lines.push(
      `  ${ui.statusLineLabel}: ${escapeHtml(formatTelegramOrderStatusLabel(order.status, ui))} • ${escapeHtml(formatTelegramDateTime(order.createdAt, locale))}`,
    );
  }

  lines.push('', ui.ordersHint);
  const summaryMessage = lines.join('\n');
  const sentSummary = await sendTelegramMessage(botToken, chatId, summaryMessage);

  const latestOrder = orders[0];
  if (latestOrder) {
    await sendTelegramOrderStatusCard({
      botToken,
      chatId,
      order: latestOrder,
      locale,
      appendLatestHint: true,
    });
  }

  return sentSummary ? null : summaryMessage;
}

async function handleOrderStatusCommand(
  chatId: number,
  telegramUserId: number,
  argsText: string,
  locale: SupportedLocale,
  botToken: string,
) {
  const ui = getTelegramUi(locale);
  const lookupCode = argsText.trim();
  const order = await findTelegramOrderForUser({
    chatId,
    telegramUserId,
    lookupCode: lookupCode || undefined,
  });

  if (!order) {
    return lookupCode ? ui.orderStatusNotFound(escapeHtml(lookupCode)) : ui.orderStatusLatestNotFound;
  }

  const message = await buildTelegramOrderStatusMessage({
    order,
    locale,
  });

  if (!message) {
    return lookupCode ? ui.orderStatusNotFound(escapeHtml(lookupCode)) : ui.orderStatusLatestNotFound;
  }

  const text = lookupCode ? message : `${message}\n\n${ui.latestOrderHint}`;
  const sent = await sendTelegramMessage(botToken, chatId, text, {
    replyMarkup: buildTelegramOrderActionKeyboard({
      order,
      locale,
    }),
  });

  return sent ? null : text;
}

function buildTelegramSalesPlanPromptText(locale: SupportedLocale, lines: string[]) {
  const ui = getTelegramUi(locale);
  return [lines.join('\n'), '', ui.orderSupportHint].join('\n');
}

function buildTelegramSalesPaymentPrompt(input: {
  locale: SupportedLocale;
  orderCode: string;
  planSummary: string;
  paymentInstructions: string;
  paymentMethod?: TelegramSalesPaymentMethod | null;
  paymentMethods?: TelegramSalesPaymentMethod[];
  paymentMethodLabel?: string | null;
  selectedServerName?: string | null;
  requestedName?: string | null;
  renewalTargetName?: string | null;
  supportLink?: string | null;
}) {
  const ui = getTelegramUi(input.locale);
  const lines = [
    ui.orderCodeLabel + `: <b>${escapeHtml(input.orderCode)}</b>`,
    `${ui.planLabel}: <b>${escapeHtml(input.planSummary)}</b>`,
  ];

  if (input.requestedName) {
    lines.push(`${ui.requestedNameLabel}: <b>${escapeHtml(input.requestedName)}</b>`);
  }

  if (input.renewalTargetName) {
    lines.push(`${ui.renewalTargetLabel}: <b>${escapeHtml(input.renewalTargetName)}</b>`);
  }

  if (input.selectedServerName) {
    lines.push(`${ui.preferredServerLabel}: <b>${escapeHtml(input.selectedServerName)}</b>`);
  }

  lines.push(
    '',
    `${ui.paymentInstructionsLabel}:`,
    escapeHtml(input.paymentInstructions),
  );

  const paymentMethods = input.paymentMethod
    ? [input.paymentMethod]
    : (input.paymentMethods || []).filter((method) => method.enabled);
  if (paymentMethods.length > 0) {
    lines.push('', `${ui.paymentMethodsLabel}:`);
    for (const method of paymentMethods) {
      const label = resolveTelegramSalesPaymentMethodLabel(method, input.locale);
      const note = resolveTelegramSalesPaymentMethodNote(method, input.locale);
      lines.push(`• <b>${escapeHtml(label)}</b>`);
      if (method.accountName?.trim()) {
        lines.push(`  ${ui.accountNameLabel}: ${escapeHtml(method.accountName.trim())}`);
      }
      if (method.accountNumber?.trim()) {
        lines.push(`  ${ui.accountNumberLabel}: <code>${escapeHtml(method.accountNumber.trim())}</code>`);
      }
      if (note) {
        lines.push(`  ${escapeHtml(note)}`);
      }
    }
  } else if (input.paymentMethodLabel?.trim()) {
    lines.push('', `${ui.paymentMethodLabel}: <b>${escapeHtml(input.paymentMethodLabel.trim())}</b>`);
  }

  if (input.supportLink) {
    lines.push('', `${ui.supportLabel}: ${escapeHtml(input.supportLink)}`);
  }

  lines.push('', ui.paymentProofRequired);

  return lines.join('\n');
}

function truncateTelegramButtonLabel(value: string, maxLength = 28) {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength - 1)}…`;
}

function buildTelegramPlanSelectionKeyboard(input: {
  orderId: string;
  plans: TelegramSalesPlan[];
  locale: SupportedLocale;
}) {
  return {
    inline_keyboard: input.plans.map((plan) => {
      const label = resolveTelegramSalesPlanLabel(plan, input.locale);
      const price = resolveTelegramSalesPriceLabel(plan, input.locale);
      return [
        {
          text: truncateTelegramButtonLabel(price ? `${label} • ${price}` : label, 42),
          callback_data: buildTelegramOrderActionCallbackData('pl', input.orderId, plan.code),
        },
      ];
    }),
  };
}

function buildTelegramRenewKeySelectionKeyboard(input: {
  orderId: string;
  keys: Awaited<ReturnType<typeof findLinkedAccessKeys>>;
  locale: SupportedLocale;
}) {
  const rows = input.keys.slice(0, 8).map((key) => [
    {
      text: truncateTelegramButtonLabel(`🔄 ${key.name}`, 36),
      callback_data: buildTelegramOrderActionCallbackData('ky', key.id),
    },
  ]);

  rows.push([
    {
      text: getTelegramUi(input.locale).orderActionCancel,
      callback_data: buildTelegramOrderActionCallbackData('ca', input.orderId),
    },
  ]);

  return {
    inline_keyboard: rows,
  };
}

async function listAssignableTelegramOrderServers() {
  const servers = await db.server.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      countryCode: true,
      isDefault: true,
      sortOrder: true,
      lifecycleMode: true,
      isActive: true,
    },
    orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  });

  return servers.filter((server) => canAssignKeysToServer(server).allowed);
}

function formatTelegramServerChoiceLabel(
  server: Awaited<ReturnType<typeof listAssignableTelegramOrderServers>>[number],
  ui: ReturnType<typeof getTelegramUi>,
) {
  return server.id === 'auto'
    ? ui.serverAutoSelect
    : `${server.name}${server.countryCode ? ` ${getFlagEmoji(server.countryCode)}` : ''}`;
}

function buildTelegramServerSelectionKeyboard(input: {
  orderId: string;
  locale: SupportedLocale;
  servers: Awaited<ReturnType<typeof listAssignableTelegramOrderServers>>;
}) {
  const ui = getTelegramUi(input.locale);
  const rows: Array<Array<{ text: string; callback_data: string }>> = [
    [
      {
        text: truncateTelegramButtonLabel(`⚡ ${ui.serverAutoSelect}`, 38),
        callback_data: buildTelegramOrderActionCallbackData('sv', input.orderId, 'auto'),
      },
    ],
  ];

  for (const server of input.servers.slice(0, 8)) {
    rows.push([
      {
        text: truncateTelegramButtonLabel(`🖥 ${formatTelegramServerChoiceLabel(server, ui)}`, 38),
        callback_data: buildTelegramOrderActionCallbackData('sv', input.orderId, server.id),
      },
    ]);
  }

  rows.push([
    {
      text: ui.orderActionCancel,
      callback_data: buildTelegramOrderActionCallbackData('ca', input.orderId),
    },
  ]);

  return {
    inline_keyboard: rows,
  };
}

function buildTelegramServerSelectionPromptText(input: {
  orderCode: string;
  locale: SupportedLocale;
  servers: Awaited<ReturnType<typeof listAssignableTelegramOrderServers>>;
}) {
  const ui = getTelegramUi(input.locale);
  const lines = [
    ui.orderServerPrompt(input.orderCode),
    `1. ${ui.serverAutoSelect}`,
    ...input.servers.map((server, index) => `${index + 2}. ${formatTelegramServerChoiceLabel(server, ui)}`),
  ];

  return buildTelegramSalesPlanPromptText(input.locale, lines);
}

function buildTelegramPaymentMethodSelectionKeyboard(input: {
  orderId: string;
  locale: SupportedLocale;
  methods: TelegramSalesPaymentMethod[];
}) {
  const rows = input.methods.slice(0, 8).map((method) => [
    {
      text: truncateTelegramButtonLabel(
        `💳 ${resolveTelegramSalesPaymentMethodLabel(method, input.locale)}`,
        38,
      ),
      callback_data: buildTelegramOrderActionCallbackData('pm', input.orderId, method.code),
    },
  ]);

  rows.push([
    {
      text: getTelegramUi(input.locale).orderActionCancel,
      callback_data: buildTelegramOrderActionCallbackData('ca', input.orderId),
    },
  ]);

  return {
    inline_keyboard: rows,
  };
}

function buildTelegramPaymentMethodSelectionPromptText(input: {
  orderCode: string;
  locale: SupportedLocale;
  methods: TelegramSalesPaymentMethod[];
  planSummary: string;
  requestedName?: string | null;
  renewalTargetName?: string | null;
  selectedServerName?: string | null;
}) {
  const ui = getTelegramUi(input.locale);
  const lines = [
    ui.orderPaymentMethodPrompt(input.orderCode),
    `${ui.planLabel}: <b>${escapeHtml(input.planSummary)}</b>`,
  ];

  if (input.requestedName) {
    lines.push(`${ui.requestedNameLabel}: <b>${escapeHtml(input.requestedName)}</b>`);
  }

  if (input.renewalTargetName) {
    lines.push(`${ui.renewalTargetLabel}: <b>${escapeHtml(input.renewalTargetName)}</b>`);
  }

  if (input.selectedServerName) {
    lines.push(`${ui.preferredServerLabel}: <b>${escapeHtml(input.selectedServerName)}</b>`);
  }

  lines.push(
    '',
    ...input.methods.flatMap((method, index) => {
      const label = resolveTelegramSalesPaymentMethodLabel(method, input.locale);
      const note = resolveTelegramSalesPaymentMethodNote(method, input.locale);
      const methodLines = [`${index + 1}. ${label}`];

      if (method.accountName?.trim()) {
        methodLines.push(`   ${ui.accountNameLabel}: ${escapeHtml(method.accountName.trim())}`);
      }

      if (method.accountNumber?.trim()) {
        methodLines.push(`   ${ui.accountNumberLabel}: <code>${escapeHtml(method.accountNumber.trim())}</code>`);
      }

      if (note) {
        methodLines.push(`   ${escapeHtml(note)}`);
      }

      return methodLines;
    }),
  );

  return buildTelegramSalesPlanPromptText(input.locale, lines);
}

function buildTelegramOrderActionKeyboard(input: {
  order: {
    id: string;
    status: string;
    paymentMethodCode?: string | null;
  };
  locale: SupportedLocale;
}) {
  const ui = getTelegramUi(input.locale);
  const rows: Array<Array<{ text: string; callback_data: string }>> = [];

  if (input.order.status === 'AWAITING_PAYMENT_METHOD') {
    rows.push([
      {
        text: ui.orderActionChoosePaymentMethod,
        callback_data: buildTelegramOrderActionCallbackData('pm', input.order.id),
      },
    ]);
  }

  if (input.order.status === 'AWAITING_PAYMENT_PROOF') {
    rows.push([
      {
        text: input.order.paymentMethodCode ? ui.orderActionPayNow : ui.orderActionChoosePaymentMethod,
        callback_data: buildTelegramOrderActionCallbackData(
          input.order.paymentMethodCode ? 'pay' : 'pm',
          input.order.id,
        ),
      },
      {
        text: ui.orderActionUploadProof,
        callback_data: buildTelegramOrderActionCallbackData('up', input.order.id),
      },
    ]);
  }

  rows.push([
    {
      text: ui.orderActionCheckStatus,
      callback_data: buildTelegramOrderActionCallbackData('st', input.order.id),
    },
  ]);

  if (!isTelegramOrderTerminal(input.order.status) && input.order.status !== 'PENDING_REVIEW') {
    rows.push([
      {
        text: ui.orderActionCancel,
        callback_data: buildTelegramOrderActionCallbackData('ca', input.order.id),
      },
    ]);
  }

  return rows.length
    ? {
        inline_keyboard: rows,
      }
    : undefined;
}

async function listAvailableTelegramPlansForOrder(input: {
  kind: 'NEW' | 'RENEW';
  chatId: number;
  telegramUserId: number;
  settings: Awaited<ReturnType<typeof getTelegramSalesSettings>>;
}) {
  const freeTrialEligible =
    input.kind === 'NEW'
      ? await isEligibleForTelegramFreeTrial(input.chatId, input.telegramUserId)
      : false;

  return input.settings.plans.filter((plan) => {
    if (!plan.enabled) {
      return false;
    }

    if (input.kind === 'RENEW' && plan.code === 'trial_1d_3gb') {
      return false;
    }

    if (plan.code === 'trial_1d_3gb' && !freeTrialEligible) {
      return false;
    }

    return true;
  });
}

async function findTelegramOrderByIdForUser(input: {
  orderId: string;
  chatId: number;
  telegramUserId: number;
}) {
  return db.telegramOrder.findFirst({
    where: {
      id: input.orderId,
      OR: [
        { telegramChatId: String(input.chatId) },
        { telegramUserId: String(input.telegramUserId) },
      ],
    },
  });
}

async function sendTelegramOrderStatusCard(input: {
  botToken: string;
  chatId: number;
  order: Awaited<ReturnType<typeof findTelegramOrderForUser>>;
  locale: SupportedLocale;
  appendLatestHint?: boolean;
}) {
  if (!input.order) {
    return false;
  }

  const message = await buildTelegramOrderStatusMessage({
    order: input.order,
    locale: input.locale,
  });

  if (!message) {
    return false;
  }

  const ui = getTelegramUi(input.locale);
  const text = input.appendLatestHint ? `${message}\n\n${ui.latestOrderHint}` : message;
  return sendTelegramMessage(input.botToken, input.chatId, text, {
    replyMarkup: buildTelegramOrderActionKeyboard({
      order: input.order,
      locale: input.locale,
    }),
  });
}

async function createTelegramOrderRecord(input: {
  kind: 'NEW' | 'RENEW';
  chatId: number;
  telegramUserId: number;
  telegramUsername?: string;
  locale: SupportedLocale;
  initialStatus: TelegramOrderActiveStatus;
  targetAccessKeyId?: string | null;
  planCode?: TelegramSalesPlanCode | null;
  durationMonths?: number | null;
  durationDays?: number | null;
  dataLimitBytes?: bigint | null;
  unlimitedQuota?: boolean;
  requestedName?: string | null;
  selectedServerId?: string | null;
  selectedServerName?: string | null;
  selectedServerCountryCode?: string | null;
}) {
  const orderCode = await generateTelegramOrderCode();
  return db.telegramOrder.create({
    data: {
      orderCode,
      kind: input.kind,
      status: input.initialStatus,
      ...buildTelegramOrderPaymentStageFields({
        nextStatus: input.initialStatus,
      }),
      telegramChatId: String(input.chatId),
      telegramUserId: String(input.telegramUserId),
      telegramUsername: input.telegramUsername || null,
      locale: input.locale,
      targetAccessKeyId: input.targetAccessKeyId || null,
      planCode: input.planCode || null,
      durationMonths: input.durationMonths ?? null,
      durationDays: input.durationDays ?? null,
      dataLimitBytes: input.dataLimitBytes ?? null,
      unlimitedQuota: input.unlimitedQuota ?? false,
      requestedName: input.requestedName || null,
      selectedServerId: input.selectedServerId ?? null,
      selectedServerName: input.selectedServerName ?? null,
      selectedServerCountryCode: input.selectedServerCountryCode ?? null,
    },
  });
}

async function sendTelegramOrderReviewAlert(orderId: string) {
  const config = await getTelegramConfig();
  if (!config || config.adminChatIds.length === 0) {
    return;
  }

  const order = await db.telegramOrder.findUnique({
    where: { id: orderId },
    include: {
      reviewedBy: { select: { id: true, email: true } },
    },
  });

  if (!order) {
    return;
  }

  const locale = coerceSupportedLocale(order.locale) || (await getTelegramDefaultLocale());
  const ui = getTelegramUi(locale);
  const panelUrl = await buildTelegramOrderPanelUrl(order.id);
  const lines = [
    ui.orderReviewAlertTitle,
    '',
    `${ui.orderCodeLabel}: <b>${escapeHtml(order.orderCode)}</b>`,
    `${ui.requesterLabel}: <b>${escapeHtml(order.telegramUsername || order.telegramUserId)}</b>`,
    `${ui.telegramIdLabel}: <code>${escapeHtml(order.telegramUserId)}</code>`,
    `${ui.paymentProofLabel}: ${escapeHtml(order.paymentProofType || 'photo')}`,
    order.paymentMethodLabel ? `${ui.paymentMethodLabel}: <b>${escapeHtml(order.paymentMethodLabel)}</b>` : '',
    order.planName ? `${ui.planLabel}: <b>${escapeHtml(order.planName)}</b>` : '',
    order.requestedName ? `${ui.requestedNameLabel}: <b>${escapeHtml(order.requestedName)}</b>` : '',
    order.targetAccessKeyId ? `${ui.renewalTargetLabel}: <code>${escapeHtml(order.targetAccessKeyId)}</code>` : '',
    '',
    `${ui.orderReviewPanelLabel}: ${panelUrl}`,
  ]
    .filter(Boolean)
    .join('\n');

  for (const adminChatId of config.adminChatIds) {
    await sendTelegramMessage(config.botToken, adminChatId, lines, {
      replyMarkup: {
        inline_keyboard: [
          [
            {
              text: ui.orderApproveActionLabel,
              callback_data: buildTelegramOrderReviewCallbackData('approve', order.id),
            },
            {
              text: ui.orderRejectActionLabel,
              callback_data: buildTelegramOrderReviewCallbackData('reject', order.id),
            },
          ],
          [{ text: ui.orderReviewPanelLabel, url: panelUrl }],
        ],
      },
    });

    if (order.paymentMessageId) {
      await copyTelegramMessage(
        config.botToken,
        order.telegramChatId,
        order.paymentMessageId,
        adminChatId,
      );
    }
  }
}

async function handleTelegramOrderProofMessage(input: {
  botToken: string;
  chatId: number;
  telegramUserId: number;
  messageId: number;
  photo?: TelegramMessage['photo'];
  document?: TelegramMessage['document'];
  caption?: string;
}) {
  const activeOrder = await getActiveTelegramOrder(input.chatId, input.telegramUserId);
  if (!activeOrder || activeOrder.status !== 'AWAITING_PAYMENT_PROOF') {
    return null;
  }

  const proofFileId =
    input.photo?.[input.photo.length - 1]?.file_id ||
    input.document?.file_id ||
    null;

  if (!proofFileId) {
    return null;
  }

  const next = await db.telegramOrder.update({
    where: { id: activeOrder.id },
    data: {
      status: 'PENDING_REVIEW',
      ...buildTelegramOrderPaymentStageFields({
        nextStatus: 'PENDING_REVIEW',
        currentStatus: activeOrder.status,
        paymentStageEnteredAt: activeOrder.paymentStageEnteredAt,
        paymentReminderSentAt: activeOrder.paymentReminderSentAt,
      }),
      paymentProofFileId: proofFileId,
      paymentProofType: input.document ? 'document' : 'photo',
      paymentMessageId: input.messageId,
      paymentCaption: input.caption || null,
      paymentSubmittedAt: new Date(),
    },
  });

  await sendTelegramOrderReviewAlert(next.id);

  const locale = coerceSupportedLocale(next.locale) || (await getTelegramDefaultLocale());
  const ui = getTelegramUi(locale);
  return ui.orderProofPending(next.orderCode);
}

async function handleBuyCommand(
  chatId: number,
  telegramUserId: number,
  username: string,
  locale: SupportedLocale,
  botToken: string,
): Promise<string | null> {
  const ui = getTelegramUi(locale);
  const settings = await getTelegramSalesSettings();

  if (!settings.enabled) {
    return ui.buyDisabled;
  }

  const existing = await getActiveTelegramOrder(chatId, telegramUserId);
  if (existing?.status === 'PENDING_REVIEW') {
    return ui.activeOrderPendingReview(existing.orderCode);
  }

  await cancelStaleTelegramConversationOrders(chatId, telegramUserId);

  const order = await createTelegramOrderRecord({
    kind: 'NEW',
    chatId,
    telegramUserId,
    telegramUsername: username,
    locale,
    initialStatus: 'AWAITING_PLAN',
  });

  const enabledPlans = await listAvailableTelegramPlansForOrder({
    kind: 'NEW',
    chatId,
    telegramUserId,
    settings,
  });
  const lines = [
    ui.orderPlanPrompt(order.orderCode),
    ...enabledPlans.map((plan, index) => {
      const label = resolveTelegramSalesPlanLabel(plan, locale);
      const price = resolveTelegramSalesPriceLabel(plan, locale);
      return `${index + 1}. ${label}${price ? ` - ${price}` : ''}`;
    }),
  ];
  const message = buildTelegramSalesPlanPromptText(locale, lines);
  const sent = await sendTelegramMessage(botToken, chatId, message, {
    replyMarkup: buildTelegramPlanSelectionKeyboard({
      orderId: order.id,
      plans: enabledPlans,
      locale,
    }),
  });

  return sent ? null : message;
}

async function handleRenewOrderCommand(
  chatId: number,
  telegramUserId: number,
  username: string,
  locale: SupportedLocale,
  botToken: string,
): Promise<string | null> {
  const ui = getTelegramUi(locale);
  const settings = await getTelegramSalesSettings();

  if (!settings.enabled || !settings.allowRenewals) {
    return ui.renewDisabled;
  }

  const existing = await getActiveTelegramOrder(chatId, telegramUserId);
  if (existing?.status === 'PENDING_REVIEW') {
    return ui.activeOrderPendingReview(existing.orderCode);
  }

  const keys = await findLinkedAccessKeys(chatId, telegramUserId, true);
  if (keys.length === 0) {
    return ui.myKeysEmpty;
  }

  await cancelStaleTelegramConversationOrders(chatId, telegramUserId);

  const order = await createTelegramOrderRecord({
    kind: 'RENEW',
    chatId,
    telegramUserId,
    telegramUsername: username,
    locale,
    initialStatus: 'AWAITING_KEY_SELECTION',
  });

  const lines = [
    ui.renewTargetPrompt(order.orderCode),
    ...keys.map((key, index) => `${index + 1}. ${key.name} (${key.status})`),
  ];
  const message = buildTelegramSalesPlanPromptText(locale, lines);
  const sent = await sendTelegramMessage(botToken, chatId, message, {
    replyMarkup: buildTelegramRenewKeySelectionKeyboard({
      orderId: order.id,
      keys,
      locale,
    }),
  });

  return sent ? null : message;
}

async function handleTelegramOrderTextMessage(input: {
  chatId: number;
  telegramUserId: number;
  text: string;
}) {
  const activeOrder = await getActiveTelegramOrder(input.chatId, input.telegramUserId);
  if (!activeOrder) {
    return null;
  }

  const locale = coerceSupportedLocale(activeOrder.locale) || (await getTelegramDefaultLocale());
  const ui = getTelegramUi(locale);
  const salesSettings = await getTelegramSalesSettings();
  const defaults = await getSubscriptionDefaults();
  const trimmed = input.text.trim();

  switch (activeOrder.status) {
    case 'AWAITING_KEY_SELECTION': {
      const keys = await findLinkedAccessKeys(input.chatId, input.telegramUserId, true);
      if (keys.length === 0) {
        return ui.myKeysEmpty;
      }

      const numericIndex = Number.parseInt(trimmed, 10);
      const matchedKey =
        Number.isFinite(numericIndex) && numericIndex >= 1 && numericIndex <= keys.length
          ? keys[numericIndex - 1]
          : keys.find((key) => key.id === trimmed || key.name.toLowerCase() === trimmed.toLowerCase()) ||
            keys.find((key) => key.name.toLowerCase().includes(trimmed.toLowerCase()));

      if (!matchedKey) {
        return ui.invalidRenewChoice;
      }

      await db.telegramOrder.update({
        where: { id: activeOrder.id },
        data: {
          targetAccessKeyId: matchedKey.id,
          status: 'AWAITING_PLAN',
        },
      });

      const enabledPlans = await listAvailableTelegramPlansForOrder({
        kind: 'RENEW',
        chatId: input.chatId,
        telegramUserId: input.telegramUserId,
        settings: salesSettings,
      });
      const lines = [
        ui.orderPlanPrompt(activeOrder.orderCode),
        `${ui.renewalTargetLabel}: <b>${escapeHtml(matchedKey.name)}</b>`,
        '',
        ...enabledPlans.map((plan, index) => {
          const label = resolveTelegramSalesPlanLabel(plan, locale);
          const price = resolveTelegramSalesPriceLabel(plan, locale);
          return `${index + 1}. ${label}${price ? ` - ${price}` : ''}`;
        }),
      ];

      return buildTelegramSalesPlanPromptText(locale, lines);
    }
    case 'AWAITING_PLAN': {
      const enabledPlans = await listAvailableTelegramPlansForOrder({
        kind: activeOrder.kind as 'NEW' | 'RENEW',
        chatId: input.chatId,
        telegramUserId: input.telegramUserId,
        settings: salesSettings,
      });
      const numericIndex = Number.parseInt(trimmed, 10);
      if (!Number.isFinite(numericIndex) || numericIndex < 1 || numericIndex > enabledPlans.length) {
        return ui.invalidPlanChoice;
      }

      const plan = enabledPlans[numericIndex - 1];
      if (plan.code === 'trial_1d_3gb' && !(await isEligibleForTelegramFreeTrial(input.chatId, input.telegramUserId))) {
        return ui.freeTrialUnavailable;
      }
      const planLabel = resolveTelegramSalesPlanLabel(plan, locale);
      const priceLabel = resolveTelegramSalesPriceLabel(plan, locale);

      if (plan.unlimitedQuota && !plan.fixedDurationMonths) {
        await db.telegramOrder.update({
          where: { id: activeOrder.id },
          data: {
            planCode: plan.code,
            planName: priceLabel ? `${planLabel} (${priceLabel})` : planLabel,
            priceAmount: plan.priceAmount ?? null,
            priceCurrency: plan.priceCurrency || null,
            priceLabel: priceLabel || null,
            templateId: plan.templateId || null,
            dataLimitBytes: null,
            unlimitedQuota: true,
            status: 'AWAITING_MONTHS',
          },
        });
        return ui.orderMonthsPrompt;
      }

      const durationMonths = plan.fixedDurationMonths ?? plan.minDurationMonths ?? null;
      const durationDays = plan.fixedDurationDays ?? null;
      const dataLimitBytes = plan.dataLimitGB
        ? BigInt(plan.dataLimitGB) * BigInt(1024 * 1024 * 1024)
        : null;
      const enabledPaymentMethods = listEnabledTelegramSalesPaymentMethods(salesSettings);
      const nextStatus =
        activeOrder.kind === 'NEW'
          ? 'AWAITING_SERVER_SELECTION'
          : enabledPaymentMethods.length > 0
            ? 'AWAITING_PAYMENT_METHOD'
            : 'AWAITING_PAYMENT_PROOF';

      const nextOrder = await db.telegramOrder.update({
        where: { id: activeOrder.id },
        data: {
          planCode: plan.code,
          planName: priceLabel ? `${planLabel} (${priceLabel})` : planLabel,
          priceAmount: plan.priceAmount ?? null,
          priceCurrency: plan.priceCurrency || null,
          priceLabel: priceLabel || null,
          templateId: plan.templateId || null,
          durationMonths,
          durationDays,
          dataLimitBytes,
          unlimitedQuota: plan.unlimitedQuota,
          status: nextStatus,
          ...buildTelegramOrderPaymentStageFields({
            nextStatus,
            currentStatus: activeOrder.status,
            paymentStageEnteredAt: activeOrder.paymentStageEnteredAt,
            paymentReminderSentAt: activeOrder.paymentReminderSentAt,
          }),
        },
      });

      if (nextStatus === 'AWAITING_SERVER_SELECTION') {
        const servers = await listAssignableTelegramOrderServers();
        return buildTelegramServerSelectionPromptText({
          orderCode: nextOrder.orderCode,
          locale,
          servers,
        });
      }

      if (nextStatus === 'AWAITING_PAYMENT_METHOD') {
        const renewalTarget = nextOrder.targetAccessKeyId
          ? await db.accessKey.findUnique({
              where: { id: nextOrder.targetAccessKeyId },
              select: { name: true },
            })
          : null;
        const planSummary = formatTelegramSalesPlanSummary(plan, durationMonths, locale);
        return buildTelegramPaymentMethodSelectionPromptText({
          orderCode: nextOrder.orderCode,
          locale,
          methods: enabledPaymentMethods,
          planSummary,
          renewalTargetName: renewalTarget?.name || null,
        });
      }

      const renewalTarget = nextOrder.targetAccessKeyId
        ? await db.accessKey.findUnique({
            where: { id: nextOrder.targetAccessKeyId },
            select: { name: true },
          })
        : null;
      const paymentInstructions = resolveTelegramSalesPaymentInstructions(salesSettings, locale);
      const planSummary = formatTelegramSalesPlanSummary(plan, durationMonths, locale);
      return buildTelegramSalesPaymentPrompt({
        locale,
        orderCode: nextOrder.orderCode,
        planSummary,
        paymentInstructions,
        paymentMethods: listEnabledTelegramSalesPaymentMethods(salesSettings),
        renewalTargetName: renewalTarget?.name || null,
        supportLink: await getTelegramSupportLink(),
      });
    }
    case 'AWAITING_MONTHS': {
      const months = Number.parseInt(trimmed, 10);
      if (!Number.isFinite(months) || months < 3 || months > 24) {
        return ui.invalidMonths;
      }

      const plan = activeOrder.planCode
        ? resolveTelegramSalesPlan(salesSettings, activeOrder.planCode as TelegramSalesPlanCode)
        : null;
      if (!plan) {
        return ui.invalidPlanChoice;
      }

      const planSummary = formatTelegramSalesPlanSummary(plan, months, locale);
      const enabledPaymentMethods = listEnabledTelegramSalesPaymentMethods(salesSettings);
      const nextStatus =
        activeOrder.kind === 'NEW'
          ? 'AWAITING_SERVER_SELECTION'
          : enabledPaymentMethods.length > 0
            ? 'AWAITING_PAYMENT_METHOD'
            : 'AWAITING_PAYMENT_PROOF';
      const nextOrder = await db.telegramOrder.update({
        where: { id: activeOrder.id },
        data: {
          durationMonths: months,
          durationDays: null,
          planName: planSummary,
          priceAmount: plan.priceAmount ?? null,
          priceCurrency: plan.priceCurrency || null,
          priceLabel: resolveTelegramSalesPriceLabel(plan, locale) || null,
          templateId: plan.templateId || null,
          status: nextStatus,
          ...buildTelegramOrderPaymentStageFields({
            nextStatus,
            currentStatus: activeOrder.status,
            paymentStageEnteredAt: activeOrder.paymentStageEnteredAt,
            paymentReminderSentAt: activeOrder.paymentReminderSentAt,
          }),
        },
      });

      if (nextStatus === 'AWAITING_SERVER_SELECTION') {
        const servers = await listAssignableTelegramOrderServers();
        return buildTelegramServerSelectionPromptText({
          orderCode: nextOrder.orderCode,
          locale,
          servers,
        });
      }

      if (nextStatus === 'AWAITING_PAYMENT_METHOD') {
        const renewalTarget = nextOrder.targetAccessKeyId
          ? await db.accessKey.findUnique({
              where: { id: nextOrder.targetAccessKeyId },
              select: { name: true },
            })
          : null;
        return buildTelegramPaymentMethodSelectionPromptText({
          orderCode: nextOrder.orderCode,
          locale,
          methods: enabledPaymentMethods,
          planSummary,
          renewalTargetName: renewalTarget?.name || null,
        });
      }

      const renewalTarget = nextOrder.targetAccessKeyId
        ? await db.accessKey.findUnique({
            where: { id: nextOrder.targetAccessKeyId },
            select: { name: true },
          })
        : null;
      return buildTelegramSalesPaymentPrompt({
        locale,
        orderCode: nextOrder.orderCode,
        planSummary,
        paymentInstructions: resolveTelegramSalesPaymentInstructions(salesSettings, locale),
        paymentMethods: listEnabledTelegramSalesPaymentMethods(salesSettings),
        renewalTargetName: renewalTarget?.name || null,
        supportLink: await getTelegramSupportLink(),
      });
    }
    case 'AWAITING_SERVER_SELECTION': {
      const servers = await listAssignableTelegramOrderServers();
      const numericIndex = Number.parseInt(trimmed, 10);
      const normalizedText = trimmed.toLowerCase();

      let selectedServer:
        | (Awaited<ReturnType<typeof listAssignableTelegramOrderServers>>[number] & { id: string })
        | null = null;

      if (normalizedText === 'auto' || normalizedText === 'a' || trimmed === '1') {
        selectedServer = {
          id: 'auto',
          name: ui.serverAutoSelect,
          countryCode: null,
          isDefault: false,
          sortOrder: 0,
          lifecycleMode: 'ACTIVE',
          isActive: true,
        };
      } else if (Number.isFinite(numericIndex) && numericIndex >= 2 && numericIndex <= servers.length + 1) {
        selectedServer = servers[numericIndex - 2] || null;
      } else {
        selectedServer =
          servers.find((server) => server.id === trimmed) ||
          servers.find((server) => server.name.toLowerCase() === normalizedText) ||
          servers.find((server) => server.name.toLowerCase().includes(normalizedText)) ||
          null;
      }

      if (!selectedServer) {
        return ui.invalidServerChoice;
      }

      await db.telegramOrder.update({
        where: { id: activeOrder.id },
        data: {
          selectedServerId: selectedServer.id === 'auto' ? null : selectedServer.id,
          selectedServerName: selectedServer.id === 'auto' ? null : selectedServer.name,
          selectedServerCountryCode:
            selectedServer.id === 'auto' ? null : (selectedServer.countryCode ?? null),
          status: 'AWAITING_KEY_NAME',
        },
      });

      const selectedLabel =
        selectedServer.id === 'auto'
          ? ui.serverAutoSelect
          : formatTelegramServerChoiceLabel(selectedServer, ui);
      return `${ui.orderActionSelectedServer(selectedLabel)}\n\n${ui.orderNamePrompt}`;
    }
    case 'AWAITING_KEY_NAME': {
      if (trimmed.length < 2 || trimmed.length > 100) {
        return ui.invalidOrderName;
      }

      const plan = activeOrder.planCode
        ? resolveTelegramSalesPlan(salesSettings, activeOrder.planCode as TelegramSalesPlanCode)
        : null;
      const planSummary = plan
        ? formatTelegramSalesPlanSummary(plan, activeOrder.durationMonths, locale)
        : activeOrder.planName || '';

      const updatedOrder = await db.telegramOrder.update({
        where: { id: activeOrder.id },
        data: {
          requestedName: trimmed,
          status:
            plan?.code === 'trial_1d_3gb'
              ? 'APPROVED'
              : listEnabledTelegramSalesPaymentMethods(salesSettings).length > 0
                ? 'AWAITING_PAYMENT_METHOD'
                : 'AWAITING_PAYMENT_PROOF',
          reviewedAt: plan?.code === 'trial_1d_3gb' ? new Date() : null,
          adminNote:
            plan?.code === 'trial_1d_3gb'
              ? appendTelegramOrderAdminNote(activeOrder.adminNote, 'Auto-approved free trial')
              : activeOrder.adminNote,
          paymentMethodCode: null,
          paymentMethodLabel: null,
          paymentMethodAccountName: null,
          paymentMethodAccountNumber: null,
          ...buildTelegramOrderPaymentStageFields({
            nextStatus:
              plan?.code === 'trial_1d_3gb'
                ? 'APPROVED'
                : listEnabledTelegramSalesPaymentMethods(salesSettings).length > 0
                  ? 'AWAITING_PAYMENT_METHOD'
                  : 'AWAITING_PAYMENT_PROOF',
            currentStatus: activeOrder.status,
            paymentStageEnteredAt: activeOrder.paymentStageEnteredAt,
            paymentReminderSentAt: activeOrder.paymentReminderSentAt,
          }),
        },
      });

      if (plan?.code === 'trial_1d_3gb') {
        try {
          const { plan: resolvedPlan, template, durationMonths, durationDays } =
            await resolveTelegramOrderPlanContext(updatedOrder);
          const key = await fulfillTelegramNewAccessOrder({
            orderId: updatedOrder.id,
            orderCode: updatedOrder.orderCode,
            telegramChatId: updatedOrder.telegramChatId,
            telegramUserId: updatedOrder.telegramUserId,
            requestedName: trimmed,
            requestedEmail: updatedOrder.requestedEmail,
            durationMonths,
            durationDays,
            selectedServerId: updatedOrder.selectedServerId,
            plan: resolvedPlan,
            template,
          });

          await db.telegramOrder.update({
            where: { id: updatedOrder.id },
            data: {
              status: 'FULFILLED',
              approvedAccessKeyId: key.id,
              fulfilledAt: new Date(),
            },
          });

          let deliveryError: string | null = null;
          try {
            const config = await getTelegramConfig();
            if (config) {
              await sendTelegramMessage(
                config.botToken,
                updatedOrder.telegramChatId,
                ui.orderApproved(updatedOrder.orderCode),
                {
                  replyMarkup: getCommandKeyboard(false),
                },
              );
            }

            await sendAccessKeySharePageToTelegram({
              accessKeyId: key.id,
              chatId: updatedOrder.telegramChatId,
              reason: 'CREATED',
              source: 'telegram_trial',
            });
          } catch (error) {
            deliveryError = (error as Error).message;
          }

          await writeAuditLog({
            action: 'TELEGRAM_ORDER_TRIAL_FULFILLED',
            entity: 'TELEGRAM_ORDER',
            entityId: updatedOrder.id,
            details: {
              orderCode: updatedOrder.orderCode,
              approvedAccessKeyId: key.id,
              deliveryError,
            },
          });

          return deliveryError ? `${ui.orderApproved(updatedOrder.orderCode)}\n\n${deliveryError}` : null;
        } catch (error) {
          await db.telegramOrder.update({
            where: { id: updatedOrder.id },
            data: {
              status: 'AWAITING_KEY_NAME',
              reviewedAt: null,
              adminNote: appendTelegramOrderAdminNote(
                activeOrder.adminNote,
                `Free trial fulfillment failed at ${new Date().toISOString()}: ${(error as Error).message}`,
              ),
            },
          });
          return (error as Error).message;
        }
      }

      const enabledPaymentMethods = listEnabledTelegramSalesPaymentMethods(salesSettings);
      if (enabledPaymentMethods.length > 0) {
        return buildTelegramPaymentMethodSelectionPromptText({
          orderCode: updatedOrder.orderCode,
          locale,
          methods: enabledPaymentMethods,
          planSummary,
          selectedServerName: updatedOrder.selectedServerName,
          requestedName: trimmed,
        });
      }

      return buildTelegramSalesPaymentPrompt({
        locale,
        orderCode: activeOrder.orderCode,
        planSummary,
        paymentInstructions: resolveTelegramSalesPaymentInstructions(salesSettings, locale),
        paymentMethods: listEnabledTelegramSalesPaymentMethods(salesSettings),
        selectedServerName: updatedOrder.selectedServerName,
        requestedName: trimmed,
        supportLink: await getTelegramSupportLink(),
      });
    }
    case 'AWAITING_PAYMENT_METHOD': {
      const paymentMethods = listEnabledTelegramSalesPaymentMethods(salesSettings);
      if (paymentMethods.length === 0) {
        await db.telegramOrder.update({
          where: { id: activeOrder.id },
          data: {
            status: 'AWAITING_PAYMENT_PROOF',
            ...buildTelegramOrderPaymentStageFields({
              nextStatus: 'AWAITING_PAYMENT_PROOF',
              currentStatus: activeOrder.status,
              paymentStageEnteredAt: activeOrder.paymentStageEnteredAt,
              paymentReminderSentAt: activeOrder.paymentReminderSentAt,
            }),
          },
        });
        return ui.paymentProofRequired;
      }

      const numericIndex = Number.parseInt(trimmed, 10);
      const normalizedText = trimmed.toLowerCase();
      const selectedMethod =
        Number.isFinite(numericIndex) && numericIndex >= 1 && numericIndex <= paymentMethods.length
          ? paymentMethods[numericIndex - 1]
          : paymentMethods.find((method) => method.code.toLowerCase() === normalizedText) ||
            paymentMethods.find(
              (method) =>
                resolveTelegramSalesPaymentMethodLabel(method, locale).toLowerCase() === normalizedText,
            ) ||
            paymentMethods.find((method) =>
              resolveTelegramSalesPaymentMethodLabel(method, locale)
                .toLowerCase()
                .includes(normalizedText),
            ) ||
            null;

      if (!selectedMethod) {
        return ui.invalidPaymentMethodChoice;
      }

      const updatedOrder = await db.telegramOrder.update({
        where: { id: activeOrder.id },
        data: {
          paymentMethodCode: selectedMethod.code,
          paymentMethodLabel: resolveTelegramSalesPaymentMethodLabel(selectedMethod, locale),
          paymentMethodAccountName: selectedMethod.accountName?.trim() || null,
          paymentMethodAccountNumber: selectedMethod.accountNumber?.trim() || null,
          status: 'AWAITING_PAYMENT_PROOF',
          ...buildTelegramOrderPaymentStageFields({
            nextStatus: 'AWAITING_PAYMENT_PROOF',
            currentStatus: activeOrder.status,
            paymentStageEnteredAt: activeOrder.paymentStageEnteredAt,
            paymentReminderSentAt: activeOrder.paymentReminderSentAt,
          }),
        },
      });

      const plan = updatedOrder.planCode
        ? resolveTelegramSalesPlan(salesSettings, updatedOrder.planCode as TelegramSalesPlanCode)
        : null;
      const renewalTarget = updatedOrder.targetAccessKeyId
        ? await db.accessKey.findUnique({
            where: { id: updatedOrder.targetAccessKeyId },
            select: { name: true },
          })
        : null;
      const planSummary = plan
        ? formatTelegramSalesPlanSummary(plan, updatedOrder.durationMonths, locale)
        : updatedOrder.planName || '';

      return [
        ui.orderActionSelectedPaymentMethod(resolveTelegramSalesPaymentMethodLabel(selectedMethod, locale)),
        '',
        buildTelegramSalesPaymentPrompt({
          locale,
          orderCode: updatedOrder.orderCode,
          planSummary,
          paymentInstructions: resolveTelegramSalesPaymentInstructions(salesSettings, locale),
          paymentMethod: selectedMethod,
          selectedServerName: updatedOrder.selectedServerName,
          requestedName: updatedOrder.requestedName,
          renewalTargetName: renewalTarget?.name || null,
          supportLink: await getTelegramSupportLink(),
        }),
      ].join('\n');
    }
    case 'AWAITING_PAYMENT_PROOF':
      return ui.paymentProofRequired;
    case 'PENDING_REVIEW':
      return ui.activeOrderPendingReview(activeOrder.orderCode);
    default:
      return null;
  }
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

async function answerTelegramCallbackQuery(
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

async function copyTelegramMessage(
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

function resolveTelegramTemplate(
  templates: LocalizedTemplateMap | undefined,
  locale: SupportedLocale,
  fallback?: string,
) {
  return resolveLocalizedTemplate(templates, locale, fallback)?.trim() || '';
}

function addMonths(baseDate: Date, months: number) {
  const next = new Date(baseDate);
  next.setMonth(next.getMonth() + months);
  return next;
}

function addDays(baseDate: Date, days: number) {
  const next = new Date(baseDate);
  next.setDate(next.getDate() + days);
  return next;
}

function applyTelegramOrderDuration(input: {
  baseDate: Date;
  durationMonths?: number | null;
  durationDays?: number | null;
}) {
  if (input.durationDays && input.durationDays > 0) {
    return addDays(input.baseDate, input.durationDays);
  }

  return addMonths(input.baseDate, input.durationMonths ?? 1);
}

async function isEligibleForTelegramFreeTrial(chatId: number, telegramUserId: number) {
  const [linkedKeyCount, fulfilledOrders, fulfilledTrialOrder] = await Promise.all([
    db.accessKey.count({
      where: {
        OR: [{ telegramId: String(telegramUserId) }, { user: { telegramChatId: String(chatId) } }],
        status: {
          not: 'ARCHIVED',
        },
      },
    }),
    db.telegramOrder.count({
      where: {
        OR: [{ telegramChatId: String(chatId) }, { telegramUserId: String(telegramUserId) }],
        kind: 'NEW',
        status: 'FULFILLED',
      },
    }),
    db.telegramOrder.count({
      where: {
        OR: [{ telegramChatId: String(chatId) }, { telegramUserId: String(telegramUserId) }],
        kind: 'NEW',
        planCode: 'trial_1d_3gb',
        status: 'FULFILLED',
      },
    }),
  ]);

  return linkedKeyCount === 0 && fulfilledOrders === 0 && fulfilledTrialOrder === 0;
}

async function isGeneratedAccessSlugAvailable(slug: string) {
  if (!slug || !isValidPublicSlug(slug) || isReservedPublicSlug(slug)) {
    return false;
  }

  const [accessMatch, dynamicMatch, historyMatch] = await Promise.all([
    db.accessKey.findFirst({
      where: { publicSlug: slug },
      select: { id: true },
    }),
    db.dynamicAccessKey.findFirst({
      where: { publicSlug: slug },
      select: { id: true },
    }),
    (db as any).accessKeySlugHistory.findUnique({
      where: { slug },
      select: { accessKeyId: true },
    }),
  ]);

  return !accessMatch && !dynamicMatch && !historyMatch;
}

async function resolveGeneratedAccessSlug(name: string, prefix?: string | null) {
  const baseParts = [prefix, slugifyPublicName(name)].filter(Boolean);
  const base = normalizePublicSlug(baseParts.join('-')) || slugifyPublicName(name);

  for (const candidate of buildPublicSlugSuggestionCandidates(base, 10)) {
    if (await isGeneratedAccessSlugAvailable(candidate)) {
      return candidate;
    }
  }

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const candidate = normalizePublicSlug(`${base}-${attempt + 1}`);
    if (candidate && (await isGeneratedAccessSlugAvailable(candidate))) {
      return candidate;
    }
  }

  return null;
}

function isTelegramOrderTerminal(status: string) {
  return TELEGRAM_ORDER_TERMINAL_STATUSES.includes(status as TelegramOrderTerminalStatus);
}

function isTelegramOrderAwaitingPayment(status: string) {
  return status === 'AWAITING_PAYMENT_METHOD' || status === 'AWAITING_PAYMENT_PROOF';
}

function buildTelegramOrderPaymentStageFields(input: {
  nextStatus: string;
  currentStatus?: string | null;
  paymentStageEnteredAt?: Date | null;
  paymentReminderSentAt?: Date | null;
  preserveReminderSentAt?: boolean;
}) {
  const nextIsPayment = isTelegramOrderAwaitingPayment(input.nextStatus);
  const currentIsPayment = Boolean(
    input.currentStatus && isTelegramOrderAwaitingPayment(input.currentStatus),
  );

  if (nextIsPayment) {
    return {
      paymentStageEnteredAt:
        currentIsPayment && input.paymentStageEnteredAt ? input.paymentStageEnteredAt : new Date(),
      paymentReminderSentAt:
        currentIsPayment && input.preserveReminderSentAt
          ? input.paymentReminderSentAt ?? null
          : currentIsPayment
            ? input.paymentReminderSentAt ?? null
            : null,
      expiredAt: null,
    };
  }

  if (currentIsPayment) {
    return {
      paymentStageEnteredAt: null,
      paymentReminderSentAt: null,
    };
  }

  return {};
}

async function getActiveTelegramOrder(chatId: number, telegramUserId: number) {
  return db.telegramOrder.findFirst({
    where: {
      telegramChatId: String(chatId),
      telegramUserId: String(telegramUserId),
      status: {
        in: [...TELEGRAM_ORDER_ACTIVE_STATUSES],
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
}

async function cancelStaleTelegramConversationOrders(chatId: number, telegramUserId: number) {
  await db.telegramOrder.updateMany({
    where: {
      telegramChatId: String(chatId),
      telegramUserId: String(telegramUserId),
      status: {
        in: [
          'AWAITING_KEY_SELECTION',
          'AWAITING_PLAN',
          'AWAITING_MONTHS',
          'AWAITING_SERVER_SELECTION',
          'AWAITING_KEY_NAME',
          'AWAITING_PAYMENT_METHOD',
          'AWAITING_PAYMENT_PROOF',
        ],
      },
    },
    data: {
      status: 'CANCELLED',
      paymentStageEnteredAt: null,
      paymentReminderSentAt: null,
      expiredAt: null,
      updatedAt: new Date(),
    },
  });
}

export async function runTelegramSalesOrderCycle() {
  const settings = await getTelegramSalesSettings();
  if (!settings.enabled) {
    return {
      skipped: true,
      reminded: 0,
      expired: 0,
      errors: [] as string[],
    };
  }

  const now = new Date();
  const reminderMs = Math.max(1, settings.paymentReminderHours) * 60 * 60 * 1000;
  const expiryMs = Math.max(settings.unpaidOrderExpiryHours, settings.paymentReminderHours) * 60 * 60 * 1000;
  const config = await getTelegramConfig();
  const supportLink = config ? await getTelegramSupportLink() : null;
  const orders = await db.telegramOrder.findMany({
    where: {
      status: {
        in: ['AWAITING_PAYMENT_METHOD', 'AWAITING_PAYMENT_PROOF'],
      },
    },
    orderBy: [{ createdAt: 'asc' }],
    select: {
      id: true,
      orderCode: true,
      status: true,
      telegramChatId: true,
      telegramUserId: true,
      locale: true,
      planCode: true,
      planName: true,
      durationMonths: true,
      paymentMethodCode: true,
      paymentMethodLabel: true,
      requestedName: true,
      selectedServerName: true,
      targetAccessKeyId: true,
      paymentStageEnteredAt: true,
      paymentReminderSentAt: true,
      createdAt: true,
      updatedAt: true,
      adminNote: true,
    },
  });

  let reminded = 0;
  let expired = 0;
  const errors: string[] = [];

  for (const order of orders) {
    const baseline = order.paymentStageEnteredAt ?? order.updatedAt ?? order.createdAt;
    const elapsedMs = now.getTime() - baseline.getTime();
    const locale = coerceSupportedLocale(order.locale) || (await getTelegramDefaultLocale());
    const ui = getTelegramUi(locale);

    if (elapsedMs >= expiryMs) {
      try {
        await db.telegramOrder.update({
          where: { id: order.id },
          data: {
            status: 'CANCELLED',
            expiredAt: now,
            paymentStageEnteredAt: null,
            paymentReminderSentAt: null,
            adminNote: appendTelegramOrderAdminNote(
              order.adminNote,
              ui.orderExpiredUnpaidNote,
            ),
          },
        });

        if (config) {
          const lines = [ui.orderExpiredUnpaid(order.orderCode)];
          if (supportLink) {
            lines.push('', `${ui.supportLabel}: ${supportLink}`);
          }
          await sendTelegramMessage(config.botToken, order.telegramChatId, lines.join('\n'), {
            replyMarkup: getCommandKeyboard(false),
          });
        }

        await writeAuditLog({
          action: 'TELEGRAM_ORDER_EXPIRED_UNPAID',
          entity: 'TELEGRAM_ORDER',
          entityId: order.id,
          details: {
            orderCode: order.orderCode,
            elapsedHours: Math.round(elapsedMs / (60 * 60 * 1000)),
          },
        });

        expired += 1;
      } catch (error) {
        errors.push(`expire:${order.orderCode}:${(error as Error).message}`);
      }
      continue;
    }

    if (order.paymentReminderSentAt || elapsedMs < reminderMs || !config) {
      continue;
    }

    try {
      const plan = order.planCode
        ? resolveTelegramSalesPlan(settings, order.planCode as TelegramSalesPlanCode)
        : null;
      const planSummary = plan
        ? formatTelegramSalesPlanSummary(plan, order.durationMonths, locale)
        : order.planName || '';
      const renewalTarget = order.targetAccessKeyId
        ? await db.accessKey.findUnique({
            where: { id: order.targetAccessKeyId },
            select: { name: true },
          })
        : null;

      if (order.status === 'AWAITING_PAYMENT_METHOD') {
        const methods = listEnabledTelegramSalesPaymentMethods(settings);
        await sendTelegramMessage(
          config.botToken,
          order.telegramChatId,
          [
            ui.orderPaymentMethodReminder(order.orderCode),
            '',
            buildTelegramPaymentMethodSelectionPromptText({
              orderCode: order.orderCode,
              locale,
              methods,
              planSummary,
              requestedName: order.requestedName,
              renewalTargetName: renewalTarget?.name || null,
              selectedServerName: order.selectedServerName,
            }),
          ].join('\n'),
          {
            replyMarkup: buildTelegramPaymentMethodSelectionKeyboard({
              orderId: order.id,
              locale,
              methods,
            }),
          },
        );
      } else {
        const selectedMethod = resolveTelegramSalesPaymentMethod(settings, order.paymentMethodCode);
        await sendTelegramMessage(
          config.botToken,
          order.telegramChatId,
          [
            ui.orderPaymentProofReminder(order.orderCode),
            '',
            buildTelegramSalesPaymentPrompt({
              locale,
              orderCode: order.orderCode,
              planSummary,
              paymentInstructions: resolveTelegramSalesPaymentInstructions(settings, locale),
              paymentMethod: selectedMethod,
              paymentMethodLabel: order.paymentMethodLabel,
              selectedServerName: order.selectedServerName,
              requestedName: order.requestedName,
              renewalTargetName: renewalTarget?.name || null,
              supportLink,
            }),
          ].join('\n'),
          {
            replyMarkup: buildTelegramOrderActionKeyboard({
              order,
              locale,
            }),
          },
        );
      }

      await db.telegramOrder.update({
        where: { id: order.id },
        data: {
          paymentReminderSentAt: now,
        },
      });

      await writeAuditLog({
        action: 'TELEGRAM_ORDER_PAYMENT_REMINDER_SENT',
        entity: 'TELEGRAM_ORDER',
        entityId: order.id,
        details: {
          orderCode: order.orderCode,
          status: order.status,
          elapsedHours: Math.round(elapsedMs / (60 * 60 * 1000)),
        },
      });

      reminded += 1;
    } catch (error) {
      errors.push(`reminder:${order.orderCode}:${(error as Error).message}`);
    }
  }

  return {
    skipped: false,
    reminded,
    expired,
    errors,
  };
}

async function buildTelegramOrderPanelUrl(orderId: string) {
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.NEXTAUTH_URL ||
    'http://localhost:3000';
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
  return `${origin}${basePath}/dashboard/notifications?telegramOrder=${encodeURIComponent(orderId)}`;
}

function appendTelegramOrderAdminNote(existingNote?: string | null, nextNote?: string | null) {
  const trimmedExisting = existingNote?.trim();
  const trimmedNext = nextNote?.trim();

  if (!trimmedNext) {
    return trimmedExisting || null;
  }

  if (!trimmedExisting) {
    return trimmedNext;
  }

  return `${trimmedExisting}\n\n${trimmedNext}`;
}

async function resolveTelegramOrderPlanContext(order: {
  id: string;
  orderCode: string;
  locale: string;
  planCode?: string | null;
  durationMonths?: number | null;
  durationDays?: number | null;
  templateId?: string | null;
}) {
  const locale = coerceSupportedLocale(order.locale) || (await getTelegramDefaultLocale());
  const salesSettings = await getTelegramSalesSettings();

  if (!order.planCode) {
    throw new Error(`Telegram order ${order.orderCode} does not have a selected plan.`);
  }

  const plan = resolveTelegramSalesPlan(salesSettings, order.planCode as TelegramSalesPlanCode);
  if (!plan) {
    throw new Error(`The selected plan for order ${order.orderCode} is no longer available.`);
  }

  const durationMonths =
    order.durationMonths ?? plan.fixedDurationMonths ?? plan.minDurationMonths ?? 1;
  const durationDays = order.durationDays ?? plan.fixedDurationDays ?? null;
  const templateId = order.templateId || plan.templateId || null;
  const template = templateId
    ? await db.keyTemplate.findUnique({
        where: { id: templateId },
      })
    : null;

  if (templateId && !template) {
    throw new Error(`The template configured for order ${order.orderCode} no longer exists.`);
  }

  return {
    locale,
    salesSettings,
    plan,
    template,
    durationMonths,
    durationDays,
  };
}

async function resolveTelegramOrderLinkedUser(order: {
  telegramChatId: string;
  requestedEmail?: string | null;
}) {
  const email = order.requestedEmail?.trim();

  return db.user.findFirst({
    where: {
      OR: [
        { telegramChatId: order.telegramChatId },
        ...(email ? [{ email }] : []),
      ],
    },
    select: {
      id: true,
    },
  });
}

async function resolveTelegramProvisioningServer(input?: {
  selectedServerId?: string | null;
  template?: {
    serverId?: string | null;
  } | null;
}) {
  if (input?.selectedServerId) {
    const selectedServer = await db.server.findUnique({
      where: { id: input.selectedServerId },
    });

    if (!selectedServer) {
      throw new Error('The selected server could not be loaded.');
    }

    const assignmentCheck = canAssignKeysToServer(selectedServer);
    if (!assignmentCheck.allowed) {
      throw new Error(assignmentCheck.reason);
    }

    return selectedServer;
  }

  if (input?.template?.serverId) {
    const configuredServer = await db.server.findUnique({
      where: { id: input.template.serverId },
    });

    if (!configuredServer) {
      throw new Error('The template server no longer exists.');
    }

    const assignmentCheck = canAssignKeysToServer(configuredServer);
    if (!assignmentCheck.allowed) {
      throw new Error(assignmentCheck.reason);
    }

    return configuredServer;
  }

  const recommendedServer = await selectLeastLoadedServer();
  if (!recommendedServer?.serverId) {
    throw new Error('No assignable server is available for Telegram order fulfillment.');
  }

  const server = await db.server.findUnique({
    where: { id: recommendedServer.serverId },
  });

  if (!server) {
    throw new Error('The selected server could not be loaded.');
  }

  const assignmentCheck = canAssignKeysToServer(server);
  if (!assignmentCheck.allowed) {
    throw new Error(assignmentCheck.reason);
  }

  return server;
}

function buildTelegramOrderKeyName(input: {
  orderCode: string;
  requestedName?: string | null;
  template?: {
    namePrefix?: string | null;
    [key: string]: unknown;
  } | null;
}) {
  const requestedName = input.requestedName?.trim() || `Key ${input.orderCode}`;
  const prefix = input.template?.namePrefix?.trim();

  if (!prefix) {
    return requestedName.slice(0, 100);
  }

  const separator = /[-\s_]$/.test(prefix) ? '' : '-';
  const prefixed = requestedName.toLowerCase().startsWith(prefix.toLowerCase())
    ? requestedName
    : `${prefix}${separator}${requestedName}`;

  return prefixed.slice(0, 100);
}

async function fulfillTelegramNewAccessOrder(input: {
  orderId: string;
  orderCode: string;
  telegramChatId: string;
  telegramUserId: string;
  requestedName?: string | null;
  requestedEmail?: string | null;
  durationMonths?: number | null;
  durationDays?: number | null;
  selectedServerId?: string | null;
  plan: TelegramSalesPlan;
  template?: {
    id: string;
    serverId?: string | null;
    method: string;
    notes?: string | null;
    slugPrefix?: string | null;
    subscriptionTheme?: string | null;
    subscriptionWelcomeMessage?: string | null;
    sharePageEnabled: boolean;
    clientLinkEnabled: boolean;
    telegramDeliveryEnabled: boolean;
    autoDisableOnLimit: boolean;
    autoDisableOnExpire: boolean;
    autoArchiveAfterDays: number;
    quotaAlertThresholds: string;
    autoRenewPolicy: string;
    autoRenewDurationDays?: number | null;
  } | null;
}) {
  const server = await resolveTelegramProvisioningServer({
    selectedServerId: input.selectedServerId,
    template: input.template,
  });
  const client = createOutlineClient(server.apiUrl, server.apiCertSha256);
  const linkedUser = await resolveTelegramOrderLinkedUser({
    telegramChatId: input.telegramChatId,
    requestedEmail: input.requestedEmail,
  });
  const keyName = buildTelegramOrderKeyName({
    orderCode: input.orderCode,
    requestedName: input.requestedName,
    template: input.template,
  });
  const publicSlug = await resolveGeneratedAccessSlug(keyName, input.template?.slugPrefix || null);
  const now = new Date();
  const expiresAt = applyTelegramOrderDuration({
    baseDate: now,
    durationMonths: input.durationMonths,
    durationDays: input.durationDays,
  });
  const dataLimitBytes = input.plan.unlimitedQuota
    ? null
    : input.plan.dataLimitGB
      ? BigInt(input.plan.dataLimitGB) * BigInt(1024 * 1024 * 1024)
      : null;

  const outlineKey = await client.createAccessKey({
    name: keyName,
    method: input.template?.method || 'chacha20-ietf-poly1305',
  });

  try {
    if (dataLimitBytes) {
      await client.setAccessKeyDataLimit(outlineKey.id, Number(dataLimitBytes));
    }

    return await db.accessKey.create({
      data: {
        outlineKeyId: outlineKey.id,
        name: keyName,
        email: input.requestedEmail?.trim() || null,
        telegramId: input.telegramUserId,
        notes: input.template?.notes || null,
        userId: linkedUser?.id ?? null,
        serverId: server.id,
        accessUrl: decorateOutlineAccessUrl(outlineKey.accessUrl, keyName),
        password: outlineKey.password,
        port: outlineKey.port,
        method: outlineKey.method,
        dataLimitBytes,
        dataLimitResetStrategy: 'NEVER',
        expirationType: 'FIXED_DATE',
        expiresAt,
        durationDays: null,
        status: 'ACTIVE',
        prefix: null,
        subscriptionTheme: input.template?.subscriptionTheme || null,
        subscriptionWelcomeMessage: input.template?.subscriptionWelcomeMessage || null,
        sharePageEnabled: input.template?.sharePageEnabled ?? true,
        clientLinkEnabled: input.template?.clientLinkEnabled ?? true,
        telegramDeliveryEnabled: true,
        autoDisableOnLimit: input.template?.autoDisableOnLimit ?? true,
        autoDisableOnExpire: input.template?.autoDisableOnExpire ?? true,
        autoArchiveAfterDays: input.template?.autoArchiveAfterDays ?? 0,
        quotaAlertThresholds: input.template?.quotaAlertThresholds || '80,90',
        quotaAlertsSent: '[]',
        autoRenewPolicy: input.template?.autoRenewPolicy ?? 'NONE',
        autoRenewDurationDays: input.template?.autoRenewDurationDays ?? null,
        subscriptionToken: generateRandomString(32),
        publicSlug,
      },
    });
  } catch (error) {
    try {
      await client.deleteAccessKey(outlineKey.id);
    } catch (cleanupError) {
      console.error('Failed to cleanup Telegram-created Outline key:', cleanupError);
    }

    throw error;
  }
}

async function fulfillTelegramRenewAccessOrder(input: {
  orderCode: string;
  telegramUserId: string;
  telegramChatId: string;
  targetAccessKeyId: string;
  requestedEmail?: string | null;
  durationMonths?: number | null;
  durationDays?: number | null;
  plan: TelegramSalesPlan;
  template?: {
    id: string;
    subscriptionTheme?: string | null;
    subscriptionWelcomeMessage?: string | null;
    sharePageEnabled: boolean;
    clientLinkEnabled: boolean;
    telegramDeliveryEnabled: boolean;
    autoDisableOnLimit: boolean;
    autoDisableOnExpire: boolean;
    autoArchiveAfterDays: number;
    quotaAlertThresholds: string;
    autoRenewPolicy: string;
    autoRenewDurationDays?: number | null;
  } | null;
}) {
  let key = await db.accessKey.findUnique({
    where: { id: input.targetAccessKeyId },
    include: {
      server: true,
      user: true,
    },
  });

  if (!key) {
    throw new Error(`The renewal target for order ${input.orderCode} could not be found.`);
  }

  if (key.status === 'DISABLED') {
    key = await setAccessKeyEnabledState(key.id, true);
  }

  const client = createOutlineClient(key.server.apiUrl, key.server.apiCertSha256);
  const dataLimitBytes = input.plan.unlimitedQuota
    ? null
    : input.plan.dataLimitGB
      ? BigInt(input.plan.dataLimitGB) * BigInt(1024 * 1024 * 1024)
      : null;
  const expiryBase =
    key.expiresAt && key.expiresAt.getTime() > Date.now() ? key.expiresAt : new Date();
  const expiresAt = applyTelegramOrderDuration({
    baseDate: expiryBase,
    durationMonths: input.durationMonths,
    durationDays: input.durationDays,
  });
  const now = new Date();

  if (dataLimitBytes) {
    await client.setAccessKeyDataLimit(key.outlineKeyId, Number(dataLimitBytes));
  } else {
    await client.removeAccessKeyDataLimit(key.outlineKeyId);
  }

  return db.accessKey.update({
    where: { id: key.id },
    data: {
      email: input.requestedEmail?.trim() || key.email,
      telegramId: key.telegramId || input.telegramUserId,
      dataLimitBytes,
      dataLimitResetStrategy: 'NEVER',
      usedBytes: BigInt(0),
      usageOffset: BigInt(0),
      lastDataLimitReset: now,
      expirationType: 'FIXED_DATE',
      expiresAt,
      durationDays: null,
      status: 'ACTIVE',
      disabledAt: null,
      disabledOutlineKeyId: null,
      archiveAfterAt: null,
      subscriptionTheme: input.template?.subscriptionTheme ?? key.subscriptionTheme,
      subscriptionWelcomeMessage:
        input.template?.subscriptionWelcomeMessage ?? key.subscriptionWelcomeMessage,
      sharePageEnabled: input.template?.sharePageEnabled ?? key.sharePageEnabled,
      clientLinkEnabled: input.template?.clientLinkEnabled ?? key.clientLinkEnabled,
      telegramDeliveryEnabled: true,
      autoDisableOnLimit: input.template?.autoDisableOnLimit ?? key.autoDisableOnLimit,
      autoDisableOnExpire: input.template?.autoDisableOnExpire ?? key.autoDisableOnExpire,
      autoArchiveAfterDays: input.template?.autoArchiveAfterDays ?? key.autoArchiveAfterDays,
      quotaAlertThresholds: input.template?.quotaAlertThresholds ?? key.quotaAlertThresholds,
      quotaAlertsSent: '[]',
      bandwidthAlertAt80: false,
      bandwidthAlertAt90: false,
      autoRenewPolicy: input.template?.autoRenewPolicy ?? key.autoRenewPolicy,
      autoRenewDurationDays: input.template?.autoRenewDurationDays ?? key.autoRenewDurationDays,
    },
  });
}

export async function approveTelegramOrder(input: {
  orderId: string;
  reviewedByUserId?: string | null;
  reviewerName?: string | null;
  adminNote?: string | null;
}) {
  const claim = await db.telegramOrder.updateMany({
    where: {
      id: input.orderId,
      status: 'PENDING_REVIEW',
    },
    data: {
      status: 'APPROVED',
      reviewedByUserId: input.reviewedByUserId ?? null,
      reviewedAt: new Date(),
      adminNote: input.adminNote?.trim() || null,
    },
  });

  if (claim.count === 0) {
    throw new Error('This Telegram order is no longer pending review.');
  }

  const order = await db.telegramOrder.findUnique({
    where: { id: input.orderId },
  });

  if (!order) {
    throw new Error('Telegram order not found.');
  }

  try {
    const { locale, plan, template, durationMonths, durationDays } = await resolveTelegramOrderPlanContext(order);
    const ui = getTelegramUi(locale);
    const key =
      order.kind === 'RENEW'
        ? await fulfillTelegramRenewAccessOrder({
            orderCode: order.orderCode,
            telegramUserId: order.telegramUserId,
            telegramChatId: order.telegramChatId,
            targetAccessKeyId: order.targetAccessKeyId || '',
            requestedEmail: order.requestedEmail,
            durationMonths,
            durationDays,
            plan,
            template,
          })
        : await fulfillTelegramNewAccessOrder({
            orderId: order.id,
            orderCode: order.orderCode,
            telegramChatId: order.telegramChatId,
            telegramUserId: order.telegramUserId,
            requestedName: order.requestedName,
            requestedEmail: order.requestedEmail,
            durationMonths,
            durationDays,
            selectedServerId: order.selectedServerId,
            plan,
            template,
          });

    const finalOrder = await db.telegramOrder.update({
      where: { id: order.id },
      data: {
        status: 'FULFILLED',
        approvedAccessKeyId: key.id,
        fulfilledAt: new Date(),
        reviewedByUserId: input.reviewedByUserId ?? null,
        reviewedAt: new Date(),
        adminNote: appendTelegramOrderAdminNote(order.adminNote, input.adminNote),
      },
    });

    let deliveryError: string | null = null;
    let deliveryResult: Awaited<ReturnType<typeof sendAccessKeySharePageToTelegram>> | null = null;

    try {
      const config = await getTelegramConfig();
      if (config) {
        await sendTelegramMessage(
          config.botToken,
          order.telegramChatId,
          ui.orderApproved(order.orderCode),
          {
            replyMarkup: getCommandKeyboard(false),
          },
        );
      }

      deliveryResult = await sendAccessKeySharePageToTelegram({
        accessKeyId: key.id,
        chatId: order.telegramChatId,
        reason: order.kind === 'RENEW' ? 'RESENT' : 'CREATED',
        source: 'telegram_order',
      });
    } catch (error) {
      deliveryError = (error as Error).message;
    }

    await writeAuditLog({
      userId: input.reviewedByUserId ?? null,
      action: 'TELEGRAM_ORDER_APPROVED',
      entity: 'TELEGRAM_ORDER',
      entityId: finalOrder.id,
      details: {
        orderCode: order.orderCode,
        reviewerName: input.reviewerName ?? null,
        kind: order.kind,
        approvedAccessKeyId: key.id,
        deliveryError,
      },
    });

    return {
      orderId: finalOrder.id,
      orderCode: order.orderCode,
      accessKeyId: key.id,
      accessKeyName: key.name,
      deliveryError,
      sharePageUrl: deliveryResult?.sharePageUrl || null,
      subscriptionUrl: deliveryResult?.subscriptionUrl || null,
    };
  } catch (error) {
    await db.telegramOrder.update({
      where: { id: input.orderId },
      data: {
        status: 'PENDING_REVIEW',
        reviewedByUserId: null,
        reviewedAt: null,
        adminNote: appendTelegramOrderAdminNote(
          order.adminNote,
          `Approval failed at ${new Date().toISOString()}: ${(error as Error).message}`,
        ),
      },
    });

    throw error;
  }
}

export async function rejectTelegramOrder(input: {
  orderId: string;
  reviewedByUserId?: string | null;
  reviewerName?: string | null;
  adminNote?: string | null;
}) {
  const order = await db.telegramOrder.findUnique({
    where: { id: input.orderId },
  });

  if (!order) {
    throw new Error('Telegram order not found.');
  }

  if (isTelegramOrderTerminal(order.status)) {
    throw new Error('This Telegram order has already been completed.');
  }

  const finalOrder = await db.telegramOrder.update({
    where: { id: order.id },
    data: {
      status: 'REJECTED',
      reviewedByUserId: input.reviewedByUserId ?? null,
      reviewedAt: new Date(),
      rejectedAt: new Date(),
      adminNote: appendTelegramOrderAdminNote(order.adminNote, input.adminNote),
    },
  });

  const locale = coerceSupportedLocale(order.locale) || (await getTelegramDefaultLocale());
  const ui = getTelegramUi(locale);

  try {
    const config = await getTelegramConfig();
    if (config) {
      await sendTelegramMessage(
        config.botToken,
        order.telegramChatId,
        ui.orderRejected(order.orderCode, input.adminNote || null),
        {
          replyMarkup: getCommandKeyboard(false),
        },
      );
    }
  } catch (error) {
    console.error('Failed to send Telegram order rejection message:', error);
  }

  await writeAuditLog({
    userId: input.reviewedByUserId ?? null,
    action: 'TELEGRAM_ORDER_REJECTED',
    entity: 'TELEGRAM_ORDER',
    entityId: finalOrder.id,
    details: {
      orderCode: order.orderCode,
      reviewerName: input.reviewerName ?? null,
      kind: order.kind,
    },
  });

  return {
    orderId: finalOrder.id,
    orderCode: order.orderCode,
  };
}

function getDynamicKeyMessagingUrls(
  key: {
    dynamicUrl?: string | null;
    publicSlug?: string | null;
    name: string;
  },
  source?: string | null,
  lang?: SupportedLocale,
) {
  const sharePageUrl = key.publicSlug
    ? buildDynamicShortShareUrl(key.publicSlug, {
        source: source || undefined,
        lang,
      })
    : key.dynamicUrl
      ? buildDynamicSharePageUrl(key.dynamicUrl, {
          source: source || undefined,
          lang,
        })
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
  locale?: SupportedLocale;
}) {
  const config = await getTelegramConfig();
  if (!config) {
    throw new Error('Telegram bot is not configured.');
  }

  const key = await loadAccessKeyForMessaging(input.accessKeyId);
  if (!key) {
    throw new Error('Access key not found.');
  }

  if (!key.telegramDeliveryEnabled) {
    throw new Error('Telegram delivery is disabled for this key.');
  }

  const destinationChatId =
    (input.chatId ? String(input.chatId) : null) || resolveTelegramChatIdForKey(key);
  if (!destinationChatId) {
    throw new Error('This key is not linked to a Telegram chat yet.');
  }

  const token = await ensureAccessKeySubscriptionToken(key.id, key.subscriptionToken);
  const defaults = await getSubscriptionDefaults();
  const locale = await resolveTelegramLocaleForRecipient({
    telegramUserId: key.telegramId || null,
    telegramChatId: destinationChatId,
    fallbackLocale: input.locale || defaults.defaultLanguage,
  });
  const ui = getTelegramUi(locale);
  const sharePageUrl = key.publicSlug
    ? buildShortShareUrl(key.publicSlug, { source: input.source || 'telegram', lang: locale })
    : buildSharePageUrl(token, { source: input.source || 'telegram', lang: locale });
  const subscriptionUrl = buildSubscriptionApiUrl(token, { source: input.source || 'telegram' });
  const welcomeMessage =
    key.subscriptionWelcomeMessage?.trim() ||
    resolveTelegramTemplate(
      defaults.localizedWelcomeMessages,
      locale,
      defaults.welcomeMessage ?? undefined,
    );
  const supportLink = await getTelegramSupportLink();
  const salesSettings = await getTelegramSalesSettings();
  const reasonTitle = ui.accessReasonTitle(input.reason);

  const lines = [
    reasonTitle,
    '',
    `🔑 ${ui.keyLabel}: <b>${escapeHtml(key.name)}</b>`,
    `🖥 ${ui.serverLabel}: ${escapeHtml(key.server.name)}${key.server.countryCode ? ` ${getFlagEmoji(key.server.countryCode)}` : ''}`,
    `📈 ${ui.statusLineLabel}: ${escapeHtml(key.status)}`,
    `⏳ ${ui.expirationLabel}: ${escapeHtml(formatExpirationSummary(key, locale))}`,
    key.dataLimitBytes ? `📦 ${ui.quotaLabel}: ${formatBytes(key.usedBytes)} / ${formatBytes(key.dataLimitBytes)}` : `📦 ${ui.quotaLabel}: ${ui.unlimited}`,
    '',
    welcomeMessage ? escapeHtml(welcomeMessage) : ui.accessShareFallback,
    '',
    `🌐 ${ui.sharePageLabel}: ${sharePageUrl}`,
    `🔄 ${ui.subscriptionUrlLabel}: ${subscriptionUrl}`,
  ];

  const inlineKeyboard: Array<Array<{ text: string; url?: string; callback_data?: string }>> = [
    [{ text: ui.openSharePage, url: sharePageUrl }],
    [{ text: ui.openSubscriptionUrl, url: subscriptionUrl }],
  ];

  if (salesSettings.enabled && salesSettings.allowRenewals) {
    inlineKeyboard.push([
      {
        text: ui.orderActionRenewKey,
        callback_data: buildTelegramOrderActionCallbackData('ky', key.id),
      },
    ]);
  }

  if (supportLink) {
    inlineKeyboard.push([{ text: ui.getSupport, url: supportLink }]);
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
        ui.accessQrCaption,
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
  locale?: SupportedLocale;
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

  const defaults = await getSubscriptionDefaults();
  const locale = await resolveTelegramLocaleForRecipient({
    telegramUserId: key.telegramId || null,
    telegramChatId: destinationChatId,
    fallbackLocale: input.locale || defaults.defaultLanguage,
  });
  const ui = getTelegramUi(locale);
  const { sharePageUrl, subscriptionUrl, outlineClientUrl } = getDynamicKeyMessagingUrls(
    key,
    input.source || 'telegram',
    locale,
  );
  if (!subscriptionUrl || !outlineClientUrl) {
    throw new Error('This dynamic key does not have a usable client URL yet.');
  }

  const welcomeMessage =
    key.subscriptionWelcomeMessage?.trim() ||
    resolveTelegramTemplate(
      defaults.localizedWelcomeMessages,
      locale,
      defaults.welcomeMessage ?? undefined,
    );
  const supportLink = await getTelegramSupportLink();
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
      : ui.coverageAutoSelected;
  const reasonTitle = ui.dynamicReasonTitle(input.reason);

  const lines = [
    reasonTitle,
    '',
    `🔁 ${ui.keyLabel}: <b>${escapeHtml(key.name)}</b>`,
    `🧭 ${ui.modeLabel}: ${escapeHtml(key.type === 'SELF_MANAGED' ? ui.modeSelfManaged : ui.modeManual)}`,
    `🖥 ${ui.backendsLabel}: ${attachedCount} attached key(s)`,
    `🌍 ${ui.coverageLabel}: ${escapeHtml(coverageSummary)}`,
    `📈 ${ui.statusLineLabel}: ${escapeHtml(key.status)}`,
    `⏳ ${ui.expirationLabel}: ${escapeHtml(formatExpirationSummary(key, locale))}`,
    key.dataLimitBytes ? `📦 ${ui.quotaLabel}: ${formatBytes(key.usedBytes)} / ${formatBytes(key.dataLimitBytes)}` : `📦 ${ui.quotaLabel}: ${ui.unlimited}`,
    '',
    welcomeMessage
      ? escapeHtml(welcomeMessage)
      : key.sharePageEnabled
        ? ui.dynamicShareFallback
        : ui.dynamicShareDisabledFallback,
  ];

  if (key.sharePageEnabled && sharePageUrl) {
    lines.push('', `🌐 ${ui.sharePageLabel}: ${sharePageUrl}`);
  }

  lines.push(`🔄 ${ui.clientEndpointLabel}: ${subscriptionUrl}`);
  lines.push(`⚡ ${ui.outlineClientUrlLabel}: ${outlineClientUrl}`);

  const inlineKeyboard: Array<Array<{ text: string; url: string }>> = [];
  if (key.sharePageEnabled && sharePageUrl) {
    inlineKeyboard.push([{ text: ui.openSharePage, url: sharePageUrl }]);
  }
  inlineKeyboard.push([{ text: ui.openClientEndpoint, url: subscriptionUrl }]);

  if (supportLink) {
    inlineKeyboard.push([{ text: ui.getSupport, url: supportLink }]);
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
        ui.dynamicQrCaption,
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
    | 'EXPIRING_3D'
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

  if (!key.telegramDeliveryEnabled) {
    return null;
  }

  const destinationChatId = resolveTelegramChatIdForKey(key);
  if (!destinationChatId) {
    return null;
  }

  const { defaultLanguage } = await getSubscriptionDefaults();
  const supportLink = await getTelegramSupportLink();
  const locale = await resolveTelegramLocaleForRecipient({
    telegramUserId: key.telegramId || null,
    telegramChatId: destinationChatId,
    fallbackLocale: defaultLanguage,
  });
  const ui = getTelegramUi(locale);
  const includeSharePage = input.type === 'EXPIRING_7D' || input.type === 'EXPIRING_3D';
  const token = includeSharePage
    ? await ensureAccessKeySubscriptionToken(key.id, key.subscriptionToken)
    : null;
  const sharePageUrl = token
    ? (
        key.publicSlug
          ? buildShortShareUrl(key.publicSlug, { source: 'telegram_notification', lang: locale })
          : buildSharePageUrl(token, { source: 'telegram_notification', lang: locale })
      )
    : null;

  const lines =
    input.type === 'DISABLED'
      ? [
          ui.lifecycleDisabledTitle,
          '',
          `🔑 ${escapeHtml(key.name)}`,
          ui.lifecycleDisabledBody,
        ]
      : input.type === 'EXPIRING_7D'
        ? [
            ui.lifecycleExpiring7Title,
            '',
            `🔑 ${escapeHtml(key.name)}`,
            ui.lifecycleExpiring7Body(input.daysLeft ?? 7),
          ]
        : input.type === 'EXPIRING_3D'
          ? [
              ui.lifecycleExpiring3Title,
              '',
              `🔑 ${escapeHtml(key.name)}`,
              ui.lifecycleExpiring3Body(input.daysLeft ?? 3),
            ]
          : [
              ui.lifecycleExpiredTitle,
              '',
              `🔑 ${escapeHtml(key.name)}`,
              ui.lifecycleExpiredBody,
            ];

  if (sharePageUrl) {
    lines.push('', `${ui.sharePageLabel}: ${sharePageUrl}`);
  }
  if (supportLink) {
    lines.push(`${ui.supportLabel}: ${supportLink}`);
  }

  const buttons = sharePageUrl ? [[{ text: ui.openSharePage, url: sharePageUrl }]] : [];
  if (supportLink) {
    buttons.push([{ text: ui.getSupport, url: supportLink }]);
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

export async function sendAccessKeyRenewalReminder(input: {
  accessKeyId: string;
  chatId?: string | number | null;
  source?: string | null;
}) {
  const config = await getTelegramConfig();
  if (!config) {
    throw new Error('Telegram bot is not configured.');
  }

  const key = await loadAccessKeyForMessaging(input.accessKeyId);
  if (!key) {
    throw new Error('Access key not found.');
  }

  if (!key.telegramDeliveryEnabled) {
    throw new Error('Telegram delivery is disabled for this key.');
  }

  const destinationChatId =
    (input.chatId ? String(input.chatId) : null) || resolveTelegramChatIdForKey(key);
  if (!destinationChatId) {
    throw new Error('This key is not linked to a Telegram chat yet.');
  }

  const defaults = await getSubscriptionDefaults();
  const locale = await resolveTelegramLocaleForRecipient({
    telegramUserId: key.telegramId || null,
    telegramChatId: destinationChatId,
    fallbackLocale: defaults.defaultLanguage,
  });
  const ui = getTelegramUi(locale);
  const token = await ensureAccessKeySubscriptionToken(key.id, key.subscriptionToken);
  const sharePageUrl = key.publicSlug
    ? buildShortShareUrl(key.publicSlug, { source: input.source || 'renewal_reminder', lang: locale })
    : buildSharePageUrl(token, { source: input.source || 'renewal_reminder', lang: locale });
  const subscriptionUrl = buildSubscriptionApiUrl(token, { source: input.source || 'renewal_reminder' });
  const supportLink = await getTelegramSupportLink();

  const lines = locale === 'my'
    ? [
        '🔔 <b>သက်တမ်းတိုးခြင်း အသိပေးချက်</b>',
        '',
        `🔑 Key: <b>${escapeHtml(key.name)}</b>`,
        `🖥 Server: ${escapeHtml(key.server.name)}`,
        `⏳ လက်ရှိသက်တမ်း: ${escapeHtml(formatExpirationSummary(key, locale))}`,
        key.dataLimitBytes
          ? `📦 အသုံးပြုမှု: ${formatBytes(key.usedBytes)} / ${formatBytes(key.dataLimitBytes)}`
          : `📦 အသုံးပြုမှု: ${ui.unlimited}`,
        '',
        'သင့် key ကို ဆက်လက်အသုံးပြုလိုပါက administrator ထံ ဆက်သွယ်ပြီး သက်တမ်းတိုးနိုင်ပါသည်။',
        '',
        `🌐 Share page: ${sharePageUrl}`,
        `🔄 Subscription URL: ${subscriptionUrl}`,
      ]
    : [
        '🔔 <b>Renewal Reminder</b>',
        '',
        `🔑 Key: <b>${escapeHtml(key.name)}</b>`,
        `🖥 Server: ${escapeHtml(key.server.name)}`,
        `⏳ Current expiration: ${escapeHtml(formatExpirationSummary(key, locale))}`,
        key.dataLimitBytes
          ? `📦 Usage: ${formatBytes(key.usedBytes)} / ${formatBytes(key.dataLimitBytes)}`
          : `📦 Usage: ${ui.unlimited}`,
        '',
        'If you want to keep using this key, please contact your administrator to renew it.',
        '',
        `🌐 Share page: ${sharePageUrl}`,
        `🔄 Subscription URL: ${subscriptionUrl}`,
      ];

  const inlineKeyboard: Array<Array<{ text: string; url: string }>> = [
    [{ text: ui.openSharePage, url: sharePageUrl }],
  ];

  if (supportLink) {
    inlineKeyboard.push([{ text: ui.getSupport, url: supportLink }]);
  }

  await sendTelegramMessage(config.botToken, destinationChatId, lines.join('\n'), {
    replyMarkup: { inline_keyboard: inlineKeyboard },
  });

  await recordSubscriptionPageEvent({
    accessKeyId: key.id,
    eventType: SUBSCRIPTION_EVENT_TYPES.TELEGRAM_SENT,
    source: input.source || 'renewal_reminder',
    metadata: {
      destinationChatId,
      notificationType: 'RENEWAL_REMINDER',
    },
  });

  await writeAuditLog({
    action: 'ACCESS_KEY_RENEWAL_REMINDER_SENT',
    entity: 'ACCESS_KEY',
    entityId: key.id,
    details: {
      destinationChatId,
      sharePageUrl,
      subscriptionUrl,
    },
  });

  return {
    destinationChatId,
    sharePageUrl,
    subscriptionUrl,
  };
}

export async function sendAccessKeySupportMessage(input: {
  accessKeyId: string;
  message: string;
  chatId?: string | number | null;
  source?: string | null;
}) {
  const config = await getTelegramConfig();
  if (!config) {
    throw new Error('Telegram bot is not configured.');
  }

  const key = await loadAccessKeyForMessaging(input.accessKeyId);
  if (!key) {
    throw new Error('Access key not found.');
  }

  if (!key.telegramDeliveryEnabled) {
    throw new Error('Telegram delivery is disabled for this key.');
  }

  const trimmedMessage = input.message.trim();
  if (!trimmedMessage) {
    throw new Error('Support message cannot be empty.');
  }

  const destinationChatId =
    (input.chatId ? String(input.chatId) : null) || resolveTelegramChatIdForKey(key);
  if (!destinationChatId) {
    throw new Error('This key is not linked to a Telegram chat yet.');
  }

  const defaults = await getSubscriptionDefaults();
  const locale = await resolveTelegramLocaleForRecipient({
    telegramUserId: key.telegramId || null,
    telegramChatId: destinationChatId,
    fallbackLocale: defaults.defaultLanguage,
  });
  const ui = getTelegramUi(locale);
  const token = await ensureAccessKeySubscriptionToken(key.id, key.subscriptionToken);
  const sharePageUrl = key.publicSlug
    ? buildShortShareUrl(key.publicSlug, { source: input.source || 'support_message', lang: locale })
    : buildSharePageUrl(token, { source: input.source || 'support_message', lang: locale });

  const lines = locale === 'my'
    ? [
        '💬 <b>Administrator မှ စာပို့ထားပါသည်</b>',
        '',
        `🔑 Key: <b>${escapeHtml(key.name)}</b>`,
        '',
        escapeHtml(trimmedMessage),
        '',
        `🌐 Share page: ${sharePageUrl}`,
      ]
    : [
        '💬 <b>Message from your administrator</b>',
        '',
        `🔑 Key: <b>${escapeHtml(key.name)}</b>`,
        '',
        escapeHtml(trimmedMessage),
        '',
        `🌐 Share page: ${sharePageUrl}`,
      ];

  await sendTelegramMessage(config.botToken, destinationChatId, lines.join('\n'), {
    replyMarkup: {
      inline_keyboard: [[{ text: ui.openSharePage, url: sharePageUrl }]],
    },
  });

  await recordSubscriptionPageEvent({
    accessKeyId: key.id,
    eventType: SUBSCRIPTION_EVENT_TYPES.TELEGRAM_SENT,
    source: input.source || 'support_message',
    metadata: {
      destinationChatId,
      notificationType: 'SUPPORT_MESSAGE',
    },
  });

  await writeAuditLog({
    action: 'ACCESS_KEY_SUPPORT_MESSAGE_SENT',
    entity: 'ACCESS_KEY',
    entityId: key.id,
    details: {
      destinationChatId,
      message: trimmedMessage,
      sharePageUrl,
    },
  });

  return {
    destinationChatId,
    sharePageUrl,
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

  const locale = await getTelegramDefaultLocale();
  const ui = getTelegramUi(locale);
  const token = await ensureAccessKeySubscriptionToken(key.id, key.subscriptionToken);
  const sharePageUrl = key.publicSlug
    ? buildShortShareUrl(key.publicSlug, { source: 'telegram_renew_request', lang: locale })
    : buildSharePageUrl(token, { source: 'telegram_renew_request', lang: locale });
  const message = [
    locale === 'my' ? '🔁 <b>Telegram မှ သက်တမ်းတိုးရန် တောင်းဆိုထားပါသည်</b>' : '🔁 <b>Renewal requested from Telegram</b>',
    '',
    `${ui.requesterLabel}: <b>${escapeHtml(input.requesterName)}</b>`,
    `${ui.telegramIdLabel}: <code>${escapeHtml(input.requesterTelegramId)}</code>`,
    `${ui.keyLabel}: <b>${escapeHtml(key.name)}</b>`,
    `${ui.serverLabel}: ${escapeHtml(key.server.name)}`,
    key.email ? `${ui.emailLabel}: ${escapeHtml(key.email)}` : '',
    '',
    `${ui.sharePageLabel}: ${sharePageUrl}`,
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
  localeOverride?: SupportedLocale,
): Promise<string | null> {
  const trimmedArgs = argsText.trim();
  const config = await getTelegramConfig();
  const profile = await getTelegramUserProfile(String(telegramUserId), String(chatId));

  if (
    config?.showLanguageSelectorOnStart !== false &&
    !localeOverride &&
    !coerceSupportedLocale(profile?.locale)
  ) {
    await sendTelegramMessage(
      botToken,
      chatId,
      buildTelegramLocaleSelectorMessage('start'),
      {
        replyMarkup: buildTelegramLocaleSelectorKeyboard('start', trimmedArgs || undefined),
      },
    );
    return null;
  }

  const locale =
    localeOverride ||
    coerceSupportedLocale(profile?.locale) ||
    config?.defaultLanguage ||
    (await getTelegramDefaultLocale());
  const ui = getTelegramUi(locale);

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
        ui.startLinked(escapeHtml(username)),
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
        ? ui.linkExpired
        : ui.linkInvalid;

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
      ui.welcomeBack(escapeHtml(username)),
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
      ui.accountLinked(escapeHtml(username)),
      {
        replyMarkup: getCommandKeyboard(isAdmin),
      },
    );
    return null;
  }

  const adminMsg = isAdmin ? ui.adminRecognized : '';
  const welcomeMessage = resolveTelegramTemplate(
    config?.localizedWelcomeMessages,
    locale,
    config?.welcomeMessage || ui.defaultWelcome,
  );

  await sendTelegramMessage(
    botToken,
    chatId,
    ui.hello(escapeHtml(username), escapeHtml(welcomeMessage), telegramUserId, adminMsg),
    {
      replyMarkup: getCommandKeyboard(isAdmin),
    },
  );
  return null;
}

async function handleEmailLink(
  chatId: number,
  telegramUserId: number,
  email: string,
  locale: SupportedLocale,
) {
  const ui = getTelegramUi(locale);
  const keys = await db.accessKey.findMany({
    where: {
      email: email.toLowerCase(),
      status: { in: ['ACTIVE', 'PENDING', 'DISABLED'] },
    },
  });

  if (keys.length === 0) {
    return ui.emailNoKeys(escapeHtml(email));
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

  return ui.emailLinked(keys.length);
}

async function handleUsageCommand(
  chatId: number,
  telegramUserId: number,
  botToken: string,
  locale: SupportedLocale,
): Promise<string> {
  const ui = getTelegramUi(locale);
  const keys = await findLinkedAccessKeys(chatId, telegramUserId, false);

  if (keys.length === 0) {
    const config = await getTelegramConfig();
    return resolveTelegramTemplate(
      config?.localizedKeyNotFoundMessages,
      locale,
      config?.keyNotFoundMessage || ui.keyNotFoundDefault,
    );
  }

  let response = ui.usageTitle;

  for (const key of keys) {
    const usedBytes = Number(key.usedBytes);
    const limitBytes = key.dataLimitBytes ? Number(key.dataLimitBytes) : null;
    const usageText = limitBytes
      ? `${formatBytes(key.usedBytes)} / ${formatBytes(key.dataLimitBytes!)} (${Math.round((usedBytes / limitBytes) * 100)}%)`
      : `${formatBytes(key.usedBytes)} / Unlimited`;

    response += `${key.status === 'ACTIVE' ? '🟢' : '🔵'} <b>${escapeHtml(key.name)}</b>\n`;
    response += `   📡 ${escapeHtml(key.server.name)}${key.server.countryCode ? ` ${getFlagEmoji(key.server.countryCode)}` : ''}\n`;
    response += `   📈 ${usageText}\n`;
    response += `   ⏳ ${escapeHtml(formatExpirationSummary(key, locale))}\n\n`;

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

async function handleMyKeysCommand(
  chatId: number,
  telegramUserId: number,
  locale: SupportedLocale,
  botToken: string,
): Promise<string | null> {
  const ui = getTelegramUi(locale);
  const keys = await findLinkedAccessKeys(chatId, telegramUserId, true);

  if (keys.length === 0) {
    return ui.myKeysEmpty;
  }

  const lines = [ui.myKeysTitle, ''];

  for (const key of keys) {
    const token = await ensureAccessKeySubscriptionToken(key.id, key.subscriptionToken);
    const sharePageUrl = key.publicSlug
      ? buildShortShareUrl(key.publicSlug, { source: 'telegram_mykeys', lang: locale })
      : buildSharePageUrl(token, { source: 'telegram_mykeys', lang: locale });
    lines.push(
      `• <b>${escapeHtml(key.name)}</b>`,
      `  ${ui.idLabel}: <code>${key.id}</code>`,
      `  ${ui.statusLineLabel}: ${escapeHtml(key.status)}`,
      `  ${ui.serverLabel}: ${escapeHtml(key.server.name)}`,
      `  ${ui.sharePageLabel}: ${sharePageUrl}`,
      '',
    );
  }

  lines.push(ui.myKeysRenewHint);
  const message = lines.join('\n');
  const sent = await sendTelegramMessage(botToken, chatId, message, {
    replyMarkup: {
      inline_keyboard: keys.slice(0, 8).map((key) => [
        {
          text: truncateTelegramButtonLabel(`${ui.orderActionRenewKey}: ${key.name}`, 38),
          callback_data: buildTelegramOrderActionCallbackData('ky', key.id),
        },
      ]),
    },
  });

  return sent ? null : message;
}

async function handleSubscriptionLinksCommand(
  chatId: number,
  telegramUserId: number,
  locale: SupportedLocale,
): Promise<string> {
  const ui = getTelegramUi(locale);
  const keys = await findLinkedAccessKeys(chatId, telegramUserId, false);

  if (keys.length === 0) {
    return ui.subEmpty;
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

  return ui.subSent(keys.length);
}

async function handleSupportCommand(locale: SupportedLocale): Promise<string> {
  const ui = getTelegramUi(locale);
  const supportLink = await getTelegramSupportLink();

  if (!supportLink) {
    return ui.noSupportLink;
  }

  return `${ui.supportLabel}: ${supportLink}`;
}

async function handleUserServerCommand(
  chatId: number,
  telegramUserId: number,
  locale: SupportedLocale,
): Promise<string> {
  const ui = getTelegramUi(locale);
  const keys = await findLinkedAccessKeys(chatId, telegramUserId, true);

  if (keys.length === 0) {
    return ui.myKeysEmpty;
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

  const lines = [ui.serversTitle, ''];
  for (const server of Array.from(grouped.values())) {
    lines.push(
      `• ${escapeHtml(server.name)}${server.countryCode ? ` ${getFlagEmoji(server.countryCode)}` : ''}`,
      `  ${ui.keysLabel}: ${server.keyCount} total, ${server.activeCount} active`,
      '',
    );
  }

  return lines.join('\n');
}

async function handleStatusCommand(locale: SupportedLocale): Promise<string> {
  const ui = getTelegramUi(locale);
  const servers = await db.server.findMany({
    where: { isActive: true },
    include: { healthCheck: true, _count: { select: { accessKeys: true } } },
  });

  if (servers.length === 0) return ui.statusNoServers;

  let response = ui.statusTitle;

  for (const server of servers) {
    const status = server.healthCheck?.lastStatus || 'UNKNOWN';
    const statusEmoji =
      status === 'UP' ? '🟢' : status === 'DOWN' ? '🔴' : status === 'SLOW' ? '🟡' : '⚪';
    const latency = server.healthCheck?.lastLatencyMs;
    const uptime = server.healthCheck?.uptimePercent?.toFixed(1) || '-';

    response += `${statusEmoji} <b>${escapeHtml(server.name)}</b>\n`;
    response += `   • ${ui.statusLabel}: ${status}\n`;
    response += `   • ${ui.latencyLabel}: ${latency ? `${latency}ms` : '-'}\n`;
    response += `   • ${ui.uptimeLabel}: ${uptime}%\n`;
    response += `   • ${ui.keysLabel}: ${server._count.accessKeys}\n\n`;
  }

  return response;
}

async function handleExpiringCommand(argsText: string, locale: SupportedLocale): Promise<string> {
  const ui = getTelegramUi(locale);
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
    return ui.expiringNone(days);
  }

  const lines = [ui.expiringTitle(days), ''];
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

async function handleFindCommand(argsText: string, locale: SupportedLocale): Promise<string> {
  const ui = getTelegramUi(locale);
  const query = argsText.trim();
  if (!query) {
    return ui.findUsage;
  }

  const result = await resolveAdminKeyQuery(query);

  if (result.kind === 'single') {
    const key = result.key;
    return [
      ui.findKeyFound,
      '',
      `Name: <b>${escapeHtml(key.name)}</b>`,
      `${ui.idLabel}: <code>${key.id}</code>`,
      `Outline ID: <code>${escapeHtml(key.outlineKeyId)}</code>`,
      `${ui.statusLineLabel}: ${escapeHtml(key.status)}`,
      `${ui.serverLabel}: ${escapeHtml(key.server.name)}`,
      key.email ? `${ui.emailLabel}: ${escapeHtml(key.email)}` : '',
      key.telegramId ? `Telegram: <code>${escapeHtml(key.telegramId)}</code>` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (result.kind === 'many') {
    if (result.matches.length === 0) {
      return ui.findNoMatches(escapeHtml(query));
    }

    return [
      ui.findMatches(escapeHtml(query)),
      '',
        ...result.matches.flatMap((key) => [
          `• <b>${escapeHtml(key.name)}</b>`,
          `  ${ui.idLabel}: <code>${key.id}</code>`,
          `  ${ui.statusLineLabel}: ${escapeHtml(key.status)} • ${escapeHtml(key.server.name)}`,
          '',
        ]),
    ].join('\n');
  }

  return ui.findProvideQuery;
}

async function handleAdminToggleCommand(
  argsText: string,
  enable: boolean,
  locale: SupportedLocale,
): Promise<string> {
  const ui = getTelegramUi(locale);
  const query = argsText.trim();
  if (!query) {
    return enable ? ui.enableUsage : ui.disableUsage;
  }

  const result = await resolveAdminKeyQuery(query);
  if (result.kind !== 'single') {
    if (result.kind === 'many' && result.matches.length > 0) {
      return [
        ui.multiMatchUseIds,
        '',
        ...result.matches.map((key) => `• <code>${key.id}</code> — ${escapeHtml(key.name)}`),
      ].join('\n');
    }

    return ui.keyNotFound;
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
    ? ui.keyEnabled(escapeHtml(updatedKey.name))
    : ui.keyDisabled(escapeHtml(updatedKey.name));
}

async function handleResendCommand(argsText: string, locale: SupportedLocale): Promise<string> {
  const ui = getTelegramUi(locale);
  const query = argsText.trim();
  if (!query) {
    return ui.resendUsage;
  }

  const result = await resolveAdminKeyQuery(query);
  if (result.kind !== 'single') {
    if (result.kind === 'many' && result.matches.length > 0) {
      return [
        ui.resendMulti,
        '',
        ...result.matches.map((key) => `• <code>${key.id}</code> — ${escapeHtml(key.name)}`),
      ].join('\n');
    }

    return ui.keyNotFound;
  }

  try {
    await sendAccessKeySharePageToTelegram({
      accessKeyId: result.key.id,
      reason: 'RESENT',
      source: 'telegram_admin_resend',
      includeQr: true,
    });
  } catch (error) {
    return ui.resendFailed(escapeHtml((error as Error).message));
  }

  return ui.resendSuccess(escapeHtml(result.key.name));
}

async function handleSysInfoCommand(
  chatId: number,
  botToken: string,
  locale: SupportedLocale,
): Promise<string> {
  const ui = getTelegramUi(locale);
  await sendTelegramMessage(botToken, chatId, ui.sysinfoGathering);

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
      ui.sysinfoTitle,
      '',
      `<b>${ui.sysinfoOs}:</b> ${escapeHtml(`${osInfo.distro} ${osInfo.release}`)}`,
      `<b>${ui.sysinfoCpu}:</b> ${cpu.currentLoad.toFixed(1)}%`,
      `<b>${ui.sysinfoMemory}:</b> ${formatBytes(BigInt(mem.active))} / ${formatBytes(BigInt(mem.total))} (${((mem.active / mem.total) * 100).toFixed(1)}%)`,
      `<b>${ui.sysinfoDisk}:</b> ${formatBytes(BigInt(usedDisk))} / ${formatBytes(BigInt(totalDisk))} (${usedDiskPercent.toFixed(1)}%)`,
    ].join('\n');
  } catch (error) {
    console.error('Sysinfo error:', error);
    return ui.sysinfoFailed;
  }
}

async function handleBackupCommand(
  chatId: number,
  botToken: string,
  locale: SupportedLocale,
): Promise<string | null> {
  const ui = getTelegramUi(locale);
  await sendTelegramMessage(botToken, chatId, ui.backupCreating);

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
      ui.backupCaption(new Date().toLocaleString()),
    );

    return null;
  } catch (error) {
    console.error('Backup error:', error);
    return ui.backupFailed(escapeHtml((error as Error).message));
  }
}

async function handleHelpCommand(
  chatId: number,
  botToken: string,
  isAdmin: boolean,
  locale: SupportedLocale,
): Promise<null> {
  const isMyanmar = locale === 'my';
  let message = isMyanmar
    ? `📚 <b>အသုံးပြုနိုင်သော Command များ</b>

/start - Telegram account ကို ချိတ်ဆက်မည်
/language - ဘာသာစကား ပြောင်းမည်
/buy - Plan ရွေးပြီး key အသစ် မှာယူမည်
/orders - မိမိ order များကို ကြည့်မည်
/order [code] - order အခြေအနေ အသေးစိတ်ကြည့်မည်
/usage - အသုံးပြုမှုနှင့် QR/setup အချက်အလက်ကို ရယူမည်
/mykeys - ချိတ်ထားသော key များနှင့် ID များကို ကြည့်မည်
/sub - Share page များကို လက်ခံမည်
/support - သတ်မှတ်ထားသော support link ကို ကြည့်မည်
/server - သင့် key များအတွက် server များကို ကြည့်မည်
/renew - ရှိပြီးသော key ကို plan အလိုက် သက်တမ်းတိုးမည်
/cancel - လက်ရှိ order ကို ပယ်ဖျက်မည်
/help - ဤ help စာမျက်နှာကို ပြမည်`
    : `📚 <b>Available Commands</b>

/start - Link your Telegram account
/language - Change the bot language
/buy - Start a new key order
/orders - Show your recent orders
/order [code] - Show one order status
/usage - Fetch your usage and QR/setup info
/mykeys - List linked keys and IDs
/sub - Receive your share pages
/support - Show the configured support link
/server - Show the servers behind your keys
/renew - Renew one of your existing keys
/cancel - Cancel the current order
/help - Show this help message`;

  if (isAdmin) {
    message += isMyanmar
      ? `\n\n<b>Admin Commands</b>
/status - Server အခြေအနေအနှစ်ချုပ်
/expiring [days] - မကြာမီ သက်တမ်းကုန်မည့် key များ
/find &lt;query&gt; - Key ကို ရှာမည်
/disable &lt;key-id&gt; - Key ကို ပိတ်မည်
/enable &lt;key-id&gt; - Key ကို ပြန်ဖွင့်မည်
/resend &lt;key-id&gt; - Share page ကို ပြန်ပို့မည်
/sysinfo - System resource usage
/backup - Backup ဖန်တီးပြီး ဒေါင်းလုဒ်ဆွဲမည်`
      : `\n\n<b>Admin Commands</b>
/status - Server status summary
/expiring [days] - Keys expiring soon
/find &lt;query&gt; - Search for a key
/disable &lt;key-id&gt; - Disable a key
/enable &lt;key-id&gt; - Re-enable a key
/resend &lt;key-id&gt; - Resend the share page
/sysinfo - System resource usage
/backup - Create and download a backup`;
  }

  message += isMyanmar
    ? `\n\nဤ Telegram account ကို ချိတ်ရန် သင့် email ကိုလည်း တိုက်ရိုက် ပို့နိုင်ပါသည်။`
    : `\n\nYou can also send your email address directly to link this Telegram account.`;

  await sendTelegramMessage(botToken, chatId, message, {
    replyMarkup: getCommandKeyboard(isAdmin),
  });

  return null;
}

async function handleLanguageCommand(
  chatId: number,
  botToken: string,
): Promise<null> {
  await sendTelegramMessage(
    botToken,
    chatId,
    buildTelegramLocaleSelectorMessage('switch'),
    {
      replyMarkup: buildTelegramLocaleSelectorKeyboard('switch'),
    },
  );

  return null;
}

async function handleTelegramCallbackQuery(
  callbackQuery: TelegramCallbackQuery,
  config: TelegramConfig,
) {
  const parsed = parseTelegramLocaleCallbackData(callbackQuery.data);
  const chatId = callbackQuery.message?.chat.id;
  if (!chatId) {
    await answerTelegramCallbackQuery(
      config.botToken,
      callbackQuery.id,
      'Unsupported action',
    );
    return null;
  }

  const isAdmin =
    config.adminChatIds.includes(String(callbackQuery.from.id)) ||
    config.adminChatIds.includes(String(chatId));

  if (!parsed) {
    const userOrderAction = parseTelegramOrderActionCallbackData(callbackQuery.data);
    if (userOrderAction) {
      const locale = await getTelegramConversationLocale({
        telegramUserId: callbackQuery.from.id,
        telegramChatId: chatId,
      });
      const ui = getTelegramUi(locale);

      try {
        switch (userOrderAction.action) {
          case 'ky': {
            const settings = await getTelegramSalesSettings();
            if (!settings.enabled || !settings.allowRenewals) {
              await answerTelegramCallbackQuery(config.botToken, callbackQuery.id, ui.renewDisabled);
              return null;
            }

            const existing = await getActiveTelegramOrder(chatId, callbackQuery.from.id);
            if (existing?.status === 'PENDING_REVIEW') {
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.activeOrderPendingReview(existing.orderCode),
              );
              return null;
            }

            const keys = await findLinkedAccessKeys(chatId, callbackQuery.from.id, true);
            const matchedKey = keys.find((key) => key.id === userOrderAction.primary);
            if (!matchedKey) {
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.invalidRenewChoice,
              );
              return null;
            }

            await cancelStaleTelegramConversationOrders(chatId, callbackQuery.from.id);
            const order = await createTelegramOrderRecord({
              kind: 'RENEW',
              chatId,
              telegramUserId: callbackQuery.from.id,
              telegramUsername: callbackQuery.from.username || callbackQuery.from.first_name,
              locale,
              initialStatus: 'AWAITING_PLAN',
              targetAccessKeyId: matchedKey.id,
            });

            const enabledPlans = await listAvailableTelegramPlansForOrder({
              kind: 'RENEW',
              chatId,
              telegramUserId: callbackQuery.from.id,
              settings,
            });
            const lines = [
              ui.orderPlanPrompt(order.orderCode),
              `${ui.renewalTargetLabel}: <b>${escapeHtml(matchedKey.name)}</b>`,
              '',
              ...enabledPlans.map((plan, index) => {
                const label = resolveTelegramSalesPlanLabel(plan, locale);
                const price = resolveTelegramSalesPriceLabel(plan, locale);
                return `${index + 1}. ${label}${price ? ` - ${price}` : ''}`;
              }),
            ];

            await sendTelegramMessage(
              config.botToken,
              chatId,
              buildTelegramSalesPlanPromptText(locale, lines),
              {
                replyMarkup: buildTelegramPlanSelectionKeyboard({
                  orderId: order.id,
                  plans: enabledPlans,
                  locale,
                }),
              },
            );

            await answerTelegramCallbackQuery(
              config.botToken,
              callbackQuery.id,
              ui.orderActionSelectedKey(matchedKey.name),
            );
            return null;
          }
          case 'pl': {
            const order = await findTelegramOrderByIdForUser({
              orderId: userOrderAction.primary,
              chatId,
              telegramUserId: callbackQuery.from.id,
            });
            if (!order) {
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.orderActionStatusMissing,
              );
              return null;
            }

            const settings = await getTelegramSalesSettings();
            const plan = userOrderAction.secondary
              ? resolveTelegramSalesPlan(settings, userOrderAction.secondary as TelegramSalesPlanCode)
              : null;
            if (!plan || !plan.enabled) {
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.invalidPlanChoice,
              );
              return null;
            }

            if (
              order.kind === 'NEW' &&
              plan.code === 'trial_1d_3gb' &&
              !(await isEligibleForTelegramFreeTrial(chatId, callbackQuery.from.id))
            ) {
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.freeTrialUnavailable,
              );
              return null;
            }

            const planLabel = resolveTelegramSalesPlanLabel(plan, locale);
            const priceLabel = resolveTelegramSalesPriceLabel(plan, locale);

            if (plan.unlimitedQuota && !plan.fixedDurationMonths) {
              await db.telegramOrder.update({
                where: { id: order.id },
                data: {
                  planCode: plan.code,
                  planName: priceLabel ? `${planLabel} (${priceLabel})` : planLabel,
                  priceAmount: plan.priceAmount ?? null,
                  priceCurrency: plan.priceCurrency || null,
                  priceLabel: priceLabel || null,
                  templateId: plan.templateId || null,
                  durationDays: null,
                  dataLimitBytes: null,
                  unlimitedQuota: true,
                  status: 'AWAITING_MONTHS',
                },
              });

              await sendTelegramMessage(config.botToken, chatId, ui.orderMonthsPrompt, {
                replyMarkup: buildTelegramOrderActionKeyboard({
                  order: {
                    id: order.id,
                    status: 'AWAITING_MONTHS',
                  },
                  locale,
                }),
              });
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.orderActionSelectedPlan(planLabel),
              );
              return null;
            }

            const durationMonths = plan.fixedDurationMonths ?? plan.minDurationMonths ?? null;
            const durationDays = plan.fixedDurationDays ?? null;
            const dataLimitBytes = plan.dataLimitGB
              ? BigInt(plan.dataLimitGB) * BigInt(1024 * 1024 * 1024)
              : null;
            const enabledPaymentMethods = listEnabledTelegramSalesPaymentMethods(settings);
            const nextStatus =
              order.kind === 'NEW'
                ? 'AWAITING_SERVER_SELECTION'
                : enabledPaymentMethods.length > 0
                  ? 'AWAITING_PAYMENT_METHOD'
                  : 'AWAITING_PAYMENT_PROOF';
            const nextOrder = await db.telegramOrder.update({
              where: { id: order.id },
              data: {
                planCode: plan.code,
                planName: priceLabel ? `${planLabel} (${priceLabel})` : planLabel,
                priceAmount: plan.priceAmount ?? null,
                priceCurrency: plan.priceCurrency || null,
                priceLabel: priceLabel || null,
                templateId: plan.templateId || null,
                durationMonths,
                durationDays,
                dataLimitBytes,
                unlimitedQuota: plan.unlimitedQuota,
                status: nextStatus,
                ...buildTelegramOrderPaymentStageFields({
                  nextStatus,
                  currentStatus: order.status,
                  paymentStageEnteredAt: order.paymentStageEnteredAt,
                  paymentReminderSentAt: order.paymentReminderSentAt,
                }),
              },
            });

            if (nextStatus === 'AWAITING_SERVER_SELECTION') {
              const servers = await listAssignableTelegramOrderServers();
              await sendTelegramMessage(
                config.botToken,
                chatId,
                buildTelegramServerSelectionPromptText({
                  orderCode: nextOrder.orderCode,
                  locale,
                  servers,
                }),
                {
                  replyMarkup: buildTelegramServerSelectionKeyboard({
                    orderId: nextOrder.id,
                    locale,
                    servers,
                  }),
                },
              );
            } else if (nextStatus === 'AWAITING_PAYMENT_METHOD') {
              const renewalTarget = nextOrder.targetAccessKeyId
                ? await db.accessKey.findUnique({
                    where: { id: nextOrder.targetAccessKeyId },
                    select: { name: true },
                  })
                : null;
              await sendTelegramMessage(
                config.botToken,
                chatId,
                buildTelegramPaymentMethodSelectionPromptText({
                  orderCode: nextOrder.orderCode,
                  locale,
                  methods: enabledPaymentMethods,
                  planSummary: formatTelegramSalesPlanSummary(plan, durationMonths, locale),
                  renewalTargetName: renewalTarget?.name || null,
                }),
                {
                  replyMarkup: buildTelegramPaymentMethodSelectionKeyboard({
                    orderId: nextOrder.id,
                    locale,
                    methods: enabledPaymentMethods,
                  }),
                },
              );
            } else {
              const renewalTarget = nextOrder.targetAccessKeyId
                ? await db.accessKey.findUnique({
                    where: { id: nextOrder.targetAccessKeyId },
                    select: { name: true },
                  })
                : null;
              const planSummary = formatTelegramSalesPlanSummary(plan, durationMonths, locale);
              await sendTelegramMessage(
                config.botToken,
                chatId,
                buildTelegramSalesPaymentPrompt({
                  locale,
                  orderCode: nextOrder.orderCode,
                  planSummary,
                  paymentInstructions: resolveTelegramSalesPaymentInstructions(settings, locale),
                  paymentMethods: listEnabledTelegramSalesPaymentMethods(settings),
                  renewalTargetName: renewalTarget?.name || null,
                  supportLink: await getTelegramSupportLink(),
                }),
                {
                  replyMarkup: buildTelegramOrderActionKeyboard({
                    order: nextOrder,
                    locale,
                  }),
                },
              );
            }

            await answerTelegramCallbackQuery(
              config.botToken,
              callbackQuery.id,
              ui.orderActionSelectedPlan(planLabel),
            );
            return null;
          }
          case 'sv': {
            const order = await findTelegramOrderByIdForUser({
              orderId: userOrderAction.primary,
              chatId,
              telegramUserId: callbackQuery.from.id,
            });
            if (!order) {
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.orderActionStatusMissing,
              );
              return null;
            }
            if (order.status !== 'AWAITING_SERVER_SELECTION') {
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.invalidServerChoice,
              );
              return null;
            }

            const servers = await listAssignableTelegramOrderServers();
            const selectedServer =
              userOrderAction.secondary === 'auto'
                ? null
                : servers.find((server) => server.id === userOrderAction.secondary);

            if (userOrderAction.secondary !== 'auto' && !selectedServer) {
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.invalidServerChoice,
              );
              return null;
            }

            const nextOrder = await db.telegramOrder.update({
              where: { id: order.id },
              data: {
                selectedServerId: selectedServer?.id ?? null,
                selectedServerName: selectedServer?.name ?? null,
                selectedServerCountryCode: selectedServer?.countryCode ?? null,
                status: 'AWAITING_KEY_NAME',
              },
            });

            await sendTelegramMessage(config.botToken, chatId, ui.orderNamePrompt, {
              replyMarkup: buildTelegramOrderActionKeyboard({
                order: nextOrder,
                locale,
              }),
            });

            await answerTelegramCallbackQuery(
              config.botToken,
              callbackQuery.id,
              ui.orderActionSelectedServer(
                selectedServer ? formatTelegramServerChoiceLabel(selectedServer, ui) : ui.serverAutoSelect,
              ),
            );
            return null;
          }
          case 'pm': {
            const order = await findTelegramOrderByIdForUser({
              orderId: userOrderAction.primary,
              chatId,
              telegramUserId: callbackQuery.from.id,
            });
            if (!order) {
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.orderActionStatusMissing,
              );
              return null;
            }

            const salesSettings = await getTelegramSalesSettings();
            const paymentMethods = listEnabledTelegramSalesPaymentMethods(salesSettings);
            if (paymentMethods.length === 0) {
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.orderActionNotReadyForPayment,
              );
              return null;
            }

            if (!userOrderAction.secondary) {
              const plan = order.planCode
                ? resolveTelegramSalesPlan(salesSettings, order.planCode as TelegramSalesPlanCode)
                : null;
              const renewalTarget = order.targetAccessKeyId
                ? await db.accessKey.findUnique({
                    where: { id: order.targetAccessKeyId },
                    select: { name: true },
                  })
                : null;
              const planSummary = plan
                ? formatTelegramSalesPlanSummary(plan, order.durationMonths, locale)
                : order.planName || '';

              await sendTelegramMessage(
                config.botToken,
                chatId,
                buildTelegramPaymentMethodSelectionPromptText({
                  orderCode: order.orderCode,
                  locale,
                  methods: paymentMethods,
                  planSummary,
                  requestedName: order.requestedName,
                  renewalTargetName: renewalTarget?.name || null,
                  selectedServerName: order.selectedServerName,
                }),
                {
                  replyMarkup: buildTelegramPaymentMethodSelectionKeyboard({
                    orderId: order.id,
                    locale,
                    methods: paymentMethods,
                  }),
                },
              );
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.orderActionSent,
              );
              return null;
            }

            if (
              order.status !== 'AWAITING_PAYMENT_METHOD' &&
              order.status !== 'AWAITING_PAYMENT_PROOF'
            ) {
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.invalidPaymentMethodChoice,
              );
              return null;
            }

            const selectedMethod = paymentMethods.find(
              (method) => method.code === userOrderAction.secondary,
            );
            if (!selectedMethod) {
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.invalidPaymentMethodChoice,
              );
              return null;
            }

            const nextOrder = await db.telegramOrder.update({
              where: { id: order.id },
              data: {
                paymentMethodCode: selectedMethod.code,
                paymentMethodLabel: resolveTelegramSalesPaymentMethodLabel(selectedMethod, locale),
                paymentMethodAccountName: selectedMethod.accountName?.trim() || null,
                paymentMethodAccountNumber: selectedMethod.accountNumber?.trim() || null,
                status: 'AWAITING_PAYMENT_PROOF',
                ...buildTelegramOrderPaymentStageFields({
                  nextStatus: 'AWAITING_PAYMENT_PROOF',
                  currentStatus: order.status,
                  paymentStageEnteredAt: order.paymentStageEnteredAt,
                  paymentReminderSentAt: order.paymentReminderSentAt,
                }),
              },
            });

            const plan = nextOrder.planCode
              ? resolveTelegramSalesPlan(salesSettings, nextOrder.planCode as TelegramSalesPlanCode)
              : null;
            const renewalTarget = nextOrder.targetAccessKeyId
              ? await db.accessKey.findUnique({
                  where: { id: nextOrder.targetAccessKeyId },
                  select: { name: true },
                })
              : null;
            const planSummary = plan
              ? formatTelegramSalesPlanSummary(plan, nextOrder.durationMonths, locale)
              : nextOrder.planName || '';

            await sendTelegramMessage(
              config.botToken,
              chatId,
              buildTelegramSalesPaymentPrompt({
                locale,
                orderCode: nextOrder.orderCode,
                planSummary,
                paymentInstructions: resolveTelegramSalesPaymentInstructions(salesSettings, locale),
                paymentMethod: selectedMethod,
                selectedServerName: nextOrder.selectedServerName,
                requestedName: nextOrder.requestedName,
                renewalTargetName: renewalTarget?.name || null,
                supportLink: await getTelegramSupportLink(),
              }),
              {
                replyMarkup: buildTelegramOrderActionKeyboard({
                  order: nextOrder,
                  locale,
                }),
              },
            );

            await answerTelegramCallbackQuery(
              config.botToken,
              callbackQuery.id,
              ui.orderActionSelectedPaymentMethod(
                resolveTelegramSalesPaymentMethodLabel(selectedMethod, locale),
              ),
            );
            return null;
          }
          case 'pay':
          case 'up': {
            const order = await findTelegramOrderByIdForUser({
              orderId: userOrderAction.primary,
              chatId,
              telegramUserId: callbackQuery.from.id,
            });
            if (!order) {
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.orderActionStatusMissing,
              );
              return null;
            }
            if (
              order.status !== 'AWAITING_PAYMENT_METHOD' &&
              order.status !== 'AWAITING_PAYMENT_PROOF'
            ) {
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.orderActionNotReadyForPayment,
              );
              return null;
            }

            const salesSettings = await getTelegramSalesSettings();
            const plan = order.planCode
              ? resolveTelegramSalesPlan(salesSettings, order.planCode as TelegramSalesPlanCode)
              : null;
            const renewalTarget = order.targetAccessKeyId
              ? await db.accessKey.findUnique({
                  where: { id: order.targetAccessKeyId },
                  select: { name: true },
                })
              : null;
            const planSummary = plan
              ? formatTelegramSalesPlanSummary(plan, order.durationMonths, locale)
              : order.planName || '';
            const selectedPaymentMethod = resolveTelegramSalesPaymentMethod(
              salesSettings,
              order.paymentMethodCode,
            );

            if (order.status === 'AWAITING_PAYMENT_METHOD' || !selectedPaymentMethod) {
              const paymentMethods = listEnabledTelegramSalesPaymentMethods(salesSettings);
              await sendTelegramMessage(
                config.botToken,
                chatId,
                buildTelegramPaymentMethodSelectionPromptText({
                  orderCode: order.orderCode,
                  locale,
                  methods: paymentMethods,
                  planSummary,
                  selectedServerName: order.selectedServerName,
                  requestedName: order.requestedName,
                  renewalTargetName: renewalTarget?.name || null,
                }),
                {
                  replyMarkup: buildTelegramPaymentMethodSelectionKeyboard({
                    orderId: order.id,
                    locale,
                    methods: paymentMethods,
                  }),
                },
              );
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.orderActionSent,
              );
              return null;
            }

            await sendTelegramMessage(
              config.botToken,
              chatId,
                buildTelegramSalesPaymentPrompt({
                  locale,
                  orderCode: order.orderCode,
                  planSummary,
                  paymentInstructions: resolveTelegramSalesPaymentInstructions(salesSettings, locale),
                  paymentMethod: selectedPaymentMethod,
                  paymentMethodLabel: order.paymentMethodLabel,
                  selectedServerName: order.selectedServerName,
                  requestedName: order.requestedName,
                  renewalTargetName: renewalTarget?.name || null,
                  supportLink: await getTelegramSupportLink(),
                }),
                {
                  replyMarkup: buildTelegramOrderActionKeyboard({
                    order,
                  locale,
                }),
              },
            );
            await answerTelegramCallbackQuery(
              config.botToken,
              callbackQuery.id,
              ui.orderActionSent,
            );
            return null;
          }
          case 'st': {
            const order = await findTelegramOrderByIdForUser({
              orderId: userOrderAction.primary,
              chatId,
              telegramUserId: callbackQuery.from.id,
            });
            if (!order) {
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.orderActionStatusMissing,
              );
              return null;
            }

            await sendTelegramOrderStatusCard({
              botToken: config.botToken,
              chatId,
              order,
              locale,
            });
            await answerTelegramCallbackQuery(
              config.botToken,
              callbackQuery.id,
              ui.orderActionSent,
            );
            return null;
          }
          case 'ca': {
            const order = await findTelegramOrderByIdForUser({
              orderId: userOrderAction.primary,
              chatId,
              telegramUserId: callbackQuery.from.id,
            });
            if (!order) {
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.orderActionStatusMissing,
              );
              return null;
            }
            if (isTelegramOrderTerminal(order.status)) {
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.orderActionAlreadyClosed,
              );
              return null;
            }
            if (order.status === 'PENDING_REVIEW') {
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.activeOrderPendingReview(order.orderCode),
              );
              return null;
            }

            await db.telegramOrder.update({
              where: { id: order.id },
              data: {
                status: 'CANCELLED',
                paymentStageEnteredAt: null,
                paymentReminderSentAt: null,
                expiredAt: null,
              },
            });
            await sendTelegramMessage(config.botToken, chatId, ui.orderCancelled(order.orderCode), {
              replyMarkup: getCommandKeyboard(isAdmin),
            });
            await answerTelegramCallbackQuery(
              config.botToken,
              callbackQuery.id,
              ui.orderActionCancelledInline(order.orderCode),
            );
            return null;
          }
        }
      } catch (error) {
        await answerTelegramCallbackQuery(
          config.botToken,
          callbackQuery.id,
          (error as Error).message,
        );
        return null;
      }
    }

    const orderAction = parseTelegramOrderReviewCallbackData(callbackQuery.data);
    if (!orderAction) {
      return null;
    }

    const adminLocale = await getTelegramConversationLocale({
      telegramUserId: callbackQuery.from.id,
      telegramChatId: chatId,
    });
    const adminUi = getTelegramUi(adminLocale);

    if (!isAdmin) {
      await answerTelegramCallbackQuery(
        config.botToken,
        callbackQuery.id,
        adminUi.orderReviewActionUnauthorized,
      );
      return null;
    }

    try {
      if (orderAction.action === 'approve') {
        const result = await approveTelegramOrder({
          orderId: orderAction.orderId,
          reviewedByUserId: null,
          reviewerName: callbackQuery.from.username || callbackQuery.from.first_name || null,
          adminNote: callbackQuery.from.username
            ? `Approved from Telegram by @${callbackQuery.from.username}`
            : `Approved from Telegram by ${callbackQuery.from.first_name}`,
        });

        await answerTelegramCallbackQuery(
          config.botToken,
          callbackQuery.id,
          adminUi.orderReviewActionApproved(result.orderCode),
        );
      } else {
        const result = await rejectTelegramOrder({
          orderId: orderAction.orderId,
          reviewedByUserId: null,
          reviewerName: callbackQuery.from.username || callbackQuery.from.first_name || null,
          adminNote: callbackQuery.from.username
            ? `Rejected from Telegram by @${callbackQuery.from.username}`
            : `Rejected from Telegram by ${callbackQuery.from.first_name}`,
        });

        await answerTelegramCallbackQuery(
          config.botToken,
          callbackQuery.id,
          adminUi.orderReviewActionRejected(result.orderCode),
        );
      }
    } catch (error) {
      await answerTelegramCallbackQuery(
        config.botToken,
        callbackQuery.id,
        adminUi.orderReviewActionFailed((error as Error).message),
      );
    }

    return null;
  }

  await setTelegramUserLocale({
    telegramUserId: String(callbackQuery.from.id),
    telegramChatId: String(chatId),
    username: callbackQuery.from.username || null,
    displayName: callbackQuery.from.first_name || null,
    locale: parsed.locale,
  });

  const ui = getTelegramUi(parsed.locale);
  const languageName = parsed.locale === 'my' ? 'မြန်မာ' : 'English';
  await answerTelegramCallbackQuery(
    config.botToken,
    callbackQuery.id,
    parsed.context === 'switch'
      ? parsed.locale === 'my'
        ? 'ဘာသာစကား ပြောင်းပြီးပါပြီ'
        : 'Language updated'
      : undefined,
  );

  if (parsed.context === 'switch') {
    await sendTelegramMessage(
      config.botToken,
      chatId,
      [
        ui.languageChanged(escapeHtml(languageName)),
        '',
        ui.languagePromptDesc,
      ].join('\n'),
      {
        replyMarkup: getCommandKeyboard(isAdmin),
      },
    );
    return null;
  }

  return handleStartCommand(
    chatId,
    callbackQuery.from.id,
    callbackQuery.from.username || callbackQuery.from.first_name,
    isAdmin,
    config.botToken,
    parsed.startArgs || '',
    parsed.locale,
  );
}

/**
 * Handle incoming Telegram message.
 */
export async function handleTelegramUpdate(update: TelegramUpdate): Promise<string | null> {
  const callbackQuery = update.callback_query;
  if (callbackQuery) {
    const config = await getTelegramConfig();
    if (!config) {
      return null;
    }

    return handleTelegramCallbackQuery(callbackQuery, config);
  }

  const message = update.message;
  if (!message) return null;

  const chatId = message.chat.id;
  const telegramUserId = message.from.id;
  const username = message.from.username || message.from.first_name;
  const text = message.text?.trim() || '';

  const config = await getTelegramConfig();
  if (!config) return null;
  await upsertTelegramUserProfile({
    telegramUserId: String(telegramUserId),
    telegramChatId: String(chatId),
    username: message.from.username || null,
    displayName: message.from.first_name || null,
  });
  const locale = await getTelegramConversationLocale({
    telegramUserId,
    telegramChatId: chatId,
  });
  const ui = getTelegramUi(locale);

  if (message.photo?.length || message.document) {
    return handleTelegramOrderProofMessage({
      botToken: config.botToken,
      chatId,
      telegramUserId,
      caption: message.caption,
      photo: message.photo,
      document: message.document,
      messageId: message.message_id,
    });
  }

  if (!text) {
    return null;
  }

  const activeOrder = await getActiveTelegramOrder(chatId, telegramUserId);
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!activeOrder && emailRegex.test(text)) {
    return handleEmailLink(chatId, telegramUserId, text, locale);
  }

  const commandMatch = text.match(/^\/(\w+)(?:@\w+)?(?:\s+(.*))?$/);
  if (!commandMatch) {
    if (activeOrder) {
      return handleTelegramOrderTextMessage({
        chatId,
        telegramUserId,
        text,
      });
    }

    return null;
  }

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
    case 'language':
      return handleLanguageCommand(chatId, config.botToken);
    case 'buy':
      return handleBuyCommand(chatId, telegramUserId, username, locale, config.botToken);
    case 'orders':
      return handleOrdersCommand(chatId, telegramUserId, locale, config.botToken);
    case 'order':
      return handleOrderStatusCommand(chatId, telegramUserId, argsText, locale, config.botToken);
    case 'usage':
    case 'mykey':
    case 'key':
      return handleUsageCommand(chatId, telegramUserId, config.botToken, locale);
    case 'mykeys':
      return handleMyKeysCommand(chatId, telegramUserId, locale, config.botToken);
    case 'sub':
      return handleSubscriptionLinksCommand(chatId, telegramUserId, locale);
    case 'support':
      return handleSupportCommand(locale);
    case 'server':
      return isAdmin && !argsText.trim()
        ? handleStatusCommand(locale)
        : handleUserServerCommand(chatId, telegramUserId, locale);
    case 'renew':
      return handleRenewOrderCommand(chatId, telegramUserId, username, locale, config.botToken);
    case 'cancel': {
      const currentOrder = activeOrder ?? (await getActiveTelegramOrder(chatId, telegramUserId));
      if (!currentOrder) {
        return ui.noOrderToCancel;
      }

      if (currentOrder.status === 'PENDING_REVIEW') {
        return ui.activeOrderPendingReview(currentOrder.orderCode);
      }

      await db.telegramOrder.update({
        where: { id: currentOrder.id },
        data: {
          status: 'CANCELLED',
          paymentStageEnteredAt: null,
          paymentReminderSentAt: null,
          expiredAt: null,
        },
      });

      return ui.orderCancelled(currentOrder.orderCode);
    }
    case 'status':
      return isAdmin ? handleStatusCommand(locale) : ui.adminOnly;
    case 'expiring':
      return isAdmin ? handleExpiringCommand(argsText, locale) : ui.adminOnly;
    case 'find':
      return isAdmin ? handleFindCommand(argsText, locale) : ui.adminOnly;
    case 'disable':
      return isAdmin ? handleAdminToggleCommand(argsText, false, locale) : ui.adminOnly;
    case 'enable':
      return isAdmin ? handleAdminToggleCommand(argsText, true, locale) : ui.adminOnly;
    case 'resend':
      return isAdmin ? handleResendCommand(argsText, locale) : ui.adminOnly;
    case 'sysinfo':
      return isAdmin ? handleSysInfoCommand(chatId, config.botToken, locale) : ui.adminOnly;
    case 'backup':
      return isAdmin ? handleBackupCommand(chatId, config.botToken, locale) : ui.adminOnly;
    case 'help':
      return handleHelpCommand(chatId, config.botToken, isAdmin, locale);
    default:
      return ui.unknownCommand;
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
  const locale = await getTelegramDefaultLocale();
  const ui = getTelegramUi(locale);
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
    ui.digestTitle,
    '',
    ui.digestWindow(lookbackHours),
    `${ui.digestActiveKeys}: ${activeKeys}`,
    `${ui.digestPendingKeys}: ${pendingKeys}`,
    `${ui.digestDepletedKeys}: ${depletedKeys}`,
    `${ui.digestExpiringSoon}: ${expiringSoon}`,
    `${ui.digestOpenIncidents}: ${openIncidents}`,
    `${ui.digestEvents}: ${recentViews}`,
    '',
    `${ui.digestServerHealth}: ${ui.digestHealthSummary(healthSummary.up, healthSummary.slow, healthSummary.down, healthSummary.unknown)}`,
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
