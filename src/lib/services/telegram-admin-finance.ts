import { writeAuditLog } from '@/lib/audit';
import { db } from '@/lib/db';
import { type SupportedLocale } from '@/lib/i18n/config';
import { getFinanceControls, runTelegramFinanceDigestCycle } from '@/lib/services/telegram-finance';
import {
  buildTelegramAdminRefundCallbackData,
  buildTelegramMenuCallbackData,
  type TelegramAdminRefundAction,
} from '@/lib/services/telegram-callbacks';
import { buildTelegramOrderPanelUrl } from '@/lib/services/telegram-panel-links';
import { sendTelegramMessage } from '@/lib/services/telegram-runtime';
import { escapeHtml, formatTelegramDateTime } from '@/lib/services/telegram-ui';
import { type TelegramAdminActor } from '@/lib/services/telegram-admin-core';

function formatTelegramAdminMoneyMap(entries: Map<string, number>) {
  if (entries.size === 0) {
    return '0';
  }

  return Array.from(entries.entries())
    .map(([currency, amount]) => `${amount.toLocaleString()} ${currency}`)
    .join(' • ');
}

async function getTelegramRefundQueueSnapshot(input?: { limit?: number }) {
  const where = { refundRequestStatus: 'PENDING' } as const;
  const [orders, totalPending, unclaimed] = await Promise.all([
    db.telegramOrder.findMany({
      where,
      select: {
        id: true,
        orderCode: true,
        kind: true,
        status: true,
        planName: true,
        requestedEmail: true,
        telegramUsername: true,
        telegramUserId: true,
        priceAmount: true,
        priceCurrency: true,
        paymentMethodLabel: true,
        refundRequestedAt: true,
        refundRequestMessage: true,
        financeStatus: true,
        refundAssignedReviewerUserId: true,
        refundAssignedReviewerEmail: true,
      },
      orderBy: [{ refundRequestedAt: 'asc' }, { createdAt: 'asc' }],
      take: input?.limit ?? 1,
    }),
    db.telegramOrder.count({ where }),
    db.telegramOrder.count({
      where: {
        ...where,
        refundAssignedReviewerUserId: null,
      },
    }),
  ]);

  return {
    orders,
    totalPending,
    unclaimed,
    claimed: Math.max(0, totalPending - unclaimed),
  };
}

type TelegramRefundQueueOrder =
  Awaited<ReturnType<typeof getTelegramRefundQueueSnapshot>>['orders'][number];

function formatTelegramRefundAmount(order: TelegramRefundQueueOrder) {
  const currency = (order.priceCurrency || 'MMK').trim().toUpperCase();
  if (!order.priceAmount) {
    return `0 ${currency}`;
  }

  return `${order.priceAmount.toLocaleString('en-US')} ${currency === 'MMK' ? 'Kyat' : currency}`;
}

