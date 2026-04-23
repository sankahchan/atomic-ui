import { writeAuditLog } from '@/lib/audit';
import { db } from '@/lib/db';
import { type SupportedLocale } from '@/lib/i18n/config';
import { getFinanceControls, runTelegramFinanceDigestCycle } from '@/lib/services/telegram-finance';
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

export async function handleRefundsCommand(locale: SupportedLocale) {
  const pendingRefunds = await db.telegramOrder.findMany({
    where: {
      refundRequestStatus: 'PENDING',
    },
    select: {
      orderCode: true,
      requestedEmail: true,
      priceAmount: true,
      priceCurrency: true,
      refundRequestedAt: true,
      refundAssignedReviewerEmail: true,
    },
    orderBy: [{ refundRequestedAt: 'asc' }, { createdAt: 'asc' }],
    take: 5,
  });

  if (!pendingRefunds.length) {
    return locale === 'my'
      ? '✅ Pending refund request မရှိပါ။'
      : '✅ There are no pending refund requests.';
  }

  const lines = [
    locale === 'my' ? '🧾 <b>Pending refund request များ</b>' : '🧾 <b>Pending refund requests</b>',
    '',
  ];

  for (const order of pendingRefunds) {
    lines.push(
      `• <b>${escapeHtml(order.orderCode)}</b>`,
      `  ${order.priceAmount ? `${order.priceAmount.toLocaleString()} ${(order.priceCurrency || 'MMK').toUpperCase()}` : '0'}`,
      `  ${escapeHtml(order.requestedEmail || (locale === 'my' ? 'မသိရသော user' : 'Unknown customer'))}`,
      `  ${formatTelegramDateTime(order.refundRequestedAt || new Date(), locale)}`,
      `  ${locale === 'my' ? 'Reviewer' : 'Reviewer'}: ${escapeHtml(order.refundAssignedReviewerEmail || (locale === 'my' ? 'မယူရသေး' : 'Unclaimed'))}`,
      '',
    );
  }

  return lines.join('\n');
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
    return locale === 'my' ? 'Refund order မတွေ့ပါ။' : 'Refund order not found.';
  }
  if (order.refundRequestStatus !== 'PENDING') {
    return locale === 'my'
      ? 'Pending refund request မဟုတ်ပါ။'
      : 'That order is not waiting for refund review.';
  }
  if (order.refundAssignedReviewerUserId && order.refundAssignedReviewerUserId !== actor.userId) {
    return locale === 'my'
      ? `ဤ refund request ကို ${order.refundAssignedReviewerEmail || 'အခြား admin'} က claim လုပ်ထားသည်။`
      : `This refund request is already claimed by ${order.refundAssignedReviewerEmail || 'another admin'}.`;
  }

  await db.telegramOrder.update({
    where: { id: order.id },
    data: {
      refundAssignedReviewerUserId: actor.userId,
      refundAssignedReviewerEmail: actor.email || 'telegram-admin',
      refundAssignedAt: new Date(),
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

  return locale === 'my'
    ? `🧾 ${order.orderCode} ကို claim လုပ်ပြီးပါပြီ။`
    : `🧾 Claimed refund request ${order.orderCode}.`;
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
