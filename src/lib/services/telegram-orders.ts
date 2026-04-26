import { db } from '@/lib/db';
import { resolveRefundReasonPresetLabel } from '@/lib/finance';
import { type SupportedLocale } from '@/lib/i18n/config';
import { evaluateTelegramOrderRefundEligibility } from '@/lib/services/telegram-finance';
import { buildTelegramMenuCallbackData } from '@/lib/services/telegram-callbacks';
import { buildTelegramCommerceViewCallbackData } from '@/lib/services/telegram-callbacks';
import {
  getTelegramSalesSettings,
  resolveTelegramSalesPlan,
  resolveTelegramSalesPlanLabel,
  type TelegramSalesSettings,
  type TelegramSalesPlanCode,
} from '@/lib/services/telegram-sales';
import {
  buildTelegramCommerceCard,
  buildTelegramCommerceMessage,
  buildTelegramCommercePagerRow,
  paginateTelegramCommerce,
  truncateTelegramCommerceButtonLabel,
} from '@/lib/services/telegram-commerce-ui';
import {
  buildTelegramOrderTimelineChipRow,
  buildTelegramOrderNextStepText,
  escapeHtml,
  formatTelegramDateTime,
  formatTelegramDynamicPoolSummary,
  formatTelegramOrderKindLabel,
  formatTelegramOrderStateLine,
  formatTelegramOrderStatusIcon,
  formatTelegramOrderStatusLabel,
  formatTelegramRefundRequestStatusLabel,
  getFlagEmoji,
  getTelegramUi,
  normalizeTelegramOrderLookupCodes,
} from '@/lib/services/telegram-ui';
import { formatBytes } from '@/lib/utils';

type TelegramOrdersFilter = 'ALL' | 'ACTION' | 'REVIEW' | 'COMPLETED';

function buildTelegramOrdersCountsLine(input: {
  attentionCount: number;
  reviewCount: number;
  completedCount: number;
  totalCount: number;
}) {
  const segments = [
    input.attentionCount > 0 ? `${input.attentionCount} need action` : null,
    input.reviewCount > 0 ? `${input.reviewCount} under review` : null,
    input.completedCount > 0 ? `${input.completedCount} completed` : null,
  ].filter(Boolean) as string[];

  return segments.join(' • ') || `${input.totalCount} recent`;
}

function buildTelegramCompactOrderStateLine(order: TelegramUserOrder, ui: ReturnType<typeof getTelegramUi>) {
  const stateLine = formatTelegramOrderStateLine({
    orderCode: order.orderCode,
    planName: (order as TelegramUserOrder & { displayPlanLabel?: string | null }).displayPlanLabel || order.planName,
    planCode: order.planCode,
    durationMonths: order.durationMonths,
    durationDays: order.durationDays,
    requestedName: order.requestedName,
  });
  const duplicatedPrefix = `#${order.orderCode}`;
  const trimmedStateLine = stateLine.startsWith(duplicatedPrefix)
    ? stateLine.slice(duplicatedPrefix.length).replace(/^\s*•\s*/, '')
    : stateLine;

  return trimmedStateLine.trim() || formatTelegramOrderKindLabel(order.kind, ui);
}

function resolveTelegramOrderDisplayPlanLabel(
  order: {
    planCode?: string | null;
    planName?: string | null;
  },
  locale: SupportedLocale,
  settings: TelegramSalesSettings,
) {
  if (order.planCode) {
    const plan = resolveTelegramSalesPlan(settings, order.planCode as TelegramSalesPlanCode);
    if (plan) {
      return resolveTelegramSalesPlanLabel(plan, locale);
    }
  }

  return order.planName || order.planCode || null;
}

function normalizeTelegramOrderPlanLabels<T extends { planCode?: string | null; planName?: string | null }>(
  orders: T[],
  locale: SupportedLocale,
  settings: TelegramSalesSettings,
) {
  return orders.map((order) => ({
    ...order,
    displayPlanLabel: resolveTelegramOrderDisplayPlanLabel(order, locale, settings),
  }));
}

function parseTelegramOrdersFilter(argsText?: string | null): TelegramOrdersFilter {
  const normalized = argsText?.trim().toLowerCase() || '';
  switch (normalized) {
    case 'action':
    case 'attention':
    case 'pending':
      return 'ACTION';
    case 'review':
    case 'reviewing':
      return 'REVIEW';
    case 'completed':
    case 'done':
    case 'fulfilled':
      return 'COMPLETED';
    default:
      return 'ALL';
  }
}

function buildTelegramOrdersKeyboard(locale: SupportedLocale, filter: TelegramOrdersFilter) {
  const isMyanmar = locale === 'my';
  const option = (targetFilter: TelegramOrdersFilter, label: string) => ({
    text: filter === targetFilter ? `• ${label}` : label,
    callback_data: buildTelegramMenuCallbackData('orders', targetFilter.toLowerCase()),
  });

  return {
    inline_keyboard: [
      [
        option('ALL', isMyanmar ? 'အားလုံး' : 'All'),
        option('ACTION', isMyanmar ? 'လုပ်ဆောင်ရန်' : 'Need action'),
      ],
      [
        option('REVIEW', isMyanmar ? 'စစ်ဆေးနေ' : 'Under review'),
        option('COMPLETED', isMyanmar ? 'ပြီးဆုံး' : 'Completed'),
      ],
    ],
  };
}

