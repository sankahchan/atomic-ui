import { db } from '@/lib/db';
import { type SupportedLocale } from '@/lib/i18n/config';
import {
  buildSharePageUrl,
  buildShortShareUrl,
} from '@/lib/subscription-links';
import { findLinkedAccessKeys, findLinkedDynamicAccessKeys } from '@/lib/services/telegram-keys';
import {
  ensureAccessKeySubscriptionToken,
  getDynamicKeyMessagingUrls,
} from '@/lib/services/telegram-links';
import {
  generateTelegramOrderCode,
  getTelegramSalesSettings,
  resolveTelegramSalesPlan,
  type TelegramSalesPlan,
  type TelegramSalesPlanCode,
  type TelegramSalesSettings,
} from '@/lib/services/telegram-sales';
import {
  getFlagEmoji,
  getTelegramAccessKeyCategory,
} from '@/lib/services/telegram-ui';

export type TelegramStorePlanId =
  | 'plan_basic'
  | 'plan_pro'
  | 'plan_ultra'
  | 'plan_season_lite'
  | 'plan_season_plus'
  | 'plan_season_max'
  | 'plan_dynamic_standard'
  | 'plan_dynamic_pro'
  | 'plan_dynamic_ultra';

type TelegramStoreCategory = 'flash' | 'season' | 'dynamic';

type TelegramStorePlanSpec = {
  id: TelegramStorePlanId;
  planCode: TelegramSalesPlanCode;
  category: TelegramStoreCategory;
  messageIndex: string;
  buttonLabel: string;
  listLabel: string;
  buttonName: string;
  detailName: string;
  badge: 'popular' | 'best_deal' | null;
  fallbackDurationLabel: string;
  fallbackCategoryHeading: string;
};

export type TelegramStoreResolvedPlan = {
  id: TelegramStorePlanId;
  planCode: TelegramSalesPlanCode;
  category: TelegramStoreCategory;
  messageIndex: string;
  buttonLabel: string;
  listLabel: string;
  buttonName: string;
  detailName: string;
  badge: 'popular' | 'best_deal' | null;
  plan: TelegramSalesPlan;
  dataLabel: string;
  durationLabel: string;
  priceAmount: number;
  priceLabel: string;
  switchesValue: number;
  switchesLabel: string;
  switchesMaxLabel: string;
  keyTypeLabel: string;
};

type TelegramStoreKeyKind = 'access' | 'dynamic';
export type TelegramStoreGuidePlatform = 'android' | 'ios' | 'windows' | 'macos';

export type TelegramStoreKeyView = {
  id: string;
  kind: TelegramStoreKeyKind;
  planId: TelegramStorePlanId | null;
  planName: string;
  categoryLabel: string;
  usedLabel: string;
  totalLabel: string;
  progressBar: string;
  percentLabel: string;
  expiryLabel: string;
  switchesUsed: number;
  switchesMaxLabel: string;
  renewPriceLabel: string | null;
  currentServerName: string;
  usedBytes?: number;
  totalBytes?: number | null;
  expiresAt?: Date | null;
};

export type TelegramStoreSwitchKeyView = {
  id: string;
  kind: TelegramStoreKeyKind;
  planName: string;
  currentServerId: string | null;
  currentServerName: string;
  switchesUsed: number;
  switchesMax: number;
  switchesMaxLabel: string;
};

export type TelegramStoreServerOption = {
  id: string;
  name: string;
  flag: string;
  location: string;
};

export type TelegramStoreRenewTarget = {
  kind: TelegramStoreKeyKind;
  keyId: string;
};

export type TelegramStoreLatestOrderForKey = {
  id: string;
  planCode: string | null;
  approvedAccessKeyId: string | null;
  targetAccessKeyId: string | null;
  approvedDynamicKeyId: string | null;
  targetDynamicKeyId: string | null;
} | null;

export type TelegramStoreGuideKeyData = {
  id: string;
  kind: TelegramStoreKeyKind;
  variant: 'paid' | 'trial';
  planId: TelegramStorePlanId | null;
  planName: string;
  categoryLabel: string;
  statusLabel: string;
  currentServerName: string;
  keyTypeLabel: string;
  dataLabel: string;
  usedLabel: string;
  totalLabel: string;
  progressBar: string;
  percentLabel: string;
  expiryLabel: string;
  paidLabel: string;
  switchesLabel: string;
  switchesUsed: number;
  switchesMaxLabel: string;
  switchesMax: number;
  renewPriceLabel: string | null;
  deviceLimitLabel: string | null;
  showSwitchButton: boolean;
  accessKeyText: string;
};

export type TelegramStoreCallbackPayload =
  | { action: 'show_plans' }
  | { action: 'main_menu' }
  | { action: 'my_account' }
  | { action: 'support_contact' }
  | { action: 'help' }
  | { action: 'mykeys_home' }
  | { action: 'setup_home' }
  | { action: 'setup_platform'; platform: TelegramStoreGuidePlatform }
  | { action: 'referral' }
  | { action: 'setup_guide'; keyId: string }
  | { action: 'platform_select'; keyId: string }
  | { action: 'guide_platform'; keyId: string; platform: TelegramStoreGuidePlatform }
  | { action: 'key_page'; keyId: string }
  | { action: 'order_plan'; planId: TelegramStorePlanId }
  | { action: 'confirm'; planId: TelegramStorePlanId }
  | { action: 'coupon'; planId: TelegramStorePlanId }
  | { action: 'renew_plan'; planId: TelegramStorePlanId; keyId: string; kind: TelegramStoreKeyKind }
  | { action: 'switch'; keyId: string }
  | { action: 'switchkey'; keyId: string }
  | { action: 'confirm_switch'; keyId: string; serverId: string }
  | { action: 'doswitch'; keyId: string; serverId: string }
  | { action: 'noop' };

const STORE_PLAN_SPECS: TelegramStorePlanSpec[] = [
  {
    id: 'plan_basic',
    planCode: '1m_150gb',
    category: 'flash',
    messageIndex: '①',
    buttonLabel: '1️⃣ 🪨 Basic',
    listLabel: '🪨 Basic',
    buttonName: '🪨 Basic',
    detailName: '🪨 Basic',
    badge: null,
    fallbackDurationLabel: '30 days',
    fallbackCategoryHeading: 'Flash Plans',
  },
  {
    id: 'plan_pro',
    planCode: '1m_200gb',
    category: 'flash',
    messageIndex: '②',
    buttonLabel: '2️⃣ 💎 Pro ★',
    listLabel: '💎 Pro',
    buttonName: '💎 Pro ★',
    detailName: '💎 Pro',
    badge: 'popular',
    fallbackDurationLabel: '30 days',
    fallbackCategoryHeading: 'Flash Plans',
  },
  {
    id: 'plan_ultra',
    planCode: '1m_350gb',
    category: 'flash',
    messageIndex: '③',
    buttonLabel: '3️⃣ 🚀 Ultra ★★',
    listLabel: '🚀 Ultra',
    buttonName: '🚀 Ultra ★★',
    detailName: '🚀 Ultra',
    badge: 'best_deal',
    fallbackDurationLabel: '30 days',
    fallbackCategoryHeading: 'Flash Plans',
  },
  {
    id: 'plan_season_lite',
    planCode: '3m_300gb',
    category: 'season',
    messageIndex: '④',
    buttonLabel: '4️⃣ 🌿 Lite',
    listLabel: '🌿 Lite',
    buttonName: '🌿 Lite',
    detailName: '🌿 Lite',
    badge: null,
    fallbackDurationLabel: '90 days',
    fallbackCategoryHeading: 'Season Plans',
  },
  {
    id: 'plan_season_plus',
    planCode: '3m_600gb',
    category: 'season',
    messageIndex: '⑤',
    buttonLabel: '5️⃣ 🌟 Plus ★',
    listLabel: '🌟 Plus',
    buttonName: '🌟 Plus ★',
    detailName: '🌟 Plus',
    badge: 'popular',
    fallbackDurationLabel: '90 days',
    fallbackCategoryHeading: 'Season Plans',
  },
  {
    id: 'plan_season_max',
    planCode: '3m_1050gb',
    category: 'season',
    messageIndex: '⑥',
    buttonLabel: '6️⃣ 👑 Max ★★',
    listLabel: '👑 Max',
    buttonName: '👑 Max ★★',
    detailName: '👑 Max',
    badge: 'best_deal',
    fallbackDurationLabel: '90 days',
    fallbackCategoryHeading: 'Season Plans',
  },
  {
    id: 'plan_dynamic_standard',
    planCode: '1m_200gb_dynamic',
    category: 'dynamic',
    messageIndex: '⑦',
    buttonLabel: '7️⃣ 🪨 Std',
    listLabel: '🪨 Standard',
    buttonName: '🪨 Std',
    detailName: '🪨 Standard',
    badge: null,
    fallbackDurationLabel: '1 Month',
    fallbackCategoryHeading: 'Dynamic Plans',
  },
  {
    id: 'plan_dynamic_pro',
    planCode: '2m_300gb_dynamic',
    category: 'dynamic',
    messageIndex: '⑧',
    buttonLabel: '8️⃣ 💎 Pro ★',
    listLabel: '💎 Pro',
    buttonName: '💎 Pro ★',
    detailName: '💎 Pro',
    badge: 'popular',
    fallbackDurationLabel: '2 Months',
    fallbackCategoryHeading: 'Dynamic Plans',
  },
  {
    id: 'plan_dynamic_ultra',
    planCode: '3m_600gb_dynamic',
    category: 'dynamic',
    messageIndex: '⑨',
    buttonLabel: '9️⃣ 🚀 Ultra ★★',
    listLabel: '🚀 Ultra',
    buttonName: '🚀 Ultra ★★',
    detailName: '🚀 Ultra',
    badge: 'best_deal',
    fallbackDurationLabel: '3 Months',
    fallbackCategoryHeading: 'Dynamic Plans',
  },
];

