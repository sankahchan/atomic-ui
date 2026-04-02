import { coerceSupportedLocale, type SupportedLocale } from '@/lib/i18n/config';

export type TelegramLocaleSelectorContext = 'start' | 'switch';
export type TelegramOrderReviewAction = 'approve' | 'reject';
export type TelegramOrderUserAction =
  | 'pl'
  | 'ky'
  | 'sv'
  | 'pm'
  | 'pay'
  | 'up'
  | 'st'
  | 'rf'
  | 'ca'
  | 'by'
  | 'rt';
export type TelegramServerChangeReviewAction = 'approve' | 'reject';
export type TelegramServerChangeUserAction = 'ky' | 'sv' | 'st' | 'ca';
export type TelegramDynamicSupportUserAction = 'rg' | 'rv' | 'is' | 'st' | 'rp' | 'ca';
export type TelegramNotificationPreferenceKey =
  | 'promo'
  | 'maintenance'
  | 'receipt'
  | 'support';
export type TelegramRetentionSource =
  | 'trial_expiry'
  | 'trial_expired'
  | 'renewal_7d'
  | 'renewal_3d'
  | 'renewal_manual'
  | 'premium_renewal_7d'
  | 'premium_renewal_3d'
  | 'expired_recovery'
  | 'order_retry';

const TELEGRAM_LOCALE_CALLBACK_PREFIX = 'locale';
const TELEGRAM_ORDER_REVIEW_CALLBACK_PREFIX = 'order-review';
const TELEGRAM_ORDER_ACTION_CALLBACK_PREFIX = 'ord';
const TELEGRAM_SERVER_CHANGE_REVIEW_CALLBACK_PREFIX = 'server-review';
const TELEGRAM_SERVER_CHANGE_ACTION_CALLBACK_PREFIX = 'srvreq';
const TELEGRAM_DYNAMIC_SUPPORT_CALLBACK_PREFIX = 'dynsup';
const TELEGRAM_NOTIFICATION_PREFERENCE_CALLBACK_PREFIX = 'notipref';

export function getCommandKeyboard(isAdmin: boolean) {
  const keyboard = [
    [{ text: '/buy' }, { text: '/trial' }],
    [{ text: '/renew' }, { text: '/orders' }],
    [{ text: '/refund' }, { text: '/mykeys' }],
    [{ text: '/usage' }, { text: '/inbox' }],
    [{ text: '/sub' }, { text: '/server' }],
    [{ text: '/premium' }, { text: '/supportstatus' }],
    [{ text: '/support' }, { text: '/notifications' }],
    [{ text: '/cancel' }, { text: '/help' }],
    [{ text: '/language' }],
  ];

  if (isAdmin) {
    keyboard.push([{ text: '/status' }, { text: '/expiring' }]);
    keyboard.push([{ text: '/find' }, { text: '/sysinfo' }]);
    keyboard.push([{ text: '/refunds' }, { text: '/finance' }]);
    keyboard.push([{ text: '/announcements' }]);
  }

  return {
    keyboard,
    resize_keyboard: true,
    one_time_keyboard: false,
  };
}