function buildTelegramOrderListButtonLabel(input: {
  order: TelegramUserOrder;
  locale: SupportedLocale;
}) {
  const { order, locale } = input;
  const isMyanmar = locale === 'my';
  const action =
    order.status === 'AWAITING_PAYMENT_METHOD'
      ? isMyanmar ? 'Pay' : 'Pay'
      : order.status === 'AWAITING_PAYMENT_PROOF'
        ? isMyanmar ? 'Proof' : 'Proof'
        : order.status === 'PENDING_REVIEW' || order.status === 'APPROVED'
          ? isMyanmar ? 'Review' : 'Review'
          : order.status === 'FULFILLED'
            ? isMyanmar ? 'Done' : 'Done'
            : order.status === 'REJECTED'
              ? isMyanmar ? 'Retry' : 'Retry'
              : order.status === 'CANCELLED'
                ? isMyanmar ? 'Restart' : 'Restart'
                : isMyanmar ? 'Open' : 'Open';

  return `${formatTelegramOrderStatusIcon(order.status)} ${order.orderCode} • ${action}`;
}

function truncateTelegramOrderDetailText(value: string, maxLength = 140) {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength - 1)}…`;
}

async function resolveTelegramRenewalTargetLabel(input: {
  order: TelegramUserOrder;
  locale: SupportedLocale;
}) {
  if (input.order.targetAccessKeyId) {
    const accessKey = await db.accessKey.findUnique({
      where: { id: input.order.targetAccessKeyId },
      select: {
        name: true,
        server: {
          select: {
            name: true,
            countryCode: true,
          },
        },
      },
    });

    if (accessKey) {
      const serverLabel = accessKey.server
        ? `${accessKey.server.name}${accessKey.server.countryCode ? ` ${getFlagEmoji(accessKey.server.countryCode)}` : ''}`
        : null;
      return [accessKey.name, serverLabel].filter(Boolean).join(' • ');
    }

    return input.order.targetAccessKeyId;
  }

  if (input.order.targetDynamicKeyId) {
    const dynamicKey = await db.dynamicAccessKey.findUnique({
      where: { id: input.order.targetDynamicKeyId },
      select: {
        name: true,
      },
    });

    if (dynamicKey) {
      return input.locale === 'my'
        ? `${dynamicKey.name} • Premium`
        : `${dynamicKey.name} • Premium`;
    }

    return input.order.targetDynamicKeyId;
  }

  return null;
}

export function buildTelegramOrdersCommerceKeyboard(input: {
  locale: SupportedLocale;
  filter: TelegramOrdersFilter;
  orders: TelegramUserOrder[];
  page: number;
}) {
  const isMyanmar = input.locale === 'my';
  const pagination = paginateTelegramCommerce(input.orders, input.page);
  const option = (targetFilter: TelegramOrdersFilter, label: string) => ({
    text: input.filter === targetFilter ? `• ${label}` : label,
    callback_data: buildTelegramCommerceViewCallbackData(
      'orders',
      'filter',
      targetFilter.toLowerCase(),
      '1',
    ),
  });
  const rows: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [
    [
      option('ALL', isMyanmar ? 'အားလုံး' : 'All'),
      option('ACTION', isMyanmar ? 'လုပ်ဆောင်ရန်' : 'Need action'),
    ],
    [
      option('REVIEW', isMyanmar ? 'စစ်ဆေးနေ' : 'Under review'),
      option('COMPLETED', isMyanmar ? 'ပြီးဆုံး' : 'Completed'),
    ],
  ];

  for (const order of pagination.pageItems) {
    rows.push([{
      text: truncateTelegramCommerceButtonLabel(
        buildTelegramOrderListButtonLabel({
          order,
          locale: input.locale,
        }),
        36,
      ),
      callback_data: buildTelegramCommerceViewCallbackData(
        'orders',
        'detail',
        order.id,
        `${input.filter.toLowerCase()},${pagination.page}`,
      ),
    }]);
  }

  const pager = buildTelegramCommercePagerRow({
    locale: input.locale,
    section: 'orders',
    page: pagination.page,
    totalItems: input.orders.length,
    secondary: input.filter.toLowerCase(),
  });
  if (pager) {
    rows.push(pager);
  }

  return { inline_keyboard: rows };
}

export function buildTelegramOrdersSummaryMessage(input: {
  locale: SupportedLocale;
  filter: TelegramOrdersFilter;
  attentionOrders: TelegramUserOrder[];
  reviewOrders: TelegramUserOrder[];
  completedOrders: TelegramUserOrder[];
  filteredOrders: TelegramUserOrder[];
  page: number;
}) {
  const ui = getTelegramUi(input.locale);
  const pagination = paginateTelegramCommerce(input.filteredOrders, input.page);
  const cards = pagination.pageItems.map((order) =>
    buildTelegramCommerceCard(
      `${formatTelegramOrderStatusIcon(order.status)} <b>${escapeHtml(order.orderCode)}</b>`,
      [
        escapeHtml(buildTelegramCompactOrderStateLine(order, ui)),
        `${ui.statusLineLabel}: ${escapeHtml(formatTelegramOrderStatusLabel(order.status, ui))}`,
        buildTelegramOrderProgressSummary({ order, locale: input.locale }),
      ],
    ),
  );

  return buildTelegramCommerceMessage({
    title: ui.ordersTitle,
    statsLine: buildTelegramOrdersCountsLine({
      attentionCount: input.attentionOrders.length,
      reviewCount: input.reviewOrders.length,
      completedCount: input.completedOrders.length,
      totalCount: input.filteredOrders.length,
    }),
    intro:
      input.locale === 'my'
        ? 'Filter ကိုပြောင်းပြီး Open ကိုနှိပ်ကာ detail card ကိုဖွင့်နိုင်သည်။'
        : 'Use filters, then tap Open for the detail card.',
    cards: cards.length
      ? cards
      : [
          input.filter === 'ACTION'
            ? input.locale === 'my'
              ? '📭 လက်ရှိလုပ်ဆောင်ရန်လိုသော order မရှိသေးပါ။'
              : '📭 There are no orders that need action right now.'
            : input.filter === 'REVIEW'
              ? input.locale === 'my'
                ? '📭 လက်ရှိ review စောင့်နေသော order မရှိသေးပါ။'
                : '📭 There are no orders under review right now.'
              : input.filter === 'COMPLETED'
                ? input.locale === 'my'
                  ? '📭 လတ်တလော completed order မရှိသေးပါ။'
                  : '📭 There are no completed orders yet.'
                : input.locale === 'my'
                  ? '📭 Recent order မရှိသေးပါ။'
                  : '📭 There are no recent orders yet.',
        ],
  });
}

function buildTelegramOrderProgressSummary(input: {
  order: {
    status: string;
  };
  locale: SupportedLocale;
}) {
  const status = input.order.status;
  const isMyanmar = input.locale === 'my';
  if (status === 'FULFILLED') {
    return isMyanmar ? 'Step 4/4 • Delivered' : 'Step 4/4 • Delivered';
  }
  if (status === 'PENDING_REVIEW' || status === 'APPROVED') {
    return isMyanmar ? 'Step 4/4 • Admin review' : 'Step 4/4 • Admin review';
  }
  if (status === 'AWAITING_PAYMENT_PROOF') {
    return isMyanmar ? 'Step 3/4 • Upload screenshot' : 'Step 3/4 • Upload screenshot';
  }
  if (status === 'AWAITING_PAYMENT_METHOD') {
    return isMyanmar ? 'Step 2/4 • Choose payment method' : 'Step 2/4 • Choose payment method';
  }
  if (
    status === 'AWAITING_KEY_SELECTION'
    || status === 'AWAITING_PLAN'
    || status === 'AWAITING_MONTHS'
    || status === 'AWAITING_SERVER_SELECTION'
  ) {
    return isMyanmar ? 'Step 1/4 • Setup' : 'Step 1/4 • Setup';
  }
  if (status === 'REJECTED' || status === 'CANCELLED') {
    return isMyanmar ? 'Flow ended • restart available' : 'Flow ended • restart available';
  }
  return null;
}

export async function listTelegramOrdersForUser(
  chatId: number,
  telegramUserId: number,
  limit = 5,
) {
  return db.telegramOrder.findMany({
    where: {
      OR: [{ telegramChatId: String(chatId) }, { telegramUserId: String(telegramUserId) }],
    },
    orderBy: [{ createdAt: 'desc' }],
    take: limit,
  });
}

export async function findTelegramOrderForUser(input: {
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

export type TelegramUserOrder = NonNullable<Awaited<ReturnType<typeof findTelegramOrderForUser>>>;

export async function listRefundEligibleTelegramOrders(
  chatId: number,
  telegramUserId: number,
  limit = 3,
) {
  const orders = await db.telegramOrder.findMany({
    where: {
      OR: [{ telegramChatId: String(chatId) }, { telegramUserId: String(telegramUserId) }],
      status: 'FULFILLED',
      priceAmount: { gt: 0 },
    },
    orderBy: [{ fulfilledAt: 'desc' }, { createdAt: 'desc' }],
    take: Math.max(limit * 4, 12),
  });

  const evaluated = await Promise.all(
    orders.map(async (order) => ({
      order,
      refundEligibility: await evaluateTelegramOrderRefundEligibility(order),
    })),
  );

  return evaluated
    .filter(
      ({ order, refundEligibility }) =>
        refundEligibility.eligible &&
        !order.refundRequestStatus &&
        order.financeStatus !== 'REFUNDED',
    )
    .slice(0, limit);
}

export async function listRecentTelegramRefundRequests(
  chatId: number,
  telegramUserId: number,
  limit = 5,
) {
  return db.telegramOrder.findMany({
    where: {
      OR: [{ telegramChatId: String(chatId) }, { telegramUserId: String(telegramUserId) }],
      refundRequestStatus: { in: ['PENDING', 'APPROVED', 'REJECTED'] },
    },
    orderBy: [{ refundRequestedAt: 'desc' }, { createdAt: 'desc' }],
    take: limit,
  });
}

export async function buildTelegramOrderStatusMessage(input: {
  order: TelegramUserOrder;
  locale: SupportedLocale;
  ensureAccessKeySubscriptionToken: (
    accessKeyId: string,
    existingToken?: string | null,
  ) => Promise<string>;
  getDynamicKeyMessagingUrls: (
    dynamicKey: {
      publicSlug?: string | null;
      dynamicUrl?: string | null;
      sharePageEnabled?: boolean | null;
      type?: string | null;
      preferredServerIdsJson?: string | null;
      preferredCountryCodesJson?: string | null;
      accessKeys: Array<{ server?: { name: string; countryCode?: string | null } | null }>;
    },
    source: string,
    locale: SupportedLocale,
  ) => {
    sharePageUrl: string | null;
    subscriptionUrl: string | null;
    outlineClientUrl: string | null;
  };
}) {
  const order = input.order;
  if (!order) {
    return null;
  }

  const locale = input.locale;
  const ui = getTelegramUi(locale);
  const isMyanmar = locale === 'my';
  const settings = await getTelegramSalesSettings();
  const displayPlanLabel = resolveTelegramOrderDisplayPlanLabel(order, locale, settings);
  const statusIcon = formatTelegramOrderStatusIcon(order.status);
  const nextStep = buildTelegramOrderNextStepText(order, ui);
  const stateLine = buildTelegramCompactOrderStateLine(
    { ...order, displayPlanLabel } as TelegramUserOrder & { displayPlanLabel?: string | null },
    ui,
  );
  const progressSummary = buildTelegramOrderProgressSummary({ order, locale });
  const detailLines: string[] = [];
  const paymentLines: string[] = [];
  const footerLines: string[] = [];
  const noteLines: string[] = [];

  if (displayPlanLabel) {
    detailLines.push(`${ui.planLabel}: <b>${escapeHtml(displayPlanLabel)}</b>`);
  }

  const durationLabel = order.durationMonths
    ? locale === 'my'
      ? `${order.durationMonths} လ`
      : `${order.durationMonths} month${order.durationMonths === 1 ? '' : 's'}`
    : order.durationDays
      ? locale === 'my'
        ? `${order.durationDays} ရက်`
        : `${order.durationDays} day${order.durationDays === 1 ? '' : 's'}`
      : null;
  const requestLineSegments = [
    order.priceLabel ? `${ui.priceLabel}: ${escapeHtml(order.priceLabel)}` : null,
    durationLabel ? `${ui.durationLabel}: ${escapeHtml(durationLabel)}` : null,
    order.requestedName ? `${ui.requestedNameLabel}: <b>${escapeHtml(order.requestedName)}</b>` : null,
  ].filter(Boolean) as string[];
  if (requestLineSegments.length > 0) {
    detailLines.push(requestLineSegments.join(' • '));
  }

  if (order.selectedServerName) {
    const flag = order.selectedServerCountryCode
      ? ` ${getFlagEmoji(order.selectedServerCountryCode)}`
      : '';
    const serverLineSegments = [
      `${ui.preferredServerLabel}: <b>${escapeHtml(order.selectedServerName)}${flag}</b>`,
      order.referralCode
        ? `${isMyanmar ? 'Referral' : 'Referral'}: <b>${escapeHtml(order.referralCode)}</b>`
        : null,
    ].filter(Boolean) as string[];
    detailLines.push(serverLineSegments.join(' • '));
  }

  if (order.kind === 'RENEW') {
    const renewalTargetLabel = await resolveTelegramRenewalTargetLabel({ order, locale });
    if (renewalTargetLabel) {
      detailLines.push(`${ui.renewalTargetLabel}: <b>${escapeHtml(renewalTargetLabel)}</b>`);
    }
  }

  if (order.orderMode === 'GIFT' && order.giftRecipientLabel) {
    detailLines.push(`${isMyanmar ? 'Gift for' : 'Gift for'}: <b>${escapeHtml(order.giftRecipientLabel)}</b>`);
  }

  if (order.requestedEmail) {
    detailLines.push(`${ui.emailLabel}: <code>${escapeHtml(order.requestedEmail)}</code>`);
  }

  const paymentSummarySegments = [
    `${ui.createdAtLabel}: ${escapeHtml(formatTelegramDateTime(order.createdAt, locale))}`,
    order.paymentMethodLabel
      ? `${ui.paymentMethodLabel}: <b>${escapeHtml(order.paymentMethodLabel)}</b>`
      : null,
  ].filter(Boolean) as string[];
  paymentLines.push(paymentSummarySegments.join(' • '));

  const reviewTimelineSegments = [
    order.paymentSubmittedAt
      ? `${ui.paymentSubmittedLabel}: ${escapeHtml(
          formatTelegramDateTime(order.paymentSubmittedAt, locale),
        )}`
      : null,
    order.reviewedAt
      ? `${ui.reviewedAtLabel}: ${escapeHtml(formatTelegramDateTime(order.reviewedAt, locale))}`
      : null,
    order.fulfilledAt
      ? `${ui.fulfilledAtLabel}: ${escapeHtml(formatTelegramDateTime(order.fulfilledAt, locale))}`
      : order.rejectedAt
        ? `${ui.rejectedAtLabel}: ${escapeHtml(formatTelegramDateTime(order.rejectedAt, locale))}`
        : null,
  ].filter(Boolean) as string[];
  if (reviewTimelineSegments.length > 0) {
    paymentLines.push(reviewTimelineSegments.join(' • '));
  }

  const refundSegments = [
    order.refundRequestStatus
      ? `${ui.refundRequestStatusLabel}: <b>${escapeHtml(
          formatTelegramRefundRequestStatusLabel(order.refundRequestStatus, ui),
        )}</b>`
      : null,
    order.refundRequestedAt
      ? `${ui.refundRequestedAtLabel}: ${escapeHtml(
          formatTelegramDateTime(order.refundRequestedAt, locale),
        )}`
      : null,
    order.refundRequestReviewedAt
      ? `${ui.refundReviewedAtLabel}: ${escapeHtml(
          formatTelegramDateTime(order.refundRequestReviewedAt, locale),
        )}`
      : null,
  ].filter(Boolean) as string[];
  if (refundSegments.length > 0) {
    paymentLines.push(refundSegments.join(' • '));
  }

  if (order.refundReviewReasonCode) {
    paymentLines.push(
      `${ui.refundReasonLabel}: ${escapeHtml(
        resolveRefundReasonPresetLabel(order.refundReviewReasonCode) || order.refundReviewReasonCode,
      )}`,
    );
  }

  if (order.refundRequestStatus === 'PENDING') {
    footerLines.push(escapeHtml(ui.refundPendingHelp));
  } else if (order.refundRequestStatus === 'APPROVED') {
    footerLines.push(escapeHtml(ui.refundApprovedHelp));
  } else if (order.refundRequestStatus === 'REJECTED') {
    footerLines.push(escapeHtml(ui.refundRejectedHelp));
  }

  const cards = [
      buildTelegramCommerceCard(
        '📌 <b>Current status</b>',
        [
          [
            `${ui.statusLineLabel}: <b>${escapeHtml(formatTelegramOrderStatusLabel(order.status, ui))}</b>`,
            progressSummary ? escapeHtml(progressSummary) : null,
          ].filter(Boolean).join(' • '),
          stateLine ? escapeHtml(stateLine) : null,
          nextStep ? `${ui.orderNextStepLabel}: ${escapeHtml(nextStep)}` : null,
          buildTelegramOrderTimelineChipRow({ order }),
        ],
      ),
  ];

  if (detailLines.length > 0) {
    cards.push(
      buildTelegramCommerceCard(
        '📦 <b>Order detail</b>',
        detailLines,
      ),
    );
  }

  if (paymentLines.length > 0) {
    cards.push(
      buildTelegramCommerceCard(
        '💳 <b>Payment & review</b>',
        paymentLines,
      ),
    );
  }

  if (order.customerMessage?.trim()) {
    noteLines.push(
      `${input.locale === 'my' ? 'Order note' : 'Order note'}: ${escapeHtml(
        truncateTelegramOrderDetailText(order.customerMessage),
      )}`,
    );
  }

  if (order.refundRequestCustomerMessage?.trim()) {
    noteLines.push(
      `${input.locale === 'my' ? 'Refund note' : 'Refund note'}: ${escapeHtml(
        truncateTelegramOrderDetailText(order.refundRequestCustomerMessage),
      )}`,
    );
  }

  if (noteLines.length > 0) {
    cards.push(buildTelegramCommerceCard('📝 <b>Notes</b>', noteLines));
  }

  const relatedAccessKeyId = order.approvedAccessKeyId || order.targetAccessKeyId;
  if (relatedAccessKeyId) {
    const key = await db.accessKey.findUnique({
      where: { id: relatedAccessKeyId },
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
      cards.push(
        buildTelegramCommerceCard(
          '🔗 <b>Delivered access</b>',
          [
            `${ui.deliveredKeyLabel}: <b>${escapeHtml(key.name)}</b>`,
            escapeHtml(
              key.sharePageEnabled
                ? input.locale === 'my'
                  ? 'Open, renew, and receipt actions stay in the buttons below.'
                  : 'Open, renew, and receipt actions stay in the buttons below.'
                : input.locale === 'my'
                  ? 'Renew, receipt, and support actions stay in the buttons below.'
                  : 'Renew, receipt, and support actions stay in the buttons below.',
            ),
          ],
        ),
      );
    }
  }

  const relatedDynamicKeyId = order.approvedDynamicKeyId || order.targetDynamicKeyId;
  if (relatedDynamicKeyId) {
    const dynamicKey = await db.dynamicAccessKey.findUnique({
      where: { id: relatedDynamicKeyId },
      select: {
        id: true,
        name: true,
        publicSlug: true,
        dynamicUrl: true,
        sharePageEnabled: true,
        type: true,
        preferredServerIdsJson: true,
        preferredCountryCodesJson: true,
        accessKeys: {
          select: {
            server: {
              select: {
                name: true,
                countryCode: true,
              },
            },
          },
        },
      },
    });

    if (dynamicKey) {
      const poolSummary = formatTelegramDynamicPoolSummary(dynamicKey, ui);
      cards.push(
        buildTelegramCommerceCard(
          '🔗 <b>Delivered access</b>',
          [
            `${ui.deliveredKeyLabel}: <b>${escapeHtml(dynamicKey.name)}</b>`,
            `💎 ${ui.planLabel}: <b>${escapeHtml(ui.premiumLabel)}</b>`,
            `🧭 ${escapeHtml(poolSummary)}`,
            escapeHtml(
              dynamicKey.sharePageEnabled
                ? input.locale === 'my'
                  ? 'Open, renew, region, and support actions stay in the buttons below.'
                  : 'Open, renew, region, and support actions stay in the buttons below.'
                : input.locale === 'my'
                  ? 'Renew, region, and support actions stay in the buttons below.'
                  : 'Renew, region, and support actions stay in the buttons below.',
            ),
          ],
        ),
      );
    }
  }

  if (order.status === 'AWAITING_PAYMENT_PROOF' || order.status === 'PENDING_REVIEW') {
    footerLines.push(ui.orderSupportHint);
  }

  return buildTelegramCommerceMessage({
    title: `${ui.orderStatusTitle.replace('</b>', ` · ${escapeHtml(order.orderCode)}</b>`)} • ${statusIcon} ${escapeHtml(
      formatTelegramOrderKindLabel(order.kind, ui),
    )}`,
    cards,
    footerLines,
  });
}

export async function handleOrdersCommand(input: {
  chatId: number;
  telegramUserId: number;
  locale: SupportedLocale;
  botToken: string;
  argsText?: string;
  sendTelegramMessage: (
    botToken: string,
    chatId: number | string,
    text: string,
    options?: {
      parseMode?: 'HTML' | 'Markdown';
      replyMarkup?: Record<string, unknown>;
      disableWebPagePreview?: boolean;
    },
  ) => Promise<boolean>;
  sendTelegramOrderStatusCard: (input: {
    botToken: string;
    chatId: number;
    order: TelegramUserOrder;
    locale: SupportedLocale;
    appendLatestHint?: boolean;
  }) => Promise<boolean>;
}) {
  const ui = getTelegramUi(input.locale);
  const filter = parseTelegramOrdersFilter(input.argsText);
  const orders = await listTelegramOrdersForUser(input.chatId, input.telegramUserId, 6);
  if (!orders.length) {
    return ui.ordersEmpty;
  }

  const attentionOrders = orders.filter((order) =>
    [
      'AWAITING_KEY_SELECTION',
      'AWAITING_PLAN',
      'AWAITING_MONTHS',
      'AWAITING_SERVER_SELECTION',
      'AWAITING_PAYMENT_METHOD',
      'AWAITING_PAYMENT_PROOF',
      'REJECTED',
      'CANCELLED',
    ].includes(order.status),
  );
  const reviewOrders = orders.filter((order) => ['PENDING_REVIEW', 'APPROVED'].includes(order.status));
  const completedOrders = orders.filter((order) => order.status === 'FULFILLED');
  const filteredOrders =
    filter === 'ACTION'
      ? attentionOrders
      : filter === 'REVIEW'
        ? reviewOrders
        : filter === 'COMPLETED'
          ? completedOrders
          : orders;
  const salesSettings = await getTelegramSalesSettings();
  const [normalizedAttentionOrders, normalizedReviewOrders, normalizedCompletedOrders, normalizedFilteredOrders] =
    [
      normalizeTelegramOrderPlanLabels(attentionOrders, input.locale, salesSettings),
      normalizeTelegramOrderPlanLabels(reviewOrders, input.locale, salesSettings),
      normalizeTelegramOrderPlanLabels(completedOrders, input.locale, salesSettings),
      normalizeTelegramOrderPlanLabels(filteredOrders, input.locale, salesSettings),
    ];
  const summaryMessage = buildTelegramOrdersSummaryMessage({
    locale: input.locale,
    filter,
    attentionOrders: normalizedAttentionOrders as TelegramUserOrder[],
    reviewOrders: normalizedReviewOrders as TelegramUserOrder[],
    completedOrders: normalizedCompletedOrders as TelegramUserOrder[],
    filteredOrders: normalizedFilteredOrders as TelegramUserOrder[],
    page: 1,
  });
  const sentSummary = await input.sendTelegramMessage(input.botToken, input.chatId, summaryMessage, {
    replyMarkup: buildTelegramOrdersCommerceKeyboard({
      locale: input.locale,
      filter,
      orders: normalizedFilteredOrders as TelegramUserOrder[],
      page: 1,
    }),
  });

  return sentSummary ? null : summaryMessage;
}

export async function handleTelegramOrdersCommerceView(input: {
  chatId: number;
  telegramUserId: number;
  locale: SupportedLocale;
  botToken: string;
  action: 'home' | 'page' | 'detail' | 'filter';
  primary?: string | null;
  secondary?: string | null;
  sendTelegramMessage: (
    botToken: string,
    chatId: number | string,
    text: string,
    options?: {
      parseMode?: 'HTML' | 'Markdown';
      replyMarkup?: Record<string, unknown>;
      disableWebPagePreview?: boolean;
    },
  ) => Promise<boolean>;
  sendTelegramOrderStatusCard: (input: {
    botToken: string;
    chatId: number;
    order: TelegramUserOrder;
    locale: SupportedLocale;
    appendLatestHint?: boolean;
  }) => Promise<boolean>;
}) {
  const ui = getTelegramUi(input.locale);
  const orders = await listTelegramOrdersForUser(input.chatId, input.telegramUserId, 12);
  if (!orders.length) {
    return ui.ordersEmpty;
  }

  const filter =
    input.action === 'filter'
      ? parseTelegramOrdersFilter(input.primary)
      : parseTelegramOrdersFilter(input.secondary);
  const pageSeed =
    input.action === 'filter'
      ? input.secondary
      : input.action === 'detail'
        ? input.secondary?.split(',')[1]
        : input.primary;
  const page = Number.parseInt(pageSeed || '1', 10) || 1;
  const attentionOrders = orders.filter((order) =>
    [
      'AWAITING_KEY_SELECTION',
      'AWAITING_PLAN',
      'AWAITING_MONTHS',
      'AWAITING_SERVER_SELECTION',
      'AWAITING_PAYMENT_METHOD',
      'AWAITING_PAYMENT_PROOF',
      'REJECTED',
      'CANCELLED',
    ].includes(order.status),
  );
  const reviewOrders = orders.filter((order) => ['PENDING_REVIEW', 'APPROVED'].includes(order.status));
  const completedOrders = orders.filter((order) => order.status === 'FULFILLED');
  const filteredOrders =
    filter === 'ACTION'
      ? attentionOrders
      : filter === 'REVIEW'
        ? reviewOrders
        : filter === 'COMPLETED'
          ? completedOrders
          : orders;
  const salesSettings = await getTelegramSalesSettings();
  const [normalizedAttentionOrders, normalizedReviewOrders, normalizedCompletedOrders, normalizedFilteredOrders] =
    [
      normalizeTelegramOrderPlanLabels(attentionOrders, input.locale, salesSettings),
      normalizeTelegramOrderPlanLabels(reviewOrders, input.locale, salesSettings),
      normalizeTelegramOrderPlanLabels(completedOrders, input.locale, salesSettings),
      normalizeTelegramOrderPlanLabels(filteredOrders, input.locale, salesSettings),
    ];

  if (input.action === 'detail') {
    const order = orders.find((candidate) => candidate.id === input.primary);
    if (!order) {
      return ui.orderStatusLatestNotFound;
    }
    await input.sendTelegramOrderStatusCard({
      botToken: input.botToken,
      chatId: input.chatId,
      order,
      locale: input.locale,
    });
    return null;
  }

  const message = buildTelegramOrdersSummaryMessage({
    locale: input.locale,
    filter,
    attentionOrders: normalizedAttentionOrders as TelegramUserOrder[],
    reviewOrders: normalizedReviewOrders as TelegramUserOrder[],
    completedOrders: normalizedCompletedOrders as TelegramUserOrder[],
    filteredOrders: normalizedFilteredOrders as TelegramUserOrder[],
    page,
  });
  const sent = await input.sendTelegramMessage(input.botToken, input.chatId, message, {
    replyMarkup: buildTelegramOrdersCommerceKeyboard({
      locale: input.locale,
      filter,
      orders: normalizedFilteredOrders as TelegramUserOrder[],
      page,
    }),
  });
  return sent ? null : message;
}

export async function handleOrderStatusCommand(input: {
  chatId: number;
  telegramUserId: number;
  argsText: string;
  locale: SupportedLocale;
  botToken: string;
  sendTelegramMessage: (
    botToken: string,
    chatId: number | string,
    text: string,
    options?: {
      parseMode?: 'HTML' | 'Markdown';
      replyMarkup?: Record<string, unknown>;
      disableWebPagePreview?: boolean;
    },
  ) => Promise<boolean>;
  buildTelegramOrderStatusReplyMarkup: (input: {
    order: TelegramUserOrder;
    locale: SupportedLocale;
  }) => Promise<Record<string, unknown> | undefined>;
  buildTelegramOrderStatusMessage: (input: {
    order: TelegramUserOrder;
    locale: SupportedLocale;
  }) => Promise<string | null>;
}) {
  const ui = getTelegramUi(input.locale);
  const lookupCode = input.argsText.trim();
  const order = await findTelegramOrderForUser({
    chatId: input.chatId,
    telegramUserId: input.telegramUserId,
    lookupCode: lookupCode || undefined,
  });

  if (!order) {
    return lookupCode
      ? ui.orderStatusNotFound(escapeHtml(lookupCode))
      : ui.orderStatusLatestNotFound;
  }

  const message = await input.buildTelegramOrderStatusMessage({
    order,
    locale: input.locale,
  });

  if (!message) {
    return lookupCode
      ? ui.orderStatusNotFound(escapeHtml(lookupCode))
      : ui.orderStatusLatestNotFound;
  }

  const text = lookupCode ? message : `${message}\n\n${ui.latestOrderHint}`;
  const replyMarkup = await input.buildTelegramOrderStatusReplyMarkup({
    order,
    locale: input.locale,
  });
  const sent = await input.sendTelegramMessage(input.botToken, input.chatId, text, {
    replyMarkup,
  });

  return sent ? null : text;
}

export async function handleRefundCommand(input: {
  chatId: number;
  telegramUserId: number;
  locale: SupportedLocale;
  botToken: string;
  sendTelegramMessage: (
    botToken: string,
    chatId: number | string,
    text: string,
  ) => Promise<boolean>;
  sendTelegramOrderStatusCard: (input: {
    botToken: string;
    chatId: number;
    order: TelegramUserOrder;
    locale: SupportedLocale;
    appendLatestHint?: boolean;
  }) => Promise<boolean>;
}) {
  const ui = getTelegramUi(input.locale);
  const [refundableOrders, recentRefundRequests] = await Promise.all([
    listRefundEligibleTelegramOrders(input.chatId, input.telegramUserId, 3),
    listRecentTelegramRefundRequests(input.chatId, input.telegramUserId, 5),
  ]);

  if (refundableOrders.length === 0 && recentRefundRequests.length === 0) {
    return [ui.refundNoEligibleOrders, '', ui.refundPolicySummary].join('\n');
  }
  const summaryMessage = buildTelegramRefundSummaryMessage({
    locale: input.locale,
    recentRefundRequests,
    refundableOrders,
  });
  const sentSummary = await input.sendTelegramMessage(
    input.botToken,
    input.chatId,
    summaryMessage,
  );

  for (const { order } of refundableOrders) {
    await input.sendTelegramOrderStatusCard({
      botToken: input.botToken,
      chatId: input.chatId,
      order,
      locale: input.locale,
    });
  }

  return sentSummary ? null : summaryMessage;
}

export function buildTelegramRefundSummaryMessage(input: {
  locale: SupportedLocale;
  recentRefundRequests: Array<TelegramUserOrder>;
  refundableOrders: Array<{
    order: TelegramUserOrder;
    refundEligibility: {
      usedBytes: bigint | number;
    };
  }>;
}) {
  const ui = getTelegramUi(input.locale);
  const cards: string[] = [];

  if (input.recentRefundRequests.length > 0) {
    cards.push(
      buildTelegramCommerceCard(
        '💸 <b>Recent refund status</b>',
        input.recentRefundRequests.slice(0, 3).map((order) => {
          const details = [
            `<b>${escapeHtml(order.orderCode)}</b>`,
            escapeHtml(formatTelegramRefundRequestStatusLabel(order.refundRequestStatus || 'PENDING', ui)),
            order.refundRequestedAt
              ? escapeHtml(formatTelegramDateTime(order.refundRequestedAt, input.locale))
              : null,
            order.refundReviewReasonCode
              ? escapeHtml(
                  resolveRefundReasonPresetLabel(order.refundReviewReasonCode) ||
                    order.refundReviewReasonCode,
                )
              : null,
          ].filter(Boolean) as string[];
          return details.join(' • ');
        }),
      ),
    );
  }

  if (input.refundableOrders.length > 0) {
    cards.push(
      buildTelegramCommerceCard(
        '🧾 <b>Eligible now</b>',
        input.refundableOrders.slice(0, 3).map(({ order, refundEligibility }, index) =>
          `${index + 1}. ${escapeHtml(buildTelegramCompactOrderStateLine(order, ui))} • ${escapeHtml(
            formatBytes(refundEligibility.usedBytes),
          )}`,
        ),
      ),
    );
  }

  return buildTelegramCommerceMessage({
    title: ui.refundCenterTitle,
    statsLine: `${input.recentRefundRequests.length} recent • ${input.refundableOrders.length} eligible`,
    intro:
      input.locale === 'my'
        ? 'Refund summary ကို အတိုချုံးပြထားသည်။ Refund လုပ်နိုင်သော order card များကို အောက်တွင် ဆက်ပို့ပါမည်။'
        : 'This refund summary stays short. Eligible order cards are sent below.',
    cards,
    footerLines: [
      ui.refundPolicySummary,
      input.refundableOrders.length > 0 ? ui.refundEligibleOrdersHint : null,
    ],
  });
}