const TELEGRAM_MARKDOWN_V2_SPECIAL_CHARS = /([_*\[\]()~`>#+\-=|{}.!\\])/g;
const GUIDE_PLATFORM_LABELS: Record<TelegramStoreGuidePlatform, string> = {
  android: '🤖 Android',
  ios: '🍎 iOS',
  windows: '🪟 Windows',
  macos: '🍏 macOS',
};

type TelegramStorePlatformGuideConfig = {
  title: string;
  bodyLines: string[];
  downloadButtons: Array<{ text: string; url: string }>;
  quickSwitches: Array<{ text: string; platform: TelegramStoreGuidePlatform }>;
};

const GUIDE_PLATFORM_CONTENT: Record<TelegramStoreGuidePlatform, TelegramStorePlatformGuideConfig> = {
  android: {
    title: "🤖 *Android  —  You're almost connected\\!*",
    bodyLines: [
      '*Step 2* — Download your app:',
      '',
      '╔══════════════════════════════════╗',
      '║  🔵 OUTLINE           Easiest   ║',
      '╠══════════════════════════════════╣',
      '║  ① Tap download → Install       ║',
      '║  ② Open → Tap ✚                 ║',
      '║  ③ Paste your key               ║',
      '║  ④ Tap *Connect* 🟢             ║',
      '╚══════════════════════════════════╝',
      '',
      '╔══════════════════════════════════╗',
      '║  🟣 HIDDIFY         Most Popular ║',
      '╠══════════════════════════════════╣',
      '║  ① Tap download → Install       ║',
      '║  ② Tap *Add Config*             ║',
      '║  ③ Paste your key → *Add*       ║',
      '║  ④ Tap *Connect* 🟢             ║',
      '╚══════════════════════════════════╝',
      '',
      '╔══════════════════════════════════╗',
      '║  🔴 V2RAYNG             Advanced ║',
      '╠══════════════════════════════════╣',
      '║  ① Tap download → Install       ║',
      '║  ② Tap ✚ → *Import clipboard*   ║',
      '║  ③ Paste your key               ║',
      '║  ④ Tap ▶️ to start 🟢           ║',
      '╚══════════════════════════════════╝',
    ],
    downloadButtons: [
      {
        text: '⬇️ Download Outline  (Play Store)',
        url: 'https://play.google.com/store/apps/details?id=org.outline.android.client',
      },
      {
        text: '⬇️ Download Hiddify  (Play Store)',
        url: 'https://play.google.com/store/apps/details?id=app.hiddify.com',
      },
      {
        text: '⬇️ Download V2RayNG (Play Store)',
        url: 'https://play.google.com/store/apps/details?id=com.v2ray.ang',
      },
    ],
    quickSwitches: [
      { text: '🍎 iOS', platform: 'ios' },
      { text: '🪟 Windows', platform: 'windows' },
      { text: '🍏 Mac', platform: 'macos' },
    ],
  },
  ios: {
    title: "🍎 *iOS  —  You're almost connected\\!*",
    bodyLines: [
      '*Step 2* — Download your app:',
      '',
      '╔══════════════════════════════════╗',
      '║  🔵 OUTLINE           Easiest   ║',
      '╠══════════════════════════════════╣',
      '║  ① Tap download → Install       ║',
      '║  ② Open → Tap ✚                 ║',
      '║  ③ Paste your key               ║',
      '║  ④ Tap *Connect*                ║',
      '║  ⑤ Tap *Allow* for VPN 🟢       ║',
      '╚══════════════════════════════════╝',
      '',
      '╔══════════════════════════════════╗',
      '║  🟣 HIDDIFY NEXT    Most Popular ║',
      '╠══════════════════════════════════╣',
      '║  ① Tap download → Install       ║',
      '║  ② Tap *Add Config*             ║',
      '║  ③ Paste your key → *Add*       ║',
      '║  ④ Tap *Connect* 🟢             ║',
      '╚══════════════════════════════════╝',
      '',
      '╔══════════════════════════════════╗',
      '║  🔴 V2BOX                   Pro  ║',
      '╠══════════════════════════════════╣',
      '║  ① Tap download → Install       ║',
      '║  ② Tap ✚ → *Import from URL*    ║',
      '║  ③ Paste your key → *Import*    ║',
      '║  ④ Tap the config to select it  ║',
      '║  ⑤ Tap *Connect* 🟢             ║',
      '╚══════════════════════════════════╝',
    ],
    downloadButtons: [
      {
        text: '⬇️ Download Outline   (App Store)',
        url: 'https://apps.apple.com/app/outline-app/id1356177741',
      },
      {
        text: '⬇️ Download Hiddify   (App Store)',
        url: 'https://apps.apple.com/app/hiddify-next/id6596777532',
      },
      {
        text: '⬇️ Download V2Box     (App Store)',
        url: 'https://apps.apple.com/us/app/v2box-v2ray-client/id6446814690',
      },
    ],
    quickSwitches: [
      { text: '🤖 Android', platform: 'android' },
      { text: '🪟 Windows', platform: 'windows' },
      { text: '🍏 Mac', platform: 'macos' },
    ],
  },
  windows: {
    title: "🪟 *Windows  —  You're almost connected\\!*",
    bodyLines: [
      '*Step 2* — Download your app:',
      '',
      '╔══════════════════════════════════╗',
      '║  🔵 OUTLINE           Easiest   ║',
      '╠══════════════════════════════════╣',
      '║  ① Tap download → Install       ║',
      '║  ② Click ✚ → Paste your key     ║',
      '║  ③ Click *Connect* 🟢           ║',
      '╚══════════════════════════════════╝',
      '',
      '╔══════════════════════════════════╗',
      '║  🟣 HIDDIFY         Most Popular ║',
      '╠══════════════════════════════════╣',
      '║  ① Tap download → Install       ║',
      '║  ② Click *Add Profile*          ║',
      '║  ③ Paste your key → *Add*       ║',
      '║  ④ Click *Connect* 🟢           ║',
      '╚══════════════════════════════════╝',
      '',
      '╔══════════════════════════════════╗',
      '║  🔴 V2RAYN              Advanced ║',
      '╠══════════════════════════════════╣',
      '║  ① Tap download → Extract       ║',
      '║  ② Run *v2rayN\\.exe*            ║',
      '║  ③ Servers → *Add \\[SS\\] server* ║',
      '║  ④ Paste key → Save             ║',
      '║  ⑤ Tray icon → *Enable* 🟢      ║',
      '╚══════════════════════════════════╝',
    ],
    downloadButtons: [
      {
        text: '⬇️ Download Outline  (Windows)',
        url: 'https://s3.amazonaws.com/outline-releases/client/windows/stable/Outline-Client.exe',
      },
      {
        text: '⬇️ Download Hiddify  (Windows)',
        url: 'https://github.com/hiddify/hiddify-app/releases/latest',
      },
      {
        text: '⬇️ Download V2RayN   (GitHub)',
        url: 'https://github.com/2dust/v2rayN/releases/latest',
      },
    ],
    quickSwitches: [
      { text: '🤖 Android', platform: 'android' },
      { text: '🍎 iOS', platform: 'ios' },
      { text: '🍏 Mac', platform: 'macos' },
    ],
  },
  macos: {
    title: "🍏 *macOS  —  You're almost connected\\!*",
    bodyLines: [
      '*Step 2* — Download your app:',
      '',
      '╔══════════════════════════════════╗',
      '║  🔵 OUTLINE           Easiest   ║',
      '╠══════════════════════════════════╣',
      '║  ① Tap download → Install       ║',
      '║  ② Click ✚ → Paste your key     ║',
      '║  ③ Click *Connect* 🟢           ║',
      '╚══════════════════════════════════╝',
      '',
      '╔══════════════════════════════════╗',
      '║  🟣 HIDDIFY         Most Popular ║',
      '╠══════════════════════════════════╣',
      '║  ① Tap download → Install       ║',
      '║  ② Click *Add Profile*          ║',
      '║  ③ Paste your key → *Add*       ║',
      '║  ④ Click *Connect* 🟢           ║',
      '╚══════════════════════════════════╝',
      '',
      '╔══════════════════════════════════╗',
      '║  🔴 V2RAYX / MANGO      Advanced ║',
      '╠══════════════════════════════════╣',
      '║  ① Tap download → Install       ║',
      '║  ② Click ✚ → Paste your key     ║',
      '║  ③ Menu bar → *Global Mode* 🟢  ║',
      '╚══════════════════════════════════╝',
    ],
    downloadButtons: [
      {
        text: '⬇️ Download Outline  (Mac Store)',
        url: 'https://apps.apple.com/app/outline-secure-internet-access/id1356178125',
      },
      {
        text: '⬇️ Download Hiddify  (Mac)',
        url: 'https://github.com/hiddify/hiddify-app/releases/latest',
      },
      {
        text: '⬇️ Download V2RayX   (GitHub)',
        url: 'https://github.com/Cenmrev/V2RayX/releases/latest',
      },
    ],
    quickSwitches: [
      { text: '🤖 Android', platform: 'android' },
      { text: '🍎 iOS', platform: 'ios' },
      { text: '🪟 Win', platform: 'windows' },
    ],
  },
};

export function escapeTelegramMarkdownV2(value: string) {
  return value.replace(TELEGRAM_MARKDOWN_V2_SPECIAL_CHARS, '\\$1');
}

export function formatTelegramMarkdownCode(value: string) {
  return `\`${value.replace(/\\/g, '\\\\').replace(/`/g, '\\`')}\``;
}

function formatStorePriceAmount(amount: number | null | undefined) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    return '—';
  }
  return `${new Intl.NumberFormat('en-US').format(amount)} Ks`;
}

function formatStoreDataLabel(gigabytes: number | null | undefined) {
  if (typeof gigabytes !== 'number' || !Number.isFinite(gigabytes) || gigabytes <= 0) {
    return 'Unlimited';
  }
  const value = Number.isInteger(gigabytes)
    ? String(gigabytes)
    : gigabytes.toFixed(1).replace(/\.0$/, '');
  return `${value} GB`;
}

export function badgeStar(badge: string | null | undefined) {
  if (badge === 'popular') {
    return '★';
  }
  if (badge === 'best_deal') {
    return '★★';
  }
  return '';
}

export function switchesLabel(n: number) {
  if (n === -1) {
    return 'Unlimited ∞';
  }
  return `${n} times`;
}

export function switchesMaxLabel(n: number) {
  if (n === -1) {
    return '∞';
  }
  return String(Math.max(0, n));
}

export function keyTypeLabel(deliveryType: string) {
  return deliveryType === 'DYNAMIC_KEY' ? 'Dynamic Key ⚙️' : 'Standard Key';
}

export function progressBar(used: number, total: number, length = 10) {
  if (!Number.isFinite(total) || total <= 0) {
    return `${'░'.repeat(length)} 0%`;
  }

  const pct = Math.min(Math.max(used / total, 0), 1);
  const filled = Math.max(0, Math.min(length, Math.round(pct * length)));
  const block = pct <= 0.4 ? '🟩' : pct <= 0.7 ? '🟧' : '🟥';
  return `${block.repeat(filled)}${'░'.repeat(length - filled)} ${Math.round(pct * 100)}%`;
}

export function usageBar(used: number, total: number, length = 10) {
  const [bar] = progressBar(used, total, length).split(' ');
  return `${bar || '░'.repeat(length)}  ${formatBytesToGbLabel(BigInt(Math.max(0, Math.round(used))))}/${formatBytesToGbLabel(BigInt(Math.max(0, Math.round(total))))}`;
}

