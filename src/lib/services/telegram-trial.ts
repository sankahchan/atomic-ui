import { db } from '@/lib/db';
import type { SupportedLocale } from '@/lib/i18n/config';
import { buildTelegramMenuCallbackData } from '@/lib/services/telegram-callbacks';
import {
  buildTelegramStorefrontCallbackData,
  escapeTelegramMarkdownV2,
  formatTelegramMarkdownCode,
} from '@/lib/services/telegram-storefront';
import {
  escapeHtml,
  formatTelegramDateTime,
} from '@/lib/services/telegram-ui';

export const TELEGRAM_TRIAL_PLAN_CODE = 'trial_1d_3gb';
export const TELEGRAM_TRIAL_DURATION_DAYS = 2;
export const TELEGRAM_TRIAL_DATA_GB = 5;

export async function isTelegramTrialEligible(input: {
  chatId: number;
  telegramUserId: number;
}) {
  const [profile, linkedAccessKeyCount, linkedDynamicKeyCount, fulfilledOrderCount] = await Promise.all([
    db.telegramUserProfile.findUnique({
      where: { telegramUserId: String(input.telegramUserId) },
      select: {
        trialUsed: true,
      },
    }),
    db.accessKey.count({
      where: {
        OR: [
          { telegramId: String(input.telegramUserId) },
          { user: { telegramChatId: String(input.chatId) } },
        ],
        status: { not: 'ARCHIVED' },
      },
    }),
    db.dynamicAccessKey.count({
      where: {
        OR: [
          { telegramId: String(input.telegramUserId) },
          { user: { telegramChatId: String(input.chatId) } },
        ],
        status: { not: 'ARCHIVED' },
      },
    }),
    db.telegramOrder.count({
      where: {
        OR: [
          { telegramChatId: String(input.chatId) },
          { telegramUserId: String(input.telegramUserId) },
        ],
        kind: 'NEW',
        status: 'FULFILLED',
      },
    }),
  ]);

  if (profile?.trialUsed) {
    return false;
  }

  if (linkedAccessKeyCount > 0 || linkedDynamicKeyCount > 0) {
    return false;
  }

  return fulfilledOrderCount === 0;
}

export function buildTelegramTrialOfferMessage(input: {
  locale: SupportedLocale;
  firstName: string;
}) {
  const firstName = escapeHtml(input.firstName);

  if (input.locale === 'my') {
    return [
      '🎁 <b>ကြိုဆိုလက်ဆောင် — အခမဲ့အစမ်းသုံး!</b>',
      '━━━━━━━━━━━━━━━━━━',
      '',
      `မင်္ဂလာပါ၊ <b>${firstName}</b>! 👋`,
      '',
      'အသစ်စတင်အသုံးပြုသူအဖြစ် <b>အခမဲ့ ၂ ရက်အစမ်းသုံး</b> ရရှိနိုင်ပါသည်။',
      '',
      '📶 Data        :  5 GB',
      '🕐 Duration   :  ၂ ရက်',
      '💰 Price       :  အခမဲ့',
      '',
      'ငွေပေးချေမှုမလိုပါ။ အခုချက်ချင်း စတင်နိုင်ပါသည်။',
    ].join('\n');
  }

  return [
    '🎁 <b>Welcome Gift — Free Trial!</b>',
    '━━━━━━━━━━━━━━━━━━',
    '',
    `Hello, <b>${firstName}</b>! 👋`,
    '',
    'As a new user, you get a <b>FREE 2-day trial</b>!',
    '',
    '📶 Data        :  5 GB',
    '🕐 Duration   :  2 days',
    '💰 Price       :  FREE',
    '',
    'No payment required. Start instantly.',
  ].join('\n');
}

export function buildTelegramTrialOfferKeyboard(locale: SupportedLocale) {
  const isMyanmar = locale === 'my';
  return {
    inline_keyboard: [
      [
        {
          text: isMyanmar ? '🎁 အခမဲ့အစမ်းသုံးမည်' : '🎁 Claim Free Trial',
          callback_data: buildTelegramMenuCallbackData('trial', 'claim'),
        },
      ],
      [
        {
          text: isMyanmar ? '🛒 Plan ဝယ်မည်' : '🛒 Buy a Plan Instead',
          callback_data: buildTelegramMenuCallbackData('trial', 'back_main'),
        },
      ],
    ],
  };
}

export function buildTelegramTrialActivatedMessage(input: {
  locale: SupportedLocale;
  firstName: string;
  outlineKey: string;
  expiresAt: Date;
}) {
  const firstName = escapeTelegramMarkdownV2(input.firstName);
  const expiresAt = escapeTelegramMarkdownV2(formatTelegramDateTime(input.expiresAt, input.locale));
  if (input.locale === 'my') {
    return [
      '🎁 *Trial စတင်ပြီးပါပြီ\\!*',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      `ကြိုဆိုပါတယ်၊ *${firstName}*\\! သင်၏ အခမဲ့အစမ်းသုံးကို`,
      'ယခုချက်ချင်း အသုံးပြုနိုင်ပါပြီ\\! 🚀',
      '',
      '🔑 *သင်၏ Access Key:*',
      formatTelegramMarkdownCode(input.outlineKey),
      '',
      '📶 Data        :  5 GB',
      `🕐 သက်တမ်းကုန်မည့်နေ့ :  ${expiresAt}`,
      '💰 ပေးချေမှု     :  အခမဲ့',
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '📲 _Setup Guide ကိုနှိပ်ပြီး ၂ မိနစ်အတွင်း ချိတ်ဆက်ပါ\\._',
      'သင်၏ အခမဲ့အစမ်းသုံးကို ပျော်ရွှင်စွာ အသုံးပြုပါ\\! 🎉',
    ].join('\n');
  }

  return [
    '🎁 *Trial Activated\\!*',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    `Welcome, *${firstName}*\\! Your free trial`,
    'is ready to use right now\\! 🚀',
    '',
    '🔑 *Your Access Key:*',
    formatTelegramMarkdownCode(input.outlineKey),
    '',
    '📶 Data        :  5 GB',
    `🕐 Expires     :  ${expiresAt}`,
    '💰 Paid        :  FREE',
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '📲 _Tap Setup Guide to connect in 2 minutes\\._',
    'Enjoy your free trial\\! 🎉',
  ].join('\n');
}

