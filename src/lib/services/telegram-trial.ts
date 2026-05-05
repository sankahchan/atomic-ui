import { db } from '@/lib/db';
import type { SupportedLocale } from '@/lib/i18n/config';
import { buildTelegramMenuCallbackData } from '@/lib/services/telegram-callbacks';
import { escapeHtml, formatTelegramDateTime } from '@/lib/services/telegram-ui';

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
      '🎁 <b>Welcome Gift — Free Trial!</b>',
      '━━━━━━━━━━━━━━━━━━',
      '',
      `Hello, <b>${firstName}</b>! 👋`,
      '',
      'အသစ်စတင်သော user အဖြစ် <b>အခမဲ့ ၂ ရက် trial</b> ရရှိနိုင်ပါသည်။',
      '',
      '📶 Data        :  5 GB',
      '🕐 Duration   :  2 days',
      '💰 Price       :  FREE',
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
          text: isMyanmar ? '🎁 Free Trial ရယူမည်' : '🎁 Claim Free Trial',
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
  const firstName = escapeHtml(input.firstName);
  const accessUrl = escapeHtml(input.outlineKey);
  const expiresAt = escapeHtml(formatTelegramDateTime(input.expiresAt, input.locale));

  if (input.locale === 'my') {
    return [
      '✅ <b>Trial is Active!</b>',
      '━━━━━━━━━━━━━━━━━━',
      'You have <b>5 GB</b> for <b>2 days</b>.',
      'Enjoy your free trial! 🎉',
      '',
      '🔑 <b>Your Access Key:</b>',
      `<code>${accessUrl}</code>`,
      '',
      'အထက်ပါ key ကို tap လုပ်၍ copy လုပ်နိုင်ပါသည်။',
      'Outline app ထဲတွင် ထည့်ပြီး ချိတ်ဆက်အသုံးပြုပါ။',
    ].join('\n');
  }

  return [
    '✅ <b>Trial is Active!</b>',
    '━━━━━━━━━━━━━━━━━━',
    'You have <b>5 GB</b> for <b>2 days</b>.',
    'Enjoy your free trial! 🎉',
    '',
    '🔑 <b>Your Access Key:</b>',
    `<code>${accessUrl}</code>`,
    '',
    'Tap the key above to copy it.',
    'Use it in the Outline app to connect.',
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
      '🎁 <b>Telegram trial claimed</b>',
      '',
      `User: <b>${escapeHtml(input.firstName)}</b>`,
      `Telegram ID: <code>${input.telegramUserId}</code>`,
      `Chat ID: <code>${input.chatId}</code>`,
      `Key: <b>${escapeHtml(input.keyName)}</b>`,
      `Expires: <b>${expiresAt}</b>${serverLabel}`,
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
    ? 'ℹ️ Free trial ကို first-time user တစ်ဦးအတွက် တစ်ကြိမ်သာ ရနိုင်ပါသည်။'
    : 'ℹ️ The free trial is available only once for each first-time user.';
}

export function buildTelegramTrialActivationFailedMessage(locale: SupportedLocale) {
  return locale === 'my'
    ? '❌ Free trial ကို စတင်မပေးနိုင်သေးပါ။ ခဏအကြာ ပြန်စမ်းပါ သို့မဟုတ် /support ကို အသုံးပြုပါ။'
    : '❌ We could not activate the free trial right now. Please try again shortly or use /support.';
}

export function buildTelegramTrialActivatedKeyboard(locale: SupportedLocale) {
  const isMyanmar = locale === 'my';
  return {
    inline_keyboard: [
      [
        {
          text: isMyanmar ? '📲 Setup Guide' : '📲 Setup Guide',
          callback_data: buildTelegramMenuCallbackData('trial', 'setup_guide'),
        },
        {
          text: isMyanmar ? '🛒 View Paid Plans' : '🛒 View Paid Plans',
          callback_data: buildTelegramMenuCallbackData('trial', 'back_main'),
        },
      ],
    ],
  };
}