export function formatStoreDate(date?: Date | null) {
  if (!date) {
    return '—';
  }
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatCategoryLabel(category: TelegramStoreCategory) {
  switch (category) {
    case 'season':
      return 'Season';
    case 'dynamic':
      return 'Dynamic';
    default:
      return 'Flash';
  }
}

function formatBytesToGbLabel(bytes?: bigint | null) {
  if (!bytes || bytes <= BigInt(0)) {
    return 'Unlimited';
  }
  const gb = Number(bytes) / (1024 * 1024 * 1024);
  return `${gb % 1 === 0 ? gb.toFixed(0) : gb.toFixed(1)} GB`;
}

function formatTelegramStoreDeviceLimitLabel(input: {
  limit?: number | null;
  boundDeviceInstallsOnly?: boolean | null;
}) {
  if (!input.limit || input.limit < 1) {
    return null;
  }

  if (input.boundDeviceInstallsOnly) {
    return `${input.limit} device${input.limit === 1 ? '' : 's'} on protected install`;
  }

  return `${input.limit} estimated device${input.limit === 1 ? '' : 's'}`;
}

function formatTelegramStoreStatusLabel(status: string, variant: 'paid' | 'trial') {
  if (status === 'ACTIVE') {
    return variant === 'trial' ? 'Trial active' : 'Active';
  }

  if (status === 'DISABLED') {
    return 'Disabled';
  }

  if (status === 'PENDING') {
    return 'Pending';
  }

  if (status === 'EXPIRED') {
    return 'Expired';
  }

  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}

function formatCurrentServerName(input: {
  name?: string | null;
  countryCode?: string | null;
}) {
  if (!input.name) {
    return 'Auto';
  }
  return `${input.name}${input.countryCode ? ` ${getFlagEmoji(input.countryCode)}` : ''}`;
}

function buildStorePlanKeyboardRow(plans: TelegramStoreResolvedPlan[]) {
  return plans.map((plan) => ({
    text: plan.buttonLabel,
    callback_data: buildTelegramStorefrontCallbackData({
      action: 'order_plan',
      planId: plan.id,
    }),
  }));
}

function buildTelegramStoreRenewCallbackData(input: {
  plan: TelegramStoreResolvedPlan | null;
  renewTarget?: TelegramStoreRenewTarget | null;
}) {
  if (!input.plan) {
    return buildTelegramStorefrontCallbackData({ action: 'show_plans' });
  }

  if (input.renewTarget) {
    return buildTelegramStorefrontCallbackData({
      action: 'renew_plan',
      planId: input.plan.id,
      keyId: input.renewTarget.keyId,
      kind: input.renewTarget.kind,
    });
  }

  return buildTelegramStorefrontCallbackData({
    action: 'order_plan',
    planId: input.plan.id,
  });
}

export function buildTelegramStorefrontCallbackData(payload: TelegramStoreCallbackPayload) {
  switch (payload.action) {
    case 'show_plans':
      return 'show_plans';
    case 'main_menu':
      return 'main_menu';
    case 'my_account':
      return 'my_account';
    case 'support_contact':
      return 'support';
    case 'help':
      return 'help';
    case 'mykeys_home':
      return 'mykeys_home';
    case 'setup_home':
      return 'setup_home';
    case 'setup_platform':
      return `setup_platform_${payload.platform}`;
    case 'referral':
      return 'referral';
    case 'setup_guide':
      return `setup_guide_${payload.keyId}`;
    case 'platform_select':
      return `platform_select_${payload.keyId}`;
    case 'guide_platform':
      return `guide_${payload.platform}_${payload.keyId}`;
    case 'key_page':
      return `key_page_${payload.keyId}`;
    case 'order_plan':
      return `order_${payload.planId}`;
    case 'confirm':
      return `confirm_${payload.planId}`;
    case 'coupon':
      return `coupon_${payload.planId}`;
    case 'renew_plan':
      return `renew_${payload.kind}_${payload.keyId}_${payload.planId}`;
    case 'switch':
      return `switch_${payload.keyId}`;
    case 'switchkey':
      return `switchkey_${payload.keyId}`;
    case 'confirm_switch':
      return `confirm_switch_${payload.keyId}_${payload.serverId}`;
    case 'doswitch':
      return `doswitch_${payload.keyId}_${payload.serverId}`;
    case 'noop':
      return 'noop';
    default:
      return 'noop';
  }
}

export function parseTelegramStorefrontCallbackData(data?: string | null): TelegramStoreCallbackPayload | null {
  if (!data) {
    return null;
  }

  if (data === 'show_plans') {
    return { action: 'show_plans' };
  }
  if (data === 'main_menu') {
    return { action: 'main_menu' };
  }
  if (data === 'my_account') {
    return { action: 'my_account' };
  }
  if (data === 'noop') {
    return { action: 'noop' };
  }
  if (data === 'support') {
    return { action: 'support_contact' };
  }
  if (data === 'help') {
    return { action: 'help' };
  }
  if (data === 'mykeys_home') {
    return { action: 'mykeys_home' };
  }
  if (data === 'setup_home') {
    return { action: 'setup_home' };
  }
  if (data === 'referral') {
    return { action: 'referral' };
  }
  if (data.startsWith('setup_platform_')) {
    const platform = data.slice('setup_platform_'.length).trim();
    if (platform === 'android' || platform === 'ios' || platform === 'windows' || platform === 'macos') {
      return {
        action: 'setup_platform',
        platform,
      };
    }
  }

  if (data.startsWith('setup_guide_')) {
    const keyId = data.slice('setup_guide_'.length).trim();
    if (keyId) {
      return { action: 'setup_guide', keyId };
    }
  }

  if (data.startsWith('platform_select_')) {
    const keyId = data.slice('platform_select_'.length).trim();
    if (keyId) {
      return { action: 'platform_select', keyId };
    }
  }

  if (data.startsWith('confirm_switch_')) {
    const parts = data.slice('confirm_switch_'.length).split('_');
    if (parts.length === 2) {
      return {
        action: 'confirm_switch',
        keyId: parts[0],
        serverId: parts[1],
      };
    }
  }

  if (data.startsWith('guide_')) {
    const match = /^guide_(android|ios|windows|macos)_(.+)$/.exec(data);
    if (match?.[1] && match?.[2]) {
      return {
        action: 'guide_platform',
        platform: match[1] as TelegramStoreGuidePlatform,
        keyId: match[2].trim(),
      };
    }
  }

  if (data.startsWith('key_page_')) {
    const keyId = data.slice('key_page_'.length).trim();
    if (keyId) {
      return { action: 'key_page', keyId };
    }
  }

  if (data.startsWith('order_')) {
    const planId = data.slice('order_'.length) as TelegramStorePlanId;
    if (STORE_PLAN_SPECS.some((plan) => plan.id === planId)) {
      return { action: 'order_plan', planId };
    }
  }

  if (data.startsWith('confirm_')) {
    const planId = data.slice('confirm_'.length) as TelegramStorePlanId;
    if (STORE_PLAN_SPECS.some((plan) => plan.id === planId)) {
      return { action: 'confirm', planId };
    }
  }

  if (data.startsWith('coupon_')) {
    const planId = data.slice('coupon_'.length) as TelegramStorePlanId;
    if (STORE_PLAN_SPECS.some((plan) => plan.id === planId)) {
      return { action: 'coupon', planId };
    }
  }

  if (data.startsWith('renew_')) {
    const parts = data.split('_');
    if (parts.length >= 4) {
      const kind = parts[1] === 'dynamic' ? 'dynamic' : parts[1] === 'access' ? 'access' : null;
      const keyId = parts[2]?.trim();
      const planId = parts.slice(3).join('_') as TelegramStorePlanId;
      if (kind && keyId && STORE_PLAN_SPECS.some((plan) => plan.id === planId)) {
        return { action: 'renew_plan', kind, keyId, planId };
      }
    }
  }

  if (data.startsWith('switchkey_')) {
    const keyId = data.slice('switchkey_'.length).trim();
    if (keyId) {
      return { action: 'switchkey', keyId };
    }
  }

  if (data.startsWith('switch_')) {
    const keyId = data.slice('switch_'.length).trim();
    if (keyId) {
      return { action: 'switch', keyId };
    }
  }

  if (data.startsWith('doswitch_')) {
    const remainder = data.slice('doswitch_'.length);
    const splitAt = remainder.indexOf('_');
    if (splitAt > 0) {
      const keyId = remainder.slice(0, splitAt).trim();
      const serverId = remainder.slice(splitAt + 1).trim();
      if (keyId && serverId) {
        return { action: 'doswitch', keyId, serverId };
      }
    }
  }

  return null;
}

export async function resolveTelegramStorePlans() {
  const settings = await getTelegramSalesSettings();
  return {
    settings,
    plans: resolveTelegramStorePlansFromSettings(settings),
  };
}

export function resolveTelegramStorePlansFromSettings(settings: TelegramSalesSettings) {
  return STORE_PLAN_SPECS.map((spec) => {
    const plan = resolveTelegramSalesPlan(settings, spec.planCode);
    if (!plan) {
      return null;
    }

    const priceAmount =
      typeof plan.priceAmount === 'number' && Number.isFinite(plan.priceAmount)
        ? plan.priceAmount
        : 0;

    return {
      id: spec.id,
      planCode: spec.planCode,
      category: spec.category,
      messageIndex: spec.messageIndex,
      buttonLabel: spec.buttonLabel,
      listLabel: spec.listLabel,
      buttonName: spec.buttonName,
      detailName: spec.detailName,
      badge: spec.badge,
      plan,
      dataLabel: formatStoreDataLabel(plan.dataLimitGB ?? null),
      durationLabel: plan.durationLabel?.trim() || spec.fallbackDurationLabel,
      priceAmount,
      priceLabel: formatStorePriceAmount(priceAmount),
      switchesValue: plan.serverSwitches ?? 0,
      switchesLabel: switchesLabel(plan.serverSwitches ?? 0),
      switchesMaxLabel: switchesMaxLabel(plan.serverSwitches ?? 0),
      keyTypeLabel: keyTypeLabel(plan.deliveryType),
    } satisfies TelegramStoreResolvedPlan;
  }).filter(Boolean) as TelegramStoreResolvedPlan[];
}

export function findTelegramStorePlanById(
  plans: TelegramStoreResolvedPlan[],
  planId: TelegramStorePlanId,
) {
  return plans.find((plan) => plan.id === planId) || null;
}

export function findTelegramStorePlanByCode(
  plans: TelegramStoreResolvedPlan[],
  planCode?: string | null,
) {
  if (!planCode) {
    return null;
  }
  return plans.find((plan) => plan.planCode === planCode) || null;
}

export async function loadTelegramStoreMainMenuData(input: {
  chatId: number;
  telegramUserId: number;
}) {
  const [accessKeys, dynamicKeys] = await Promise.all([
    findLinkedAccessKeys(input.chatId, input.telegramUserId, false),
    findLinkedDynamicAccessKeys(input.chatId, input.telegramUserId, false),
  ]);

  const activeAccess = accessKeys.filter((key) => key.status === 'ACTIVE');
  const activeDynamic = dynamicKeys.filter((key) => key.status === 'ACTIVE');
  const nextExpiry = [...activeAccess, ...activeDynamic]
    .map((key) => key.expiresAt)
    .filter((value): value is Date => value instanceof Date)
    .sort((a, b) => a.getTime() - b.getTime())[0] || null;

  return {
    activeKeyCount: activeAccess.length + activeDynamic.length,
    nextExpiryLabel: formatStoreDate(nextExpiry),
  };
}

export async function loadTelegramStoreRenewData(input: {
  chatId: number;
  telegramUserId: number;
}) {
  const { settings, plans } = await resolveTelegramStorePlans();
  const lastOrder = await db.telegramOrder.findFirst({
    where: {
      status: 'FULFILLED',
      planCode: { not: 'trial_1d_3gb' },
      OR: [
        { telegramChatId: String(input.chatId) },
        { telegramUserId: String(input.telegramUserId) },
      ],
    },
    orderBy: [
      { fulfilledAt: 'desc' },
      { createdAt: 'desc' },
    ],
    select: {
      id: true,
      planCode: true,
      planName: true,
      priceAmount: true,
      approvedAccessKeyId: true,
      targetAccessKeyId: true,
      approvedDynamicKeyId: true,
      targetDynamicKeyId: true,
    },
  });

  const plan = lastOrder ? findTelegramStorePlanByCode(plans, lastOrder.planCode) : null;
  const renewTarget =
    lastOrder?.approvedDynamicKeyId || lastOrder?.targetDynamicKeyId
      ? {
          kind: 'dynamic' as const,
          keyId: lastOrder.approvedDynamicKeyId || lastOrder.targetDynamicKeyId || '',
        }
      : lastOrder?.approvedAccessKeyId || lastOrder?.targetAccessKeyId
        ? {
            kind: 'access' as const,
            keyId: lastOrder.approvedAccessKeyId || lastOrder.targetAccessKeyId || '',
          }
        : null;

  return {
    settings,
    plans,
    lastOrder,
    plan,
    renewTarget,
  };
}

async function loadLatestOrdersForKeys(input: {
  accessKeyIds: string[];
  dynamicKeyIds: string[];
}) {
  if (input.accessKeyIds.length === 0 && input.dynamicKeyIds.length === 0) {
    return [];
  }

  return db.telegramOrder.findMany({
    where: {
      status: 'FULFILLED',
      OR: [
        ...(input.accessKeyIds.length > 0
          ? [
              { approvedAccessKeyId: { in: input.accessKeyIds } },
              { targetAccessKeyId: { in: input.accessKeyIds } },
            ]
          : []),
        ...(input.dynamicKeyIds.length > 0
          ? [
              { approvedDynamicKeyId: { in: input.dynamicKeyIds } },
              { targetDynamicKeyId: { in: input.dynamicKeyIds } },
            ]
          : []),
      ],
    },
    orderBy: [
      { fulfilledAt: 'desc' },
      { createdAt: 'desc' },
    ],
    select: {
      id: true,
      planCode: true,
      approvedAccessKeyId: true,
      targetAccessKeyId: true,
      approvedDynamicKeyId: true,
      targetDynamicKeyId: true,
    },
  });
}

export async function loadTelegramStoreLatestOrderForKey(input: TelegramStoreRenewTarget) {
  const orders = await loadLatestOrdersForKeys({
    accessKeyIds: input.kind === 'access' ? [input.keyId] : [],
    dynamicKeyIds: input.kind === 'dynamic' ? [input.keyId] : [],
  });

  return (orders[0] || null) as TelegramStoreLatestOrderForKey;
}

export async function loadTelegramStoreGuideKeyData(input: {
  chatId: number;
  telegramUserId: number;
  keyId: string;
  locale: SupportedLocale;
}) {
  const { plans } = await resolveTelegramStorePlans();
  const [accessKeys, dynamicKeys] = await Promise.all([
    findLinkedAccessKeys(input.chatId, input.telegramUserId, true),
    findLinkedDynamicAccessKeys(input.chatId, input.telegramUserId, true),
  ]);

  const accessKey = accessKeys.find((key) => key.id === input.keyId) || null;
  if (accessKey) {
    const variant = getTelegramAccessKeyCategory(accessKey.tags) === 'trial' ? 'trial' : 'paid';
    const latestOrder = await loadTelegramStoreLatestOrderForKey({
      kind: 'access',
      keyId: accessKey.id,
    });
    const plan = findTelegramStorePlanByCode(plans, latestOrder?.planCode || null);
    const used = Number(accessKey.usedBytes || BigInt(0));
    const total = accessKey.dataLimitBytes ? Number(accessKey.dataLimitBytes) : 0;
    const bar = progressBar(used, total || 1);
    const [barChars, percent] = bar.split(' ');
    let accessKeyText = accessKey.accessUrl || '';
    if (accessKey.boundDeviceInstallsOnly && accessKey.maxDevices) {
      const token = await ensureAccessKeySubscriptionToken(accessKey.id, accessKey.subscriptionToken);
      accessKeyText = accessKey.publicSlug
        ? buildShortShareUrl(accessKey.publicSlug, { source: 'telegram_setup_guide', lang: input.locale })
        : buildSharePageUrl(token, { source: 'telegram_setup_guide', lang: input.locale });
    }

    if (!accessKeyText) {
      return null;
    }

    return {
      id: accessKey.id,
      kind: 'access' as const,
      variant,
      planId: plan?.id || null,
      planName: plan?.detailName || accessKey.name,
      categoryLabel: variant === 'trial' ? 'Trial' : plan ? formatCategoryLabel(plan.category) : 'Flash',
      statusLabel: formatTelegramStoreStatusLabel(accessKey.status, variant),
      currentServerName: formatCurrentServerName({
        name: accessKey.server?.name,
        countryCode: accessKey.server?.countryCode,
      }),
      keyTypeLabel: plan?.keyTypeLabel || 'Standard Key',
      dataLabel: plan?.dataLabel || formatBytesToGbLabel(accessKey.dataLimitBytes),
      usedLabel: formatBytesToGbLabel(BigInt(used)),
      totalLabel: formatBytesToGbLabel(accessKey.dataLimitBytes),
      progressBar: barChars || '░░░░░░░░░░',
      percentLabel: percent || '0%',
      expiryLabel: formatStoreDate(accessKey.expiresAt),
      paidLabel: variant === 'trial'
        ? 'FREE'
        : latestOrder?.planCode
          ? plan?.priceLabel || '—'
          : '—',
      switchesLabel: plan?.switchesLabel || switchesLabel(accessKey.switchesMax),
      switchesUsed: accessKey.switchesUsed,
      switchesMaxLabel: switchesMaxLabel(accessKey.switchesMax),
      switchesMax: accessKey.switchesMax,
      renewPriceLabel: variant === 'trial' ? null : plan?.priceLabel || null,
      deviceLimitLabel: formatTelegramStoreDeviceLimitLabel({
        limit: accessKey.maxDevices,
        boundDeviceInstallsOnly: accessKey.boundDeviceInstallsOnly,
      }),
      showSwitchButton: accessKey.status === 'ACTIVE' && accessKey.switchesMax !== 0,
      accessKeyText,
    } satisfies TelegramStoreGuideKeyData;
  }

  const dynamicKey = dynamicKeys.find((key) => key.id === input.keyId) || null;
  if (!dynamicKey) {
    return null;
  }

  const latestOrder = await loadTelegramStoreLatestOrderForKey({
    kind: 'dynamic',
    keyId: dynamicKey.id,
  });
  const plan = findTelegramStorePlanByCode(plans, latestOrder?.planCode || null);
  const used = Number(dynamicKey.usedBytes || BigInt(0));
  const total = dynamicKey.dataLimitBytes ? Number(dynamicKey.dataLimitBytes) : 0;
  const bar = progressBar(used, total || 1);
  const [barChars, percent] = bar.split(' ');
  const currentServerId = dynamicKey.pinnedServerId || dynamicKey.lastResolvedServerId || '';
  const currentServer = currentServerId
    ? await db.server.findUnique({
        where: { id: currentServerId },
        select: { name: true, countryCode: true },
      })
    : null;
  const protectedInstallOnly = Boolean(dynamicKey.boundDeviceInstallsOnly && dynamicKey.maxDevices);
  const urls = getDynamicKeyMessagingUrls(dynamicKey, 'telegram_setup_guide', input.locale);
  const accessKeyText = protectedInstallOnly
    ? urls.sharePageUrl
    : urls.outlineClientUrl || urls.subscriptionUrl || urls.sharePageUrl;

  if (!accessKeyText) {
    return null;
  }

  return {
    id: dynamicKey.id,
    kind: 'dynamic' as const,
    variant: 'paid' as const,
    planId: plan?.id || null,
    planName: plan?.detailName || dynamicKey.name,
    categoryLabel: plan ? formatCategoryLabel(plan.category) : 'Dynamic',
    statusLabel: formatTelegramStoreStatusLabel(dynamicKey.status, 'paid'),
    currentServerName: formatCurrentServerName({
      name: currentServer?.name || null,
      countryCode: currentServer?.countryCode || null,
    }),
    keyTypeLabel: plan?.keyTypeLabel || 'Dynamic Key ⚙️',
    dataLabel: plan?.dataLabel || formatBytesToGbLabel(dynamicKey.dataLimitBytes),
    usedLabel: formatBytesToGbLabel(BigInt(used)),
    totalLabel: formatBytesToGbLabel(dynamicKey.dataLimitBytes),
    progressBar: barChars || '░░░░░░░░░░',
    percentLabel: percent || '0%',
    expiryLabel: formatStoreDate(dynamicKey.expiresAt),
    paidLabel: latestOrder?.planCode
      ? plan?.priceLabel || '—'
      : '—',
    switchesLabel: plan?.switchesLabel || switchesLabel(dynamicKey.switchesMax),
    switchesUsed: dynamicKey.switchesUsed,
    switchesMaxLabel: switchesMaxLabel(dynamicKey.switchesMax),
    switchesMax: dynamicKey.switchesMax,
    renewPriceLabel: plan?.priceLabel || null,
    deviceLimitLabel: formatTelegramStoreDeviceLimitLabel({
      limit: dynamicKey.maxDevices,
      boundDeviceInstallsOnly: dynamicKey.boundDeviceInstallsOnly,
    }),
    showSwitchButton: dynamicKey.status === 'ACTIVE' && dynamicKey.switchesMax !== 0,
    accessKeyText,
  } satisfies TelegramStoreGuideKeyData;
}

export async function loadTelegramStoreActiveKeysData(input: {
  chatId: number;
  telegramUserId: number;
}) {
  const { plans } = await resolveTelegramStorePlans();
  const [accessKeys, dynamicKeys] = await Promise.all([
    findLinkedAccessKeys(input.chatId, input.telegramUserId, false),
    findLinkedDynamicAccessKeys(input.chatId, input.telegramUserId, false),
  ]);

  const activeAccess = accessKeys.filter((key) => key.status === 'ACTIVE');
  const activeDynamic = dynamicKeys.filter((key) => key.status === 'ACTIVE');
  const orders = await loadLatestOrdersForKeys({
    accessKeyIds: activeAccess.map((key) => key.id),
    dynamicKeyIds: activeDynamic.map((key) => key.id),
  });
  const orderByKeyId = new Map<string, (typeof orders)[number]>();

  for (const order of orders) {
    const accessKeyId = order.approvedAccessKeyId || order.targetAccessKeyId;
    const dynamicKeyId = order.approvedDynamicKeyId || order.targetDynamicKeyId;
    if (accessKeyId && !orderByKeyId.has(accessKeyId)) {
      orderByKeyId.set(accessKeyId, order);
    }
    if (dynamicKeyId && !orderByKeyId.has(dynamicKeyId)) {
      orderByKeyId.set(dynamicKeyId, order);
    }
  }

  const serverIds = Array.from(
    new Set(
      activeDynamic
        .map((key) => key.pinnedServerId || key.lastResolvedServerId)
        .filter((value): value is string => typeof value === 'string' && value.length > 0),
    ),
  );
  const servers = serverIds.length > 0
    ? await db.server.findMany({
        where: { id: { in: serverIds } },
        select: { id: true, name: true, countryCode: true },
      })
    : [];
  const serverById = new Map(servers.map((server) => [server.id, server]));

  const items: TelegramStoreKeyView[] = [
    ...activeAccess.map((key) => {
      const order = orderByKeyId.get(key.id);
      const plan = findTelegramStorePlanByCode(plans, order?.planCode || null);
      const used = Number(key.usedBytes || BigInt(0));
      const total = key.dataLimitBytes ? Number(key.dataLimitBytes) : 0;
      const bar = progressBar(used, total || 1);
      const [barChars, percent] = bar.split(' ');

      return {
        id: key.id,
        kind: 'access' as const,
        planId: plan?.id || null,
        planName: plan?.detailName || key.name,
        categoryLabel: plan ? formatCategoryLabel(plan.category) : 'Flash',
        usedLabel: formatBytesToGbLabel(BigInt(used)),
        totalLabel: formatBytesToGbLabel(key.dataLimitBytes),
        progressBar: barChars || '░░░░░░░░░░',
        percentLabel: percent || '0%',
        expiryLabel: formatStoreDate(key.expiresAt),
        switchesUsed: key.switchesUsed,
        switchesMaxLabel: switchesMaxLabel(key.switchesMax),
        renewPriceLabel: plan?.priceLabel || null,
        currentServerName: formatCurrentServerName({
          name: key.server?.name,
          countryCode: key.server?.countryCode,
        }),
        usedBytes: used,
        totalBytes: total || null,
        expiresAt: key.expiresAt,
      };
    }),
    ...activeDynamic.map((key) => {
      const order = orderByKeyId.get(key.id);
      const plan = findTelegramStorePlanByCode(plans, order?.planCode || null);
      const used = Number(key.usedBytes || BigInt(0));
      const total = key.dataLimitBytes ? Number(key.dataLimitBytes) : 0;
      const bar = progressBar(used, total || 1);
      const [barChars, percent] = bar.split(' ');
      const currentServer = serverById.get(key.pinnedServerId || key.lastResolvedServerId || '');

      return {
        id: key.id,
        kind: 'dynamic' as const,
        planId: plan?.id || null,
        planName: plan?.detailName || key.name,
        categoryLabel: plan ? formatCategoryLabel(plan.category) : 'Dynamic',
        usedLabel: formatBytesToGbLabel(BigInt(used)),
        totalLabel: formatBytesToGbLabel(key.dataLimitBytes),
        progressBar: barChars || '░░░░░░░░░░',
        percentLabel: percent || '0%',
        expiryLabel: formatStoreDate(key.expiresAt),
        switchesUsed: key.switchesUsed,
        switchesMaxLabel: switchesMaxLabel(key.switchesMax),
        renewPriceLabel: plan?.priceLabel || null,
        currentServerName: formatCurrentServerName({
          name: currentServer?.name || null,
          countryCode: currentServer?.countryCode || null,
        }),
        usedBytes: used,
        totalBytes: total || null,
        expiresAt: key.expiresAt,
      };
    }),
  ];

  return { plans, items };
}

export async function loadTelegramStoreAccountData(input: {
  chatId: number;
  telegramUserId: number;
}) {
  const { items } = await loadTelegramStoreActiveKeysData(input);
  const nextExpiry = items
    .map((item) => item.expiresAt)
    .filter((date): date is Date => date instanceof Date)
    .sort((left, right) => left.getTime() - right.getTime())[0] || null;

  const finiteItems = items.filter((item) => item.totalBytes && item.totalBytes > 0);
  const remainingBytes = finiteItems.reduce((sum, item) => {
    const used = item.usedBytes || 0;
    const total = item.totalBytes || 0;
    return sum + Math.max(0, total - used);
  }, 0);
  const dataLeftLabel = finiteItems.length > 0
    ? formatBytesToGbLabel(BigInt(Math.max(0, Math.round(remainingBytes))))
    : 'Unlimited';
  const primaryKey =
    [...items]
      .sort((left, right) => {
        const leftTime = left.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
        const rightTime = right.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
        return leftTime - rightTime;
      })[0] || null;

  return {
    activeKeyCount: items.length,
    nextExpiryLabel: formatStoreDate(nextExpiry),
    dataLeftLabel,
    primaryKey,
    items,
  };
}

export async function loadTelegramStoreSwitchableKeysData(input: {
  chatId: number;
  telegramUserId: number;
}) {
  const { plans } = await resolveTelegramStorePlans();
  const [accessKeys, dynamicKeys] = await Promise.all([
    findLinkedAccessKeys(input.chatId, input.telegramUserId, false),
    findLinkedDynamicAccessKeys(input.chatId, input.telegramUserId, false),
  ]);
  const activeAccess = accessKeys.filter((key) => key.status === 'ACTIVE' && key.switchesMax !== 0);
  const activeDynamic = dynamicKeys.filter((key) => key.status === 'ACTIVE' && key.switchesMax !== 0);
  const orders = await loadLatestOrdersForKeys({
    accessKeyIds: activeAccess.map((key) => key.id),
    dynamicKeyIds: activeDynamic.map((key) => key.id),
  });
  const orderByKeyId = new Map<string, (typeof orders)[number]>();

  for (const order of orders) {
    const accessKeyId = order.approvedAccessKeyId || order.targetAccessKeyId;
    const dynamicKeyId = order.approvedDynamicKeyId || order.targetDynamicKeyId;
    if (accessKeyId && !orderByKeyId.has(accessKeyId)) {
      orderByKeyId.set(accessKeyId, order);
    }
    if (dynamicKeyId && !orderByKeyId.has(dynamicKeyId)) {
      orderByKeyId.set(dynamicKeyId, order);
    }
  }

  const serverIds = Array.from(
    new Set(
      activeDynamic
        .map((key) => key.pinnedServerId || key.lastResolvedServerId)
        .filter((value): value is string => typeof value === 'string' && value.length > 0),
    ),
  );
  const dynamicServers = serverIds.length > 0
    ? await db.server.findMany({
        where: { id: { in: serverIds } },
        select: { id: true, name: true, countryCode: true },
      })
    : [];
  const serverById = new Map(dynamicServers.map((server) => [server.id, server]));

  const keys: TelegramStoreSwitchKeyView[] = [
    ...activeAccess.map((key) => {
      const order = orderByKeyId.get(key.id);
      const plan = findTelegramStorePlanByCode(plans, order?.planCode || null);
      return {
        id: key.id,
        kind: 'access' as const,
        planName: plan?.detailName || key.name,
        currentServerId: key.serverId,
        currentServerName: formatCurrentServerName({
          name: key.server?.name,
          countryCode: key.server?.countryCode,
        }),
        switchesUsed: key.switchesUsed,
        switchesMax: key.switchesMax,
        switchesMaxLabel: switchesMaxLabel(key.switchesMax),
      };
    }),
    ...activeDynamic.map((key) => {
      const order = orderByKeyId.get(key.id);
      const plan = findTelegramStorePlanByCode(plans, order?.planCode || null);
      const currentServer = serverById.get(key.pinnedServerId || key.lastResolvedServerId || '');

      return {
        id: key.id,
        kind: 'dynamic' as const,
        planName: plan?.detailName || key.name,
        currentServerId: key.pinnedServerId || key.lastResolvedServerId || null,
        currentServerName: formatCurrentServerName({
          name: currentServer?.name || null,
          countryCode: currentServer?.countryCode || null,
        }),
        switchesUsed: key.switchesUsed,
        switchesMax: key.switchesMax,
        switchesMaxLabel: switchesMaxLabel(key.switchesMax),
      };
    }),
  ];

  return { plans, keys };
}

export async function loadTelegramStoreSwitchServerOptions(input: {
  keyId: string;
  kind: TelegramStoreKeyKind;
}) {
  const servers = await db.server.findMany({
    where: {
      isActive: true,
      lifecycleMode: { in: ['ACTIVE', 'DRAINING'] },
    },
    select: {
      id: true,
      name: true,
      countryCode: true,
    },
    orderBy: [
      { sortOrder: 'asc' },
      { name: 'asc' },
    ],
  });

  if (input.kind === 'access') {
    const key = await db.accessKey.findUnique({
      where: { id: input.keyId },
      select: {
        id: true,
        serverId: true,
        switchesUsed: true,
        switchesMax: true,
        server: {
          select: { name: true, countryCode: true },
        },
      },
    });

    if (!key) {
      return null;
    }

    return {
      currentServerId: key.serverId,
      currentServerName: formatCurrentServerName({
        name: key.server?.name,
        countryCode: key.server?.countryCode,
      }),
      switchesUsed: key.switchesUsed,
      switchesMax: key.switchesMax,
      servers: servers
        .filter((server) => server.id !== key.serverId)
        .map((server) => ({
          id: server.id,
          name: server.name,
          flag: server.countryCode ? getFlagEmoji(server.countryCode) : '🟢',
          location: server.name,
        })),
    };
  }

  const key = await db.dynamicAccessKey.findUnique({
    where: { id: input.keyId },
    select: {
      id: true,
      switchesUsed: true,
      switchesMax: true,
      pinnedServerId: true,
      lastResolvedServerId: true,
      accessKeys: {
        select: {
          server: {
            select: {
              id: true,
              name: true,
              countryCode: true,
            },
          },
        },
      },
    },
  });

  if (!key) {
    return null;
  }

  const currentServerId = key.pinnedServerId || key.lastResolvedServerId || null;
  const attachedServers = key.accessKeys
    .map((accessKey) => accessKey.server)
    .filter((server): server is { id: string; name: string; countryCode: string | null } => Boolean(server));
  const currentServer = currentServerId
    ? attachedServers.find((server) => server.id === currentServerId) || null
    : attachedServers[0] || null;

  return {
    currentServerId,
    currentServerName: formatCurrentServerName({
      name: currentServer?.name || null,
      countryCode: currentServer?.countryCode || null,
    }),
    switchesUsed: key.switchesUsed,
    switchesMax: key.switchesMax,
    servers: attachedServers
      .filter((server) => server.id !== currentServerId)
      .map((server) => ({
        id: server.id,
        name: server.name,
        flag: server.countryCode ? getFlagEmoji(server.countryCode) : '🟢',
        location: server.name,
      })),
  };
}

export async function createTelegramStoreSummaryOrder(input: {
  chatId: number;
  telegramUserId: number;
  telegramUsername: string;
  locale: SupportedLocale;
  kind: 'NEW' | 'RENEW';
  plan: TelegramStoreResolvedPlan;
  targetAccessKeyId?: string | null;
  targetDynamicKeyId?: string | null;
}) {
  const planPriceBytes =
    input.plan.plan.unlimitedQuota
      ? null
      : input.plan.plan.dataLimitGB
        ? BigInt(input.plan.plan.dataLimitGB) * BigInt(1024 * 1024 * 1024)
        : null;

  return db.telegramOrder.create({
    data: {
      orderCode: await generateTelegramOrderCode(),
      kind: input.kind,
      status: 'AWAITING_PLAN_CONFIRMATION',
      telegramChatId: String(input.chatId),
      telegramUserId: String(input.telegramUserId),
      telegramUsername: input.telegramUsername,
      locale: input.locale,
      targetAccessKeyId: input.targetAccessKeyId ?? null,
      targetDynamicKeyId: input.targetDynamicKeyId ?? null,
      planCode: input.plan.planCode,
      planName: input.plan.detailName,
      priceAmount: input.plan.priceAmount,
      priceCurrency: input.plan.plan.priceCurrency || 'MMK',
      priceLabel: input.plan.priceLabel,
      deliveryType: input.plan.plan.deliveryType,
      templateId: input.plan.plan.deliveryType === 'ACCESS_KEY' ? input.plan.plan.templateId || null : null,
      dynamicTemplateId: input.plan.plan.deliveryType === 'DYNAMIC_KEY' ? input.plan.plan.dynamicTemplateId || null : null,
      durationMonths: input.plan.plan.fixedDurationMonths ?? null,
      durationDays: input.plan.plan.fixedDurationDays ?? null,
      dataLimitBytes: planPriceBytes,
      unlimitedQuota: input.plan.plan.unlimitedQuota,
    },
  });
}

export function buildTelegramStoreMainMenuView(input: {
  firstName: string;
  activeKeyCount: number;
  nextExpiryLabel: string;
}) {
  const text = [
    '🛰 *VPN Plan Store*',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    `Welcome back, *${escapeTelegramMarkdownV2(input.firstName)}*\\! 👋`,
    '',
    `🔑 Active keys     :  ${escapeTelegramMarkdownV2(String(input.activeKeyCount))}`,
    `📅 Next expiry     :  ${escapeTelegramMarkdownV2(input.nextExpiryLabel)}`,
    '',
    'Choose a plan type below 👇',
  ].join('\n');

  return {
    text,
    replyMarkup: {
      inline_keyboard: [
        [{ text: '⚡ Flash Plans    ·  30 Days  ·  🔄 3×', callback_data: buildTelegramStorefrontCallbackData({ action: 'show_plans' }) }],
        [{ text: '🌙 Season Plans   ·  90 Days  ·  🔄 5×', callback_data: buildTelegramStorefrontCallbackData({ action: 'show_plans' }) }],
        [{ text: '🔑 Dynamic Plans  ·  Flexible ·  🔄 ∞', callback_data: buildTelegramStorefrontCallbackData({ action: 'show_plans' }) }],
        [
          { text: '👤 My Account', callback_data: buildTelegramStorefrontCallbackData({ action: 'my_account' }) },
          { text: '💬 Support', callback_data: buildTelegramStorefrontCallbackData({ action: 'support_contact' }) },
        ],
      ],
    },
  };
}

export function buildTelegramStorePlanListView(plans: TelegramStoreResolvedPlan[]) {
  const flash = plans.filter((plan) => plan.category === 'flash');
  const season = plans.filter((plan) => plan.category === 'season');
  const dynamic = plans.filter((plan) => plan.category === 'dynamic');
  const renderRow = (plan: TelegramStoreResolvedPlan) => {
    const badge = badgeStar(plan.badge);
    const trailingBadge = badge ? `       ${badge}` : '';
    const dynamicSuffix = plan.category === 'dynamic'
      ? `  · ${plan.durationLabel === '1 Month' ? '1M' : plan.durationLabel === '2 Months' ? '2M' : '3M'}`
      : '';
    return `${plan.messageIndex} ${plan.listLabel.padEnd(11, ' ')} ${plan.dataLabel.padStart(7, ' ')} ${plan.priceLabel.padStart(11, ' ')}${dynamicSuffix}${trailingBadge}`;
  };

  const text = [
    '🛰 *VPN Plan Store*',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    '⚡ Flash Plans  ·  30 Days  ·  🔄 3 switches',
    '────────────────────────────────────────',
    ...flash.map(renderRow),
    '────────────────────────────────────────',
    '🌙 Season Plans  ·  90 Days  ·  🔄 5 switches',
    '────────────────────────────────────────',
    ...season.map(renderRow),
    '────────────────────────────────────────',
    '🔑 Dynamic Plans  ·  Flexible  ·  🔄 ∞',
    '────────────────────────────────────────',
    ...dynamic.map(renderRow),
    '────────────────────────────────────────',
    '★ Popular  ·  ★★ Best Deal',
    '👇 Tap a number to select your plan:',
  ].join('\n');

  return {
    text,
    replyMarkup: {
      inline_keyboard: [
        buildStorePlanKeyboardRow(flash),
        buildStorePlanKeyboardRow(season),
        buildStorePlanKeyboardRow(dynamic),
        [{ text: '💬 Support', callback_data: buildTelegramStorefrontCallbackData({ action: 'support_contact' }) }],
      ],
    },
  };
}

export function buildTelegramStoreOrderSummaryView(input: {
  plan: TelegramStoreResolvedPlan;
  couponCode?: string | null;
  originalPriceAmount?: number | null;
  discountAmount?: number | null;
  finalPriceAmount?: number | null;
}) {
  const couponCode = input.couponCode?.trim() || null;
  const originalPrice = typeof input.originalPriceAmount === 'number'
    ? input.originalPriceAmount
    : input.plan.priceAmount;
  const discountAmount = typeof input.discountAmount === 'number' ? input.discountAmount : 0;
  const finalPrice = typeof input.finalPriceAmount === 'number'
    ? input.finalPriceAmount
    : Math.max(0, originalPrice - discountAmount);

  const lines = [
    '🧾 *Order Summary*',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    `📦 Plan        :  ${escapeTelegramMarkdownV2(input.plan.detailName)}`,
    `📶 Data        :  ${escapeTelegramMarkdownV2(input.plan.dataLabel)}`,
    `🕐 Duration   :  ${escapeTelegramMarkdownV2(input.plan.durationLabel)}`,
    `🔄 Switches   :  ${escapeTelegramMarkdownV2(input.plan.switchesLabel)}`,
    `🔑 Key type   :  ${escapeTelegramMarkdownV2(input.plan.keyTypeLabel)}`,
  ];

  if (couponCode) {
    lines.push(
      '',
      `🏷 Coupon      :  ${escapeTelegramMarkdownV2(couponCode)}`,
      `💵 Original    :  ${escapeTelegramMarkdownV2(formatStorePriceAmount(originalPrice))}`,
      `💸 Discount    :  \\-${escapeTelegramMarkdownV2(formatStorePriceAmount(discountAmount))}`,
      `💰 Final price :  *${escapeTelegramMarkdownV2(formatStorePriceAmount(finalPrice))}*`,
    );
  } else {
    lines.push('', `💵 Price       :  *${escapeTelegramMarkdownV2(input.plan.priceLabel)}*`);
  }

  lines.push(
    '',
    '✅ Unlimited devices',
    '⚡ Activated within 5 min',
    '',
    'Confirm your order below 👇',
  );

  return {
    text: lines.join('\n'),
    replyMarkup: {
      inline_keyboard: [
        [{
          text: `✅  Confirm & Pay   ${couponCode ? formatStorePriceAmount(finalPrice) : input.plan.priceLabel}`,
          callback_data: buildTelegramStorefrontCallbackData({ action: 'confirm', planId: input.plan.id }),
        }],
        [{
          text: couponCode ? '🏷  Change Coupon' : '🏷  Apply Coupon Code',
          callback_data: buildTelegramStorefrontCallbackData({ action: 'coupon', planId: input.plan.id }),
        }],
        [{
          text: '◀   Back to Plans',
          callback_data: buildTelegramStorefrontCallbackData({ action: 'show_plans' }),
        }],
      ],
    },
  };
}

export function buildTelegramStoreRenewView(input: {
  plan: TelegramStoreResolvedPlan;
  renewTarget: TelegramStoreRenewTarget | null;
}) {
  const text = [
    '🔄 *Renew Your Plan*',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    'Your last plan:',
    '',
    `📦 ${escapeTelegramMarkdownV2(input.plan.detailName)}`,
    `📶 ${escapeTelegramMarkdownV2(input.plan.dataLabel)}  ·  ${escapeTelegramMarkdownV2(input.plan.durationLabel)}`,
    `💵 ${escapeTelegramMarkdownV2(input.plan.priceLabel)}`,
    '',
    'Renew the same plan or choose a new one 👇',
  ].join('\n');

  return {
    text,
    replyMarkup: {
      inline_keyboard: [
        [{
          text: `✅  Renew ${input.plan.detailName}  —  ${input.plan.priceLabel}`,
          callback_data: input.renewTarget
            ? buildTelegramStorefrontCallbackData({
                action: 'renew_plan',
                planId: input.plan.id,
                keyId: input.renewTarget.keyId,
                kind: input.renewTarget.kind,
              })
            : buildTelegramStorefrontCallbackData({
                action: 'order_plan',
                planId: input.plan.id,
              }),
        }],
        [{
          text: '🔍  Choose a Different Plan',
          callback_data: buildTelegramStorefrontCallbackData({ action: 'show_plans' }),
        }],
      ],
    },
  };
}

export function buildTelegramStoreActiveKeysView(items: TelegramStoreKeyView[]) {
  const lines = [
    '🔑 *Your Active Keys*',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
  ];

  items.forEach((item, index) => {
    lines.push(
      `${index + 1}️⃣ ${escapeTelegramMarkdownV2(item.planName)}  ·  ${escapeTelegramMarkdownV2(item.categoryLabel)}`,
      `   📶 ${escapeTelegramMarkdownV2(item.usedLabel)} / ${escapeTelegramMarkdownV2(item.totalLabel)}`,
      `   ${item.progressBar}  ${escapeTelegramMarkdownV2(item.percentLabel)}`,
      `   🕐 Expires: ${escapeTelegramMarkdownV2(item.expiryLabel)}`,
      `   🔄 Switches: ${escapeTelegramMarkdownV2(String(item.switchesUsed))} / ${escapeTelegramMarkdownV2(item.switchesMaxLabel)}`,
      '',
    );
  });

  lines.push('Tap a key below to open details 👇');

  return {
    text: lines.join('\n').trim(),
    replyMarkup: {
      inline_keyboard: [
        ...items.map((item) => (
          [
            {
              text: `📄 Open ${item.planName}`,
              callback_data: buildTelegramStorefrontCallbackData({
                action: 'key_page',
                keyId: item.id,
              }),
            },
            {
              text: item.planId ? '🔄 Renew' : '🛒 Plans',
              callback_data: item.planId
                ? buildTelegramStorefrontCallbackData({
                    action: 'renew_plan',
                    planId: item.planId,
                    keyId: item.id,
                    kind: item.kind,
                  })
                : buildTelegramStorefrontCallbackData({ action: 'show_plans' }),
            },
          ]
        )),
        [{ text: '➕  Buy New Plan', callback_data: buildTelegramStorefrontCallbackData({ action: 'show_plans' }) }],
      ],
    },
  };
}

export function buildTelegramStoreMyAccountView(input: {
  activeKeyCount: number;
  nextExpiryLabel: string;
  dataLeftLabel: string;
  primaryKey?: TelegramStoreKeyView | null;
}) {
  const lines = [
    '👤 *My Account*',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    `🔑 Active keys   :  ${escapeTelegramMarkdownV2(String(input.activeKeyCount))}`,
    `📅 Next expiry   :  ${escapeTelegramMarkdownV2(input.nextExpiryLabel)}`,
    `📶 Data left     :  ${escapeTelegramMarkdownV2(input.dataLeftLabel)}`,
  ];

  if (input.primaryKey) {
    const primaryBar = input.primaryKey.totalBytes && input.primaryKey.totalBytes > 0
      ? usageBar(input.primaryKey.usedBytes || 0, input.primaryKey.totalBytes)
      : `${input.primaryKey.progressBar}  ${input.primaryKey.percentLabel}`;
    lines.push(
      '',
      `📦 *${escapeTelegramMarkdownV2(input.primaryKey.planName)}*  ·  ${escapeTelegramMarkdownV2(input.primaryKey.categoryLabel)}`,
      `📶 ${escapeTelegramMarkdownV2(input.primaryKey.usedLabel)} / ${escapeTelegramMarkdownV2(input.primaryKey.totalLabel)}`,
      `   ${escapeTelegramMarkdownV2(primaryBar)}`,
      `🕐 Expires: ${escapeTelegramMarkdownV2(input.primaryKey.expiryLabel)}`,
    );
  } else {
    lines.push('', 'No active keys yet\\.');
  }

  return {
    text: lines.join('\n'),
    replyMarkup: {
      inline_keyboard: [
        [
          { text: '🔑 My Keys', callback_data: buildTelegramStorefrontCallbackData({ action: 'mykeys_home' }) },
          { text: '🔄 Renew', callback_data: buildTelegramStorefrontCallbackData({ action: 'show_plans' }) },
        ],
        [
          { text: '📲 Setup', callback_data: buildTelegramStorefrontCallbackData({ action: 'setup_home' }) },
          { text: '💬 Support', callback_data: buildTelegramStorefrontCallbackData({ action: 'support_contact' }) },
        ],
        [{ text: '🏠 Main Menu', callback_data: buildTelegramStorefrontCallbackData({ action: 'main_menu' }) }],
      ],
    },
  };
}

export function buildTelegramStoreQuickStatusView(input: {
  activeKeyCount: number;
  nextExpiryLabel: string;
  dataLeftLabel: string;
}) {
  return {
    text: [
      '📊 *Your Status*',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━',
      `🔑 Active keys   :  ${escapeTelegramMarkdownV2(String(input.activeKeyCount))}`,
      `📅 Next expiry   :  ${escapeTelegramMarkdownV2(input.nextExpiryLabel)}`,
      `📶 Data left     :  ${escapeTelegramMarkdownV2(input.dataLeftLabel)}`,
    ].join('\n'),
  };
}

export function buildTelegramStoreSwitchKeySelectionView(items: TelegramStoreSwitchKeyView[]) {
  return {
    text: [
      '🔄 *Switch Server*',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      'Which key do you want to switch?',
    ].join('\n'),
    replyMarkup: {
      inline_keyboard: [
        ...items.map((item) => [
          {
            text: `🔑 ${item.planName}  ·  ${item.switchesUsed}/${item.switchesMaxLabel} switches used`,
            callback_data: buildTelegramStorefrontCallbackData({
              action: 'switchkey',
              keyId: item.id,
            }),
          },
        ]),
        [{ text: '◀ Back', callback_data: buildTelegramStorefrontCallbackData({ action: 'main_menu' }) }],
      ],
    },
  };
}

export function buildTelegramStoreSwitchServerSelectionView(input: {
  keyId: string;
  currentServer: string;
  used: number;
  maxLabel: string;
  servers: TelegramStoreServerOption[];
}) {
  return {
    text: [
      '🌍 *Select New Server*',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      `Current  :  *${escapeTelegramMarkdownV2(input.currentServer)}*`,
      `Used     :  ${escapeTelegramMarkdownV2(String(input.used))} / ${escapeTelegramMarkdownV2(input.maxLabel)} switches`,
    ].join('\n'),
    replyMarkup: {
      inline_keyboard: [
        ...input.servers.map((server) => [
          {
            text: `🟢 ${server.flag} ${server.name}  ·  ${server.location}`,
            callback_data: buildTelegramStorefrontCallbackData({
              action: 'confirm_switch',
              keyId: input.keyId,
              serverId: server.id,
            }),
          },
        ]),
        [{ text: '◀ Back', callback_data: buildTelegramStorefrontCallbackData({ action: 'switch', keyId: input.keyId }) }],
      ],
    },
  };
}

export function buildTelegramStoreSwitchConfirmationView(input: {
  keyId: string;
  currentServer: string;
  newServer: string;
  newServerId: string;
  used: number;
  maxLabel: string;
}) {
  return {
    text: [
      '⚠️ *Confirm Server Switch*',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      `From: *${escapeTelegramMarkdownV2(input.currentServer)}*`,
      `To  : *${escapeTelegramMarkdownV2(input.newServer)}*`,
      '',
      `Used: ${escapeTelegramMarkdownV2(String(input.used))} / ${escapeTelegramMarkdownV2(input.maxLabel)} switches`,
      '',
      'Are you sure you want to switch? This action cannot be undone.',
    ].join('\n'),
    replyMarkup: {
      inline_keyboard: [
        [
          {
            text: '✅ Yes, Switch',
            callback_data: buildTelegramStorefrontCallbackData({
              action: 'doswitch',
              keyId: input.keyId,
              serverId: input.newServerId,
            }),
          },
          {
            text: '❌ Cancel',
            callback_data: buildTelegramStorefrontCallbackData({
              action: 'switch',
              keyId: input.keyId,
            }),
          },
        ],
      ],
    },
  };
}

export function buildTelegramStoreSwitchSuccessView(input: {
  newServer: string;
  used: number;
  maxLabel: string;
}) {
  return {
    text: [
      '✅ *Server Switched\\!*',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      `Moved to *${escapeTelegramMarkdownV2(input.newServer)}*\\.`,
      `🔄 Switches used  :  ${escapeTelegramMarkdownV2(String(input.used))} / ${escapeTelegramMarkdownV2(input.maxLabel)}`,
      '',
      'Reconnect your Outline app to apply\\.',
    ].join('\n'),
    replyMarkup: {
      inline_keyboard: [[
        { text: '🏠 Back to Menu', callback_data: buildTelegramStorefrontCallbackData({ action: 'main_menu' }) },
        { text: '💬 Support', callback_data: buildTelegramStorefrontCallbackData({ action: 'support_contact' }) },
      ]],
    },
  };
}

export function buildTelegramStoreSwitchLimitReachedView(input: {
  max: string;
  planName: string;
}) {
  return {
    text: [
      '❌ *Switch Limit Reached*',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      `You've used all *${escapeTelegramMarkdownV2(input.max)}* switches for`,
      `your *${escapeTelegramMarkdownV2(input.planName)}* plan\\.`,
      '',
      'Upgrade for more switches:',
      '🌙 Season Plans  →  5 switches',
      '🔑 Dynamic Plans →  Unlimited ∞',
    ].join('\n'),
    replyMarkup: {
      inline_keyboard: [
        [{ text: '🌙 Season Plans', callback_data: buildTelegramStorefrontCallbackData({ action: 'show_plans' }) }],
        [{ text: '🔑 Dynamic Plans', callback_data: buildTelegramStorefrontCallbackData({ action: 'show_plans' }) }],
        [{ text: '◀ Back', callback_data: buildTelegramStorefrontCallbackData({ action: 'main_menu' }) }],
      ],
    },
  };
}

export function buildTelegramStoreKeyPageView(input: {
  kind: TelegramStoreKeyKind;
  variant?: 'paid' | 'trial';
  planName: string;
  categoryLabel: string;
  statusLabel: string;
  currentServerName: string;
  keyTypeLabel: string;
  usedLabel: string;
  totalLabel: string;
  progressBar: string;
  percentLabel: string;
  expiryLabel: string;
  switchesUsed: number;
  switchesMaxLabel: string;
  paidLabel: string;
  keyId: string;
  renewPlanId?: TelegramStorePlanId | null;
  renewPriceLabel?: string | null;
  deviceLimitLabel?: string | null;
  showSwitchButton?: boolean;
}) {
  const isTrial = input.variant === 'trial';
  const inlineKeyboard: Array<Array<{ text: string; callback_data: string }>> = [
    [{
      text: '📲 Setup Guide',
      callback_data: buildTelegramStorefrontCallbackData({
        action: 'platform_select',
        keyId: input.keyId,
      }),
    }],
  ];

  if (isTrial) {
    inlineKeyboard.push([{
      text: '🛒 Buy a Full Plan',
      callback_data: buildTelegramStorefrontCallbackData({ action: 'show_plans' }),
    }]);
  } else {
    inlineKeyboard.push([{
      text: input.renewPlanId
        ? `🔄 Renew ${input.planName}  —  ${input.renewPriceLabel || 'See plans'}`
        : '🛒 See Plans',
      callback_data: input.renewPlanId
        ? buildTelegramStorefrontCallbackData({
            action: 'renew_plan',
            planId: input.renewPlanId,
            keyId: input.keyId,
            kind: input.kind,
          })
        : buildTelegramStorefrontCallbackData({ action: 'show_plans' }),
    }]);
  }

  if (input.showSwitchButton !== false) {
    inlineKeyboard.push([
      {
        text: '🌍 Switch Server',
        callback_data: buildTelegramStorefrontCallbackData({ action: 'switch', keyId: input.keyId }),
      },
      {
        text: '💬 Support',
        callback_data: buildTelegramStorefrontCallbackData({ action: 'support_contact' }),
      },
    ]);
  } else {
    inlineKeyboard.push([{
      text: '💬 Support',
      callback_data: buildTelegramStorefrontCallbackData({ action: 'support_contact' }),
    }]);
  }

  inlineKeyboard.push([{
    text: '🏠 Back to Menu',
    callback_data: buildTelegramStorefrontCallbackData({ action: 'main_menu' }),
  }]);

  const lines = [
    isTrial ? '🎁 *Trial Key Details*' : '🔑 *Key Details*',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    `📦 *${escapeTelegramMarkdownV2(input.planName)}*  ·  ${escapeTelegramMarkdownV2(input.categoryLabel)}`,
    `🟢 Status      :  ${escapeTelegramMarkdownV2(input.statusLabel)}`,
    `🌍 Server      :  ${escapeTelegramMarkdownV2(input.currentServerName)}`,
    `🔑 Key type    :  ${escapeTelegramMarkdownV2(input.keyTypeLabel)}`,
    `📶 Usage       :  ${escapeTelegramMarkdownV2(input.usedLabel)} / ${escapeTelegramMarkdownV2(input.totalLabel)}`,
    `   ${input.progressBar}  ${escapeTelegramMarkdownV2(input.percentLabel)}`,
    `🕐 Expires     :  ${escapeTelegramMarkdownV2(input.expiryLabel)}`,
  ];

  if (input.showSwitchButton !== false) {
    lines.push(
      `🔄 Switches    :  ${escapeTelegramMarkdownV2(String(input.switchesUsed))} / ${escapeTelegramMarkdownV2(input.switchesMaxLabel)}`,
    );
  }

  lines.push(
    `${isTrial ? '💰 Paid        :  FREE' : `💵 Plan        :  ${escapeTelegramMarkdownV2(input.paidLabel)}`}`,
  );

  if (input.deviceLimitLabel) {
    lines.push(`📱 Device      :  ${escapeTelegramMarkdownV2(input.deviceLimitLabel)}`);
  }

  lines.push(
    '',
    'Open the setup guide or manage this key below 👇',
  );

  return {
    text: lines.join('\n'),
    replyMarkup: {
      inline_keyboard: inlineKeyboard,
    },
  };
}

export function buildTelegramStoreTrialKeyPageView(input: {
  firstName: string;
  accessKey: string;
  expiryLabel: string;
  keyId: string;
}) {
  return {
    text: [
      '🎁 *Trial Activated\\!*',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      `Welcome, *${escapeTelegramMarkdownV2(input.firstName)}*\\! Your free trial`,
      'is ready to use right now\\! 🚀',
      '',
      '🔑 *Your Access Key:*',
      formatTelegramMarkdownCode(input.accessKey),
      '',
      '📶 Data        :  5 GB',
      `🕐 Expires     :  ${escapeTelegramMarkdownV2(input.expiryLabel)}`,
      '💰 Paid        :  FREE',
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '📲 _Tap Setup Guide to connect in 2 minutes\\._',
      'Enjoy your free trial\\! 🎉',
    ].join('\n'),
    replyMarkup: {
      inline_keyboard: [
        [{
          text: '📲  Setup Guide',
          callback_data: buildTelegramStorefrontCallbackData({
            action: 'platform_select',
            keyId: input.keyId,
          }),
        }],
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
        [{
          text: '🛒 Buy a Full Plan',
          callback_data: buildTelegramStorefrontCallbackData({ action: 'show_plans' }),
        }],
        [
          { text: '🏠 Back to Menu', callback_data: buildTelegramStorefrontCallbackData({ action: 'main_menu' }) },
          { text: '💬 Support', callback_data: buildTelegramStorefrontCallbackData({ action: 'support_contact' }) },
        ],
      ],
    },
  };
}

export function buildTelegramStoreOrderConfirmedView(input: {
  firstName: string;
  plan: TelegramStoreResolvedPlan;
  accessKey: string;
  expiryLabel: string;
  paidLabel: string;
  keyId: string;
}) {
  const inlineKeyboard: Array<Array<{ text: string; callback_data: string }>> = [
    [{
      text: '📲  Setup Guide',
      callback_data: buildTelegramStorefrontCallbackData({
        action: 'platform_select',
        keyId: input.keyId,
      }),
    }],
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
  ];

  if (input.plan.switchesValue !== 0) {
    inlineKeyboard.push([{
      text: '🔄 Switch Server',
      callback_data: buildTelegramStorefrontCallbackData({ action: 'switch', keyId: input.keyId }),
    }]);
  }

  inlineKeyboard.push([
    { text: '🏠 Back to Menu', callback_data: buildTelegramStorefrontCallbackData({ action: 'main_menu' }) },
    { text: '💬 Support', callback_data: buildTelegramStorefrontCallbackData({ action: 'support_contact' }) },
  ]);

  return {
    text: [
      '✅ *Order Confirmed\\!*',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      `Your *${escapeTelegramMarkdownV2(input.plan.detailName)}* is now active, *${escapeTelegramMarkdownV2(input.firstName)}*\\! 🎉`,
      '',
      '🔑 *Your Access Key:*',
      formatTelegramMarkdownCode(input.accessKey),
      '',
      `📶 Data        :  ${escapeTelegramMarkdownV2(input.plan.dataLabel)}`,
      `🕐 Expires     :  ${escapeTelegramMarkdownV2(input.expiryLabel)}`,
      `🔄 Switches   :  ${escapeTelegramMarkdownV2(input.plan.switchesLabel)}`,
      `💵 Paid        :  ${escapeTelegramMarkdownV2(input.paidLabel)}`,
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '📲 _Tap Setup Guide to connect in 2 minutes\\._',
      'Thank you for your purchase\\! 🙏',
    ].join('\n'),
    replyMarkup: {
      inline_keyboard: inlineKeyboard,
    },
  };
}

export function buildTelegramStorePlatformSelectView(input: {
  keyId: string;
  accessKey: string;
}) {
  return {
    text: [
      "📱 *Let's Get You Connected\\!*",
      '━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      'Setting up takes less than *2 minutes* ⚡',
      'Your key works on all devices 📱 💻',
      '',
      '🔑 *Your Key:*',
      formatTelegramMarkdownCode(input.accessKey),
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '🌟 *Recommended*   →  Outline',
      '🔧 *Power Users*   →  Hiddify or V2Ray',
      '',
      'Which device are you on? 👇',
    ].join('\n'),
    replyMarkup: {
      inline_keyboard: [
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
        [{
          text: '◀ Back',
          callback_data: buildTelegramStorefrontCallbackData({
            action: 'key_page',
            keyId: input.keyId,
          }),
        }],
      ],
    },
  };
}

export function buildTelegramStorePlatformGuideView(input: {
  keyId: string;
  platform: TelegramStoreGuidePlatform;
  accessKey: string;
}) {
  const config = GUIDE_PLATFORM_CONTENT[input.platform];

  return {
    text: [
      config.title,
      '━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      '*Step 1* — Copy your key 👇',
      `🔑 ${formatTelegramMarkdownCode(input.accessKey)}`,
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━',
      ...config.bodyLines,
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '💡 _First time? Use Outline — one tap to connect\\._',
    ].join('\n').trim(),
    replyMarkup: {
      inline_keyboard: [
        ...config.downloadButtons.map((button) => [{ text: button.text, url: button.url }]),
        config.quickSwitches.map((button) => ({
          text: button.text,
          callback_data: buildTelegramStorefrontCallbackData({
            action: 'guide_platform',
            keyId: input.keyId,
            platform: button.platform,
          }),
        })),
        [{
          text: '◀ Back',
          callback_data: buildTelegramStorefrontCallbackData({
            action: 'platform_select',
            keyId: input.keyId,
          }),
        }],
      ],
    },
  };
}

export function buildTelegramStoreExpiryReminderView(input: {
  firstName: string;
  planName: string;
  expiryLabel: string;
  priceLabel: string;
  plan: TelegramStoreResolvedPlan | null;
  renewTarget?: TelegramStoreRenewTarget | null;
  sameDay?: boolean;
  daysLeft?: number | null;
  dataRemainingLabel?: string | null;
}) {
  const renewCallbackData = buildTelegramStoreRenewCallbackData({
    plan: input.plan,
    renewTarget: input.renewTarget,
  });
  const daysLeft = Math.max(0, input.daysLeft ?? (input.sameDay ? 0 : 3));
  const daysLeftLabel = daysLeft === 0
    ? 'today'
    : `${daysLeft} day${daysLeft === 1 ? '' : 's'}`;

  return {
    text: [
      input.sameDay ? '⚠️ *Plan Expires Today\\!*' : '⏰ *Plan Expiring Soon\\!*',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      input.sameDay
        ? `Your *${escapeTelegramMarkdownV2(input.planName)}* expires today,`
        : `Your *${escapeTelegramMarkdownV2(input.planName)}* expires in *${escapeTelegramMarkdownV2(daysLeftLabel)}*\\.`,
      input.sameDay
        ? `*${escapeTelegramMarkdownV2(input.firstName)}*\\. Renew now to stay connected\\.`
        : 'Renew now to stay connected\\.',
      '',
      `📶 Data remaining  :  ${escapeTelegramMarkdownV2(input.dataRemainingLabel || '—')}`,
      `⏳ Days left       :  ${escapeTelegramMarkdownV2(daysLeftLabel)}`,
    ].join('\n'),
    replyMarkup: {
      inline_keyboard: input.sameDay
        ? [[{ text: `🔄 Renew Now — ${input.priceLabel}`, callback_data: renewCallbackData }]]
        : [
            [{ text: `🔄 Renew Now — ${input.priceLabel}`, callback_data: renewCallbackData }],
            [{ text: '📦 View All Plans', callback_data: buildTelegramStorefrontCallbackData({ action: 'show_plans' }) }],
            [{ text: 'Remind me later', callback_data: buildTelegramStorefrontCallbackData({ action: 'noop' }) }],
          ],
    },
  };
}

export function buildTelegramStoreDataWarningView(input: {
  planName: string;
  usedLabel: string;
  totalLabel: string;
  priceLabel: string;
  progressBar: string;
  plan: TelegramStoreResolvedPlan | null;
  renewTarget?: TelegramStoreRenewTarget | null;
}) {
  return {
    text: [
      '📶 *Low Data Warning\\!*',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      `You've used *80%* of your *${escapeTelegramMarkdownV2(input.planName)}* data\\.`,
      '',
      escapeTelegramMarkdownV2(input.progressBar),
      `${escapeTelegramMarkdownV2(input.usedLabel)} used of ${escapeTelegramMarkdownV2(input.totalLabel)}`,
    ].join('\n'),
    replyMarkup: {
      inline_keyboard: [[{
        text: `🔄 Renew Now — ${input.priceLabel}`,
        callback_data: buildTelegramStoreRenewCallbackData({
          plan: input.plan,
          renewTarget: input.renewTarget,
        }),
      }]],
    },
  };
}

export function buildTelegramStoreSupportAlertText(locale: SupportedLocale) {
  return locale === 'my'
    ? '💬 Live support လိုအပ်ပါက /support ကို အသုံးပြုပါ။'
    : '💬 Use /support if you need live support.';
}

function extractTelegramHandleFromUrl(url?: string | null) {
  const trimmed = url?.trim() || '';
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.replace(/^@+/, '');
  if (!normalized.includes('://') && !normalized.includes('/')) {
    return `@${normalized}`;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname === 't.me') {
      const slug = parsed.pathname.replace(/^\/+/, '').split('/')[0];
      if (slug) {
        return `@${slug}`;
      }
    }
    if (parsed.protocol === 'tg:' && parsed.searchParams.get('domain')) {
      return `@${parsed.searchParams.get('domain')}`;
    }
  } catch {
    // Ignore malformed URLs and fall through.
  }

  return null;
}

