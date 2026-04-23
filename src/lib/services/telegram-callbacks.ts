import { coerceSupportedLocale, type SupportedLocale } from '@/lib/i18n/config';
import {
  type TelegramAdminKeyCallbackPayload,
  type TelegramAdminMenuAction,
  type TelegramCommerceViewAction,
  type TelegramCommerceViewCallbackPayload,
  type TelegramCommerceViewSection,
  type TelegramDynamicSupportActionCallbackPayload,
  type TelegramDynamicSupportUserAction,
  type TelegramInboxMenuAction,
  type TelegramLocaleCallbackPayload,
  type TelegramLocaleSelectorContext,
  type TelegramMenuCallbackPayload,
  type TelegramMenuSection,
  type TelegramNotificationPreferenceCallbackPayload,
  type TelegramNotificationPreferenceKey,
  type TelegramOffersMenuAction,
  type TelegramOrderActionCallbackPayload,
  type TelegramOrderReviewAction,
  type TelegramOrderReviewCallbackPayload,
  type TelegramOrderUserAction,
  type TelegramOrdersMenuAction,
  type TelegramRetentionSource,
  type TelegramServerChangeActionCallbackPayload,
  type TelegramServerChangeReviewAction,
  type TelegramServerChangeReviewCallbackPayload,
  type TelegramServerChangeUserAction,
  type TelegramSupportMenuAction,
  type TelegramSupportQueueAction,
  type TelegramSupportQueueCallbackPayload,
  type TelegramSupportThreadAction,
  type TelegramSupportThreadCallbackPayload,
} from '@/lib/services/telegram-domain-types';
export type {
  TelegramAdminKeyCallbackPayload,
  TelegramAdminMenuAction,
  TelegramCommerceViewAction,
  TelegramCommerceViewCallbackPayload,
  TelegramCommerceViewSection,
  TelegramDynamicSupportActionCallbackPayload,
  TelegramDynamicSupportUserAction,
  TelegramInboxMenuAction,
  TelegramLocaleCallbackPayload,
  TelegramLocaleSelectorContext,
  TelegramMenuCallbackPayload,
  TelegramMenuSection,
  TelegramNotificationPreferenceCallbackPayload,
  TelegramNotificationPreferenceKey,
  TelegramOffersMenuAction,
  TelegramOrderActionCallbackPayload,
  TelegramOrderReviewAction,
  TelegramOrderReviewCallbackPayload,
  TelegramOrderUserAction,
  TelegramOrdersMenuAction,
  TelegramRetentionSource,
  TelegramServerChangeActionCallbackPayload,
  TelegramServerChangeReviewAction,
  TelegramServerChangeReviewCallbackPayload,
  TelegramServerChangeUserAction,
  TelegramSupportMenuAction,
  TelegramSupportQueueAction,
  TelegramSupportQueueCallbackPayload,
  TelegramSupportThreadAction,
  TelegramSupportThreadCallbackPayload,
};

const TELEGRAM_LOCALE_CALLBACK_PREFIX = 'locale';
const TELEGRAM_ORDER_REVIEW_CALLBACK_PREFIX = 'order-review';
const TELEGRAM_ORDER_ACTION_CALLBACK_PREFIX = 'ord';
const TELEGRAM_SERVER_CHANGE_REVIEW_CALLBACK_PREFIX = 'server-review';
const TELEGRAM_SERVER_CHANGE_ACTION_CALLBACK_PREFIX = 'srvreq';
const TELEGRAM_DYNAMIC_SUPPORT_CALLBACK_PREFIX = 'dynsup';
const TELEGRAM_NOTIFICATION_PREFERENCE_CALLBACK_PREFIX = 'notipref';
const TELEGRAM_MENU_CALLBACK_PREFIX = 'tgmenu';
const TELEGRAM_COMMERCE_VIEW_CALLBACK_PREFIX = 'tgcv';
const TELEGRAM_SUPPORT_QUEUE_CALLBACK_PREFIX = 'supq';
const TELEGRAM_SUPPORT_THREAD_CALLBACK_PREFIX = 'supthread';
const TELEGRAM_ADMIN_KEY_CALLBACK_PREFIX = 'admkey';

