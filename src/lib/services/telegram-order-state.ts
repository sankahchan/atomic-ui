import { db } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit';
import { coerceSupportedLocale, type SupportedLocale } from '@/lib/i18n/config';
import { formatBytes } from '@/lib/utils';
import { buildTelegramFinanceDocumentUrl } from '@/lib/services/telegram-finance';
import { findLinkedAccessKeys, findLinkedDynamicAccessKeys } from '@/lib/services/telegram-keys';
import {
  getTelegramConfig,
  getTelegramDefaultLocale,
  getTelegramNotificationPreferences,
  getTelegramSupportLink,
  sendTelegramMessage,
  type TelegramConfig,
} from '@/lib/services/telegram-runtime';
import {
  escapeHtml,
  formatExpirationSummary,
  formatTelegramServerChoiceLabel,
  getFlagEmoji,
  getTelegramUi,
} from '@/lib/services/telegram-ui';
import {
  formatTelegramSalesPlanSummary,
  generateTelegramOrderCode,
  getTelegramSalesSettings,
  listEnabledTelegramSalesPaymentMethods,
  resolveTelegramSalesPaymentMethod,
  resolveTelegramSalesPaymentMethodLabel,
  resolveTelegramSalesPaymentInstructions,
  resolveTelegramSalesPlan,
  resolveTelegramSalesPlanLabel,
  resolveTelegramSalesPriceLabel,
  TELEGRAM_ORDER_ACTIVE_STATUSES,
  TELEGRAM_ORDER_TERMINAL_STATUSES,
  type TelegramSalesPlanCode,
} from '@/lib/services/telegram-sales';

function isTelegramOrderAwaitingPayment(status: string) {
  return status === 'AWAITING_PAYMENT_METHOD' || status === 'AWAITING_PAYMENT_PROOF';
}

export function buildTelegramOrderPaymentStageFields(input: {
  nextStatus: string;
  currentStatus?: string | null;
  paymentStageEnteredAt?: Date | null;
  paymentReminderSentAt?: Date | null;
  retryReminderSentAt?: Date | null;
  preserveReminderSentAt?: boolean;
}) {
  const nextIsPayment = isTelegramOrderAwaitingPayment(input.nextStatus);
  const currentIsPayment = Boolean(
    input.currentStatus && isTelegramOrderAwaitingPayment(input.currentStatus),
  );

  if (nextIsPayment) {
    return {
      paymentStageEnteredAt:
        currentIsPayment && input.paymentStageEnteredAt ? input.paymentStageEnteredAt : new Date(),
      paymentReminderSentAt:
        currentIsPayment && input.preserveReminderSentAt
          ? input.paymentReminderSentAt ?? null
          : currentIsPayment
            ? input.paymentReminderSentAt ?? null
            : null,
      retryReminderSentAt: currentIsPayment ? input.retryReminderSentAt ?? null : null,
      expiredAt: null,
    };
  }

  if (currentIsPayment) {
    return {
      paymentStageEnteredAt: null,
      paymentReminderSentAt: null,
      retryReminderSentAt: null,
    };
  }

  return {};
}