export function buildTelegramStoreSupportContactView(input: {
  locale: SupportedLocale;
  supportUrl?: string | null;
}) {
  const supportHandle = extractTelegramHandleFromUrl(input.supportUrl) || '@YourSupportHandle';
  const supportText = input.locale === 'my'
    ? [
        '💬 *Contact Support*',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━',
        '',
        'Our team is ready to help you\\.',
        '',
        `👤 Support: ${escapeTelegramMarkdownV2(supportHandle)}`,
        '⏰ Hours: 9am – 11pm \\(MMT\\)',
      ]
    : [
        '💬 *Contact Support*',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━',
        '',
        'Our team is ready to help you\\.',
        '',
        `👤 Support: ${escapeTelegramMarkdownV2(supportHandle)}`,
        '⏰ Hours: 9am – 11pm \\(MMT\\)',
      ];

  const rows: Array<Array<{ text: string; url?: string; callback_data?: string }>> = [];
  if (input.supportUrl?.trim()) {
    rows.push([{ text: '💬 Open Support Chat', url: input.supportUrl.trim() }]);
  }
  rows.push([{ text: '🏠 Back to Menu', callback_data: buildTelegramStorefrontCallbackData({ action: 'main_menu' }) }]);

  return {
    text: supportText.join('\n'),
    replyMarkup: {
      inline_keyboard: rows,
    },
  };
}