export function buildTelegramTrialAdminAlertMessage(input: {
  locale: SupportedLocale;
  firstName: string;
  telegramUserId: number;
  chatId: number;
  keyName: string;
  expiresAt: Date;
  serverName?: string | null;
}) {
  const expiresAt = escapeHtml(formatTelegramDateTime(input.expiresAt, input.locale));
  const serverLabel = input.serverName?.trim() ? `\nServer: <b>${escapeHtml(input.serverName.trim())}</b>` : '';

  if (input.locale === 'my') {
    return [
      '🎁 <b>Telegram အစမ်းသုံး ရယူပြီးပါပြီ</b>',
      '',
      `User: <b>${escapeHtml(input.firstName)}</b>`,
      `Telegram ID: <code>${input.telegramUserId}</code>`,
      `Chat ID: <code>${input.chatId}</code>`,
      `Key: <b>${escapeHtml(input.keyName)}</b>`,
      `သက်တမ်းကုန်မည့်နေ့: <b>${expiresAt}</b>${serverLabel}`,
    ].join('\n');
  }

  return [
    '🎁 <b>Telegram trial claimed</b>',
    '',
    `User: <b>${escapeHtml(input.firstName)}</b>`,
    `Telegram ID: <code>${input.telegramUserId}</code>`,
    `Chat ID: <code>${input.chatId}</code>`,
    `Key: <b>${escapeHtml(input.keyName)}</b>`,
    `Expires: <b>${expiresAt}</b>${serverLabel}`,
  ].join('\n');
}

export function buildTelegramTrialUnavailableMessage(locale: SupportedLocale) {
  return locale === 'my'
    ? 'ℹ️ အခမဲ့အစမ်းသုံးကို ပထမဆုံးအသုံးပြုသူတစ်ဦးအတွက် တစ်ကြိမ်သာ ရနိုင်ပါသည်။'
    : 'ℹ️ The free trial is available only once for each first-time user.';
}

export function buildTelegramTrialActivationFailedMessage(locale: SupportedLocale) {
  return locale === 'my'
    ? '❌ အခမဲ့အစမ်းသုံးကို ယခုစတင်မပေးနိုင်သေးပါ။ ခဏအကြာ ပြန်စမ်းပါ သို့မဟုတ် /support ကို အသုံးပြုပါ။'
    : '❌ We could not activate the free trial right now. Please try again shortly or use /support.';
}

export function buildTelegramTrialActivatedKeyboard(input: {
  locale: SupportedLocale;
  keyId: string;
}) {
  const isMyanmar = input.locale === 'my';
  return {
    inline_keyboard: [
      [
        {
          text: isMyanmar ? '📲  ချိတ်ဆက်နည်း' : '📲  Setup Guide',
          callback_data: buildTelegramStorefrontCallbackData({
            action: 'platform_select',
            keyId: input.keyId,
          }),
        },
      ],
      [
        {
          text: '🤖 Android',
          callback_data: buildTelegramStorefrontCallbackData({
            action: 'guide_platform',
            keyId: input.keyId,
            platform: 'android',
          }),
        },
        {
          text: '🍎 iOS',
          callback_data: buildTelegramStorefrontCallbackData({
            action: 'guide_platform',
            keyId: input.keyId,
            platform: 'ios',
          }),
        },
      ],
      [
        {
          text: '🪟 Windows',
          callback_data: buildTelegramStorefrontCallbackData({
            action: 'guide_platform',
            keyId: input.keyId,
            platform: 'windows',
          }),
        },
        {
          text: '🍏 macOS',
          callback_data: buildTelegramStorefrontCallbackData({
            action: 'guide_platform',
            keyId: input.keyId,
            platform: 'macos',
          }),
        },
      ],
      [
        {
          text: isMyanmar ? '🛒 Full Plan ဝယ်မည်' : '🛒 Buy a Full Plan',
          callback_data: buildTelegramStorefrontCallbackData({ action: 'show_plans' }),
        },
      ],
      [
        {
          text: isMyanmar ? '🏠 ပင်မ Menu' : '🏠 Back to Menu',
          callback_data: buildTelegramStorefrontCallbackData({ action: 'main_menu' }),
        },
        {
          text: isMyanmar ? '💬 အကူအညီ' : '💬 Support',
          callback_data: buildTelegramStorefrontCallbackData({ action: 'support_contact' }),
        },
      ],
    ],
  };
}
