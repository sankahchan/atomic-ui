import { z } from 'zod';
import { db } from '@/lib/db';
import { withAbsoluteBasePath } from '@/lib/base-path';
import { coerceSupportedLocale, type SupportedLocale } from '@/lib/i18n/config';
import {
  hasFinanceConfigureScope,
  hasFinanceManageScope,
  normalizeAdminScope,
} from '@/lib/admin-scope';
import {
  getTelegramNotificationPreferences,
  sendTelegramPhotoUrl,
} from '@/lib/services/telegram-runtime';
import { getTelegramBrandMediaUrl } from '@/lib/services/telegram-branding';
import { escapeHtml, getTelegramUi } from '@/lib/services/telegram-ui';

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';
const TELEGRAM_FINANCE_DIGEST_STATE_KEY = 'telegram_finance_digest_last_run';
export const FINANCE_SETTINGS_KEY = 'finance_controls';
export const REFUND_USAGE_LIMIT_BYTES = BigInt(5 * 1024 * 1024 * 1024);

export const financeControlsSchema = z.object({
  ownerEmails: z.array(z.string().trim().email()).default([]),
  operatorEmails: z.array(z.string().trim().email()).default([]),
  dailyFinanceDigestEnabled: z.boolean().default(false),
  dailyFinanceDigestHour: z.number().int().min(0).max(23).default(21),
  dailyFinanceDigestMinute: z.number().int().min(0).max(59).default(0),
});

export type FinanceControls = z.infer<typeof financeControlsSchema>;

function normalizeEmail(value?: string | null) {
  return value?.trim().toLowerCase() || '';
}

function uniqueEmails(values: string[]) {
  return Array.from(
    new Set(
      values
        .map((value) => normalizeEmail(value))
        .filter(Boolean),
    ),
  );
}

export function normalizeFinanceControlsSettings(value?: unknown): FinanceControls {
  const parsed = financeControlsSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ownerEmails: [],
      operatorEmails: [],
      dailyFinanceDigestEnabled: false,
      dailyFinanceDigestHour: 21,
      dailyFinanceDigestMinute: 0,
    };
  }

  return {
    ownerEmails: uniqueEmails(parsed.data.ownerEmails),
    operatorEmails: uniqueEmails(parsed.data.operatorEmails),
    dailyFinanceDigestEnabled: parsed.data.dailyFinanceDigestEnabled,
    dailyFinanceDigestHour: parsed.data.dailyFinanceDigestHour,
    dailyFinanceDigestMinute: parsed.data.dailyFinanceDigestMinute,
  };
}

export async function getFinanceControls() {
  const settings = await db.settings.findUnique({
    where: { key: FINANCE_SETTINGS_KEY },
    select: { value: true },
  });

  if (!settings) {
    return normalizeFinanceControlsSettings(null);
  }

  try {
    return normalizeFinanceControlsSettings(JSON.parse(settings.value));
  } catch {
    return normalizeFinanceControlsSettings(null);
  }
}

export function canUserConfigureFinance(
  user: { role?: string | null; email?: string | null; adminScope?: string | null } | null | undefined,
  controls: FinanceControls,
) {
  if (!user || user.role !== 'ADMIN') {
    return false;
  }

  if (hasFinanceConfigureScope(user.adminScope)) {
    return true;
  }

  if (normalizeAdminScope(user.adminScope)) {
    return false;
  }

  if (controls.ownerEmails.length === 0) {
    return true;
  }

  return controls.ownerEmails.includes(normalizeEmail(user.email));
}

export function canUserManageFinance(
  user: { role?: string | null; email?: string | null; adminScope?: string | null } | null | undefined,
  controls: FinanceControls,
) {
  if (!user || user.role !== 'ADMIN') {
    return false;
  }

  if (hasFinanceManageScope(user.adminScope)) {
    return true;
  }

  if (normalizeAdminScope(user.adminScope)) {
    return false;
  }

  const email = normalizeEmail(user.email);
  if (!email) {
    return false;
  }

  if (controls.ownerEmails.length === 0 && controls.operatorEmails.length === 0) {
    return true;
  }

  return controls.ownerEmails.includes(email) || controls.operatorEmails.includes(email);
}