export function buildTelegramStoreHelpView(input?: {
  supportUrl?: string | null;
}) {
  const supportHandle = extractTelegramHandleFromUrl(input?.supportUrl) || '@YourSupportHandle';
  return {
    text: [
      '❓ *Help & FAQ*',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      '*How do I connect?*',
      'Tap /setup for step\\-by\\-step guide\\.',
      '',
      "*My key isn't working?*",
      `Contact ${escapeTelegramMarkdownV2(supportHandle)}\\.`,
      '',
      '*How do I check my data?*',
      'Tap /mykeys to see usage\\.',
      '',
      '*Can I use on multiple devices?*',
      'Yes\\! Unlimited devices on all plans\\.',
      '',
      '*How do I switch server?*',
      'Tap /switchserver to change region\\.',
    ].join('\n'),
    replyMarkup: {
      inline_keyboard: [
        [
          { text: '📲 Setup Guide', callback_data: buildTelegramStorefrontCallbackData({ action: 'setup_home' }) },
          { text: '🔑 My Keys', callback_data: buildTelegramStorefrontCallbackData({ action: 'mykeys_home' }) },
        ],
        [
          { text: '💬 Support', callback_data: buildTelegramStorefrontCallbackData({ action: 'support_contact' }) },
          { text: '🏠 Menu', callback_data: buildTelegramStorefrontCallbackData({ action: 'main_menu' }) },
        ],
      ],
    },
  };
}

