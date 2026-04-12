import { createOutlineClient } from '@/lib/outline-api';
import { decorateOutlineAccessUrl } from '@/lib/outline-access-url';
import { writeAuditLog } from '@/lib/audit';
import { withAbsoluteBasePath } from '@/lib/base-path';
import { db } from '@/lib/db';
import { type SupportedLocale } from '@/lib/i18n/config';
import { selectLeastLoadedServer } from '@/lib/services/load-balancer';
import { canAssignKeysToServer } from '@/lib/services/server-lifecycle';
import {
  normalizeDynamicRoutingPreferences,
  parseDynamicRoutingPreferences,
} from '@/lib/services/dynamic-subscription-routing';
import {
  buildTelegramAdminKeyCallbackData,
} from '@/lib/services/telegram-callbacks';
import { type TelegramAdminActor } from '@/lib/services/telegram-admin-core';
import { type TelegramAdminKeyDeps } from '@/lib/services/telegram-domain-types';
import {
  type AccessCreateDraft,
  type AccessManageDraft,
  type DynamicCreateDraft,
  type DynamicManageDraft,
  TELEGRAM_REPLY_RECIPIENT_PREFIX,
} from '@/lib/services/telegram-admin-key-types';
import {
  buildCancelKeyboard,
  buildRecipientKeyboard,
  clearPendingAdminFlow,
  loadPendingAdminFlow,
  savePendingAdminFlow,
} from '@/lib/services/telegram-admin-key-flow-state';
import {
  resolveAdminKeyQuery,
  setAccessKeyEnabledState,
} from '@/lib/services/telegram-admin-review';
import { startTelegramAdminDirectMessageFlow } from '@/lib/services/telegram-admin-key-delivery';
import { replyTelegramSupportThreadAsAdmin } from '@/lib/services/telegram-support-admin';
import {
  buildRecipientGuidanceLines,
  canDirectSendToRecipient,
  formatRecipientSummary,
  getPersistedRecipientTelegramId,
  resolveRecipientTarget,
  type RecipientTarget,
} from '@/lib/services/telegram-admin-key-recipients';
import {
  escapeHtml,
  formatExpirationSummary,
  formatTelegramDynamicPoolSummary,
  getFlagEmoji,
  getDynamicKeyRegionChoices,
  getTelegramUi,
} from '@/lib/services/telegram-ui';
import { mergeTagsForStorage } from '@/lib/tags';
import { formatBytes, formatDateTime, generateRandomString } from '@/lib/utils';

function calculateExpiration(
  expirationType: AccessCreateDraft['expirationType'] | DynamicCreateDraft['expirationType'],
  expiresAt?: Date | null,
  durationDays?: number | null,
) {
  switch (expirationType) {
    case 'FIXED_DATE':
      return {
        expiresAt: expiresAt ?? null,
        status: 'ACTIVE',
      } as const;
    case 'DURATION_FROM_CREATION':
      if (durationDays) {
        const calculated = new Date();
        calculated.setDate(calculated.getDate() + durationDays);
        return {
          expiresAt: calculated,
          status: 'ACTIVE',
        } as const;
      }
      return {
        expiresAt: null,
        status: 'ACTIVE',
      } as const;
    case 'START_ON_FIRST_USE':
      return {
        expiresAt: null,
        status: 'PENDING',
      } as const;
    case 'NEVER':
    default:
      return {
        expiresAt: null,
        status: 'ACTIVE',
      } as const;
  }
}


function buildQuotaKeyboard(locale: SupportedLocale, action = 'quota') {
  const isMyanmar = locale === 'my';
  return {
    inline_keyboard: [
      [
        {
          text: isMyanmar ? '♾ Unlimited' : '♾ Unlimited',
          callback_data: buildTelegramAdminKeyCallbackData(action, 'unlimited'),
        },
        {
          text: '10 GB',
          callback_data: buildTelegramAdminKeyCallbackData(action, '10'),
        },
        {
          text: '30 GB',
          callback_data: buildTelegramAdminKeyCallbackData(action, '30'),
        },
      ],
      [
        {
          text: '50 GB',
          callback_data: buildTelegramAdminKeyCallbackData(action, '50'),
        },
        {
          text: isMyanmar ? '✍️ Custom' : '✍️ Custom',
          callback_data: buildTelegramAdminKeyCallbackData(action, 'custom'),
        },
      ],
      buildCancelKeyboard(locale).inline_keyboard[0],
    ],
  };
}

function buildAddQuotaKeyboard(locale: SupportedLocale) {
  return {
    inline_keyboard: [
      [
        {
          text: '+10 GB',
          callback_data: buildTelegramAdminKeyCallbackData('addquota', '10'),
        },
        {
          text: '+20 GB',
          callback_data: buildTelegramAdminKeyCallbackData('addquota', '20'),
        },
        {
          text: '+50 GB',
          callback_data: buildTelegramAdminKeyCallbackData('addquota', '50'),
        },
      ],
      [
        {
          text: locale === 'my' ? '✍️ Custom' : '✍️ Custom',
          callback_data: buildTelegramAdminKeyCallbackData('addquota', 'custom'),
        },
      ],
      buildCancelKeyboard(locale).inline_keyboard[0],
    ],
  };
}

function buildCreateExpiryKeyboard(locale: SupportedLocale) {
  const isMyanmar = locale === 'my';
  return {
    inline_keyboard: [
      [
        {
          text: isMyanmar ? '♾ မကုန်ဆုံးပါ' : '♾ Never',
          callback_data: buildTelegramAdminKeyCallbackData('expiry', 'never'),
        },
        {
          text: '7d',
          callback_data: buildTelegramAdminKeyCallbackData('expiry', '7'),
        },
        {
          text: '30d',
          callback_data: buildTelegramAdminKeyCallbackData('expiry', '30'),
        },
      ],
      [
        {
          text: '90d',
          callback_data: buildTelegramAdminKeyCallbackData('expiry', '90'),
        },
        {
          text: isMyanmar ? '📅 Fixed date' : '📅 Fixed date',
          callback_data: buildTelegramAdminKeyCallbackData('expiry', 'fixed'),
        },
        {
          text: isMyanmar ? '▶️ First use +30d' : '▶️ First use +30d',
          callback_data: buildTelegramAdminKeyCallbackData('expiry', 'start30'),
        },
      ],
      buildCancelKeyboard(locale).inline_keyboard[0],
    ],
  };
}

function buildManageExpiryKeyboard(locale: SupportedLocale) {
  const isMyanmar = locale === 'my';
  return {
    inline_keyboard: [
      [
        {
          text: isMyanmar ? '♾ မကုန်ဆုံးပါ' : '♾ Never',
          callback_data: buildTelegramAdminKeyCallbackData('setexpiry', 'never'),
        },
        {
          text: '+7d',
          callback_data: buildTelegramAdminKeyCallbackData('setexpiry', '7'),
        },
        {
          text: '+30d',
          callback_data: buildTelegramAdminKeyCallbackData('setexpiry', '30'),
        },
      ],
      [
        {
          text: '+90d',
          callback_data: buildTelegramAdminKeyCallbackData('setexpiry', '90'),
        },
        {
          text: isMyanmar ? '📅 Fixed date' : '📅 Fixed date',
          callback_data: buildTelegramAdminKeyCallbackData('setexpiry', 'fixed'),
        },
      ],
      buildCancelKeyboard(locale).inline_keyboard[0],
    ],
  };
}

function renderServerChoiceLabel(server: {
  name: string;
  countryCode?: string | null;
  lifecycleMode?: string | null;
}) {
  const flag = server.countryCode ? ` ${getFlagEmoji(server.countryCode)}` : '';
  const lifecycle =
    server.lifecycleMode === 'DRAINING'
      ? ' • Draining'
      : server.lifecycleMode === 'MAINTENANCE'
        ? ' • Maintenance'
        : '';
  return `${server.name}${flag}${lifecycle}`;
}

async function buildAccessServerKeyboard(locale: SupportedLocale) {
  const isMyanmar = locale === 'my';
  const servers = await db.server.findMany({
    where: {
      isActive: true,
      lifecycleMode: {
        not: 'MAINTENANCE',
      },
    },
    select: {
      id: true,
      name: true,
      countryCode: true,
      lifecycleMode: true,
    },
    orderBy: [{ name: 'asc' }],
  });

  const rows: Array<Array<{ text: string; callback_data: string }>> = [[
    {
      text: isMyanmar ? '⚡ Auto best server' : '⚡ Auto best server',
      callback_data: buildTelegramAdminKeyCallbackData('server', 'auto'),
    },
  ]];

  for (const server of servers) {
    rows.push([
      {
        text: renderServerChoiceLabel(server),
        callback_data: buildTelegramAdminKeyCallbackData('server', server.id),
      },
    ]);
  }

  rows.push(buildCancelKeyboard(locale).inline_keyboard[0]);
  return {
    inline_keyboard: rows,
  };
}

function formatRegionModeLabel(mode: string | null | undefined, locale: SupportedLocale) {
  if ((mode || '').toUpperCase() === 'ONLY') {
    return locale === 'my' ? 'Only preferred regions' : 'Only preferred regions';
  }
  return locale === 'my' ? 'Prefer preferred regions' : 'Prefer preferred regions';
}

function formatPinnedRoutingLabel(input: {
  pinnedServerId?: string | null;
  pinExpiresAt?: Date | null;
  locale: SupportedLocale;
}) {
  if (!input.pinnedServerId) {
    return null;
  }
  const base = input.locale === 'my'
    ? 'Temporary fallback pin active'
    : 'Temporary fallback pin active';
  if (!input.pinExpiresAt) {
    return base;
  }
  return `${base} • ${formatDateTime(input.pinExpiresAt)}`;
}

function buildDynamicRoutingManageLines(input: {
  preferredCountryCodesJson?: string | null;
  preferredServerIdsJson?: string | null;
  preferredRegionMode?: string | null;
  pinnedServerId?: string | null;
  pinExpiresAt?: Date | null;
  accessKeys: Array<{
    server?: {
      countryCode?: string | null;
    } | null;
  }>;
  locale: SupportedLocale;
}) {
  const ui = getTelegramUi(input.locale);
  const routingSummary = formatTelegramDynamicPoolSummary(input, ui);
  const regionChoices = getDynamicKeyRegionChoices(input);
  const pinnedLabel = formatPinnedRoutingLabel({
    pinnedServerId: input.pinnedServerId,
    pinExpiresAt: input.pinExpiresAt,
    locale: input.locale,
  });

  return [
    `🌍 ${routingSummary}`,
    `${input.locale === 'my' ? '🧭 Region mode' : '🧭 Region mode'}: ${formatRegionModeLabel(
      input.preferredRegionMode,
      input.locale,
    )}`,
    regionChoices.length > 0
      ? `${input.locale === 'my' ? '📍 Region choices' : '📍 Region choices'}: ${regionChoices.join(', ')}`
      : null,
    pinnedLabel ? `📌 ${pinnedLabel}` : null,
  ].filter((value): value is string => Boolean(value));
}

async function writeTelegramAdminKeyAudit(input: {
  adminActor: TelegramAdminActor;
  action: string;
  entity: 'ACCESS_KEY' | 'DYNAMIC_ACCESS_KEY';
  entityId: string;
  details?: Record<string, unknown>;
}) {
  await writeAuditLog({
    userId: input.adminActor.userId,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId,
    details: {
      via: 'telegram_bot',
      ...(input.details ?? {}),
    },
  });
}

function parseGbInput(text: string) {
  const normalized = text.trim().toLowerCase().replace(/gb/g, '').trim();
  const value = Number.parseFloat(normalized);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.round(value * 100) / 100;
}