function compactTelegramRefundText(value?: string | null, maxLength = 96) {
  const normalized = (value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return null;
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
}

function formatTelegramRefundKindLabel(order: TelegramRefundQueueOrder, locale: SupportedLocale) {
  const isMyanmar = locale === 'my';
  if (order.kind === 'RENEW') {
    return isMyanmar ? 'Renewal' : 'Renewal';
  }
  return isMyanmar ? 'New order' : 'New order';
}

function buildTelegramRefundCustomerSummary(order: TelegramRefundQueueOrder) {
  return order.requestedEmail || order.telegramUsername || order.telegramUserId || 'Unknown customer';
}

export function buildTelegramRefundQueueSummaryMessage(input: {
  locale: SupportedLocale;
  totalPending: number;
  unclaimed: number;
  claimed: number;
  hasItems: boolean;
}) {
  const isMyanmar = input.locale === 'my';
  return [
    isMyanmar ? '💸 <b>Refund စစ်ရန်</b>' : '💸 <b>Refund queue</b>',
    isMyanmar
      ? `${input.totalPending} ခု စောင့်နေ • ${input.unclaimed} ခု မယူရသေး • ${input.claimed} ခု ယူထားပြီး`
      : `${input.totalPending} pending • ${input.unclaimed} unclaimed • ${input.claimed} claimed`,
    input.hasItems
      ? isMyanmar
        ? 'နောက် refund ကို အောက်တွင် ဖွင့်ထားပါသည်။'
        : 'Opening the next refund below.'
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildTelegramRefundQueueSummaryKeyboard(input: {
  locale: SupportedLocale;
}) {
  const isMyanmar = input.locale === 'my';
  return {
    inline_keyboard: [
      [
        {
          text: isMyanmar ? '🔄 ပြန်စစ်' : '🔄 Refresh',
          callback_data: buildTelegramMenuCallbackData('admin', 'refunds'),
        },
        {
          text: isMyanmar ? '📋 Review များ' : '📋 Reviews',
          callback_data: buildTelegramMenuCallbackData('admin', 'reviewqueue'),
        },
        {
          text: isMyanmar ? '💼 Finance' : '💼 Finance',
          callback_data: buildTelegramMenuCallbackData('admin', 'finance'),
        },
      ],
      [
        {
          text: isMyanmar ? '🧭 Admin စင်တာ' : '🧭 Admin home',
          callback_data: buildTelegramMenuCallbackData('admin', 'home'),
        },
      ],
    ],
  };
}

export function buildTelegramRefundQueueCardMessage(input: {
  locale: SupportedLocale;
  order: TelegramRefundQueueOrder;
}) {
  const { locale, order } = input;
  const isMyanmar = locale === 'my';
  const customer = order.requestedEmail || order.telegramUsername || order.telegramUserId || 'Unknown customer';
  const claimLine = order.refundAssignedReviewerEmail
    ? `🧷 <b>${isMyanmar ? 'ယူထားသူ' : 'Claimed by'}:</b> ${escapeHtml(order.refundAssignedReviewerEmail)}`
    : `🧷 <b>${isMyanmar ? 'မယူရသေး' : 'Unclaimed'}</b>`;
  const reason = compactTelegramRefundText(order.refundRequestMessage);

  return [
    isMyanmar ? '💸 <b>Refund တောင်းဆိုချက်</b>' : '💸 <b>Refund request</b>',
    `🧾 <b>${escapeHtml(order.orderCode)}</b> • ${escapeHtml(formatTelegramRefundAmount(order))}`,
    `👤 <b>${escapeHtml(customer)}</b> • <code>${escapeHtml(order.telegramUserId)}</code>`,
    order.refundRequestedAt ? `🕒 ${escapeHtml(formatTelegramDateTime(order.refundRequestedAt, locale))}` : '',
    claimLine,
    reason ? `${isMyanmar ? 'အကြောင်းရင်း' : 'Reason'}: ${escapeHtml(reason)}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildTelegramRefundQueueCardKeyboard(input: {
  locale: SupportedLocale;
  orderId: string;
  panelUrl: string;
  claimed?: boolean;
  includeDetail?: boolean;
}) {
  const isMyanmar = input.locale === 'my';
  const includeDetail = input.includeDetail ?? true;
  return {
    inline_keyboard: [
      includeDetail
        ? [
            {
              text: input.claimed
                ? isMyanmar ? '🧷 ယူထားပြီး' : '🧷 Claimed'
                : isMyanmar ? '🧷 ယူမည်' : '🧷 Claim',
              callback_data: buildTelegramAdminRefundCallbackData('claim', input.orderId),
            },
            {
              text: isMyanmar ? 'ℹ️ အသေးစိတ်' : 'ℹ️ Detail',
              callback_data: buildTelegramAdminRefundCallbackData('detail', input.orderId),
            },
            {
              text: isMyanmar ? '🧾 Dashboard' : '🧾 Panel',
              url: input.panelUrl,
            },
          ]
        : [
            {
              text: input.claimed
                ? isMyanmar ? '🧷 ယူထားပြီး' : '🧷 Claimed'
                : isMyanmar ? '🧷 ယူမည်' : '🧷 Claim',
              callback_data: buildTelegramAdminRefundCallbackData('claim', input.orderId),
            },
            {
              text: isMyanmar ? '⬅️ ယခင်' : '⬅️ Prev',
              callback_data: buildTelegramAdminRefundCallbackData('prev', input.orderId),
            },
            {
              text: isMyanmar ? '➡️ နောက်' : '➡️ Next',
              callback_data: buildTelegramAdminRefundCallbackData('next', input.orderId),
            },
          ],
      includeDetail
        ? [
            {
              text: isMyanmar ? '⬅️ ယခင်' : '⬅️ Prev',
              callback_data: buildTelegramAdminRefundCallbackData('prev', input.orderId),
            },
            {
              text: isMyanmar ? '➡️ နောက်' : '➡️ Next',
              callback_data: buildTelegramAdminRefundCallbackData('next', input.orderId),
            },
            {
              text: isMyanmar ? '💼 Finance' : '💼 Finance',
              callback_data: buildTelegramMenuCallbackData('admin', 'finance'),
            },
          ]
        : [
            {
              text: isMyanmar ? '🧾 Dashboard' : '🧾 Panel',
              url: input.panelUrl,
            },
            {
              text: isMyanmar ? '💼 Finance' : '💼 Finance',
              callback_data: buildTelegramMenuCallbackData('admin', 'finance'),
            },
          ],
    ],
  };
}

export function buildTelegramRefundQueueDetailMessage(input: {
  locale: SupportedLocale;
  order: TelegramRefundQueueOrder;
}) {
  const { locale, order } = input;
  const isMyanmar = locale === 'my';
  const customer = buildTelegramRefundCustomerSummary(order);
  const customerLine = order.telegramUserId
    ? `👤 <b>${escapeHtml(customer)}</b> • <code>${escapeHtml(order.telegramUserId)}</code>`
    : `👤 <b>${escapeHtml(customer)}</b>`;
  const reason = compactTelegramRefundText(order.refundRequestMessage, 120);

  return [
    isMyanmar ? 'ℹ️ <b>Refund အသေးစိတ်</b>' : 'ℹ️ <b>Refund detail</b>',
    '',
    `🧾 <b>${escapeHtml(order.orderCode)}</b> • ${escapeHtml(formatTelegramRefundAmount(order))}`,
    customerLine,
    `📦 ${escapeHtml(formatTelegramRefundKindLabel(order, locale))}${order.planName ? ` • ${escapeHtml(order.planName)}` : ''}`,
    [
      order.paymentMethodLabel ? `💳 ${escapeHtml(order.paymentMethodLabel)}` : '',
      order.financeStatus ? `${isMyanmar ? 'Finance' : 'Finance'} ${escapeHtml(order.financeStatus)}` : '',
    ].filter(Boolean).join(' • '),
    order.refundRequestedAt
      ? `🕒 ${escapeHtml(formatTelegramDateTime(order.refundRequestedAt, locale))}`
      : '',
    reason ? `${isMyanmar ? '📝 အကြောင်းရင်း' : '📝 Reason'}: ${escapeHtml(reason)}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function handleFinanceCommand(locale: SupportedLocale) {
  const now = new Date();
  const lookbackStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [orders, financeActions, pendingRefundRequests, financeControls] = await Promise.all([
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
    getFinanceControls(),
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
  return [
    locale === 'my' ? '💸 <b>Finance အနှစ်ချုပ်</b>' : '💸 <b>Finance summary</b>',
    '',
    locale === 'my' ? 'Window: လွန်ခဲ့သော 24 နာရီ' : 'Window: last 24 hour(s)',
    locale === 'my' ? `Paid order: ${fulfilledOrders.length}` : `Paid orders: ${fulfilledOrders.length}`,
    locale === 'my' ? `ဝင်ငွေ: ${formatTelegramAdminMoneyMap(revenueByCurrency)}` : `Revenue: ${formatTelegramAdminMoneyMap(revenueByCurrency)}`,
    locale === 'my' ? `Renew: ${renewals}` : `Renewals: ${renewals}`,
    locale === 'my' ? `စစ်ပြီး payment: ${verifiedCount}` : `Verified payments: ${verifiedCount}`,
    locale === 'my' ? `Refund: ${formatTelegramAdminMoneyMap(refundsByCurrency)}` : `Refunded: ${formatTelegramAdminMoneyMap(refundsByCurrency)}`,
    locale === 'my' ? `Credit: ${formatTelegramAdminMoneyMap(creditsByCurrency)}` : `Credited: ${formatTelegramAdminMoneyMap(creditsByCurrency)}`,
    locale === 'my' ? `Refund စောင့်နေ: ${pendingRefundRequests}` : `Pending refund requests: ${pendingRefundRequests}`,
    locale === 'my' ? `Trial → paid: ${trialConversions}` : `Trial → paid conversions: ${trialConversions}`,
    '',
    locale === 'my'
      ? `Daily digest: ${financeControls.dailyFinanceDigestEnabled ? 'ဖွင့်' : 'ပိတ်'}`
      : `Daily digest: ${financeControls.dailyFinanceDigestEnabled ? 'ON' : 'OFF'}`,
  ].join('\n');
}

export async function handleSendFinanceCommand(locale: SupportedLocale) {
  const result = await runTelegramFinanceDigestCycle({ now: new Date(), force: true });
  if (result.skipped) {
    return locale === 'my'
      ? `Finance digest ကို မပို့နိုင်ပါ။ reason=${result.reason}`
      : `Finance digest was skipped. reason=${result.reason}`;
  }

  return locale === 'my'
    ? `💸 Finance digest ကို admin chat ${result.adminChats} ခုသို့ ပို့ပြီးပါပြီ။`
    : `💸 Sent the finance digest to ${result.adminChats} admin chat(s).`;
}

async function sendTelegramRefundQueueCardToChat(input: {
  botToken: string;
  chatId: string | number;
  locale: SupportedLocale;
  order: TelegramRefundQueueOrder;
}) {
  const panelUrl = await buildTelegramOrderPanelUrl(input.order.id);
  return sendTelegramMessage(
    input.botToken,
    input.chatId,
    buildTelegramRefundQueueCardMessage({
      locale: input.locale,
      order: input.order,
    }),
    {
      replyMarkup: buildTelegramRefundQueueCardKeyboard({
        locale: input.locale,
        orderId: input.order.id,
        panelUrl,
        claimed: Boolean(input.order.refundAssignedReviewerUserId),
      }),
    },
  );
}

export async function findTelegramRefundQueueOrderById(orderId: string) {
  return db.telegramOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderCode: true,
      kind: true,
      status: true,
      planName: true,
      requestedEmail: true,
      telegramUsername: true,
      telegramUserId: true,
      priceAmount: true,
      priceCurrency: true,
      paymentMethodLabel: true,
      refundRequestedAt: true,
      refundRequestMessage: true,
      financeStatus: true,
      refundAssignedReviewerUserId: true,
      refundAssignedReviewerEmail: true,
    },
  });
}

export async function sendTelegramRefundQueueDetailToChat(input: {
  botToken: string;
  chatId: string | number;
  locale: SupportedLocale;
  order: TelegramRefundQueueOrder;
}) {
  const panelUrl = await buildTelegramOrderPanelUrl(input.order.id);
  return sendTelegramMessage(
    input.botToken,
    input.chatId,
    buildTelegramRefundQueueDetailMessage({
      locale: input.locale,
      order: input.order,
    }),
    {
      replyMarkup: buildTelegramRefundQueueCardKeyboard({
        locale: input.locale,
        orderId: input.order.id,
        panelUrl,
        claimed: Boolean(input.order.refundAssignedReviewerUserId),
        includeDetail: false,
      }),
    },
  );
}

async function sendTelegramNextRefundQueueCard(input: {
  botToken: string;
  chatId: string | number;
  locale: SupportedLocale;
  excludeOrderId?: string | null;
  direction?: 'next' | 'prev';
}) {
  const snapshot = await getTelegramRefundQueueSnapshot({ limit: 20 });
  const currentIndex = snapshot.orders.findIndex((order) => order.id === (input.excludeOrderId || null));
  const nextOrder =
    currentIndex >= 0
      ? input.direction === 'prev'
        ? snapshot.orders[currentIndex - 1] || null
        : snapshot.orders[currentIndex + 1] || null
      : snapshot.orders.find((order) => order.id !== (input.excludeOrderId || null)) || null;

  if (!nextOrder) {
    await sendTelegramMessage(
      input.botToken,
      input.chatId,
      input.direction === 'prev'
        ? input.locale === 'my'
          ? '📭 ယခင် refund request မရှိတော့ပါ။'
          : '📭 There is no previous pending refund request.'
        : input.locale === 'my'
          ? '📭 နောက်ထပ် pending refund request မရှိတော့ပါ။'
          : '📭 There are no more pending refund requests.',
      {
        replyMarkup: buildTelegramRefundQueueSummaryKeyboard({ locale: input.locale }),
      },
    );
    return null;
  }

  await sendTelegramRefundQueueCardToChat({
    botToken: input.botToken,
    chatId: input.chatId,
    locale: input.locale,
    order: nextOrder,
  });
  return nextOrder;
}

export async function handleRefundsCommand(input: {
  chatId: string | number;
  locale: SupportedLocale;
  botToken: string;
  adminActor: TelegramAdminActor;
}) {
  const snapshot = await getTelegramRefundQueueSnapshot({ limit: 1 });

  if (!snapshot.orders.length) {
    return input.locale === 'my'
      ? '✅ Pending refund request မရှိပါ။'
      : '✅ There are no pending refund requests.';
  }

  await sendTelegramMessage(
    input.botToken,
    input.chatId,
    buildTelegramRefundQueueSummaryMessage({
      locale: input.locale,
      totalPending: snapshot.totalPending,
      unclaimed: snapshot.unclaimed,
      claimed: snapshot.claimed,
      hasItems: true,
    }),
    {
      replyMarkup: buildTelegramRefundQueueSummaryKeyboard({ locale: input.locale }),
    },
  );

  await sendTelegramRefundQueueCardToChat({
    botToken: input.botToken,
    chatId: input.chatId,
    locale: input.locale,
    order: snapshot.orders[0],
  });

  return null;
}

async function claimTelegramRefundRequest(
  query: string,
  actor: TelegramAdminActor,
) {
  const order = await db.telegramOrder.findFirst({
    where: {
      OR: [{ orderCode: query.toUpperCase() }, { id: query }],
    },
    select: {
      id: true,
      orderCode: true,
      refundRequestStatus: true,
      refundAssignedReviewerUserId: true,
      refundAssignedReviewerEmail: true,
    },
  });

  if (!order) {
    throw new Error('Refund order not found.');
  }
  if (order.refundRequestStatus !== 'PENDING') {
    throw new Error('That order is not waiting for refund review.');
  }
  if (order.refundAssignedReviewerUserId && order.refundAssignedReviewerUserId !== actor.userId) {
    throw new Error(`This refund request is already claimed by ${order.refundAssignedReviewerEmail || 'another admin'}.`);
  }

  const updated = await db.telegramOrder.update({
    where: { id: order.id },
    data: {
      refundAssignedReviewerUserId: actor.userId,
      refundAssignedReviewerEmail: actor.email || 'telegram-admin',
      refundAssignedAt: new Date(),
    },
    select: {
      id: true,
      orderCode: true,
      kind: true,
      status: true,
      planName: true,
      requestedEmail: true,
      telegramUsername: true,
      telegramUserId: true,
      priceAmount: true,
      priceCurrency: true,
      paymentMethodLabel: true,
      refundRequestedAt: true,
      refundRequestMessage: true,
      financeStatus: true,
      refundAssignedReviewerUserId: true,
      refundAssignedReviewerEmail: true,
    },
  });

  await writeAuditLog({
    userId: actor.userId || undefined,
    action: 'TELEGRAM_ORDER_REFUND_CLAIMED',
    entity: 'TELEGRAM_ORDER',
    entityId: order.id,
    details: {
      orderCode: order.orderCode,
      refundAssignedReviewerEmail: actor.email || 'telegram-admin',
      via: 'telegram_bot',
    },
  });

  return updated;
}

export async function handleTelegramRefundQueueCallback(input: {
  action: TelegramAdminRefundAction;
  orderId: string;
  chatId: string | number;
  locale: SupportedLocale;
  botToken: string;
  adminActor: TelegramAdminActor;
}) {
  if (input.action === 'claim') {
    const order = await claimTelegramRefundRequest(input.orderId, input.adminActor);
    await sendTelegramRefundQueueCardToChat({
      botToken: input.botToken,
      chatId: input.chatId,
      locale: input.locale,
      order,
    });
    return input.locale === 'my'
      ? `${order.orderCode} ကို ယူထားပြီးပါပြီ`
      : `Claimed ${order.orderCode}`;
  }

  if (input.action === 'detail') {
    const order = await findTelegramRefundQueueOrderById(input.orderId);
    if (!order) {
      throw new Error('Refund order not found.');
    }

    await sendTelegramRefundQueueDetailToChat({
      botToken: input.botToken,
      chatId: input.chatId,
      locale: input.locale,
      order,
    });
    return input.locale === 'my' ? 'အသေးစိတ်ကို ဖွင့်ပြီးပါပြီ။' : 'Opened refund detail.';
  }

  await sendTelegramNextRefundQueueCard({
    botToken: input.botToken,
    chatId: input.chatId,
    locale: input.locale,
    excludeOrderId: input.orderId,
    direction: input.action === 'prev' ? 'prev' : 'next',
  });
  return input.locale === 'my' ? 'ပို့ပြီးပါပြီ' : 'Sent';
}

export async function handleClaimRefundCommand(
  argsText: string,
  locale: SupportedLocale,
  actor: TelegramAdminActor,
) {
  const query = argsText.trim();
  if (!query) {
    return locale === 'my'
      ? 'အသုံးပြုပုံ: /claimrefund ORDER-CODE'
      : 'Usage: /claimrefund ORDER-CODE';
  }

  try {
    const order = await claimTelegramRefundRequest(query, actor);
    return locale === 'my'
      ? `🧾 ${order.orderCode} ကို claim လုပ်ပြီးပါပြီ။`
      : `🧾 Claimed refund request ${order.orderCode}.`;
  } catch (error) {
    return locale === 'my'
      ? (error as Error).message
      : (error as Error).message;
  }
}

export async function handleReassignRefundCommand(
  argsText: string,
  locale: SupportedLocale,
  actor: TelegramAdminActor,
) {
  const [orderQuery, ...reviewerTokens] = argsText.trim().split(/\s+/);
  const reviewerQuery = reviewerTokens.join(' ').trim();
  if (!orderQuery || !reviewerQuery) {
    return locale === 'my'
      ? 'အသုံးပြုပုံ: /reassignrefund ORDER-CODE ADMIN-EMAIL-OR-QUERY'
      : 'Usage: /reassignrefund ORDER-CODE ADMIN-EMAIL-OR-QUERY';
  }

  const order = await db.telegramOrder.findFirst({
    where: {
      OR: [{ orderCode: orderQuery.toUpperCase() }, { id: orderQuery }],
    },
    select: {
      id: true,
      orderCode: true,
      refundRequestStatus: true,
      refundAssignedReviewerEmail: true,
    },
  });
  if (!order) {
    return locale === 'my' ? 'Refund order မတွေ့ပါ။' : 'Refund order not found.';
  }
  if (order.refundRequestStatus !== 'PENDING') {
    return locale === 'my'
      ? 'Pending refund request မဟုတ်ပါ။'
      : 'That order is not waiting for refund review.';
  }

  const reviewerQueryNormalized = reviewerQuery.toLowerCase();
  const candidateAdmins = (await db.user.findMany({
    where: {
      role: 'ADMIN',
    },
    select: {
      id: true,
      email: true,
    },
    orderBy: [{ email: 'asc' }],
  })).filter((candidate) => candidate.email.toLowerCase().includes(reviewerQueryNormalized));

  if (candidateAdmins.length !== 1) {
    if (candidateAdmins.length === 0) {
      return locale === 'my'
        ? 'သတ်မှတ်ထားသော admin reviewer မတွေ့ပါ။'
        : 'No matching admin reviewer was found.';
    }
    return [
      locale === 'my'
        ? 'တစ်ဦးတည်းသာ သတ်မှတ်နိုင်ရန် ပိုတိကျသော reviewer query သုံးပါ။'
        : 'Use a more specific reviewer query; multiple admins matched.',
      '',
      ...candidateAdmins.map((candidate) => `• ${candidate.email}`),
    ].join('\n');
  }

  const reviewer = candidateAdmins[0];
  await db.telegramOrder.update({
    where: { id: order.id },
    data: {
      refundAssignedReviewerUserId: reviewer.id,
      refundAssignedReviewerEmail: reviewer.email,
      refundAssignedAt: new Date(),
    },
  });

  await writeAuditLog({
    userId: actor.userId || undefined,
    action: 'TELEGRAM_ORDER_REFUND_REASSIGNED',
    entity: 'TELEGRAM_ORDER',
    entityId: order.id,
    details: {
      orderCode: order.orderCode,
      previousRefundAssignedReviewerEmail: order.refundAssignedReviewerEmail || null,
      refundAssignedReviewerEmail: reviewer.email,
      via: 'telegram_bot',
    },
  });

  return locale === 'my'
    ? `🧾 ${order.orderCode} ကို ${reviewer.email} သို့ reassign လုပ်ပြီးပါပြီ။`
    : `🧾 Reassigned ${order.orderCode} to ${reviewer.email}.`;
}