export function buildTelegramLocaleSelectorKeyboard(
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

export function buildTelegramLocaleSelectorMessage(context: TelegramLocaleSelectorContext) {
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

export function parseTelegramLocaleCallbackData(data?: string | null) {
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

export function buildTelegramOrderReviewCallbackData(
  action: TelegramOrderReviewAction,
  orderId: string,
) {
  return `${TELEGRAM_ORDER_REVIEW_CALLBACK_PREFIX}:${action}:${orderId}`;
}

export function parseTelegramOrderReviewCallbackData(data?: string | null) {
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

export function buildTelegramOrderActionCallbackData(
  action: TelegramOrderUserAction,
  primary: string,
  secondary?: string,
) {
  return secondary
    ? `${TELEGRAM_ORDER_ACTION_CALLBACK_PREFIX}:${action}:${primary}:${secondary}`
    : `${TELEGRAM_ORDER_ACTION_CALLBACK_PREFIX}:${action}:${primary}`;
}

export function parseTelegramOrderActionCallbackData(data?: string | null) {
  if (!data) {
    return null;
  }

  const parts = data.split(':');
  if (parts.length < 3 || parts[0] !== TELEGRAM_ORDER_ACTION_CALLBACK_PREFIX) {
    return null;
  }

  const action = parts[1];
  if (!['pl', 'ky', 'sv', 'pm', 'pay', 'up', 'st', 'rf', 'ca', 'by', 'rt'].includes(action)) {
    return null;
  }

  return {
    action: action as TelegramOrderUserAction,
    primary: parts[2]?.trim() || '',
    secondary: parts[3]?.trim() || null,
  };
}

export function normalizeTelegramRetentionSource(
  value?: string | null,
): TelegramRetentionSource | null {
  switch (value) {
    case 'trial_expiry':
    case 'trial_expired':
    case 'renewal_7d':
    case 'renewal_3d':
    case 'renewal_manual':
    case 'premium_renewal_7d':
    case 'premium_renewal_3d':
    case 'expired_recovery':
    case 'order_retry':
      return value;
    default:
      return null;
  }
}

export function isDynamicRenewalActionSecondary(value?: string | null) {
  return value === 'dynamic' || value?.startsWith('dynamic_') || false;
}

export function resolveTelegramRetentionSourceFromBuyAction(
  secondary?: string | null,
): TelegramRetentionSource | null {
  return normalizeTelegramRetentionSource(secondary);
}

export function resolveTelegramRetentionSourceFromRenewAction(
  secondary?: string | null,
): TelegramRetentionSource | null {
  switch (secondary) {
    case 'renewal_7d':
    case 'renewal_3d':
    case 'renewal_manual':
    case 'expired_recovery':
      return secondary;
    case 'dynamic_renewal_7d':
      return 'premium_renewal_7d';
    case 'dynamic_renewal_3d':
      return 'premium_renewal_3d';
    default:
      return null;
  }
}

export function buildTelegramServerChangeReviewCallbackData(
  action: TelegramServerChangeReviewAction,
  requestId: string,
) {
  return `${TELEGRAM_SERVER_CHANGE_REVIEW_CALLBACK_PREFIX}:${action}:${requestId}`;
}

export function parseTelegramServerChangeReviewCallbackData(data?: string | null) {
  if (!data) {
    return null;
  }

  const parts = data.split(':');
  if (parts.length !== 3 || parts[0] !== TELEGRAM_SERVER_CHANGE_REVIEW_CALLBACK_PREFIX) {
    return null;
  }

  const action =
    parts[1] === 'approve'
      ? 'approve'
      : parts[1] === 'reject'
        ? 'reject'
        : null;
  const requestId = parts[2]?.trim();

  if (!action || !requestId) {
    return null;
  }

  return {
    action,
    requestId,
  } as const;
}

export function buildTelegramServerChangeActionCallbackData(
  action: TelegramServerChangeUserAction,
  primary: string,
  secondary?: string,
) {
  return secondary
    ? `${TELEGRAM_SERVER_CHANGE_ACTION_CALLBACK_PREFIX}:${action}:${primary}:${secondary}`
    : `${TELEGRAM_SERVER_CHANGE_ACTION_CALLBACK_PREFIX}:${action}:${primary}`;
}

export function parseTelegramServerChangeActionCallbackData(data?: string | null) {
  if (!data) {
    return null;
  }

  const parts = data.split(':');
  if (parts.length < 3 || parts[0] !== TELEGRAM_SERVER_CHANGE_ACTION_CALLBACK_PREFIX) {
    return null;
  }

  const action = parts[1];
  if (!['ky', 'sv', 'st', 'ca'].includes(action)) {
    return null;
  }

  return {
    action: action as TelegramServerChangeUserAction,
    primary: parts[2]?.trim() || '',
    secondary: parts[3]?.trim() || null,
  };
}

export function buildTelegramDynamicSupportActionCallbackData(
  action: TelegramDynamicSupportUserAction,
  primary: string,
  secondary?: string,
) {
  return secondary
    ? `${TELEGRAM_DYNAMIC_SUPPORT_CALLBACK_PREFIX}:${action}:${primary}:${secondary}`
    : `${TELEGRAM_DYNAMIC_SUPPORT_CALLBACK_PREFIX}:${action}:${primary}`;
}

export function parseTelegramDynamicSupportActionCallbackData(data?: string | null) {
  if (!data) {
    return null;
  }

  const parts = data.split(':');
  if (parts.length < 3 || parts[0] !== TELEGRAM_DYNAMIC_SUPPORT_CALLBACK_PREFIX) {
    return null;
  }

  const action = parts[1];
  if (!['rg', 'rv', 'is', 'st', 'rp', 'ca'].includes(action)) {
    return null;
  }

  return {
    action: action as TelegramDynamicSupportUserAction,
    primary: parts[2]?.trim() || '',
    secondary: parts[3]?.trim() || null,
  };
}

export function buildTelegramNotificationPreferenceCallbackData(
  preference: TelegramNotificationPreferenceKey,
  enabled: boolean,
) {
  return `${TELEGRAM_NOTIFICATION_PREFERENCE_CALLBACK_PREFIX}:${preference}:${enabled ? 'on' : 'off'}`;
}

export function parseTelegramNotificationPreferenceCallbackData(data?: string | null) {
  if (!data) {
    return null;
  }

  const parts = data.split(':');
  if (parts.length !== 3 || parts[0] !== TELEGRAM_NOTIFICATION_PREFERENCE_CALLBACK_PREFIX) {
    return null;
  }

  const preference = parts[1];
  if (!['promo', 'maintenance', 'receipt', 'support'].includes(preference)) {
    return null;
  }

  return {
    preference: preference as TelegramNotificationPreferenceKey,
    enabled: parts[2] === 'on',
  } as const;
}