type TelegramCommandShortcut = {
  command: string;
  labelEn: string;
  labelMy: string;
  aliases?: string[];
};

const TELEGRAM_USER_COMMAND_ROWS: TelegramCommandShortcut[][] = [
  [
    { command: '/buy', labelEn: '🛒 Buy', labelMy: '🛒 ဝယ်မည်', aliases: ['🛒 Buy key', '🛒 Key ဝယ်မည်'] },
    { command: '/mykeys', labelEn: '🗂 Keys', labelMy: '🗂 Key များ', aliases: ['🗂 My keys'] },
  ],
  [
    { command: '/renew', labelEn: '🔄 Renew', labelMy: '🔄 Renew' },
    { command: '/orders', labelEn: '🧾 Orders', labelMy: '🧾 Orders' },
  ],
  [
    { command: '/inbox', labelEn: '📬 Inbox', labelMy: '📬 Inbox' },
    { command: '/support', labelEn: '🛟 Support', labelMy: '🛟 Support' },
  ],
  [
    { command: '/premium', labelEn: '💎 Premium', labelMy: '💎 Premium' },
    { command: '/usage', labelEn: '📶 Usage', labelMy: '📶 Usage' },
  ],
  [
    { command: '/offers', labelEn: '🎟 Offers', labelMy: '🎟 Offers', aliases: ['🎟 Offer များ'] },
    { command: '/trial', labelEn: '🎁 Trial', labelMy: '🎁 Trial', aliases: ['🎁 Free trial', '🎁 Free Trial'] },
  ],
  [
    { command: '/sub', labelEn: '📎 Links', labelMy: '📎 Links', aliases: ['📎 Sub links', '📎 Sub Links'] },
    { command: '/language', labelEn: '🌐 Language', labelMy: '🌐 Language' },
  ],
  [
    { command: '/help', labelEn: '❓ Help', labelMy: '❓ Help' },
    { command: '/cancel', labelEn: '🛑 Cancel', labelMy: '🛑 Cancel' },
  ],
];

const TELEGRAM_HIDDEN_USER_SHORTCUTS: TelegramCommandShortcut[] = [
  { command: '/notifications', labelEn: '🔔 Preferences', labelMy: '🔔 Notice' },
  { command: '/gift', labelEn: '🎁 Gift', labelMy: '🎁 Gift' },
  { command: '/referral', labelEn: '🔗 Referral', labelMy: '🔗 Referral' },
  { command: '/server', labelEn: '🛠 Server change', labelMy: '🛠 Server ပြောင်း' },
];

const TELEGRAM_ADMIN_COMMAND_ROWS: TelegramCommandShortcut[][] = [
  [
    { command: '/admin', labelEn: '🧭 Admin home', labelMy: '🧭 Admin home' },
    { command: '/reviewqueue', labelEn: '📋 Review queue', labelMy: '📋 Review queue' },
  ],
  [
    { command: '/createkey', labelEn: '➕ Normal key', labelMy: '➕ Normal key' },
    { command: '/createdynamic', labelEn: '💎 Dynamic key', labelMy: '💎 Dynamic key' },
  ],
  [
    { command: '/managekey', labelEn: '🛠 Manage key', labelMy: '🛠 Manage key' },
    { command: '/managedynamic', labelEn: '🧭 Manage dynamic', labelMy: '🧭 Manage dynamic' },
  ],
  [
    { command: '/status', labelEn: '📊 Status', labelMy: '📊 Status' },
    { command: '/expiring', labelEn: '⏰ Expiring', labelMy: '⏰ Expiring' },
  ],
  [
    { command: '/find', labelEn: '🔎 Find key', labelMy: '🔎 Key ရှာ' },
    { command: '/announcements', labelEn: '📢 Broadcasts', labelMy: '📢 Broadcasts' },
  ],
  [
    { command: '/finance', labelEn: '💼 Finance', labelMy: '💼 Finance' },
    { command: '/refunds', labelEn: '💸 Refunds', labelMy: '💸 Refunds' },
  ],
];

