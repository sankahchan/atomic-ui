import { db } from '@/lib/db';
import { resolveRefundReasonPresetLabel } from '@/lib/finance';
import { type SupportedLocale } from '@/lib/i18n/config';
import {
  buildSharePageUrl,
  buildShortShareUrl,
  buildSubscriptionClientUrl,
} from '@/lib/subscription-links';
import { evaluateTelegramOrderRefundEligibility } from '@/lib/services/telegram-finance';
import { buildTelegramMenuCallbackData } from '@/lib/services/telegram-callbacks';
import {
  buildTelegramOrderTimelineChipRow,
  buildTelegramOrderNextStepText,
  buildTelegramOrderTimelineLines,
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

export type TelegramUserOrder = Awaited<ReturnType<typeof findTelegramOrderForUser>>;

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
  const statusIcon = formatTelegramOrderStatusIcon(order.status);
  const nextStep = buildTelegramOrderNextStepText(order, ui);
  const stateLine = formatTelegramOrderStateLine(order);
  const summaryTitle = isMyanmar ? '<b>📦 Order details</b>' : '<b>📦 Order details</b>';
  const currentStateTitle = isMyanmar ? '<b>📌 Current state</b>' : '<b>📌 Current state</b>';
  const lines = [
    ui.orderStatusTitle,
    '',
    `${statusIcon} <b>${escapeHtml(formatTelegramOrderStatusLabel(order.status, ui))}</b>`,
    stateLine ? `🧾 ${escapeHtml(stateLine)}` : '',
    nextStep ? `👉 ${ui.orderNextStepLabel}: <b>${escapeHtml(nextStep)}</b>` : '',
    buildTelegramOrderTimelineChipRow({ order }),
    buildTelegramOrderProgressSummary({ order, locale })
      ? `⏱ ${escapeHtml(buildTelegramOrderProgressSummary({ order, locale }) || '')}`
      : '',
    '',
    currentStateTitle,
    `${ui.orderCodeLabel}: <b>${escapeHtml(order.orderCode)}</b>`,
    `${ui.orderTypeLabel}: ${escapeHtml(formatTelegramOrderKindLabel(order.kind, ui))}`,
  ];

  lines.push('', summaryTitle);

  if (order.planName || order.planCode) {
    lines.push(`${ui.planLabel}: <b>${escapeHtml(order.planName || order.planCode || '')}</b>`);
  }

  if (order.priceLabel) {
    lines.push(`${ui.priceLabel}: ${escapeHtml(order.priceLabel)}`);
  }

  if (order.durationMonths) {
    lines.push(
      `${ui.durationLabel}: ${escapeHtml(
        locale === 'my'
          ? `${order.durationMonths} လ`
          : `${order.durationMonths} month${order.durationMonths === 1 ? '' : 's'}`,
      )}`,
    );
  }

  if (order.durationDays) {
    lines.push(
      `${ui.durationLabel}: ${escapeHtml(
        locale === 'my'
          ? `${order.durationDays} ရက်`
          : `${order.durationDays} day${order.durationDays === 1 ? '' : 's'}`,
      )}`,
    );
  }

  if (order.requestedName) {
    lines.push(`${ui.requestedNameLabel}: <b>${escapeHtml(order.requestedName)}</b>`);
  }

  if (order.requestedEmail) {
    lines.push(`${ui.emailLabel}: <code>${escapeHtml(order.requestedEmail)}</code>`);
  }

  if (order.kind === 'RENEW') {
    const renewalTargetId = order.targetAccessKeyId || order.targetDynamicKeyId;
    if (renewalTargetId) {
      lines.push(`${ui.renewalTargetLabel}: <code>${escapeHtml(renewalTargetId)}</code>`);
    }
  }

  if (order.selectedServerName) {
    const flag = order.selectedServerCountryCode
      ? ` ${getFlagEmoji(order.selectedServerCountryCode)}`
      : '';
    lines.push(
      `${ui.preferredServerLabel}: <b>${escapeHtml(order.selectedServerName)}${flag}</b>`,
    );
  }

  if (order.paymentMethodLabel) {
    lines.push('', `<b>${isMyanmar ? '💳 Payment & review' : '💳 Payment & review'}</b>`);
    lines.push(`${ui.paymentMethodLabel}: <b>${escapeHtml(order.paymentMethodLabel)}</b>`);
  }

  lines.push(`${ui.createdAtLabel}: ${escapeHtml(formatTelegramDateTime(order.createdAt, locale))}`);

  if (order.paymentSubmittedAt) {
    lines.push(
      `${ui.paymentSubmittedLabel}: ${escapeHtml(
        formatTelegramDateTime(order.paymentSubmittedAt, locale),
      )}`,
    );
  }

  if (order.reviewedAt) {
    lines.push(
      `${ui.reviewedAtLabel}: ${escapeHtml(formatTelegramDateTime(order.reviewedAt, locale))}`,
    );
  }

  if (order.fulfilledAt) {
    lines.push(
      `${ui.fulfilledAtLabel}: ${escapeHtml(formatTelegramDateTime(order.fulfilledAt, locale))}`,
    );
  }

  if (order.rejectedAt) {
    lines.push(
      `${ui.rejectedAtLabel}: ${escapeHtml(formatTelegramDateTime(order.rejectedAt, locale))}`,
    );
  }

  if (order.refundRequestStatus) {
    lines.push(
      `${ui.refundRequestStatusLabel}: <b>${escapeHtml(
        formatTelegramRefundRequestStatusLabel(order.refundRequestStatus, ui),
      )}</b>`,
    );
  }

  if (order.refundRequestedAt) {
    lines.push(
      `${ui.refundRequestedAtLabel}: ${escapeHtml(
        formatTelegramDateTime(order.refundRequestedAt, locale),
      )}`,
    );
  }

  if (order.refundRequestReviewedAt) {
    lines.push(
      `${ui.refundReviewedAtLabel}: ${escapeHtml(
        formatTelegramDateTime(order.refundRequestReviewedAt, locale),
      )}`,
    );
  }

  if (order.refundReviewReasonCode) {
    lines.push(
      `${ui.refundReasonLabel}: ${escapeHtml(
        resolveRefundReasonPresetLabel(order.refundReviewReasonCode) || order.refundReviewReasonCode,
      )}`,
    );
  }

  if (order.customerMessage?.trim()) {
    lines.push('', `<b>${isMyanmar ? '📝 Customer note' : '📝 Customer note'}</b>`, escapeHtml(order.customerMessage.trim()));
  }

  if (order.refundRequestCustomerMessage?.trim()) {
    lines.push('', `<b>${isMyanmar ? '📝 Customer note' : '📝 Customer note'}</b>`, escapeHtml(order.refundRequestCustomerMessage.trim()));
  }

  if (order.refundRequestStatus === 'PENDING') {
    lines.push('', `<b>${isMyanmar ? '💸 Finance update' : '💸 Finance update'}</b>`, escapeHtml(ui.refundPendingHelp));
  } else if (order.refundRequestStatus === 'APPROVED') {
    lines.push('', `<b>${isMyanmar ? '💸 Finance update' : '💸 Finance update'}</b>`, escapeHtml(ui.refundApprovedHelp));
  } else if (order.refundRequestStatus === 'REJECTED') {
    lines.push('', `<b>${isMyanmar ? '💸 Finance update' : '💸 Finance update'}</b>`, escapeHtml(ui.refundRejectedHelp));
  }

  if (
    order.status === 'AWAITING_PAYMENT_METHOD' ||
    order.status === 'AWAITING_PAYMENT_PROOF' ||
    order.status === 'PENDING_REVIEW' ||
    order.status === 'REJECTED' ||
    order.status === 'CANCELLED'
  ) {
    lines.push(
      '',
      `<b>${isMyanmar ? '🛟 What you can do now' : '🛟 What you can do now'}</b>`,
      escapeHtml(
        order.status === 'AWAITING_PAYMENT_METHOD'
          ? isMyanmar
            ? 'Payment method ကို အရင် ရွေးပြီးနောက် screenshot အဆင့်ကို ဆက်သွားပါ။'
            : 'Choose your payment method first, then continue to the screenshot step.'
          : order.status === 'AWAITING_PAYMENT_PROOF'
            ? isMyanmar
              ? 'ငွေပေးချေပြီး screenshot ကို ဤ chat ထဲသို့ ပို့ပါ။ Payment guide ဖြင့် account detail ကို ပြန်ကြည့်နိုင်ပြီး Payment method ပြောင်းရန် button ကိုလည်း အသုံးပြုနိုင်ပါသည်။'
              : 'Complete payment and send the screenshot in this chat. Use Payment guide to recheck the account details, or Switch payment method if needed.'
            : order.status === 'PENDING_REVIEW'
              ? isMyanmar
                ? 'ယခု order သည် admin review စောင့်နေပါသည်။ Screenshot ကို ထပ်မပို့ဘဲ update စောင့်ပါ။'
                : 'This order is waiting for admin review. Wait for an update instead of sending another screenshot.'
              : order.status === 'REJECTED'
                ? isMyanmar
                  ? 'လိုအပ်ပါက Restart same plan ကို အသုံးပြုပြီး screenshot သို့မဟုတ် payment method ကို ပြန်စနိုင်ပါသည်။'
                  : 'Use Restart same plan if you want to restart this exact flow with a fresh screenshot or payment method.'
                : isMyanmar
                  ? 'ဤ order ကို ပိတ်ထားပါသည်။ အသစ်စရန် /buy သို့မဟုတ် /renew ကို သုံးနိုင်ပါသည်။'
                  : 'This order is closed. Use /buy or /renew to start again.',
      ),
      escapeHtml(
        isMyanmar
          ? 'အောက်ရှိ buttons များသည် order အခြေအနေနှင့် ကိုက်ညီအောင် ပြောင်းလဲထားပါသည်။'
          : 'The buttons below are matched to the current order state.',
      ),
    );
  }

  lines.push('', ...buildTelegramOrderTimelineLines({ order, locale, ui }));

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
      const token = key.subscriptionToken
        ? key.subscriptionToken
        : await input.ensureAccessKeySubscriptionToken(key.id, key.subscriptionToken);

      const sharePageUrl = key.sharePageEnabled
        ? key.publicSlug
          ? buildShortShareUrl(key.publicSlug, {
              source: 'telegram_order_status',
              lang: locale,
            })
          : buildSharePageUrl(token, { source: 'telegram_order_status', lang: locale })
        : null;

      const outlineClientUrl = key.clientLinkEnabled
        ? key.publicSlug
          ? buildSubscriptionClientUrl(key.publicSlug, key.name, {
              source: 'telegram_order_status',
              shortPath: true,
            })
          : buildSubscriptionClientUrl(token, key.name, {
              source: 'telegram_order_status',
            })
        : null;

      lines.push('', `<b>${isMyanmar ? '🔗 Delivered access' : '🔗 Delivered access'}</b>`);
      lines.push(`${ui.deliveredKeyLabel}: <b>${escapeHtml(key.name)}</b>`);

      if (sharePageUrl) {
        lines.push(`🌐 ${ui.sharePageLabel}: ${sharePageUrl}`);
      }

      if (outlineClientUrl) {
        lines.push(`⚡ ${ui.outlineClientUrlLabel}: <code>${escapeHtml(outlineClientUrl)}</code>`);
      }
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
      const { sharePageUrl, subscriptionUrl, outlineClientUrl } = input.getDynamicKeyMessagingUrls(
        dynamicKey,
        'telegram_order_status',
        locale,
      );
      const poolSummary = formatTelegramDynamicPoolSummary(dynamicKey, ui);

      lines.push('', `<b>${isMyanmar ? '🔗 Delivered access' : '🔗 Delivered access'}</b>`);
      lines.push(`${ui.deliveredKeyLabel}: <b>${escapeHtml(dynamicKey.name)}</b>`);
      lines.push(`💎 ${ui.planLabel}: <b>${escapeHtml(ui.premiumLabel)}</b>`);
      lines.push(`✨ ${ui.premiumStableLink}`);
      if (dynamicKey.type === 'SELF_MANAGED') {
        lines.push(`⚡ ${ui.premiumAutoFailover}`);
      }
      lines.push(`🧭 ${escapeHtml(poolSummary)}`);

      if (dynamicKey.sharePageEnabled && sharePageUrl) {
        lines.push(`🌐 ${ui.sharePageLabel}: ${sharePageUrl}`);
      }

      if (subscriptionUrl) {
        lines.push(`🔄 ${ui.clientEndpointLabel}: ${subscriptionUrl}`);
      }

      if (outlineClientUrl) {
        lines.push(`⚡ ${ui.outlineClientUrlLabel}: <code>${escapeHtml(outlineClientUrl)}</code>`);
      }
    }
  }

  if (order.status === 'AWAITING_PAYMENT_PROOF' || order.status === 'PENDING_REVIEW') {
    lines.push(
      '',
      `<b>${isMyanmar ? '🛟 Need help?' : '🛟 Need help?'}</b>`,
      ui.orderSupportHint,
    );
  }

  return lines.join('\n');
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
  const lines = [
    ui.ordersTitle,
    '',
    `${attentionOrders.length} need action • ${reviewOrders.length} under review • ${completedOrders.length} completed`,
    '',
  ];
  const sections =
    filter === 'ACTION'
      ? ([[ui.ordersAttentionTitle, attentionOrders]] as const)
      : filter === 'REVIEW'
        ? ([[ui.ordersReviewTitle, reviewOrders]] as const)
        : filter === 'COMPLETED'
          ? ([[ui.ordersCompletedTitle, completedOrders]] as const)
          : ([
              [ui.ordersAttentionTitle, attentionOrders],
              [ui.ordersReviewTitle, reviewOrders],
              [ui.ordersCompletedTitle, completedOrders],
            ] as const);

  for (const [title, sectionOrders] of sections) {
    if (sectionOrders.length === 0) {
      continue;
    }

    lines.push(title);
    for (const order of sectionOrders) {
      const nextStep = buildTelegramOrderNextStepText(order, ui);
      lines.push(
        `${formatTelegramOrderStatusIcon(order.status)} ${escapeHtml(
          formatTelegramOrderStateLine({
            orderCode: order.orderCode,
            planName: order.planName,
            planCode: order.planCode,
            durationMonths: order.durationMonths,
            durationDays: order.durationDays,
            requestedName: order.requestedName,
          }),
        )}`,
      );
      lines.push(
        `  ${ui.statusLineLabel}: ${escapeHtml(
          formatTelegramOrderStatusLabel(order.status, ui),
        )} • ${escapeHtml(formatTelegramDateTime(order.createdAt, input.locale))}`,
      );
      lines.push(`  ${buildTelegramOrderTimelineChipRow({ order })}`);
      if (nextStep) {
        lines.push(`  ${ui.orderNextStepLabel}: ${escapeHtml(nextStep)}`);
      }
    }
    lines.push('');
  }

  if (filteredOrders.length === 0) {
    lines.push(
      filter === 'ACTION'
        ? input.locale === 'my'
          ? '📭 လက်ရှိလုပ်ဆောင်ရန်လိုသော order မရှိသေးပါ။'
          : '📭 There are no orders that need action right now.'
        : filter === 'REVIEW'
          ? input.locale === 'my'
            ? '📭 လက်ရှိ review စောင့်နေသော order မရှိသေးပါ။'
            : '📭 There are no orders under review right now.'
          : input.locale === 'my'
            ? '📭 လတ်တလော completed order မရှိသေးပါ။'
            : '📭 There are no completed orders yet.',
      '',
    );
  }

  lines.push(ui.ordersHint);
  const summaryMessage = lines.join('\n');
  const sentSummary = await input.sendTelegramMessage(input.botToken, input.chatId, summaryMessage, {
    replyMarkup: buildTelegramOrdersKeyboard(input.locale, filter),
  });

  const latestOrder = filteredOrders[0] || attentionOrders[0] || reviewOrders[0] || orders[0];
  if (latestOrder) {
    await input.sendTelegramOrderStatusCard({
      botToken: input.botToken,
      chatId: input.chatId,
      order: latestOrder,
      locale: input.locale,
      appendLatestHint: true,
    });
  }

  return sentSummary ? null : summaryMessage;
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

  const summaryLines = [ui.refundCenterTitle, '', ui.refundPolicySummary];

  if (recentRefundRequests.length > 0) {
    summaryLines.push(
      '',
      `<b>${ui.refundRecentRequestsTitle}</b>`,
      ...recentRefundRequests.map((order) => {
        const details = [
          escapeHtml(order.orderCode),
          escapeHtml(formatTelegramRefundRequestStatusLabel(order.refundRequestStatus || '', ui)),
        ];
        if (order.refundRequestedAt) {
          details.push(escapeHtml(formatTelegramDateTime(order.refundRequestedAt, input.locale)));
        }
        if (order.refundReviewReasonCode) {
          details.push(
            escapeHtml(
              resolveRefundReasonPresetLabel(order.refundReviewReasonCode) ||
                order.refundReviewReasonCode,
            ),
          );
        }
        return `• ${details.join(' • ')}`;
      }),
    );
  }

  if (refundableOrders.length > 0) {
    summaryLines.push(
      '',
      `<b>${ui.refundEligibleSectionTitle}</b>`,
      ...refundableOrders.map(
        ({ order, refundEligibility }, index) =>
          `${index + 1}. ${escapeHtml(formatTelegramOrderStateLine(order))} • ${escapeHtml(
            formatBytes(refundEligibility.usedBytes),
          )}`,
      ),
      '',
      ui.refundEligibleOrdersHint,
    );
  }
  const summaryMessage = summaryLines.join('\n');
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