function parseFixedDateInput(text: string) {
  const trimmed = text.trim();
  const match = trimmed.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  const date = new Date(`${year}-${month}-${day}T23:59:59+09:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildCreateConfirmKeyboard(locale: SupportedLocale, canSendDirect: boolean) {
  const isMyanmar = locale === 'my';
  const rows: Array<Array<{ text: string; callback_data: string }>> = [[
    {
      text: isMyanmar ? '✅ Create only' : '✅ Create only',
      callback_data: buildTelegramAdminKeyCallbackData('confirm', 'create'),
    },
  ]];

  if (canSendDirect) {
    rows[0].push({
      text: isMyanmar ? '📨 Create & send' : '📨 Create & send',
      callback_data: buildTelegramAdminKeyCallbackData('confirm', 'send'),
    });
  }

  rows.push(buildCancelKeyboard(locale).inline_keyboard[0]);
  return {
    inline_keyboard: rows,
  };
}

function buildDangerConfirmKeyboard(input: {
  locale: SupportedLocale;
  action: 'resetusage' | 'toggle_off';
}) {
  const isMyanmar = input.locale === 'my';
  const actionLabel =
    input.action === 'resetusage'
      ? isMyanmar
        ? '🔄 Reset usage'
        : '🔄 Reset usage'
      : isMyanmar
        ? '⛔ Disable key'
        : '⛔ Disable key';
  return {
    inline_keyboard: [
      [
        {
          text: isMyanmar ? `✅ Confirm ${actionLabel}` : `✅ Confirm ${actionLabel}`,
          callback_data: buildTelegramAdminKeyCallbackData('danger', input.action, 'confirm'),
        },
      ],
      [
        {
          text: isMyanmar ? '↩️ Back' : '↩️ Back',
          callback_data: buildTelegramAdminKeyCallbackData('danger', input.action, 'back'),
        },
      ],
      buildCancelKeyboard(input.locale).inline_keyboard[0],
    ],
  };
}

function buildAccessManageKeyboard(input: {
  locale: SupportedLocale;
  enabled: boolean;
  panelUrl: string;
  canMessageUser: boolean;
}) {
  const isMyanmar = input.locale === 'my';
  return {
    inline_keyboard: [
      [
        {
          text: '+10 GB',
          callback_data: buildTelegramAdminKeyCallbackData('shortcut', 'topup10'),
        },
        {
          text: '+30 GB',
          callback_data: buildTelegramAdminKeyCallbackData('shortcut', 'topup30'),
        },
      ],
      [
        {
          text: '+7d',
          callback_data: buildTelegramAdminKeyCallbackData('shortcut', 'extend7'),
        },
        {
          text: '+30d',
          callback_data: buildTelegramAdminKeyCallbackData('shortcut', 'extend30'),
        },
      ],
      [
        {
          text: isMyanmar ? '📦 Set quota' : '📦 Set quota',
          callback_data: buildTelegramAdminKeyCallbackData('manage', 'quota'),
        },
        {
          text: isMyanmar ? '➕ Add quota' : '➕ Add quota',
          callback_data: buildTelegramAdminKeyCallbackData('manage', 'addquota'),
        },
      ],
      [
        {
          text: isMyanmar ? '🔄 Reset usage' : '🔄 Reset usage',
          callback_data: buildTelegramAdminKeyCallbackData('manage', 'resetusage'),
        },
        {
          text: isMyanmar ? '📅 Expiry' : '📅 Expiry',
          callback_data: buildTelegramAdminKeyCallbackData('manage', 'expiry'),
        },
      ],
      [
        {
          text: input.enabled
            ? (isMyanmar ? '⛔ Disable' : '⛔ Disable')
            : (isMyanmar ? '✅ Enable' : '✅ Enable'),
          callback_data: buildTelegramAdminKeyCallbackData('manage', 'toggle'),
        },
        {
          text: isMyanmar ? '📨 Resend access' : '📨 Resend access',
          callback_data: buildTelegramAdminKeyCallbackData('manage', 'resend'),
        },
      ],
      [
        ...(input.canMessageUser
          ? [{
              text: isMyanmar ? '💬 Message user' : '💬 Message user',
              callback_data: buildTelegramAdminKeyCallbackData('manage', 'message'),
            }]
          : []),
        {
          text: isMyanmar ? 'Open panel' : 'Open panel',
          url: input.panelUrl,
        },
      ],
      buildCancelKeyboard(input.locale).inline_keyboard[0],
    ],
  };
}

function buildDynamicManageKeyboard(input: {
  locale: SupportedLocale;
  panelUrl: string;
  canMessageUser: boolean;
}) {
  const isMyanmar = input.locale === 'my';
  return {
    inline_keyboard: [
      [
        {
          text: '+10 GB',
          callback_data: buildTelegramAdminKeyCallbackData('shortcut', 'topup10'),
        },
        {
          text: '+30 GB',
          callback_data: buildTelegramAdminKeyCallbackData('shortcut', 'topup30'),
        },
      ],
      [
        {
          text: '+7d',
          callback_data: buildTelegramAdminKeyCallbackData('shortcut', 'extend7'),
        },
        {
          text: '+30d',
          callback_data: buildTelegramAdminKeyCallbackData('shortcut', 'extend30'),
        },
      ],
      [
        {
          text: isMyanmar ? '📦 Set quota' : '📦 Set quota',
          callback_data: buildTelegramAdminKeyCallbackData('manage', 'quota'),
        },
        {
          text: isMyanmar ? '➕ Add quota' : '➕ Add quota',
          callback_data: buildTelegramAdminKeyCallbackData('manage', 'addquota'),
        },
      ],
      [
        {
          text: isMyanmar ? '🔄 Reset usage' : '🔄 Reset usage',
          callback_data: buildTelegramAdminKeyCallbackData('manage', 'resetusage'),
        },
        {
          text: isMyanmar ? '📅 Expiry' : '📅 Expiry',
          callback_data: buildTelegramAdminKeyCallbackData('manage', 'expiry'),
        },
      ],
      [
        {
          text: isMyanmar ? '🌍 Preferred region' : '🌍 Preferred region',
          callback_data: buildTelegramAdminKeyCallbackData('manage', 'region'),
        },
        {
          text: isMyanmar ? '🧭 Region mode' : '🧭 Region mode',
          callback_data: buildTelegramAdminKeyCallbackData('manage', 'mode'),
        },
      ],
      [
        {
          text: isMyanmar ? '📨 Resend access' : '📨 Resend access',
          callback_data: buildTelegramAdminKeyCallbackData('manage', 'resend'),
        },
        {
          text: isMyanmar ? '💎 Routing view' : '💎 Routing view',
          callback_data: buildTelegramAdminKeyCallbackData('manage', 'routing'),
        },
      ],
      [
        ...(input.canMessageUser
          ? [{
              text: isMyanmar ? '💬 Message user' : '💬 Message user',
              callback_data: buildTelegramAdminKeyCallbackData('manage', 'message'),
            }]
          : []),
        {
          text: isMyanmar ? 'Open panel' : 'Open panel',
          url: input.panelUrl,
        },
      ],
      buildCancelKeyboard(input.locale).inline_keyboard[0],
    ],
  };
}

function buildDynamicRegionKeyboard(input: {
  locale: SupportedLocale;
  regionCodes: string[];
}) {
  const isMyanmar = input.locale === 'my';
  const rows = input.regionCodes.slice(0, 8).map((regionCode) => [
    {
      text: `${getFlagEmoji(regionCode)} ${regionCode}`,
      callback_data: buildTelegramAdminKeyCallbackData('setregion', regionCode),
    },
  ]);
  rows.unshift([
    {
      text: isMyanmar ? '⚡ Auto / clear preference' : '⚡ Auto / clear preference',
      callback_data: buildTelegramAdminKeyCallbackData('setregion', 'auto'),
    },
  ]);
  rows.push(buildCancelKeyboard(input.locale).inline_keyboard[0]);
  return {
    inline_keyboard: rows,
  };
}

function describeExpirationDraft(
  locale: SupportedLocale,
  expirationType: AccessCreateDraft['expirationType'] | DynamicCreateDraft['expirationType'],
  durationDays: number | null,
  expiresAtIso: string | null,
) {
  return formatExpirationSummary(
    {
      expirationType,
      durationDays,
      expiresAt: expiresAtIso ? new Date(expiresAtIso) : null,
    },
    locale,
  );
}

export async function promptAccessCreateName(input: {
  draft: AccessCreateDraft;
  chatId: number;
  botToken: string;
  locale: SupportedLocale;
  deps: TelegramAdminKeyDeps;
}) {
  const isMyanmar = input.locale === 'my';
  await input.deps.sendTelegramMessage(
    input.botToken,
    input.chatId,
    [
      isMyanmar ? '➕ <b>Create normal key</b>' : '➕ <b>Create normal key</b>',
      '',
      `${isMyanmar ? 'Recipient' : 'Recipient'}: ${formatRecipientSummary(input.draft.recipient, input.locale)}`,
      ...buildRecipientGuidanceLines(input.draft.recipient, input.locale),
      '',
      isMyanmar
        ? 'ယခု key name ကို စာသားဖြင့် ပို့ပေးပါ။'
        : 'Send the key name as text now.',
    ].join('\n'),
    {
      replyMarkup: buildCancelKeyboard(input.locale),
    },
  );
}

export async function promptDynamicCreateName(input: {
  draft: DynamicCreateDraft;
  chatId: number;
  botToken: string;
  locale: SupportedLocale;
  deps: TelegramAdminKeyDeps;
}) {
  const isMyanmar = input.locale === 'my';
  await input.deps.sendTelegramMessage(
    input.botToken,
    input.chatId,
    [
      isMyanmar ? '💎 <b>Create dynamic key</b>' : '💎 <b>Create dynamic key</b>',
      '',
      `${isMyanmar ? 'Recipient' : 'Recipient'}: ${formatRecipientSummary(input.draft.recipient, input.locale)}`,
      ...buildRecipientGuidanceLines(input.draft.recipient, input.locale),
      '',
      isMyanmar
        ? 'ယခု dynamic key name ကို စာသားဖြင့် ပို့ပေးပါ။'
        : 'Send the dynamic key name as text now.',
    ].join('\n'),
    {
      replyMarkup: buildCancelKeyboard(input.locale),
    },
  );
}

async function promptAccessServer(input: {
  draft: AccessCreateDraft;
  chatId: number;
  botToken: string;
  locale: SupportedLocale;
  deps: TelegramAdminKeyDeps;
}) {
  const isMyanmar = input.locale === 'my';
  await input.deps.sendTelegramMessage(
    input.botToken,
    input.chatId,
    [
      isMyanmar ? '🖥 <b>Choose server</b>' : '🖥 <b>Choose server</b>',
      '',
      `${isMyanmar ? 'Key' : 'Key'}: <b>${escapeHtml(input.draft.name || '-')}</b>`,
      isMyanmar
        ? 'Auto သည် draining/maintenance ကို ရှောင်ပါမည်။ Manual ရွေးချယ်မှုတွင် draining server ကိုလည်း ရွေးနိုင်ပါသည်။'
        : 'Auto skips draining and maintenance. Manual selection can still use draining servers.',
    ].join('\n'),
    {
      replyMarkup: await buildAccessServerKeyboard(input.locale),
    },
  );
}

async function promptDynamicType(input: {
  draft: DynamicCreateDraft;
  chatId: number;
  botToken: string;
  locale: SupportedLocale;
  deps: TelegramAdminKeyDeps;
}) {
  const isMyanmar = input.locale === 'my';
  await input.deps.sendTelegramMessage(
    input.botToken,
    input.chatId,
    [
      isMyanmar ? '🧭 <b>Choose dynamic mode</b>' : '🧭 <b>Choose dynamic mode</b>',
      '',
      `${isMyanmar ? 'Key' : 'Key'}: <b>${escapeHtml(input.draft.name || '-')}</b>`,
      isMyanmar
        ? 'SELF_MANAGED သည် preferred routing/fallback အတွက် သင့်တော်ပါသည်။ MANUAL သည် admin controlled routing အတွက်ဖြစ်သည်။'
        : 'SELF_MANAGED is better for preferred routing and fallback. MANUAL keeps routing under admin control.',
    ].join('\n'),
    {
      replyMarkup: {
        inline_keyboard: [
          [
            {
              text: '⚡ Self-managed',
              callback_data: buildTelegramAdminKeyCallbackData('type', 'self'),
            },
            {
              text: '🛠 Manual',
              callback_data: buildTelegramAdminKeyCallbackData('type', 'manual'),
            },
          ],
          buildCancelKeyboard(input.locale).inline_keyboard[0],
        ],
      },
    },
  );
}

async function promptQuota(input: {
  kind: 'create_access' | 'create_dynamic' | 'manage_access' | 'manage_dynamic';
  chatId: number;
  botToken: string;
  locale: SupportedLocale;
  deps: TelegramAdminKeyDeps;
}) {
  const isMyanmar = input.locale === 'my';
  const title =
    input.kind === 'create_access'
      ? isMyanmar
        ? '📦 <b>Set quota</b>'
        : '📦 <b>Set quota</b>'
      : input.kind === 'create_dynamic'
        ? isMyanmar
          ? '📦 <b>Set dynamic quota</b>'
          : '📦 <b>Set dynamic quota</b>'
        : isMyanmar
          ? '📦 <b>Update quota</b>'
          : '📦 <b>Update quota</b>';
  await input.deps.sendTelegramMessage(input.botToken, input.chatId, title, {
    replyMarkup: buildQuotaKeyboard(input.locale),
  });
}

async function promptAddQuota(input: {
  chatId: number;
  botToken: string;
  locale: SupportedLocale;
  deps: TelegramAdminKeyDeps;
}) {
  const isMyanmar = input.locale === 'my';
  await input.deps.sendTelegramMessage(
    input.botToken,
    input.chatId,
    isMyanmar ? '➕ <b>Add more quota</b>' : '➕ <b>Add more quota</b>',
    {
      replyMarkup: buildAddQuotaKeyboard(input.locale),
    },
  );
}

async function promptCreateExpiry(input: {
  chatId: number;
  botToken: string;
  locale: SupportedLocale;
  deps: TelegramAdminKeyDeps;
}) {
  const isMyanmar = input.locale === 'my';
  await input.deps.sendTelegramMessage(
    input.botToken,
    input.chatId,
    [
      isMyanmar ? '⏳ <b>Set expiration</b>' : '⏳ <b>Set expiration</b>',
      '',
      isMyanmar
        ? 'Fixed date အတွက် YYYY-MM-DD (KST) ကို နောက် message အဖြစ် ပို့နိုင်ပါသည်။'
        : 'For a fixed date, send YYYY-MM-DD (KST) in the next message.',
    ].join('\n'),
    {
      replyMarkup: buildCreateExpiryKeyboard(input.locale),
    },
  );
}

async function promptManageExpiry(input: {
  chatId: number;
  botToken: string;
  locale: SupportedLocale;
  deps: TelegramAdminKeyDeps;
}) {
  const isMyanmar = input.locale === 'my';
  await input.deps.sendTelegramMessage(
    input.botToken,
    input.chatId,
    [
      isMyanmar ? '⏳ <b>Update expiration</b>' : '⏳ <b>Update expiration</b>',
      '',
      isMyanmar
        ? 'Fixed date အတွက် YYYY-MM-DD (KST) ကို နောက် message အဖြစ် ပို့နိုင်ပါသည်။'
        : 'For a fixed date, send YYYY-MM-DD (KST) in the next message.',
    ].join('\n'),
    {
      replyMarkup: buildManageExpiryKeyboard(input.locale),
    },
  );
}

async function promptAccessCreateConfirm(input: {
  draft: AccessCreateDraft;
  chatId: number;
  botToken: string;
  locale: SupportedLocale;
  deps: TelegramAdminKeyDeps;
}) {
  const server = input.draft.serverId
    ? await db.server.findUnique({
        where: { id: input.draft.serverId },
        select: {
          id: true,
          name: true,
          countryCode: true,
          lifecycleMode: true,
        },
      })
    : null;
  const serverLabel =
    input.draft.assignmentMode === 'AUTO'
      ? (input.locale === 'my' ? 'Auto placement' : 'Auto placement')
      : server
        ? renderServerChoiceLabel(server)
        : input.locale === 'my'
          ? 'Unknown server'
          : 'Unknown server';

  await input.deps.sendTelegramMessage(
    input.botToken,
    input.chatId,
    [
      input.locale === 'my' ? '✅ <b>Confirm normal key</b>' : '✅ <b>Confirm normal key</b>',
      '',
      `🔑 <b>${escapeHtml(input.draft.name || '-')}</b>`,
      `👤 ${formatRecipientSummary(input.draft.recipient, input.locale)}`,
      `🖥 ${escapeHtml(serverLabel)}`,
      `📦 ${
        input.draft.dataLimitGB
          ? `${input.draft.dataLimitGB} GB`
          : input.locale === 'my'
            ? 'Unlimited'
            : 'Unlimited'
      }`,
      `⏳ ${escapeHtml(
        describeExpirationDraft(
          input.locale,
          input.draft.expirationType,
          input.draft.durationDays,
          input.draft.expiresAt,
        ),
      )}`,
      '',
      ...buildRecipientGuidanceLines(input.draft.recipient, input.locale),
    ].join('\n'),
    {
      replyMarkup: buildCreateConfirmKeyboard(
        input.locale,
        canDirectSendToRecipient(input.draft.recipient),
      ),
    },
  );
}

async function promptDynamicCreateConfirm(input: {
  draft: DynamicCreateDraft;
  chatId: number;
  botToken: string;
  locale: SupportedLocale;
  deps: TelegramAdminKeyDeps;
}) {
  await input.deps.sendTelegramMessage(
    input.botToken,
    input.chatId,
    [
      input.locale === 'my' ? '✅ <b>Confirm dynamic key</b>' : '✅ <b>Confirm dynamic key</b>',
      '',
      `💎 <b>${escapeHtml(input.draft.name || '-')}</b>`,
      `👤 ${formatRecipientSummary(input.draft.recipient, input.locale)}`,
      `🧭 ${escapeHtml(input.draft.keyType === 'SELF_MANAGED' ? 'Self-managed' : 'Manual')}`,
      `📦 ${
        input.draft.dataLimitGB
          ? `${input.draft.dataLimitGB} GB`
          : input.locale === 'my'
            ? 'Unlimited'
            : 'Unlimited'
      }`,
      `⏳ ${escapeHtml(
        describeExpirationDraft(
          input.locale,
          input.draft.expirationType,
          input.draft.durationDays,
          input.draft.expiresAt,
        ),
      )}`,
      '',
      ...buildRecipientGuidanceLines(input.draft.recipient, input.locale),
    ].join('\n'),
    {
      replyMarkup: buildCreateConfirmKeyboard(
        input.locale,
        canDirectSendToRecipient(input.draft.recipient),
      ),
    },
  );
}

function parseExpirationUpdate(
  currentExpiresAt: Date | null,
  action: string,
  fixedDate?: Date | null,
) {
  if (action === 'never') {
    return {
      expirationType: 'NEVER' as const,
      expiresAt: null,
      durationDays: null,
      status: 'ACTIVE' as const,
    };
  }

  if (action === 'fixed' && fixedDate) {
    return {
      expirationType: 'FIXED_DATE' as const,
      expiresAt: fixedDate,
      durationDays: null,
      status: fixedDate.getTime() > Date.now() ? ('ACTIVE' as const) : ('EXPIRED' as const),
    };
  }

  const plusDays =
    action === '7' ? 7
      : action === '30' ? 30
        : action === '90' ? 90
          : 0;
  const base = currentExpiresAt && currentExpiresAt.getTime() > Date.now()
    ? new Date(currentExpiresAt)
    : new Date();
  base.setDate(base.getDate() + plusDays);

  return {
    expirationType: 'FIXED_DATE' as const,
    expiresAt: base,
    durationDays: null,
    status: 'ACTIVE' as const,
  };
}

export async function resolveDynamicKeyQuery(query: string) {
  const trimmed = query.trim();
  if (!trimmed) {
    return { kind: 'empty' as const };
  }

  const byId = await db.dynamicAccessKey.findUnique({
    where: { id: trimmed },
    include: {
      user: true,
      accessKeys: {
        select: {
          id: true,
          server: {
            select: {
              countryCode: true,
            },
          },
        },
      },
    },
  });
  if (byId) {
    return { kind: 'single' as const, key: byId };
  }

  const matches = await db.dynamicAccessKey.findMany({
    where: {
      OR: [
        { name: { contains: trimmed } },
        { email: { contains: trimmed.toLowerCase() } },
        { telegramId: { contains: trimmed } },
        { publicSlug: { contains: trimmed.toLowerCase() } },
        { user: { email: { contains: trimmed.toLowerCase() } } },
      ],
    },
    include: {
      user: true,
      accessKeys: {
        select: {
          id: true,
          server: {
            select: {
              countryCode: true,
            },
          },
        },
      },
    },
    orderBy: [{ updatedAt: 'desc' }],
    take: 5,
  });

  if (matches.length === 1) {
    return { kind: 'single' as const, key: matches[0] };
  }

  return {
    kind: 'many' as const,
    matches,
  };
}

function formatAccessManageSummary(key: {
  id: string;
  name: string;
  status: string;
  server: {
    name: string;
    countryCode?: string | null;
    lifecycleMode?: string | null;
  };
  usedBytes: bigint;
  dataLimitBytes: bigint | null;
  expirationType: string;
  expiresAt: Date | null;
  durationDays: number | null;
  email?: string | null;
  telegramId?: string | null;
}, locale: SupportedLocale) {
  return [
    locale === 'my' ? '🛠 <b>Manage normal key</b>' : '🛠 <b>Manage normal key</b>',
    '',
    `🔑 <b>${escapeHtml(key.name)}</b>`,
    `🆔 <code>${key.id}</code>`,
    `📈 ${escapeHtml(key.status)}`,
    `🖥 ${escapeHtml(renderServerChoiceLabel(key.server))}`,
    `📦 ${escapeHtml(
      key.dataLimitBytes
        ? `${formatBytes(key.usedBytes)} / ${formatBytes(key.dataLimitBytes)}`
        : (locale === 'my' ? 'Unlimited' : 'Unlimited'),
    )}`,
    `⏳ ${escapeHtml(
      formatExpirationSummary(
        {
          expiresAt: key.expiresAt,
          expirationType: key.expirationType,
          durationDays: key.durationDays,
        },
        locale,
      ),
    )}`,
    key.email ? `✉️ ${escapeHtml(key.email)}` : '',
    key.telegramId ? `📨 <code>${escapeHtml(key.telegramId)}</code>` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function formatDynamicManageSummary(key: {
  id: string;
  name: string;
  type: string;
  status: string;
  usedBytes: bigint;
  dataLimitBytes: bigint | null;
  expirationType: string;
  expiresAt: Date | null;
  durationDays: number | null;
  telegramId?: string | null;
  email?: string | null;
  preferredCountryCodesJson?: string | null;
  preferredServerIdsJson?: string | null;
  preferredRegionMode?: string | null;
  pinnedServerId?: string | null;
  pinExpiresAt?: Date | null;
  accessKeys: Array<{
    id: string;
    server?: {
      countryCode?: string | null;
    } | null;
  }>;
}, locale: SupportedLocale) {
  return [
    locale === 'my' ? '🧭 <b>Manage dynamic key</b>' : '🧭 <b>Manage dynamic key</b>',
    '',
    `💎 <b>${escapeHtml(key.name)}</b>`,
    `🆔 <code>${key.id}</code>`,
    `📈 ${escapeHtml(key.status)}`,
    `🧭 ${escapeHtml(key.type)}`,
    `🖥 ${locale === 'my' ? 'Attached keys' : 'Attached keys'}: ${key.accessKeys.length}`,
    `📦 ${escapeHtml(
      key.dataLimitBytes
        ? `${formatBytes(key.usedBytes)} / ${formatBytes(key.dataLimitBytes)}`
        : (locale === 'my' ? 'Unlimited' : 'Unlimited'),
    )}`,
    `⏳ ${escapeHtml(
      formatExpirationSummary(
        {
          expiresAt: key.expiresAt,
          expirationType: key.expirationType,
          durationDays: key.durationDays,
        },
        locale,
      ),
    )}`,
    key.email ? `✉️ ${escapeHtml(key.email)}` : '',
    key.telegramId ? `📨 <code>${escapeHtml(key.telegramId)}</code>` : '',
    ...buildDynamicRoutingManageLines({
      preferredCountryCodesJson: key.preferredCountryCodesJson,
      preferredServerIdsJson: key.preferredServerIdsJson,
      preferredRegionMode: key.preferredRegionMode,
      pinnedServerId: key.pinnedServerId,
      pinExpiresAt: key.pinExpiresAt,
      accessKeys: key.accessKeys,
      locale,
    }),
  ]
    .filter(Boolean)
    .join('\n');
}

export async function showAccessManageActions(input: {
  chatId: number;
  botToken: string;
  locale: SupportedLocale;
  keyId: string;
  deps: TelegramAdminKeyDeps;
}) {
  const key = await db.accessKey.findUnique({
    where: { id: input.keyId },
    include: {
      server: {
        select: {
          name: true,
          countryCode: true,
          lifecycleMode: true,
        },
      },
      user: {
        select: {
          id: true,
          email: true,
          telegramChatId: true,
        },
      },
    },
  });
  if (!key) {
    await input.deps.sendTelegramMessage(
      input.botToken,
      input.chatId,
      input.locale === 'my' ? 'Access key မတွေ့ပါ။' : 'Access key not found.',
    );
    return;
  }

  await input.deps.sendTelegramMessage(
    input.botToken,
    input.chatId,
    formatAccessManageSummary(key, input.locale),
    {
      replyMarkup: buildAccessManageKeyboard({
        locale: input.locale,
        enabled: key.status !== 'DISABLED',
        panelUrl: buildAccessKeyPanelUrl(key.id),
        canMessageUser: Boolean(key.user?.telegramChatId || key.telegramId),
      }),
    },
  );
}

export async function showDynamicManageActions(input: {
  chatId: number;
  botToken: string;
  locale: SupportedLocale;
  dynamicKeyId: string;
  deps: TelegramAdminKeyDeps;
}) {
  const key = await db.dynamicAccessKey.findUnique({
    where: { id: input.dynamicKeyId },
    include: {
      accessKeys: {
        select: {
          id: true,
          server: {
            select: {
              countryCode: true,
            },
          },
        },
      },
      user: {
        select: {
          id: true,
          email: true,
          telegramChatId: true,
        },
      },
    },
  });
  if (!key) {
    await input.deps.sendTelegramMessage(
      input.botToken,
      input.chatId,
      input.locale === 'my' ? 'Dynamic key မတွေ့ပါ။' : 'Dynamic key not found.',
    );
    return;
  }

  await input.deps.sendTelegramMessage(
    input.botToken,
    input.chatId,
    formatDynamicManageSummary(key, input.locale),
    {
      replyMarkup: buildDynamicManageKeyboard({
        locale: input.locale,
        panelUrl: buildDynamicKeyPanelUrl(key.id),
        canMessageUser: Boolean(key.user?.telegramChatId || key.telegramId),
      }),
    },
  );
}

export async function promptManageMatches(input: {
  chatId: number;
  botToken: string;
  locale: SupportedLocale;
  type: 'access' | 'dynamic';
  matches: Array<{ id: string; name: string; status: string; details: string[] }>;
  deps: TelegramAdminKeyDeps;
}) {
  const isMyanmar = input.locale === 'my';
  const rows = input.matches.map((match, index) => ([
    {
      text: `${index + 1}. ${match.name} • ${match.status}`.slice(0, 60),
      callback_data: buildTelegramAdminKeyCallbackData('pick', match.id),
    },
  ]));
  rows.push(buildCancelKeyboard(input.locale).inline_keyboard[0]);

  await input.deps.sendTelegramMessage(
    input.botToken,
    input.chatId,
    [
      input.type === 'access'
        ? (isMyanmar ? '🔎 <b>Matching access keys</b>' : '🔎 <b>Matching access keys</b>')
        : (isMyanmar ? '🔎 <b>Matching dynamic keys</b>' : '🔎 <b>Matching dynamic keys</b>'),
      '',
      ...input.matches.flatMap((match, index) => [
        `${index + 1}. <b>${escapeHtml(match.name)}</b> • ${escapeHtml(match.status)}`,
        ...match.details.map((detail) => `   ${escapeHtml(detail)}`),
        '',
      ]),
      isMyanmar ? 'တစ်ခုကို ရွေးပါ။' : 'Choose one match.',
    ].join('\n'),
    {
      replyMarkup: {
        inline_keyboard: rows,
      },
    },
  );
}

function currentRawMetricForAccessKey(key: {
  usedBytes: bigint;
  usageOffset: bigint | null;
}) {
  return key.usedBytes + (key.usageOffset ?? BigInt(0));
}

async function getLiveOutlineMetricBytesForKey(key: {
  outlineKeyId: string;
  server: { apiUrl: string; apiCertSha256: string };
  usedBytes: bigint;
  usageOffset: bigint | null;
}) {
  try {
    const client = createOutlineClient(key.server.apiUrl, key.server.apiCertSha256);
    const metrics = await client.getMetrics();
    const raw = metrics?.bytesTransferredByUserId?.[key.outlineKeyId] ??
      metrics?.bytesTransferredByUserId?.[String(key.outlineKeyId)];
    if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
      return BigInt(raw);
    }
  } catch {
    // Fall back to the stored usage + offset approximation.
  }

  const rawApproximation = currentRawMetricForAccessKey(key);
  return rawApproximation > BigInt(0) ? rawApproximation : BigInt(0);
}

async function applyAccessKeyQuota(input: {
  keyId: string;
  dataLimitGB: number | null;
}) {
  const key = await db.accessKey.findUnique({
    where: { id: input.keyId },
    include: {
      server: true,
    },
  });
  if (!key) {
    throw new Error('Access key not found.');
  }

  const limitBytes =
    input.dataLimitGB == null
      ? null
      : BigInt(Math.round(input.dataLimitGB * 1024 * 1024 * 1024));

  if (key.status !== 'DISABLED') {
    const client = createOutlineClient(key.server.apiUrl, key.server.apiCertSha256);
    if (limitBytes) {
      const serverLimit = currentRawMetricForAccessKey(key) + limitBytes;
      await client.setAccessKeyDataLimit(key.outlineKeyId, Number(serverLimit > BigInt(0) ? serverLimit : BigInt(0)));
    } else {
      await client.removeAccessKeyDataLimit(key.outlineKeyId);
    }
  }

  return db.accessKey.update({
    where: { id: key.id },
    data: {
      dataLimitBytes: limitBytes,
      quotaAlertsSent: '[]',
    },
    include: {
      server: {
        select: {
          name: true,
          countryCode: true,
          lifecycleMode: true,
        },
      },
    },
  });
}

async function resetAccessKeyUsage(keyId: string) {
  const key = await db.accessKey.findUnique({
    where: { id: keyId },
    include: {
      server: true,
    },
  });
  if (!key) {
    throw new Error('Access key not found.');
  }

  const metricBytes =
    key.status === 'DISABLED'
      ? (currentRawMetricForAccessKey(key) > BigInt(0) ? currentRawMetricForAccessKey(key) : BigInt(0))
      : await getLiveOutlineMetricBytesForKey(key);
  const now = new Date();

  if (key.status !== 'DISABLED' && key.dataLimitBytes) {
    const client = createOutlineClient(key.server.apiUrl, key.server.apiCertSha256);
    await client.setAccessKeyDataLimit(
      key.outlineKeyId,
      Number(metricBytes + key.dataLimitBytes),
    );
  }

  return db.accessKey.update({
    where: { id: key.id },
    data: {
      usedBytes: BigInt(0),
      usageOffset: metricBytes,
      lastDataLimitReset: now,
      quotaAlertsSent: '[]',
    },
    include: {
      server: {
        select: {
          name: true,
          countryCode: true,
          lifecycleMode: true,
        },
      },
    },
  });
}

async function updateAccessKeyExpiry(input: {
  keyId: string;
  action: 'never' | '7' | '30' | '90' | 'fixed';
  fixedDate?: Date | null;
}) {
  const key = await db.accessKey.findUnique({
    where: { id: input.keyId },
    include: {
      server: {
        select: {
          name: true,
          countryCode: true,
          lifecycleMode: true,
        },
      },
    },
  });
  if (!key) {
    throw new Error('Access key not found.');
  }

  const next = parseExpirationUpdate(key.expiresAt, input.action, input.fixedDate);
  return db.accessKey.update({
    where: { id: key.id },
    data: {
      expirationType: next.expirationType,
      expiresAt: next.expiresAt,
      durationDays: next.durationDays,
      status: next.status,
      archiveAfterAt: null,
    },
    include: {
      server: {
        select: {
          name: true,
          countryCode: true,
          lifecycleMode: true,
        },
      },
    },
  });
}

async function applyDynamicQuota(input: {
  dynamicKeyId: string;
  dataLimitGB: number | null;
}) {
  const dynamicKey = await db.dynamicAccessKey.findUnique({
    where: { id: input.dynamicKeyId },
    include: {
      accessKeys: {
        include: {
          server: true,
        },
      },
    },
  });
  if (!dynamicKey) {
    throw new Error('Dynamic key not found.');
  }

  const limitBytes =
    input.dataLimitGB == null
      ? null
      : BigInt(Math.round(input.dataLimitGB * 1024 * 1024 * 1024));

  for (const key of dynamicKey.accessKeys) {
    if (key.status === 'DISABLED') {
      continue;
    }
    const client = createOutlineClient(key.server.apiUrl, key.server.apiCertSha256);
    if (limitBytes) {
      const serverLimit = currentRawMetricForAccessKey(key) + limitBytes;
      await client.setAccessKeyDataLimit(key.outlineKeyId, Number(serverLimit > BigInt(0) ? serverLimit : BigInt(0)));
    } else {
      await client.removeAccessKeyDataLimit(key.outlineKeyId);
    }
  }

  await db.accessKey.updateMany({
    where: {
      dynamicKeyId: dynamicKey.id,
    },
    data: {
      dataLimitBytes: limitBytes,
      quotaAlertsSent: '[]',
    },
  });

  return db.dynamicAccessKey.update({
    where: { id: dynamicKey.id },
    data: {
      dataLimitBytes: limitBytes,
    },
    include: {
      accessKeys: {
        select: {
          id: true,
        },
      },
    },
  });
}

async function resetDynamicUsage(dynamicKeyId: string) {
  const dynamicKey = await db.dynamicAccessKey.findUnique({
    where: { id: dynamicKeyId },
    include: {
      accessKeys: {
        include: {
          server: true,
        },
      },
    },
  });
  if (!dynamicKey) {
    throw new Error('Dynamic key not found.');
  }

  const now = new Date();
  for (const key of dynamicKey.accessKeys) {
    const metricBytes =
      key.status === 'DISABLED'
        ? (currentRawMetricForAccessKey(key) > BigInt(0) ? currentRawMetricForAccessKey(key) : BigInt(0))
        : await getLiveOutlineMetricBytesForKey(key);

    if (key.status !== 'DISABLED' && key.dataLimitBytes) {
      const client = createOutlineClient(key.server.apiUrl, key.server.apiCertSha256);
      await client.setAccessKeyDataLimit(
        key.outlineKeyId,
        Number(metricBytes + key.dataLimitBytes),
      );
    }

    await db.accessKey.update({
      where: { id: key.id },
      data: {
        usedBytes: BigInt(0),
        usageOffset: metricBytes,
        lastDataLimitReset: now,
        quotaAlertsSent: '[]',
      },
    });
  }

  return db.dynamicAccessKey.update({
    where: { id: dynamicKey.id },
    data: {
      usedBytes: BigInt(0),
      lastDataLimitReset: now,
    },
    include: {
      accessKeys: {
        select: {
          id: true,
        },
      },
    },
  });
}

async function updateDynamicExpiry(input: {
  dynamicKeyId: string;
  action: 'never' | '7' | '30' | '90' | 'fixed';
  fixedDate?: Date | null;
}) {
  const dynamicKey = await db.dynamicAccessKey.findUnique({
    where: { id: input.dynamicKeyId },
    include: {
      accessKeys: {
        select: {
          id: true,
        },
      },
    },
  });
  if (!dynamicKey) {
    throw new Error('Dynamic key not found.');
  }

  const next = parseExpirationUpdate(dynamicKey.expiresAt, input.action, input.fixedDate);

  await db.accessKey.updateMany({
    where: {
      dynamicKeyId: dynamicKey.id,
    },
    data: {
      expirationType: next.expirationType,
      expiresAt: next.expiresAt,
      durationDays: next.durationDays,
      status: next.status,
      archiveAfterAt: null,
    },
  });

  return db.dynamicAccessKey.update({
    where: { id: dynamicKey.id },
    data: {
      expirationType: next.expirationType,
      expiresAt: next.expiresAt,
      durationDays: next.durationDays,
      status: next.status,
    },
    include: {
      accessKeys: {
        select: {
          id: true,
        },
      },
    },
  });
}

async function updateDynamicPreferredRegions(input: {
  dynamicKeyId: string;
  preferredCountryCodes: string[];
}) {
  const dynamicKey = await db.dynamicAccessKey.findUnique({
    where: { id: input.dynamicKeyId },
    select: {
      id: true,
      preferredServerIdsJson: true,
      preferredCountryCodesJson: true,
      preferredServerWeightsJson: true,
      preferredCountryWeightsJson: true,
      preferredRegionMode: true,
      sessionStickinessMode: true,
      drainGraceMinutes: true,
    },
  });
  if (!dynamicKey) {
    throw new Error('Dynamic key not found.');
  }

  const routing = normalizeDynamicRoutingPreferences(
    parseDynamicRoutingPreferences({
      preferredServerIdsJson: dynamicKey.preferredServerIdsJson,
      preferredCountryCodesJson: dynamicKey.preferredCountryCodesJson,
      preferredServerWeightsJson: dynamicKey.preferredServerWeightsJson,
      preferredCountryWeightsJson: dynamicKey.preferredCountryWeightsJson,
      preferredRegionMode: dynamicKey.preferredRegionMode,
      sessionStickinessMode: dynamicKey.sessionStickinessMode,
      drainGraceMinutes: dynamicKey.drainGraceMinutes,
    }),
  );

  routing.preferredCountryCodes = input.preferredCountryCodes;
  if (input.preferredCountryCodes.length > 0) {
    routing.preferredServerIds = [];
    routing.preferredServerWeights = {};
  }

  return db.dynamicAccessKey.update({
    where: { id: dynamicKey.id },
    data: {
      preferredServerIdsJson: JSON.stringify(routing.preferredServerIds),
      preferredCountryCodesJson: JSON.stringify(routing.preferredCountryCodes),
      preferredServerWeightsJson: JSON.stringify(routing.preferredServerWeights),
      preferredCountryWeightsJson: JSON.stringify(routing.preferredCountryWeights),
      preferredRegionMode: routing.preferredRegionMode,
      sessionStickinessMode: routing.sessionStickinessMode,
      drainGraceMinutes: routing.drainGraceMinutes,
      pinExpiresAt: input.preferredCountryCodes.length === 0 ? null : undefined,
    },
  });
}

async function toggleDynamicPreferredRegionMode(dynamicKeyId: string) {
  const dynamicKey = await db.dynamicAccessKey.findUnique({
    where: { id: dynamicKeyId },
    select: {
      id: true,
      preferredRegionMode: true,
    },
  });
  if (!dynamicKey) {
    throw new Error('Dynamic key not found.');
  }

  const nextMode = dynamicKey.preferredRegionMode === 'ONLY' ? 'PREFER' : 'ONLY';
  return db.dynamicAccessKey.update({
    where: { id: dynamicKey.id },
    data: {
      preferredRegionMode: nextMode,
    },
    select: {
      id: true,
      preferredRegionMode: true,
    },
  });
}

async function createAccessKeyFromDraft(input: {
  draft: AccessCreateDraft;
  adminActor: TelegramAdminActor;
}) {
  let targetServerId = input.draft.serverId;
  if (input.draft.assignmentMode === 'AUTO') {
    const recommended = await selectLeastLoadedServer();
    if (!recommended) {
      throw new Error('No assignable server is available for automatic placement.');
    }
    targetServerId = recommended.serverId;
  }

  if (!targetServerId) {
    throw new Error('Please choose a server first.');
  }

  const server = await db.server.findUnique({
    where: { id: targetServerId },
  });
  if (!server) {
    throw new Error('Server not found.');
  }

  const assignmentCheck = canAssignKeysToServer(server, {
    allowDraining: input.draft.assignmentMode === 'MANUAL',
  });
  if (!assignmentCheck.allowed) {
    throw new Error(assignmentCheck.reason);
  }

  const client = createOutlineClient(server.apiUrl, server.apiCertSha256);
  const outlineKey = await client.createAccessKey({
    name: input.draft.name || 'Telegram Key',
    method: 'chacha20-ietf-poly1305',
  });

  if (input.draft.dataLimitGB) {
    const limitBytes = BigInt(Math.round(input.draft.dataLimitGB * 1024 * 1024 * 1024));
    await client.setAccessKeyDataLimit(outlineKey.id, Number(limitBytes));
  }

  const calculated = calculateExpiration(
    input.draft.expirationType,
    input.draft.expiresAt ? new Date(input.draft.expiresAt) : null,
    input.draft.durationDays,
  );
  const recipient = input.draft.recipient;
  const noteParts = [
    (recipient?.mode === 'USERNAME_ONLY' || recipient?.mode === 'AMBIGUOUS_USERNAME') && recipient.username
      ? `Telegram username hint: @${recipient.username}`
      : null,
  ].filter(Boolean);

  const accessKey = await db.accessKey.create({
    data: {
      outlineKeyId: outlineKey.id,
      name: input.draft.name || 'Telegram Key',
      email: recipient?.email || null,
      telegramId: getPersistedRecipientTelegramId(recipient),
      userId: recipient?.userId || null,
      notes: noteParts.join('\n') || null,
      serverId: targetServerId,
      accessUrl: decorateOutlineAccessUrl(outlineKey.accessUrl, input.draft.name || 'Telegram Key'),
      password: outlineKey.password,
      port: outlineKey.port,
      method: outlineKey.method,
      dataLimitBytes: input.draft.dataLimitGB
        ? BigInt(Math.round(input.draft.dataLimitGB * 1024 * 1024 * 1024))
        : null,
      dataLimitResetStrategy: 'NEVER',
      expirationType: input.draft.expirationType,
      expiresAt: calculated.expiresAt,
      durationDays: input.draft.durationDays,
      status: calculated.status,
      sharePageEnabled: true,
      clientLinkEnabled: true,
      telegramDeliveryEnabled: true,
      autoDisableOnLimit: true,
      autoDisableOnExpire: true,
      autoArchiveAfterDays: 0,
      quotaAlertsSent: '[]',
      autoRenewPolicy: 'NONE',
      subscriptionToken: generateRandomString(32),
      tags: mergeTagsForStorage('', 'tele'),
    },
    include: {
      server: {
        select: {
          name: true,
          countryCode: true,
          lifecycleMode: true,
        },
      },
    },
  });

  await writeAuditLog({
    userId: input.adminActor.userId,
    action: 'TELEGRAM_ADMIN_ACCESS_KEY_CREATED',
    entity: 'ACCESS_KEY',
    entityId: accessKey.id,
    details: {
      via: 'telegram_bot',
      assignmentMode: input.draft.assignmentMode,
      serverId: targetServerId,
      recipientLabel: recipient?.label || null,
    },
  });

  return accessKey;
}

async function createDynamicKeyFromDraft(input: {
  draft: DynamicCreateDraft;
  adminActor: TelegramAdminActor;
}) {
  const calculated = calculateExpiration(
    input.draft.expirationType,
    input.draft.expiresAt ? new Date(input.draft.expiresAt) : null,
    input.draft.durationDays,
  );
  const routingPreferences = normalizeDynamicRoutingPreferences({});
  const recipient = input.draft.recipient;
  const noteParts = [
    (recipient?.mode === 'USERNAME_ONLY' || recipient?.mode === 'AMBIGUOUS_USERNAME') && recipient.username
      ? `Telegram username hint: @${recipient.username}`
      : null,
  ].filter(Boolean);

  const dynamicKey = await db.dynamicAccessKey.create({
    data: {
      name: input.draft.name || 'Telegram Dynamic Key',
      type: input.draft.keyType,
      email: recipient?.email || null,
      telegramId: getPersistedRecipientTelegramId(recipient),
      userId: recipient?.userId || null,
      notes: noteParts.join('\n') || null,
      dynamicUrl: generateRandomString(32),
      dataLimitBytes: input.draft.dataLimitGB
        ? BigInt(Math.round(input.draft.dataLimitGB * 1024 * 1024 * 1024))
        : null,
      dataLimitResetStrategy: 'NEVER',
      lastDataLimitReset: new Date(),
      usageOffset: BigInt(0),
      expirationType: input.draft.expirationType,
      expiresAt: calculated.expiresAt,
      durationDays: input.draft.durationDays,
      status: calculated.status,
      method: 'chacha20-ietf-poly1305',
      sharePageEnabled: true,
      loadBalancerAlgorithm: 'IP_HASH',
      preferredServerIdsJson: JSON.stringify(routingPreferences.preferredServerIds),
      preferredCountryCodesJson: JSON.stringify(routingPreferences.preferredCountryCodes),
      preferredServerWeightsJson: JSON.stringify(routingPreferences.preferredServerWeights),
      preferredCountryWeightsJson: JSON.stringify(routingPreferences.preferredCountryWeights),
      preferredRegionMode: routingPreferences.preferredRegionMode,
      sessionStickinessMode: routingPreferences.sessionStickinessMode,
      drainGraceMinutes: routingPreferences.drainGraceMinutes,
      tags: input.draft.keyType === 'SELF_MANAGED' ? 'tele,premium' : 'tele',
      autoClearStalePins: true,
      autoFallbackToPrefer: false,
      autoSkipUnhealthy: false,
    },
    include: {
      accessKeys: {
        select: {
          id: true,
        },
      },
    },
  });

  await writeAuditLog({
    userId: input.adminActor.userId,
    action: 'TELEGRAM_ADMIN_DYNAMIC_KEY_CREATED',
    entity: 'DYNAMIC_ACCESS_KEY',
    entityId: dynamicKey.id,
    details: {
      via: 'telegram_bot',
      recipientLabel: recipient?.label || null,
      type: input.draft.keyType,
    },
  });

  return dynamicKey;
}

async function finalizeAccessCreate(input: {
  draft: AccessCreateDraft;
  chatId: number;
  botToken: string;
  locale: SupportedLocale;
  adminActor: TelegramAdminActor;
  sendDirect: boolean;
  deps: TelegramAdminKeyDeps;
}) {
  const created = await createAccessKeyFromDraft({
    draft: input.draft,
    adminActor: input.adminActor,
  });

  let directDelivered = false;
  let deliveryLine = input.locale === 'my'
    ? 'Created without direct Telegram delivery.'
    : 'Created without direct Telegram delivery.';

  if (input.sendDirect && canDirectSendToRecipient(input.draft.recipient)) {
    try {
      await input.deps.sendAccessKeySharePageToTelegram({
        accessKeyId: created.id,
        chatId: input.draft.recipient.chatId,
        reason: 'CREATED',
        source: 'telegram_admin_create',
        includeQr: true,
        locale: input.locale,
      });
      directDelivered = true;
      deliveryLine = input.locale === 'my'
        ? `Directly sent to <b>${escapeHtml(input.draft.recipient.label)}</b>.`
        : `Directly sent to <b>${escapeHtml(input.draft.recipient.label)}</b>.`;
    } catch {
      deliveryLine = input.locale === 'my'
        ? 'Direct delivery မအောင်မြင်ပါ။ Connect link ကို ပြန်ပေးပါမည်။'
        : 'Direct delivery was not available. A connect link is included below.';
    }
  }

  let connectLine = '';
  if (!directDelivered) {
    const connectLink = await input.deps.createAccessKeyTelegramConnectLink({
      accessKeyId: created.id,
      createdByUserId: input.adminActor.userId,
    });
    connectLine = [
      '',
      input.locale === 'my'
        ? 'Send this connect link to the user:'
        : 'Send this connect link to the user:',
      connectLink.url,
      input.locale === 'my'
        ? `Expires: ${formatDateTime(connectLink.expiresAt)}`
        : `Expires: ${formatDateTime(connectLink.expiresAt)}`,
    ].join('\n');
  }

  await input.deps.sendTelegramMessage(
    input.botToken,
    input.chatId,
    [
      input.locale === 'my' ? '✅ <b>Normal key created</b>' : '✅ <b>Normal key created</b>',
      '',
      `🔑 <b>${escapeHtml(created.name)}</b>`,
      `🆔 <code>${created.id}</code>`,
      `🖥 ${escapeHtml(renderServerChoiceLabel(created.server))}`,
      deliveryLine,
      connectLine,
    ].filter(Boolean).join('\n'),
  );

  return created;
}

async function finalizeDynamicCreate(input: {
  draft: DynamicCreateDraft;
  chatId: number;
  botToken: string;
  locale: SupportedLocale;
  adminActor: TelegramAdminActor;
  sendDirect: boolean;
  deps: TelegramAdminKeyDeps;
}) {
  const created = await createDynamicKeyFromDraft({
    draft: input.draft,
    adminActor: input.adminActor,
  });

  let directDelivered = false;
  let deliveryLine = input.locale === 'my'
    ? 'Created without direct Telegram delivery.'
    : 'Created without direct Telegram delivery.';

  if (input.sendDirect && canDirectSendToRecipient(input.draft.recipient)) {
    try {
      await input.deps.sendDynamicKeySharePageToTelegram({
        dynamicAccessKeyId: created.id,
        chatId: input.draft.recipient.chatId,
        reason: 'CREATED',
        source: 'telegram_admin_create',
        includeQr: true,
        locale: input.locale,
      });
      directDelivered = true;
      deliveryLine = input.locale === 'my'
        ? `Directly sent to <b>${escapeHtml(input.draft.recipient.label)}</b>.`
        : `Directly sent to <b>${escapeHtml(input.draft.recipient.label)}</b>.`;
    } catch {
      deliveryLine = input.locale === 'my'
        ? 'Direct delivery မအောင်မြင်ပါ။ Connect link ကို ပြန်ပေးပါမည်။'
        : 'Direct delivery was not available. A connect link is included below.';
    }
  }

  let connectLine = '';
  if (!directDelivered) {
    const connectLink = await input.deps.createDynamicKeyTelegramConnectLink({
      dynamicAccessKeyId: created.id,
      createdByUserId: input.adminActor.userId,
    });
    connectLine = [
      '',
      input.locale === 'my'
        ? 'Send this connect link to the user:'
        : 'Send this connect link to the user:',
      connectLink.url,
      input.locale === 'my'
        ? `Expires: ${formatDateTime(connectLink.expiresAt)}`
        : `Expires: ${formatDateTime(connectLink.expiresAt)}`,
    ].join('\n');
  }

  await input.deps.sendTelegramMessage(
    input.botToken,
    input.chatId,
    [
      input.locale === 'my' ? '✅ <b>Dynamic key created</b>' : '✅ <b>Dynamic key created</b>',
      '',
      `💎 <b>${escapeHtml(created.name)}</b>`,
      `🆔 <code>${created.id}</code>`,
      `🧭 ${escapeHtml(created.type)}`,
      deliveryLine,
      connectLine,
    ].filter(Boolean).join('\n'),
  );

  return created;
}

function buildAccessKeyPanelUrl(accessKeyId: string) {
  return withAbsoluteBasePath(`/dashboard/keys/${encodeURIComponent(accessKeyId)}`);
}

function buildDynamicKeyPanelUrl(dynamicKeyId: string) {
  return withAbsoluteBasePath(`/dashboard/dynamic-keys/${encodeURIComponent(dynamicKeyId)}`);
}

async function resolveAccessKeyDirectMessageTarget(accessKeyId: string) {
  const key = await db.accessKey.findUnique({
    where: { id: accessKeyId },
    select: {
      id: true,
      name: true,
      telegramId: true,
      email: true,
      userId: true,
      user: {
        select: {
          id: true,
          email: true,
          telegramChatId: true,
        },
      },
    },
  });

  if (!key) {
    throw new Error('Access key not found.');
  }

  return {
    accessKeyId: key.id,
    dynamicKeyId: null,
    userId: key.user?.id || key.userId || null,
    recipientChatId: key.user?.telegramChatId || key.telegramId || null,
    recipientLabel: key.user?.email || key.email || key.name,
    panelUrl: buildAccessKeyPanelUrl(key.id),
  };
}

async function resolveDynamicKeyDirectMessageTarget(dynamicKeyId: string) {
  const key = await db.dynamicAccessKey.findUnique({
    where: { id: dynamicKeyId },
    select: {
      id: true,
      name: true,
      telegramId: true,
      email: true,
      userId: true,
      user: {
        select: {
          id: true,
          email: true,
          telegramChatId: true,
        },
      },
    },
  });

  if (!key) {
    throw new Error('Dynamic key not found.');
  }

  return {
    accessKeyId: null,
    dynamicKeyId: key.id,
    userId: key.user?.id || key.userId || null,
    recipientChatId: key.user?.telegramChatId || key.telegramId || null,
    recipientLabel: key.user?.email || key.email || key.name,
    panelUrl: buildDynamicKeyPanelUrl(key.id),
  };
}

export async function handleTelegramAdminKeyTextInput(input: {
  chatId: number;
  telegramUserId: number;
  locale: SupportedLocale;
  botToken: string;
  adminActor: TelegramAdminActor;
  text: string;
  deps: TelegramAdminKeyDeps;
}) {
  const flow = await loadPendingAdminFlow(input.telegramUserId, input.chatId);
  if (!flow) {
    return false;
  }

  const text = input.text.trim();
  if (!text) {
    return true;
  }

  if (flow.kind === 'support_reply') {
    await replyTelegramSupportThreadAsAdmin({
      threadId: flow.threadId,
      adminUserId: input.adminActor.userId,
      reviewerName: input.adminActor.email || null,
      adminNote: 'Telegram manual support reply',
      customerMessage: text,
    });
    await clearPendingAdminFlow(input.telegramUserId, input.chatId);
    await input.deps.sendTelegramMessage(
      input.botToken,
      input.chatId,
      input.locale === 'my'
        ? '✅ Support thread reply ကို ပို့ပြီးပါပြီ။'
        : '✅ Sent the support-thread reply.',
    );
    return true;
  }

  if (flow.kind === 'direct_message') {
    const delivered = await input.deps.sendTelegramMessage(
      input.botToken,
      flow.recipientChatId,
      [
        input.locale === 'my'
          ? '📨 <b>Message from admin</b>'
          : '📨 <b>Message from admin</b>',
        '',
        escapeHtml(text),
      ].join('\n'),
    );

    if (!delivered) {
      throw new Error('Direct Telegram delivery failed.');
    }

    if (flow.userId) {
      await db.customerSupportNote.create({
        data: {
          userId: flow.userId,
          createdByUserId: input.adminActor.userId,
          kind: 'DIRECT_MESSAGE',
          note: text,
          telegramMessageTitle: 'Message from admin',
          telegramCardStyle: 'DEFAULT',
        },
      });
    }

    await writeTelegramAdminKeyAudit({
      adminActor: input.adminActor,
      action: 'TELEGRAM_ADMIN_DIRECT_MESSAGE_SENT',
      entity: flow.dynamicKeyId ? 'DYNAMIC_ACCESS_KEY' : 'ACCESS_KEY',
      entityId: flow.dynamicKeyId || flow.accessKeyId || flow.userId || 'direct_message',
      details: {
        recipientChatId: flow.recipientChatId,
        recipientLabel: flow.recipientLabel,
        messageLength: text.length,
      },
    });

    await clearPendingAdminFlow(input.telegramUserId, input.chatId);
    await input.deps.sendTelegramMessage(
      input.botToken,
      input.chatId,
      input.locale === 'my'
        ? '✅ Direct message ကို ပို့ပြီးပါပြီ။'
        : '✅ Sent the direct message.',
    );
    return true;
  }

  if (flow.kind === 'create_access') {
    if (flow.step === 'recipient') {
      const recipient = await resolveRecipientTarget(text);
      if (!recipient) {
        await input.deps.sendTelegramMessage(
          input.botToken,
          input.chatId,
          input.locale === 'my'
            ? 'Recipient ကို မတွေ့ပါ။ Email, @username, Telegram ID, သို့မဟုတ် chat ID တို့ဖြင့် ပြန်ပို့ပါ။'
            : 'Recipient not found. Send an email, @username, Telegram ID, or chat ID.',
          {
            replyMarkup: buildRecipientKeyboard(input.locale),
          },
        );
        return true;
      }

      const nextFlow: AccessCreateDraft = {
        ...flow,
        recipient,
        step: 'name',
      };
      await savePendingAdminFlow(input.telegramUserId, input.chatId, nextFlow);
      await promptAccessCreateName({
        draft: nextFlow,
        chatId: input.chatId,
        botToken: input.botToken,
        locale: input.locale,
        deps: input.deps,
      });
      return true;
    }

    if (flow.step === 'name') {
      const nextFlow: AccessCreateDraft = {
        ...flow,
        name: text.slice(0, 100),
        step: 'server',
      };
      await savePendingAdminFlow(input.telegramUserId, input.chatId, nextFlow);
      await promptAccessServer({
        draft: nextFlow,
        chatId: input.chatId,
        botToken: input.botToken,
        locale: input.locale,
        deps: input.deps,
      });
      return true;
    }

    if (flow.step === 'quota_custom') {
      const gb = parseGbInput(text);
      if (!gb) {
        await input.deps.sendTelegramMessage(
          input.botToken,
          input.chatId,
          input.locale === 'my'
            ? 'Valid quota GB number ပို့ပါ။ ဥပမာ 25'
            : 'Send a valid quota number in GB, for example 25.',
        );
        return true;
      }

      const nextFlow: AccessCreateDraft = {
        ...flow,
        dataLimitGB: gb,
        step: 'confirm',
      };
      await savePendingAdminFlow(input.telegramUserId, input.chatId, nextFlow);
      await promptCreateExpiry({
        chatId: input.chatId,
        botToken: input.botToken,
        locale: input.locale,
        deps: input.deps,
      });
      return true;
    }

    if (flow.step === 'expiry_date') {
      const date = parseFixedDateInput(text);
      if (!date) {
        await input.deps.sendTelegramMessage(
          input.botToken,
          input.chatId,
          input.locale === 'my'
            ? 'YYYY-MM-DD format ဖြင့် fixed date ကို ပို့ပါ။ ဥပမာ 2026-04-30'
            : 'Send the fixed date in YYYY-MM-DD format, for example 2026-04-30.',
        );
        return true;
      }

      const nextFlow: AccessCreateDraft = {
        ...flow,
        expirationType: 'FIXED_DATE',
        expiresAt: date.toISOString(),
        durationDays: null,
        step: 'confirm',
      };
      await savePendingAdminFlow(input.telegramUserId, input.chatId, nextFlow);
      await promptAccessCreateConfirm({
        draft: nextFlow,
        chatId: input.chatId,
        botToken: input.botToken,
        locale: input.locale,
        deps: input.deps,
      });
      return true;
    }
  }

  if (flow.kind === 'create_dynamic') {
    if (flow.step === 'recipient') {
      const recipient = await resolveRecipientTarget(text);
      if (!recipient) {
        await input.deps.sendTelegramMessage(
          input.botToken,
          input.chatId,
          input.locale === 'my'
            ? 'Recipient ကို မတွေ့ပါ။ Email, @username, Telegram ID, သို့မဟုတ် chat ID တို့ဖြင့် ပြန်ပို့ပါ။'
            : 'Recipient not found. Send an email, @username, Telegram ID, or chat ID.',
          {
            replyMarkup: buildRecipientKeyboard(input.locale),
          },
        );
        return true;
      }

      const nextFlow: DynamicCreateDraft = {
        ...flow,
        recipient,
        step: 'name',
      };
      await savePendingAdminFlow(input.telegramUserId, input.chatId, nextFlow);
      await promptDynamicCreateName({
        draft: nextFlow,
        chatId: input.chatId,
        botToken: input.botToken,
        locale: input.locale,
        deps: input.deps,
      });
      return true;
    }

    if (flow.step === 'name') {
      const nextFlow: DynamicCreateDraft = {
        ...flow,
        name: text.slice(0, 100),
        step: 'type',
      };
      await savePendingAdminFlow(input.telegramUserId, input.chatId, nextFlow);
      await promptDynamicType({
        draft: nextFlow,
        chatId: input.chatId,
        botToken: input.botToken,
        locale: input.locale,
        deps: input.deps,
      });
      return true;
    }

    if (flow.step === 'quota_custom') {
      const gb = parseGbInput(text);
      if (!gb) {
        await input.deps.sendTelegramMessage(
          input.botToken,
          input.chatId,
          input.locale === 'my'
            ? 'Valid quota GB number ပို့ပါ။ ဥပမာ 25'
            : 'Send a valid quota number in GB, for example 25.',
        );
        return true;
      }

      const nextFlow: DynamicCreateDraft = {
        ...flow,
        dataLimitGB: gb,
      };
      await savePendingAdminFlow(input.telegramUserId, input.chatId, nextFlow);
      await promptCreateExpiry({
        chatId: input.chatId,
        botToken: input.botToken,
        locale: input.locale,
        deps: input.deps,
      });
      return true;
    }

    if (flow.step === 'expiry_date') {
      const date = parseFixedDateInput(text);
      if (!date) {
        await input.deps.sendTelegramMessage(
          input.botToken,
          input.chatId,
          input.locale === 'my'
            ? 'YYYY-MM-DD format ဖြင့် fixed date ကို ပို့ပါ။ ဥပမာ 2026-04-30'
            : 'Send the fixed date in YYYY-MM-DD format, for example 2026-04-30.',
        );
        return true;
      }

      const nextFlow: DynamicCreateDraft = {
        ...flow,
        expirationType: 'FIXED_DATE',
        expiresAt: date.toISOString(),
        durationDays: null,
        step: 'confirm',
      };
      await savePendingAdminFlow(input.telegramUserId, input.chatId, nextFlow);
      await promptDynamicCreateConfirm({
        draft: nextFlow,
        chatId: input.chatId,
        botToken: input.botToken,
        locale: input.locale,
        deps: input.deps,
      });
      return true;
    }
  }

  if (flow.kind === 'manage_access') {
    if (flow.step === 'query') {
      const result = await resolveAdminKeyQuery(text);
      if (result.kind === 'single') {
        const nextFlow: AccessManageDraft = {
          kind: 'manage_access',
          step: 'actions',
          keyId: result.key.id,
        };
        await savePendingAdminFlow(input.telegramUserId, input.chatId, nextFlow);
        await showAccessManageActions({
          chatId: input.chatId,
          botToken: input.botToken,
          locale: input.locale,
          keyId: result.key.id,
          deps: input.deps,
        });
        return true;
      }

      if (result.kind === 'many' && result.matches.length > 0) {
        await promptManageMatches({
          chatId: input.chatId,
          botToken: input.botToken,
          locale: input.locale,
          type: 'access',
          matches: result.matches.map((key) => ({
            id: key.id,
            name: key.name,
            status: key.status,
            details: [
              `${key.server?.name || 'Unknown server'}${key.dataLimitBytes ? ` • ${formatBytes(key.dataLimitBytes)}` : ' • Unlimited'}`,
              formatExpirationSummary(
                {
                  expiresAt: key.expiresAt,
                  expirationType: key.expirationType,
                  durationDays: key.durationDays,
                },
                input.locale,
              ),
              key.email || key.telegramId || 'No recipient',
            ],
          })),
          deps: input.deps,
        });
        return true;
      }

      await input.deps.sendTelegramMessage(
        input.botToken,
        input.chatId,
        input.locale === 'my' ? 'Access key ကို မတွေ့ပါ။' : 'Access key not found.',
        {
          replyMarkup: buildCancelKeyboard(input.locale),
        },
      );
      return true;
    }

    if (!flow.keyId) {
      await clearPendingAdminFlow(input.telegramUserId, input.chatId);
      return true;
    }

    if (flow.step === 'confirm_resetusage' || flow.step === 'confirm_toggle') {
      await input.deps.sendTelegramMessage(
        input.botToken,
        input.chatId,
        input.locale === 'my'
          ? 'အောက်ပါ confirm button ကို သုံးပါ၊ သို့မဟုတ် Back ကိုနှိပ်ပါ။'
          : 'Use the confirm button below, or press Back.',
      );
      return true;
    }

    if (flow.step === 'quota_custom') {
      const gb = parseGbInput(text);
      if (!gb) {
        await input.deps.sendTelegramMessage(
          input.botToken,
          input.chatId,
          input.locale === 'my'
            ? 'Valid quota GB number ပို့ပါ။ ဥပမာ 25'
            : 'Send a valid quota number in GB, for example 25.',
        );
        return true;
      }

      await applyAccessKeyQuota({
        keyId: flow.keyId,
        dataLimitGB: gb,
      });
      await writeTelegramAdminKeyAudit({
        adminActor: input.adminActor,
        action: 'TELEGRAM_ADMIN_ACCESS_KEY_QUOTA_UPDATED',
        entity: 'ACCESS_KEY',
        entityId: flow.keyId,
        details: {
          dataLimitGb: gb,
          source: 'text_input',
        },
      });
      const nextFlow: AccessManageDraft = {
        ...flow,
        step: 'actions',
      };
      await savePendingAdminFlow(input.telegramUserId, input.chatId, nextFlow);
      await showAccessManageActions({
        chatId: input.chatId,
        botToken: input.botToken,
        locale: input.locale,
        keyId: flow.keyId,
        deps: input.deps,
      });
      return true;
    }

    if (flow.step === 'add_quota_custom') {
      const gb = parseGbInput(text);
      if (!gb) {
        await input.deps.sendTelegramMessage(
          input.botToken,
          input.chatId,
          input.locale === 'my'
            ? 'Valid quota GB number ပို့ပါ။ ဥပမာ 25'
            : 'Send a valid quota number in GB, for example 25.',
        );
        return true;
      }

      const key = await db.accessKey.findUnique({
        where: { id: flow.keyId },
        select: {
          dataLimitBytes: true,
        },
      });
      if (!key) {
        throw new Error('Access key not found.');
      }
      const currentGb = key.dataLimitBytes ? Number(key.dataLimitBytes) / (1024 * 1024 * 1024) : 0;
      await applyAccessKeyQuota({
        keyId: flow.keyId,
        dataLimitGB: currentGb + gb,
      });
      await writeTelegramAdminKeyAudit({
        adminActor: input.adminActor,
        action: 'TELEGRAM_ADMIN_ACCESS_KEY_QUOTA_ADDED',
        entity: 'ACCESS_KEY',
        entityId: flow.keyId,
        details: {
          addGb: gb,
          source: 'text_input',
        },
      });
      const nextFlow: AccessManageDraft = {
        ...flow,
        step: 'actions',
      };
      await savePendingAdminFlow(input.telegramUserId, input.chatId, nextFlow);
      await showAccessManageActions({
        chatId: input.chatId,
        botToken: input.botToken,
        locale: input.locale,
        keyId: flow.keyId,
        deps: input.deps,
      });
      return true;
    }

    if (flow.step === 'expiry_date') {
      const date = parseFixedDateInput(text);
      if (!date) {
        await input.deps.sendTelegramMessage(
          input.botToken,
          input.chatId,
          input.locale === 'my'
            ? 'YYYY-MM-DD format ဖြင့် fixed date ကို ပို့ပါ။ ဥပမာ 2026-04-30'
            : 'Send the fixed date in YYYY-MM-DD format, for example 2026-04-30.',
        );
        return true;
      }

      await updateAccessKeyExpiry({
        keyId: flow.keyId,
        action: 'fixed',
        fixedDate: date,
      });
      await writeTelegramAdminKeyAudit({
        adminActor: input.adminActor,
        action: 'TELEGRAM_ADMIN_ACCESS_KEY_EXPIRY_UPDATED',
        entity: 'ACCESS_KEY',
        entityId: flow.keyId,
        details: {
          action: 'fixed',
          fixedDate: date.toISOString(),
        },
      });
      const nextFlow: AccessManageDraft = {
        ...flow,
        step: 'actions',
      };
      await savePendingAdminFlow(input.telegramUserId, input.chatId, nextFlow);
      await showAccessManageActions({
        chatId: input.chatId,
        botToken: input.botToken,
        locale: input.locale,
        keyId: flow.keyId,
        deps: input.deps,
      });
      return true;
    }
  }

  if (flow.kind === 'manage_dynamic') {
    if (flow.step === 'query') {
      const result = await resolveDynamicKeyQuery(text);
      if (result.kind === 'single') {
        const nextFlow: DynamicManageDraft = {
          kind: 'manage_dynamic',
          step: 'actions',
          dynamicKeyId: result.key.id,
        };
        await savePendingAdminFlow(input.telegramUserId, input.chatId, nextFlow);
        await showDynamicManageActions({
          chatId: input.chatId,
          botToken: input.botToken,
          locale: input.locale,
          dynamicKeyId: result.key.id,
          deps: input.deps,
        });
        return true;
      }

      if (result.kind === 'many' && result.matches.length > 0) {
        await promptManageMatches({
          chatId: input.chatId,
          botToken: input.botToken,
          locale: input.locale,
          type: 'dynamic',
          matches: result.matches.map((key) => ({
            id: key.id,
            name: key.name,
            status: key.status,
            details: [
              `${key.type}${key.dataLimitBytes ? ` • ${formatBytes(key.dataLimitBytes)}` : ' • Unlimited'}`,
              formatExpirationSummary(
                {
                  expiresAt: key.expiresAt,
                  expirationType: key.expirationType,
                  durationDays: key.durationDays,
                },
                input.locale,
              ),
              formatTelegramDynamicPoolSummary(key, getTelegramUi(input.locale)),
              key.email || key.telegramId || 'No recipient',
            ],
          })),
          deps: input.deps,
        });
        return true;
      }

      await input.deps.sendTelegramMessage(
        input.botToken,
        input.chatId,
        input.locale === 'my' ? 'Dynamic key ကို မတွေ့ပါ။' : 'Dynamic key not found.',
        {
          replyMarkup: buildCancelKeyboard(input.locale),
        },
      );
      return true;
    }

    if (!flow.dynamicKeyId) {
      await clearPendingAdminFlow(input.telegramUserId, input.chatId);
      return true;
    }

    if (flow.step === 'confirm_resetusage' || flow.step === 'region_pick') {
      await input.deps.sendTelegramMessage(
        input.botToken,
        input.chatId,
        input.locale === 'my'
          ? 'အောက်ပါ button များထဲမှ တစ်ခုကို ရွေးပါ၊ သို့မဟုတ် Back ကိုနှိပ်ပါ။'
          : 'Choose one of the buttons below, or press Back.',
      );
      return true;
    }

    if (flow.step === 'quota_custom') {
      const gb = parseGbInput(text);
      if (!gb) {
        await input.deps.sendTelegramMessage(
          input.botToken,
          input.chatId,
          input.locale === 'my'
            ? 'Valid quota GB number ပို့ပါ။ ဥပမာ 25'
            : 'Send a valid quota number in GB, for example 25.',
        );
        return true;
      }

      await applyDynamicQuota({
        dynamicKeyId: flow.dynamicKeyId,
        dataLimitGB: gb,
      });
      await writeTelegramAdminKeyAudit({
        adminActor: input.adminActor,
        action: 'TELEGRAM_ADMIN_DYNAMIC_KEY_QUOTA_UPDATED',
        entity: 'DYNAMIC_ACCESS_KEY',
        entityId: flow.dynamicKeyId,
        details: {
          dataLimitGb: gb,
          source: 'text_input',
        },
      });
      const nextFlow: DynamicManageDraft = {
        ...flow,
        step: 'actions',
      };
      await savePendingAdminFlow(input.telegramUserId, input.chatId, nextFlow);
      await showDynamicManageActions({
        chatId: input.chatId,
        botToken: input.botToken,
        locale: input.locale,
        dynamicKeyId: flow.dynamicKeyId,
        deps: input.deps,
      });
      return true;
    }

    if (flow.step === 'add_quota_custom') {
      const gb = parseGbInput(text);
      if (!gb) {
        await input.deps.sendTelegramMessage(
          input.botToken,
          input.chatId,
          input.locale === 'my'
            ? 'Valid quota GB number ပို့ပါ။ ဥပမာ 25'
            : 'Send a valid quota number in GB, for example 25.',
        );
        return true;
      }

      const dynamicKey = await db.dynamicAccessKey.findUnique({
        where: { id: flow.dynamicKeyId },
        select: {
          dataLimitBytes: true,
        },
      });
      if (!dynamicKey) {
        throw new Error('Dynamic key not found.');
      }
      const currentGb = dynamicKey.dataLimitBytes
        ? Number(dynamicKey.dataLimitBytes) / (1024 * 1024 * 1024)
        : 0;
      await applyDynamicQuota({
        dynamicKeyId: flow.dynamicKeyId,
        dataLimitGB: currentGb + gb,
      });
      await writeTelegramAdminKeyAudit({
        adminActor: input.adminActor,
        action: 'TELEGRAM_ADMIN_DYNAMIC_KEY_QUOTA_ADDED',
        entity: 'DYNAMIC_ACCESS_KEY',
        entityId: flow.dynamicKeyId,
        details: {
          addGb: gb,
          source: 'text_input',
        },
      });
      const nextFlow: DynamicManageDraft = {
        ...flow,
        step: 'actions',
      };
      await savePendingAdminFlow(input.telegramUserId, input.chatId, nextFlow);
      await showDynamicManageActions({
        chatId: input.chatId,
        botToken: input.botToken,
        locale: input.locale,
        dynamicKeyId: flow.dynamicKeyId,
        deps: input.deps,
      });
      return true;
    }

    if (flow.step === 'expiry_date') {
      const date = parseFixedDateInput(text);
      if (!date) {
        await input.deps.sendTelegramMessage(
          input.botToken,
          input.chatId,
          input.locale === 'my'
            ? 'YYYY-MM-DD format ဖြင့် fixed date ကို ပို့ပါ။ ဥပမာ 2026-04-30'
            : 'Send the fixed date in YYYY-MM-DD format, for example 2026-04-30.',
        );
        return true;
      }

      await updateDynamicExpiry({
        dynamicKeyId: flow.dynamicKeyId,
        action: 'fixed',
        fixedDate: date,
      });
      await writeTelegramAdminKeyAudit({
        adminActor: input.adminActor,
        action: 'TELEGRAM_ADMIN_DYNAMIC_KEY_EXPIRY_UPDATED',
        entity: 'DYNAMIC_ACCESS_KEY',
        entityId: flow.dynamicKeyId,
        details: {
          action: 'fixed',
          fixedDate: date.toISOString(),
        },
      });
      const nextFlow: DynamicManageDraft = {
        ...flow,
        step: 'actions',
      };
      await savePendingAdminFlow(input.telegramUserId, input.chatId, nextFlow);
      await showDynamicManageActions({
        chatId: input.chatId,
        botToken: input.botToken,
        locale: input.locale,
        dynamicKeyId: flow.dynamicKeyId,
        deps: input.deps,
      });
      return true;
    }
  }

  return false;
}

export async function handleTelegramAdminKeyMediaInput(input: {
  chatId: number;
  telegramUserId: number;
  locale: SupportedLocale;
  botToken: string;
  adminActor: TelegramAdminActor;
  caption?: string | null;
  messageId: number;
  mediaKind: 'IMAGE' | 'FILE';
  mediaTelegramFileId: string;
  mediaFilename?: string | null;
  mediaContentType?: string | null;
  deps: TelegramAdminKeyDeps;
}) {
  const flow = await loadPendingAdminFlow(input.telegramUserId, input.chatId);
  if (!flow || (flow.kind !== 'support_reply' && flow.kind !== 'direct_message')) {
    return false;
  }

  if (flow.kind === 'support_reply') {
    const copied = await input.deps.copyTelegramMessage(
      input.botToken,
      input.chatId,
      input.messageId,
      flow.customerChatId,
    );
    if (!copied) {
      throw new Error('Could not copy the support attachment to the customer chat.');
    }

    await replyTelegramSupportThreadAsAdmin({
      threadId: flow.threadId,
      adminUserId: input.adminActor.userId,
      reviewerName: input.adminActor.email || null,
      adminNote: 'Telegram manual support attachment reply',
      customerMessage:
        input.caption?.trim()
        || (input.mediaKind === 'IMAGE' ? 'Sent an image attachment.' : 'Sent a file attachment.'),
      mediaKind: input.mediaKind,
      mediaTelegramFileId: input.mediaTelegramFileId,
      mediaFilename: input.mediaFilename || null,
      mediaContentType: input.mediaContentType || null,
    });

    await clearPendingAdminFlow(input.telegramUserId, input.chatId);
    await input.deps.sendTelegramMessage(
      input.botToken,
      input.chatId,
      input.locale === 'my'
        ? '✅ Support attachment ကို customer ထံ ပို့ပြီးပါပြီ။'
        : '✅ Sent the support attachment to the customer.',
    );
    return true;
  }

  const copied = await input.deps.copyTelegramMessage(
    input.botToken,
    input.chatId,
    input.messageId,
    flow.recipientChatId,
  );
  if (!copied) {
    throw new Error('Could not copy the attachment to the customer chat.');
  }

  if (flow.userId) {
    await db.customerSupportNote.create({
      data: {
        userId: flow.userId,
        createdByUserId: input.adminActor.userId,
        kind: 'DIRECT_MESSAGE',
        note:
          input.caption?.trim()
          || (input.mediaKind === 'IMAGE' ? 'Admin sent an image attachment.' : 'Admin sent a file attachment.'),
        telegramMessageTitle: 'Message from admin',
        telegramCardStyle: 'DEFAULT',
        telegramMediaKind: input.mediaKind,
      },
    });
  }

  await writeTelegramAdminKeyAudit({
    adminActor: input.adminActor,
    action: 'TELEGRAM_ADMIN_DIRECT_MESSAGE_SENT',
    entity: flow.dynamicKeyId ? 'DYNAMIC_ACCESS_KEY' : 'ACCESS_KEY',
    entityId: flow.dynamicKeyId || flow.accessKeyId || flow.userId || 'direct_message',
    details: {
      recipientChatId: flow.recipientChatId,
      recipientLabel: flow.recipientLabel,
      mediaKind: input.mediaKind,
      mediaFilename: input.mediaFilename || null,
    },
  });

  await clearPendingAdminFlow(input.telegramUserId, input.chatId);
  await input.deps.sendTelegramMessage(
    input.botToken,
    input.chatId,
    input.locale === 'my'
      ? '✅ Direct attachment ကို ပို့ပြီးပါပြီ။'
      : '✅ Sent the direct attachment.',
  );
  return true;
}

export async function handleTelegramAdminKeyCallback(input: {
  chatId: number;
  telegramUserId: number;
  locale: SupportedLocale;
  botToken: string;
  adminActor: TelegramAdminActor;
  action: string;
  primary?: string | null;
  secondary?: string | null;
  deps: TelegramAdminKeyDeps;
}) {
  const flow = await loadPendingAdminFlow(input.telegramUserId, input.chatId);
  if (!flow) {
    if (input.action === 'cancel') {
      await clearPendingAdminFlow(input.telegramUserId, input.chatId);
      return { handled: true, callbackText: input.locale === 'my' ? 'Wizard cancelled.' : 'Wizard cancelled.' };
    }
    return { handled: false };
  }

  if (input.action === 'cancel') {
    await clearPendingAdminFlow(input.telegramUserId, input.chatId);
    await input.deps.sendTelegramMessage(
      input.botToken,
      input.chatId,
      input.locale === 'my'
        ? '🛑 Telegram admin key wizard ကို ပယ်ဖျက်ပြီးပါပြီ။'
        : '🛑 Cancelled the Telegram admin key wizard.',
    );
    return { handled: true, callbackText: input.locale === 'my' ? 'Cancelled.' : 'Cancelled.' };
  }

  if (flow.kind === 'create_access') {
    if (flow.step === 'recipient' && input.action === 'skip') {
      const nextFlow: AccessCreateDraft = {
        ...flow,
        recipient: {
          mode: 'NONE',
          label: 'No recipient',
          chatId: null,
          telegramId: null,
          userId: null,
          email: null,
          username: null,
        },
        step: 'name',
      };
      await savePendingAdminFlow(input.telegramUserId, input.chatId, nextFlow);
      await promptAccessCreateName({
        draft: nextFlow,
        chatId: input.chatId,
        botToken: input.botToken,
        locale: input.locale,
        deps: input.deps,
      });
      return { handled: true, callbackText: input.locale === 'my' ? 'Recipient skipped.' : 'Recipient skipped.' };
    }

    if (flow.step === 'server' && input.action === 'server') {
      const nextFlow: AccessCreateDraft = {
        ...flow,
        assignmentMode: input.primary === 'auto' ? 'AUTO' : 'MANUAL',
        serverId: input.primary === 'auto' ? null : input.primary || null,
      };
      await savePendingAdminFlow(input.telegramUserId, input.chatId, nextFlow);
      await promptQuota({
        kind: 'create_access',
        chatId: input.chatId,
        botToken: input.botToken,
        locale: input.locale,
        deps: input.deps,
      });
      return { handled: true, callbackText: input.locale === 'my' ? 'Server saved.' : 'Server saved.' };
    }

    if (input.action === 'quota') {
      if (input.primary === 'custom') {
        const nextFlow: AccessCreateDraft = {
          ...flow,
          step: 'quota_custom',
        };
        await savePendingAdminFlow(input.telegramUserId, input.chatId, nextFlow);
        await input.deps.sendTelegramMessage(
          input.botToken,
          input.chatId,
          input.locale === 'my'
            ? 'Custom quota ကို GB ဖြင့် စာသားပို့ပါ။ ဥပမာ 25'
            : 'Send the custom quota in GB as text, for example 25.',
          {
            replyMarkup: buildCancelKeyboard(input.locale),
          },
        );
        return { handled: true, callbackText: input.locale === 'my' ? 'Awaiting quota.' : 'Awaiting quota.' };
      }

      const nextFlow: AccessCreateDraft = {
        ...flow,
        dataLimitGB: input.primary === 'unlimited' ? null : parseGbInput(input.primary || '') ?? null,
      };
      await savePendingAdminFlow(input.telegramUserId, input.chatId, nextFlow);
      await promptCreateExpiry({
        chatId: input.chatId,
        botToken: input.botToken,
        locale: input.locale,
        deps: input.deps,
      });
      return { handled: true, callbackText: input.locale === 'my' ? 'Quota saved.' : 'Quota saved.' };
    }

    if (input.action === 'expiry') {
      if (input.primary === 'fixed') {
        const nextFlow: AccessCreateDraft = {
          ...flow,
          step: 'expiry_date',
        };
        await savePendingAdminFlow(input.telegramUserId, input.chatId, nextFlow);
        await input.deps.sendTelegramMessage(
          input.botToken,
          input.chatId,
          input.locale === 'my'
            ? 'Fixed date ကို YYYY-MM-DD (KST) ဖြင့် ပို့ပါ။ ဥပမာ 2026-04-30'
            : 'Send the fixed date in YYYY-MM-DD (KST), for example 2026-04-30.',
          {
            replyMarkup: buildCancelKeyboard(input.locale),
          },
        );
        return { handled: true, callbackText: input.locale === 'my' ? 'Awaiting date.' : 'Awaiting date.' };
      }

      const nextFlow: AccessCreateDraft = {
        ...flow,
        expirationType:
          input.primary === 'never'
            ? 'NEVER'
            : input.primary === 'start30'
              ? 'START_ON_FIRST_USE'
              : 'DURATION_FROM_CREATION',
        durationDays:
          input.primary === '7'
            ? 7
            : input.primary === '30'
              ? 30
              : input.primary === '90'
                ? 90
                : input.primary === 'start30'
                  ? 30
                  : null,
        expiresAt: null,
        step: 'confirm',
      };
      await savePendingAdminFlow(input.telegramUserId, input.chatId, nextFlow);
      await promptAccessCreateConfirm({
        draft: nextFlow,
        chatId: input.chatId,
        botToken: input.botToken,
        locale: input.locale,
        deps: input.deps,
      });
      return { handled: true, callbackText: input.locale === 'my' ? 'Expiry saved.' : 'Expiry saved.' };
    }

    if (flow.step === 'confirm' && input.action === 'confirm') {
      const created = await finalizeAccessCreate({
        draft: flow,
        chatId: input.chatId,
        botToken: input.botToken,
        locale: input.locale,
        adminActor: input.adminActor,
        sendDirect: input.primary === 'send',
        deps: input.deps,
      });
      const nextFlow: AccessManageDraft = {
        kind: 'manage_access',
        step: 'actions',
        keyId: created.id,
      };
      await savePendingAdminFlow(input.telegramUserId, input.chatId, nextFlow);
      await showAccessManageActions({
        chatId: input.chatId,
        botToken: input.botToken,
        locale: input.locale,
        keyId: created.id,
        deps: input.deps,
      });
      return { handled: true, callbackText: input.locale === 'my' ? 'Key created.' : 'Key created.' };
    }
  }

  if (flow.kind === 'create_dynamic') {
    if (flow.step === 'recipient' && input.action === 'skip') {
      const nextFlow: DynamicCreateDraft = {
        ...flow,
        recipient: {
          mode: 'NONE',
          label: 'No recipient',
          chatId: null,
          telegramId: null,
          userId: null,
          email: null,
          username: null,
        },
        step: 'name',
      };
      await savePendingAdminFlow(input.telegramUserId, input.chatId, nextFlow);
      await promptDynamicCreateName({
        draft: nextFlow,
        chatId: input.chatId,
        botToken: input.botToken,
        locale: input.locale,
        deps: input.deps,
      });
      return { handled: true, callbackText: input.locale === 'my' ? 'Recipient skipped.' : 'Recipient skipped.' };
    }

    if (flow.step === 'type' && input.action === 'type') {
      const nextFlow: DynamicCreateDraft = {
        ...flow,
        keyType: input.primary === 'manual' ? 'MANUAL' : 'SELF_MANAGED',
      };
      await savePendingAdminFlow(input.telegramUserId, input.chatId, nextFlow);
      await promptQuota({
        kind: 'create_dynamic',
        chatId: input.chatId,
        botToken: input.botToken,
        locale: input.locale,
        deps: input.deps,
      });
      return { handled: true, callbackText: input.locale === 'my' ? 'Mode saved.' : 'Mode saved.' };
    }

    if (input.action === 'quota') {
      if (input.primary === 'custom') {
        const nextFlow: DynamicCreateDraft = {
          ...flow,
          step: 'quota_custom',
        };
        await savePendingAdminFlow(input.telegramUserId, input.chatId, nextFlow);
        await input.deps.sendTelegramMessage(
          input.botToken,
          input.chatId,
          input.locale === 'my'
            ? 'Custom quota ကို GB ဖြင့် စာသားပို့ပါ။ ဥပမာ 25'
            : 'Send the custom quota in GB as text, for example 25.',
          {
            replyMarkup: buildCancelKeyboard(input.locale),
          },
        );
        return { handled: true, callbackText: input.locale === 'my' ? 'Awaiting quota.' : 'Awaiting quota.' };
      }

      const nextFlow: DynamicCreateDraft = {
        ...flow,
        dataLimitGB: input.primary === 'unlimited' ? null : parseGbInput(input.primary || '') ?? null,
      };
      await savePendingAdminFlow(input.telegramUserId, input.chatId, nextFlow);
      await promptCreateExpiry({
        chatId: input.chatId,
        botToken: input.botToken,
        locale: input.locale,
        deps: input.deps,
      });
      return { handled: true, callbackText: input.locale === 'my' ? 'Quota saved.' : 'Quota saved.' };
    }

    if (input.action === 'expiry') {
      if (input.primary === 'fixed') {
        const nextFlow: DynamicCreateDraft = {
          ...flow,
          step: 'expiry_date',
        };
        await savePendingAdminFlow(input.telegramUserId, input.chatId, nextFlow);
        await input.deps.sendTelegramMessage(
          input.botToken,
          input.chatId,
          input.locale === 'my'
            ? 'Fixed date ကို YYYY-MM-DD (KST) ဖြင့် ပို့ပါ။ ဥပမာ 2026-04-30'
            : 'Send the fixed date in YYYY-MM-DD (KST), for example 2026-04-30.',
          {
            replyMarkup: buildCancelKeyboard(input.locale),
          },
        );
        return { handled: true, callbackText: input.locale === 'my' ? 'Awaiting date.' : 'Awaiting date.' };
      }

      const nextFlow: DynamicCreateDraft = {
        ...flow,
        expirationType:
          input.primary === 'never'
            ? 'NEVER'
            : 'DURATION_FROM_CREATION',
        durationDays:
          input.primary === '7'
            ? 7
            : input.primary === '30'
              ? 30
              : input.primary === '90'
                ? 90
                : null,
        expiresAt: null,
        step: 'confirm',
      };
      await savePendingAdminFlow(input.telegramUserId, input.chatId, nextFlow);
      await promptDynamicCreateConfirm({
        draft: nextFlow,
        chatId: input.chatId,
        botToken: input.botToken,
        locale: input.locale,
        deps: input.deps,
      });
      return { handled: true, callbackText: input.locale === 'my' ? 'Expiry saved.' : 'Expiry saved.' };
    }

    if (flow.step === 'confirm' && input.action === 'confirm') {
      const created = await finalizeDynamicCreate({
        draft: flow,
        chatId: input.chatId,
        botToken: input.botToken,
        locale: input.locale,
        adminActor: input.adminActor,
        sendDirect: input.primary === 'send',
        deps: input.deps,
      });
      const nextFlow: DynamicManageDraft = {
        kind: 'manage_dynamic',
        step: 'actions',
        dynamicKeyId: created.id,
      };
      await savePendingAdminFlow(input.telegramUserId, input.chatId, nextFlow);
      await showDynamicManageActions({
        chatId: input.chatId,
        botToken: input.botToken,
        locale: input.locale,
        dynamicKeyId: created.id,
        deps: input.deps,
      });
      return { handled: true, callbackText: input.locale === 'my' ? 'Dynamic key created.' : 'Dynamic key created.' };
    }
  }

  if (flow.kind === 'manage_access') {
    if (flow.step === 'query' && input.action === 'pick' && input.primary) {
      const nextFlow: AccessManageDraft = {
        kind: 'manage_access',
        step: 'actions',
        keyId: input.primary,
      };
      await savePendingAdminFlow(input.telegramUserId, input.chatId, nextFlow);
      await showAccessManageActions({
        chatId: input.chatId,
        botToken: input.botToken,
        locale: input.locale,
        keyId: input.primary,
        deps: input.deps,
      });
      return { handled: true, callbackText: input.locale === 'my' ? 'Selected.' : 'Selected.' };
    }

    if (flow.step === 'confirm_resetusage' && flow.keyId && input.action === 'danger' && input.primary === 'resetusage') {
      if (input.secondary === 'back') {
        const nextFlow: AccessManageDraft = {
          ...flow,
          step: 'actions',
        };
        await savePendingAdminFlow(input.telegramUserId, input.chatId, nextFlow);
        await showAccessManageActions({
          chatId: input.chatId,
          botToken: input.botToken,
          locale: input.locale,
          keyId: flow.keyId,
          deps: input.deps,
        });
        return { handled: true, callbackText: input.locale === 'my' ? 'Back.' : 'Back.' };
      }

      if (input.secondary === 'confirm') {
        await resetAccessKeyUsage(flow.keyId);
        await writeTelegramAdminKeyAudit({
          adminActor: input.adminActor,
          action: 'TELEGRAM_ADMIN_ACCESS_KEY_USAGE_RESET',
          entity: 'ACCESS_KEY',
          entityId: flow.keyId,
        });
        const nextFlow: AccessManageDraft = {
          ...flow,
          step: 'actions',
        };
        await savePendingAdminFlow(input.telegramUserId, input.chatId, nextFlow);
        await showAccessManageActions({
          chatId: input.chatId,
          botToken: input.botToken,
          locale: input.locale,
          keyId: flow.keyId,
          deps: input.deps,
        });
        return { handled: true, callbackText: input.locale === 'my' ? 'Usage reset.' : 'Usage reset.' };
      }
    }

    if (flow.step === 'confirm_toggle' && flow.keyId && input.action === 'danger' && input.primary === 'toggle_off') {
      if (input.secondary === 'back') {
        const nextFlow: AccessManageDraft = {
          ...flow,
          step: 'actions',
        };
        await savePendingAdminFlow(input.telegramUserId, input.chatId, nextFlow);
        await showAccessManageActions({
          chatId: input.chatId,
          botToken: input.botToken,
          locale: input.locale,
          keyId: flow.keyId,
          deps: input.deps,
        });
        return { handled: true, callbackText: input.locale === 'my' ? 'Back.' : 'Back.' };
      }

      if (input.secondary === 'confirm') {
        await setAccessKeyEnabledState(flow.keyId, false);
        await writeTelegramAdminKeyAudit({
          adminActor: input.adminActor,
          action: 'TELEGRAM_ADMIN_ACCESS_KEY_DISABLED',
          entity: 'ACCESS_KEY',
          entityId: flow.keyId,
        });
        const nextFlow: AccessManageDraft = {
          ...flow,
          step: 'actions',
        };
        await savePendingAdminFlow(input.telegramUserId, input.chatId, nextFlow);
        await showAccessManageActions({
          chatId: input.chatId,
          botToken: input.botToken,
          locale: input.locale,
          keyId: flow.keyId,
          deps: input.deps,
        });
        return { handled: true, callbackText: input.locale === 'my' ? 'Key disabled.' : 'Key disabled.' };
      }
    }

    if (flow.step === 'actions' && flow.keyId && input.action === 'shortcut') {
      if (input.primary === 'topup10' || input.primary === 'topup30') {
        const addGb = input.primary === 'topup10' ? 10 : 30;
        const key = await db.accessKey.findUnique({
          where: { id: flow.keyId },
          select: {
            dataLimitBytes: true,
          },
        });
        if (!key) {
          throw new Error('Access key not found.');
        }
        const currentGb = key.dataLimitBytes ? Number(key.dataLimitBytes) / (1024 * 1024 * 1024) : 0;
        await applyAccessKeyQuota({
          keyId: flow.keyId,
          dataLimitGB: currentGb + addGb,
        });
        await writeTelegramAdminKeyAudit({
          adminActor: input.adminActor,
          action: 'TELEGRAM_ADMIN_ACCESS_KEY_QUOTA_ADDED',
          entity: 'ACCESS_KEY',
          entityId: flow.keyId,
          details: {
            addGb,
            source: 'shortcut',
          },
        });
        await showAccessManageActions({
          chatId: input.chatId,
          botToken: input.botToken,
          locale: input.locale,
          keyId: flow.keyId,
          deps: input.deps,
        });
        return { handled: true, callbackText: input.locale === 'my' ? `Added ${addGb} GB.` : `Added ${addGb} GB.` };
      }

      if (input.primary === 'extend7' || input.primary === 'extend30') {
        const extendAction = input.primary === 'extend7' ? '7' : '30';
        await updateAccessKeyExpiry({
          keyId: flow.keyId,
          action: extendAction,
        });
        await writeTelegramAdminKeyAudit({
          adminActor: input.adminActor,
          action: 'TELEGRAM_ADMIN_ACCESS_KEY_EXPIRY_UPDATED',
          entity: 'ACCESS_KEY',
          entityId: flow.keyId,
          details: {
            action: extendAction,
            source: 'shortcut',
          },
        });
        await showAccessManageActions({
          chatId: input.chatId,
          botToken: input.botToken,
          locale: input.locale,
          keyId: flow.keyId,
          deps: input.deps,
        });
        return {
          handled: true,
          callbackText: input.locale === 'my'
            ? `Extended ${extendAction} days.`
            : `Extended ${extendAction} days.`,
        };
      }
    }

    if (flow.step === 'actions' && flow.keyId && input.action === 'manage') {
      switch (input.primary) {
        case 'quota':
          await promptQuota({
            kind: 'manage_access',
            chatId: input.chatId,
            botToken: input.botToken,
            locale: input.locale,
            deps: input.deps,
          });
          return { handled: true, callbackText: input.locale === 'my' ? 'Choose quota.' : 'Choose quota.' };
        case 'addquota':
          await promptAddQuota({
            chatId: input.chatId,
            botToken: input.botToken,
            locale: input.locale,
            deps: input.deps,
          });
          return { handled: true, callbackText: input.locale === 'my' ? 'Choose top-up.' : 'Choose top-up.' };
        case 'resetusage':
          await savePendingAdminFlow(input.telegramUserId, input.chatId, {
            ...flow,
            step: 'confirm_resetusage',
          });
          await input.deps.sendTelegramMessage(
            input.botToken,
            input.chatId,
            input.locale === 'my'
              ? '🔄 Usage ကို reset လုပ်မည်။ Confirm နှိပ်ပါ။'
              : '🔄 This will reset usage. Press Confirm to continue.',
            {
              replyMarkup: buildDangerConfirmKeyboard({
                locale: input.locale,
                action: 'resetusage',
              }),
            },
          );
          return { handled: true, callbackText: input.locale === 'my' ? 'Confirm reset.' : 'Confirm reset.' };
        case 'expiry':
          await promptManageExpiry({
            chatId: input.chatId,
            botToken: input.botToken,
            locale: input.locale,
            deps: input.deps,
          });
          return { handled: true, callbackText: input.locale === 'my' ? 'Choose expiry.' : 'Choose expiry.' };
        case 'toggle': {
          const currentKey = await db.accessKey.findUnique({
            where: { id: flow.keyId },
            select: { status: true },
          });
          if (!currentKey) {
            throw new Error('Access key not found.');
          }
          const enable = currentKey.status === 'DISABLED';
          if (!enable) {
            await savePendingAdminFlow(input.telegramUserId, input.chatId, {
              ...flow,
              step: 'confirm_toggle',
            });
            await input.deps.sendTelegramMessage(
              input.botToken,
              input.chatId,
              input.locale === 'my'
                ? '⛔ Key ကို disable လုပ်မည်။ Confirm နှိပ်ပါ။'
                : '⛔ This will disable the key. Press Confirm to continue.',
              {
                replyMarkup: buildDangerConfirmKeyboard({
                  locale: input.locale,
                  action: 'toggle_off',
                }),
              },
            );
            return { handled: true, callbackText: input.locale === 'my' ? 'Confirm disable.' : 'Confirm disable.' };
          }

          await setAccessKeyEnabledState(flow.keyId, true);
          await writeTelegramAdminKeyAudit({
            adminActor: input.adminActor,
            action: 'TELEGRAM_ADMIN_ACCESS_KEY_ENABLED',
            entity: 'ACCESS_KEY',
            entityId: flow.keyId,
          });
          await showAccessManageActions({
            chatId: input.chatId,
            botToken: input.botToken,
            locale: input.locale,
            keyId: flow.keyId,
            deps: input.deps,
          });
          return { handled: true, callbackText: input.locale === 'my' ? 'Key enabled.' : 'Key enabled.' };
        }
        case 'resend': {
          try {
            await input.deps.sendAccessKeySharePageToTelegram({
              accessKeyId: flow.keyId,
              reason: 'RESENT',
              source: 'telegram_admin_manage',
              includeQr: true,
              locale: input.locale,
            });
            await writeTelegramAdminKeyAudit({
              adminActor: input.adminActor,
              action: 'TELEGRAM_ADMIN_ACCESS_KEY_RESEND',
              entity: 'ACCESS_KEY',
              entityId: flow.keyId,
              details: {
                directDelivery: true,
              },
            });
            return { handled: true, callbackText: input.locale === 'my' ? 'Access sent.' : 'Access sent.' };
          } catch {
            const connectLink = await input.deps.createAccessKeyTelegramConnectLink({
              accessKeyId: flow.keyId,
              createdByUserId: input.adminActor.userId,
            });
            await writeTelegramAdminKeyAudit({
              adminActor: input.adminActor,
              action: 'TELEGRAM_ADMIN_ACCESS_KEY_RESEND',
              entity: 'ACCESS_KEY',
              entityId: flow.keyId,
              details: {
                directDelivery: false,
                fallback: 'connect_link',
              },
            });
            await input.deps.sendTelegramMessage(
              input.botToken,
              input.chatId,
              [
                input.locale === 'my'
                  ? 'Direct delivery မအောင်မြင်ပါ။ Linked Telegram chat မရှိနိုင်သောကြောင့် connect link ကို သုံးပါ။'
                  : 'Direct delivery was not available. Use this connect link instead.',
                '',
                connectLink.url,
                `Expires: ${formatDateTime(connectLink.expiresAt)}`,
              ].join('\n'),
            );
            return { handled: true, callbackText: input.locale === 'my' ? 'Connect link ready.' : 'Connect link ready.' };
          }
        }
        case 'message': {
          const target = await resolveAccessKeyDirectMessageTarget(flow.keyId);
          if (!target.recipientChatId) {
            throw new Error('This key does not have a linked Telegram chat for direct messaging.');
          }
          await startTelegramAdminDirectMessageFlow({
            telegramUserId: input.telegramUserId,
            chatId: input.chatId,
            locale: input.locale,
            botToken: input.botToken,
            recipientChatId: target.recipientChatId,
            recipientLabel: target.recipientLabel,
            userId: target.userId,
            accessKeyId: target.accessKeyId,
            deps: input.deps,
          });
          return { handled: true, callbackText: input.locale === 'my' ? 'Send the message now.' : 'Send the message now.' };
        }
        default:
          break;
      }
    }

    if (input.action === 'quota') {
      if (input.primary === 'custom') {
        const nextFlow: AccessManageDraft = {
          ...flow,
          step: 'quota_custom',
        };
        await savePendingAdminFlow(input.telegramUserId, input.chatId, nextFlow);
        await input.deps.sendTelegramMessage(
          input.botToken,
          input.chatId,
          input.locale === 'my'
            ? 'Custom quota ကို GB ဖြင့် စာသားပို့ပါ။ ဥပမာ 25'
            : 'Send the custom quota in GB as text, for example 25.',
          {
            replyMarkup: buildCancelKeyboard(input.locale),
          },
        );
        return { handled: true, callbackText: input.locale === 'my' ? 'Awaiting quota.' : 'Awaiting quota.' };
      }
      await applyAccessKeyQuota({
        keyId: flow.keyId || '',
        dataLimitGB: input.primary === 'unlimited' ? null : parseGbInput(input.primary || '') ?? null,
      });
      await writeTelegramAdminKeyAudit({
        adminActor: input.adminActor,
        action: 'TELEGRAM_ADMIN_ACCESS_KEY_QUOTA_UPDATED',
        entity: 'ACCESS_KEY',
        entityId: flow.keyId || '',
        details: {
          dataLimitGb: input.primary === 'unlimited' ? null : parseGbInput(input.primary || '') ?? null,
        },
      });
      await showAccessManageActions({
        chatId: input.chatId,
        botToken: input.botToken,
        locale: input.locale,
        keyId: flow.keyId || '',
        deps: input.deps,
      });
      return { handled: true, callbackText: input.locale === 'my' ? 'Quota updated.' : 'Quota updated.' };
    }

    if (input.action === 'addquota') {
      if (input.primary === 'custom') {
        const nextFlow: AccessManageDraft = {
          ...flow,
          step: 'add_quota_custom',
        };
        await savePendingAdminFlow(input.telegramUserId, input.chatId, nextFlow);
        await input.deps.sendTelegramMessage(
          input.botToken,
          input.chatId,
          input.locale === 'my'
            ? 'Add လုပ်မည့် quota ကို GB ဖြင့် စာသားပို့ပါ။ ဥပမာ 25'
            : 'Send the quota top-up in GB as text, for example 25.',
          {
            replyMarkup: buildCancelKeyboard(input.locale),
          },
        );
        return { handled: true, callbackText: input.locale === 'my' ? 'Awaiting top-up.' : 'Awaiting top-up.' };
      }
      const addGb = parseGbInput(input.primary || '');
      const key = await db.accessKey.findUnique({
        where: { id: flow.keyId || '' },
        select: {
          dataLimitBytes: true,
        },
      });
      if (!key) {
        throw new Error('Access key not found.');
      }
      const currentGb = key.dataLimitBytes ? Number(key.dataLimitBytes) / (1024 * 1024 * 1024) : 0;
      await applyAccessKeyQuota({
        keyId: flow.keyId || '',
        dataLimitGB: currentGb + (addGb || 0),
      });
      await writeTelegramAdminKeyAudit({
        adminActor: input.adminActor,
        action: 'TELEGRAM_ADMIN_ACCESS_KEY_QUOTA_ADDED',
        entity: 'ACCESS_KEY',
        entityId: flow.keyId || '',
        details: {
          addGb: addGb || 0,
        },
      });
      await showAccessManageActions({
        chatId: input.chatId,
        botToken: input.botToken,
        locale: input.locale,
        keyId: flow.keyId || '',
        deps: input.deps,
      });
      return { handled: true, callbackText: input.locale === 'my' ? 'Quota added.' : 'Quota added.' };
    }

    if (input.action === 'setexpiry') {
      if (input.primary === 'fixed') {
        const nextFlow: AccessManageDraft = {
          ...flow,
          step: 'expiry_date',
        };
        await savePendingAdminFlow(input.telegramUserId, input.chatId, nextFlow);
        await input.deps.sendTelegramMessage(
          input.botToken,
          input.chatId,
          input.locale === 'my'
            ? 'Fixed date ကို YYYY-MM-DD (KST) ဖြင့် ပို့ပါ။ ဥပမာ 2026-04-30'
            : 'Send the fixed date in YYYY-MM-DD (KST), for example 2026-04-30.',
          {
            replyMarkup: buildCancelKeyboard(input.locale),
          },
        );
        return { handled: true, callbackText: input.locale === 'my' ? 'Awaiting date.' : 'Awaiting date.' };
      }
      await updateAccessKeyExpiry({
        keyId: flow.keyId || '',
        action: (input.primary as 'never' | '7' | '30' | '90') || '30',
      });
      await writeTelegramAdminKeyAudit({
        adminActor: input.adminActor,
        action: 'TELEGRAM_ADMIN_ACCESS_KEY_EXPIRY_UPDATED',
        entity: 'ACCESS_KEY',
        entityId: flow.keyId || '',
        details: {
          action: (input.primary as 'never' | '7' | '30' | '90') || '30',
        },
      });
      await showAccessManageActions({
        chatId: input.chatId,
        botToken: input.botToken,
        locale: input.locale,
        keyId: flow.keyId || '',
        deps: input.deps,
      });
      return { handled: true, callbackText: input.locale === 'my' ? 'Expiry updated.' : 'Expiry updated.' };
    }
  }

  if (flow.kind === 'manage_dynamic') {
    if (flow.step === 'query' && input.action === 'pick' && input.primary) {
      const nextFlow: DynamicManageDraft = {
        kind: 'manage_dynamic',
        step: 'actions',
        dynamicKeyId: input.primary,
      };
      await savePendingAdminFlow(input.telegramUserId, input.chatId, nextFlow);
      await showDynamicManageActions({
        chatId: input.chatId,
        botToken: input.botToken,
        locale: input.locale,
        dynamicKeyId: input.primary,
        deps: input.deps,
      });
      return { handled: true, callbackText: input.locale === 'my' ? 'Selected.' : 'Selected.' };
    }

    if (flow.step === 'confirm_resetusage' && flow.dynamicKeyId && input.action === 'danger' && input.primary === 'resetusage') {
      if (input.secondary === 'back') {
        const nextFlow: DynamicManageDraft = {
          ...flow,
          step: 'actions',
        };
        await savePendingAdminFlow(input.telegramUserId, input.chatId, nextFlow);
        await showDynamicManageActions({
          chatId: input.chatId,
          botToken: input.botToken,
          locale: input.locale,
          dynamicKeyId: flow.dynamicKeyId,
          deps: input.deps,
        });
        return { handled: true, callbackText: input.locale === 'my' ? 'Back.' : 'Back.' };
      }

      if (input.secondary === 'confirm') {
        await resetDynamicUsage(flow.dynamicKeyId);
        await writeTelegramAdminKeyAudit({
          adminActor: input.adminActor,
          action: 'TELEGRAM_ADMIN_DYNAMIC_KEY_USAGE_RESET',
          entity: 'DYNAMIC_ACCESS_KEY',
          entityId: flow.dynamicKeyId,
        });
        const nextFlow: DynamicManageDraft = {
          ...flow,
          step: 'actions',
        };
        await savePendingAdminFlow(input.telegramUserId, input.chatId, nextFlow);
        await showDynamicManageActions({
          chatId: input.chatId,
          botToken: input.botToken,
          locale: input.locale,
          dynamicKeyId: flow.dynamicKeyId,
          deps: input.deps,
        });
        return { handled: true, callbackText: input.locale === 'my' ? 'Usage reset.' : 'Usage reset.' };
      }
    }

    if (flow.step === 'region_pick' && flow.dynamicKeyId && input.action === 'setregion') {
      const preferredCountryCodes =
        !input.primary || input.primary === 'auto'
          ? []
          : [input.primary.toUpperCase()];
      await updateDynamicPreferredRegions({
        dynamicKeyId: flow.dynamicKeyId,
        preferredCountryCodes,
      });
      await writeTelegramAdminKeyAudit({
        adminActor: input.adminActor,
        action: 'TELEGRAM_ADMIN_DYNAMIC_KEY_REGION_UPDATED',
        entity: 'DYNAMIC_ACCESS_KEY',
        entityId: flow.dynamicKeyId,
        details: {
          preferredCountryCodes,
        },
      });
      const nextFlow: DynamicManageDraft = {
        ...flow,
        step: 'actions',
      };
      await savePendingAdminFlow(input.telegramUserId, input.chatId, nextFlow);
      await showDynamicManageActions({
        chatId: input.chatId,
        botToken: input.botToken,
        locale: input.locale,
        dynamicKeyId: flow.dynamicKeyId,
        deps: input.deps,
      });
      return {
        handled: true,
        callbackText:
          preferredCountryCodes.length > 0
            ? `Region set to ${preferredCountryCodes[0]}.`
            : (input.locale === 'my' ? 'Region preference cleared.' : 'Region preference cleared.'),
      };
    }

    if (flow.step === 'actions' && flow.dynamicKeyId && input.action === 'shortcut') {
      if (input.primary === 'topup10' || input.primary === 'topup30') {
        const addGb = input.primary === 'topup10' ? 10 : 30;
        const dynamicKey = await db.dynamicAccessKey.findUnique({
          where: { id: flow.dynamicKeyId },
          select: {
            dataLimitBytes: true,
          },
        });
        if (!dynamicKey) {
          throw new Error('Dynamic key not found.');
        }
        const currentGb = dynamicKey.dataLimitBytes
          ? Number(dynamicKey.dataLimitBytes) / (1024 * 1024 * 1024)
          : 0;
        await applyDynamicQuota({
          dynamicKeyId: flow.dynamicKeyId,
          dataLimitGB: currentGb + addGb,
        });
        await writeTelegramAdminKeyAudit({
          adminActor: input.adminActor,
          action: 'TELEGRAM_ADMIN_DYNAMIC_KEY_QUOTA_ADDED',
          entity: 'DYNAMIC_ACCESS_KEY',
          entityId: flow.dynamicKeyId,
          details: {
            addGb,
            source: 'shortcut',
          },
        });
        await showDynamicManageActions({
          chatId: input.chatId,
          botToken: input.botToken,
          locale: input.locale,
          dynamicKeyId: flow.dynamicKeyId,
          deps: input.deps,
        });
        return { handled: true, callbackText: input.locale === 'my' ? `Added ${addGb} GB.` : `Added ${addGb} GB.` };
      }

      if (input.primary === 'extend7' || input.primary === 'extend30') {
        const extendAction = input.primary === 'extend7' ? '7' : '30';
        await updateDynamicExpiry({
          dynamicKeyId: flow.dynamicKeyId,
          action: extendAction,
        });
        await writeTelegramAdminKeyAudit({
          adminActor: input.adminActor,
          action: 'TELEGRAM_ADMIN_DYNAMIC_KEY_EXPIRY_UPDATED',
          entity: 'DYNAMIC_ACCESS_KEY',
          entityId: flow.dynamicKeyId,
          details: {
            action: extendAction,
            source: 'shortcut',
          },
        });
        await showDynamicManageActions({
          chatId: input.chatId,
          botToken: input.botToken,
          locale: input.locale,
          dynamicKeyId: flow.dynamicKeyId,
          deps: input.deps,
        });
        return {
          handled: true,
          callbackText: input.locale === 'my'
            ? `Extended ${extendAction} days.`
            : `Extended ${extendAction} days.`,
        };
      }
    }

    if (flow.step === 'actions' && flow.dynamicKeyId && input.action === 'manage') {
      switch (input.primary) {
        case 'quota':
          await promptQuota({
            kind: 'manage_dynamic',
            chatId: input.chatId,
            botToken: input.botToken,
            locale: input.locale,
            deps: input.deps,
          });
          return { handled: true, callbackText: input.locale === 'my' ? 'Choose quota.' : 'Choose quota.' };
        case 'addquota':
          await promptAddQuota({
            chatId: input.chatId,
            botToken: input.botToken,
            locale: input.locale,
            deps: input.deps,
          });
          return { handled: true, callbackText: input.locale === 'my' ? 'Choose top-up.' : 'Choose top-up.' };
        case 'resetusage':
          await savePendingAdminFlow(input.telegramUserId, input.chatId, {
            ...flow,
            step: 'confirm_resetusage',
          });
          await input.deps.sendTelegramMessage(
            input.botToken,
            input.chatId,
            input.locale === 'my'
              ? '🔄 Dynamic usage ကို reset လုပ်မည်။ Confirm နှိပ်ပါ။'
              : '🔄 This will reset dynamic-key usage. Press Confirm to continue.',
            {
              replyMarkup: buildDangerConfirmKeyboard({
                locale: input.locale,
                action: 'resetusage',
              }),
            },
          );
          return { handled: true, callbackText: input.locale === 'my' ? 'Confirm reset.' : 'Confirm reset.' };
        case 'expiry':
          await promptManageExpiry({
            chatId: input.chatId,
            botToken: input.botToken,
            locale: input.locale,
            deps: input.deps,
          });
          return { handled: true, callbackText: input.locale === 'my' ? 'Choose expiry.' : 'Choose expiry.' };
        case 'region': {
          const key = await db.dynamicAccessKey.findUnique({
            where: { id: flow.dynamicKeyId },
            select: {
              preferredCountryCodesJson: true,
              accessKeys: {
                select: {
                  server: {
                    select: {
                      countryCode: true,
                    },
                  },
                },
              },
            },
          });
          if (!key) {
            throw new Error('Dynamic key not found.');
          }
          const nextFlow: DynamicManageDraft = {
            ...flow,
            step: 'region_pick',
          };
          await savePendingAdminFlow(input.telegramUserId, input.chatId, nextFlow);
          await input.deps.sendTelegramMessage(
            input.botToken,
            input.chatId,
            [
              input.locale === 'my'
                ? '🌍 <b>Choose preferred region</b>'
                : '🌍 <b>Choose preferred region</b>',
              '',
              input.locale === 'my'
                ? 'Auto သည် region preference ကို clear လုပ်ပါမည်။'
                : 'Auto clears the region preference.',
            ].join('\n'),
            {
              replyMarkup: buildDynamicRegionKeyboard({
                locale: input.locale,
                regionCodes: getDynamicKeyRegionChoices(key),
              }),
            },
          );
          return { handled: true, callbackText: input.locale === 'my' ? 'Choose region.' : 'Choose region.' };
        }
        case 'mode': {
          const updated = await toggleDynamicPreferredRegionMode(flow.dynamicKeyId);
          await writeTelegramAdminKeyAudit({
            adminActor: input.adminActor,
            action: 'TELEGRAM_ADMIN_DYNAMIC_KEY_REGION_MODE_UPDATED',
            entity: 'DYNAMIC_ACCESS_KEY',
            entityId: flow.dynamicKeyId,
            details: {
              preferredRegionMode: updated.preferredRegionMode,
            },
          });
          await showDynamicManageActions({
            chatId: input.chatId,
            botToken: input.botToken,
            locale: input.locale,
            dynamicKeyId: flow.dynamicKeyId,
            deps: input.deps,
          });
          return {
            handled: true,
            callbackText: formatRegionModeLabel(updated.preferredRegionMode, input.locale),
          };
        }
        case 'routing': {
          const key = await db.dynamicAccessKey.findUnique({
            where: { id: flow.dynamicKeyId },
            select: {
              preferredCountryCodesJson: true,
              preferredServerIdsJson: true,
              preferredRegionMode: true,
              pinnedServerId: true,
              pinExpiresAt: true,
              accessKeys: {
                select: {
                  server: {
                    select: {
                      countryCode: true,
                    },
                  },
                },
              },
            },
          });
          if (!key) {
            throw new Error('Dynamic key not found.');
          }
          await input.deps.sendTelegramMessage(
            input.botToken,
            input.chatId,
            [
              input.locale === 'my'
                ? '💎 <b>Dynamic routing view</b>'
                : '💎 <b>Dynamic routing view</b>',
              '',
              ...buildDynamicRoutingManageLines({
                preferredCountryCodesJson: key.preferredCountryCodesJson,
                preferredServerIdsJson: key.preferredServerIdsJson,
                preferredRegionMode: key.preferredRegionMode,
                pinnedServerId: key.pinnedServerId,
                pinExpiresAt: key.pinExpiresAt,
                accessKeys: key.accessKeys,
                locale: input.locale,
              }),
            ].join('\n'),
          );
          return { handled: true, callbackText: input.locale === 'my' ? 'Routing view.' : 'Routing view.' };
        }
        case 'resend': {
          try {
            await input.deps.sendDynamicKeySharePageToTelegram({
              dynamicAccessKeyId: flow.dynamicKeyId,
              reason: 'RESENT',
              source: 'telegram_admin_manage',
              includeQr: true,
              locale: input.locale,
            });
            await writeTelegramAdminKeyAudit({
              adminActor: input.adminActor,
              action: 'TELEGRAM_ADMIN_DYNAMIC_KEY_RESEND',
              entity: 'DYNAMIC_ACCESS_KEY',
              entityId: flow.dynamicKeyId,
              details: {
                directDelivery: true,
              },
            });
            return { handled: true, callbackText: input.locale === 'my' ? 'Access sent.' : 'Access sent.' };
          } catch {
            const connectLink = await input.deps.createDynamicKeyTelegramConnectLink({
              dynamicAccessKeyId: flow.dynamicKeyId,
              createdByUserId: input.adminActor.userId,
            });
            await writeTelegramAdminKeyAudit({
              adminActor: input.adminActor,
              action: 'TELEGRAM_ADMIN_DYNAMIC_KEY_RESEND',
              entity: 'DYNAMIC_ACCESS_KEY',
              entityId: flow.dynamicKeyId,
              details: {
                directDelivery: false,
                fallback: 'connect_link',
              },
            });
            await input.deps.sendTelegramMessage(
              input.botToken,
              input.chatId,
              [
                input.locale === 'my'
                  ? 'Direct delivery မအောင်မြင်ပါ။ Linked Telegram chat မရှိနိုင်သောကြောင့် connect link ကို သုံးပါ။'
                  : 'Direct delivery was not available. Use this connect link instead.',
                '',
                connectLink.url,
                `Expires: ${formatDateTime(connectLink.expiresAt)}`,
              ].join('\n'),
            );
            return { handled: true, callbackText: input.locale === 'my' ? 'Connect link ready.' : 'Connect link ready.' };
          }
        }
        case 'message': {
          const target = await resolveDynamicKeyDirectMessageTarget(flow.dynamicKeyId);
          if (!target.recipientChatId) {
            throw new Error('This dynamic key does not have a linked Telegram chat for direct messaging.');
          }
          await startTelegramAdminDirectMessageFlow({
            telegramUserId: input.telegramUserId,
            chatId: input.chatId,
            locale: input.locale,
            botToken: input.botToken,
            recipientChatId: target.recipientChatId,
            recipientLabel: target.recipientLabel,
            userId: target.userId,
            dynamicKeyId: target.dynamicKeyId,
            deps: input.deps,
          });
          return { handled: true, callbackText: input.locale === 'my' ? 'Send the message now.' : 'Send the message now.' };
        }
        default:
          break;
      }
    }

    if (input.action === 'quota') {
      if (input.primary === 'custom') {
        const nextFlow: DynamicManageDraft = {
          ...flow,
          step: 'quota_custom',
        };
        await savePendingAdminFlow(input.telegramUserId, input.chatId, nextFlow);
        await input.deps.sendTelegramMessage(
          input.botToken,
          input.chatId,
          input.locale === 'my'
            ? 'Custom quota ကို GB ဖြင့် စာသားပို့ပါ။ ဥပမာ 25'
            : 'Send the custom quota in GB as text, for example 25.',
          {
            replyMarkup: buildCancelKeyboard(input.locale),
          },
        );
        return { handled: true, callbackText: input.locale === 'my' ? 'Awaiting quota.' : 'Awaiting quota.' };
      }
      await applyDynamicQuota({
        dynamicKeyId: flow.dynamicKeyId || '',
        dataLimitGB: input.primary === 'unlimited' ? null : parseGbInput(input.primary || '') ?? null,
      });
      await writeTelegramAdminKeyAudit({
        adminActor: input.adminActor,
        action: 'TELEGRAM_ADMIN_DYNAMIC_KEY_QUOTA_UPDATED',
        entity: 'DYNAMIC_ACCESS_KEY',
        entityId: flow.dynamicKeyId || '',
        details: {
          dataLimitGb: input.primary === 'unlimited' ? null : parseGbInput(input.primary || '') ?? null,
        },
      });
      await showDynamicManageActions({
        chatId: input.chatId,
        botToken: input.botToken,
        locale: input.locale,
        dynamicKeyId: flow.dynamicKeyId || '',
        deps: input.deps,
      });
      return { handled: true, callbackText: input.locale === 'my' ? 'Quota updated.' : 'Quota updated.' };
    }

    if (input.action === 'addquota') {
      if (input.primary === 'custom') {
        const nextFlow: DynamicManageDraft = {
          ...flow,
          step: 'add_quota_custom',
        };
        await savePendingAdminFlow(input.telegramUserId, input.chatId, nextFlow);
        await input.deps.sendTelegramMessage(
          input.botToken,
          input.chatId,
          input.locale === 'my'
            ? 'Add လုပ်မည့် quota ကို GB ဖြင့် စာသားပို့ပါ။ ဥပမာ 25'
            : 'Send the quota top-up in GB as text, for example 25.',
          {
            replyMarkup: buildCancelKeyboard(input.locale),
          },
        );
        return { handled: true, callbackText: input.locale === 'my' ? 'Awaiting top-up.' : 'Awaiting top-up.' };
      }
      const addGb = parseGbInput(input.primary || '');
      const dynamicKey = await db.dynamicAccessKey.findUnique({
        where: { id: flow.dynamicKeyId || '' },
        select: {
          dataLimitBytes: true,
        },
      });
      if (!dynamicKey) {
        throw new Error('Dynamic key not found.');
      }
      const currentGb = dynamicKey.dataLimitBytes
        ? Number(dynamicKey.dataLimitBytes) / (1024 * 1024 * 1024)
        : 0;
      await applyDynamicQuota({
        dynamicKeyId: flow.dynamicKeyId || '',
        dataLimitGB: currentGb + (addGb || 0),
      });
      await writeTelegramAdminKeyAudit({
        adminActor: input.adminActor,
        action: 'TELEGRAM_ADMIN_DYNAMIC_KEY_QUOTA_ADDED',
        entity: 'DYNAMIC_ACCESS_KEY',
        entityId: flow.dynamicKeyId || '',
        details: {
          addGb: addGb || 0,
        },
      });
      await showDynamicManageActions({
        chatId: input.chatId,
        botToken: input.botToken,
        locale: input.locale,
        dynamicKeyId: flow.dynamicKeyId || '',
        deps: input.deps,
      });
      return { handled: true, callbackText: input.locale === 'my' ? 'Quota added.' : 'Quota added.' };
    }

    if (input.action === 'setexpiry') {
      if (input.primary === 'fixed') {
        const nextFlow: DynamicManageDraft = {
          ...flow,
          step: 'expiry_date',
        };
        await savePendingAdminFlow(input.telegramUserId, input.chatId, nextFlow);
        await input.deps.sendTelegramMessage(
          input.botToken,
          input.chatId,
          input.locale === 'my'
            ? 'Fixed date ကို YYYY-MM-DD (KST) ဖြင့် ပို့ပါ။ ဥပမာ 2026-04-30'
            : 'Send the fixed date in YYYY-MM-DD (KST), for example 2026-04-30.',
          {
            replyMarkup: buildCancelKeyboard(input.locale),
          },
        );
        return { handled: true, callbackText: input.locale === 'my' ? 'Awaiting date.' : 'Awaiting date.' };
      }
      await updateDynamicExpiry({
        dynamicKeyId: flow.dynamicKeyId || '',
        action: (input.primary as 'never' | '7' | '30' | '90') || '30',
      });
      await writeTelegramAdminKeyAudit({
        adminActor: input.adminActor,
        action: 'TELEGRAM_ADMIN_DYNAMIC_KEY_EXPIRY_UPDATED',
        entity: 'DYNAMIC_ACCESS_KEY',
        entityId: flow.dynamicKeyId || '',
        details: {
          action: (input.primary as 'never' | '7' | '30' | '90') || '30',
        },
      });
      await showDynamicManageActions({
        chatId: input.chatId,
        botToken: input.botToken,
        locale: input.locale,
        dynamicKeyId: flow.dynamicKeyId || '',
        deps: input.deps,
      });
      return { handled: true, callbackText: input.locale === 'my' ? 'Expiry updated.' : 'Expiry updated.' };
    }
  }

  return { handled: false };
}