export function buildTelegramStoreSetupHomeView() {
  return {
    text: [
      "📱 *Let's Get You Connected\\!*",
      '━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      'Setting up takes less than *2 minutes* ⚡',
      'Your key works on all devices 📱 💻',
      '',
      '🌟 *Recommended*   →  Outline',
      '🔧 *Power Users*   →  Hiddify or V2Ray',
      '',
      'Which device are you on? 👇',
    ].join('\n'),
    replyMarkup: {
      inline_keyboard: [
        [
          { text: '🤖 Android', callback_data: buildTelegramStorefrontCallbackData({ action: 'setup_platform', platform: 'android' }) },
          { text: '🍎 iOS', callback_data: buildTelegramStorefrontCallbackData({ action: 'setup_platform', platform: 'ios' }) },
        ],
        [
          { text: '🪟 Windows', callback_data: buildTelegramStorefrontCallbackData({ action: 'setup_platform', platform: 'windows' }) },
          { text: '🍏 macOS', callback_data: buildTelegramStorefrontCallbackData({ action: 'setup_platform', platform: 'macos' }) },
        ],
        [
          { text: '◀ Back', callback_data: buildTelegramStorefrontCallbackData({ action: 'main_menu' }) },
        ],
      ],
    },
  };
}

export function buildTelegramStoreSetupKeyPickerView(input: {
  platform: TelegramStoreGuidePlatform;
  items: Array<{
    keyId: string;
    planName: string;
    categoryLabel: string;
  }>;
}) {
  return {
    text: [
      `📱 *${input.platform === 'ios' ? 'iOS' : input.platform === 'macos' ? 'macOS' : input.platform === 'windows' ? 'Windows' : 'Android'} Setup*`,
      '━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      'Choose which active key you want to open on this device 👇',
    ].join('\n'),
    replyMarkup: {
      inline_keyboard: [
        ...input.items.map((item) => [
          {
            text: `🔑 ${item.planName} · ${item.categoryLabel}`,
            callback_data: buildTelegramStorefrontCallbackData({
              action: 'guide_platform',
              keyId: item.keyId,
              platform: input.platform,
            }),
          },
        ]),
        [
          { text: '🔑 My Keys', callback_data: buildTelegramStorefrontCallbackData({ action: 'mykeys_home' }) },
          { text: '🏠 Menu', callback_data: buildTelegramStorefrontCallbackData({ action: 'main_menu' }) },
        ],
      ],
    },
  };
}