export function evaluateRefundEligibility(input: {
  order: {
    status: string;
    financeStatus: string;
    priceAmount?: number | null;
  };
  fulfilledPaidPurchaseCount: number;
  usedBytes: bigint;
}) {
  if (input.order.status !== 'FULFILLED') {
    return {
      eligible: false,
      reason: 'Only fulfilled orders can be refunded.',
    };
  }

  if (!input.order.priceAmount || input.order.priceAmount <= 0) {
    return {
      eligible: false,
      reason: 'Only paid orders can be refunded.',
    };
  }

  if (input.order.financeStatus === 'REFUNDED') {
    return {
      eligible: false,
      reason: 'This order was already refunded.',
    };
  }

  if (input.fulfilledPaidPurchaseCount <= 3) {
    return {
      eligible: false,
      reason: 'Refunds are only available after more than 3 paid purchases.',
    };
  }

  if (input.usedBytes > REFUND_USAGE_LIMIT_BYTES) {
    return {
      eligible: false,
      reason: 'Refunds close automatically once usage goes above 5 GB.',
    };
  }

  return {
    eligible: true,
    reason: null,
  };
}

export async function evaluateTelegramOrderRefundEligibility(order: {
  status: string;
  financeStatus: string;
  priceAmount?: number | null;
  telegramUserId: string;
  approvedAccessKeyId?: string | null;
  targetAccessKeyId?: string | null;
  approvedDynamicKeyId?: string | null;
  targetDynamicKeyId?: string | null;
}) {
  const [accessKey, dynamicKey, fulfilledPurchaseCount] = await Promise.all([
    order.approvedAccessKeyId || order.targetAccessKeyId
      ? db.accessKey.findUnique({
          where: { id: order.approvedAccessKeyId || order.targetAccessKeyId || '' },
          select: { usedBytes: true },
        })
      : Promise.resolve(null),
    order.approvedDynamicKeyId || order.targetDynamicKeyId
      ? db.dynamicAccessKey.findUnique({
          where: { id: order.approvedDynamicKeyId || order.targetDynamicKeyId || '' },
          select: { usedBytes: true },
        })
      : Promise.resolve(null),
    db.telegramOrder.count({
      where: {
        telegramUserId: order.telegramUserId,
        status: 'FULFILLED',
        priceAmount: { gt: 0 },
      },
    }),
  ]);

  const usedBytes = accessKey?.usedBytes || dynamicKey?.usedBytes || BigInt(0);
  const eligibility = evaluateRefundEligibility({
    order,
    fulfilledPaidPurchaseCount: fulfilledPurchaseCount,
    usedBytes,
  });

  return {
    usedBytes,
    fulfilledPaidPurchaseCount: fulfilledPurchaseCount,
    ...eligibility,
  };
}

async function getTelegramAdminConfig() {
  const settings = await db.settings.findUnique({
    where: { key: 'telegram_bot' },
    select: { value: true },
  });

  if (!settings) {
    return null;
  }

  try {
    const value = JSON.parse(settings.value) as Record<string, unknown>;
    if (
      value.isEnabled &&
      typeof value.botToken === 'string' &&
      value.botToken.trim() &&
      Array.isArray(value.adminChatIds)
    ) {
      const adminChatIds = value.adminChatIds
        .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
        .map((entry) => entry.trim());

      if (adminChatIds.length > 0) {
        return {
          botToken: value.botToken.trim(),
          adminChatIds,
        };
      }
    }
  } catch {
    return null;
  }

  return null;
}