export async function getActiveTelegramOrder(chatId: number, telegramUserId: number) {
  return db.telegramOrder.findFirst({
    where: {
      telegramChatId: String(chatId),
      telegramUserId: String(telegramUserId),
      status: {
        in: [...TELEGRAM_ORDER_ACTIVE_STATUSES],
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
}

export async function cancelStaleTelegramConversationOrders(chatId: number, telegramUserId: number) {
  await db.telegramOrder.updateMany({
    where: {
      telegramChatId: String(chatId),
      telegramUserId: String(telegramUserId),
      status: {
        in: [
          'AWAITING_KEY_SELECTION',
          'AWAITING_PLAN',
          'AWAITING_MONTHS',
          'AWAITING_SERVER_SELECTION',
          'AWAITING_KEY_NAME',
          'AWAITING_PAYMENT_METHOD',
          'AWAITING_PAYMENT_PROOF',
        ],
      },
    },
    data: {
      status: 'CANCELLED',
      paymentStageEnteredAt: null,
      paymentReminderSentAt: null,
      reviewReminderSentAt: null,
      retryReminderSentAt: null,
      expiredAt: null,
      updatedAt: new Date(),
    },
  });
}

function formatTelegramReceiptPriceLabel(order: {
  priceLabel?: string | null;
  priceAmount?: number | null;
  priceCurrency?: string | null;
}) {
  if (order.priceLabel?.trim()) {
    return order.priceLabel.trim();
  }

  if (typeof order.priceAmount === 'number' && Number.isFinite(order.priceAmount) && order.priceAmount > 0) {
    const normalizedCurrency = (order.priceCurrency || 'MMK').trim().toUpperCase();
    const formattedAmount = new Intl.NumberFormat('en-US').format(order.priceAmount);
    return normalizedCurrency === 'MMK'
      ? `${formattedAmount} Kyat`
      : `${formattedAmount} ${normalizedCurrency}`;
  }

  return null;
}

function buildTelegramOrderReceiptMessage(input: {
  order: {
    orderCode: string;
    priceLabel?: string | null;
    priceAmount?: number | null;
    priceCurrency?: string | null;
    planName?: string | null;
    planCode?: string | null;
    paymentMethodLabel?: string | null;
    durationMonths?: number | null;
    durationDays?: number | null;
    requestedName?: string | null;
    selectedServerName?: string | null;
    selectedServerCountryCode?: string | null;
    deliveryType?: string | null;
  };
  locale: SupportedLocale;
  deliveredKeyName: string;
  isTrial?: boolean;
}) {
  const ui = getTelegramUi(input.locale);
  const typeLabel = input.isTrial
    ? ui.receiptTypeTrial
    : input.order.deliveryType === 'DYNAMIC_KEY'
      ? ui.receiptTypePremium
      : ui.receiptTypeStandard;
  const statusLabel = input.isTrial ? ui.receiptStatusTrial : ui.receiptStatusPaid;
  const durationLabel = input.order.durationMonths
    ? input.locale === 'my'
      ? `${input.order.durationMonths} လ`
      : `${input.order.durationMonths} month${input.order.durationMonths === 1 ? '' : 's'}`
    : input.order.durationDays
      ? input.locale === 'my'
        ? `${input.order.durationDays} ရက်`
        : `${input.order.durationDays} day${input.order.durationDays === 1 ? '' : 's'}`
      : null;
  const priceLabel = formatTelegramReceiptPriceLabel(input.order);
  const serverLabel = input.order.selectedServerName
    ? `${input.order.selectedServerName}${input.order.selectedServerCountryCode ? ` ${getFlagEmoji(input.order.selectedServerCountryCode)}` : ''}`
    : null;

  return [
    ui.receiptTitle,
    '',
    `${ui.orderCodeLabel}: <b>${escapeHtml(input.order.orderCode)}</b>`,
    `${ui.receiptNumberLabel}: <code>RCPT-${escapeHtml(input.order.orderCode)}</code>`,
    `${ui.statusLineLabel}: <b>${escapeHtml(statusLabel)}</b>`,
    `${ui.receiptTypeLabel}: <b>${escapeHtml(typeLabel)}</b>`,
    input.order.planName || input.order.planCode
      ? `${ui.planLabel}: <b>${escapeHtml(input.order.planName || input.order.planCode || '')}</b>`
      : '',
    priceLabel ? `${ui.priceLabel}: <b>${escapeHtml(priceLabel)}</b>` : '',
    input.order.paymentMethodLabel
      ? `${ui.paymentMethodLabel}: <b>${escapeHtml(input.order.paymentMethodLabel)}</b>`
      : '',
    durationLabel ? `${ui.durationLabel}: <b>${escapeHtml(durationLabel)}</b>` : '',
    serverLabel ? `${ui.preferredServerLabel}: <b>${escapeHtml(serverLabel)}</b>` : '',
    input.order.requestedName
      ? `${ui.requestedNameLabel}: <b>${escapeHtml(input.order.requestedName)}</b>`
      : '',
    `${ui.deliveredKeyLabel}: <b>${escapeHtml(input.deliveredKeyName)}</b>`,
    '',
    escapeHtml(ui.receiptFooter),
  ]
    .filter(Boolean)
    .join('\n');
}

export async function sendTelegramOrderReceiptConfirmation(input: {
  chatId: string;
  locale: SupportedLocale;
  order: {
    orderCode: string;
    telegramUserId?: string;
    priceLabel?: string | null;
    priceAmount?: number | null;
    priceCurrency?: string | null;
    planName?: string | null;
    planCode?: string | null;
    paymentMethodLabel?: string | null;
    durationMonths?: number | null;
    durationDays?: number | null;
    requestedName?: string | null;
    selectedServerName?: string | null;
    selectedServerCountryCode?: string | null;
    deliveryType?: string | null;
  };
  deliveredKeyName: string;
  isTrial?: boolean;
}) {
  const config = await getTelegramConfig();
  if (!config) {
    return false;
  }

  const telegramUserId =
    'telegramUserId' in input.order && typeof input.order.telegramUserId === 'string'
      ? input.order.telegramUserId
      : input.chatId;
  const preferences = await getTelegramNotificationPreferences({
    telegramUserId,
    telegramChatId: input.chatId,
  });
  if (!preferences.receipt) {
    return true;
  }

  return sendTelegramMessage(
    config.botToken,
    input.chatId,
    buildTelegramOrderReceiptMessage(input),
    {
      replyMarkup: {
        inline_keyboard: [
          [{ text: getTelegramUi(input.locale).receiptActionPrintable, url: buildTelegramFinanceDocumentUrl({
            orderCode: input.order.orderCode,
            type: 'receipt',
            format: 'html',
          }) }],
          [{ text: getTelegramUi(input.locale).receiptActionDownloadPdf, url: buildTelegramFinanceDocumentUrl({
            orderCode: input.order.orderCode,
            type: 'receipt',
            format: 'pdf',
          }) }],
        ],
      },
    },
  );
}

export async function handleTelegramOrderProofMessage(input: {
  botToken: string;
  chatId: number;
  telegramUserId: number;
  messageId: number;
  photo?: Array<{ file_id: string; file_unique_id?: string }>;
  document?: { file_id: string; file_unique_id?: string } | undefined;
  caption?: string;
  deps: any;
}) {
  const activeOrder = await getActiveTelegramOrder(input.chatId, input.telegramUserId);
  if (
    !activeOrder ||
    (activeOrder.status !== 'AWAITING_PAYMENT_PROOF' && activeOrder.status !== 'PENDING_REVIEW')
  ) {
    return null;
  }

  const proofFileId =
    input.photo?.[input.photo.length - 1]?.file_id ||
    input.document?.file_id ||
    null;
  const proofUniqueId =
    input.photo?.[input.photo.length - 1]?.file_unique_id ||
    input.document?.file_unique_id ||
    null;

  if (!proofFileId) {
    return null;
  }

  const duplicateProofSource = proofUniqueId
    ? await db.telegramOrder.findFirst({
        where: {
          id: {
            not: activeOrder.id,
          },
          paymentProofUniqueId: proofUniqueId,
        },
        orderBy: [
          { paymentSubmittedAt: 'desc' },
          { createdAt: 'desc' },
        ],
        select: {
          id: true,
          orderCode: true,
        },
      })
    : null;

  const next = await db.telegramOrder.update({
    where: { id: activeOrder.id },
    data: {
      status: 'PENDING_REVIEW',
      ...buildTelegramOrderPaymentStageFields({
        nextStatus: 'PENDING_REVIEW',
        currentStatus: activeOrder.status,
        paymentStageEnteredAt: activeOrder.paymentStageEnteredAt,
        paymentReminderSentAt: activeOrder.paymentReminderSentAt,
        retryReminderSentAt: activeOrder.retryReminderSentAt,
      }),
      paymentProofFileId: proofFileId,
      paymentProofUniqueId: proofUniqueId,
      paymentProofType: input.document ? 'document' : 'photo',
      paymentProofRevision: {
        increment: 1,
      },
      duplicateProofOrderId: duplicateProofSource?.id || null,
      duplicateProofOrderCode: duplicateProofSource?.orderCode || null,
      duplicateProofDetectedAt: duplicateProofSource ? new Date() : null,
      paymentMessageId: input.messageId,
      paymentCaption: input.caption || null,
      reviewReminderSentAt: null,
      paymentSubmittedAt: new Date(),
      customerMessage: null,
      rejectionReasonCode: null,
    },
  });

  if (duplicateProofSource) {
    await writeAuditLog({
      action: 'TELEGRAM_ORDER_DUPLICATE_PROOF_DETECTED',
      entity: 'TELEGRAM_ORDER',
      entityId: next.id,
      details: {
        orderCode: next.orderCode,
        duplicateProofOrderId: duplicateProofSource.id,
        duplicateProofOrderCode: duplicateProofSource.orderCode,
        telegramUserId: next.telegramUserId,
        paymentProofUniqueId: proofUniqueId,
      },
    });
  }

  await input.deps.sendTelegramOrderReviewAlert(next.id, activeOrder.status === 'PENDING_REVIEW' ? 'updated' : 'initial');

  const locale = coerceSupportedLocale(next.locale) || (await getTelegramDefaultLocale());
  const ui = getTelegramUi(locale);
  return ui.orderProofPending(next.orderCode);
}

export async function handleBuyCommand(input: {
  chatId: number;
  telegramUserId: number;
  username: string;
  locale: SupportedLocale;
  botToken: string;
  argsText?: string;
  retentionSource?: string | null;
  deps: any;
}): Promise<string | null> {
  const ui = getTelegramUi(input.locale);
  const settings = await getTelegramSalesSettings();

  if (!settings.enabled) {
    return ui.buyDisabled;
  }

  const existing = await getActiveTelegramOrder(input.chatId, input.telegramUserId);
  if (existing?.status === 'PENDING_REVIEW') {
    return ui.activeOrderPendingReview(existing.orderCode);
  }

  await cancelStaleTelegramConversationOrders(input.chatId, input.telegramUserId);

  const order = await input.deps.createTelegramOrderRecord({
    kind: 'NEW',
    chatId: input.chatId,
    telegramUserId: input.telegramUserId,
    telegramUsername: input.username,
    locale: input.locale,
    initialStatus: 'AWAITING_PLAN',
    retentionSource: input.retentionSource ?? null,
  });

  const couponResolution = input.deps.resolveTelegramCouponForOrderStart
    ? await input.deps.resolveTelegramCouponForOrderStart({
        chatId: input.chatId,
        telegramUserId: input.telegramUserId,
        source: input.retentionSource ?? null,
        couponCode: input.argsText?.trim() || null,
      })
    : null;
  const preparedOrder =
    couponResolution?.coupon && input.deps.attachTelegramCouponToOrder
      ? await input.deps.attachTelegramCouponToOrder({
          orderId: order.id,
          coupon: couponResolution.coupon,
        })
      : order;

  const enabledPlans = await input.deps.listAvailableTelegramPlansForOrder({
    kind: 'NEW',
    chatId: input.chatId,
    telegramUserId: input.telegramUserId,
    settings,
  });
  const standardPlanLines = enabledPlans
    .filter((plan: any) => plan.deliveryType === 'ACCESS_KEY' && plan.code !== 'trial_1d_3gb')
    .map((plan: any) => {
      const label = resolveTelegramSalesPlanLabel(plan, input.locale);
      const price = resolveTelegramSalesPriceLabel(plan, input.locale);
      return price ? `• <b>${label}</b> — ${price}` : `• <b>${label}</b>`;
    });
  const premiumPlanLines = enabledPlans
    .filter((plan: any) => plan.deliveryType === 'DYNAMIC_KEY')
    .map((plan: any) => {
      const label = resolveTelegramSalesPlanLabel(plan, input.locale);
      const price = resolveTelegramSalesPriceLabel(plan, input.locale);
      return price ? `• <b>${label}</b> — ${price}` : `• <b>${label}</b>`;
    });
  const lines = [
    ui.orderPlanPrompt(preparedOrder.orderCode),
    '',
    ui.buyPlanChooseHint,
    '',
    input.locale === 'my'
      ? '<b>ဝယ်ယူခြင်း အကျဉ်းချုပ်</b>\n• Plan ရွေးရန်\n• Server / payment ရွေးရန်\n• Screenshot ပို့ရန်\n• Admin approval စောင့်ရန်'
      : '<b>How buying works</b>\n• Choose a plan\n• Choose server / payment\n• Send your screenshot\n• Wait for admin approval',
    ...(input.deps.buildTelegramCouponReadyLines
      ? input.deps.buildTelegramCouponReadyLines({
          locale: input.locale,
          couponCode: preparedOrder.couponCode,
          couponDiscountAmount: preparedOrder.couponDiscountAmount,
          couponDiscountLabel: preparedOrder.couponDiscountLabel,
          priceCurrency: preparedOrder.priceCurrency,
          unavailableReason: couponResolution?.unavailableReason || null,
          requestedCouponCode: couponResolution?.requestedCouponCode || null,
        })
      : []),
    '',
    ui.buyStandardSummary,
    ui.buyStandardBestFor,
    ...(standardPlanLines.length ? ['', `${ui.buyStandardPlansTitle}:`, ...standardPlanLines] : []),
    '',
    ui.buyPremiumSummary,
    ui.buyPremiumUpsell,
    ui.buyPremiumBestFor,
    ui.buyPremiumRegionExplain,
    ...(premiumPlanLines.length ? ['', `${ui.buyPremiumPlansTitle}:`, ...premiumPlanLines] : []),
    '',
    input.locale === 'my'
      ? '<b>ရွေးချယ်ရန် အသင့်ဖြစ်ပါပြီ</b>'
      : '<b>Ready to choose?</b>',
    ui.buyPlanCardChooseHint,
    input.locale === 'my'
      ? 'Button မသုံးနိုင်ပါက အောက်ပါနံပါတ်ကို reply လုပ်နိုင်ပါသည်။'
      : 'If the buttons do not work, reply with the matching number below.',
    '',
    ...enabledPlans.map((plan: any, index: number) => {
      const label = resolveTelegramSalesPlanLabel(plan, input.locale);
      const price = resolveTelegramSalesPriceLabel(plan, input.locale);
      return `${index + 1}. ${label}${price ? ` - ${price}` : ''}`;
    }),
  ].filter(Boolean);
  const message = input.deps.buildTelegramSalesPlanPromptText(input.locale, lines);
  const sent = await sendTelegramMessage(input.botToken, input.chatId, message, {
    replyMarkup: input.deps.buildTelegramPlanSelectionKeyboard({
      orderId: preparedOrder.id,
      plans: enabledPlans,
      locale: input.locale,
    }),
  });

  return sent ? null : message;
}

export async function handleRenewOrderCommand(input: {
  chatId: number;
  telegramUserId: number;
  username: string;
  locale: SupportedLocale;
  botToken: string;
  argsText?: string;
  deps: any;
}): Promise<string | null> {
  const ui = getTelegramUi(input.locale);
  const settings = await getTelegramSalesSettings();

  if (!settings.enabled || !settings.allowRenewals) {
    return ui.renewDisabled;
  }

  const existing = await getActiveTelegramOrder(input.chatId, input.telegramUserId);
  if (existing?.status === 'PENDING_REVIEW') {
    return ui.activeOrderPendingReview(existing.orderCode);
  }

  const [accessKeys, dynamicKeys] = await Promise.all([
    findLinkedAccessKeys(input.chatId, input.telegramUserId, true),
    findLinkedDynamicAccessKeys(input.chatId, input.telegramUserId, true),
  ]);
  const renewableKeys = [
    ...accessKeys.map((key) => ({ id: key.id, name: key.name, kind: 'access' as const, status: key.status })),
    ...dynamicKeys.map((key) => ({ id: key.id, name: key.name, kind: 'dynamic' as const, status: key.status })),
  ];

  if (renewableKeys.length === 0) {
    return ui.myKeysEmpty;
  }

  await cancelStaleTelegramConversationOrders(input.chatId, input.telegramUserId);

  const order = await input.deps.createTelegramOrderRecord({
    kind: 'RENEW',
    chatId: input.chatId,
    telegramUserId: input.telegramUserId,
    telegramUsername: input.username,
    locale: input.locale,
    initialStatus: 'AWAITING_KEY_SELECTION',
  });

  const preselectedKey =
    input.deps.matchTelegramRenewableKeyOption(input.argsText || '', renewableKeys) ||
    (renewableKeys.length === 1 ? renewableKeys[0] : null);

  if (preselectedKey) {
    await input.deps.sendTelegramRenewalPlanSelection({
      orderId: order.id,
      orderCode: order.orderCode,
      chatId: input.chatId,
      telegramUserId: input.telegramUserId,
      locale: input.locale,
      botToken: input.botToken,
      salesSettings: settings,
      targetKey: preselectedKey,
    });

    const hint = renewableKeys.length === 1 ? `\n\n${ui.renewDirectHint}` : '';
    return `${ui.renewShortcutUsed(preselectedKey.name)}${hint}`;
  }

  const lines = [
    ui.renewTargetPrompt(order.orderCode),
    '',
    input.locale === 'my'
      ? 'Renew လုပ်လိုသော key ကို ရွေးပါ။ Button ကို နှိပ်နိုင်သလို နံပါတ်ဖြင့် reply လည်း လုပ်နိုင်ပါသည်။'
      : 'Choose the key you want to renew. You can tap a button or reply with the number.',
    '',
    ...renewableKeys.map((key, index) => {
      const typeLabel = key.kind === 'dynamic' ? ui.myKeysTypePremium : ui.myKeysTypeStandard;
      return `${index + 1}. ${key.name} • ${typeLabel} • ${key.status}`;
    }),
  ];
  const message = input.deps.buildTelegramSalesPlanPromptText(input.locale, lines);
  const sent = await sendTelegramMessage(input.botToken, input.chatId, message, {
    replyMarkup: input.deps.buildTelegramRenewKeySelectionKeyboard({
      orderId: order.id,
      keys: renewableKeys,
      locale: input.locale,
    }),
  });

  return sent ? null : message;
}

export async function handleTelegramOrderTextMessage(input: {
  chatId: number;
  telegramUserId: number;
  text: string;
  botToken: string;
  deps: any;
}) {
  const activeOrder = await getActiveTelegramOrder(input.chatId, input.telegramUserId);
  if (!activeOrder) {
    return null;
  }

  const locale = coerceSupportedLocale(activeOrder.locale) || (await getTelegramDefaultLocale());
  const ui = getTelegramUi(locale);
  const salesSettings = await getTelegramSalesSettings();
  const trimmed = input.text.trim();

  switch (activeOrder.status) {
    case 'AWAITING_KEY_SELECTION': {
      const [accessKeys, dynamicKeys] = await Promise.all([
        findLinkedAccessKeys(input.chatId, input.telegramUserId, true),
        findLinkedDynamicAccessKeys(input.chatId, input.telegramUserId, true),
      ]);
      const renewableKeys = [
        ...accessKeys.map((key) => ({ id: key.id, name: key.name, kind: 'access' as const })),
        ...dynamicKeys.map((key) => ({ id: key.id, name: key.name, kind: 'dynamic' as const })),
      ];
      if (renewableKeys.length === 0) {
        return ui.myKeysEmpty;
      }

      const numericIndex = Number.parseInt(trimmed, 10);
      const matchedKey =
        Number.isFinite(numericIndex) && numericIndex >= 1 && numericIndex <= renewableKeys.length
          ? renewableKeys[numericIndex - 1]
          : renewableKeys.find((key) => key.id === trimmed || key.name.toLowerCase() === trimmed.toLowerCase()) ||
            renewableKeys.find((key) => key.name.toLowerCase().includes(trimmed.toLowerCase()));

      if (!matchedKey) {
        return ui.invalidRenewChoice;
      }

      await input.deps.sendTelegramRenewalPlanSelection({
        orderId: activeOrder.id,
        orderCode: activeOrder.orderCode,
        chatId: input.chatId,
        telegramUserId: input.telegramUserId,
        locale,
        botToken: input.botToken,
        salesSettings,
        targetKey: {
          id: matchedKey.id,
          name: matchedKey.name,
          kind: matchedKey.kind,
          status: activeOrder.status,
        },
      });
      return null;
    }
    case 'AWAITING_PLAN': {
      const enabledPlans = await input.deps.listAvailableTelegramPlansForOrder({
        kind: activeOrder.kind as 'NEW' | 'RENEW',
        chatId: input.chatId,
        telegramUserId: input.telegramUserId,
        settings: salesSettings,
        deliveryType:
          activeOrder.kind === 'RENEW'
            ? activeOrder.targetDynamicKeyId
              ? 'DYNAMIC_KEY'
              : 'ACCESS_KEY'
            : null,
      });
      const numericIndex = Number.parseInt(trimmed, 10);
      if (!Number.isFinite(numericIndex) || numericIndex < 1 || numericIndex > enabledPlans.length) {
        return ui.invalidPlanChoice;
      }

      const plan = enabledPlans[numericIndex - 1];
      if (plan.code === 'trial_1d_3gb' && !(await input.deps.isEligibleForTelegramFreeTrial(input.chatId, input.telegramUserId))) {
        return ui.freeTrialUnavailable;
      }
      if (plan.unlimitedQuota && !plan.fixedDurationMonths) {
        const planSnapshot = input.deps.buildTelegramOrderPlanSnapshot(plan, locale, {
          couponCampaignType: activeOrder.couponCampaignType,
          couponCode: activeOrder.couponCode,
          couponDiscountAmount: activeOrder.couponDiscountAmount,
          couponDiscountLabel: activeOrder.couponDiscountLabel,
        });
        await db.telegramOrder.update({
          where: { id: activeOrder.id },
          data: {
            ...planSnapshot,
            status: 'AWAITING_MONTHS',
          },
        });
        return ui.orderMonthsPrompt;
      }

      const planSnapshot = input.deps.buildTelegramOrderPlanSnapshot(plan, locale, {
        couponCampaignType: activeOrder.couponCampaignType,
        couponCode: activeOrder.couponCode,
        couponDiscountAmount: activeOrder.couponDiscountAmount,
        couponDiscountLabel: activeOrder.couponDiscountLabel,
      });
      const enabledPaymentMethods = listEnabledTelegramSalesPaymentMethods(salesSettings);
      const nextStatus =
        activeOrder.kind === 'NEW'
          ? 'AWAITING_SERVER_SELECTION'
          : enabledPaymentMethods.length > 0
            ? 'AWAITING_PAYMENT_METHOD'
            : 'AWAITING_PAYMENT_PROOF';

      const nextOrder = await db.telegramOrder.update({
        where: { id: activeOrder.id },
        data: {
          ...planSnapshot,
          status: nextStatus,
          ...buildTelegramOrderPaymentStageFields({
            nextStatus,
            currentStatus: activeOrder.status,
            paymentStageEnteredAt: activeOrder.paymentStageEnteredAt,
            paymentReminderSentAt: activeOrder.paymentReminderSentAt,
            retryReminderSentAt: activeOrder.retryReminderSentAt,
          }),
        },
      });

      if (nextStatus === 'AWAITING_SERVER_SELECTION') {
        const servers = await input.deps.listAssignableTelegramOrderServers();
        await sendTelegramMessage(
          input.botToken,
          input.chatId,
          input.deps.buildTelegramServerSelectionPromptText({
            orderCode: nextOrder.orderCode,
            locale,
            servers,
          }),
          {
            replyMarkup: input.deps.buildTelegramServerSelectionKeyboard({
              orderId: nextOrder.id,
              locale,
              servers,
            }),
          },
        );
        return null;
      }

      if (nextStatus === 'AWAITING_PAYMENT_METHOD') {
        const durationMonths = planSnapshot.durationMonths;
        const renewalTarget = nextOrder.targetAccessKeyId
          ? await db.accessKey.findUnique({
              where: { id: nextOrder.targetAccessKeyId },
              select: { name: true },
            })
          : nextOrder.targetDynamicKeyId
            ? await db.dynamicAccessKey.findUnique({
                where: { id: nextOrder.targetDynamicKeyId },
                select: { name: true },
              })
            : null;
        const planSummary = formatTelegramSalesPlanSummary(plan, durationMonths, locale);
        await sendTelegramMessage(
          input.botToken,
          input.chatId,
          input.deps.buildTelegramPaymentMethodSelectionPromptText({
            orderCode: nextOrder.orderCode,
            locale,
            methods: enabledPaymentMethods,
            planSummary,
            renewalTargetName: renewalTarget?.name || null,
          }),
          {
            replyMarkup: input.deps.buildTelegramPaymentMethodSelectionKeyboard({
              orderId: nextOrder.id,
              locale,
              methods: enabledPaymentMethods,
            }),
          },
        );
        return null;
      }

      const renewalTarget = nextOrder.targetAccessKeyId
        ? await db.accessKey.findUnique({
            where: { id: nextOrder.targetAccessKeyId },
            select: { name: true },
          })
        : nextOrder.targetDynamicKeyId
          ? await db.dynamicAccessKey.findUnique({
              where: { id: nextOrder.targetDynamicKeyId },
              select: { name: true },
            })
          : null;
      const paymentInstructions = resolveTelegramSalesPaymentInstructions(salesSettings, locale);
      const planSummary = formatTelegramSalesPlanSummary(plan, planSnapshot.durationMonths, locale);
      await input.deps.sendTelegramOrderPaymentPromptCard({
        botToken: input.botToken,
        chatId: input.chatId,
        locale,
        order: nextOrder,
        orderCode: nextOrder.orderCode,
        planSummary,
        paymentInstructions,
        paymentMethods: listEnabledTelegramSalesPaymentMethods(salesSettings),
        renewalTargetName: renewalTarget?.name || null,
        supportLink: await getTelegramSupportLink(),
      });
      return null;
    }
    case 'AWAITING_MONTHS': {
      const months = Number.parseInt(trimmed, 10);
      if (!Number.isFinite(months) || months < 3 || months > 24) {
        return ui.invalidMonths;
      }

      const plan = activeOrder.planCode
        ? resolveTelegramSalesPlan(salesSettings, activeOrder.planCode as TelegramSalesPlanCode)
        : null;
      if (!plan) {
        return ui.invalidPlanChoice;
      }

      const planSummary = formatTelegramSalesPlanSummary(plan, months, locale);
      const enabledPaymentMethods = listEnabledTelegramSalesPaymentMethods(salesSettings);
      const nextStatus =
        activeOrder.kind === 'NEW'
          ? 'AWAITING_SERVER_SELECTION'
          : enabledPaymentMethods.length > 0
            ? 'AWAITING_PAYMENT_METHOD'
            : 'AWAITING_PAYMENT_PROOF';
      const nextOrder = await db.telegramOrder.update({
        where: { id: activeOrder.id },
        data: {
          ...input.deps.buildTelegramOrderPlanSnapshot(plan, locale, {
            durationMonths: months,
            durationDays: null,
            couponCampaignType: activeOrder.couponCampaignType,
            couponCode: activeOrder.couponCode,
            couponDiscountAmount: activeOrder.couponDiscountAmount,
            couponDiscountLabel: activeOrder.couponDiscountLabel,
          }),
          planName: planSummary,
          status: nextStatus,
          ...buildTelegramOrderPaymentStageFields({
            nextStatus,
            currentStatus: activeOrder.status,
            paymentStageEnteredAt: activeOrder.paymentStageEnteredAt,
            paymentReminderSentAt: activeOrder.paymentReminderSentAt,
            retryReminderSentAt: activeOrder.retryReminderSentAt,
          }),
        },
      });

      if (nextStatus === 'AWAITING_SERVER_SELECTION') {
        const servers = await input.deps.listAssignableTelegramOrderServers();
        await sendTelegramMessage(
          input.botToken,
          input.chatId,
          input.deps.buildTelegramServerSelectionPromptText({
            orderCode: nextOrder.orderCode,
            locale,
            servers,
          }),
          {
            replyMarkup: input.deps.buildTelegramServerSelectionKeyboard({
              orderId: nextOrder.id,
              locale,
              servers,
            }),
          },
        );
        return null;
      }

      if (nextStatus === 'AWAITING_PAYMENT_METHOD') {
        const renewalTarget = nextOrder.targetAccessKeyId
          ? await db.accessKey.findUnique({
              where: { id: nextOrder.targetAccessKeyId },
              select: { name: true },
            })
          : nextOrder.targetDynamicKeyId
            ? await db.dynamicAccessKey.findUnique({
                where: { id: nextOrder.targetDynamicKeyId },
                select: { name: true },
              })
            : null;
        await sendTelegramMessage(
          input.botToken,
          input.chatId,
          input.deps.buildTelegramPaymentMethodSelectionPromptText({
            orderCode: nextOrder.orderCode,
            locale,
            methods: enabledPaymentMethods,
            planSummary,
            renewalTargetName: renewalTarget?.name || null,
          }),
          {
            replyMarkup: input.deps.buildTelegramPaymentMethodSelectionKeyboard({
              orderId: nextOrder.id,
              locale,
              methods: enabledPaymentMethods,
            }),
          },
        );
        return null;
      }

      const renewalTarget = nextOrder.targetAccessKeyId
        ? await db.accessKey.findUnique({
            where: { id: nextOrder.targetAccessKeyId },
            select: { name: true },
          })
        : nextOrder.targetDynamicKeyId
          ? await db.dynamicAccessKey.findUnique({
              where: { id: nextOrder.targetDynamicKeyId },
              select: { name: true },
            })
          : null;
      await input.deps.sendTelegramOrderPaymentPromptCard({
        botToken: input.botToken,
        chatId: input.chatId,
        locale,
        order: nextOrder,
        orderCode: nextOrder.orderCode,
        planSummary,
        paymentInstructions: resolveTelegramSalesPaymentInstructions(salesSettings, locale),
        paymentMethods: listEnabledTelegramSalesPaymentMethods(salesSettings),
        renewalTargetName: renewalTarget?.name || null,
        supportLink: await getTelegramSupportLink(),
      });
      return null;
    }
    case 'AWAITING_SERVER_SELECTION': {
      const servers = await input.deps.listAssignableTelegramOrderServers();
      const numericIndex = Number.parseInt(trimmed, 10);
      const normalizedText = trimmed.toLowerCase();

      let selectedServer:
        | (Awaited<ReturnType<any>>[number] & { id: string })
        | null = null;

      if (normalizedText === 'auto' || normalizedText === 'a' || trimmed === '1') {
        selectedServer = {
          id: 'auto',
          name: ui.serverAutoSelect,
          countryCode: null,
          isDefault: false,
          sortOrder: 0,
          lifecycleMode: 'ACTIVE',
          isActive: true,
        };
      } else if (Number.isFinite(numericIndex) && numericIndex >= 2 && numericIndex <= servers.length + 1) {
        selectedServer = servers[numericIndex - 2] || null;
      } else {
        selectedServer =
          servers.find((server: any) => server.id === trimmed) ||
          servers.find((server: any) => server.name.toLowerCase() === normalizedText) ||
          servers.find((server: any) => server.name.toLowerCase().includes(normalizedText)) ||
          null;
      }

      if (!selectedServer) {
        return ui.invalidServerChoice;
      }

      await db.telegramOrder.update({
        where: { id: activeOrder.id },
        data: {
          selectedServerId: selectedServer.id === 'auto' ? null : selectedServer.id,
          selectedServerName: selectedServer.id === 'auto' ? null : selectedServer.name,
          selectedServerCountryCode:
            selectedServer.id === 'auto' ? null : (selectedServer.countryCode ?? null),
          status: 'AWAITING_KEY_NAME',
        },
      });

      const selectedLabel =
        selectedServer.id === 'auto'
          ? ui.serverAutoSelect
          : formatTelegramServerChoiceLabel(selectedServer, ui);
      return `${ui.orderActionSelectedServer(selectedLabel)}\n\n${ui.orderNamePrompt}`;
    }
    case 'AWAITING_KEY_NAME': {
      if (trimmed.length < 2 || trimmed.length > 100) {
        return ui.invalidOrderName;
      }

      const plan = activeOrder.planCode
        ? resolveTelegramSalesPlan(salesSettings, activeOrder.planCode as TelegramSalesPlanCode)
        : null;
      const planSummary = plan
        ? formatTelegramSalesPlanSummary(plan, activeOrder.durationMonths, locale)
        : activeOrder.planName || '';

      const updatedOrder = await db.telegramOrder.update({
        where: { id: activeOrder.id },
        data: {
          requestedName: trimmed,
          status:
            plan?.code === 'trial_1d_3gb'
              ? 'APPROVED'
              : listEnabledTelegramSalesPaymentMethods(salesSettings).length > 0
                ? 'AWAITING_PAYMENT_METHOD'
                : 'AWAITING_PAYMENT_PROOF',
          reviewedAt: plan?.code === 'trial_1d_3gb' ? new Date() : null,
          adminNote:
            plan?.code === 'trial_1d_3gb'
              ? input.deps.appendTelegramOrderAdminNote(activeOrder.adminNote, 'Auto-approved free trial')
              : activeOrder.adminNote,
          paymentMethodCode: null,
          paymentMethodLabel: null,
          paymentMethodAccountName: null,
          paymentMethodAccountNumber: null,
          ...buildTelegramOrderPaymentStageFields({
            nextStatus:
              plan?.code === 'trial_1d_3gb'
                ? 'APPROVED'
                : listEnabledTelegramSalesPaymentMethods(salesSettings).length > 0
                  ? 'AWAITING_PAYMENT_METHOD'
                  : 'AWAITING_PAYMENT_PROOF',
            currentStatus: activeOrder.status,
            paymentStageEnteredAt: activeOrder.paymentStageEnteredAt,
            paymentReminderSentAt: activeOrder.paymentReminderSentAt,
            retryReminderSentAt: activeOrder.retryReminderSentAt,
          }),
        },
      });

      if (plan?.code === 'trial_1d_3gb') {
        try {
          const { plan: resolvedPlan, template, durationMonths, durationDays } =
            await input.deps.resolveTelegramOrderPlanContext(updatedOrder);
          const key = await input.deps.fulfillTelegramNewAccessOrder({
            orderId: updatedOrder.id,
            orderCode: updatedOrder.orderCode,
            telegramChatId: updatedOrder.telegramChatId,
            telegramUserId: updatedOrder.telegramUserId,
            requestedName: trimmed,
            requestedEmail: updatedOrder.requestedEmail,
            durationMonths,
            durationDays,
            selectedServerId: updatedOrder.selectedServerId,
            plan: resolvedPlan,
            template,
          });

          const finalTrialOrder = await db.telegramOrder.update({
            where: { id: updatedOrder.id },
            data: {
              status: 'FULFILLED',
              approvedAccessKeyId: key.id,
              fulfilledAt: new Date(),
            },
          });

          let deliveryError: string | null = null;
          try {
            const config = await getTelegramConfig();
            if (config) {
              await sendTelegramOrderReceiptConfirmation({
                chatId: updatedOrder.telegramChatId,
                locale,
                order: finalTrialOrder,
                deliveredKeyName: key.name,
                isTrial: true,
              });
            }

            await input.deps.sendAccessKeySharePageToTelegram({
              accessKeyId: key.id,
              chatId: updatedOrder.telegramChatId,
              reason: 'CREATED',
              source: 'telegram_trial',
            });
          } catch (error) {
            deliveryError = (error as Error).message;
          }

          await writeAuditLog({
            action: 'TELEGRAM_ORDER_TRIAL_FULFILLED',
            entity: 'TELEGRAM_ORDER',
            entityId: updatedOrder.id,
            details: {
              orderCode: updatedOrder.orderCode,
              approvedAccessKeyId: key.id,
              deliveryError,
            },
          });

          return deliveryError ? `${ui.orderApproved(updatedOrder.orderCode)}\n\n${deliveryError}` : null;
        } catch (error) {
          await db.telegramOrder.update({
            where: { id: updatedOrder.id },
            data: {
              status: 'AWAITING_KEY_NAME',
              reviewedAt: null,
              adminNote: input.deps.appendTelegramOrderAdminNote(
                activeOrder.adminNote,
                `Free trial fulfillment failed at ${new Date().toISOString()}: ${(error as Error).message}`,
              ),
            },
          });
          return (error as Error).message;
        }
      }

      const enabledPaymentMethods = listEnabledTelegramSalesPaymentMethods(salesSettings);
      if (enabledPaymentMethods.length > 0) {
        await sendTelegramMessage(
          input.botToken,
          input.chatId,
          input.deps.buildTelegramPaymentMethodSelectionPromptText({
            orderCode: updatedOrder.orderCode,
            locale,
            methods: enabledPaymentMethods,
            planSummary,
            selectedServerName: updatedOrder.selectedServerName,
            requestedName: trimmed,
          }),
          {
            replyMarkup: input.deps.buildTelegramPaymentMethodSelectionKeyboard({
              orderId: updatedOrder.id,
              locale,
              methods: enabledPaymentMethods,
            }),
          },
        );
        return null;
      }

      await input.deps.sendTelegramOrderPaymentPromptCard({
        botToken: input.botToken,
        chatId: input.chatId,
        locale,
        order: updatedOrder,
        orderCode: activeOrder.orderCode,
        planSummary,
        paymentInstructions: resolveTelegramSalesPaymentInstructions(salesSettings, locale),
        paymentMethods: listEnabledTelegramSalesPaymentMethods(salesSettings),
        selectedServerName: updatedOrder.selectedServerName,
        requestedName: trimmed,
        supportLink: await getTelegramSupportLink(),
      });
      return null;
    }
    case 'AWAITING_PAYMENT_METHOD': {
      const paymentMethods = listEnabledTelegramSalesPaymentMethods(salesSettings);
      if (paymentMethods.length === 0) {
        await db.telegramOrder.update({
          where: { id: activeOrder.id },
          data: {
            status: 'AWAITING_PAYMENT_PROOF',
            ...buildTelegramOrderPaymentStageFields({
              nextStatus: 'AWAITING_PAYMENT_PROOF',
              currentStatus: activeOrder.status,
              paymentStageEnteredAt: activeOrder.paymentStageEnteredAt,
              paymentReminderSentAt: activeOrder.paymentReminderSentAt,
              retryReminderSentAt: activeOrder.retryReminderSentAt,
            }),
            reviewReminderSentAt: null,
          },
        });
        return ui.paymentProofRequired;
      }

      const numericIndex = Number.parseInt(trimmed, 10);
      const normalizedText = trimmed.toLowerCase();
      const selectedMethod =
        Number.isFinite(numericIndex) && numericIndex >= 1 && numericIndex <= paymentMethods.length
          ? paymentMethods[numericIndex - 1]
          : paymentMethods.find((method) => method.code.toLowerCase() === normalizedText) ||
            paymentMethods.find(
              (method) =>
                resolveTelegramSalesPaymentMethodLabel(method, locale).toLowerCase() === normalizedText,
            ) ||
            paymentMethods.find((method) =>
              resolveTelegramSalesPaymentMethodLabel(method, locale)
                .toLowerCase()
                .includes(normalizedText),
            ) ||
            null;

      if (!selectedMethod) {
        return ui.invalidPaymentMethodChoice;
      }

      const updatedOrder = await db.telegramOrder.update({
        where: { id: activeOrder.id },
        data: {
          paymentMethodCode: selectedMethod.code,
          paymentMethodLabel: resolveTelegramSalesPaymentMethodLabel(selectedMethod, locale),
          paymentMethodAccountName: selectedMethod.accountName?.trim() || null,
          paymentMethodAccountNumber: selectedMethod.accountNumber?.trim() || null,
          status: 'AWAITING_PAYMENT_PROOF',
          ...buildTelegramOrderPaymentStageFields({
            nextStatus: 'AWAITING_PAYMENT_PROOF',
            currentStatus: activeOrder.status,
            paymentStageEnteredAt: activeOrder.paymentStageEnteredAt,
            paymentReminderSentAt: activeOrder.paymentReminderSentAt,
            retryReminderSentAt: activeOrder.retryReminderSentAt,
          }),
          reviewReminderSentAt: null,
          reviewedAt: null,
          rejectedAt: null,
        },
      });

      const plan = updatedOrder.planCode
        ? resolveTelegramSalesPlan(salesSettings, updatedOrder.planCode as TelegramSalesPlanCode)
        : null;
      const renewalTarget = updatedOrder.targetAccessKeyId
        ? await db.accessKey.findUnique({
            where: { id: updatedOrder.targetAccessKeyId },
            select: { name: true },
          })
        : null;
      const planSummary = plan
        ? formatTelegramSalesPlanSummary(plan, updatedOrder.durationMonths, locale)
        : updatedOrder.planName || '';

      await sendTelegramMessage(
        input.botToken,
        input.chatId,
        ui.orderActionSelectedPaymentMethod(resolveTelegramSalesPaymentMethodLabel(selectedMethod, locale)),
      );
      await input.deps.sendTelegramOrderPaymentPromptCard({
        botToken: input.botToken,
        chatId: input.chatId,
        locale,
        order: updatedOrder,
        orderCode: updatedOrder.orderCode,
        planSummary,
        paymentInstructions: resolveTelegramSalesPaymentInstructions(salesSettings, locale),
        paymentMethod: selectedMethod,
        selectedServerName: updatedOrder.selectedServerName,
        requestedName: updatedOrder.requestedName,
        renewalTargetName: renewalTarget?.name || null,
        supportLink: await getTelegramSupportLink(),
      });
      return null;
    }
    case 'AWAITING_PAYMENT_PROOF':
      return ui.paymentProofRequired;
    case 'PENDING_REVIEW':
      return ui.activeOrderPendingReview(activeOrder.orderCode);
    default:
      return null;
  }
}