function getTelegramShortcutLabel(shortcut: TelegramCommandShortcut, locale: SupportedLocale) {
  return locale === 'my' ? shortcut.labelMy : shortcut.labelEn;
}

function listVisibleTelegramCommandShortcuts(isAdmin: boolean) {
  return [...TELEGRAM_USER_COMMAND_ROWS, ...(isAdmin ? TELEGRAM_ADMIN_COMMAND_ROWS : [])];
}

function listTelegramCommandShortcutAliases(isAdmin: boolean) {
  return [
    ...TELEGRAM_USER_COMMAND_ROWS.flat(),
    ...TELEGRAM_HIDDEN_USER_SHORTCUTS,
    ...(isAdmin ? TELEGRAM_ADMIN_COMMAND_ROWS.flat() : []),
  ];
}

export function getCommandKeyboard(isAdmin: boolean, locale: SupportedLocale = 'en') {
  return {
    keyboard: listVisibleTelegramCommandShortcuts(isAdmin).map((row) =>
      row.map((shortcut) => ({ text: getTelegramShortcutLabel(shortcut, locale) })),
    ),
    resize_keyboard: true,
    one_time_keyboard: false,
  };
}

export function normalizeTelegramReplyKeyboardCommand(
  text: string,
  isAdmin: boolean,
) {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  for (const shortcut of listTelegramCommandShortcutAliases(isAdmin)) {
    const aliases = [
      shortcut.command,
      shortcut.command.replace(/^\//, ''),
      shortcut.labelEn,
      shortcut.labelMy,
      ...(shortcut.aliases || []),
    ];
    if (aliases.some((alias) => alias.trim().toLowerCase() === normalized)) {
      return shortcut.command;
    }
  }

  return null;
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

export function parseTelegramLocaleCallbackData(data?: string | null): TelegramLocaleCallbackPayload | null {
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
  secondary?: string,
) {
  return secondary
    ? `${TELEGRAM_ORDER_REVIEW_CALLBACK_PREFIX}:${action}:${orderId}:${secondary}`
    : `${TELEGRAM_ORDER_REVIEW_CALLBACK_PREFIX}:${action}:${orderId}`;
}

export function parseTelegramOrderReviewCallbackData(data?: string | null): TelegramOrderReviewCallbackPayload | null {
  if (!data) {
    return null;
  }

  const parts = data.split(':');
  if (parts.length < 3 || parts.length > 4 || parts[0] !== TELEGRAM_ORDER_REVIEW_CALLBACK_PREFIX) {
    return null;
  }

  const action =
    parts[1] === 'approve'
      ? 'approve'
      : parts[1] === 'claim'
      ? 'claim'
        : parts[1] === 'next'
          ? 'next'
          : parts[1] === 'prev'
            ? 'prev'
      : parts[1] === 'reject'
        ? 'reject'
        : parts[1] === 'reject_duplicate'
          ? 'reject_duplicate'
          : parts[1] === 'reject_blurry'
            ? 'reject_blurry'
            : parts[1] === 'reject_wrong_amount'
              ? 'reject_wrong_amount'
              : null;
  const orderId = parts[2]?.trim();

  if (!action || !orderId) {
    return null;
  }

  return {
    action,
    orderId,
    secondary: parts[3]?.trim() || null,
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

export function parseTelegramOrderActionCallbackData(data?: string | null): TelegramOrderActionCallbackPayload | null {
  if (!data) {
    return null;
  }

  const parts = data.split(':');
  if (parts.length < 3 || parts[0] !== TELEGRAM_ORDER_ACTION_CALLBACK_PREFIX) {
    return null;
  }

  const action = parts[1];
  if (!['pl', 'ky', 'sv', 'pm', 'pay', 'up', 'st', 'rf', 'ca', 'by', 'cp', 'rt', 'sh', 'rc'].includes(action)) {
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
    case 'trial_coupon':
    case 'trial_expired':
    case 'renewal_coupon':
    case 'renewal_7d':
    case 'renewal_3d':
    case 'renewal_manual':
    case 'premium_upsell_coupon':
    case 'premium_renewal_7d':
    case 'premium_renewal_3d':
    case 'winback_coupon':
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
    case 'renewal_coupon':
    case 'expired_recovery':
      return secondary;
    case 'dynamic_renewal_coupon':
      return 'renewal_coupon';
    case 'dynamic_renewal_7d':
      return 'premium_renewal_7d';
    case 'dynamic_renewal_3d':
      return 'premium_renewal_3d';
    case 'dynamic_premium_upsell_coupon':
      return 'premium_upsell_coupon';
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

export function parseTelegramServerChangeReviewCallbackData(
  data?: string | null,
): TelegramServerChangeReviewCallbackPayload | null {
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

export function parseTelegramServerChangeActionCallbackData(
  data?: string | null,
): TelegramServerChangeActionCallbackPayload | null {
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

export function parseTelegramDynamicSupportActionCallbackData(
  data?: string | null,
): TelegramDynamicSupportActionCallbackPayload | null {
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

export function parseTelegramNotificationPreferenceCallbackData(
  data?: string | null,
): TelegramNotificationPreferenceCallbackPayload | null {
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

export function buildTelegramMenuCallbackData(
  section: TelegramMenuSection,
  action: string,
) {
  return `${TELEGRAM_MENU_CALLBACK_PREFIX}:${section}:${action}`;
}

const TELEGRAM_COMMERCE_VIEW_SECTION_CODES: Record<TelegramCommerceViewSection, string> = {
  buy: 'b',
  keys: 'k',
  premium: 'p',
  premiumregion: 'r',
  supportstatus: 's',
  orders: 'o',
  renew: 'n',
};

const TELEGRAM_COMMERCE_VIEW_ACTION_CODES: Record<TelegramCommerceViewAction, string> = {
  home: 'h',
  page: 'p',
  detail: 'd',
  compare: 'c',
  filter: 'f',
};

function decodeTelegramCommerceViewSection(code?: string | null): TelegramCommerceViewSection | null {
  switch (code) {
    case 'b':
      return 'buy';
    case 'k':
      return 'keys';
    case 'p':
      return 'premium';
    case 'r':
      return 'premiumregion';
    case 's':
      return 'supportstatus';
    case 'o':
      return 'orders';
    case 'n':
      return 'renew';
    default:
      return null;
  }
}

function decodeTelegramCommerceViewAction(code?: string | null): TelegramCommerceViewAction | null {
  switch (code) {
    case 'h':
      return 'home';
    case 'p':
      return 'page';
    case 'd':
      return 'detail';
    case 'c':
      return 'compare';
    case 'f':
      return 'filter';
    default:
      return null;
  }
}

export function buildTelegramCommerceViewCallbackData(
  section: TelegramCommerceViewSection,
  action: TelegramCommerceViewAction,
  primary?: string | null,
  secondary?: string | null,
) {
  const parts = [
    TELEGRAM_COMMERCE_VIEW_CALLBACK_PREFIX,
    TELEGRAM_COMMERCE_VIEW_SECTION_CODES[section],
    TELEGRAM_COMMERCE_VIEW_ACTION_CODES[action],
  ];

  if (primary) {
    parts.push(primary);
  }

  if (secondary) {
    parts.push(secondary);
  }

  return parts.join(':');
}

export function parseTelegramCommerceViewCallbackData(
  data?: string | null,
): TelegramCommerceViewCallbackPayload | null {
  if (!data) {
    return null;
  }

  const parts = data.split(':');
  if (parts.length < 3 || parts[0] !== TELEGRAM_COMMERCE_VIEW_CALLBACK_PREFIX) {
    return null;
  }

  const section = decodeTelegramCommerceViewSection(parts[1]);
  const action = decodeTelegramCommerceViewAction(parts[2]);
  if (!section || !action) {
    return null;
  }

  return {
    section,
    action,
    primary: parts[3]?.trim() || null,
    secondary: parts[4]?.trim() || null,
  };
}

export function parseTelegramMenuCallbackData(data?: string | null): TelegramMenuCallbackPayload | null {
  if (!data) {
    return null;
  }

  const parts = data.split(':');
  if (parts.length !== 3 || parts[0] !== TELEGRAM_MENU_CALLBACK_PREFIX) {
    return null;
  }

  const section =
    parts[1] === 'admin'
      ? 'admin'
      : parts[1] === 'inbox'
        ? 'inbox'
        : parts[1] === 'offers'
          ? 'offers'
          : parts[1] === 'orders'
            ? 'orders'
          : parts[1] === 'support'
            ? 'support'
          : null;

  if (!section) {
    return null;
  }

  return {
    section,
    action: parts[2]?.trim() || '',
  } as const;
}

export function buildTelegramSupportQueueCallbackData(
  action: TelegramSupportQueueAction,
  requestId: string,
  secondary?: string,
) {
  return secondary
    ? `${TELEGRAM_SUPPORT_QUEUE_CALLBACK_PREFIX}:${action}:${requestId}:${secondary}`
    : `${TELEGRAM_SUPPORT_QUEUE_CALLBACK_PREFIX}:${action}:${requestId}`;
}

export function parseTelegramSupportQueueCallbackData(
  data?: string | null,
): TelegramSupportQueueCallbackPayload | null {
  if (!data) {
    return null;
  }

  const parts = data.split(':');
  if (parts.length < 3 || parts.length > 4 || parts[0] !== TELEGRAM_SUPPORT_QUEUE_CALLBACK_PREFIX) {
    return null;
  }

  const action =
    parts[1] === 'wk'
      ? 'wk'
      : parts[1] === 'nd'
        ? 'nd'
        : parts[1] === 'hd'
          ? 'hd'
          : parts[1] === 'nx'
            ? 'nx'
            : parts[1] === 'cl'
              ? 'cl'
              : parts[1] === 'uc'
                ? 'uc'
                : parts[1] === 'rp'
                  ? 'rp'
                  : parts[1] === 'es'
                    ? 'es'
                    : null;
  const requestId = parts[2]?.trim();

  if (!action || !requestId) {
    return null;
  }

  return {
    action,
    requestId,
    secondary: parts[3]?.trim() || null,
  } as const;
}

export function buildTelegramSupportThreadCallbackData(
  action: TelegramSupportThreadAction,
  primary: string,
  secondary?: string,
) {
  return secondary
    ? `${TELEGRAM_SUPPORT_THREAD_CALLBACK_PREFIX}:${action}:${primary}:${secondary}`
    : `${TELEGRAM_SUPPORT_THREAD_CALLBACK_PREFIX}:${action}:${primary}`;
}

export function parseTelegramSupportThreadCallbackData(
  data?: string | null,
): TelegramSupportThreadCallbackPayload | null {
  if (!data) {
    return null;
  }

  const parts = data.split(':');
  if (parts.length < 3 || parts.length > 4 || parts[0] !== TELEGRAM_SUPPORT_THREAD_CALLBACK_PREFIX) {
    return null;
  }

  const action =
    parts[1] === 'new'
      ? 'new'
      : parts[1] === 'reply'
        ? 'reply'
        : parts[1] === 'status'
          ? 'status'
          : parts[1] === 'escalate'
            ? 'escalate'
            : null;

  if (!action || !parts[2]?.trim()) {
    return null;
  }

  return {
    action,
    primary: parts[2].trim(),
    secondary: parts[3]?.trim() || null,
  } as const;
}

export function buildTelegramAdminKeyCallbackData(
  action: string,
  primary?: string | null,
  secondary?: string | null,
) {
  return [
    TELEGRAM_ADMIN_KEY_CALLBACK_PREFIX,
    action,
    primary?.trim() || '',
    secondary?.trim() || '',
  ]
    .filter((part, index) => index < 2 || part.length > 0)
    .join(':');
}

export function parseTelegramAdminKeyCallbackData(
  data?: string | null,
): TelegramAdminKeyCallbackPayload | null {
  if (!data) {
    return null;
  }

  const parts = data.split(':');
  if (parts.length < 2 || parts[0] !== TELEGRAM_ADMIN_KEY_CALLBACK_PREFIX) {
    return null;
  }

  return {
    action: parts[1]?.trim() || '',
    primary: parts[2]?.trim() || null,
    secondary: parts[3]?.trim() || null,
  } as const;
}