async function sendTelegramMessageLite(
  botToken: string,
  chatId: string,
  text: string,
  extra?: Record<string, unknown>,
) {
  try {
    const response = await fetch(`${TELEGRAM_API_BASE}${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...extra,
      }),
    });

    return response.ok;
  } catch {
    return false;
  }
}

function isSameLocalDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function formatCurrencyMap(entries: Array<{ currency: string; amount: number }>) {
  if (entries.length === 0) {
    return '0';
  }

  return entries.map((entry) => `${entry.amount.toLocaleString()} ${entry.currency}`).join(' • ');
}

export async function sendTelegramFinanceDigestToAdmins(input?: { now?: Date; force?: boolean }) {
  const controls = await getFinanceControls();
  if (!input?.force && !controls.dailyFinanceDigestEnabled) {
    return {
      skipped: true as const,
      reason: 'disabled',
      adminChats: 0,
    };
  }

  const telegramConfig = await getTelegramAdminConfig();
  if (!telegramConfig) {
    return {
      skipped: true as const,
      reason: 'telegram_not_configured',
      adminChats: 0,
    };
  }

  const now = input?.now ?? new Date();
  const lookbackStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [orders, financeActions, pendingRefundRequests] = await Promise.all([
    db.telegramOrder.findMany({
      where: {
        OR: [
          { createdAt: { gte: lookbackStart } },
          { fulfilledAt: { gte: lookbackStart } },
          { refundRequestedAt: { gte: lookbackStart } },
        ],
      },
      select: {
        status: true,
        kind: true,
        priceAmount: true,
        priceCurrency: true,
        retentionSource: true,
        fulfilledAt: true,
      },
    }),
    db.telegramOrderFinanceAction.findMany({
      where: {
        createdAt: { gte: lookbackStart },
      },
      select: {
        actionType: true,
        amount: true,
        currency: true,
      },
    }),
    db.telegramOrder.count({
      where: {
        refundRequestStatus: 'PENDING',
      },
    }),
  ]);

  const fulfilledOrders = orders.filter((order) => order.status === 'FULFILLED' && (order.priceAmount || 0) > 0);
  const renewals = fulfilledOrders.filter((order) => order.kind === 'RENEW').length;
  const revenueByCurrency = new Map<string, number>();
  for (const order of fulfilledOrders) {
    const currency = (order.priceCurrency || 'MMK').trim().toUpperCase();
    revenueByCurrency.set(currency, (revenueByCurrency.get(currency) || 0) + (order.priceAmount || 0));
  }

  const refundsByCurrency = new Map<string, number>();
  const creditsByCurrency = new Map<string, number>();
  let verifiedCount = 0;
  for (const action of financeActions) {
    const currency = (action.currency || 'MMK').trim().toUpperCase();
    if (action.actionType === 'REFUND') {
      refundsByCurrency.set(currency, (refundsByCurrency.get(currency) || 0) + (action.amount || 0));
    } else if (action.actionType === 'CREDIT') {
      creditsByCurrency.set(currency, (creditsByCurrency.get(currency) || 0) + (action.amount || 0));
    } else if (action.actionType === 'VERIFY') {
      verifiedCount += 1;
    }
  }

  const trialConversions = fulfilledOrders.filter((order) => order.retentionSource === 'trial_expiry').length;
  const lines = [
    '💸 <b>Atomic-UI Finance Digest</b>',
    '',
    `Window: last 24 hour(s)`,
    `Paid orders: ${fulfilledOrders.length}`,
    `Revenue: ${formatCurrencyMap(Array.from(revenueByCurrency.entries()).map(([currency, amount]) => ({ currency, amount })))}`,
    `Renewals: ${renewals}`,
    `Verified payments: ${verifiedCount}`,
    `Refunded: ${formatCurrencyMap(Array.from(refundsByCurrency.entries()).map(([currency, amount]) => ({ currency, amount })))}`,
    `Credited: ${formatCurrencyMap(Array.from(creditsByCurrency.entries()).map(([currency, amount]) => ({ currency, amount })))}`,
    `Pending refund requests: ${pendingRefundRequests}`,
    `Trial → paid conversions: ${trialConversions}`,
  ].join('\n');

  let adminChats = 0;
  for (const chatId of telegramConfig.adminChatIds) {
    const sent = await sendTelegramMessageLite(telegramConfig.botToken, chatId, lines);
    if (sent) {
      adminChats += 1;
    }
  }

  return {
    skipped: false as const,
    adminChats,
  };
}

export async function runTelegramFinanceDigestCycle(input?: { now?: Date; force?: boolean }) {
  const force = input?.force ?? false;
  const controls = await getFinanceControls();
  if (!force && !controls.dailyFinanceDigestEnabled) {
    return { skipped: true as const, reason: 'disabled', adminChats: 0 };
  }

  const now = input?.now ?? new Date();
  if (!force) {
    const scheduled = new Date(now);
    scheduled.setHours(controls.dailyFinanceDigestHour, controls.dailyFinanceDigestMinute, 0, 0);
    if (now.getTime() < scheduled.getTime()) {
      return { skipped: true as const, reason: 'not_due', adminChats: 0 };
    }

    const state = await db.settings.findUnique({
      where: { key: TELEGRAM_FINANCE_DIGEST_STATE_KEY },
      select: { value: true },
    });
    if (state?.value) {
      const lastRun = new Date(state.value);
      if (!Number.isNaN(lastRun.getTime()) && isSameLocalDay(lastRun, now)) {
        return { skipped: true as const, reason: 'already_sent', adminChats: 0 };
      }
    }
  }

  const result = await sendTelegramFinanceDigestToAdmins({ now, force });
  if (!result.skipped) {
    await db.settings.upsert({
      where: { key: TELEGRAM_FINANCE_DIGEST_STATE_KEY },
      create: {
        key: TELEGRAM_FINANCE_DIGEST_STATE_KEY,
        value: now.toISOString(),
      },
      update: {
        value: now.toISOString(),
      },
    });
  }

  return result;
}

function buildTelegramOrderPanelUrl(orderId: string) {
  return withAbsoluteBasePath(`/dashboard/notifications?telegramOrder=${encodeURIComponent(orderId)}`);
}

export function buildTelegramFinanceDocumentUrl(input: {
  orderCode: string;
  type: 'receipt' | 'refund';
  format?: 'html' | 'pdf';
}) {
  const params = new URLSearchParams({
    orderCode: input.orderCode,
    type: input.type,
    format: input.format || 'html',
  });
  return withAbsoluteBasePath(`/api/finance/receipt?${params.toString()}`);
}

export async function sendTelegramRefundRequestAlert(input: {
  orderId: string;
  orderCode: string;
  telegramUsername?: string | null;
  telegramUserId: string;
  refundBlockedReason?: string | null;
}) {
  const telegramConfig = await getTelegramAdminConfig();
  if (!telegramConfig) {
    return { adminChats: 0 };
  }

  const panelUrl = buildTelegramOrderPanelUrl(input.orderId);
  const lines = [
    '💳 <b>Refund request</b>',
    '',
    `Order: <b>${input.orderCode}</b>`,
    `Customer: <b>${input.telegramUsername || input.telegramUserId}</b>`,
    `Telegram ID: <code>${input.telegramUserId}</code>`,
    input.refundBlockedReason ? `Policy note: ${input.refundBlockedReason}` : '',
    '',
    `Review: ${panelUrl}`,
  ]
    .filter(Boolean)
    .join('\n');

  let adminChats = 0;
  for (const chatId of telegramConfig.adminChatIds) {
    const sent = await sendTelegramMessageLite(telegramConfig.botToken, chatId, lines);
    if (sent) {
      adminChats += 1;
    }
  }

  return { adminChats };
}

export async function sendTelegramRefundDecisionMessage(input: {
  chatId: string;
  orderCode: string;
  approved: boolean;
  customerMessage?: string | null;
  amount?: number | null;
  currency?: string | null;
  locale?: SupportedLocale | string | null;
}) {
  const telegramConfig = await getTelegramAdminConfig();
  if (!telegramConfig) {
    return false;
  }

  const locale = coerceSupportedLocale(typeof input.locale === 'string' ? input.locale : undefined) || 'en';
  const ui = getTelegramUi(locale);
  const preferences = await getTelegramNotificationPreferences({
    telegramUserId: input.chatId,
    telegramChatId: input.chatId,
  });
  if (!preferences.receipt) {
    return true;
  }
  const amountLabel =
    typeof input.amount === 'number' && Number.isFinite(input.amount)
      ? `${input.amount.toLocaleString('en-US')} ${(input.currency || 'MMK').trim().toUpperCase() === 'MMK' ? 'Kyat' : (input.currency || 'MMK').trim().toUpperCase()}`
      : null;
  const lines = [
    ui.refundReceiptTitle,
    '',
    `${ui.orderCodeLabel}: <b>${escapeHtml(input.orderCode)}</b>`,
    `${ui.receiptNumberLabel}: <code>RFND-${escapeHtml(input.orderCode)}</code>`,
    `${ui.statusLineLabel}: <b>${input.approved ? escapeHtml(ui.refundStatusApproved) : escapeHtml(ui.refundStatusRejected)}</b>`,
    amountLabel ? `${ui.priceLabel}: <b>${escapeHtml(amountLabel)}</b>` : '',
    input.customerMessage?.trim() ? `${ui.customerMessage}: ${escapeHtml(input.customerMessage.trim())}` : '',
    '',
    input.approved
      ? escapeHtml(ui.refundApprovedHelp)
      : escapeHtml(ui.refundRejectedHelp),
  ].filter(Boolean);
  const replyMarkup = {
    inline_keyboard: [
      [{ text: locale === 'my' ? 'Printable refund' : 'Printable refund', url: buildTelegramFinanceDocumentUrl({
        orderCode: input.orderCode,
        type: 'refund',
        format: 'html',
      }) }],
      [{ text: locale === 'my' ? 'Download PDF' : 'Download PDF', url: buildTelegramFinanceDocumentUrl({
        orderCode: input.orderCode,
        type: 'refund',
        format: 'pdf',
      }) }],
    ],
  } as const;

  const sentCard = await sendTelegramPhotoUrl(
    telegramConfig.botToken,
    input.chatId,
    getTelegramBrandMediaUrl('receiptRefund'),
    lines.join('\n'),
    {
      replyMarkup,
    },
  );
  if (sentCard) {
    return true;
  }

  return sendTelegramMessageLite(telegramConfig.botToken, input.chatId, lines.join('\n'), {
    reply_markup: replyMarkup,
  });
}