export function buildTelegramStoreSetupNoKeyView() {
  return {
    text: [
      '📲 *Setup Guide*',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      'You do not have an active key yet\\.',
      '',
      'Tap *My Keys* after you buy a plan, or browse plans below\\.',
    ].join('\n'),
    replyMarkup: {
      inline_keyboard: [
        [
          { text: '🔑 My Keys', callback_data: buildTelegramStorefrontCallbackData({ action: 'mykeys_home' }) },
          { text: '🛒 View Plans', callback_data: buildTelegramStorefrontCallbackData({ action: 'show_plans' }) },
        ],
        [{ text: '🏠 Menu', callback_data: buildTelegramStorefrontCallbackData({ action: 'main_menu' }) }],
      ],
    },
  };
}

export function buildTelegramStoreReferralView(input: {
  botUsername: string;
  telegramUserId: number;
  count: number;
  bonusGb: number;
}) {
  const botUsername = input.botUsername.trim().replace(/^@+/, '') || 'atomicui_bot';
  const referralLink = `https://t.me/${botUsername}?start=ref_${input.telegramUserId}`;
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(
    'Join this VPN bot and get connected fast.',
  )}`;

  return {
    text: [
      '🎁 *Refer a Friend*',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      'Share your link and earn free data\\.',
      '',
      '🔗 Your referral link:',
      escapeTelegramMarkdownV2(referralLink),
      '',
      `👥 Friends referred  :  ${escapeTelegramMarkdownV2(String(input.count))}`,
      `🎁 Bonus earned      :  ${escapeTelegramMarkdownV2(String(input.bonusGb))} GB`,
    ].join('\n'),
    replyMarkup: {
      inline_keyboard: [
        [{ text: '📤 Share My Link', url: shareUrl }],
        [{ text: '🏠 Back to Menu', callback_data: buildTelegramStorefrontCallbackData({ action: 'main_menu' }) }],
      ],
    },
  };
}

export function buildTelegramStoreSetupGuideText(locale: SupportedLocale) {
  if (locale === 'my') {
    return [
      '📲 *Setup Guide*',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      '1\\. [Outline app ကို ဤနေရာမှ ဒေါင်းလုဒ်ဆွဲပါ](https://getoutline.org/get-started/)',
      '2\\. ပို့ပေးထားသော key သို့မဟုတ် share page ကိုဖွင့်ပါ။',
      '3\\. Outline app ထဲတွင် Add Server ကိုနှိပ်ပြီး import လုပ်ပါ။',
      '4\\. Connect ကိုနှိပ်ပြီး VPN ကို အသုံးပြုနိုင်ပါပြီ။',
    ].join('\n');
  }

  return [
    '📲 *Setup Guide*',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    '1\\. [Download the Outline app here](https://getoutline.org/get-started/)',
    '2\\. Open the access key or share page we sent you\\.',
    '3\\. In Outline, tap Add Server and import it\\.',
    '4\\. Tap Connect to start using your VPN\\.',
  ].join('\n');
}
