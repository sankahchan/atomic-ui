/**
 * Telegram Bot Service
 *
 * Telegram is treated as a first-class user/admin surface:
 * - onboarding via deep-link /start tokens
 * - direct share-page delivery
 * - user self-service commands
 * - admin operational commands
 * - admin alerts and scheduled digest delivery
 */

import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import QRCode from 'qrcode';
import si from 'systeminformation';
import {
  hasFinanceManageScope,
  hasOutageManageScope,
  hasTelegramAnnouncementManageScope,
  hasTelegramReviewManageScope,
} from '@/lib/admin-scope';
import { db } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit';
import { createOutlineClient } from '@/lib/outline-api';
import { decorateOutlineAccessUrl } from '@/lib/outline-access-url';
import {
  buildDynamicOutlineUrl,
  buildDynamicSharePageUrl,
  buildDynamicShortClientUrl,
  buildDynamicShortShareUrl,
  buildDynamicSubscriptionApiUrl,
  buildSharePageUrl,
  buildShortShareUrl,
  buildSubscriptionApiUrl,
  buildSubscriptionClientUrl,
} from '@/lib/subscription-links';
import {
  recordSubscriptionPageEvent,
  SUBSCRIPTION_EVENT_TYPES,
} from '@/lib/services/subscription-events';
import { canAssignKeysToServer } from '@/lib/services/server-lifecycle';
import {
  normalizeDynamicRoutingPreferences,
  parseDynamicRoutingPreferences,
} from '@/lib/services/dynamic-subscription-routing';
import { selectLeastLoadedServer } from '@/lib/services/load-balancer';
import { coerceSupportedLocale, type SupportedLocale } from '@/lib/i18n/config';
import {
  resolveLocalizedTemplate,
  type LocalizedTemplateMap,
} from '@/lib/localized-templates';
import {
  buildTelegramOrderNextStepText,
  buildTelegramOrderTimelineLines,
  escapeHtml,
  formatExpirationSummary,
  formatTelegramDateTime,
  formatTelegramDynamicPoolSummary,
  getDynamicKeyRegionChoices,
  formatTelegramOrderKindLabel,
  formatTelegramOrderStateLine,
  formatTelegramOrderStatusIcon,
  formatTelegramOrderStatusLabel,
  formatTelegramPremiumFollowUpState,
  formatTelegramPremiumSupportStatusLabel,
  formatTelegramPremiumSupportTypeLabel,
  formatTelegramQuotaSummary,
  formatTelegramRefundRequestStatusLabel,
  formatTelegramServerChoiceLabel,
  getFlagEmoji,
  getTelegramAccessKeyCategory,
  getTelegramUi,
  normalizeTelegramOrderLookupCodes,
  normalizeTelegramPremiumSupportLookupCodes,
} from '@/lib/services/telegram-ui';
import {
  TELEGRAM_ORDER_ACTIVE_STATUSES,
  TELEGRAM_ORDER_TERMINAL_STATUSES,
  formatTelegramSalesPlanSummary,
  generateTelegramOrderCode,
  getTelegramSalesSettings,
  getTelegramRejectionReasonPreset,
  listEnabledTelegramSalesPaymentMethods,
  resolveTelegramRejectionReasonMessage,
  resolveTelegramSalesPaymentMethod,
  resolveTelegramSalesPaymentInstructions,
  resolveTelegramSalesPaymentMethodLabel,
  resolveTelegramSalesPaymentMethodNote,
  resolveTelegramSalesPlan,
  resolveTelegramSalesPlanLabel,
  resolveTelegramSalesPriceLabel,
  type TelegramOrderActiveStatus,
  type TelegramOrderTerminalStatus,
  type TelegramSalesPaymentMethod,
  type TelegramSalesPlan,
  type TelegramSalesPlanCode,
} from '@/lib/services/telegram-sales';
import {
  buildTelegramCouponAdjustedPlanSnapshot,
  expireTelegramCoupons,
  findTelegramApplicableCoupon,
  formatTelegramSalesMoneyAmount,
  getTelegramCampaignCouponTypeFromSource,
  issueTelegramCampaignCoupon,
  redeemTelegramCouponForOrder,
  type TelegramCouponAvailabilityReason,
  type TelegramCampaignCouponType,
} from '@/lib/services/telegram-coupons';
import {
  buildTelegramFinanceDocumentUrl,
  evaluateTelegramOrderRefundEligibility,
  getFinanceControls,
  runTelegramFinanceDigestCycle,
  sendTelegramRefundRequestAlert,
} from '@/lib/services/telegram-finance';
import {
  dispatchTelegramAnnouncement,
  getTelegramAnnouncementAudienceMap,
  type TelegramAnnouncementAudience,
  type TelegramAnnouncementType,
} from '@/lib/services/telegram-announcements';
import {
  addTelegramPremiumSupportReply,
  buildTelegramDynamicPremiumPendingKeyboard,
  buildTelegramDynamicPremiumRegionKeyboard,
  buildTelegramDynamicPremiumSupportKeyboard,
  buildTelegramPremiumSupportStatusMessage,
  createTelegramPremiumSupportRequestRecord,
  findTelegramPremiumSupportRequestByIdForUser,
  handlePremiumCommand,
  handlePremiumRegionStatusCommand,
  handlePremiumSupportFollowUpText,
  handlePremiumSupportStatusCommand,
  listTelegramPremiumSupportRequestsForUser,
} from '@/lib/services/telegram-premium';
import {
  buildTelegramOrderStatusMessage,
  findTelegramOrderForUser,
  handleOrderStatusCommand,
  handleOrdersCommand,
  handleRefundCommand,
  listRecentTelegramRefundRequests,
  listRefundEligibleTelegramOrders,
  listTelegramOrdersForUser,
  type TelegramUserOrder,
} from '@/lib/services/telegram-orders';
import {
  buildTelegramOrderPaymentStageFields as buildTelegramOrderPaymentStageFieldsModule,
  cancelStaleTelegramConversationOrders as cancelStaleTelegramConversationOrdersModule,
  getActiveTelegramOrder as getActiveTelegramOrderModule,
  handleBuyCommand as handleTelegramBuyCommand,
  handleRenewOrderCommand as handleTelegramRenewOrderCommand,
  handleTelegramOrderProofMessage as handleTelegramOrderProofMessageModule,
  handleTelegramOrderTextMessage as handleTelegramOrderTextMessageModule,
  sendTelegramOrderReceiptConfirmation as sendTelegramOrderReceiptConfirmationModule,
} from '@/lib/services/telegram-order-state';
import {
  handleTelegramLocaleOrPreferenceCallback,
} from '@/lib/services/telegram-callback-dispatch';
import {
  findLinkedAccessKeys,
  findLinkedDynamicAccessKeys,
  handleMyKeysCommand,
  handleSubscriptionLinksCommand,
  handleSupportCommand,
  handleUsageCommand,
  handleUserServerCommand,
} from '@/lib/services/telegram-keys';
import {
  handleInboxCommand,
  handleNotificationPreferencesCommand as handleTelegramNotificationPreferencesCommand,
} from '@/lib/services/telegram-notifications';
import { handleTelegramStartCommand } from '@/lib/services/telegram-onboarding';
import {
  buildTelegramHelpMessage,
  handleAdminToggleCommand,
  handleAnnounceCommand,
  handleAnnounceUserCommand,
  handleAnnouncementsCommand,
  handleBackupCommand,
  handleClaimRefundCommand,
  handleExpiringCommand,
  handleFindCommand,
  handleFinanceCommand,
  handleHelpCommand,
  handleMaintenanceCommand,
  handleRefundsCommand,
  handleReassignRefundCommand,
  handleResendCommand,
  handleScheduleAnnouncementCommand,
  handleSendFinanceCommand,
  handleServerDownCommand,
  handleServerRecoveredCommand,
  handleServerUpdateCommand,
  handleStatusCommand,
  handleSysInfoCommand,
  resolveAdminKeyQuery,
  resolveTelegramAdminActor,
  setAccessKeyEnabledState,
  telegramAdminScopeDeniedMessage,
  type TelegramAdminActor,
} from '@/lib/services/telegram-admin';
import {
  answerTelegramCallbackQuery,
  copyTelegramMessage,
  getSubscriptionDefaults,
  getTelegramBotUsername,
  getTelegramConfig,
  getTelegramConversationLocale,
  getTelegramDefaultLocale,
  getTelegramPendingPremiumReply,
  getTelegramNotificationPreferences,
  getTelegramSupportLink,
  getTelegramUserProfile,
  loadAccessKeyForMessaging,
  loadDynamicAccessKeyForMessaging,
  resolveTelegramChatIdForDynamicKey,
  resolveTelegramChatIdForKey,
  resolveTelegramLocaleForRecipient,
  sendAdminAlert,
  sendServerIssueNoticeToTelegram,
  sendTelegramDocument,
  sendTelegramMessage,
  sendTelegramPhoto,
  sendTelegramPhotoUrl,
  setTelegramPendingPremiumReply,
  upsertTelegramUserProfile,
  type SendMessageOptions,
  type TelegramConfig,
} from '@/lib/services/telegram-runtime';
import { runTelegramCouponCampaignCycle } from '@/lib/services/telegram-campaigns';
import {
  ensureAccessKeySubscriptionToken,
  getDynamicKeyMessagingUrls,
} from '@/lib/services/telegram-links';
import {
  runTelegramSalesDigestCycle,
  sendAccessKeyLifecycleTelegramNotification as sendAccessKeyLifecycleTelegramReminder,
  sendAccessKeyRenewalReminder,
  sendAccessKeyTrialExpiryReminder,
  sendDynamicKeyExpiryTelegramNotification,
  sendDynamicKeyRenewalReminder,
} from '@/lib/services/telegram-reminders';
import { resolveRefundReasonPresetLabel } from '@/lib/finance';
import {
  buildTelegramDynamicSupportActionCallbackData,
  buildTelegramLocaleSelectorKeyboard,
  buildTelegramLocaleSelectorMessage,
  buildTelegramOrderActionCallbackData,
  buildTelegramOrderReviewCallbackData,
  buildTelegramServerChangeActionCallbackData,
  buildTelegramServerChangeReviewCallbackData,
  getCommandKeyboard,
  isDynamicRenewalActionSecondary,
  normalizeTelegramReplyKeyboardCommand,
  parseTelegramDynamicSupportActionCallbackData,
  parseTelegramOrderActionCallbackData,
  parseTelegramOrderReviewCallbackData,
  parseTelegramServerChangeActionCallbackData,
  parseTelegramServerChangeReviewCallbackData,
  resolveTelegramRetentionSourceFromBuyAction,
  resolveTelegramRetentionSourceFromRenewAction,
  type TelegramRetentionSource,
} from '@/lib/services/telegram-callbacks';
import { computeArchiveAfterAt } from '@/lib/access-key-policies';
import {
  buildPublicSlugSuggestionCandidates,
  isReservedPublicSlug,
  isValidPublicSlug,
  normalizePublicSlug,
  slugifyPublicName,
} from '@/lib/public-slug';
import { mergeTagsForStorage, tagMatchesFilter } from '@/lib/tags';
import { formatBytes, formatDateTime, generateRandomString } from '@/lib/utils';
import { replaceAccessKeyServer } from '@/lib/services/server-migration';

const TELEGRAM_CONNECT_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export {
  getTelegramConfig,
  getTelegramSupportLink,
  sendAdminAlert,
  sendServerIssueNoticeToTelegram,
  sendTelegramDocument,
  sendTelegramMessage,
  sendTelegramPhoto,
  sendTelegramPhotoUrl,
} from '@/lib/services/telegram-runtime';
export {
  runTelegramSalesDigestCycle,
  sendAccessKeyRenewalReminder,
  sendAccessKeyTrialExpiryReminder,
  sendDynamicKeyRenewalReminder,
  sendTelegramDigestToAdmins,
  sendTelegramSalesDigestToAdmins,
} from '@/lib/services/telegram-reminders';

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      is_bot: boolean;
      first_name: string;
      username?: string;
    };
    chat: {
      id: number;
      type: string;
    };
    date: number;
    text?: string;
    caption?: string;
    photo?: Array<{
      file_id: string;
      file_unique_id: string;
      width: number;
      height: number;
      file_size?: number;
    }>;
    document?: {
      file_id: string;
      file_unique_id: string;
      file_name?: string;
      mime_type?: string;
      file_size?: number;
    };
  };
  callback_query?: {
    id: string;
    from: {
      id: number;
      is_bot: boolean;
      first_name: string;
      username?: string;
    };
    message?: {
      message_id: number;
      chat: {
        id: number;
        type: string;
      };
    };
    data?: string;
  };
}

type TelegramMessage = NonNullable<TelegramUpdate['message']>;
type TelegramCallbackQuery = NonNullable<TelegramUpdate['callback_query']>;

function buildTelegramSalesPlanPromptText(locale: SupportedLocale, lines: string[]) {
  const ui = getTelegramUi(locale);
  return [lines.join('\n'), '', ui.orderSupportHint].join('\n');
}

function buildTelegramSalesPaymentPrompt(input: {
  locale: SupportedLocale;
  orderCode: string;
  planSummary: string;
  paymentInstructions: string;
  paymentMethod?: TelegramSalesPaymentMethod | null;
  paymentMethods?: TelegramSalesPaymentMethod[];
  paymentMethodLabel?: string | null;
  selectedServerName?: string | null;
  requestedName?: string | null;
  renewalTargetName?: string | null;
  supportLink?: string | null;
  couponCode?: string | null;
  couponDiscountAmount?: number | null;
  couponDiscountLabel?: string | null;
  originalPriceAmount?: number | null;
  priceCurrency?: string | null;
}) {
  const ui = getTelegramUi(input.locale);
  const isMyanmar = input.locale === 'my';
  const lines = [
    isMyanmar
      ? `💳 <b>ငွေပေးချေမှု အဆင့် · ${escapeHtml(input.orderCode)}</b>`
      : `💳 <b>Payment step · ${escapeHtml(input.orderCode)}</b>`,
    '',
    isMyanmar ? '<b>Order summary</b>' : '<b>Order summary</b>',
    `${ui.planLabel}: <b>${escapeHtml(input.planSummary)}</b>`,
  ];

  if (input.requestedName) {
    lines.push(`${ui.requestedNameLabel}: <b>${escapeHtml(input.requestedName)}</b>`);
  }

  if (input.renewalTargetName) {
    lines.push(`${ui.renewalTargetLabel}: <b>${escapeHtml(input.renewalTargetName)}</b>`);
  }

  if (input.selectedServerName) {
    lines.push(`${ui.preferredServerLabel}: <b>${escapeHtml(input.selectedServerName)}</b>`);
  }

  if (input.couponCode) {
    lines.push(`${ui.couponCodeLabel}: <b>${escapeHtml(input.couponCode)}</b>`);
    if (typeof input.originalPriceAmount === 'number' && input.originalPriceAmount > 0) {
      lines.push(
        `${ui.originalPriceLabel}: <b>${escapeHtml(formatTelegramSalesMoneyAmount(input.originalPriceAmount, input.priceCurrency || 'MMK', input.locale))}</b>`,
      );
    }
    const discountText =
      input.couponDiscountLabel?.trim()
      || formatTelegramSalesMoneyAmount(input.couponDiscountAmount ?? null, input.priceCurrency || 'MMK', input.locale);
    if (discountText) {
      lines.push(`${ui.discountLabel}: <b>${escapeHtml(discountText)}</b>`);
    }
  }

  lines.push(
    '',
    isMyanmar ? '<b>လုပ်ဆောင်ရန် အဆင့်များ</b>' : '<b>What to do now</b>',
    isMyanmar
      ? '1. အောက်ပါ payment method ထဲမှ သင်သုံးမည့်နည်းလမ်းကို ရွေးပါ။'
      : '1. Choose the payment method you will use below.',
    isMyanmar
      ? '2. ပေးချေပြီးနောက် screenshot ကို ဤ chat ထဲသို့ ပြန်ပို့ပါ။'
      : '2. Complete the payment and send the screenshot back in this chat.',
    isMyanmar
      ? '3. Admin approval ပြီးသည်နှင့် access details ကို ဤနေရာတွင် ပို့ပေးပါမည်။'
      : '3. After admin approval, your access details will be delivered here.',
  );

  const paymentMethods = input.paymentMethod
    ? [input.paymentMethod]
    : (input.paymentMethods || []).filter((method) => method.enabled);
  if (paymentMethods.length > 0) {
    lines.push('', `<b>${ui.paymentMethodsLabel}</b>`);
    for (const method of paymentMethods) {
      const label = resolveTelegramSalesPaymentMethodLabel(method, input.locale);
      const note = resolveTelegramSalesPaymentMethodNote(method, input.locale);
      lines.push(`• <b>${escapeHtml(label)}</b>`);
      if (method.accountName?.trim()) {
        lines.push(`  ${ui.accountNameLabel}: ${escapeHtml(method.accountName.trim())}`);
      }
      if (method.accountNumber?.trim()) {
        lines.push(`  ${ui.accountNumberLabel}: <code>${escapeHtml(method.accountNumber.trim())}</code>`);
      }
      if (note) {
        lines.push(`  ${escapeHtml(note)}`);
      }
    }
  } else if (input.paymentMethodLabel?.trim()) {
    lines.push('', `<b>${ui.paymentMethodLabel}</b>: <b>${escapeHtml(input.paymentMethodLabel.trim())}</b>`);
  }

  lines.push('', `<b>${ui.paymentInstructionsLabel}</b>`, escapeHtml(input.paymentInstructions));

  if (input.supportLink) {
    lines.push('', `${ui.supportLabel}: ${escapeHtml(input.supportLink)}`);
  }

  lines.push(
    '',
    isMyanmar ? '<b>Screenshot checklist</b>' : '<b>Screenshot checklist</b>',
    isMyanmar
      ? '• Amount, transfer ID, payment time ကို ရှင်းလင်းစွာ မြင်ရပါမည်။'
      : '• Make sure the amount, transfer ID, and payment time are clearly visible.',
    isMyanmar
      ? '• Photo သို့မဟုတ် document အဖြစ် ပို့နိုင်ပါသည်။'
      : '• You can send it as a photo or a document.',
    isMyanmar
      ? '• Screenshot ပို့ပြီးနောက် ထပ်မံမပို့ဘဲ review စောင့်ပါ။'
      : '• After uploading, wait for review instead of sending duplicates.',
    '',
    ui.paymentProofRequired,
  );

  return lines.join('\n');
}

async function sendTelegramPaymentMethodMedia(input: {
  botToken: string;
  chatId: number | string;
  paymentMethod?: TelegramSalesPaymentMethod | null;
  locale: SupportedLocale;
}) {
  const paymentMethod = input.paymentMethod;
  const imageUrl = paymentMethod?.imageUrl?.trim();
  if (!paymentMethod || !imageUrl) {
    return;
  }

  const ui = getTelegramUi(input.locale);
  const label = resolveTelegramSalesPaymentMethodLabel(paymentMethod, input.locale);
  await sendTelegramPhotoUrl(
    input.botToken,
    input.chatId,
    imageUrl,
    ui.paymentMethodImageCaption(escapeHtml(label)),
  );
}

async function sendTelegramOrderPaymentPromptCard(input: {
  botToken: string;
  chatId: number | string;
  locale: SupportedLocale;
  order: {
    id: string;
    status: string;
    paymentMethodCode?: string | null;
    couponCode?: string | null;
    couponDiscountAmount?: number | null;
    couponDiscountLabel?: string | null;
    originalPriceAmount?: number | null;
    priceCurrency?: string | null;
  };
  orderCode: string;
  planSummary: string;
  paymentInstructions: string;
  paymentMethod?: TelegramSalesPaymentMethod | null;
  paymentMethods?: TelegramSalesPaymentMethod[];
  paymentMethodLabel?: string | null;
  selectedServerName?: string | null;
  requestedName?: string | null;
  renewalTargetName?: string | null;
  supportLink?: string | null;
}) {
  await sendTelegramMessage(
    input.botToken,
    input.chatId,
    buildTelegramSalesPaymentPrompt({
      locale: input.locale,
      orderCode: input.orderCode,
      planSummary: input.planSummary,
      paymentInstructions: input.paymentInstructions,
      paymentMethod: input.paymentMethod,
      paymentMethods: input.paymentMethods,
      paymentMethodLabel: input.paymentMethodLabel,
      selectedServerName: input.selectedServerName,
      requestedName: input.requestedName,
      renewalTargetName: input.renewalTargetName,
      supportLink: input.supportLink,
      couponCode: input.order.couponCode,
      couponDiscountAmount: input.order.couponDiscountAmount,
      couponDiscountLabel: input.order.couponDiscountLabel,
      originalPriceAmount: input.order.originalPriceAmount,
      priceCurrency: input.order.priceCurrency,
    }),
    {
      replyMarkup: buildTelegramOrderActionKeyboard({
        order: input.order,
        locale: input.locale,
      }),
    },
  );

  await sendTelegramPaymentMethodMedia({
    botToken: input.botToken,
    chatId: input.chatId,
    paymentMethod: input.paymentMethod,
    locale: input.locale,
  });
}

async function retryTelegramOrderForUser(input: {
  sourceOrder: Awaited<ReturnType<typeof findTelegramOrderByIdForUser>>;
  chatId: number;
  telegramUserId: number;
  telegramUsername?: string | null;
  locale: SupportedLocale;
  botToken: string;
}) {
  const sourceOrder = input.sourceOrder;
  if (!sourceOrder) {
    throw new Error('Order not found.');
  }

  const salesSettings = await getTelegramSalesSettings();
  const enabledPaymentMethods = listEnabledTelegramSalesPaymentMethods(salesSettings);
  const activeOrder = await getActiveTelegramOrder(input.chatId, input.telegramUserId);
  if (activeOrder?.status === 'PENDING_REVIEW') {
    const ui = getTelegramUi(input.locale);
    throw new Error(ui.activeOrderPendingReview(activeOrder.orderCode));
  }

  await cancelStaleTelegramConversationOrders(input.chatId, input.telegramUserId);

  const hasRenewTarget = Boolean(sourceOrder.targetAccessKeyId || sourceOrder.targetDynamicKeyId);
  const hasReusablePaymentMethod =
    Boolean(sourceOrder.paymentMethodCode) &&
    Boolean(resolveTelegramSalesPaymentMethod(salesSettings, sourceOrder.paymentMethodCode));

  if (
    !sourceOrder.planCode ||
    (sourceOrder.kind === 'RENEW' && !hasRenewTarget) ||
    (sourceOrder.kind === 'NEW' && !sourceOrder.requestedName?.trim())
  ) {
    return sourceOrder.kind === 'RENEW'
      ? handleRenewOrderCommand(
          input.chatId,
          input.telegramUserId,
          input.telegramUsername || '',
          input.locale,
          input.botToken,
        )
      : handleBuyCommand(
          input.chatId,
          input.telegramUserId,
          input.telegramUsername || '',
          input.locale,
          input.botToken,
          'order_retry',
        );
  }

  const nextStatus =
    hasReusablePaymentMethod || enabledPaymentMethods.length === 0
      ? 'AWAITING_PAYMENT_PROOF'
      : 'AWAITING_PAYMENT_METHOD';

  const nextOrder = await db.telegramOrder.create({
    data: {
      orderCode: await generateTelegramOrderCode(),
      kind: sourceOrder.kind,
      status: nextStatus,
      ...buildTelegramOrderPaymentStageFields({
        nextStatus,
      }),
      telegramChatId: String(input.chatId),
      telegramUserId: String(input.telegramUserId),
      telegramUsername: input.telegramUsername || null,
      locale: input.locale,
      requestedName: sourceOrder.requestedName?.trim() || null,
      requestedEmail: sourceOrder.requestedEmail?.trim() || null,
      planCode: sourceOrder.planCode || null,
      planName: sourceOrder.planName || null,
      originalPriceAmount: sourceOrder.originalPriceAmount ?? null,
      priceAmount: sourceOrder.priceAmount ?? null,
      priceCurrency: sourceOrder.priceCurrency || null,
      priceLabel: sourceOrder.priceLabel || null,
      couponCampaignType: sourceOrder.couponCampaignType || null,
      couponCode: sourceOrder.couponCode || null,
      couponDiscountAmount: sourceOrder.couponDiscountAmount ?? null,
      couponDiscountLabel: sourceOrder.couponDiscountLabel || null,
      durationMonths: sourceOrder.durationMonths ?? null,
      durationDays: sourceOrder.durationDays ?? null,
      dataLimitBytes: sourceOrder.dataLimitBytes ?? null,
      unlimitedQuota: sourceOrder.unlimitedQuota ?? false,
      templateId: sourceOrder.templateId || null,
      dynamicTemplateId: sourceOrder.dynamicTemplateId || null,
      deliveryType: sourceOrder.deliveryType || 'ACCESS_KEY',
      selectedServerId: sourceOrder.selectedServerId || null,
      selectedServerName: sourceOrder.selectedServerName || null,
      selectedServerCountryCode: sourceOrder.selectedServerCountryCode || null,
      targetAccessKeyId: sourceOrder.targetAccessKeyId || null,
      targetDynamicKeyId: sourceOrder.targetDynamicKeyId || null,
      paymentMethodCode: hasReusablePaymentMethod ? sourceOrder.paymentMethodCode || null : null,
      paymentMethodLabel: hasReusablePaymentMethod ? sourceOrder.paymentMethodLabel || null : null,
      paymentMethodAccountName: hasReusablePaymentMethod
        ? sourceOrder.paymentMethodAccountName || null
        : null,
      paymentMethodAccountNumber: hasReusablePaymentMethod
        ? sourceOrder.paymentMethodAccountNumber || null
        : null,
      retryOfOrderId: sourceOrder.id,
      retentionSource: 'order_retry',
    },
  });

  const plan = sourceOrder.planCode
    ? resolveTelegramSalesPlan(salesSettings, sourceOrder.planCode as TelegramSalesPlanCode)
    : null;
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
  const planSummary = plan
    ? formatTelegramSalesPlanSummary(plan, nextOrder.durationMonths, input.locale)
    : nextOrder.planName || '';

  if (nextStatus === 'AWAITING_PAYMENT_METHOD') {
    await sendTelegramMessage(
      input.botToken,
      input.chatId,
      buildTelegramPaymentMethodSelectionPromptText({
        orderCode: nextOrder.orderCode,
        locale: input.locale,
        methods: enabledPaymentMethods,
        planSummary,
        selectedServerName: nextOrder.selectedServerName,
        requestedName: nextOrder.requestedName,
        renewalTargetName: renewalTarget?.name || null,
      }),
      {
        replyMarkup: buildTelegramPaymentMethodSelectionKeyboard({
          orderId: nextOrder.id,
          locale: input.locale,
          methods: enabledPaymentMethods,
        }),
      },
    );
  } else {
    const selectedMethod = resolveTelegramSalesPaymentMethod(
      salesSettings,
      nextOrder.paymentMethodCode,
    );
    await sendTelegramOrderPaymentPromptCard({
      botToken: input.botToken,
      chatId: input.chatId,
      locale: input.locale,
      order: nextOrder,
      orderCode: nextOrder.orderCode,
      planSummary,
      paymentInstructions: resolveTelegramSalesPaymentInstructions(salesSettings, input.locale),
      paymentMethod: selectedMethod,
      paymentMethods: selectedMethod ? undefined : enabledPaymentMethods,
      paymentMethodLabel: nextOrder.paymentMethodLabel,
      selectedServerName: nextOrder.selectedServerName,
      requestedName: nextOrder.requestedName,
      renewalTargetName: renewalTarget?.name || null,
      supportLink: await getTelegramSupportLink(),
    });
  }

  return nextOrder;
}

function truncateTelegramButtonLabel(value: string, maxLength = 28) {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength - 1)}…`;
}

function buildTelegramPlanSelectionKeyboard(input: {
  orderId: string;
  plans: TelegramSalesPlan[];
  locale: SupportedLocale;
}) {
  return {
    inline_keyboard: input.plans.map((plan) => {
      const label = resolveTelegramSalesPlanLabel(plan, input.locale);
      const price = resolveTelegramSalesPriceLabel(plan, input.locale);
      return [
        {
          text: truncateTelegramButtonLabel(price ? `${label} • ${price}` : label, 42),
          callback_data: buildTelegramOrderActionCallbackData('pl', input.orderId, plan.code),
        },
      ];
    }),
  };
}

function buildTelegramRenewKeySelectionKeyboard(input: {
  orderId: string;
  keys: Array<{
    id: string;
    name: string;
    kind: 'access' | 'dynamic';
  }>;
  locale: SupportedLocale;
}) {
  const rows = input.keys.slice(0, 8).map((key) => [
    {
      text: truncateTelegramButtonLabel(`🔄 ${key.name}`, 36),
      callback_data: buildTelegramOrderActionCallbackData(
        'ky',
        key.id,
        key.kind === 'dynamic' ? 'dynamic' : undefined,
      ),
    },
  ]);

  rows.push([
    {
      text: getTelegramUi(input.locale).orderActionCancel,
      callback_data: buildTelegramOrderActionCallbackData('ca', input.orderId),
    },
  ]);

  return {
    inline_keyboard: rows,
  };
}

async function listAssignableTelegramOrderServers() {
  const servers = await db.server.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      countryCode: true,
      isDefault: true,
      sortOrder: true,
      lifecycleMode: true,
      isActive: true,
    },
    orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  });

  return servers.filter((server) => canAssignKeysToServer(server).allowed);
}

function buildTelegramServerSelectionKeyboard(input: {
  orderId: string;
  locale: SupportedLocale;
  servers: Awaited<ReturnType<typeof listAssignableTelegramOrderServers>>;
}) {
  const ui = getTelegramUi(input.locale);
  const rows: Array<Array<{ text: string; callback_data: string }>> = [
    [
      {
        text: truncateTelegramButtonLabel(`⚡ ${ui.serverAutoSelect}`, 38),
        callback_data: buildTelegramOrderActionCallbackData('sv', input.orderId, 'auto'),
      },
    ],
  ];

  for (const server of input.servers.slice(0, 8)) {
    rows.push([
      {
        text: truncateTelegramButtonLabel(`🖥 ${formatTelegramServerChoiceLabel(server, ui)}`, 38),
        callback_data: buildTelegramOrderActionCallbackData('sv', input.orderId, server.id),
      },
    ]);
  }

  rows.push([
    {
      text: ui.orderActionCancel,
      callback_data: buildTelegramOrderActionCallbackData('ca', input.orderId),
    },
  ]);

  return {
    inline_keyboard: rows,
  };
}

function buildTelegramServerSelectionPromptText(input: {
  orderCode: string;
  locale: SupportedLocale;
  servers: Awaited<ReturnType<typeof listAssignableTelegramOrderServers>>;
}) {
  const ui = getTelegramUi(input.locale);
  const lines = [
    ui.orderServerPrompt(input.orderCode),
    `1. ${ui.serverAutoSelect}`,
    ...input.servers.map((server, index) => `${index + 2}. ${formatTelegramServerChoiceLabel(server, ui)}`),
  ];

  return buildTelegramSalesPlanPromptText(input.locale, lines);
}

function buildTelegramServerChangeKeySelectionKeyboard(input: {
  locale: SupportedLocale;
  keys: Array<{
    id: string;
    name: string;
    currentServerName: string;
    remainingChanges: number;
    limit: number;
  }>;
}) {
  const rows = input.keys.slice(0, 8).map((key) => [
    {
      text: truncateTelegramButtonLabel(`🛠 ${key.name} • ${key.remainingChanges}/${key.limit}`, 38),
      callback_data: buildTelegramServerChangeActionCallbackData('ky', key.id),
    },
  ]);

  rows.push([
    {
      text: getTelegramUi(input.locale).orderActionCancel,
      callback_data: buildTelegramServerChangeActionCallbackData('ca', 'list'),
    },
  ]);

  return {
    inline_keyboard: rows,
  };
}

function buildTelegramServerChangeSelectionKeyboard(input: {
  accessKeyId: string;
  locale: SupportedLocale;
  servers: Awaited<ReturnType<typeof listAssignableTelegramOrderServers>>;
}) {
  const ui = getTelegramUi(input.locale);
  const rows = input.servers.slice(0, 8).map((server) => [
    {
      text: truncateTelegramButtonLabel(`🖥 ${formatTelegramServerChoiceLabel(server, ui)}`, 38),
      callback_data: buildTelegramServerChangeActionCallbackData('sv', input.accessKeyId, server.id),
    },
  ]);

  rows.push([
    {
      text: ui.orderActionCancel,
      callback_data: buildTelegramServerChangeActionCallbackData('ca', input.accessKeyId),
    },
  ]);

  return {
    inline_keyboard: rows,
  };
}

function buildTelegramServerChangeSupportKeyboard(
  locale: SupportedLocale,
  supportLink?: string | null,
) {
  const ui = getTelegramUi(locale);
  const rows: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [[
    {
      text: ui.orderActionBuyNewKey,
      callback_data: buildTelegramOrderActionCallbackData('by', 'server-change'),
    },
  ]];

  if (supportLink) {
    rows.push([
      {
        text: ui.getSupport,
        url: supportLink,
      },
    ]);
  }

  return {
    inline_keyboard: rows,
  };
}

function buildTelegramServerChangePendingKeyboard(
  requestId: string,
  locale: SupportedLocale,
  supportLink?: string | null,
) {
  const ui = getTelegramUi(locale);
  const rows: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [[
    {
      text: ui.orderActionCheckStatus,
      callback_data: buildTelegramServerChangeActionCallbackData('st', requestId),
    },
  ]];

  if (supportLink) {
    rows.push([
      {
        text: ui.getSupport,
        url: supportLink,
      },
    ]);
  }

  return {
    inline_keyboard: rows,
  };
}

async function generateTelegramServerChangeRequestCode(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = `SRV-${generateRandomString(8).toUpperCase()}`;
    const existing = await db.telegramServerChangeRequest.findUnique({
      where: { requestCode: candidate },
      select: { id: true },
    });
    if (!existing) {
      return candidate;
    }
  }

  return `SRV-${Date.now().toString(36).toUpperCase()}`;
}

function buildTelegramPaymentMethodSelectionKeyboard(input: {
  orderId: string;
  locale: SupportedLocale;
  methods: TelegramSalesPaymentMethod[];
}) {
  const rows = input.methods.slice(0, 8).map((method) => [
    {
      text: truncateTelegramButtonLabel(
        `💳 ${resolveTelegramSalesPaymentMethodLabel(method, input.locale)}`,
        38,
      ),
      callback_data: buildTelegramOrderActionCallbackData('pm', input.orderId, method.code),
    },
  ]);

  rows.push([
    {
      text: getTelegramUi(input.locale).orderActionCancel,
      callback_data: buildTelegramOrderActionCallbackData('ca', input.orderId),
    },
  ]);

  return {
    inline_keyboard: rows,
  };
}

function buildTelegramPaymentMethodSelectionPromptText(input: {
  orderCode: string;
  locale: SupportedLocale;
  methods: TelegramSalesPaymentMethod[];
  planSummary: string;
  requestedName?: string | null;
  renewalTargetName?: string | null;
  selectedServerName?: string | null;
  couponCode?: string | null;
  couponDiscountAmount?: number | null;
  couponDiscountLabel?: string | null;
  originalPriceAmount?: number | null;
  priceCurrency?: string | null;
}) {
  const ui = getTelegramUi(input.locale);
  const isMyanmar = input.locale === 'my';
  const lines = [
    ui.orderPaymentMethodPrompt(input.orderCode),
    '',
    `${ui.planLabel}: <b>${escapeHtml(input.planSummary)}</b>`,
  ];

  if (input.requestedName) {
    lines.push(`${ui.requestedNameLabel}: <b>${escapeHtml(input.requestedName)}</b>`);
  }

  if (input.renewalTargetName) {
    lines.push(`${ui.renewalTargetLabel}: <b>${escapeHtml(input.renewalTargetName)}</b>`);
  }

  if (input.selectedServerName) {
    lines.push(`${ui.preferredServerLabel}: <b>${escapeHtml(input.selectedServerName)}</b>`);
  }

  if (input.couponCode) {
    lines.push(`${ui.couponCodeLabel}: <b>${escapeHtml(input.couponCode)}</b>`);
    if (typeof input.originalPriceAmount === 'number' && input.originalPriceAmount > 0) {
      lines.push(
        `${ui.originalPriceLabel}: <b>${escapeHtml(formatTelegramSalesMoneyAmount(input.originalPriceAmount, input.priceCurrency || 'MMK', input.locale))}</b>`,
      );
    }
    const discountText =
      input.couponDiscountLabel?.trim()
      || formatTelegramSalesMoneyAmount(input.couponDiscountAmount ?? null, input.priceCurrency || 'MMK', input.locale);
    if (discountText) {
      lines.push(`${ui.discountLabel}: <b>${escapeHtml(discountText)}</b>`);
    }
  }

  lines.push(
    '',
    isMyanmar
      ? 'အောက်ပါနည်းလမ်းထဲမှ တစ်ခုကို နှိပ်ပါ။ Button မသုံးနိုင်ပါက နံပါတ်ဖြင့် reply လုပ်နိုင်ပါသည်။'
      : 'Tap one of the methods below. If buttons are not available, reply with the method number.',
    '',
    ...input.methods.flatMap((method, index) => {
      const label = resolveTelegramSalesPaymentMethodLabel(method, input.locale);
      const note = resolveTelegramSalesPaymentMethodNote(method, input.locale);
      const methodLines = [`${index + 1}. ${label}`];

      if (method.accountName?.trim()) {
        methodLines.push(`   ${ui.accountNameLabel}: ${escapeHtml(method.accountName.trim())}`);
      }

      if (method.accountNumber?.trim()) {
        methodLines.push(`   ${ui.accountNumberLabel}: <code>${escapeHtml(method.accountNumber.trim())}</code>`);
      }

      if (note) {
        methodLines.push(`   ${escapeHtml(note)}`);
      }

      return methodLines;
    }),
  );

  return buildTelegramSalesPlanPromptText(input.locale, lines);
}

function buildTelegramOrderActionKeyboard(input: {
  order: {
    id: string;
    status: string;
    paymentMethodCode?: string | null;
  };
  locale: SupportedLocale;
}) {
  const ui = getTelegramUi(input.locale);
  const rows: Array<Array<{ text: string; callback_data: string }>> = [];

  if (input.order.status === 'AWAITING_PAYMENT_METHOD') {
    rows.push([
      {
        text: ui.orderActionChoosePaymentMethod,
        callback_data: buildTelegramOrderActionCallbackData('pm', input.order.id),
      },
    ]);
  }

  if (
    input.order.status === 'AWAITING_PAYMENT_PROOF' ||
    input.order.status === 'PENDING_REVIEW'
  ) {
    rows.push([
      {
        text: input.order.paymentMethodCode ? ui.orderActionPayNow : ui.orderActionChoosePaymentMethod,
        callback_data: buildTelegramOrderActionCallbackData(
          input.order.paymentMethodCode ? 'pay' : 'pm',
          input.order.id,
        ),
      },
      {
        text: ui.orderActionUploadProof,
        callback_data: buildTelegramOrderActionCallbackData('up', input.order.id),
      },
    ]);

    if (input.order.paymentMethodCode) {
      rows.push([
        {
          text: ui.orderActionSwitchPaymentMethod,
          callback_data: buildTelegramOrderActionCallbackData('pm', input.order.id),
        },
      ]);
    }
  }

  rows.push([
    {
      text: ui.orderActionCheckStatus,
      callback_data: buildTelegramOrderActionCallbackData('st', input.order.id),
    },
  ]);

  if (input.order.status === 'REJECTED' || input.order.status === 'CANCELLED') {
    rows.push([
      {
        text: ui.orderActionRetryOrder,
        callback_data: buildTelegramOrderActionCallbackData('rt', input.order.id),
      },
    ]);
  }

  if (!isTelegramOrderTerminal(input.order.status)) {
    rows.push([
      {
        text: ui.orderActionCancel,
        callback_data: buildTelegramOrderActionCallbackData('ca', input.order.id),
      },
    ]);
  }

  return rows.length
    ? {
        inline_keyboard: rows,
      }
    : undefined;
}

async function buildTelegramOrderStatusReplyMarkup(input: {
  order: Awaited<ReturnType<typeof findTelegramOrderForUser>>;
  locale: SupportedLocale;
}) {
  if (!input.order) {
    return undefined;
  }

  const rows: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [
    ...(
      buildTelegramOrderActionKeyboard({
        order: input.order,
        locale: input.locale,
      })?.inline_keyboard || []
    ),
  ];
  const ui = getTelegramUi(input.locale);
  const supportLink = await getTelegramSupportLink();

  if (input.order.status === 'FULFILLED') {
    if ((input.order.priceAmount || 0) > 0) {
      rows.push([
        {
          text: ui.receiptActionPrintable,
          url: buildTelegramFinanceDocumentUrl({
            orderCode: input.order.orderCode,
            type: input.order.financeStatus === 'REFUNDED' ? 'refund' : 'receipt',
            format: 'html',
          }),
        },
      ]);
      rows.push([
        {
          text: ui.receiptActionDownloadPdf,
          url: buildTelegramFinanceDocumentUrl({
            orderCode: input.order.orderCode,
            type: input.order.financeStatus === 'REFUNDED' ? 'refund' : 'receipt',
            format: 'pdf',
          }),
        },
      ]);
    }

    const relatedAccessKeyId = input.order.approvedAccessKeyId || input.order.targetAccessKeyId;
    if (relatedAccessKeyId) {
      const key = await db.accessKey.findUnique({
        where: { id: relatedAccessKeyId },
        select: {
          id: true,
          name: true,
          publicSlug: true,
          subscriptionToken: true,
          sharePageEnabled: true,
        },
      });

      if (key) {
        const token = key.subscriptionToken
          ? key.subscriptionToken
          : await ensureAccessKeySubscriptionToken(key.id, key.subscriptionToken);
        const sharePageUrl = key.sharePageEnabled
          ? key.publicSlug
            ? buildShortShareUrl(key.publicSlug, { source: 'telegram_order_status', lang: input.locale })
            : buildSharePageUrl(token, { source: 'telegram_order_status', lang: input.locale })
          : null;

        if (sharePageUrl) {
          rows.unshift([{ text: ui.openSharePage, url: sharePageUrl }]);
        }

        rows.unshift([
          {
            text: ui.orderActionRenewKey,
            callback_data: buildTelegramOrderActionCallbackData('ky', key.id, 'renewal_manual'),
          },
        ]);
      }
    }

    const relatedDynamicKeyId = input.order.approvedDynamicKeyId || input.order.targetDynamicKeyId;
    if (relatedDynamicKeyId) {
      const key = await db.dynamicAccessKey.findUnique({
        where: { id: relatedDynamicKeyId },
        select: {
          id: true,
          publicSlug: true,
          dynamicUrl: true,
          sharePageEnabled: true,
        },
      });

      if (key) {
        const sharePageUrl = key.sharePageEnabled
          ? key.publicSlug
            ? buildDynamicShortShareUrl(key.publicSlug, { source: 'telegram_order_status', lang: input.locale })
            : key.dynamicUrl
              ? buildDynamicSharePageUrl(key.dynamicUrl, { source: 'telegram_order_status', lang: input.locale })
              : null
          : null;
        if (sharePageUrl) {
          rows.unshift([{ text: ui.openSharePage, url: sharePageUrl }]);
        }

        rows.unshift([
          {
            text: ui.premiumRenewNow,
            callback_data: buildTelegramOrderActionCallbackData('ky', key.id, 'dynamic_renewal_7d'),
          },
        ]);
      }
    }
  }

  if (
    input.order.status === 'FULFILLED' &&
    !input.order.refundRequestStatus &&
    input.order.financeStatus !== 'REFUNDED'
  ) {
    const refundEligibility = await evaluateTelegramOrderRefundEligibility(input.order);
    if (refundEligibility.eligible) {
      rows.push([
        {
          text: ui.orderActionRequestRefund,
          callback_data: buildTelegramOrderActionCallbackData('rf', input.order.id),
        },
      ]);
    }
  }

  if (supportLink && input.order.status !== 'PENDING_REVIEW') {
    rows.push([{ text: ui.getSupport, url: supportLink }]);
  }

  return rows.length ? { inline_keyboard: rows } : undefined;
}

async function listAvailableTelegramPlansForOrder(input: {
  kind: 'NEW' | 'RENEW';
  chatId: number;
  telegramUserId: number;
  settings: Awaited<ReturnType<typeof getTelegramSalesSettings>>;
  deliveryType?: 'ACCESS_KEY' | 'DYNAMIC_KEY' | null;
}) {
  const freeTrialEligible =
    input.kind === 'NEW'
      ? await isEligibleForTelegramFreeTrial(input.chatId, input.telegramUserId)
      : false;

  return input.settings.plans.filter((plan) => {
    if (!plan.enabled) {
      return false;
    }

    if (input.kind === 'RENEW' && plan.code === 'trial_1d_3gb') {
      return false;
    }

    if (plan.code === 'trial_1d_3gb' && !freeTrialEligible) {
      return false;
    }

    if (input.deliveryType && plan.deliveryType !== input.deliveryType) {
      return false;
    }

    return true;
  });
}

async function findTelegramOrderByIdForUser(input: {
  orderId: string;
  chatId: number;
  telegramUserId: number;
}) {
  return db.telegramOrder.findFirst({
    where: {
      id: input.orderId,
      OR: [
        { telegramChatId: String(input.chatId) },
        { telegramUserId: String(input.telegramUserId) },
      ],
    },
  });
}

function getTelegramOrderDynamicKeyMessagingUrls(
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
) {
  const maybeNamedKey = dynamicKey as typeof dynamicKey & { name?: string | null };
  return getDynamicKeyMessagingUrls(
    {
      ...dynamicKey,
      name: maybeNamedKey.name?.trim() || 'Premium Key',
    },
    source,
    locale,
  );
}

async function sendTelegramOrderStatusCard(input: {
  botToken: string;
  chatId: number;
  order: TelegramUserOrder;
  locale: SupportedLocale;
  appendLatestHint?: boolean;
}) {
  if (!input.order) {
    return false;
  }

  const message = await buildTelegramOrderStatusMessage({
    order: input.order,
    locale: input.locale,
    ensureAccessKeySubscriptionToken,
    getDynamicKeyMessagingUrls: getTelegramOrderDynamicKeyMessagingUrls,
  });

  if (!message) {
    return false;
  }

  const ui = getTelegramUi(input.locale);
  const text = input.appendLatestHint ? `${message}\n\n${ui.ordersLatestActiveHint}` : message;
  const replyMarkup = await buildTelegramOrderStatusReplyMarkup({
    order: input.order,
    locale: input.locale,
  });
  return sendTelegramMessage(input.botToken, input.chatId, text, {
    replyMarkup,
  });
}

async function createTelegramOrderRecord(input: {
  kind: 'NEW' | 'RENEW';
  chatId: number;
  telegramUserId: number;
  telegramUsername?: string;
  locale: SupportedLocale;
  initialStatus: TelegramOrderActiveStatus;
  targetAccessKeyId?: string | null;
  targetDynamicKeyId?: string | null;
  planCode?: TelegramSalesPlanCode | null;
  deliveryType?: 'ACCESS_KEY' | 'DYNAMIC_KEY';
  templateId?: string | null;
  dynamicTemplateId?: string | null;
  durationMonths?: number | null;
  durationDays?: number | null;
  dataLimitBytes?: bigint | null;
  unlimitedQuota?: boolean;
  requestedName?: string | null;
  selectedServerId?: string | null;
  selectedServerName?: string | null;
  selectedServerCountryCode?: string | null;
  retryOfOrderId?: string | null;
  retentionSource?: TelegramRetentionSource | null;
  couponCampaignType?: string | null;
  couponCode?: string | null;
  couponDiscountAmount?: number | null;
  couponDiscountLabel?: string | null;
}) {
  const orderCode = await generateTelegramOrderCode();
  return db.telegramOrder.create({
    data: {
      orderCode,
      kind: input.kind,
      status: input.initialStatus,
      ...buildTelegramOrderPaymentStageFields({
        nextStatus: input.initialStatus,
      }),
      telegramChatId: String(input.chatId),
      telegramUserId: String(input.telegramUserId),
      telegramUsername: input.telegramUsername || null,
      locale: input.locale,
      targetAccessKeyId: input.targetAccessKeyId || null,
      targetDynamicKeyId: input.targetDynamicKeyId || null,
      planCode: input.planCode || null,
      deliveryType: input.deliveryType || 'ACCESS_KEY',
      templateId: input.templateId || null,
      dynamicTemplateId: input.dynamicTemplateId || null,
      durationMonths: input.durationMonths ?? null,
      durationDays: input.durationDays ?? null,
      dataLimitBytes: input.dataLimitBytes ?? null,
      unlimitedQuota: input.unlimitedQuota ?? false,
      requestedName: input.requestedName || null,
      selectedServerId: input.selectedServerId ?? null,
      selectedServerName: input.selectedServerName ?? null,
      selectedServerCountryCode: input.selectedServerCountryCode ?? null,
      retryOfOrderId: input.retryOfOrderId ?? null,
      retentionSource: input.retentionSource ?? null,
      couponCampaignType: input.couponCampaignType ?? null,
      couponCode: input.couponCode?.trim().toUpperCase() || null,
      couponDiscountAmount:
        typeof input.couponDiscountAmount === 'number' && Number.isFinite(input.couponDiscountAmount)
          ? Math.max(0, Math.floor(input.couponDiscountAmount))
          : null,
      couponDiscountLabel: input.couponDiscountLabel?.trim() || null,
    },
  });
}

async function createTelegramServerChangeRequestRecord(input: {
  chatId: number;
  telegramUserId: number;
  telegramUsername?: string;
  locale: SupportedLocale;
  accessKey: {
    id: string;
    serverId: string;
    server: {
      name: string;
      countryCode?: string | null;
    };
  };
  requestedServer: {
    id: string;
    name: string;
    countryCode?: string | null;
  };
}) {
  const requestCode = await generateTelegramServerChangeRequestCode();
  return db.telegramServerChangeRequest.create({
    data: {
      requestCode,
      status: 'PENDING_REVIEW',
      telegramChatId: String(input.chatId),
      telegramUserId: String(input.telegramUserId),
      telegramUsername: input.telegramUsername || null,
      locale: input.locale,
      accessKeyId: input.accessKey.id,
      currentServerId: input.accessKey.serverId,
      currentServerName: input.accessKey.server.name,
      currentServerCountryCode: input.accessKey.server.countryCode || null,
      requestedServerId: input.requestedServer.id,
      requestedServerName: input.requestedServer.name,
      requestedServerCountryCode: input.requestedServer.countryCode || null,
    },
  });
}

async function resolveTelegramCouponForOrderStart(input: {
  chatId: number;
  telegramUserId: number;
  source?: string | null;
  couponCode?: string | null;
  accessKeyId?: string | null;
  dynamicAccessKeyId?: string | null;
}) {
  return findTelegramApplicableCoupon({
    telegramChatId: String(input.chatId),
    telegramUserId: String(input.telegramUserId),
    source: input.source ?? null,
    couponCode: input.couponCode ?? null,
    accessKeyId: input.accessKeyId ?? null,
    dynamicAccessKeyId: input.dynamicAccessKeyId ?? null,
  });
}

function buildTelegramCouponReadyLines(input: {
  locale: SupportedLocale;
  couponCode?: string | null;
  couponDiscountAmount?: number | null;
  priceCurrency?: string | null;
  couponDiscountLabel?: string | null;
  unavailableReason?: TelegramCouponAvailabilityReason | null;
  requestedCouponCode?: string | null;
}) {
  const ui = getTelegramUi(input.locale);

  if (!input.couponCode) {
    if (!input.unavailableReason) {
      return [];
    }

    const requestedCode = input.requestedCouponCode?.trim()
      ? escapeHtml(input.requestedCouponCode.trim())
      : null;
    const unavailableLine =
      input.unavailableReason === 'EXPIRED'
        ? ui.couponUnavailableExpired(requestedCode)
        : input.unavailableReason === 'REVOKED'
          ? ui.couponUnavailableRevoked(requestedCode)
          : input.unavailableReason === 'CONSUMED'
            ? ui.couponUnavailableConsumed(requestedCode)
            : input.unavailableReason === 'MANUAL_BLOCK'
              ? ui.couponUnavailableBlocked(requestedCode)
              : ui.couponUnavailableNotFound(requestedCode);

    return [
      '',
      unavailableLine,
      ui.couponUnavailableContinueHint,
    ].filter(Boolean);
  }

  const discountLabel = input.couponDiscountLabel?.trim()
    || formatTelegramSalesMoneyAmount(
      input.couponDiscountAmount ?? null,
      input.priceCurrency || 'MMK',
      input.locale,
    );

  return [
    '',
    `${ui.couponCodeLabel}: <b>${escapeHtml(input.couponCode)}</b>`,
    discountLabel
      ? `${ui.discountLabel}: <b>${escapeHtml(discountLabel)}</b>`
      : '',
    ui.couponReadyHint,
  ].filter(Boolean);
}

async function findTelegramServerChangeRequestByIdForUser(input: {
  requestId: string;
  chatId: number;
  telegramUserId: number;
}) {
  return db.telegramServerChangeRequest.findFirst({
    where: {
      id: input.requestId,
      telegramChatId: String(input.chatId),
      telegramUserId: String(input.telegramUserId),
    },
    include: {
      accessKey: {
        include: {
          server: true,
          user: true,
        },
      },
    },
  });
}

async function sendTelegramOrderReviewAlert(
  orderId: string,
  mode: 'initial' | 'reminder' | 'updated' = 'initial',
) {
  const config = await getTelegramConfig();
  if (!config || config.adminChatIds.length === 0) {
    return;
  }

  const order = await db.telegramOrder.findUnique({
    where: { id: orderId },
    include: {
      reviewedBy: { select: { id: true, email: true } },
    },
  });

  if (!order) {
    return;
  }

  const locale = coerceSupportedLocale(order.locale) || (await getTelegramDefaultLocale());
  const ui = getTelegramUi(locale);
  const isMyanmar = locale === 'my';
  const panelUrl = await buildTelegramOrderPanelUrl(order.id);
  const reviewFocusLines = isMyanmar
    ? [
        '<b>Review checklist</b>',
        '• screenshot ရှင်းလင်းမှု',
        '• amount / method / plan ကိုက်ညီမှု',
        '• duplicate proof warning ရှိ/မရှိ',
      ]
    : [
        '<b>Review checklist</b>',
        '• screenshot clarity',
        '• amount / method / plan match',
        '• duplicate-proof warning',
      ];
  const lines = [
    mode === 'reminder' ? ui.orderReviewReminderTitle : ui.orderReviewAlertTitle,
    '',
    `🧾 <b>${escapeHtml(order.orderCode)}</b> • ${escapeHtml(order.planName || order.planCode || '—')}`,
    order.priceLabel ? `💰 ${ui.priceLabel}: <b>${escapeHtml(order.priceLabel)}</b>` : '',
    `${ui.requesterLabel}: <b>${escapeHtml(order.telegramUsername || order.telegramUserId)}</b>`,
    `${ui.telegramIdLabel}: <code>${escapeHtml(order.telegramUserId)}</code>`,
    order.paymentSubmittedAt
      ? `${ui.paymentSubmittedLabel}: ${escapeHtml(formatTelegramDateTime(order.paymentSubmittedAt, locale))}`
      : '',
    `${ui.paymentProofLabel}: ${escapeHtml(order.paymentProofType || 'photo')}`,
    order.paymentMethodLabel ? `${ui.paymentMethodLabel}: <b>${escapeHtml(order.paymentMethodLabel)}</b>` : '',
    order.selectedServerName ? `${ui.preferredServerLabel}: <b>${escapeHtml(order.selectedServerName)}</b>` : '',
    order.duplicateProofOrderCode
      ? ui.duplicateProofWarning(escapeHtml(order.duplicateProofOrderCode))
      : '',
    order.requestedName ? `${ui.requestedNameLabel}: <b>${escapeHtml(order.requestedName)}</b>` : '',
    order.targetAccessKeyId ? `${ui.renewalTargetLabel}: <code>${escapeHtml(order.targetAccessKeyId)}</code>` : '',
    '',
    ...reviewFocusLines,
    '',
    isMyanmar
      ? 'မူရင်း screenshot ကို နောက်မက်ဆေ့ခ်ျတွင် copy လုပ်ပေးထားပါမည်။'
      : 'The original screenshot will be copied into the next admin message.',
    '',
    `${ui.orderReviewPanelLabel}: ${panelUrl}`,
  ]
    .filter(Boolean)
    .join('\n');

  for (const adminChatId of config.adminChatIds) {
    await sendTelegramMessage(config.botToken, adminChatId, lines, {
      replyMarkup: {
        inline_keyboard: [
          [
            {
              text: ui.orderApproveActionLabel,
              callback_data: buildTelegramOrderReviewCallbackData('approve', order.id),
            },
            {
              text: ui.orderRejectActionLabel,
              callback_data: buildTelegramOrderReviewCallbackData('reject', order.id),
            },
          ],
          [{ text: ui.orderReviewPanelLabel, url: panelUrl }],
        ],
      },
    });

    if (order.paymentMessageId) {
      await copyTelegramMessage(
        config.botToken,
        order.telegramChatId,
        order.paymentMessageId,
        adminChatId,
      );
    }
  }
}

async function sendTelegramServerChangeReviewAlert(
  requestId: string,
  mode: 'initial' | 'reminder' = 'initial',
) {
  const config = await getTelegramConfig();
  if (!config || config.adminChatIds.length === 0) {
    return;
  }

  const request = await db.telegramServerChangeRequest.findUnique({
    where: { id: requestId },
    include: {
      accessKey: {
        select: {
          id: true,
          name: true,
          serverChangeCount: true,
          serverChangeLimit: true,
        },
      },
    },
  });

  if (!request) {
    return;
  }

  const locale = coerceSupportedLocale(request.locale) || (await getTelegramDefaultLocale());
  const ui = getTelegramUi(locale);
  const panelUrl = await buildTelegramServerChangePanelUrl(request.id);
  const remainingAfterApproval = Math.max(
    0,
    request.accessKey.serverChangeLimit - (request.accessKey.serverChangeCount + 1),
  );
  const lines = [
    mode === 'reminder' ? ui.serverChangeReviewReminderTitle : ui.serverChangeReviewAlertTitle,
    '',
    `${ui.serverChangeRequestCodeLabel}: <b>${escapeHtml(request.requestCode)}</b>`,
    `${ui.requesterLabel}: <b>${escapeHtml(request.telegramUsername || request.telegramUserId)}</b>`,
    `${ui.telegramIdLabel}: <code>${escapeHtml(request.telegramUserId)}</code>`,
    `${ui.keyLabel}: <b>${escapeHtml(request.accessKey.name)}</b>`,
    `${ui.currentServerLabel}: <b>${escapeHtml(request.currentServerName)}${request.currentServerCountryCode ? ` ${getFlagEmoji(request.currentServerCountryCode)}` : ''}</b>`,
    `${ui.requestedServerLabel}: <b>${escapeHtml(request.requestedServerName)}${request.requestedServerCountryCode ? ` ${getFlagEmoji(request.requestedServerCountryCode)}` : ''}</b>`,
    `${ui.remainingChangesLabel}: <b>${remainingAfterApproval}</b>`,
    '',
    `${ui.serverChangeReviewPanelLabel}: ${panelUrl}`,
  ].join('\n');

  for (const adminChatId of config.adminChatIds) {
    await sendTelegramMessage(config.botToken, adminChatId, lines, {
      replyMarkup: {
        inline_keyboard: [
          [
            {
              text: ui.serverChangeApproveActionLabel,
              callback_data: buildTelegramServerChangeReviewCallbackData('approve', request.id),
            },
            {
              text: ui.serverChangeRejectActionLabel,
              callback_data: buildTelegramServerChangeReviewCallbackData('reject', request.id),
            },
          ],
          [{ text: ui.serverChangeReviewPanelLabel, url: panelUrl }],
        ],
      },
    });
  }
}

async function sendTelegramPremiumSupportReviewAlert(
  requestId: string,
  mode: 'initial' | 'updated' = 'initial',
) {
  const request = await db.telegramPremiumSupportRequest.findUnique({
    where: { id: requestId },
  });

  if (!request) {
    return;
  }

  await sendTelegramPremiumSupportAlert({
    requestPanelId: request.id,
    requestCode: request.requestCode,
    dynamicAccessKeyId: request.dynamicAccessKeyId,
    requestType: request.requestType as 'REGION_CHANGE' | 'ROUTE_ISSUE',
    telegramChatId: request.telegramChatId,
    telegramUserId: request.telegramUserId,
    telegramUsername: request.telegramUsername,
    locale: coerceSupportedLocale(request.locale) || (await getTelegramDefaultLocale()),
    requestedRegionCode: request.requestedRegionCode,
  });

  if (mode === 'updated') {
    await writeAuditLog({
      action: 'TELEGRAM_PREMIUM_SUPPORT_REVIEW_ALERT_SENT',
      entity: 'TELEGRAM_PREMIUM_SUPPORT_REQUEST',
      entityId: request.id,
      details: {
        requestCode: request.requestCode,
        requestType: request.requestType,
      },
    });
  }
}

function buildTelegramServerChangeStatusMessage(input: {
  locale: SupportedLocale;
  request: {
    requestCode: string;
    status: string;
    currentServerName: string;
    currentServerCountryCode?: string | null;
    requestedServerName: string;
    requestedServerCountryCode?: string | null;
    createdAt: Date;
    customerMessage?: string | null;
    accessKey: {
      name: string;
      serverChangeCount: number;
      serverChangeLimit: number;
    };
  };
}) {
  const ui = getTelegramUi(input.locale);
  const { request } = input;
  const currentServer = `${request.currentServerName}${request.currentServerCountryCode ? ` ${getFlagEmoji(request.currentServerCountryCode)}` : ''}`;
  const requestedServer = `${request.requestedServerName}${request.requestedServerCountryCode ? ` ${getFlagEmoji(request.requestedServerCountryCode)}` : ''}`;
  const remainingChanges = Math.max(
    0,
    request.accessKey.serverChangeLimit - request.accessKey.serverChangeCount,
  );

  const lines = [
    ui.serverChangeStatusTitle,
    '',
    `${ui.serverChangeRequestCodeLabel}: <b>${escapeHtml(request.requestCode)}</b>`,
    `${ui.keyLabel}: <b>${escapeHtml(request.accessKey.name)}</b>`,
    `${ui.currentServerLabel}: <b>${escapeHtml(currentServer)}</b>`,
    `${ui.requestedServerLabel}: <b>${escapeHtml(requestedServer)}</b>`,
    `${ui.statusLineLabel}: <b>${escapeHtml(request.status)}</b>`,
    `${ui.remainingChangesLabel}: <b>${remainingChanges}</b>`,
    `${ui.createdAtLabel}: ${escapeHtml(formatDateTime(request.createdAt))}`,
  ];

  if (request.customerMessage) {
    lines.push('', escapeHtml(request.customerMessage));
  }

  return lines.join('\n');
}

type TelegramRenewableKeyOption = {
  id: string;
  name: string;
  kind: 'access' | 'dynamic';
  status: string;
};

function matchTelegramRenewableKeyOption(
  query: string,
  options: TelegramRenewableKeyOption[],
) {
  const trimmed = query.trim();
  if (!trimmed) {
    return null;
  }

  return (
    options.find((key) => key.id === trimmed || key.name.toLowerCase() === trimmed.toLowerCase()) ||
    options.find((key) => key.name.toLowerCase().includes(trimmed.toLowerCase())) ||
    null
  );
}

async function sendTelegramRenewalPlanSelection(input: {
  orderId: string;
  orderCode: string;
  chatId: number;
  telegramUserId: number;
  locale: SupportedLocale;
  botToken: string;
  salesSettings: Awaited<ReturnType<typeof getTelegramSalesSettings>>;
  targetKey: TelegramRenewableKeyOption;
}) {
  const ui = getTelegramUi(input.locale);
  const enabledPlans = await listAvailableTelegramPlansForOrder({
    kind: 'RENEW',
    chatId: input.chatId,
    telegramUserId: input.telegramUserId,
    settings: input.salesSettings,
    deliveryType: input.targetKey.kind === 'dynamic' ? 'DYNAMIC_KEY' : 'ACCESS_KEY',
  });

  const existingOrder = await db.telegramOrder.findUnique({
    where: { id: input.orderId },
    select: {
      retentionSource: true,
    },
  });
  const resolvedCoupon = await resolveTelegramCouponForOrderStart({
    chatId: input.chatId,
    telegramUserId: input.telegramUserId,
    source: existingOrder?.retentionSource ?? null,
    accessKeyId: input.targetKey.kind === 'access' ? input.targetKey.id : null,
    dynamicAccessKeyId: input.targetKey.kind === 'dynamic' ? input.targetKey.id : null,
  });

  await db.telegramOrder.update({
    where: { id: input.orderId },
    data: {
      targetAccessKeyId: input.targetKey.kind === 'access' ? input.targetKey.id : null,
      targetDynamicKeyId: input.targetKey.kind === 'dynamic' ? input.targetKey.id : null,
      status: 'AWAITING_PLAN',
      couponCampaignType: resolvedCoupon?.coupon?.campaignType || null,
      couponCode: resolvedCoupon?.coupon?.couponCode || null,
      couponDiscountAmount: resolvedCoupon?.coupon?.couponDiscountAmount ?? null,
      couponDiscountLabel: resolvedCoupon?.coupon?.couponDiscountLabel || null,
    },
  });

  const lines = [
    ui.orderPlanPrompt(input.orderCode),
    `${ui.renewalTargetLabel}: <b>${escapeHtml(input.targetKey.name)}</b>`,
    '',
    ...buildTelegramCouponReadyLines({
      locale: input.locale,
      couponCode: resolvedCoupon?.coupon?.couponCode || null,
      couponDiscountAmount: resolvedCoupon?.coupon?.couponDiscountAmount ?? null,
      couponDiscountLabel: resolvedCoupon?.coupon?.couponDiscountLabel || null,
      unavailableReason: resolvedCoupon?.unavailableReason || null,
      requestedCouponCode: resolvedCoupon?.requestedCouponCode || null,
    }),
    ...(resolvedCoupon?.coupon || resolvedCoupon?.unavailableReason ? [''] : []),
    input.targetKey.kind === 'dynamic' ? ui.renewalBenefitsPremium : ui.renewalBenefitsStandard,
    '',
    ...enabledPlans.map((plan, index) => {
      const label = resolveTelegramSalesPlanLabel(plan, input.locale);
      const price = resolveTelegramSalesPriceLabel(plan, input.locale);
      return `${index + 1}. ${label}${price ? ` - ${price}` : ''}`;
    }),
  ];

  await sendTelegramMessage(
    input.botToken,
    input.chatId,
    buildTelegramSalesPlanPromptText(input.locale, lines),
    {
      replyMarkup: buildTelegramPlanSelectionKeyboard({
        orderId: input.orderId,
        plans: enabledPlans,
        locale: input.locale,
      }),
    },
  );
}

async function handleTelegramOrderProofMessage(input: {
  botToken: string;
  chatId: number;
  telegramUserId: number;
  messageId: number;
  photo?: TelegramMessage['photo'];
  document?: TelegramMessage['document'];
  caption?: string;
}) {
  return handleTelegramOrderProofMessageModule({
    ...input,
    deps: {
      sendTelegramOrderReviewAlert,
    },
  });
}

async function handleBuyCommand(
  chatId: number,
  telegramUserId: number,
  username: string,
  locale: SupportedLocale,
  botToken: string,
  retentionSource?: TelegramRetentionSource | null,
  argsText?: string,
): Promise<string | null> {
  return handleTelegramBuyCommand({
    chatId,
    telegramUserId,
    username,
    locale,
    botToken,
    argsText,
    retentionSource: retentionSource ?? null,
    deps: {
      createTelegramOrderRecord,
      resolveTelegramCouponForOrderStart,
      attachTelegramCouponToOrder: async (input: {
        orderId: string;
        coupon: {
          campaignType: string;
          couponCode: string;
          couponDiscountAmount: number;
          couponDiscountLabel?: string | null;
        };
      }) =>
        db.telegramOrder.update({
          where: { id: input.orderId },
          data: {
            couponCampaignType: input.coupon.campaignType,
            couponCode: input.coupon.couponCode,
            couponDiscountAmount: input.coupon.couponDiscountAmount,
            couponDiscountLabel: input.coupon.couponDiscountLabel?.trim() || null,
          },
        }),
      buildTelegramCouponReadyLines,
      listAvailableTelegramPlansForOrder,
      buildTelegramSalesPlanPromptText,
      buildTelegramPlanSelectionKeyboard,
    },
  });
}

async function handleTrialCommand(
  chatId: number,
  telegramUserId: number,
  username: string,
  locale: SupportedLocale,
  botToken: string,
): Promise<string | null> {
  const ui = getTelegramUi(locale);
  const settings = await getTelegramSalesSettings();

  if (!settings.enabled) {
    return ui.buyDisabled;
  }

  const trialPlan = resolveTelegramSalesPlan(settings, 'trial_1d_3gb');
  if (!trialPlan?.enabled) {
    return ui.freeTrialUnavailable;
  }

  if (!(await isEligibleForTelegramFreeTrial(chatId, telegramUserId))) {
    return ui.freeTrialUnavailable;
  }

  const existing = await getActiveTelegramOrder(chatId, telegramUserId);
  if (existing?.status === 'PENDING_REVIEW') {
    return ui.activeOrderPendingReview(existing.orderCode);
  }

  await cancelStaleTelegramConversationOrders(chatId, telegramUserId);

  const planLabel = resolveTelegramSalesPlanLabel(trialPlan, locale);
  const priceLabel = resolveTelegramSalesPriceLabel(trialPlan, locale);
  const dataLimitBytes = trialPlan.dataLimitGB
    ? BigInt(trialPlan.dataLimitGB) * BigInt(1024 * 1024 * 1024)
    : null;

  const order = await db.telegramOrder.create({
    data: {
      orderCode: await generateTelegramOrderCode(),
      kind: 'NEW',
      status: 'AWAITING_SERVER_SELECTION',
      ...buildTelegramOrderPaymentStageFields({
        nextStatus: 'AWAITING_SERVER_SELECTION',
      }),
      telegramChatId: String(chatId),
      telegramUserId: String(telegramUserId),
      telegramUsername: username,
      locale,
      planCode: trialPlan.code,
      planName: priceLabel ? `${planLabel} (${priceLabel})` : planLabel,
      priceAmount: trialPlan.priceAmount ?? null,
      priceCurrency: trialPlan.priceCurrency || null,
      priceLabel: priceLabel || null,
      templateId: trialPlan.templateId || null,
      durationMonths: trialPlan.fixedDurationMonths ?? null,
      durationDays: trialPlan.fixedDurationDays ?? 1,
      dataLimitBytes,
      unlimitedQuota: trialPlan.unlimitedQuota,
    },
  });

  const servers = await listAssignableTelegramOrderServers();
  const message = buildTelegramServerSelectionPromptText({
    orderCode: order.orderCode,
    locale,
    servers,
  });

  const sent = await sendTelegramMessage(botToken, chatId, message, {
    replyMarkup: buildTelegramServerSelectionKeyboard({
      orderId: order.id,
      servers,
      locale,
    }),
  });

  return sent ? null : message;
}

async function handleRenewOrderCommand(
  chatId: number,
  telegramUserId: number,
  username: string,
  locale: SupportedLocale,
  botToken: string,
  argsText = '',
): Promise<string | null> {
  return handleTelegramRenewOrderCommand({
    chatId,
    telegramUserId,
    username,
    locale,
    botToken,
    argsText,
    deps: {
      createTelegramOrderRecord,
      matchTelegramRenewableKeyOption,
      sendTelegramRenewalPlanSelection,
      buildTelegramSalesPlanPromptText,
      buildTelegramRenewKeySelectionKeyboard,
    },
  });
}

async function handleTelegramOrderTextMessage(input: {
  chatId: number;
  telegramUserId: number;
  text: string;
  botToken: string;
}) {
  return handleTelegramOrderTextMessageModule({
    ...input,
    deps: {
      listAvailableTelegramPlansForOrder,
      isEligibleForTelegramFreeTrial,
      buildTelegramOrderPlanSnapshot,
      listAssignableTelegramOrderServers,
      buildTelegramServerSelectionPromptText,
      buildTelegramServerSelectionKeyboard,
      buildTelegramPaymentMethodSelectionPromptText,
      buildTelegramPaymentMethodSelectionKeyboard,
      sendTelegramOrderPaymentPromptCard,
      appendTelegramOrderAdminNote,
      resolveTelegramOrderPlanContext,
      fulfillTelegramNewAccessOrder,
      sendAccessKeySharePageToTelegram,
      sendTelegramRenewalPlanSelection,
      matchTelegramRenewableKeyOption,
      buildTelegramSalesPlanPromptText,
      buildTelegramRenewKeySelectionKeyboard,
      sendTelegramOrderReviewAlert,
    },
  });
}

async function getActiveNotificationChannelIds(event: string) {
  const { channelSupportsEvent, parseNotificationChannelRecord } = await import(
    '@/lib/services/notification-channels'
  );

  const channels = await db.notificationChannel.findMany({
    where: {
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      type: true,
      config: true,
      events: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return channels
    .map((channel) => parseNotificationChannelRecord(channel))
    .filter((channel): channel is NonNullable<typeof channel> => Boolean(channel))
    .filter((channel) => channelSupportsEvent(channel, event as never))
    .map((channel) => channel.id);
}

async function enqueueChannelNotification(input: {
  event: string;
  message: string;
  accessKeyId?: string;
  payload?: Record<string, unknown>;
  cooldownKey?: string;
}) {
  const channelIds = await getActiveNotificationChannelIds(input.event);
  if (channelIds.length === 0) {
    return null;
  }

  const { enqueueNotificationsForChannels } = await import('@/lib/services/notification-queue');

  return enqueueNotificationsForChannels({
    channelIds,
    event: input.event,
    message: input.message,
    payload: input.payload,
    accessKeyId: input.accessKeyId,
    cooldownKey: input.cooldownKey,
  });
}

function resolveTelegramTemplate(
  templates: LocalizedTemplateMap | undefined,
  locale: SupportedLocale,
  fallback?: string,
) {
  return resolveLocalizedTemplate(templates, locale, fallback)?.trim() || '';
}

function addMonths(baseDate: Date, months: number) {
  const next = new Date(baseDate);
  next.setMonth(next.getMonth() + months);
  return next;
}

function addDays(baseDate: Date, days: number) {
  const next = new Date(baseDate);
  next.setDate(next.getDate() + days);
  return next;
}

function applyTelegramOrderDuration(input: {
  baseDate: Date;
  durationMonths?: number | null;
  durationDays?: number | null;
}) {
  if (input.durationDays && input.durationDays > 0) {
    return addDays(input.baseDate, input.durationDays);
  }

  return addMonths(input.baseDate, input.durationMonths ?? 1);
}

async function isEligibleForTelegramFreeTrial(chatId: number, telegramUserId: number) {
  const [linkedKeyCount, fulfilledOrders, fulfilledTrialOrder] = await Promise.all([
    db.accessKey.count({
      where: {
        OR: [{ telegramId: String(telegramUserId) }, { user: { telegramChatId: String(chatId) } }],
        status: {
          not: 'ARCHIVED',
        },
      },
    }),
    db.telegramOrder.count({
      where: {
        OR: [{ telegramChatId: String(chatId) }, { telegramUserId: String(telegramUserId) }],
        kind: 'NEW',
        status: 'FULFILLED',
      },
    }),
    db.telegramOrder.count({
      where: {
        OR: [{ telegramChatId: String(chatId) }, { telegramUserId: String(telegramUserId) }],
        kind: 'NEW',
        planCode: 'trial_1d_3gb',
        status: 'FULFILLED',
      },
    }),
  ]);

  return linkedKeyCount === 0 && fulfilledOrders === 0 && fulfilledTrialOrder === 0;
}

async function isGeneratedAccessSlugAvailable(slug: string) {
  if (!slug || !isValidPublicSlug(slug) || isReservedPublicSlug(slug)) {
    return false;
  }

  const [accessMatch, dynamicMatch, historyMatch] = await Promise.all([
    db.accessKey.findFirst({
      where: { publicSlug: slug },
      select: { id: true },
    }),
    db.dynamicAccessKey.findFirst({
      where: { publicSlug: slug },
      select: { id: true },
    }),
    (db as any).accessKeySlugHistory.findUnique({
      where: { slug },
      select: { accessKeyId: true },
    }),
  ]);

  return !accessMatch && !dynamicMatch && !historyMatch;
}

async function resolveGeneratedAccessSlug(name: string, prefix?: string | null) {
  const baseParts = [prefix, slugifyPublicName(name)].filter(Boolean);
  const base = normalizePublicSlug(baseParts.join('-')) || slugifyPublicName(name);

  for (const candidate of buildPublicSlugSuggestionCandidates(base, 10)) {
    if (await isGeneratedAccessSlugAvailable(candidate)) {
      return candidate;
    }
  }

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const candidate = normalizePublicSlug(`${base}-${attempt + 1}`);
    if (candidate && (await isGeneratedAccessSlugAvailable(candidate))) {
      return candidate;
    }
  }

  return null;
}

function isTelegramOrderTerminal(status: string) {
  return TELEGRAM_ORDER_TERMINAL_STATUSES.includes(status as TelegramOrderTerminalStatus);
}

function isTelegramOrderAwaitingPayment(status: string) {
  return status === 'AWAITING_PAYMENT_METHOD' || status === 'AWAITING_PAYMENT_PROOF';
}

function buildTelegramOrderPaymentStageFields(input: {
  nextStatus: string;
  currentStatus?: string | null;
  paymentStageEnteredAt?: Date | null;
  paymentReminderSentAt?: Date | null;
  retryReminderSentAt?: Date | null;
  preserveReminderSentAt?: boolean;
}) {
  return buildTelegramOrderPaymentStageFieldsModule(input);
}

async function getActiveTelegramOrder(chatId: number, telegramUserId: number) {
  return getActiveTelegramOrderModule(chatId, telegramUserId);
}

async function cancelStaleTelegramConversationOrders(chatId: number, telegramUserId: number) {
  await cancelStaleTelegramConversationOrdersModule(chatId, telegramUserId);
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
  return sendTelegramOrderReceiptConfirmationModule(input);
}

export async function runTelegramSalesOrderCycle() {
  const settings = await getTelegramSalesSettings();
  if (!settings.enabled) {
    return {
      skipped: true,
      reminded: 0,
      pendingReviewReminded: 0,
      rejectedFollowUpReminded: 0,
      retryReminded: 0,
      trialCouponReminded: 0,
      renewalCouponReminded: 0,
      premiumUpsellReminded: 0,
      winbackCouponReminded: 0,
      expiredCoupons: 0,
      trialReminded: 0,
      premiumRenewalReminded: 0,
      premiumExpired: 0,
      expired: 0,
      salesDigestSent: false,
      salesDigestAdminChats: 0,
      errors: [] as string[],
    };
  }

  const now = new Date();
  const expiredCoupons = await expireTelegramCoupons(now);
  const reminderMs = Math.max(1, settings.paymentReminderHours) * 60 * 60 * 1000;
  const expiryMs = Math.max(settings.unpaidOrderExpiryHours, settings.paymentReminderHours) * 60 * 60 * 1000;
  const config = await getTelegramConfig();
  const supportLink = config ? await getTelegramSupportLink() : null;
  const orders = await db.telegramOrder.findMany({
    where: {
      status: {
        in: ['AWAITING_PAYMENT_METHOD', 'AWAITING_PAYMENT_PROOF'],
      },
    },
    orderBy: [{ createdAt: 'asc' }],
    select: {
      id: true,
      orderCode: true,
      status: true,
      telegramChatId: true,
      telegramUserId: true,
      locale: true,
      planCode: true,
      planName: true,
      priceAmount: true,
      priceCurrency: true,
      originalPriceAmount: true,
      couponCampaignType: true,
      couponCode: true,
      couponDiscountAmount: true,
      couponDiscountLabel: true,
      durationMonths: true,
      paymentMethodCode: true,
      paymentMethodLabel: true,
      requestedName: true,
      selectedServerName: true,
      targetAccessKeyId: true,
      paymentStageEnteredAt: true,
      paymentReminderSentAt: true,
      reviewReminderSentAt: true,
      retryReminderSentAt: true,
      createdAt: true,
      updatedAt: true,
      adminNote: true,
      retryOfOrderId: true,
    },
  });
  const pendingReviewOrders = await db.telegramOrder.findMany({
    where: {
      status: 'PENDING_REVIEW',
      reviewedAt: null,
    },
    orderBy: [{ paymentSubmittedAt: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      orderCode: true,
      status: true,
      telegramChatId: true,
      telegramUserId: true,
      locale: true,
      planCode: true,
      planName: true,
      durationMonths: true,
      paymentMethodCode: true,
      paymentMethodLabel: true,
      requestedName: true,
      selectedServerName: true,
      targetAccessKeyId: true,
      paymentSubmittedAt: true,
      reviewReminderSentAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  const rejectedOrders = await db.telegramOrder.findMany({
    where: {
      status: 'REJECTED',
      rejectedAt: {
        not: null,
      },
    },
    orderBy: [{ rejectedAt: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      orderCode: true,
      status: true,
      telegramChatId: true,
      telegramUserId: true,
      locale: true,
      paymentMethodCode: true,
      rejectedAt: true,
      rejectedFollowUpSentAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  let reminded = 0;
  let pendingReviewReminded = 0;
  let rejectedFollowUpReminded = 0;
  let retryReminded = 0;
  let trialCouponReminded = 0;
  let renewalCouponReminded = 0;
  let premiumUpsellReminded = 0;
  let winbackCouponReminded = 0;
  let trialReminded = 0;
  let premiumRenewalReminded = 0;
  let premiumExpired = 0;
  let expired = 0;
  let salesDigestSent = false;
  let salesDigestAdminChats = 0;
  const errors: string[] = [];

  for (const order of orders) {
    const baseline = order.paymentStageEnteredAt ?? order.updatedAt ?? order.createdAt;
    const elapsedMs = now.getTime() - baseline.getTime();
    const locale = coerceSupportedLocale(order.locale) || (await getTelegramDefaultLocale());
    const ui = getTelegramUi(locale);

    if (elapsedMs >= expiryMs) {
      try {
        await db.telegramOrder.update({
          where: { id: order.id },
          data: {
            status: 'CANCELLED',
            expiredAt: now,
            paymentStageEnteredAt: null,
            paymentReminderSentAt: null,
            reviewReminderSentAt: null,
            adminNote: appendTelegramOrderAdminNote(
              order.adminNote,
              ui.orderExpiredUnpaidNote,
            ),
          },
        });

        if (config) {
          const lines = [ui.orderExpiredUnpaid(order.orderCode)];
          if (supportLink) {
            lines.push('', `${ui.supportLabel}: ${supportLink}`);
          }
          await sendTelegramMessage(config.botToken, order.telegramChatId, lines.join('\n'), {
            replyMarkup: buildTelegramOrderActionKeyboard({
              order: {
                id: order.id,
                status: 'CANCELLED',
                paymentMethodCode: order.paymentMethodCode,
              },
              locale,
            }),
          });
        }

        await writeAuditLog({
          action: 'TELEGRAM_ORDER_EXPIRED_UNPAID',
          entity: 'TELEGRAM_ORDER',
          entityId: order.id,
          details: {
            orderCode: order.orderCode,
            elapsedHours: Math.round(elapsedMs / (60 * 60 * 1000)),
          },
        });

        expired += 1;
      } catch (error) {
        errors.push(`expire:${order.orderCode}:${(error as Error).message}`);
      }
      continue;
    }

    if (order.paymentReminderSentAt || elapsedMs < reminderMs || !config) {
      continue;
    }

    try {
      const plan = order.planCode
        ? resolveTelegramSalesPlan(settings, order.planCode as TelegramSalesPlanCode)
        : null;
      const planSummary = plan
        ? formatTelegramSalesPlanSummary(plan, order.durationMonths, locale)
        : order.planName || '';
      const renewalTarget = order.targetAccessKeyId
        ? await db.accessKey.findUnique({
            where: { id: order.targetAccessKeyId },
            select: { name: true },
          })
        : null;

      if (order.status === 'AWAITING_PAYMENT_METHOD') {
        const methods = listEnabledTelegramSalesPaymentMethods(settings);
        await sendTelegramMessage(
          config.botToken,
          order.telegramChatId,
          [
            ui.orderPaymentMethodReminder(order.orderCode),
            '',
            buildTelegramPaymentMethodSelectionPromptText({
              orderCode: order.orderCode,
              locale,
              methods,
              planSummary,
              requestedName: order.requestedName,
              renewalTargetName: renewalTarget?.name || null,
              selectedServerName: order.selectedServerName,
            }),
          ].join('\n'),
          {
            replyMarkup: buildTelegramPaymentMethodSelectionKeyboard({
              orderId: order.id,
              locale,
              methods,
            }),
          },
        );
      } else {
        const selectedMethod = resolveTelegramSalesPaymentMethod(settings, order.paymentMethodCode);
        await sendTelegramMessage(
          config.botToken,
          order.telegramChatId,
          ui.orderPaymentProofReminder(order.orderCode),
        );
        await sendTelegramOrderPaymentPromptCard({
          botToken: config.botToken,
          chatId: order.telegramChatId,
          locale,
          order,
          orderCode: order.orderCode,
          planSummary,
          paymentInstructions: resolveTelegramSalesPaymentInstructions(settings, locale),
          paymentMethod: selectedMethod,
          paymentMethodLabel: order.paymentMethodLabel,
          selectedServerName: order.selectedServerName,
          requestedName: order.requestedName,
          renewalTargetName: renewalTarget?.name || null,
          supportLink,
        });
      }

      await db.telegramOrder.update({
        where: { id: order.id },
        data: {
          paymentReminderSentAt: now,
        },
      });

      await writeAuditLog({
        action: 'TELEGRAM_ORDER_PAYMENT_REMINDER_SENT',
        entity: 'TELEGRAM_ORDER',
        entityId: order.id,
        details: {
          orderCode: order.orderCode,
          status: order.status,
          elapsedHours: Math.round(elapsedMs / (60 * 60 * 1000)),
        },
      });

      reminded += 1;
    } catch (error) {
      errors.push(`reminder:${order.orderCode}:${(error as Error).message}`);
    }
  }

  if (config) {
    const retryReminderMs = Math.max(1, settings.retryOrderReminderHours) * 60 * 60 * 1000;
    for (const order of orders) {
      if (!order.retryOfOrderId) {
        continue;
      }

      const baseline = order.paymentStageEnteredAt ?? order.updatedAt ?? order.createdAt;
      const elapsedMs = now.getTime() - baseline.getTime();
      if (order.retryReminderSentAt || elapsedMs < retryReminderMs) {
        continue;
      }

      try {
        const locale = coerceSupportedLocale(order.locale) || (await getTelegramDefaultLocale());
        const ui = getTelegramUi(locale);
        await sendTelegramMessage(
          config.botToken,
          order.telegramChatId,
          [
            ui.orderRetryReminder(order.orderCode),
            '',
            supportLink ? `${ui.supportLabel}: ${supportLink}` : ui.orderSupportHint,
          ].join('\n'),
          {
            replyMarkup: buildTelegramOrderActionKeyboard({
              order,
              locale,
            }),
          },
        );

        await db.telegramOrder.update({
          where: { id: order.id },
          data: {
            retryReminderSentAt: now,
          },
        });

        await writeAuditLog({
          action: 'TELEGRAM_ORDER_RETRY_REMINDER_SENT',
          entity: 'TELEGRAM_ORDER',
          entityId: order.id,
          details: {
            orderCode: order.orderCode,
            elapsedHours: Math.round(elapsedMs / (60 * 60 * 1000)),
          },
        });

        retryReminded += 1;
      } catch (error) {
        errors.push(`retry-reminder:${order.orderCode}:${(error as Error).message}`);
      }
    }

    const pendingReviewReminderMs = Math.max(1, settings.pendingReviewReminderHours) * 60 * 60 * 1000;
    for (const order of pendingReviewOrders) {
      const baseline = order.paymentSubmittedAt ?? order.updatedAt ?? order.createdAt;
      const elapsedMs = now.getTime() - baseline.getTime();
      if (order.reviewReminderSentAt || elapsedMs < pendingReviewReminderMs) {
        continue;
      }

      try {
        await sendTelegramOrderReviewAlert(order.id, 'reminder');
        await db.telegramOrder.update({
          where: { id: order.id },
          data: {
            reviewReminderSentAt: now,
          },
        });

        await writeAuditLog({
          action: 'TELEGRAM_ORDER_PENDING_REVIEW_REMINDER_SENT',
          entity: 'TELEGRAM_ORDER',
          entityId: order.id,
          details: {
            orderCode: order.orderCode,
            elapsedHours: Math.round(elapsedMs / (60 * 60 * 1000)),
          },
        });

        pendingReviewReminded += 1;
      } catch (error) {
        errors.push(`review-reminder:${order.orderCode}:${(error as Error).message}`);
      }
    }

    const rejectedReminderMs = Math.max(1, settings.rejectedOrderReminderHours) * 60 * 60 * 1000;
    const rejectedOrderIds = rejectedOrders.map((order) => order.id);
    const retryCounts = rejectedOrderIds.length
      ? await db.telegramOrder.groupBy({
          by: ['retryOfOrderId'],
          where: {
            retryOfOrderId: { in: rejectedOrderIds },
          },
          _count: {
            _all: true,
          },
        })
      : [];
    const retriedRejectedOrderIds = new Set(
      retryCounts
        .map((row) => row.retryOfOrderId)
        .filter((value): value is string => Boolean(value)),
    );

    for (const order of rejectedOrders) {
      const baseline = order.rejectedAt ?? order.updatedAt ?? order.createdAt;
      const elapsedMs = now.getTime() - baseline.getTime();
      if (
        order.rejectedFollowUpSentAt ||
        elapsedMs < rejectedReminderMs ||
        retriedRejectedOrderIds.has(order.id)
      ) {
        continue;
      }

      try {
        const locale = coerceSupportedLocale(order.locale) || (await getTelegramDefaultLocale());
        const ui = getTelegramUi(locale);
        await sendTelegramMessage(
          config.botToken,
          order.telegramChatId,
          [
            ui.orderRejectedFollowUpReminder(order.orderCode),
            '',
            supportLink ? `${ui.supportLabel}: ${supportLink}` : ui.orderSupportHint,
          ].join('\n'),
          {
            replyMarkup: buildTelegramOrderActionKeyboard({
              order,
              locale,
            }),
          },
        );

        await db.telegramOrder.update({
          where: { id: order.id },
          data: {
            rejectedFollowUpSentAt: now,
          },
        });

        await writeAuditLog({
          action: 'TELEGRAM_ORDER_REJECTED_FOLLOWUP_SENT',
          entity: 'TELEGRAM_ORDER',
          entityId: order.id,
          details: {
            orderCode: order.orderCode,
            elapsedHours: Math.round(elapsedMs / (60 * 60 * 1000)),
          },
        });

        rejectedFollowUpReminded += 1;
      } catch (error) {
        errors.push(`rejected-followup:${order.orderCode}:${(error as Error).message}`);
      }
    }
  }

  const couponCampaignResult = await runTelegramCouponCampaignCycle({ now });
  trialReminded += couponCampaignResult.trialReminded;
  trialCouponReminded += couponCampaignResult.trialCouponReminded;
  renewalCouponReminded += couponCampaignResult.renewalCouponReminded;
  premiumUpsellReminded += couponCampaignResult.premiumUpsellReminded;
  winbackCouponReminded += couponCampaignResult.winbackCouponReminded;
  errors.push(...couponCampaignResult.errors);

  const premiumRenewalCandidates = await db.dynamicAccessKey.findMany({
    where: {
      status: { in: ['ACTIVE', 'PENDING'] },
      expiresAt: {
        not: null,
        lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      },
      tags: {
        contains: ',premium,',
      },
    },
    select: {
      id: true,
      expiresAt: true,
      tags: true,
      expirationWarningStage: true,
    },
  });

  for (const key of premiumRenewalCandidates) {
    if (!key.expiresAt || !tagMatchesFilter(key.tags || '', 'premium')) {
      continue;
    }

    if (key.expiresAt.getTime() <= now.getTime()) {
      try {
        await db.dynamicAccessKey.update({
          where: { id: key.id },
          data: {
            status: 'EXPIRED',
            expirationWarningStage: null,
            lastWarningSentAt: now,
          },
        });

        await sendDynamicKeyExpiryTelegramNotification({
          dynamicAccessKeyId: key.id,
          source: 'premium_expired',
        });

        premiumExpired += 1;
      } catch (error) {
        errors.push(`premium-expired:${key.id}:${(error as Error).message}`);
      }

      continue;
    }

    const remainingMs = key.expiresAt.getTime() - now.getTime();
    const daysLeft = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));
    const nextStage = daysLeft <= 3 ? '3D' : '7D';
    if (key.expirationWarningStage === nextStage) {
      continue;
    }

    try {
      await sendDynamicKeyRenewalReminder({
        dynamicAccessKeyId: key.id,
        daysLeft,
        source: nextStage === '3D' ? 'premium_renewal_3d' : 'premium_renewal_7d',
      });

      await db.dynamicAccessKey.update({
        where: { id: key.id },
        data: {
          expirationWarningStage: nextStage,
          lastWarningSentAt: now,
        },
      });

      premiumRenewalReminded += 1;
    } catch (error) {
      errors.push(`premium-renewal:${key.id}:${(error as Error).message}`);
    }
  }

  try {
    const digestResult = await runTelegramSalesDigestCycle({ now });
    if (!digestResult.skipped) {
      salesDigestSent = true;
      salesDigestAdminChats = digestResult.adminChats;
    }
  } catch (error) {
    errors.push(`sales-digest:${(error as Error).message}`);
  }

  return {
    skipped: false,
    reminded,
    pendingReviewReminded,
    rejectedFollowUpReminded,
    retryReminded,
    trialCouponReminded,
    renewalCouponReminded,
    premiumUpsellReminded,
    winbackCouponReminded,
    expiredCoupons,
    trialReminded,
    premiumRenewalReminded,
    premiumExpired,
    expired,
    salesDigestSent,
    salesDigestAdminChats,
    errors,
  };
}

async function buildTelegramOrderPanelUrl(orderId: string) {
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.NEXTAUTH_URL ||
    'http://localhost:3000';
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
  return `${origin}${basePath}/dashboard/notifications?telegramOrder=${encodeURIComponent(orderId)}`;
}

async function buildTelegramServerChangePanelUrl(requestId: string) {
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.NEXTAUTH_URL ||
    'http://localhost:3000';
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
  return `${origin}${basePath}/dashboard/notifications?serverChangeRequest=${encodeURIComponent(requestId)}`;
}

async function buildTelegramPremiumSupportPanelUrl(requestId: string) {
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.NEXTAUTH_URL ||
    'http://localhost:3000';
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
  return `${origin}${basePath}/dashboard/notifications?premiumSupportRequest=${encodeURIComponent(requestId)}`;
}

async function buildTelegramDynamicKeyPanelUrl(dynamicAccessKeyId: string) {
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.NEXTAUTH_URL ||
    'http://localhost:3000';
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
  return `${origin}${basePath}/dashboard/dynamic-keys/${encodeURIComponent(dynamicAccessKeyId)}`;
}

async function sendTelegramPremiumSupportAlert(input: {
  requestPanelId?: string | null;
  requestCode?: string | null;
  dynamicAccessKeyId: string;
  requestType: 'REGION_CHANGE' | 'ROUTE_ISSUE';
  telegramChatId: string;
  telegramUserId: string;
  telegramUsername?: string | null;
  locale: SupportedLocale;
  requestedRegionCode?: string | null;
}) {
  const config = await getTelegramConfig();
  if (!config || config.adminChatIds.length === 0) {
    return;
  }

  const key = await loadDynamicAccessKeyForMessaging(input.dynamicAccessKeyId);
  if (!key) {
    return;
  }

  const ui = getTelegramUi(input.locale);
  const panelUrl = input.requestPanelId
    ? await buildTelegramPremiumSupportPanelUrl(input.requestPanelId)
    : await buildTelegramDynamicKeyPanelUrl(key.id);
  const poolSummary = formatTelegramDynamicPoolSummary(key, ui);
  const lines = [
    ui.premiumReviewAlertTitle,
    '',
    `${ui.keyLabel}: <b>${escapeHtml(key.name)}</b>`,
    `${ui.requesterLabel}: <b>${escapeHtml(input.telegramUsername || input.telegramUserId)}</b>`,
    `${ui.telegramIdLabel}: <code>${escapeHtml(input.telegramUserId)}</code>`,
    `${ui.planLabel}: <b>${escapeHtml(ui.premiumLabel)}</b>`,
    `${ui.statusLineLabel}: <b>${escapeHtml(key.status)}</b>`,
    `${ui.premiumCurrentPoolLabel}: <b>${escapeHtml(poolSummary)}</b>`,
    `${ui.customerMessage}: <b>${escapeHtml(input.requestType === 'REGION_CHANGE' ? ui.premiumIssueTypeRegion : ui.premiumIssueTypeRoute)}</b>`,
    input.requestedRegionCode
      ? `${ui.premiumRequestedRegionLabel}: <b>${escapeHtml(input.requestedRegionCode)}</b>`
      : '',
    input.requestCode
      ? `${ui.premiumRequestCodeLabel}: <b>${escapeHtml(input.requestCode)}</b>`
      : '',
    '',
    `${ui.premiumReviewPanelLabel}: ${panelUrl}`,
  ]
    .filter(Boolean)
    .join('\n');

  for (const adminChatId of config.adminChatIds) {
    await sendTelegramMessage(config.botToken, adminChatId, lines, {
      replyMarkup: {
        inline_keyboard: [[{ text: ui.premiumReviewPanelLabel, url: panelUrl }]],
      },
    });
  }

  await writeAuditLog({
    action: 'TELEGRAM_PREMIUM_SUPPORT_REQUESTED',
    entity: 'DYNAMIC_ACCESS_KEY',
    entityId: key.id,
    details: {
      requestType: input.requestType,
      telegramChatId: input.telegramChatId,
      telegramUserId: input.telegramUserId,
      telegramUsername: input.telegramUsername ?? null,
      requestedRegionCode: input.requestedRegionCode ?? null,
      panelUrl,
    },
  });
}

async function sendTelegramPremiumSupportFollowUpAlert(input: {
  requestId: string;
  requestCode: string;
  dynamicAccessKeyId: string;
  telegramChatId: string;
  telegramUserId: string;
  telegramUsername?: string | null;
  locale: SupportedLocale;
  message: string;
}) {
  const config = await getTelegramConfig();
  if (!config || config.adminChatIds.length === 0) {
    return;
  }

  const key = await loadDynamicAccessKeyForMessaging(input.dynamicAccessKeyId);
  if (!key) {
    return;
  }

  const ui = getTelegramUi(input.locale);
  const panelUrl = await buildTelegramPremiumSupportPanelUrl(input.requestId);
  const lines = [
    ui.premiumReviewAlertTitle,
    '',
    `${ui.keyLabel}: <b>${escapeHtml(key.name)}</b>`,
    `${ui.requesterLabel}: <b>${escapeHtml(input.telegramUsername || input.telegramUserId)}</b>`,
    `${ui.telegramIdLabel}: <code>${escapeHtml(input.telegramUserId)}</code>`,
    `${ui.premiumRequestCodeLabel}: <b>${escapeHtml(input.requestCode)}</b>`,
    `${ui.premiumFollowUpNeedsReview}: <b>${escapeHtml(input.message)}</b>`,
    '',
    `${ui.premiumReviewPanelLabel}: ${panelUrl}`,
  ].join('\n');

  for (const adminChatId of config.adminChatIds) {
    await sendTelegramMessage(config.botToken, adminChatId, lines, {
      replyMarkup: {
        inline_keyboard: [[{ text: ui.premiumReviewPanelLabel, url: panelUrl }]],
      },
    });
  }
}

function appendTelegramOrderAdminNote(existingNote?: string | null, nextNote?: string | null) {
  const trimmedExisting = existingNote?.trim();
  const trimmedNext = nextNote?.trim();

  if (!trimmedNext) {
    return trimmedExisting || null;
  }

  if (!trimmedExisting) {
    return trimmedNext;
  }

  return `${trimmedExisting}\n\n${trimmedNext}`;
}

function appendTelegramServerChangeAdminNote(existingNote?: string | null, nextNote?: string | null) {
  const trimmedExisting = existingNote?.trim();
  const trimmedNext = nextNote?.trim();

  if (!trimmedNext) {
    return trimmedExisting || null;
  }

  if (!trimmedExisting) {
    return trimmedNext;
  }

  return `${trimmedExisting}\n\n${trimmedNext}`;
}

function appendTelegramPremiumSupportAdminNote(existingNote?: string | null, nextNote?: string | null) {
  const trimmedExisting = existingNote?.trim();
  const trimmedNext = nextNote?.trim();

  if (!trimmedNext) {
    return trimmedExisting || null;
  }

  if (!trimmedExisting) {
    return trimmedNext;
  }

  return `${trimmedExisting}\n\n${trimmedNext}`;
}

function buildTelegramOrderPlanSnapshot(
  plan: TelegramSalesPlan,
  locale: SupportedLocale,
  overrides?: {
    durationMonths?: number | null;
    durationDays?: number | null;
    couponCampaignType?: string | null;
    couponCode?: string | null;
    couponDiscountAmount?: number | null;
    couponDiscountLabel?: string | null;
  },
) {
  const snapshot = buildTelegramCouponAdjustedPlanSnapshot({
    plan,
    locale,
    durationMonths: overrides?.durationMonths,
    durationDays: overrides?.durationDays,
    couponCampaignType: overrides?.couponCampaignType,
    couponCode: overrides?.couponCode,
    couponDiscountAmount: overrides?.couponDiscountAmount,
    couponDiscountLabel: overrides?.couponDiscountLabel,
  });
  const planLabel = resolveTelegramSalesPlanLabel(plan, locale);

  return {
    ...snapshot,
    planName: snapshot.priceLabel ? `${planLabel} (${snapshot.priceLabel})` : planLabel,
  };
}

async function resolveTelegramOrderPlanContext(order: {
  id: string;
  orderCode: string;
  locale: string;
  planCode?: string | null;
  durationMonths?: number | null;
  durationDays?: number | null;
  templateId?: string | null;
  dynamicTemplateId?: string | null;
  deliveryType?: string | null;
}) {
  const locale = coerceSupportedLocale(order.locale) || (await getTelegramDefaultLocale());
  const salesSettings = await getTelegramSalesSettings();

  if (!order.planCode) {
    throw new Error(`Telegram order ${order.orderCode} does not have a selected plan.`);
  }

  const plan = resolveTelegramSalesPlan(salesSettings, order.planCode as TelegramSalesPlanCode);
  if (!plan) {
    throw new Error(`The selected plan for order ${order.orderCode} is no longer available.`);
  }

  const durationMonths =
    order.durationMonths ?? plan.fixedDurationMonths ?? plan.minDurationMonths ?? 1;
  const durationDays = order.durationDays ?? plan.fixedDurationDays ?? null;
  const deliveryType =
    order.deliveryType === 'DYNAMIC_KEY' || plan.deliveryType === 'DYNAMIC_KEY'
      ? 'DYNAMIC_KEY'
      : 'ACCESS_KEY';

  const templateId =
    deliveryType === 'ACCESS_KEY' ? order.templateId || plan.templateId || null : null;
  const dynamicTemplateId =
    deliveryType === 'DYNAMIC_KEY'
      ? order.dynamicTemplateId || plan.dynamicTemplateId || null
      : null;
  const [template, dynamicTemplate] = await Promise.all([
    templateId
      ? db.keyTemplate.findUnique({
          where: { id: templateId },
        })
      : null,
    dynamicTemplateId
      ? db.dynamicKeyTemplate.findUnique({
          where: { id: dynamicTemplateId },
        })
      : null,
  ]);

  if (templateId && !template) {
    throw new Error(`The template configured for order ${order.orderCode} no longer exists.`);
  }

  if (dynamicTemplateId && !dynamicTemplate) {
    throw new Error(`The dynamic template configured for order ${order.orderCode} no longer exists.`);
  }

  if (deliveryType === 'DYNAMIC_KEY' && dynamicTemplate?.type === 'MANUAL') {
    throw new Error('Telegram premium plans must use a self-managed dynamic template.');
  }

  return {
    locale,
    salesSettings,
    plan,
    deliveryType,
    template,
    dynamicTemplate,
    durationMonths,
    durationDays,
  };
}

async function resolveTelegramOrderLinkedUser(order: {
  telegramChatId: string;
  requestedEmail?: string | null;
}) {
  const email = order.requestedEmail?.trim();

  return db.user.findFirst({
    where: {
      OR: [
        { telegramChatId: order.telegramChatId },
        ...(email ? [{ email }] : []),
      ],
    },
    select: {
      id: true,
    },
  });
}

async function resolveTelegramProvisioningServer(input?: {
  selectedServerId?: string | null;
  template?: {
    serverId?: string | null;
  } | null;
}) {
  if (input?.selectedServerId) {
    const selectedServer = await db.server.findUnique({
      where: { id: input.selectedServerId },
    });

    if (!selectedServer) {
      throw new Error('The selected server could not be loaded.');
    }

    const assignmentCheck = canAssignKeysToServer(selectedServer);
    if (!assignmentCheck.allowed) {
      throw new Error(assignmentCheck.reason);
    }

    return selectedServer;
  }

  if (input?.template?.serverId) {
    const configuredServer = await db.server.findUnique({
      where: { id: input.template.serverId },
    });

    if (!configuredServer) {
      throw new Error('The template server no longer exists.');
    }

    const assignmentCheck = canAssignKeysToServer(configuredServer);
    if (!assignmentCheck.allowed) {
      throw new Error(assignmentCheck.reason);
    }

    return configuredServer;
  }

  const recommendedServer = await selectLeastLoadedServer();
  if (!recommendedServer?.serverId) {
    throw new Error('No assignable server is available for Telegram order fulfillment.');
  }

  const server = await db.server.findUnique({
    where: { id: recommendedServer.serverId },
  });

  if (!server) {
    throw new Error('The selected server could not be loaded.');
  }

  const assignmentCheck = canAssignKeysToServer(server);
  if (!assignmentCheck.allowed) {
    throw new Error(assignmentCheck.reason);
  }

  return server;
}

function buildTelegramPlanTags(plan: TelegramSalesPlan) {
  return mergeTagsForStorage(
    'tele',
    plan.code === 'trial_1d_3gb' ? 'trial' : undefined,
    plan.deliveryType === 'DYNAMIC_KEY' ? 'premium' : undefined,
  );
}

async function resolveGeneratedDynamicSlug(name: string) {
  return resolveGeneratedAccessSlug(name);
}

function serializeDynamicRoutingPreferencesForTelegram(input?: {
  template?: {
    preferredServerIdsJson?: string | null;
    preferredCountryCodesJson?: string | null;
    preferredServerWeightsJson?: string | null;
    preferredCountryWeightsJson?: string | null;
    preferredRegionMode?: string | null;
    sessionStickinessMode?: string | null;
    drainGraceMinutes?: number | null;
  } | null;
  selectedServerId?: string | null;
}) {
  const base = input?.template
    ? parseDynamicRoutingPreferences({
        preferredServerIdsJson: input.template.preferredServerIdsJson,
        preferredCountryCodesJson: input.template.preferredCountryCodesJson,
        preferredServerWeightsJson: input.template.preferredServerWeightsJson,
        preferredCountryWeightsJson: input.template.preferredCountryWeightsJson,
        preferredRegionMode: input.template.preferredRegionMode,
        sessionStickinessMode: input.template.sessionStickinessMode,
        drainGraceMinutes: input.template.drainGraceMinutes,
      })
    : normalizeDynamicRoutingPreferences();

  const merged = normalizeDynamicRoutingPreferences({
    ...base,
    preferredServerIds: input?.selectedServerId
      ? [input.selectedServerId, ...base.preferredServerIds.filter((id) => id !== input.selectedServerId)]
      : base.preferredServerIds,
  });

  return {
    preferredServerIdsJson: JSON.stringify(merged.preferredServerIds),
    preferredCountryCodesJson: JSON.stringify(merged.preferredCountryCodes),
    preferredServerWeightsJson: JSON.stringify(merged.preferredServerWeights),
    preferredCountryWeightsJson: JSON.stringify(merged.preferredCountryWeights),
    preferredRegionMode: merged.preferredRegionMode,
    sessionStickinessMode: merged.sessionStickinessMode,
    drainGraceMinutes: merged.drainGraceMinutes,
  };
}

function buildTelegramOrderKeyName(input: {
  orderCode: string;
  requestedName?: string | null;
  template?: {
    namePrefix?: string | null;
    [key: string]: unknown;
  } | null;
}) {
  const requestedName = input.requestedName?.trim() || `Key ${input.orderCode}`;
  const prefix = input.template?.namePrefix?.trim();

  if (!prefix) {
    return requestedName.slice(0, 100);
  }

  const separator = /[-\s_]$/.test(prefix) ? '' : '-';
  const prefixed = requestedName.toLowerCase().startsWith(prefix.toLowerCase())
    ? requestedName
    : `${prefix}${separator}${requestedName}`;

  return prefixed.slice(0, 100);
}

async function fulfillTelegramNewAccessOrder(input: {
  orderId: string;
  orderCode: string;
  telegramChatId: string;
  telegramUserId: string;
  requestedName?: string | null;
  requestedEmail?: string | null;
  durationMonths?: number | null;
  durationDays?: number | null;
  selectedServerId?: string | null;
  plan: TelegramSalesPlan;
  template?: {
    id: string;
    serverId?: string | null;
    method: string;
    notes?: string | null;
    slugPrefix?: string | null;
    subscriptionTheme?: string | null;
    subscriptionWelcomeMessage?: string | null;
    sharePageEnabled: boolean;
    clientLinkEnabled: boolean;
    telegramDeliveryEnabled: boolean;
    autoDisableOnLimit: boolean;
    autoDisableOnExpire: boolean;
    autoArchiveAfterDays: number;
    quotaAlertThresholds: string;
    autoRenewPolicy: string;
    autoRenewDurationDays?: number | null;
  } | null;
}) {
  const server = await resolveTelegramProvisioningServer({
    selectedServerId: input.selectedServerId,
    template: input.template,
  });
  const client = createOutlineClient(server.apiUrl, server.apiCertSha256);
  const linkedUser = await resolveTelegramOrderLinkedUser({
    telegramChatId: input.telegramChatId,
    requestedEmail: input.requestedEmail,
  });
  const keyName = buildTelegramOrderKeyName({
    orderCode: input.orderCode,
    requestedName: input.requestedName,
    template: input.template,
  });
  const publicSlug = await resolveGeneratedAccessSlug(keyName, input.template?.slugPrefix || null);
  const now = new Date();
  const expiresAt = applyTelegramOrderDuration({
    baseDate: now,
    durationMonths: input.durationMonths,
    durationDays: input.durationDays,
  });
  const dataLimitBytes = input.plan.unlimitedQuota
    ? null
    : input.plan.dataLimitGB
      ? BigInt(input.plan.dataLimitGB) * BigInt(1024 * 1024 * 1024)
      : null;

  const outlineKey = await client.createAccessKey({
    name: keyName,
    method: input.template?.method || 'chacha20-ietf-poly1305',
  });

  try {
    if (dataLimitBytes) {
      await client.setAccessKeyDataLimit(outlineKey.id, Number(dataLimitBytes));
    }

    return await db.accessKey.create({
      data: {
        outlineKeyId: outlineKey.id,
        name: keyName,
        email: input.requestedEmail?.trim() || null,
        telegramId: input.telegramUserId,
        notes: input.template?.notes || null,
        userId: linkedUser?.id ?? null,
        serverId: server.id,
        accessUrl: decorateOutlineAccessUrl(outlineKey.accessUrl, keyName),
        password: outlineKey.password,
        port: outlineKey.port,
        method: outlineKey.method,
        dataLimitBytes,
        dataLimitResetStrategy: 'NEVER',
        expirationType: 'FIXED_DATE',
        expiresAt,
        durationDays: null,
        status: 'ACTIVE',
        prefix: null,
        subscriptionTheme: input.template?.subscriptionTheme || null,
        subscriptionWelcomeMessage: input.template?.subscriptionWelcomeMessage || null,
        sharePageEnabled: input.template?.sharePageEnabled ?? true,
        clientLinkEnabled: input.template?.clientLinkEnabled ?? true,
        telegramDeliveryEnabled: true,
        autoDisableOnLimit: input.template?.autoDisableOnLimit ?? true,
        autoDisableOnExpire: input.template?.autoDisableOnExpire ?? true,
        autoArchiveAfterDays: input.template?.autoArchiveAfterDays ?? 0,
        quotaAlertThresholds: input.template?.quotaAlertThresholds || '80,90',
        quotaAlertsSent: '[]',
        autoRenewPolicy: input.template?.autoRenewPolicy ?? 'NONE',
        autoRenewDurationDays: input.template?.autoRenewDurationDays ?? null,
        subscriptionToken: generateRandomString(32),
        publicSlug,
        tags: buildTelegramPlanTags(input.plan),
      },
    });
  } catch (error) {
    try {
      await client.deleteAccessKey(outlineKey.id);
    } catch (cleanupError) {
      console.error('Failed to cleanup Telegram-created Outline key:', cleanupError);
    }

    throw error;
  }
}

async function fulfillTelegramRenewAccessOrder(input: {
  orderCode: string;
  telegramUserId: string;
  telegramChatId: string;
  targetAccessKeyId: string;
  requestedEmail?: string | null;
  durationMonths?: number | null;
  durationDays?: number | null;
  plan: TelegramSalesPlan;
  template?: {
    id: string;
    subscriptionTheme?: string | null;
    subscriptionWelcomeMessage?: string | null;
    sharePageEnabled: boolean;
    clientLinkEnabled: boolean;
    telegramDeliveryEnabled: boolean;
    autoDisableOnLimit: boolean;
    autoDisableOnExpire: boolean;
    autoArchiveAfterDays: number;
    quotaAlertThresholds: string;
    autoRenewPolicy: string;
    autoRenewDurationDays?: number | null;
  } | null;
}) {
  let key = await db.accessKey.findUnique({
    where: { id: input.targetAccessKeyId },
    include: {
      server: true,
      user: true,
    },
  });

  if (!key) {
    throw new Error(`The renewal target for order ${input.orderCode} could not be found.`);
  }

  if (key.status === 'DISABLED') {
    key = await setAccessKeyEnabledState(key.id, true);
  }

  const client = createOutlineClient(key.server.apiUrl, key.server.apiCertSha256);
  const dataLimitBytes = input.plan.unlimitedQuota
    ? null
    : input.plan.dataLimitGB
      ? BigInt(input.plan.dataLimitGB) * BigInt(1024 * 1024 * 1024)
      : null;
  const expiryBase =
    key.expiresAt && key.expiresAt.getTime() > Date.now() ? key.expiresAt : new Date();
  const expiresAt = applyTelegramOrderDuration({
    baseDate: expiryBase,
    durationMonths: input.durationMonths,
    durationDays: input.durationDays,
  });
  const now = new Date();

  if (dataLimitBytes) {
    await client.setAccessKeyDataLimit(key.outlineKeyId, Number(dataLimitBytes));
  } else {
    await client.removeAccessKeyDataLimit(key.outlineKeyId);
  }

  return db.accessKey.update({
    where: { id: key.id },
    data: {
      email: input.requestedEmail?.trim() || key.email,
      telegramId: key.telegramId || input.telegramUserId,
      dataLimitBytes,
      dataLimitResetStrategy: 'NEVER',
      usedBytes: BigInt(0),
      usageOffset: BigInt(0),
      lastDataLimitReset: now,
      expirationType: 'FIXED_DATE',
      expiresAt,
      durationDays: null,
      status: 'ACTIVE',
      disabledAt: null,
      disabledOutlineKeyId: null,
      archiveAfterAt: null,
      subscriptionTheme: input.template?.subscriptionTheme ?? key.subscriptionTheme,
      subscriptionWelcomeMessage:
        input.template?.subscriptionWelcomeMessage ?? key.subscriptionWelcomeMessage,
      sharePageEnabled: input.template?.sharePageEnabled ?? key.sharePageEnabled,
      clientLinkEnabled: input.template?.clientLinkEnabled ?? key.clientLinkEnabled,
      telegramDeliveryEnabled: true,
      autoDisableOnLimit: input.template?.autoDisableOnLimit ?? key.autoDisableOnLimit,
      autoDisableOnExpire: input.template?.autoDisableOnExpire ?? key.autoDisableOnExpire,
      autoArchiveAfterDays: input.template?.autoArchiveAfterDays ?? key.autoArchiveAfterDays,
      quotaAlertThresholds: input.template?.quotaAlertThresholds ?? key.quotaAlertThresholds,
      quotaAlertsSent: '[]',
      bandwidthAlertAt80: false,
      bandwidthAlertAt90: false,
      autoRenewPolicy: input.template?.autoRenewPolicy ?? key.autoRenewPolicy,
      autoRenewDurationDays: input.template?.autoRenewDurationDays ?? key.autoRenewDurationDays,
    },
  });
}

async function fulfillTelegramNewDynamicOrder(input: {
  orderId: string;
  orderCode: string;
  telegramChatId: string;
  telegramUserId: string;
  requestedName?: string | null;
  requestedEmail?: string | null;
  durationMonths?: number | null;
  durationDays?: number | null;
  selectedServerId?: string | null;
  plan: TelegramSalesPlan;
  dynamicTemplate?: {
    id: string;
    name: string;
    type: string;
    description?: string | null;
    notes?: string | null;
    dataLimitBytes?: bigint | null;
    dataLimitResetStrategy: string;
    method: string;
    serverTagsJson: string;
    loadBalancerAlgorithm: string;
    preferredServerIdsJson: string;
    preferredCountryCodesJson: string;
    preferredServerWeightsJson: string;
    preferredCountryWeightsJson: string;
    preferredRegionMode: string;
    sessionStickinessMode: string;
    drainGraceMinutes: number;
    rotationEnabled: boolean;
    rotationInterval: string;
    rotationTriggerMode: string;
    rotationUsageThresholdPercent: number;
    rotateOnHealthFailure: boolean;
    sharePageEnabled: boolean;
    subscriptionTheme?: string | null;
    subscriptionWelcomeMessage?: string | null;
  } | null;
}) {
  const linkedUser = await resolveTelegramOrderLinkedUser({
    telegramChatId: input.telegramChatId,
    requestedEmail: input.requestedEmail,
  });
  const keyName = buildTelegramOrderKeyName({
    orderCode: input.orderCode,
    requestedName: input.requestedName,
    template: null,
  });
  const publicSlug = await resolveGeneratedDynamicSlug(keyName);
  const now = new Date();
  const expiresAt = applyTelegramOrderDuration({
    baseDate: now,
    durationMonths: input.durationMonths,
    durationDays: input.durationDays,
  });
  const dataLimitBytes = input.plan.unlimitedQuota
    ? null
    : input.plan.dataLimitGB
      ? BigInt(input.plan.dataLimitGB) * BigInt(1024 * 1024 * 1024)
      : null;
  const routingPreferences = serializeDynamicRoutingPreferencesForTelegram({
    template: input.dynamicTemplate,
    selectedServerId: input.selectedServerId,
  });

  return db.dynamicAccessKey.create({
    data: {
      name: keyName,
      type: input.dynamicTemplate?.type || 'SELF_MANAGED',
      email: input.requestedEmail?.trim() || null,
      telegramId: input.telegramUserId,
      notes: input.dynamicTemplate?.notes || null,
      userId: linkedUser?.id ?? null,
      serverTagsJson: input.dynamicTemplate?.serverTagsJson || '[]',
      dataLimitBytes,
      dataLimitResetStrategy: input.dynamicTemplate?.dataLimitResetStrategy || 'NEVER',
      lastDataLimitReset: now,
      usageOffset: BigInt(0),
      expirationType: 'FIXED_DATE',
      expiresAt,
      durationDays: null,
      status: 'ACTIVE',
      dynamicUrl: generateRandomString(32),
      publicSlug,
      method: input.dynamicTemplate?.method || 'chacha20-ietf-poly1305',
      tags: buildTelegramPlanTags(input.plan),
      loadBalancerAlgorithm: input.dynamicTemplate?.loadBalancerAlgorithm || 'IP_HASH',
      ...routingPreferences,
      subscriptionTheme: input.dynamicTemplate?.subscriptionTheme || null,
      subscriptionWelcomeMessage: input.dynamicTemplate?.subscriptionWelcomeMessage || null,
      sharePageEnabled: input.dynamicTemplate?.sharePageEnabled ?? true,
      rotationEnabled: input.dynamicTemplate?.rotationEnabled ?? false,
      rotationInterval: input.dynamicTemplate?.rotationInterval || 'NEVER',
      rotationTriggerMode: input.dynamicTemplate?.rotationTriggerMode || 'SCHEDULED',
      rotationUsageThresholdPercent: input.dynamicTemplate?.rotationUsageThresholdPercent ?? 85,
      rotateOnHealthFailure: input.dynamicTemplate?.rotateOnHealthFailure ?? false,
      appliedTemplateId: input.dynamicTemplate?.id || null,
    },
  });
}

async function fulfillTelegramRenewDynamicOrder(input: {
  orderCode: string;
  telegramUserId: string;
  telegramChatId: string;
  targetDynamicKeyId: string;
  requestedEmail?: string | null;
  durationMonths?: number | null;
  durationDays?: number | null;
  selectedServerId?: string | null;
  plan: TelegramSalesPlan;
  dynamicTemplate?: {
    id: string;
    name: string;
    type: string;
    notes?: string | null;
    dataLimitResetStrategy: string;
    method: string;
    serverTagsJson: string;
    loadBalancerAlgorithm: string;
    preferredServerIdsJson: string;
    preferredCountryCodesJson: string;
    preferredServerWeightsJson: string;
    preferredCountryWeightsJson: string;
    preferredRegionMode: string;
    sessionStickinessMode: string;
    drainGraceMinutes: number;
    rotationEnabled: boolean;
    rotationInterval: string;
    rotationTriggerMode: string;
    rotationUsageThresholdPercent: number;
    rotateOnHealthFailure: boolean;
    sharePageEnabled: boolean;
    subscriptionTheme?: string | null;
    subscriptionWelcomeMessage?: string | null;
  } | null;
}) {
  const key = await db.dynamicAccessKey.findUnique({
    where: { id: input.targetDynamicKeyId },
  });

  if (!key) {
    throw new Error(`The renewal target for order ${input.orderCode} could not be found.`);
  }

  const dataLimitBytes = input.plan.unlimitedQuota
    ? null
    : input.plan.dataLimitGB
      ? BigInt(input.plan.dataLimitGB) * BigInt(1024 * 1024 * 1024)
      : null;
  const expiryBase =
    key.expiresAt && key.expiresAt.getTime() > Date.now() ? key.expiresAt : new Date();
  const expiresAt = applyTelegramOrderDuration({
    baseDate: expiryBase,
    durationMonths: input.durationMonths,
    durationDays: input.durationDays,
  });
  const now = new Date();
  const routingPreferences = serializeDynamicRoutingPreferencesForTelegram({
    template: input.dynamicTemplate,
    selectedServerId: input.selectedServerId,
  });

  return db.dynamicAccessKey.update({
    where: { id: key.id },
    data: {
      email: input.requestedEmail?.trim() || key.email,
      telegramId: key.telegramId || input.telegramUserId,
      dataLimitBytes,
      dataLimitResetStrategy: input.dynamicTemplate?.dataLimitResetStrategy || key.dataLimitResetStrategy,
      usedBytes: BigInt(0),
      usageOffset: BigInt(0),
      lastDataLimitReset: now,
      expirationType: 'FIXED_DATE',
      expiresAt,
      durationDays: null,
      status: 'ACTIVE',
      method: input.dynamicTemplate?.method || key.method,
      serverTagsJson: input.dynamicTemplate?.serverTagsJson || key.serverTagsJson,
      loadBalancerAlgorithm: input.dynamicTemplate?.loadBalancerAlgorithm || key.loadBalancerAlgorithm,
      ...routingPreferences,
      subscriptionTheme: input.dynamicTemplate?.subscriptionTheme ?? key.subscriptionTheme,
      subscriptionWelcomeMessage:
        input.dynamicTemplate?.subscriptionWelcomeMessage ?? key.subscriptionWelcomeMessage,
      sharePageEnabled: input.dynamicTemplate?.sharePageEnabled ?? key.sharePageEnabled,
      rotationEnabled: input.dynamicTemplate?.rotationEnabled ?? key.rotationEnabled,
      rotationInterval: input.dynamicTemplate?.rotationInterval || key.rotationInterval,
      rotationTriggerMode: input.dynamicTemplate?.rotationTriggerMode || key.rotationTriggerMode,
      rotationUsageThresholdPercent:
        input.dynamicTemplate?.rotationUsageThresholdPercent ?? key.rotationUsageThresholdPercent,
      rotateOnHealthFailure: input.dynamicTemplate?.rotateOnHealthFailure ?? key.rotateOnHealthFailure,
      appliedTemplateId: input.dynamicTemplate?.id || key.appliedTemplateId,
      lastRoutingAlertAt: null,
      pinnedAccessKeyId: null,
      pinnedServerId: null,
      pinnedAt: null,
      pinExpiresAt: null,
      expirationWarningStage: null,
      lastWarningSentAt: null,
    },
  });
}

export async function approveTelegramOrder(input: {
  orderId: string;
  reviewedByUserId?: string | null;
  reviewerName?: string | null;
  adminNote?: string | null;
}) {
  const existingOrder = await db.telegramOrder.findUnique({
    where: { id: input.orderId },
    select: {
      id: true,
      orderCode: true,
      status: true,
      assignedReviewerUserId: true,
      assignedReviewerEmail: true,
    },
  });

  if (!existingOrder) {
    throw new Error('Telegram order not found.');
  }

  if (
    existingOrder.assignedReviewerUserId &&
    existingOrder.assignedReviewerUserId !== (input.reviewedByUserId ?? null)
  ) {
    throw new Error(`This Telegram order is claimed by ${existingOrder.assignedReviewerEmail || 'another admin'}.`);
  }

  const claim = await db.telegramOrder.updateMany({
    where: {
      id: input.orderId,
      status: 'PENDING_REVIEW',
      assignedReviewerUserId: existingOrder.assignedReviewerUserId
        ? (input.reviewedByUserId ?? null)
        : null,
    },
    data: {
      status: 'APPROVED',
      reviewedByUserId: input.reviewedByUserId ?? null,
      reviewedAt: new Date(),
      adminNote: input.adminNote?.trim() || null,
    },
  });

  if (claim.count === 0) {
    throw new Error('This Telegram order is no longer pending review.');
  }

  const order = await db.telegramOrder.findUnique({
    where: { id: input.orderId },
  });

  if (!order) {
    throw new Error('Telegram order not found.');
  }

  try {
    const { locale, plan, deliveryType, template, dynamicTemplate, durationMonths, durationDays } =
      await resolveTelegramOrderPlanContext(order);
    const ui = getTelegramUi(locale);
    const isDynamic = deliveryType === 'DYNAMIC_KEY';
    const key =
      order.kind === 'RENEW'
        ? isDynamic
          ? await fulfillTelegramRenewDynamicOrder({
              orderCode: order.orderCode,
              telegramUserId: order.telegramUserId,
              telegramChatId: order.telegramChatId,
              targetDynamicKeyId: order.targetDynamicKeyId || '',
              requestedEmail: order.requestedEmail,
              durationMonths,
              durationDays,
              selectedServerId: order.selectedServerId,
              plan,
              dynamicTemplate,
            })
          : await fulfillTelegramRenewAccessOrder({
              orderCode: order.orderCode,
              telegramUserId: order.telegramUserId,
              telegramChatId: order.telegramChatId,
              targetAccessKeyId: order.targetAccessKeyId || '',
              requestedEmail: order.requestedEmail,
              durationMonths,
              durationDays,
              plan,
              template,
            })
        : isDynamic
          ? await fulfillTelegramNewDynamicOrder({
              orderId: order.id,
              orderCode: order.orderCode,
              telegramChatId: order.telegramChatId,
              telegramUserId: order.telegramUserId,
              requestedName: order.requestedName,
              requestedEmail: order.requestedEmail,
              durationMonths,
              durationDays,
              selectedServerId: order.selectedServerId,
              plan,
              dynamicTemplate,
            })
          : await fulfillTelegramNewAccessOrder({
              orderId: order.id,
              orderCode: order.orderCode,
              telegramChatId: order.telegramChatId,
              telegramUserId: order.telegramUserId,
              requestedName: order.requestedName,
              requestedEmail: order.requestedEmail,
              durationMonths,
              durationDays,
              selectedServerId: order.selectedServerId,
              plan,
              template,
            });

    const finalOrder = await db.telegramOrder.update({
      where: { id: order.id },
      data: {
        status: 'FULFILLED',
        approvedAccessKeyId: isDynamic ? null : key.id,
        approvedDynamicKeyId: isDynamic ? key.id : null,
        fulfilledAt: new Date(),
        reviewedByUserId: input.reviewedByUserId ?? null,
        reviewedAt: new Date(),
        adminNote: appendTelegramOrderAdminNote(order.adminNote, input.adminNote),
        customerMessage: null,
        rejectionReasonCode: null,
      },
    });
    await redeemTelegramCouponForOrder({
      telegramOrderId: finalOrder.id,
      telegramUserId: finalOrder.telegramUserId,
      telegramChatId: finalOrder.telegramChatId,
      couponCode: finalOrder.couponCode,
      orderCode: finalOrder.orderCode,
    });

    let deliveryError: string | null = null;
    let deliveryResult:
      | Awaited<ReturnType<typeof sendAccessKeySharePageToTelegram>>
      | Awaited<ReturnType<typeof sendDynamicKeySharePageToTelegram>>
      | null = null;

    try {
      const config = await getTelegramConfig();
      if (config) {
        await sendTelegramOrderReceiptConfirmation({
          chatId: order.telegramChatId,
          locale,
          order: finalOrder,
          deliveredKeyName: key.name,
          isTrial: false,
        });
      }

      deliveryResult = isDynamic
        ? await sendDynamicKeySharePageToTelegram({
            dynamicAccessKeyId: key.id,
            chatId: order.telegramChatId,
            planName: order.planName,
            reason: order.kind === 'RENEW' ? 'RESENT' : 'CREATED',
            source: 'telegram_order',
          })
        : await sendAccessKeySharePageToTelegram({
            accessKeyId: key.id,
            chatId: order.telegramChatId,
            reason: order.kind === 'RENEW' ? 'RESENT' : 'CREATED',
            source: 'telegram_order',
          });
    } catch (error) {
      deliveryError = (error as Error).message;
    }

    await writeAuditLog({
      userId: input.reviewedByUserId ?? null,
      action: 'TELEGRAM_ORDER_APPROVED',
      entity: 'TELEGRAM_ORDER',
      entityId: finalOrder.id,
      details: {
        orderCode: order.orderCode,
        reviewerName: input.reviewerName ?? null,
        kind: order.kind,
        deliveryType,
        approvedAccessKeyId: isDynamic ? null : key.id,
        approvedDynamicKeyId: isDynamic ? key.id : null,
        deliveryError,
      },
    });

    return {
      orderId: finalOrder.id,
      orderCode: order.orderCode,
      accessKeyId: isDynamic ? null : key.id,
      dynamicAccessKeyId: isDynamic ? key.id : null,
      accessKeyName: key.name,
      deliveryError,
      sharePageUrl: deliveryResult?.sharePageUrl || null,
      subscriptionUrl: deliveryResult?.subscriptionUrl || null,
    };
  } catch (error) {
    await db.telegramOrder.update({
      where: { id: input.orderId },
      data: {
        status: 'PENDING_REVIEW',
        reviewedByUserId: null,
        reviewedAt: null,
        adminNote: appendTelegramOrderAdminNote(
          order.adminNote,
          `Approval failed at ${new Date().toISOString()}: ${(error as Error).message}`,
        ),
      },
    });

    throw error;
  }
}

export async function rejectTelegramOrder(input: {
  orderId: string;
  reviewedByUserId?: string | null;
  reviewerName?: string | null;
  adminNote?: string | null;
  customerMessage?: string | null;
  reasonCode?: string | null;
}) {
  const order = await db.telegramOrder.findUnique({
    where: { id: input.orderId },
  });

  if (!order) {
    throw new Error('Telegram order not found.');
  }

  if (isTelegramOrderTerminal(order.status)) {
    throw new Error('This Telegram order has already been completed.');
  }

  if (
    order.assignedReviewerUserId &&
    order.assignedReviewerUserId !== (input.reviewedByUserId ?? null)
  ) {
    throw new Error(`This Telegram order is claimed by ${order.assignedReviewerEmail || 'another admin'}.`);
  }

  const locale = coerceSupportedLocale(order.locale) || (await getTelegramDefaultLocale());

  const finalOrder = await db.telegramOrder.update({
    where: { id: order.id },
    data: {
      status: 'REJECTED',
      reviewedByUserId: input.reviewedByUserId ?? null,
      reviewedAt: new Date(),
      rejectedAt: new Date(),
      adminNote: appendTelegramOrderAdminNote(order.adminNote, input.adminNote),
      customerMessage:
        input.customerMessage?.trim() ||
        resolveTelegramRejectionReasonMessage(input.reasonCode, locale) ||
        null,
      rejectionReasonCode: getTelegramRejectionReasonPreset(input.reasonCode)?.code || null,
    },
  });

  const ui = getTelegramUi(locale);
  const supportLink = await getTelegramSupportLink();

  try {
    const config = await getTelegramConfig();
    if (config) {
      await sendTelegramMessage(
        config.botToken,
        order.telegramChatId,
        ui.orderRejected(order.orderCode, finalOrder.customerMessage, supportLink),
        {
          replyMarkup: buildTelegramOrderActionKeyboard({
            order: finalOrder,
            locale,
          }),
        },
      );
    }
  } catch (error) {
    console.error('Failed to send Telegram order rejection message:', error);
  }

  await writeAuditLog({
    userId: input.reviewedByUserId ?? null,
    action: 'TELEGRAM_ORDER_REJECTED',
    entity: 'TELEGRAM_ORDER',
    entityId: finalOrder.id,
    details: {
      orderCode: order.orderCode,
      reviewerName: input.reviewerName ?? null,
      kind: order.kind,
    },
  });

  return {
    orderId: finalOrder.id,
    orderCode: order.orderCode,
  };
}

export async function approveTelegramServerChangeRequest(input: {
  requestId: string;
  reviewedByUserId?: string | null;
  reviewerName?: string | null;
  adminNote?: string | null;
}) {
  const claim = await db.telegramServerChangeRequest.updateMany({
    where: {
      id: input.requestId,
      status: 'PENDING_REVIEW',
    },
    data: {
      status: 'APPROVED',
      reviewedByUserId: input.reviewedByUserId ?? null,
      reviewerName: input.reviewerName ?? null,
      reviewedAt: new Date(),
      adminNote: input.adminNote?.trim() || null,
    },
  });

  if (claim.count === 0) {
    throw new Error('This server-change request is no longer pending review.');
  }

  const request = await db.telegramServerChangeRequest.findUnique({
    where: { id: input.requestId },
    include: {
      accessKey: {
        include: {
          server: true,
          user: {
            select: {
              telegramChatId: true,
            },
          },
        },
      },
    },
  });

  if (!request) {
    throw new Error('Server-change request not found.');
  }

  const locale = coerceSupportedLocale(request.locale) || (await getTelegramDefaultLocale());
  const ui = getTelegramUi(locale);

  try {
    const replacement = await replaceAccessKeyServer(request.accessKeyId, request.requestedServerId);
    if (!replacement.updatedKey) {
      throw new Error('The key was replaced but could not be reloaded afterwards.');
    }

    const finalRequest = await db.telegramServerChangeRequest.update({
      where: { id: request.id },
      data: {
        status: 'FULFILLED',
        reviewedByUserId: input.reviewedByUserId ?? null,
        reviewerName: input.reviewerName ?? null,
        reviewedAt: new Date(),
        fulfilledAt: new Date(),
        adminNote: appendTelegramServerChangeAdminNote(request.adminNote, input.adminNote),
        customerMessage: null,
      },
    });

    let deliveryError: string | null = null;
    try {
      const config = await getTelegramConfig();
      if (config) {
        await sendTelegramMessage(
          config.botToken,
          request.telegramChatId,
          ui.serverChangeRequestApproved(
            request.requestCode,
            replacement.updatedKey.name,
            replacement.targetServer.name,
          ),
          {
            replyMarkup: getCommandKeyboard(false, locale),
          },
        );
      }

      await sendAccessKeySharePageToTelegram({
        accessKeyId: replacement.updatedKey.id,
        chatId:
          request.telegramChatId ||
          replacement.updatedKey.telegramId ||
          replacement.updatedKey.user?.telegramChatId ||
          undefined,
        reason: 'RESENT',
        source: 'telegram_server_change',
      });
    } catch (error) {
      deliveryError = (error as Error).message;
    }

    await writeAuditLog({
      userId: input.reviewedByUserId ?? null,
      action: 'TELEGRAM_SERVER_CHANGE_APPROVED',
      entity: 'TELEGRAM_SERVER_CHANGE_REQUEST',
      entityId: finalRequest.id,
      details: {
        requestCode: request.requestCode,
        accessKeyId: request.accessKeyId,
        targetServerId: request.requestedServerId,
        reviewerName: input.reviewerName ?? null,
        deliveryError,
      },
    });

    return {
      requestId: finalRequest.id,
      requestCode: request.requestCode,
      accessKeyId: replacement.updatedKey.id,
      accessKeyName: replacement.updatedKey.name,
      targetServerName: replacement.targetServer.name,
      deliveryError,
    };
  } catch (error) {
    await db.telegramServerChangeRequest.update({
      where: { id: input.requestId },
      data: {
        status: 'PENDING_REVIEW',
        reviewedByUserId: null,
        reviewerName: null,
        reviewedAt: null,
        adminNote: appendTelegramServerChangeAdminNote(
          request.adminNote,
          `Approval failed at ${new Date().toISOString()}: ${(error as Error).message}`,
        ),
      },
    });

    throw error;
  }
}

export async function rejectTelegramServerChangeRequest(input: {
  requestId: string;
  reviewedByUserId?: string | null;
  reviewerName?: string | null;
  adminNote?: string | null;
  customerMessage?: string | null;
}) {
  const request = await db.telegramServerChangeRequest.findUnique({
    where: { id: input.requestId },
  });

  if (!request) {
    throw new Error('Server-change request not found.');
  }

  if (['FULFILLED', 'REJECTED', 'CANCELLED'].includes(request.status)) {
    throw new Error('This server-change request has already been completed.');
  }

  const locale = coerceSupportedLocale(request.locale) || (await getTelegramDefaultLocale());
  const ui = getTelegramUi(locale);
  const supportLink = await getTelegramSupportLink();

  const finalRequest = await db.telegramServerChangeRequest.update({
    where: { id: request.id },
    data: {
      status: 'REJECTED',
      reviewedByUserId: input.reviewedByUserId ?? null,
      reviewerName: input.reviewerName ?? null,
      reviewedAt: new Date(),
      rejectedAt: new Date(),
      adminNote: appendTelegramServerChangeAdminNote(request.adminNote, input.adminNote),
      customerMessage: input.customerMessage?.trim() || ui.serverChangeSupportDefault,
    },
  });

  try {
    const config = await getTelegramConfig();
    if (config) {
      await sendTelegramMessage(
        config.botToken,
        request.telegramChatId,
        ui.serverChangeRequestRejected(
          request.requestCode,
          finalRequest.customerMessage,
          supportLink,
        ),
        {
          replyMarkup: getCommandKeyboard(false, locale),
        },
      );
    }
  } catch (error) {
    console.error('Failed to send Telegram server-change rejection message:', error);
  }

  await writeAuditLog({
    userId: input.reviewedByUserId ?? null,
    action: 'TELEGRAM_SERVER_CHANGE_REJECTED',
    entity: 'TELEGRAM_SERVER_CHANGE_REQUEST',
    entityId: finalRequest.id,
    details: {
      requestCode: request.requestCode,
      accessKeyId: request.accessKeyId,
      reviewerName: input.reviewerName ?? null,
    },
  });

  return {
    requestId: finalRequest.id,
    requestCode: request.requestCode,
  };
}

async function applyPremiumSupportRoutingUpdate(input: {
  request: {
    id: string;
    requestCode: string;
    requestType: string;
    requestedRegionCode?: string | null;
    dynamicAccessKeyId: string;
  };
  approvedRegionCode?: string | null;
  pinServerId?: string | null;
  pinExpiresInMinutes?: number | null;
  adminNote?: string | null;
  appendNoteToKey?: boolean;
}) {
  const dynamicKey = await db.dynamicAccessKey.findUnique({
    where: { id: input.request.dynamicAccessKeyId },
    include: {
      accessKeys: {
        where: { status: 'ACTIVE' },
        include: {
          server: true,
        },
      },
    },
  });

  if (!dynamicKey) {
    throw new Error('Dynamic key not found.');
  }

  const updateData: Record<string, unknown> = {};
  let appliedRegionCode: string | null = null;
  let appliedPinServerId: string | null = null;
  let appliedPinServerName: string | null = null;
  let appliedPinExpiresAt: Date | null = null;

  if (input.request.requestType === 'REGION_CHANGE') {
    const nextRegion = input.approvedRegionCode?.trim().toUpperCase() || input.request.requestedRegionCode?.trim().toUpperCase() || null;
    if (!nextRegion) {
      throw new Error('Select a preferred region before approving this request.');
    }

    const existingRouting = parseDynamicRoutingPreferences({
      preferredServerIdsJson: dynamicKey.preferredServerIdsJson,
      preferredCountryCodesJson: dynamicKey.preferredCountryCodesJson,
      preferredServerWeightsJson: dynamicKey.preferredServerWeightsJson,
      preferredCountryWeightsJson: dynamicKey.preferredCountryWeightsJson,
      preferredRegionMode: dynamicKey.preferredRegionMode,
      sessionStickinessMode: dynamicKey.sessionStickinessMode,
      drainGraceMinutes: dynamicKey.drainGraceMinutes,
    });

    const normalized = normalizeDynamicRoutingPreferences({
      preferredServerIds: existingRouting.preferredServerIds,
      preferredCountryCodes: [nextRegion],
      preferredServerWeights: existingRouting.preferredServerWeights,
      preferredCountryWeights: existingRouting.preferredCountryWeights,
      preferredRegionMode: existingRouting.preferredRegionMode,
      sessionStickinessMode: existingRouting.sessionStickinessMode,
      drainGraceMinutes: existingRouting.drainGraceMinutes,
    });

    updateData.preferredCountryCodesJson = JSON.stringify(normalized.preferredCountryCodes);
    updateData.preferredCountryWeightsJson = JSON.stringify(normalized.preferredCountryWeights);
    updateData.preferredRegionMode = normalized.preferredRegionMode;
    appliedRegionCode = nextRegion;
  }

  if (input.pinServerId) {
    const pinCandidate = dynamicKey.accessKeys.find((accessKey) => accessKey.server?.id === input.pinServerId)?.server;
    if (!pinCandidate) {
      throw new Error('Choose one of the currently attached premium servers for a temporary pin.');
    }

    appliedPinServerId = pinCandidate.id;
    appliedPinServerName = pinCandidate.name;
    appliedPinExpiresAt = input.pinExpiresInMinutes
      ? new Date(Date.now() + input.pinExpiresInMinutes * 60_000)
      : null;

    updateData.pinnedAccessKeyId = null;
    updateData.pinnedServerId = pinCandidate.id;
    updateData.pinnedAt = new Date();
    updateData.pinExpiresAt = appliedPinExpiresAt;
  }

  if (input.appendNoteToKey && input.adminNote?.trim()) {
    const supportStamp = `[Premium support ${input.request.requestCode} · ${new Date().toISOString()}]`;
    updateData.notes = appendTelegramPremiumSupportAdminNote(
      dynamicKey.notes,
      `${supportStamp}\n${input.adminNote.trim()}`,
    );
  }

  const updatedKey =
    Object.keys(updateData).length > 0
      ? await db.dynamicAccessKey.update({
          where: { id: dynamicKey.id },
          data: updateData,
          select: {
            id: true,
            name: true,
            publicSlug: true,
            dynamicUrl: true,
          },
        })
      : {
          id: dynamicKey.id,
          name: dynamicKey.name,
          publicSlug: dynamicKey.publicSlug,
          dynamicUrl: dynamicKey.dynamicUrl,
        };

  return {
    updatedKey,
    appliedRegionCode,
    appliedPinServerId,
    appliedPinServerName,
    appliedPinExpiresAt,
  };
}

export async function approveTelegramPremiumSupportRequest(input: {
  requestId: string;
  reviewedByUserId?: string | null;
  reviewerName?: string | null;
  adminNote?: string | null;
  customerMessage?: string | null;
  approvedRegionCode?: string | null;
  pinServerId?: string | null;
  pinExpiresInMinutes?: number | null;
  appendNoteToKey?: boolean;
}) {
  const claim = await db.telegramPremiumSupportRequest.updateMany({
    where: {
      id: input.requestId,
      status: 'PENDING_REVIEW',
      requestType: 'REGION_CHANGE',
    },
    data: {
      status: 'APPROVED',
      reviewedByUserId: input.reviewedByUserId ?? null,
      reviewerName: input.reviewerName ?? null,
      reviewedAt: new Date(),
      handledAt: new Date(),
      adminNote: input.adminNote?.trim() || null,
    },
  });

  if (claim.count === 0) {
    throw new Error('This premium support request is no longer pending review.');
  }

  const request = await db.telegramPremiumSupportRequest.findUnique({
    where: { id: input.requestId },
    include: {
      dynamicAccessKey: {
        include: {
          user: true,
        },
      },
    },
  });

  if (!request) {
    throw new Error('Premium support request not found.');
  }

  const locale = coerceSupportedLocale(request.locale) || (await getTelegramDefaultLocale());
  const ui = getTelegramUi(locale);
  const supportLink = await getTelegramSupportLink();

  try {
    const applied = await applyPremiumSupportRoutingUpdate({
      request,
      approvedRegionCode: input.approvedRegionCode,
      pinServerId: input.pinServerId,
      pinExpiresInMinutes: input.pinExpiresInMinutes,
      adminNote: input.adminNote,
      appendNoteToKey: input.appendNoteToKey,
    });

    const finalRequest = await db.telegramPremiumSupportRequest.update({
      where: { id: request.id },
      data: {
        status: 'APPROVED',
        reviewedByUserId: input.reviewedByUserId ?? null,
        reviewerName: input.reviewerName ?? null,
        reviewedAt: new Date(),
        handledAt: new Date(),
        appliedPinServerId: applied.appliedPinServerId,
        appliedPinServerName: applied.appliedPinServerName,
        appliedPinExpiresAt: applied.appliedPinExpiresAt,
        followUpPending: false,
        lastAdminReplyAt: new Date(),
        adminNote: appendTelegramPremiumSupportAdminNote(request.adminNote, input.adminNote),
        customerMessage:
          input.customerMessage?.trim() ||
          ui.premiumRequestApproved(request.dynamicAccessKey.name, applied.appliedRegionCode, supportLink),
      },
    });

    if (finalRequest.customerMessage?.trim()) {
      await addTelegramPremiumSupportReply({
        requestId: finalRequest.id,
        senderType: 'ADMIN',
        adminUserId: input.reviewedByUserId ?? null,
        senderName: input.reviewerName ?? null,
        message: finalRequest.customerMessage,
      });
    }

    const config = await getTelegramConfig();
    if (config) {
      await sendTelegramMessage(
        config.botToken,
        request.telegramChatId,
        finalRequest.customerMessage || ui.premiumRequestApproved(request.dynamicAccessKey.name, applied.appliedRegionCode, supportLink),
        {
          replyMarkup: getCommandKeyboard(false, locale),
        },
      );
    }

    await writeAuditLog({
      userId: input.reviewedByUserId ?? null,
      action: 'TELEGRAM_PREMIUM_SUPPORT_APPROVED',
      entity: 'TELEGRAM_PREMIUM_SUPPORT_REQUEST',
      entityId: finalRequest.id,
      details: {
        requestCode: request.requestCode,
        requestType: request.requestType,
        dynamicAccessKeyId: request.dynamicAccessKeyId,
        approvedRegionCode: applied.appliedRegionCode,
        pinServerId: applied.appliedPinServerId,
        reviewerName: input.reviewerName ?? null,
      },
    });

    return finalRequest;
  } catch (error) {
    await db.telegramPremiumSupportRequest.update({
      where: { id: input.requestId },
      data: {
        status: 'PENDING_REVIEW',
        reviewedByUserId: null,
        reviewerName: null,
        reviewedAt: null,
        handledAt: null,
        adminNote: appendTelegramPremiumSupportAdminNote(
          request.adminNote,
          `Approval failed at ${new Date().toISOString()}: ${(error as Error).message}`,
        ),
      },
    });
    throw error;
  }
}

export async function handleTelegramPremiumSupportRequest(input: {
  requestId: string;
  reviewedByUserId?: string | null;
  reviewerName?: string | null;
  adminNote?: string | null;
  customerMessage?: string | null;
  pinServerId?: string | null;
  pinExpiresInMinutes?: number | null;
  appendNoteToKey?: boolean;
}) {
  const claim = await db.telegramPremiumSupportRequest.updateMany({
    where: {
      id: input.requestId,
      status: 'PENDING_REVIEW',
      requestType: 'ROUTE_ISSUE',
    },
    data: {
      status: 'HANDLED',
      reviewedByUserId: input.reviewedByUserId ?? null,
      reviewerName: input.reviewerName ?? null,
      reviewedAt: new Date(),
      handledAt: new Date(),
      adminNote: input.adminNote?.trim() || null,
    },
  });

  if (claim.count === 0) {
    throw new Error('This premium support request is no longer pending review.');
  }

  const request = await db.telegramPremiumSupportRequest.findUnique({
    where: { id: input.requestId },
    include: {
      dynamicAccessKey: {
        include: {
          user: true,
        },
      },
    },
  });

  if (!request) {
    throw new Error('Premium support request not found.');
  }

  const locale = coerceSupportedLocale(request.locale) || (await getTelegramDefaultLocale());
  const ui = getTelegramUi(locale);
  const supportLink = await getTelegramSupportLink();

  try {
    const applied = await applyPremiumSupportRoutingUpdate({
      request,
      pinServerId: input.pinServerId,
      pinExpiresInMinutes: input.pinExpiresInMinutes,
      adminNote: input.adminNote,
      appendNoteToKey: input.appendNoteToKey,
    });

    const finalRequest = await db.telegramPremiumSupportRequest.update({
      where: { id: request.id },
      data: {
        status: 'HANDLED',
        reviewedByUserId: input.reviewedByUserId ?? null,
        reviewerName: input.reviewerName ?? null,
        reviewedAt: new Date(),
        handledAt: new Date(),
        appliedPinServerId: applied.appliedPinServerId,
        appliedPinServerName: applied.appliedPinServerName,
        appliedPinExpiresAt: applied.appliedPinExpiresAt,
        followUpPending: false,
        lastAdminReplyAt: new Date(),
        adminNote: appendTelegramPremiumSupportAdminNote(request.adminNote, input.adminNote),
        customerMessage:
          input.customerMessage?.trim() ||
          ui.premiumIssueHandled(request.dynamicAccessKey.name, supportLink),
      },
    });

    if (finalRequest.customerMessage?.trim()) {
      await addTelegramPremiumSupportReply({
        requestId: finalRequest.id,
        senderType: 'ADMIN',
        adminUserId: input.reviewedByUserId ?? null,
        senderName: input.reviewerName ?? null,
        message: finalRequest.customerMessage,
      });
    }

    const config = await getTelegramConfig();
    if (config) {
      await sendTelegramMessage(
        config.botToken,
        request.telegramChatId,
        finalRequest.customerMessage || ui.premiumIssueHandled(request.dynamicAccessKey.name, supportLink),
        {
          replyMarkup: getCommandKeyboard(false, locale),
        },
      );
    }

    await writeAuditLog({
      userId: input.reviewedByUserId ?? null,
      action: 'TELEGRAM_PREMIUM_SUPPORT_HANDLED',
      entity: 'TELEGRAM_PREMIUM_SUPPORT_REQUEST',
      entityId: finalRequest.id,
      details: {
        requestCode: request.requestCode,
        requestType: request.requestType,
        dynamicAccessKeyId: request.dynamicAccessKeyId,
        pinServerId: applied.appliedPinServerId,
        reviewerName: input.reviewerName ?? null,
      },
    });

    return finalRequest;
  } catch (error) {
    await db.telegramPremiumSupportRequest.update({
      where: { id: input.requestId },
      data: {
        status: 'PENDING_REVIEW',
        reviewedByUserId: null,
        reviewerName: null,
        reviewedAt: null,
        handledAt: null,
        adminNote: appendTelegramPremiumSupportAdminNote(
          request.adminNote,
          `Handling failed at ${new Date().toISOString()}: ${(error as Error).message}`,
        ),
      },
    });
    throw error;
  }
}

export async function dismissTelegramPremiumSupportRequest(input: {
  requestId: string;
  reviewedByUserId?: string | null;
  reviewerName?: string | null;
  adminNote?: string | null;
  customerMessage?: string | null;
}) {
  const request = await db.telegramPremiumSupportRequest.findUnique({
    where: { id: input.requestId },
    include: {
      dynamicAccessKey: true,
    },
  });

  if (!request) {
    throw new Error('Premium support request not found.');
  }

  if (request.status !== 'PENDING_REVIEW') {
    throw new Error('This premium support request has already been reviewed.');
  }

  const locale = coerceSupportedLocale(request.locale) || (await getTelegramDefaultLocale());
  const ui = getTelegramUi(locale);
  const supportLink = await getTelegramSupportLink();

  const finalRequest = await db.telegramPremiumSupportRequest.update({
    where: { id: request.id },
    data: {
      status: 'DISMISSED',
      reviewedByUserId: input.reviewedByUserId ?? null,
      reviewerName: input.reviewerName ?? null,
      reviewedAt: new Date(),
      dismissedAt: new Date(),
      followUpPending: false,
      lastAdminReplyAt: new Date(),
      adminNote: appendTelegramPremiumSupportAdminNote(request.adminNote, input.adminNote),
      customerMessage:
        input.customerMessage?.trim() ||
        ui.premiumSupportDismissed(request.dynamicAccessKey.name, null, supportLink),
    },
  });

  if (finalRequest.customerMessage?.trim()) {
    await addTelegramPremiumSupportReply({
      requestId: finalRequest.id,
      senderType: 'ADMIN',
      adminUserId: input.reviewedByUserId ?? null,
      senderName: input.reviewerName ?? null,
      message: finalRequest.customerMessage,
    });
  }

  const config = await getTelegramConfig();
  if (config) {
    await sendTelegramMessage(
      config.botToken,
      request.telegramChatId,
      finalRequest.customerMessage || ui.premiumSupportDismissed(request.dynamicAccessKey.name, null, supportLink),
      {
        replyMarkup: getCommandKeyboard(false, locale),
      },
    );
  }

  await writeAuditLog({
    userId: input.reviewedByUserId ?? null,
    action: 'TELEGRAM_PREMIUM_SUPPORT_DISMISSED',
    entity: 'TELEGRAM_PREMIUM_SUPPORT_REQUEST',
    entityId: finalRequest.id,
    details: {
      requestCode: request.requestCode,
      requestType: request.requestType,
      dynamicAccessKeyId: request.dynamicAccessKeyId,
      reviewerName: input.reviewerName ?? null,
    },
  });

  return finalRequest;
}

export async function replyTelegramPremiumSupportRequest(input: {
  requestId: string;
  reviewedByUserId?: string | null;
  reviewerName?: string | null;
  adminNote?: string | null;
  customerMessage: string;
}) {
  const request = await db.telegramPremiumSupportRequest.findUnique({
    where: { id: input.requestId },
    include: {
      dynamicAccessKey: true,
    },
  });

  if (!request) {
    throw new Error('Premium support request not found.');
  }

  if (request.status === 'DISMISSED') {
    throw new Error('This premium support request is closed.');
  }

  const message = input.customerMessage.trim();
  if (!message) {
    throw new Error('Customer message is required.');
  }

  const locale = coerceSupportedLocale(request.locale) || (await getTelegramDefaultLocale());
  const supportLink = await getTelegramSupportLink();

  const finalRequest = await db.telegramPremiumSupportRequest.update({
    where: { id: request.id },
    data: {
      adminNote: appendTelegramPremiumSupportAdminNote(request.adminNote, input.adminNote),
      customerMessage: message,
      followUpPending: false,
      lastAdminReplyAt: new Date(),
      reviewedByUserId: input.reviewedByUserId ?? request.reviewedByUserId ?? null,
      reviewerName: input.reviewerName ?? request.reviewerName ?? null,
    },
  });

  await addTelegramPremiumSupportReply({
    requestId: request.id,
    senderType: 'ADMIN',
    adminUserId: input.reviewedByUserId ?? null,
    senderName: input.reviewerName ?? null,
    message,
  });

  const config = await getTelegramConfig();
  if (config) {
    await sendTelegramMessage(
      config.botToken,
      request.telegramChatId,
      message,
      {
        replyMarkup:
          request.status === 'PENDING_REVIEW'
            ? buildTelegramDynamicPremiumPendingKeyboard({
                dynamicAccessKeyId: request.dynamicAccessKeyId,
                requestId: request.id,
                locale,
                supportLink,
              })
            : buildTelegramDynamicPremiumSupportKeyboard(
                request.dynamicAccessKeyId,
                locale,
                supportLink,
                request.id,
              ),
      },
    );
  }

  await writeAuditLog({
    userId: input.reviewedByUserId ?? null,
    action: 'TELEGRAM_PREMIUM_SUPPORT_REPLIED',
    entity: 'TELEGRAM_PREMIUM_SUPPORT_REQUEST',
    entityId: request.id,
    details: {
      requestCode: request.requestCode,
      requestType: request.requestType,
      dynamicAccessKeyId: request.dynamicAccessKeyId,
      reviewerName: input.reviewerName ?? null,
    },
  });

  return finalRequest;
}

export async function updateTelegramOrderDraft(input: {
  orderId: string;
  updatedByUserId?: string | null;
  updaterName?: string | null;
  planCode?: TelegramSalesPlanCode | null;
  durationMonths?: number | null;
  selectedServerId?: string | null;
}) {
  const order = await db.telegramOrder.findUnique({
    where: { id: input.orderId },
  });

  if (!order) {
    throw new Error('Telegram order not found.');
  }

  if (isTelegramOrderTerminal(order.status) || order.status === 'FULFILLED' || order.status === 'APPROVED') {
    throw new Error('Only active Telegram orders can be edited.');
  }

  if (
    order.assignedReviewerUserId &&
    order.assignedReviewerUserId !== (input.updatedByUserId ?? null)
  ) {
    throw new Error(`This Telegram order is claimed by ${order.assignedReviewerEmail || 'another admin'}.`);
  }

  const locale = coerceSupportedLocale(order.locale) || (await getTelegramDefaultLocale());
  const salesSettings = await getTelegramSalesSettings();
  const planCode = (input.planCode || order.planCode || null) as TelegramSalesPlanCode | null;

  if (!planCode) {
    throw new Error('Select a plan before updating the order.');
  }

  const plan = resolveTelegramSalesPlan(salesSettings, planCode);
  if (!plan || !plan.enabled) {
    throw new Error('The selected plan is no longer available.');
  }

  const deliveryType = plan.deliveryType;
  if (order.kind === 'RENEW') {
    if (deliveryType === 'DYNAMIC_KEY' && !order.targetDynamicKeyId) {
      throw new Error('This renewal order must use a premium dynamic plan.');
    }

    if (deliveryType === 'ACCESS_KEY' && !order.targetAccessKeyId) {
      throw new Error('This renewal order must use a standard access-key plan.');
    }
  }

  let durationMonths: number | null = null;
  let durationDays: number | null = null;
  if (typeof plan.fixedDurationDays === 'number' && Number.isFinite(plan.fixedDurationDays)) {
    durationDays = plan.fixedDurationDays;
  } else if (typeof plan.fixedDurationMonths === 'number' && Number.isFinite(plan.fixedDurationMonths)) {
    durationMonths = plan.fixedDurationMonths;
  } else {
    const requestedDuration =
      input.durationMonths ?? order.durationMonths ?? plan.minDurationMonths ?? 1;
    const minDuration = plan.minDurationMonths ?? 1;
    if (requestedDuration < minDuration) {
      throw new Error(`The selected plan requires at least ${minDuration} month(s).`);
    }
    durationMonths = requestedDuration;
  }

  let selectedServerId = order.selectedServerId;
  let selectedServerName = order.selectedServerName;
  let selectedServerCountryCode = order.selectedServerCountryCode;

  if ((order.kind === 'NEW' || deliveryType === 'DYNAMIC_KEY') && input.selectedServerId !== undefined) {
    if (!input.selectedServerId) {
      selectedServerId = null;
      selectedServerName = null;
      selectedServerCountryCode = null;
    } else {
      const resolvedServer = await resolveTelegramProvisioningServer({
        selectedServerId: input.selectedServerId,
      });
      selectedServerId = resolvedServer.id;
      selectedServerName = resolvedServer.name;
      selectedServerCountryCode = resolvedServer.countryCode ?? null;
    }
  }

  const planSnapshot = buildTelegramOrderPlanSnapshot(plan, locale, {
    durationMonths,
    durationDays,
    couponCampaignType: order.couponCampaignType,
    couponCode: order.couponCode,
    couponDiscountAmount: order.couponDiscountAmount,
    couponDiscountLabel: order.couponDiscountLabel,
  });

  const updatedOrder = await db.telegramOrder.update({
    where: { id: order.id },
    data: {
      ...planSnapshot,
      targetAccessKeyId: deliveryType === 'ACCESS_KEY' ? order.targetAccessKeyId : null,
      targetDynamicKeyId: deliveryType === 'DYNAMIC_KEY' ? order.targetDynamicKeyId : null,
      selectedServerId,
      selectedServerName,
      selectedServerCountryCode,
      updatedAt: new Date(),
    },
  });

  await writeAuditLog({
    userId: input.updatedByUserId ?? null,
    action: 'TELEGRAM_ORDER_UPDATED',
    entity: 'TELEGRAM_ORDER',
    entityId: updatedOrder.id,
    details: {
      orderCode: updatedOrder.orderCode,
      updaterName: input.updaterName ?? null,
      planCode: updatedOrder.planCode,
      durationMonths: updatedOrder.durationMonths,
      durationDays: updatedOrder.durationDays,
      selectedServerId: updatedOrder.selectedServerId,
      selectedServerName: updatedOrder.selectedServerName,
    },
  });

  return updatedOrder;
}

function buildTelegramCommandUrl(botUsername?: string | null, command?: string | null) {
  const normalizedUsername = botUsername?.trim().replace(/^@+/, '');
  const normalizedCommand = command?.trim().replace(/^\/+/, '');
  if (!normalizedUsername) {
    return null;
  }

  if (!normalizedCommand) {
    return `https://t.me/${normalizedUsername}`;
  }

  return `https://t.me/${normalizedUsername}?start=${encodeURIComponent(normalizedCommand)}`;
}

export async function createAccessKeyTelegramConnectLink(input: {
  accessKeyId: string;
  createdByUserId?: string | null;
}) {
  const config = await getTelegramConfig();
  if (!config) {
    throw new Error('Telegram bot is not configured.');
  }

  const key = await db.accessKey.findUnique({
    where: { id: input.accessKeyId },
    select: {
      id: true,
      userId: true,
      name: true,
    },
  });

  if (!key) {
    throw new Error('Access key not found.');
  }

  const botUsername = await getTelegramBotUsername(config.botToken, config.botUsername);
  if (!botUsername) {
    throw new Error('Unable to resolve the Telegram bot username.');
  }

  const token = generateRandomString(24);
  const expiresAt = new Date(Date.now() + TELEGRAM_CONNECT_TOKEN_TTL_MS);

  await db.telegramLinkToken.create({
    data: {
      token,
      accessKeyId: key.id,
      userId: key.userId,
      createdByUserId: input.createdByUserId ?? null,
      expiresAt,
    },
  });

  return {
    startToken: token,
    botUsername,
    expiresAt,
    url: `https://t.me/${botUsername}?start=${token}`,
  };
}

export async function createDynamicKeyTelegramConnectLink(input: {
  dynamicAccessKeyId: string;
  createdByUserId?: string | null;
}) {
  const config = await getTelegramConfig();
  if (!config) {
    throw new Error('Telegram bot is not configured.');
  }

  const key = await db.dynamicAccessKey.findUnique({
    where: { id: input.dynamicAccessKeyId },
    select: {
      id: true,
      userId: true,
      name: true,
    },
  });

  if (!key) {
    throw new Error('Dynamic key not found.');
  }

  const botUsername = await getTelegramBotUsername(config.botToken, config.botUsername);
  if (!botUsername) {
    throw new Error('Unable to resolve the Telegram bot username.');
  }

  const token = generateRandomString(24);
  const expiresAt = new Date(Date.now() + TELEGRAM_CONNECT_TOKEN_TTL_MS);

  await db.telegramLinkToken.create({
    data: {
      token,
      kind: 'DYNAMIC_KEY_CONNECT',
      dynamicAccessKeyId: key.id,
      userId: key.userId,
      createdByUserId: input.createdByUserId ?? null,
      expiresAt,
    },
  });

  return {
    startToken: token,
    botUsername,
    expiresAt,
    url: `https://t.me/${botUsername}?start=${token}`,
  };
}

export async function sendAccessKeySharePageToTelegram(input: {
  accessKeyId: string;
  chatId?: string | number | null;
  reason?:
    | 'CREATED'
    | 'RESENT'
    | 'LINKED'
    | 'KEY_ENABLED'
    | 'USAGE_REQUEST'
    | 'SUBSCRIPTION_REQUEST';
  source?: string | null;
  includeQr?: boolean;
  locale?: SupportedLocale;
}) {
  const config = await getTelegramConfig();
  if (!config) {
    throw new Error('Telegram bot is not configured.');
  }

  const key = await loadAccessKeyForMessaging(input.accessKeyId);
  if (!key) {
    throw new Error('Access key not found.');
  }

  if (!key.telegramDeliveryEnabled) {
    throw new Error('Telegram delivery is disabled for this key.');
  }

  const destinationChatId =
    (input.chatId ? String(input.chatId) : null) || resolveTelegramChatIdForKey(key);
  if (!destinationChatId) {
    throw new Error('This key is not linked to a Telegram chat yet.');
  }

  const token = await ensureAccessKeySubscriptionToken(key.id, key.subscriptionToken);
  const defaults = await getSubscriptionDefaults();
  const locale = await resolveTelegramLocaleForRecipient({
    telegramUserId: key.telegramId || null,
    telegramChatId: destinationChatId,
    fallbackLocale: input.locale || defaults.defaultLanguage,
  });
  const ui = getTelegramUi(locale);
  const sharePageUrl = key.publicSlug
    ? buildShortShareUrl(key.publicSlug, { source: input.source || 'telegram', lang: locale })
    : buildSharePageUrl(token, { source: input.source || 'telegram', lang: locale });
  const subscriptionUrl = buildSubscriptionApiUrl(token, { source: input.source || 'telegram' });
  const welcomeMessage =
    key.subscriptionWelcomeMessage?.trim() ||
    resolveTelegramTemplate(
      defaults.localizedWelcomeMessages,
      locale,
      defaults.welcomeMessage ?? undefined,
    );
  const supportLink = await getTelegramSupportLink();
  const salesSettings = await getTelegramSalesSettings();
  const reasonTitle = ui.accessReasonTitle(input.reason);

  const lines = [
    reasonTitle,
    '',
    `🔑 ${ui.keyLabel}: <b>${escapeHtml(key.name)}</b>`,
    `🖥 ${ui.serverLabel}: ${escapeHtml(key.server.name)}${key.server.countryCode ? ` ${getFlagEmoji(key.server.countryCode)}` : ''}`,
    `📈 ${ui.statusLineLabel}: ${escapeHtml(key.status)}`,
    `⏳ ${ui.expirationLabel}: ${escapeHtml(formatExpirationSummary(key, locale))}`,
    key.dataLimitBytes ? `📦 ${ui.quotaLabel}: ${formatBytes(key.usedBytes)} / ${formatBytes(key.dataLimitBytes)}` : `📦 ${ui.quotaLabel}: ${ui.unlimited}`,
    '',
    welcomeMessage ? escapeHtml(welcomeMessage) : ui.accessShareFallback,
    '',
    `🌐 ${ui.sharePageLabel}: ${sharePageUrl}`,
    `🔄 ${ui.subscriptionUrlLabel}: ${subscriptionUrl}`,
  ];

  const inlineKeyboard: Array<Array<{ text: string; url?: string; callback_data?: string }>> = [
    [{ text: ui.openSharePage, url: sharePageUrl }],
    [{ text: ui.openSubscriptionUrl, url: subscriptionUrl }],
  ];

  if (salesSettings.enabled && salesSettings.allowRenewals) {
    inlineKeyboard.push([
      {
        text: ui.orderActionRenewKey,
        callback_data: buildTelegramOrderActionCallbackData('ky', key.id),
      },
    ]);
  }

  inlineKeyboard.push([
    {
      text: ui.myKeysServerIssue,
      callback_data: buildTelegramServerChangeActionCallbackData('ky', key.id),
    },
  ]);

  if (supportLink) {
    inlineKeyboard.push([{ text: ui.getSupport, url: supportLink }]);
  }

  await sendTelegramMessage(config.botToken, destinationChatId, lines.join('\n'), {
    replyMarkup: { inline_keyboard: inlineKeyboard },
  });

  if (input.includeQr ?? true) {
    try {
      const qrBuffer = await QRCode.toBuffer(key.accessUrl || sharePageUrl, {
        width: 300,
        margin: 2,
      });
      await sendTelegramPhoto(
        config.botToken,
        destinationChatId,
        qrBuffer,
        ui.accessQrCaption,
      );
    } catch (error) {
      console.error('Failed to generate Telegram QR code:', error);
    }
  }

  await recordSubscriptionPageEvent({
    accessKeyId: key.id,
    eventType: SUBSCRIPTION_EVENT_TYPES.TELEGRAM_SENT,
    source: input.source || 'telegram',
    metadata: {
      reason: input.reason || 'RESENT',
      destinationChatId,
    },
  });

  await writeAuditLog({
    action: 'TELEGRAM_SHARE_SENT',
    entity: 'ACCESS_KEY',
    entityId: key.id,
    details: {
      reason: input.reason || 'RESENT',
      destinationChatId,
      sharePageUrl,
    },
  });

  return {
    sharePageUrl,
    subscriptionUrl,
    destinationChatId,
  };
}

export async function sendDynamicKeySharePageToTelegram(input: {
  dynamicAccessKeyId: string;
  chatId?: string | number | null;
  planName?: string | null;
  reason?:
    | 'CREATED'
    | 'RESENT'
    | 'LINKED'
    | 'KEY_ENABLED'
    | 'USAGE_REQUEST'
    | 'SUBSCRIPTION_REQUEST';
  source?: string | null;
  includeQr?: boolean;
  locale?: SupportedLocale;
}) {
  const config = await getTelegramConfig();
  if (!config) {
    throw new Error('Telegram bot is not configured.');
  }

  const key = await loadDynamicAccessKeyForMessaging(input.dynamicAccessKeyId);
  if (!key) {
    throw new Error('Dynamic key not found.');
  }

  const destinationChatId =
    (input.chatId ? String(input.chatId) : null) || resolveTelegramChatIdForDynamicKey(key);
  if (!destinationChatId) {
    throw new Error('This dynamic key is not linked to a Telegram chat yet.');
  }

  const defaults = await getSubscriptionDefaults();
  const locale = await resolveTelegramLocaleForRecipient({
    telegramUserId: key.telegramId || null,
    telegramChatId: destinationChatId,
    fallbackLocale: input.locale || defaults.defaultLanguage,
  });
  const ui = getTelegramUi(locale);
  const { sharePageUrl, subscriptionUrl, outlineClientUrl } = getDynamicKeyMessagingUrls(
    key,
    input.source || 'telegram',
    locale,
  );
  if (!subscriptionUrl || !outlineClientUrl) {
    throw new Error('This dynamic key does not have a usable client URL yet.');
  }

  const welcomeMessage =
    key.subscriptionWelcomeMessage?.trim() ||
    resolveTelegramTemplate(
      defaults.localizedWelcomeMessages,
      locale,
      defaults.welcomeMessage ?? undefined,
    );
  const supportLink = await getTelegramSupportLink();
  const latestRequest = await db.telegramPremiumSupportRequest.findFirst({
    where: {
      dynamicAccessKeyId: key.id,
      OR: [
        { telegramChatId: destinationChatId },
        ...(key.telegramId ? [{ telegramUserId: key.telegramId }] : []),
      ],
    },
    include: {
      replies: {
        orderBy: [{ createdAt: 'asc' }],
        take: 4,
      },
    },
    orderBy: [{ updatedAt: 'desc' }],
  });
  const attachedCount = key.accessKeys.length;
  const poolSummary = formatTelegramDynamicPoolSummary(key, ui);
  const preferredRegions = getDynamicKeyRegionChoices(key);
  const uniqueServers = Array.from(
    new Set(
      key.accessKeys
        .map((attachedKey) => attachedKey.server?.name)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const coverageSummary =
    uniqueServers.length > 0
      ? uniqueServers.slice(0, 3).join(', ') + (uniqueServers.length > 3 ? ` +${uniqueServers.length - 3} more` : '')
      : ui.coverageAutoSelected;
  const reasonTitle = ui.dynamicReasonTitle(input.reason);
  const premiumPlanLabel = input.planName?.trim() || ui.premiumLabel;

  const lines = [
    reasonTitle,
    '',
    `💎 ${ui.planLabel}: <b>${escapeHtml(premiumPlanLabel)}</b>`,
    `🔁 ${ui.keyLabel}: <b>${escapeHtml(key.name)}</b>`,
    `🧭 ${ui.modeLabel}: ${escapeHtml(key.type === 'SELF_MANAGED' ? ui.modeSelfManaged : ui.modeManual)}`,
    `🖥 ${ui.backendsLabel}: ${attachedCount} attached key(s)`,
    `🌍 ${ui.coverageLabel}: ${escapeHtml(coverageSummary)}`,
    `📈 ${ui.statusLineLabel}: ${escapeHtml(key.status)}`,
    `⏳ ${ui.expirationLabel}: ${escapeHtml(formatExpirationSummary(key, locale))}`,
    key.dataLimitBytes ? `📦 ${ui.quotaLabel}: ${formatBytes(key.usedBytes)} / ${formatBytes(key.dataLimitBytes)}` : `📦 ${ui.quotaLabel}: ${ui.unlimited}`,
    '',
    `✨ ${ui.premiumStableLink}`,
    key.type === 'SELF_MANAGED' ? `⚡ ${ui.premiumAutoFailover}` : '',
    `🧭 ${poolSummary}`,
    preferredRegions.length > 0 ? `🌐 ${ui.premiumPreferredRegionSummary(preferredRegions.join(', '))}` : '',
    '',
    welcomeMessage
      ? escapeHtml(welcomeMessage)
      : key.sharePageEnabled
        ? ui.dynamicShareFallback
        : ui.dynamicShareDisabledFallback,
  ];

  if (key.sharePageEnabled && sharePageUrl) {
    lines.push('', `🌐 ${ui.sharePageLabel}: ${sharePageUrl}`);
  }

  lines.push(`🔄 ${ui.clientEndpointLabel}: ${subscriptionUrl}`);
  lines.push(`⚡ ${ui.outlineClientUrlLabel}: ${outlineClientUrl}`);

  const inlineKeyboard: Array<Array<{ text: string; url?: string; callback_data?: string }>> = [];
  if (key.sharePageEnabled && sharePageUrl) {
    inlineKeyboard.push([{ text: ui.openSharePage, url: sharePageUrl }]);
  }
  inlineKeyboard.push([{ text: ui.openClientEndpoint, url: subscriptionUrl }]);

  const salesSettings = await getTelegramSalesSettings();
  const renewCommandUrl =
    salesSettings.enabled && salesSettings.allowRenewals
      ? buildTelegramCommandUrl(config.botUsername, 'renew')
      : null;
  if (renewCommandUrl) {
    inlineKeyboard.push([
      {
        text: ui.orderActionRenewKey,
        url: renewCommandUrl,
      },
    ]);
  }

  inlineKeyboard.push([
    {
      text: ui.premiumChangeRegion,
      callback_data: buildTelegramDynamicSupportActionCallbackData('rg', key.id),
    },
  ]);
  inlineKeyboard.push([
    {
      text: ui.premiumReportRouteIssue,
      callback_data: buildTelegramDynamicSupportActionCallbackData('is', key.id),
    },
  ]);

  if (latestRequest) {
    inlineKeyboard.push([
      {
        text: ui.myKeysPremiumStatus,
        callback_data: buildTelegramDynamicSupportActionCallbackData('st', latestRequest.id),
      },
      {
        text: ui.premiumReplyToRequest,
        callback_data: buildTelegramDynamicSupportActionCallbackData('rp', latestRequest.id),
      },
    ]);
  }

  if (supportLink) {
    inlineKeyboard.push([{ text: ui.getSupport, url: supportLink }]);
  }

  await sendTelegramMessage(config.botToken, destinationChatId, lines.join('\n'), {
    replyMarkup: { inline_keyboard: inlineKeyboard },
  });

  if (input.includeQr ?? true) {
    try {
      const qrBuffer = await QRCode.toBuffer(outlineClientUrl, {
        width: 300,
        margin: 2,
      });
      await sendTelegramPhoto(
        config.botToken,
        destinationChatId,
        qrBuffer,
        ui.dynamicQrCaption,
      );
    } catch (error) {
      console.error('Failed to generate Telegram QR code for dynamic key:', error);
    }
  }

  await recordSubscriptionPageEvent({
    dynamicAccessKeyId: key.id,
    eventType: SUBSCRIPTION_EVENT_TYPES.TELEGRAM_SENT,
    source: input.source || 'telegram',
    metadata: {
      reason: input.reason || 'RESENT',
      destinationChatId,
      sharePageEnabled: key.sharePageEnabled,
    },
  });

  await writeAuditLog({
    action: 'TELEGRAM_SHARE_SENT',
    entity: 'DYNAMIC_ACCESS_KEY',
    entityId: key.id,
    details: {
      reason: input.reason || 'RESENT',
      destinationChatId,
      sharePageUrl,
      subscriptionUrl,
    },
  });

  return {
    sharePageUrl,
    subscriptionUrl,
    outlineClientUrl,
    destinationChatId,
  };
}

export async function sendAccessKeyLifecycleTelegramNotification(input: {
  accessKeyId: string;
  type:
    | 'CREATED'
    | 'DISABLED'
    | 'ENABLED'
    | 'EXPIRING_7D'
    | 'EXPIRING_3D'
    | 'EXPIRED';
  daysLeft?: number;
}) {
  if (input.type === 'CREATED' || input.type === 'ENABLED') {
    return sendAccessKeySharePageToTelegram({
      accessKeyId: input.accessKeyId,
      reason: input.type === 'CREATED' ? 'CREATED' : 'KEY_ENABLED',
      source: 'telegram_notification',
    });
  }

  return sendAccessKeyLifecycleTelegramReminder(input);
}

export async function sendAccessKeySupportMessage(input: {
  accessKeyId: string;
  message: string;
  chatId?: string | number | null;
  source?: string | null;
}) {
  const config = await getTelegramConfig();
  if (!config) {
    throw new Error('Telegram bot is not configured.');
  }

  const key = await loadAccessKeyForMessaging(input.accessKeyId);
  if (!key) {
    throw new Error('Access key not found.');
  }

  if (!key.telegramDeliveryEnabled) {
    throw new Error('Telegram delivery is disabled for this key.');
  }

  const trimmedMessage = input.message.trim();
  if (!trimmedMessage) {
    throw new Error('Support message cannot be empty.');
  }

  const destinationChatId =
    (input.chatId ? String(input.chatId) : null) || resolveTelegramChatIdForKey(key);
  if (!destinationChatId) {
    throw new Error('This key is not linked to a Telegram chat yet.');
  }

  const defaults = await getSubscriptionDefaults();
  const locale = await resolveTelegramLocaleForRecipient({
    telegramUserId: key.telegramId || null,
    telegramChatId: destinationChatId,
    fallbackLocale: defaults.defaultLanguage,
  });
  const ui = getTelegramUi(locale);
  const token = await ensureAccessKeySubscriptionToken(key.id, key.subscriptionToken);
  const sharePageUrl = key.publicSlug
    ? buildShortShareUrl(key.publicSlug, { source: input.source || 'support_message', lang: locale })
    : buildSharePageUrl(token, { source: input.source || 'support_message', lang: locale });

  const lines = locale === 'my'
    ? [
        '💬 <b>Administrator မှ စာပို့ထားပါသည်</b>',
        '',
        `🔑 Key: <b>${escapeHtml(key.name)}</b>`,
        '',
        escapeHtml(trimmedMessage),
        '',
        `🌐 Share page: ${sharePageUrl}`,
      ]
    : [
        '💬 <b>Message from your administrator</b>',
        '',
        `🔑 Key: <b>${escapeHtml(key.name)}</b>`,
        '',
        escapeHtml(trimmedMessage),
        '',
        `🌐 Share page: ${sharePageUrl}`,
      ];

  await sendTelegramMessage(config.botToken, destinationChatId, lines.join('\n'), {
    replyMarkup: {
      inline_keyboard: [[{ text: ui.openSharePage, url: sharePageUrl }]],
    },
  });

  await recordSubscriptionPageEvent({
    accessKeyId: key.id,
    eventType: SUBSCRIPTION_EVENT_TYPES.TELEGRAM_SENT,
    source: input.source || 'support_message',
    metadata: {
      destinationChatId,
      notificationType: 'SUPPORT_MESSAGE',
    },
  });

  await writeAuditLog({
    action: 'ACCESS_KEY_SUPPORT_MESSAGE_SENT',
    entity: 'ACCESS_KEY',
    entityId: key.id,
    details: {
      destinationChatId,
      message: trimmedMessage,
      sharePageUrl,
    },
  });

  return {
    destinationChatId,
    sharePageUrl,
  };
}

export async function sendRenewalRequestToAdmins(input: {
  accessKeyId: string;
  requesterTelegramId: string;
  requesterName: string;
}) {
  const key = await db.accessKey.findUnique({
    where: { id: input.accessKeyId },
    include: {
      server: true,
      user: true,
    },
  });

  if (!key) {
    throw new Error('Access key not found.');
  }

  const locale = await getTelegramDefaultLocale();
  const ui = getTelegramUi(locale);
  const token = await ensureAccessKeySubscriptionToken(key.id, key.subscriptionToken);
  const sharePageUrl = key.publicSlug
    ? buildShortShareUrl(key.publicSlug, { source: 'telegram_renew_request', lang: locale })
    : buildSharePageUrl(token, { source: 'telegram_renew_request', lang: locale });
  const message = [
    locale === 'my' ? '🔁 <b>Telegram မှ သက်တမ်းတိုးရန် တောင်းဆိုထားပါသည်</b>' : '🔁 <b>Renewal requested from Telegram</b>',
    '',
    `${ui.requesterLabel}: <b>${escapeHtml(input.requesterName)}</b>`,
    `${ui.telegramIdLabel}: <code>${escapeHtml(input.requesterTelegramId)}</code>`,
    `${ui.keyLabel}: <b>${escapeHtml(key.name)}</b>`,
    `${ui.serverLabel}: ${escapeHtml(key.server.name)}`,
    key.email ? `${ui.emailLabel}: ${escapeHtml(key.email)}` : '',
    '',
    `${ui.sharePageLabel}: ${sharePageUrl}`,
  ]
    .filter(Boolean)
    .join('\n');

  await sendAdminAlert(message);
  await writeAuditLog({
    action: 'TELEGRAM_RENEWAL_REQUEST',
    entity: 'ACCESS_KEY',
    entityId: key.id,
    details: {
      requesterTelegramId: input.requesterTelegramId,
      requesterName: input.requesterName,
      sharePageUrl,
    },
  });

  return {
    keyId: key.id,
    sharePageUrl,
  };
}

async function markTelegramLinkTokenConsumed(input: {
  token: string;
  chatId: string;
  telegramUserId: string;
}) {
  const linkToken = await db.telegramLinkToken.findUnique({
    where: { token: input.token },
    include: {
      accessKey: {
        include: {
          server: true,
          user: true,
        },
      },
      dynamicAccessKey: {
        include: {
          user: true,
        },
      },
    },
  });

  if (!linkToken) {
    return {
      status: 'missing' as const,
      accessKeyId: null,
      dynamicAccessKeyId: null,
    };
  }

  if (linkToken.consumedAt && linkToken.consumedByChatId === input.chatId) {
    return {
      status: 'already-linked' as const,
      accessKeyId: linkToken.accessKey?.id ?? null,
      dynamicAccessKeyId: linkToken.dynamicAccessKey?.id ?? null,
    };
  }

  if (linkToken.expiresAt.getTime() < Date.now()) {
    return {
      status: 'expired' as const,
      accessKeyId: null,
      dynamicAccessKeyId: null,
    };
  }

  if (!linkToken.accessKey && !linkToken.dynamicAccessKey) {
    return {
      status: 'missing-key' as const,
      accessKeyId: null,
      dynamicAccessKeyId: null,
    };
  }

  await db.$transaction(async (tx) => {
    if (linkToken.accessKey) {
      await tx.accessKey.update({
        where: { id: linkToken.accessKey.id },
        data: {
          telegramId: input.telegramUserId,
        },
      });
    }

    if (linkToken.dynamicAccessKey) {
      await tx.dynamicAccessKey.update({
        where: { id: linkToken.dynamicAccessKey.id },
        data: {
          telegramId: input.telegramUserId,
        },
      });
    }

    if (linkToken.userId) {
      await tx.user.update({
        where: { id: linkToken.userId },
        data: {
          telegramChatId: input.chatId,
        },
      });
    }

    await tx.telegramLinkToken.update({
      where: { id: linkToken.id },
      data: {
        consumedAt: new Date(),
        consumedByChatId: input.chatId,
      },
    });
  });

  if (linkToken.accessKey) {
    await recordSubscriptionPageEvent({
      accessKeyId: linkToken.accessKey.id,
      eventType: SUBSCRIPTION_EVENT_TYPES.TELEGRAM_CONNECTED,
      source: 'telegram_start',
      metadata: {
        telegramUserId: input.telegramUserId,
        chatId: input.chatId,
      },
    });

    await writeAuditLog({
      action: 'TELEGRAM_LINK_COMPLETED',
      entity: 'ACCESS_KEY',
      entityId: linkToken.accessKey.id,
      details: {
        telegramUserId: input.telegramUserId,
        chatId: input.chatId,
      },
    });
  }

  if (linkToken.dynamicAccessKey) {
    await recordSubscriptionPageEvent({
      dynamicAccessKeyId: linkToken.dynamicAccessKey.id,
      eventType: SUBSCRIPTION_EVENT_TYPES.TELEGRAM_CONNECTED,
      source: 'telegram_start',
      metadata: {
        telegramUserId: input.telegramUserId,
        chatId: input.chatId,
      },
    });

    await writeAuditLog({
      action: 'TELEGRAM_LINK_COMPLETED',
      entity: 'DYNAMIC_ACCESS_KEY',
      entityId: linkToken.dynamicAccessKey.id,
      details: {
        telegramUserId: input.telegramUserId,
        chatId: input.chatId,
      },
    });
  }

  return {
    status: 'linked' as const,
    accessKeyId: linkToken.accessKey?.id ?? null,
    dynamicAccessKeyId: linkToken.dynamicAccessKey?.id ?? null,
  };
}

async function handleStartCommand(
  chatId: number,
  telegramUserId: number,
  username: string,
  isAdmin: boolean,
  botToken: string,
  argsText: string,
  localeOverride?: SupportedLocale,
): Promise<string | null> {
  return handleTelegramStartCommand({
    chatId,
    telegramUserId,
    username,
    isAdmin,
    botToken,
    argsText,
    localeOverride,
    deps: {
      getTelegramConfig,
      markTelegramLinkTokenConsumed,
      resolveTelegramTemplate,
      sendAccessKeySharePageToTelegram,
      sendDynamicKeySharePageToTelegram,
    },
  });
}

async function handleEmailLink(
  chatId: number,
  telegramUserId: number,
  email: string,
  locale: SupportedLocale,
) {
  const ui = getTelegramUi(locale);
  const keys = await db.accessKey.findMany({
    where: {
      email: email.toLowerCase(),
      status: { in: ['ACTIVE', 'PENDING', 'DISABLED'] },
    },
  });

  if (keys.length === 0) {
    return ui.emailNoKeys(escapeHtml(email));
  }

  await db.accessKey.updateMany({
    where: { email: email.toLowerCase() },
    data: { telegramId: String(telegramUserId) },
  });

  const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
  if (user) {
    await db.user.update({
      where: { id: user.id },
      data: { telegramChatId: String(chatId) },
    });
  }

  return ui.emailLinked(keys.length);
}

async function handleLanguageCommand(
  chatId: number,
  botToken: string,
): Promise<null> {
  await sendTelegramMessage(
    botToken,
    chatId,
    buildTelegramLocaleSelectorMessage('switch'),
    {
      replyMarkup: buildTelegramLocaleSelectorKeyboard('switch'),
    },
  );

  return null;
}

async function handleTelegramCallbackQuery(
  callbackQuery: TelegramCallbackQuery,
  config: TelegramConfig,
) {
  const chatId = callbackQuery.message?.chat.id;
  if (!chatId) {
    await answerTelegramCallbackQuery(
      config.botToken,
      callbackQuery.id,
      'Unsupported action',
    );
    return null;
  }

  const adminActor = await resolveTelegramAdminActor({
    telegramUserId: callbackQuery.from.id,
    chatId,
    config,
  });
  const isAdmin = adminActor.isAdmin;

  const localePreferenceResult = await handleTelegramLocaleOrPreferenceCallback({
    callbackQuery,
    config,
    isAdmin,
    deps: {
      getTelegramConversationLocale,
      handleStartCommand,
    },
  });
  if (localePreferenceResult.handled) {
    return localePreferenceResult.result;
  }

  {
    const userServerChangeAction = parseTelegramServerChangeActionCallbackData(callbackQuery.data);
    if (userServerChangeAction) {
      const locale = await getTelegramConversationLocale({
        telegramUserId: callbackQuery.from.id,
        telegramChatId: chatId,
      });
      const ui = getTelegramUi(locale);
      const supportLink = await getTelegramSupportLink();

      try {
        switch (userServerChangeAction.action) {
          case 'ky': {
            const accessKey = (await findLinkedAccessKeys(chatId, callbackQuery.from.id, true)).find(
              (key) => key.id === userServerChangeAction.primary,
            );

            if (!accessKey || !['ACTIVE', 'PENDING'].includes(accessKey.status)) {
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.serverChangeRequestNotFound,
              );
              return null;
            }

            const remainingChanges = Math.max(
              0,
              accessKey.serverChangeLimit - accessKey.serverChangeCount,
            );
            if (remainingChanges <= 0) {
              await sendTelegramMessage(
                config.botToken,
                chatId,
                `${ui.serverChangeNoEligible}\n\n${ui.serverChangeLimitReached(accessKey.name)}`,
                {
                  replyMarkup: buildTelegramServerChangeSupportKeyboard(locale, supportLink),
                },
              );
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.serverChangeLimitReached(accessKey.name),
              );
              return null;
            }

            const existingPending = await db.telegramServerChangeRequest.findFirst({
              where: {
                accessKeyId: accessKey.id,
                status: 'PENDING_REVIEW',
              },
              select: {
                id: true,
                requestCode: true,
              },
            });
            if (existingPending) {
              await sendTelegramMessage(
                config.botToken,
                chatId,
                ui.serverChangeRequestPending(existingPending.requestCode),
                {
                  replyMarkup: buildTelegramServerChangePendingKeyboard(
                    existingPending.id,
                    locale,
                    supportLink,
                  ),
                },
              );
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.serverChangeRequestPending(existingPending.requestCode),
              );
              return null;
            }

            const candidateServers = (await listAssignableTelegramOrderServers()).filter(
              (server) => server.id !== accessKey.serverId,
            );
            if (candidateServers.length === 0) {
              await sendTelegramMessage(
                config.botToken,
                chatId,
                ui.serverChangeNoAlternateServers,
                {
                  replyMarkup: buildTelegramServerChangeSupportKeyboard(locale, supportLink),
                },
              );
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.serverChangeNoAlternateServers,
              );
              return null;
            }

            await sendTelegramMessage(
              config.botToken,
              chatId,
              ui.serverChangeChooseServer(
                escapeHtml(accessKey.name),
                `${escapeHtml(accessKey.server.name)}${accessKey.server.countryCode ? ` ${getFlagEmoji(accessKey.server.countryCode)}` : ''}`,
                remainingChanges,
                accessKey.serverChangeLimit,
              ),
              {
                replyMarkup: buildTelegramServerChangeSelectionKeyboard({
                  accessKeyId: accessKey.id,
                  locale,
                  servers: candidateServers,
                }),
              },
            );
            await answerTelegramCallbackQuery(
              config.botToken,
              callbackQuery.id,
              ui.orderActionSelectedKey(accessKey.name),
            );
            return null;
          }
          case 'sv': {
            const accessKey = (await findLinkedAccessKeys(chatId, callbackQuery.from.id, true)).find(
              (key) => key.id === userServerChangeAction.primary,
            );

            if (!accessKey || !['ACTIVE', 'PENDING'].includes(accessKey.status)) {
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.serverChangeRequestNotFound,
              );
              return null;
            }

            const remainingChanges = Math.max(
              0,
              accessKey.serverChangeLimit - accessKey.serverChangeCount,
            );
            if (remainingChanges <= 0) {
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.serverChangeLimitReached(accessKey.name),
              );
              return null;
            }

            const requestedServer = (await listAssignableTelegramOrderServers()).find(
              (server) =>
                server.id === userServerChangeAction.secondary && server.id !== accessKey.serverId,
            );
            if (!requestedServer) {
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.invalidServerChoice,
              );
              return null;
            }

            const existingPending = await db.telegramServerChangeRequest.findFirst({
              where: {
                accessKeyId: accessKey.id,
                status: 'PENDING_REVIEW',
              },
              select: {
                id: true,
                requestCode: true,
              },
            });
            if (existingPending) {
              await sendTelegramMessage(
                config.botToken,
                chatId,
                ui.serverChangeRequestPending(existingPending.requestCode),
                {
                  replyMarkup: buildTelegramServerChangePendingKeyboard(
                    existingPending.id,
                    locale,
                    supportLink,
                  ),
                },
              );
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.serverChangeRequestPending(existingPending.requestCode),
              );
              return null;
            }

            const request = await createTelegramServerChangeRequestRecord({
              chatId,
              telegramUserId: callbackQuery.from.id,
              telegramUsername: callbackQuery.from.username || callbackQuery.from.first_name,
              locale,
              accessKey,
              requestedServer,
            });

            await sendTelegramServerChangeReviewAlert(request.id);
            await sendTelegramMessage(
              config.botToken,
              chatId,
              ui.serverChangeRequestSubmitted(
                request.requestCode,
                accessKey.name,
                `${requestedServer.name}${requestedServer.countryCode ? ` ${getFlagEmoji(requestedServer.countryCode)}` : ''}`,
              ),
              {
                replyMarkup: buildTelegramServerChangePendingKeyboard(
                  request.id,
                  locale,
                  supportLink,
                ),
              },
            );

            await answerTelegramCallbackQuery(
              config.botToken,
              callbackQuery.id,
              ui.orderActionSelectedServer(requestedServer.name),
            );
            return null;
          }
          case 'st': {
            const request = await findTelegramServerChangeRequestByIdForUser({
              requestId: userServerChangeAction.primary,
              chatId,
              telegramUserId: callbackQuery.from.id,
            });
            if (!request) {
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.serverChangeRequestNotFound,
              );
              return null;
            }

            await sendTelegramMessage(
              config.botToken,
              chatId,
              buildTelegramServerChangeStatusMessage({
                locale,
                request,
              }),
              {
                replyMarkup:
                  request.status === 'PENDING_REVIEW'
                    ? buildTelegramServerChangePendingKeyboard(request.id, locale, supportLink)
                    : buildTelegramServerChangeSupportKeyboard(locale, supportLink),
              },
            );
            await answerTelegramCallbackQuery(
              config.botToken,
              callbackQuery.id,
              ui.orderActionSent,
            );
            return null;
          }
          case 'ca': {
            await answerTelegramCallbackQuery(
              config.botToken,
              callbackQuery.id,
              ui.serverChangeCancelled,
            );
            return null;
          }
        }
      } catch (error) {
        await answerTelegramCallbackQuery(
          config.botToken,
          callbackQuery.id,
          (error as Error).message,
        );
        return null;
      }
    }

    const dynamicSupportAction = parseTelegramDynamicSupportActionCallbackData(callbackQuery.data);
    if (dynamicSupportAction) {
      const locale = await getTelegramConversationLocale({
        telegramUserId: callbackQuery.from.id,
        telegramChatId: chatId,
      });
      const ui = getTelegramUi(locale);
      const supportLink = await getTelegramSupportLink();

      try {
        if (dynamicSupportAction.action === 'st') {
          const request = await findTelegramPremiumSupportRequestByIdForUser({
            requestId: dynamicSupportAction.primary,
            chatId,
            telegramUserId: callbackQuery.from.id,
          });

          if (!request) {
            await answerTelegramCallbackQuery(
              config.botToken,
              callbackQuery.id,
              ui.premiumSupportRequestNotFound,
            );
            return null;
          }

          await sendTelegramMessage(
            config.botToken,
            chatId,
            buildTelegramPremiumSupportStatusMessage({ locale, request }),
            {
              replyMarkup:
                request.status === 'PENDING_REVIEW'
                  ? buildTelegramDynamicPremiumPendingKeyboard({
                      dynamicAccessKeyId: request.dynamicAccessKeyId,
                      requestId: request.id,
                      locale,
                      supportLink,
                    })
                  : buildTelegramDynamicPremiumSupportKeyboard(
                      request.dynamicAccessKeyId,
                      locale,
                      supportLink,
                      request.id,
                    ),
            },
          );
          await answerTelegramCallbackQuery(
            config.botToken,
            callbackQuery.id,
            ui.orderActionSent,
          );
          return null;
        }

        if (dynamicSupportAction.action === 'rp') {
          const request = await findTelegramPremiumSupportRequestByIdForUser({
            requestId: dynamicSupportAction.primary,
            chatId,
            telegramUserId: callbackQuery.from.id,
          });

          if (!request || request.status === 'DISMISSED') {
            await answerTelegramCallbackQuery(
              config.botToken,
              callbackQuery.id,
              ui.premiumFollowUpNotAllowed,
            );
            return null;
          }

          await setTelegramPendingPremiumReply({
            telegramUserId: String(callbackQuery.from.id),
            telegramChatId: String(chatId),
            requestId: request.id,
          });

          await sendTelegramMessage(
            config.botToken,
            chatId,
            ui.premiumFollowUpPrompt(request.requestCode, request.dynamicAccessKey.name),
            {
              replyMarkup:
                request.status === 'PENDING_REVIEW'
                  ? buildTelegramDynamicPremiumPendingKeyboard({
                      dynamicAccessKeyId: request.dynamicAccessKeyId,
                      requestId: request.id,
                      locale,
                      supportLink,
                    })
                  : buildTelegramDynamicPremiumSupportKeyboard(
                      request.dynamicAccessKeyId,
                      locale,
                      supportLink,
                      request.id,
                    ),
            },
          );
          await answerTelegramCallbackQuery(
            config.botToken,
            callbackQuery.id,
            ui.premiumReplyToRequest,
          );
          return null;
        }

        const dynamicKey = (await findLinkedDynamicAccessKeys(chatId, callbackQuery.from.id, true)).find(
          (key) => key.id === dynamicSupportAction.primary,
        );

        if (!dynamicKey) {
          await answerTelegramCallbackQuery(
            config.botToken,
            callbackQuery.id,
            ui.premiumSupportRequestNotFound,
          );
          return null;
        }

        switch (dynamicSupportAction.action) {
          case 'rg': {
            const regionCodes = getDynamicKeyRegionChoices(dynamicKey);
            if (regionCodes.length === 0) {
              await sendTelegramMessage(
                config.botToken,
                chatId,
                ui.premiumNoRegions,
                {
                  replyMarkup: buildTelegramDynamicPremiumSupportKeyboard(
                    dynamicKey.id,
                    locale,
                    supportLink,
                  ),
                },
              );
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.premiumNoRegions,
              );
              return null;
            }

            await sendTelegramMessage(
              config.botToken,
              chatId,
              ui.premiumRegionPrompt(dynamicKey.name, regionCodes.join(', ')),
              {
                replyMarkup: buildTelegramDynamicPremiumRegionKeyboard({
                  dynamicAccessKeyId: dynamicKey.id,
                  locale,
                  regionCodes,
                  supportLink,
                }),
              },
            );
            await answerTelegramCallbackQuery(
              config.botToken,
              callbackQuery.id,
              ui.premiumSupportRequestSent,
            );
            return null;
          }
          case 'rv': {
            const regionCode = dynamicSupportAction.secondary?.toUpperCase() || null;
            const regionCodes = getDynamicKeyRegionChoices(dynamicKey);
            if (!regionCode || !regionCodes.includes(regionCode)) {
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.invalidServerChoice,
              );
              return null;
            }

            const existingPending = await db.telegramPremiumSupportRequest.findFirst({
              where: {
                dynamicAccessKeyId: dynamicKey.id,
                requestType: 'REGION_CHANGE',
                status: 'PENDING_REVIEW',
              },
              select: {
                id: true,
                requestCode: true,
              },
            });
            if (existingPending) {
              await sendTelegramMessage(
                config.botToken,
                chatId,
                ui.premiumSupportRequestPending(existingPending.requestCode),
                {
                  replyMarkup: buildTelegramDynamicPremiumPendingKeyboard({
                    dynamicAccessKeyId: dynamicKey.id,
                    requestId: existingPending.id,
                    locale,
                    supportLink,
                  }),
                },
              );
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.premiumSupportRequestPending(existingPending.requestCode),
              );
              return null;
            }

            const request = await createTelegramPremiumSupportRequestRecord({
              chatId,
              telegramUserId: callbackQuery.from.id,
              telegramUsername: callbackQuery.from.username || callbackQuery.from.first_name,
              locale,
              dynamicAccessKey: dynamicKey,
              requestType: 'REGION_CHANGE',
              requestedRegionCode: regionCode,
            });
            await sendTelegramPremiumSupportReviewAlert(request.id);
            await sendTelegramMessage(
              config.botToken,
              chatId,
              ui.premiumRegionRequestSubmitted(dynamicKey.name, regionCode),
              {
                replyMarkup: buildTelegramDynamicPremiumPendingKeyboard({
                  dynamicAccessKeyId: dynamicKey.id,
                  requestId: request.id,
                  locale,
                  supportLink,
                }),
              },
            );
            await answerTelegramCallbackQuery(
              config.botToken,
              callbackQuery.id,
              ui.premiumSupportRequestSent,
            );
            return null;
          }
          case 'is': {
            const existingPending = await db.telegramPremiumSupportRequest.findFirst({
              where: {
                dynamicAccessKeyId: dynamicKey.id,
                requestType: 'ROUTE_ISSUE',
                status: 'PENDING_REVIEW',
              },
              select: {
                id: true,
                requestCode: true,
              },
            });
            if (existingPending) {
              await sendTelegramMessage(
                config.botToken,
                chatId,
                ui.premiumSupportRequestPending(existingPending.requestCode),
                {
                  replyMarkup: buildTelegramDynamicPremiumPendingKeyboard({
                    dynamicAccessKeyId: dynamicKey.id,
                    requestId: existingPending.id,
                    locale,
                    supportLink,
                  }),
                },
              );
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.premiumSupportRequestPending(existingPending.requestCode),
              );
              return null;
            }

            const request = await createTelegramPremiumSupportRequestRecord({
              chatId,
              telegramUserId: callbackQuery.from.id,
              telegramUsername: callbackQuery.from.username || callbackQuery.from.first_name,
              locale,
              dynamicAccessKey: dynamicKey,
              requestType: 'ROUTE_ISSUE',
            });
            await sendTelegramPremiumSupportReviewAlert(request.id);
            await sendTelegramMessage(
              config.botToken,
              chatId,
              ui.premiumRouteIssueSubmitted(dynamicKey.name),
              {
                replyMarkup: buildTelegramDynamicPremiumPendingKeyboard({
                  dynamicAccessKeyId: dynamicKey.id,
                  requestId: request.id,
                  locale,
                  supportLink,
                }),
              },
            );
            await answerTelegramCallbackQuery(
              config.botToken,
              callbackQuery.id,
              ui.premiumSupportRequestSent,
            );
            return null;
          }
          case 'ca': {
            await answerTelegramCallbackQuery(
              config.botToken,
              callbackQuery.id,
              ui.premiumSupportCancelled,
            );
            return null;
          }
        }
      } catch (error) {
        await answerTelegramCallbackQuery(
          config.botToken,
          callbackQuery.id,
          (error as Error).message,
        );
        return null;
      }
    }

    const userOrderAction = parseTelegramOrderActionCallbackData(callbackQuery.data);
    if (userOrderAction) {
      const locale = await getTelegramConversationLocale({
        telegramUserId: callbackQuery.from.id,
        telegramChatId: chatId,
      });
      const ui = getTelegramUi(locale);

      try {
        switch (userOrderAction.action) {
          case 'ky': {
            const settings = await getTelegramSalesSettings();
            if (!settings.enabled || !settings.allowRenewals) {
              await answerTelegramCallbackQuery(config.botToken, callbackQuery.id, ui.renewDisabled);
              return null;
            }

            const existing = await getActiveTelegramOrder(chatId, callbackQuery.from.id);
            if (existing?.status === 'PENDING_REVIEW') {
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.activeOrderPendingReview(existing.orderCode),
              );
              return null;
            }

            const retentionSource = resolveTelegramRetentionSourceFromRenewAction(
              userOrderAction.secondary,
            );
            const coupon = await resolveTelegramCouponForOrderStart({
              chatId,
              telegramUserId: callbackQuery.from.id,
              source: retentionSource,
              accessKeyId: isDynamicRenewalActionSecondary(userOrderAction.secondary)
                ? null
                : userOrderAction.primary,
              dynamicAccessKeyId: isDynamicRenewalActionSecondary(userOrderAction.secondary)
                ? userOrderAction.primary
                : null,
            });
            const matchedKey =
              isDynamicRenewalActionSecondary(userOrderAction.secondary)
                ? (await findLinkedDynamicAccessKeys(chatId, callbackQuery.from.id, true)).find(
                    (key) => key.id === userOrderAction.primary,
                  )
                : (await findLinkedAccessKeys(chatId, callbackQuery.from.id, true)).find(
                    (key) => key.id === userOrderAction.primary,
                  );
            if (!matchedKey) {
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.invalidRenewChoice,
              );
              return null;
            }

            await cancelStaleTelegramConversationOrders(chatId, callbackQuery.from.id);
            const order = await createTelegramOrderRecord({
              kind: 'RENEW',
              chatId,
              telegramUserId: callbackQuery.from.id,
              telegramUsername: callbackQuery.from.username || callbackQuery.from.first_name,
              locale,
              initialStatus: 'AWAITING_KEY_SELECTION',
              retentionSource,
              couponCampaignType: coupon?.coupon?.campaignType || null,
              couponCode: coupon?.coupon?.couponCode || null,
              couponDiscountAmount: coupon?.coupon?.couponDiscountAmount ?? null,
              couponDiscountLabel: coupon?.coupon?.couponDiscountLabel || null,
            });
            await sendTelegramRenewalPlanSelection({
              orderId: order.id,
              orderCode: order.orderCode,
              chatId,
              telegramUserId: callbackQuery.from.id,
              locale,
              botToken: config.botToken,
              salesSettings: settings,
              targetKey: {
                id: matchedKey.id,
                name: matchedKey.name,
                kind: isDynamicRenewalActionSecondary(userOrderAction.secondary) ? 'dynamic' : 'access',
                status: matchedKey.status,
              },
            });

            await answerTelegramCallbackQuery(
              config.botToken,
              callbackQuery.id,
              ui.orderActionSelectedKey(matchedKey.name),
            );
            return null;
          }
          case 'pl': {
            const order = await findTelegramOrderByIdForUser({
              orderId: userOrderAction.primary,
              chatId,
              telegramUserId: callbackQuery.from.id,
            });
            if (!order) {
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.orderActionStatusMissing,
              );
              return null;
            }

            const settings = await getTelegramSalesSettings();
            const plan = userOrderAction.secondary
              ? resolveTelegramSalesPlan(settings, userOrderAction.secondary as TelegramSalesPlanCode)
              : null;
            if (!plan || !plan.enabled) {
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.invalidPlanChoice,
              );
              return null;
            }

            if (
              order.kind === 'NEW' &&
              plan.code === 'trial_1d_3gb' &&
              !(await isEligibleForTelegramFreeTrial(chatId, callbackQuery.from.id))
            ) {
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.freeTrialUnavailable,
              );
              return null;
            }

            const expectedDeliveryType =
              order.kind === 'RENEW'
                ? order.targetDynamicKeyId
                  ? 'DYNAMIC_KEY'
                  : 'ACCESS_KEY'
                : null;
            if (expectedDeliveryType && plan.deliveryType !== expectedDeliveryType) {
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.invalidPlanChoice,
              );
              return null;
            }

            const planLabel = resolveTelegramSalesPlanLabel(plan, locale);

            if (plan.unlimitedQuota && !plan.fixedDurationMonths) {
              const planSnapshot = buildTelegramOrderPlanSnapshot(plan, locale, {
                couponCampaignType: order.couponCampaignType,
                couponCode: order.couponCode,
                couponDiscountAmount: order.couponDiscountAmount,
                couponDiscountLabel: order.couponDiscountLabel,
              });
              await db.telegramOrder.update({
                where: { id: order.id },
                data: {
                  ...planSnapshot,
                  status: 'AWAITING_MONTHS',
                },
              });

              await sendTelegramMessage(config.botToken, chatId, ui.orderMonthsPrompt, {
                replyMarkup: buildTelegramOrderActionKeyboard({
                  order: {
                    id: order.id,
                    status: 'AWAITING_MONTHS',
                  },
                  locale,
                }),
              });
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.orderActionSelectedPlan(planLabel),
              );
              return null;
            }

            const planSnapshot = buildTelegramOrderPlanSnapshot(plan, locale, {
              couponCampaignType: order.couponCampaignType,
              couponCode: order.couponCode,
              couponDiscountAmount: order.couponDiscountAmount,
              couponDiscountLabel: order.couponDiscountLabel,
            });
            const enabledPaymentMethods = listEnabledTelegramSalesPaymentMethods(settings);
            const nextStatus =
              order.kind === 'NEW'
                ? 'AWAITING_SERVER_SELECTION'
                : enabledPaymentMethods.length > 0
                  ? 'AWAITING_PAYMENT_METHOD'
                  : 'AWAITING_PAYMENT_PROOF';
            const nextOrder = await db.telegramOrder.update({
              where: { id: order.id },
              data: {
                ...planSnapshot,
                status: nextStatus,
                ...buildTelegramOrderPaymentStageFields({
                  nextStatus,
                  currentStatus: order.status,
                  paymentStageEnteredAt: order.paymentStageEnteredAt,
                  paymentReminderSentAt: order.paymentReminderSentAt,
                  retryReminderSentAt: order.retryReminderSentAt,
                }),
              },
            });

            if (nextStatus === 'AWAITING_SERVER_SELECTION') {
              const servers = await listAssignableTelegramOrderServers();
              await sendTelegramMessage(
                config.botToken,
                chatId,
                buildTelegramServerSelectionPromptText({
                  orderCode: nextOrder.orderCode,
                  locale,
                  servers,
                }),
                {
                  replyMarkup: buildTelegramServerSelectionKeyboard({
                    orderId: nextOrder.id,
                    locale,
                    servers,
                  }),
                },
              );
            } else if (nextStatus === 'AWAITING_PAYMENT_METHOD') {
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
                config.botToken,
                chatId,
                buildTelegramPaymentMethodSelectionPromptText({
                  orderCode: nextOrder.orderCode,
                  locale,
                  methods: enabledPaymentMethods,
                  planSummary: formatTelegramSalesPlanSummary(plan, planSnapshot.durationMonths, locale),
                  renewalTargetName: renewalTarget?.name || null,
                }),
                {
                  replyMarkup: buildTelegramPaymentMethodSelectionKeyboard({
                    orderId: nextOrder.id,
                    locale,
                    methods: enabledPaymentMethods,
                  }),
                },
              );
            } else {
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
              const planSummary = formatTelegramSalesPlanSummary(plan, planSnapshot.durationMonths, locale);
              await sendTelegramOrderPaymentPromptCard({
                botToken: config.botToken,
                chatId,
                locale,
                order: nextOrder,
                orderCode: nextOrder.orderCode,
                planSummary,
                paymentInstructions: resolveTelegramSalesPaymentInstructions(settings, locale),
                paymentMethods: listEnabledTelegramSalesPaymentMethods(settings),
                renewalTargetName: renewalTarget?.name || null,
                supportLink: await getTelegramSupportLink(),
              });
            }

            await answerTelegramCallbackQuery(
              config.botToken,
              callbackQuery.id,
              ui.orderActionSelectedPlan(planLabel),
            );
            return null;
          }
          case 'sv': {
            const order = await findTelegramOrderByIdForUser({
              orderId: userOrderAction.primary,
              chatId,
              telegramUserId: callbackQuery.from.id,
            });
            if (!order) {
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.orderActionStatusMissing,
              );
              return null;
            }
            if (order.status !== 'AWAITING_SERVER_SELECTION') {
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.invalidServerChoice,
              );
              return null;
            }

            const servers = await listAssignableTelegramOrderServers();
            const selectedServer =
              userOrderAction.secondary === 'auto'
                ? null
                : servers.find((server) => server.id === userOrderAction.secondary);

            if (userOrderAction.secondary !== 'auto' && !selectedServer) {
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.invalidServerChoice,
              );
              return null;
            }

            const nextOrder = await db.telegramOrder.update({
              where: { id: order.id },
              data: {
                selectedServerId: selectedServer?.id ?? null,
                selectedServerName: selectedServer?.name ?? null,
                selectedServerCountryCode: selectedServer?.countryCode ?? null,
                status: 'AWAITING_KEY_NAME',
              },
            });

            await sendTelegramMessage(config.botToken, chatId, ui.orderNamePrompt, {
              replyMarkup: buildTelegramOrderActionKeyboard({
                order: nextOrder,
                locale,
              }),
            });

            await answerTelegramCallbackQuery(
              config.botToken,
              callbackQuery.id,
              ui.orderActionSelectedServer(
                selectedServer ? formatTelegramServerChoiceLabel(selectedServer, ui) : ui.serverAutoSelect,
              ),
            );
            return null;
          }
          case 'pm': {
            const order = await findTelegramOrderByIdForUser({
              orderId: userOrderAction.primary,
              chatId,
              telegramUserId: callbackQuery.from.id,
            });
            if (!order) {
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.orderActionStatusMissing,
              );
              return null;
            }

            const salesSettings = await getTelegramSalesSettings();
            const paymentMethods = listEnabledTelegramSalesPaymentMethods(salesSettings);
            if (paymentMethods.length === 0) {
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.orderActionNotReadyForPayment,
              );
              return null;
            }

            if (!userOrderAction.secondary) {
              const plan = order.planCode
                ? resolveTelegramSalesPlan(salesSettings, order.planCode as TelegramSalesPlanCode)
                : null;
              const renewalTarget = order.targetAccessKeyId
                ? await db.accessKey.findUnique({
                    where: { id: order.targetAccessKeyId },
                    select: { name: true },
                  })
                : null;
              const planSummary = plan
                ? formatTelegramSalesPlanSummary(plan, order.durationMonths, locale)
                : order.planName || '';

              await sendTelegramMessage(
                config.botToken,
                chatId,
                buildTelegramPaymentMethodSelectionPromptText({
                  orderCode: order.orderCode,
                  locale,
                  methods: paymentMethods,
                  planSummary,
                  requestedName: order.requestedName,
                  renewalTargetName: renewalTarget?.name || null,
                  selectedServerName: order.selectedServerName,
                }),
                {
                  replyMarkup: buildTelegramPaymentMethodSelectionKeyboard({
                    orderId: order.id,
                    locale,
                    methods: paymentMethods,
                  }),
                },
              );
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.orderActionSent,
              );
              return null;
            }

            if (
              order.status !== 'AWAITING_PAYMENT_METHOD' &&
              order.status !== 'AWAITING_PAYMENT_PROOF' &&
              order.status !== 'PENDING_REVIEW'
            ) {
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.invalidPaymentMethodChoice,
              );
              return null;
            }

            const selectedMethod = paymentMethods.find(
              (method) => method.code === userOrderAction.secondary,
            );
            if (!selectedMethod) {
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.invalidPaymentMethodChoice,
              );
              return null;
            }

            const nextOrder = await db.telegramOrder.update({
              where: { id: order.id },
              data: {
                paymentMethodCode: selectedMethod.code,
                paymentMethodLabel: resolveTelegramSalesPaymentMethodLabel(selectedMethod, locale),
                paymentMethodAccountName: selectedMethod.accountName?.trim() || null,
                paymentMethodAccountNumber: selectedMethod.accountNumber?.trim() || null,
                status: 'AWAITING_PAYMENT_PROOF',
                ...buildTelegramOrderPaymentStageFields({
                  nextStatus: 'AWAITING_PAYMENT_PROOF',
                  currentStatus: order.status,
                  paymentStageEnteredAt: order.paymentStageEnteredAt,
                  paymentReminderSentAt: order.paymentReminderSentAt,
                  retryReminderSentAt: order.retryReminderSentAt,
                }),
                reviewReminderSentAt: null,
                reviewedAt: null,
                rejectedAt: null,
              },
            });

            const plan = nextOrder.planCode
              ? resolveTelegramSalesPlan(salesSettings, nextOrder.planCode as TelegramSalesPlanCode)
              : null;
            const renewalTarget = nextOrder.targetAccessKeyId
              ? await db.accessKey.findUnique({
                  where: { id: nextOrder.targetAccessKeyId },
                  select: { name: true },
                })
              : null;
            const planSummary = plan
              ? formatTelegramSalesPlanSummary(plan, nextOrder.durationMonths, locale)
              : nextOrder.planName || '';

            await sendTelegramOrderPaymentPromptCard({
              botToken: config.botToken,
              chatId,
              locale,
              order: nextOrder,
              orderCode: nextOrder.orderCode,
              planSummary,
              paymentInstructions: resolveTelegramSalesPaymentInstructions(salesSettings, locale),
              paymentMethod: selectedMethod,
              selectedServerName: nextOrder.selectedServerName,
              requestedName: nextOrder.requestedName,
              renewalTargetName: renewalTarget?.name || null,
              supportLink: await getTelegramSupportLink(),
            });

            await answerTelegramCallbackQuery(
              config.botToken,
              callbackQuery.id,
              ui.orderActionSelectedPaymentMethod(
                resolveTelegramSalesPaymentMethodLabel(selectedMethod, locale),
              ),
            );
            return null;
          }
          case 'pay':
          case 'up': {
            const order = await findTelegramOrderByIdForUser({
              orderId: userOrderAction.primary,
              chatId,
              telegramUserId: callbackQuery.from.id,
            });
            if (!order) {
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.orderActionStatusMissing,
              );
              return null;
            }
            if (
              order.status !== 'AWAITING_PAYMENT_METHOD' &&
              order.status !== 'AWAITING_PAYMENT_PROOF' &&
              order.status !== 'PENDING_REVIEW'
            ) {
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.orderActionNotReadyForPayment,
              );
              return null;
            }

            const salesSettings = await getTelegramSalesSettings();
            const plan = order.planCode
              ? resolveTelegramSalesPlan(salesSettings, order.planCode as TelegramSalesPlanCode)
              : null;
            const renewalTarget = order.targetAccessKeyId
              ? await db.accessKey.findUnique({
                  where: { id: order.targetAccessKeyId },
                  select: { name: true },
                })
              : null;
            const planSummary = plan
              ? formatTelegramSalesPlanSummary(plan, order.durationMonths, locale)
              : order.planName || '';
            const selectedPaymentMethod = resolveTelegramSalesPaymentMethod(
              salesSettings,
              order.paymentMethodCode,
            );

            if (order.status === 'AWAITING_PAYMENT_METHOD' || !selectedPaymentMethod) {
              const paymentMethods = listEnabledTelegramSalesPaymentMethods(salesSettings);
              await sendTelegramMessage(
                config.botToken,
                chatId,
                buildTelegramPaymentMethodSelectionPromptText({
                  orderCode: order.orderCode,
                  locale,
                  methods: paymentMethods,
                  planSummary,
                  selectedServerName: order.selectedServerName,
                  requestedName: order.requestedName,
                  renewalTargetName: renewalTarget?.name || null,
                }),
                {
                  replyMarkup: buildTelegramPaymentMethodSelectionKeyboard({
                    orderId: order.id,
                    locale,
                    methods: paymentMethods,
                  }),
                },
              );
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.orderActionSent,
              );
              return null;
            }

            await sendTelegramOrderPaymentPromptCard({
              botToken: config.botToken,
              chatId,
              locale,
              order,
              orderCode: order.orderCode,
              planSummary,
              paymentInstructions: resolveTelegramSalesPaymentInstructions(salesSettings, locale),
              paymentMethod: selectedPaymentMethod,
              paymentMethodLabel: order.paymentMethodLabel,
              selectedServerName: order.selectedServerName,
              requestedName: order.requestedName,
              renewalTargetName: renewalTarget?.name || null,
              supportLink: await getTelegramSupportLink(),
            });
            await answerTelegramCallbackQuery(
              config.botToken,
              callbackQuery.id,
              ui.orderActionSent,
            );
            return null;
          }
          case 'by': {
            await answerTelegramCallbackQuery(
              config.botToken,
              callbackQuery.id,
              ui.orderActionSent,
            );
            return handleBuyCommand(
              chatId,
              callbackQuery.from.id,
              callbackQuery.from.username || callbackQuery.from.first_name,
              locale,
              config.botToken,
              resolveTelegramRetentionSourceFromBuyAction(userOrderAction.secondary),
              '',
            );
          }
          case 'rt': {
            const order = await findTelegramOrderByIdForUser({
              orderId: userOrderAction.primary,
              chatId,
              telegramUserId: callbackQuery.from.id,
            });
            if (!order) {
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.orderActionStatusMissing,
              );
              return null;
            }

            if (!(order.status === 'REJECTED' || order.status === 'CANCELLED')) {
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.orderActionAlreadyClosed,
              );
              return null;
            }

            const retriedOrder = await retryTelegramOrderForUser({
              sourceOrder: order,
              chatId,
              telegramUserId: callbackQuery.from.id,
              telegramUsername: callbackQuery.from.username || callbackQuery.from.first_name,
              locale,
              botToken: config.botToken,
            });

            await answerTelegramCallbackQuery(
              config.botToken,
              callbackQuery.id,
              !retriedOrder || typeof retriedOrder === 'string'
                ? ui.orderActionSent
                : ui.orderActionRetryStarted(retriedOrder.orderCode),
            );
            return null;
          }
          case 'st': {
            const order = await findTelegramOrderByIdForUser({
              orderId: userOrderAction.primary,
              chatId,
              telegramUserId: callbackQuery.from.id,
            });
            if (!order) {
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.orderActionStatusMissing,
              );
              return null;
            }

            await sendTelegramOrderStatusCard({
              botToken: config.botToken,
              chatId,
              order,
              locale,
            });
            await answerTelegramCallbackQuery(
              config.botToken,
              callbackQuery.id,
              ui.orderActionSent,
            );
            return null;
          }
          case 'rf': {
            const order = await findTelegramOrderByIdForUser({
              orderId: userOrderAction.primary,
              chatId,
              telegramUserId: callbackQuery.from.id,
            });
            if (!order) {
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.orderActionStatusMissing,
              );
              return null;
            }

            if (order.refundRequestStatus === 'PENDING') {
              await sendTelegramOrderStatusCard({
                botToken: config.botToken,
                chatId,
                order,
                locale,
              });
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.orderActionSent,
              );
              return null;
            }

            if (order.refundRequestStatus === 'APPROVED') {
              await sendTelegramOrderStatusCard({
                botToken: config.botToken,
                chatId,
                order,
                locale,
              });
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.orderActionSent,
              );
              return null;
            }

            if (order.refundRequestStatus === 'REJECTED') {
              await sendTelegramOrderStatusCard({
                botToken: config.botToken,
                chatId,
                order,
                locale,
              });
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.orderActionSent,
              );
              return null;
            }

            const refundEligibility = await evaluateTelegramOrderRefundEligibility(order);
            if (!refundEligibility.eligible) {
              await sendTelegramMessage(
                config.botToken,
                chatId,
                [
                  ui.refundNoEligibleOrders,
                  '',
                  refundEligibility.reason ? escapeHtml(refundEligibility.reason) : ui.refundPolicySummary,
                ].join('\n'),
                {
                  replyMarkup: getCommandKeyboard(isAdmin, locale),
                },
              );
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.orderActionSent,
              );
              return null;
            }

            const updatedOrder = await db.telegramOrder.update({
              where: { id: order.id },
              data: {
                refundRequestedAt: new Date(),
                refundRequestStatus: 'PENDING',
                refundRequestMessage: null,
                refundRequestCustomerMessage: null,
                refundReviewReasonCode: null,
                refundRequestReviewedAt: null,
                refundRequestReviewedByUserId: null,
                refundRequestReviewerEmail: null,
              },
            });

            await writeAuditLog({
              action: 'TELEGRAM_ORDER_REFUND_REQUEST_CREATE',
              entity: 'TELEGRAM_ORDER',
              entityId: order.id,
              details: {
                orderCode: order.orderCode,
                telegramUserId: String(callbackQuery.from.id),
                telegramChatId: String(chatId),
              },
            });

            await sendTelegramRefundRequestAlert({
              orderId: order.id,
              orderCode: order.orderCode,
              telegramUsername: callbackQuery.from.username || callbackQuery.from.first_name,
              telegramUserId: String(callbackQuery.from.id),
            });

            await sendTelegramMessage(
              config.botToken,
              chatId,
              ui.refundRequested(order.orderCode),
              {
                replyMarkup: await buildTelegramOrderStatusReplyMarkup({
                  order: updatedOrder,
                  locale,
                }),
              },
            );

            await answerTelegramCallbackQuery(
              config.botToken,
              callbackQuery.id,
              ui.orderActionSent,
            );
            return null;
          }
          case 'ca': {
            const order = await findTelegramOrderByIdForUser({
              orderId: userOrderAction.primary,
              chatId,
              telegramUserId: callbackQuery.from.id,
            });
            if (!order) {
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.orderActionStatusMissing,
              );
              return null;
            }
            if (isTelegramOrderTerminal(order.status)) {
              await answerTelegramCallbackQuery(
                config.botToken,
                callbackQuery.id,
                ui.orderActionAlreadyClosed,
              );
              return null;
            }
            await db.telegramOrder.update({
              where: { id: order.id },
              data: {
                status: 'CANCELLED',
                paymentStageEnteredAt: null,
                paymentReminderSentAt: null,
                reviewReminderSentAt: null,
                expiredAt: null,
              },
            });
            await sendTelegramMessage(config.botToken, chatId, ui.orderCancelled(order.orderCode), {
              replyMarkup: getCommandKeyboard(isAdmin, locale),
            });
            await answerTelegramCallbackQuery(
              config.botToken,
              callbackQuery.id,
              ui.orderActionCancelledInline(order.orderCode),
            );
            return null;
          }
        }
      } catch (error) {
        await answerTelegramCallbackQuery(
          config.botToken,
          callbackQuery.id,
          (error as Error).message,
        );
        return null;
      }
    }

    const serverChangeReviewAction = parseTelegramServerChangeReviewCallbackData(callbackQuery.data);
    if (serverChangeReviewAction) {
      const adminLocale = await getTelegramConversationLocale({
        telegramUserId: callbackQuery.from.id,
        telegramChatId: chatId,
      });
      const adminUi = getTelegramUi(adminLocale);

      if (!isAdmin) {
        await answerTelegramCallbackQuery(
          config.botToken,
          callbackQuery.id,
          adminUi.serverChangeReviewActionUnauthorized,
        );
        return null;
      }
      if (!hasTelegramReviewManageScope(adminActor.scope)) {
        await answerTelegramCallbackQuery(
          config.botToken,
          callbackQuery.id,
          telegramAdminScopeDeniedMessage({ locale: adminLocale, area: 'review' }),
        );
        return null;
      }

      try {
        if (serverChangeReviewAction.action === 'approve') {
          const result = await approveTelegramServerChangeRequest({
            requestId: serverChangeReviewAction.requestId,
            reviewedByUserId: adminActor.userId,
            reviewerName:
              adminActor.email ||
              callbackQuery.from.username ||
              callbackQuery.from.first_name ||
              null,
            adminNote: callbackQuery.from.username
              ? `Approved from Telegram by @${callbackQuery.from.username}`
              : `Approved from Telegram by ${callbackQuery.from.first_name}`,
          });

          await answerTelegramCallbackQuery(
            config.botToken,
            callbackQuery.id,
            adminUi.serverChangeReviewActionApproved(result.requestCode),
          );
        } else {
          const result = await rejectTelegramServerChangeRequest({
            requestId: serverChangeReviewAction.requestId,
            reviewedByUserId: adminActor.userId,
            reviewerName:
              adminActor.email ||
              callbackQuery.from.username ||
              callbackQuery.from.first_name ||
              null,
            adminNote: null,
          });

          await answerTelegramCallbackQuery(
            config.botToken,
            callbackQuery.id,
            adminUi.serverChangeReviewActionRejected(result.requestCode),
          );
        }
      } catch (error) {
        await answerTelegramCallbackQuery(
          config.botToken,
          callbackQuery.id,
          adminUi.serverChangeReviewActionFailed((error as Error).message),
        );
      }

      return null;
    }

    const orderAction = parseTelegramOrderReviewCallbackData(callbackQuery.data);
    if (!orderAction) {
      return null;
    }

    const adminLocale = await getTelegramConversationLocale({
      telegramUserId: callbackQuery.from.id,
      telegramChatId: chatId,
    });
    const adminUi = getTelegramUi(adminLocale);

    if (!isAdmin) {
      await answerTelegramCallbackQuery(
        config.botToken,
        callbackQuery.id,
        adminUi.orderReviewActionUnauthorized,
      );
      return null;
    }
    if (!hasTelegramReviewManageScope(adminActor.scope)) {
      await answerTelegramCallbackQuery(
        config.botToken,
        callbackQuery.id,
        telegramAdminScopeDeniedMessage({ locale: adminLocale, area: 'review' }),
      );
      return null;
    }

    try {
      if (orderAction.action === 'approve') {
        const result = await approveTelegramOrder({
          orderId: orderAction.orderId,
          reviewedByUserId: adminActor.userId,
          reviewerName:
            adminActor.email ||
            callbackQuery.from.username ||
            callbackQuery.from.first_name ||
            null,
          adminNote: callbackQuery.from.username
            ? `Approved from Telegram by @${callbackQuery.from.username}`
            : `Approved from Telegram by ${callbackQuery.from.first_name}`,
        });

        await answerTelegramCallbackQuery(
          config.botToken,
          callbackQuery.id,
          adminUi.orderReviewActionApproved(result.orderCode),
        );
      } else {
        const result = await rejectTelegramOrder({
          orderId: orderAction.orderId,
          reviewedByUserId: adminActor.userId,
          reviewerName:
            adminActor.email ||
            callbackQuery.from.username ||
            callbackQuery.from.first_name ||
            null,
          adminNote: null,
        });

        await answerTelegramCallbackQuery(
          config.botToken,
          callbackQuery.id,
          adminUi.orderReviewActionRejected(result.orderCode),
        );
      }
    } catch (error) {
      await answerTelegramCallbackQuery(
        config.botToken,
        callbackQuery.id,
        adminUi.orderReviewActionFailed((error as Error).message),
      );
    }

    return null;
  }

  return null;
}

/**
 * Handle incoming Telegram message.
 */
export async function handleTelegramUpdate(update: TelegramUpdate): Promise<string | null> {
  const callbackQuery = update.callback_query;
  if (callbackQuery) {
    const config = await getTelegramConfig();
    if (!config) {
      return null;
    }

    return handleTelegramCallbackQuery(callbackQuery, config);
  }

  const message = update.message;
  if (!message) return null;

  const chatId = message.chat.id;
  const telegramUserId = message.from.id;
  const username = message.from.username || message.from.first_name;
  const text = message.text?.trim() || '';

  const config = await getTelegramConfig();
  if (!config) return null;
  await upsertTelegramUserProfile({
    telegramUserId: String(telegramUserId),
    telegramChatId: String(chatId),
    username: message.from.username || null,
    displayName: message.from.first_name || null,
  });
  const locale = await getTelegramConversationLocale({
    telegramUserId,
    telegramChatId: chatId,
  });
  const ui = getTelegramUi(locale);

  if (message.photo?.length || message.document) {
    return handleTelegramOrderProofMessage({
      botToken: config.botToken,
      chatId,
      telegramUserId,
      caption: message.caption,
      photo: message.photo,
      document: message.document,
      messageId: message.message_id,
    });
  }

  if (!text) {
    return null;
  }

  const activeOrder = await getActiveTelegramOrder(chatId, telegramUserId);
  const pendingPremiumReply = activeOrder
    ? null
    : await getTelegramPendingPremiumReply({
        telegramUserId: String(telegramUserId),
        telegramChatId: String(chatId),
      });
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!activeOrder && !pendingPremiumReply && emailRegex.test(text)) {
    return handleEmailLink(chatId, telegramUserId, text, locale);
  }

  const adminActor = await resolveTelegramAdminActor({
    telegramUserId,
    chatId,
    config,
  });
  const isAdmin = adminActor.isAdmin;
  const normalizedShortcutCommand = normalizeTelegramReplyKeyboardCommand(text, isAdmin);
  const commandText = normalizedShortcutCommand || text;
  const commandMatch = commandText.match(/^\/(\w+)(?:@\w+)?(?:\s+(.*))?$/);
  if (!commandMatch) {
    if (activeOrder) {
      return handleTelegramOrderTextMessage({
        chatId,
        telegramUserId,
        text,
        botToken: config.botToken,
      });
    }

    if (pendingPremiumReply) {
      return handlePremiumSupportFollowUpText({
        chatId,
        telegramUserId,
        username,
        locale,
        botToken: config.botToken,
        text,
        getTelegramPendingPremiumReply,
        setTelegramPendingPremiumReply,
        getTelegramSupportLink,
        sendTelegramPremiumSupportFollowUpAlert,
        sendTelegramMessage,
      });
    }

    return null;
  }

  const command = commandMatch[1].toLowerCase();
  const argsText = commandMatch[2] || '';

  switch (command) {
    case 'start':
      return handleStartCommand(
        chatId,
        telegramUserId,
        username,
        isAdmin,
        config.botToken,
        argsText,
      );
    case 'language':
      return handleLanguageCommand(chatId, config.botToken);
    case 'buy':
      return handleBuyCommand(chatId, telegramUserId, username, locale, config.botToken, null, argsText);
    case 'trial':
      return handleTrialCommand(chatId, telegramUserId, username, locale, config.botToken);
    case 'orders':
      return handleOrdersCommand({
        chatId,
        telegramUserId,
        locale,
        botToken: config.botToken,
        sendTelegramMessage,
        sendTelegramOrderStatusCard,
      });
    case 'order':
      return handleOrderStatusCommand({
        chatId,
        telegramUserId,
        argsText,
        locale,
        botToken: config.botToken,
        sendTelegramMessage,
        buildTelegramOrderStatusReplyMarkup,
        buildTelegramOrderStatusMessage: ({ order, locale: orderLocale }) =>
          buildTelegramOrderStatusMessage({
            order,
            locale: orderLocale,
            ensureAccessKeySubscriptionToken,
            getDynamicKeyMessagingUrls: getTelegramOrderDynamicKeyMessagingUrls,
          }),
      });
    case 'refund':
      return handleRefundCommand({
        chatId,
        telegramUserId,
        locale,
        botToken: config.botToken,
        sendTelegramMessage,
        sendTelegramOrderStatusCard,
      });
    case 'inbox':
      return handleInboxCommand({
        chatId,
        telegramUserId,
        argsText,
        locale,
      });
    case 'notifications':
    case 'prefs':
      return handleTelegramNotificationPreferencesCommand({
        chatId,
        telegramUserId,
        locale,
        botToken: config.botToken,
      });
    case 'usage':
    case 'mykey':
    case 'key':
      return handleUsageCommand({
        chatId,
        telegramUserId,
        botToken: config.botToken,
        locale,
        sendAccessKeySharePageToTelegram,
        sendDynamicKeySharePageToTelegram,
      });
    case 'mykeys':
      return handleMyKeysCommand({
        chatId,
        telegramUserId,
        locale,
        botToken: config.botToken,
      });
    case 'premium':
      return handlePremiumCommand({
        chatId,
        telegramUserId,
        locale,
        botToken: config.botToken,
        getTelegramSupportLink,
        findLinkedDynamicAccessKeys,
        getDynamicKeyMessagingUrls,
        sendTelegramMessage,
      });
    case 'premiumregion':
      return handlePremiumRegionStatusCommand({
        chatId,
        telegramUserId,
        locale,
        botToken: config.botToken,
        argsText,
        getTelegramSupportLink,
        findLinkedDynamicAccessKeys,
        sendTelegramMessage,
      });
    case 'supportstatus':
      return handlePremiumSupportStatusCommand({
        chatId,
        telegramUserId,
        locale,
        botToken: config.botToken,
        argsText,
        getTelegramSupportLink,
        sendTelegramMessage,
      });
    case 'sub':
      return handleSubscriptionLinksCommand({
        chatId,
        telegramUserId,
        locale,
        sendAccessKeySharePageToTelegram,
        sendDynamicKeySharePageToTelegram,
      });
    case 'support':
      return handleSupportCommand(locale);
    case 'server':
      return isAdmin && !argsText.trim()
        ? handleStatusCommand(locale)
        : handleUserServerCommand({
            chatId,
            telegramUserId,
            locale,
            botToken: config.botToken,
          });
    case 'renew':
      return handleRenewOrderCommand(chatId, telegramUserId, username, locale, config.botToken, argsText);
    case 'cancel': {
      const currentOrder = activeOrder ?? (await getActiveTelegramOrder(chatId, telegramUserId));
      if (!currentOrder && pendingPremiumReply) {
        await setTelegramPendingPremiumReply({
          telegramUserId: String(telegramUserId),
          telegramChatId: String(chatId),
          requestId: null,
        });
        return ui.premiumFollowUpCancelled;
      }

      if (!currentOrder) {
        return ui.noOrderToCancel;
      }

      await db.telegramOrder.update({
        where: { id: currentOrder.id },
        data: {
          status: 'CANCELLED',
          paymentStageEnteredAt: null,
          paymentReminderSentAt: null,
          reviewReminderSentAt: null,
          expiredAt: null,
        },
      });

      return ui.orderCancelled(currentOrder.orderCode);
    }
    case 'status':
      return isAdmin ? handleStatusCommand(locale) : ui.adminOnly;
    case 'expiring':
      return isAdmin ? handleExpiringCommand(argsText, locale) : ui.adminOnly;
    case 'find':
      return isAdmin ? handleFindCommand(argsText, locale) : ui.adminOnly;
    case 'disable':
      return isAdmin
        ? handleAdminToggleCommand({
            argsText,
            enable: false,
            locale,
            sendAccessKeyLifecycleTelegramNotification,
          })
        : ui.adminOnly;
    case 'enable':
      return isAdmin
        ? handleAdminToggleCommand({
            argsText,
            enable: true,
            locale,
            sendAccessKeyLifecycleTelegramNotification,
          })
        : ui.adminOnly;
    case 'resend':
      return isAdmin
        ? handleResendCommand({
            argsText,
            locale,
            sendAccessKeySharePageToTelegram,
          })
        : ui.adminOnly;
    case 'announce':
      if (!isAdmin) return ui.adminOnly;
      if (!hasTelegramAnnouncementManageScope(adminActor.scope)) {
        return telegramAdminScopeDeniedMessage({ locale, area: 'announcement' });
      }
      return handleAnnounceCommand(argsText, locale);
    case 'announcements':
    case 'announcehistory':
      if (!isAdmin) return ui.adminOnly;
      if (!hasTelegramAnnouncementManageScope(adminActor.scope)) {
        return telegramAdminScopeDeniedMessage({ locale, area: 'announcement' });
      }
      return handleAnnouncementsCommand(locale);
    case 'announceuser':
      if (!isAdmin) return ui.adminOnly;
      if (!hasTelegramAnnouncementManageScope(adminActor.scope)) {
        return telegramAdminScopeDeniedMessage({ locale, area: 'announcement' });
      }
      return handleAnnounceUserCommand(argsText, locale);
    case 'scheduleannouncement':
      if (!isAdmin) return ui.adminOnly;
      if (!hasTelegramAnnouncementManageScope(adminActor.scope)) {
        return telegramAdminScopeDeniedMessage({ locale, area: 'announcement' });
      }
      return handleScheduleAnnouncementCommand(argsText, locale);
    case 'finance':
      if (!isAdmin) return ui.adminOnly;
      if (!hasFinanceManageScope(adminActor.scope)) {
        return telegramAdminScopeDeniedMessage({ locale, area: 'finance' });
      }
      return handleFinanceCommand(locale);
    case 'sendfinance':
      if (!isAdmin) return ui.adminOnly;
      if (!hasFinanceManageScope(adminActor.scope)) {
        return telegramAdminScopeDeniedMessage({ locale, area: 'finance' });
      }
      return handleSendFinanceCommand(locale);
    case 'refunds':
      if (!isAdmin) return ui.adminOnly;
      if (!hasFinanceManageScope(adminActor.scope)) {
        return telegramAdminScopeDeniedMessage({ locale, area: 'finance' });
      }
      return handleRefundsCommand(locale);
    case 'claimrefund':
      if (!isAdmin) return ui.adminOnly;
      if (!hasFinanceManageScope(adminActor.scope)) {
        return telegramAdminScopeDeniedMessage({ locale, area: 'finance' });
      }
      return handleClaimRefundCommand(argsText, locale, adminActor);
    case 'reassignrefund':
      if (!isAdmin) return ui.adminOnly;
      if (!hasFinanceManageScope(adminActor.scope)) {
        return telegramAdminScopeDeniedMessage({ locale, area: 'finance' });
      }
      return handleReassignRefundCommand(argsText, locale, adminActor);
    case 'serverdown':
      if (!isAdmin) return ui.adminOnly;
      if (!hasOutageManageScope(adminActor.scope)) {
        return telegramAdminScopeDeniedMessage({ locale, area: 'outage' });
      }
      return handleServerDownCommand(argsText, locale);
    case 'maintenance':
      if (!isAdmin) return ui.adminOnly;
      if (!hasOutageManageScope(adminActor.scope)) {
        return telegramAdminScopeDeniedMessage({ locale, area: 'outage' });
      }
      return handleMaintenanceCommand(argsText, locale);
    case 'serverupdate':
      if (!isAdmin) return ui.adminOnly;
      if (!hasOutageManageScope(adminActor.scope)) {
        return telegramAdminScopeDeniedMessage({ locale, area: 'outage' });
      }
      return handleServerUpdateCommand(argsText, locale);
    case 'serverrecovered':
      if (!isAdmin) return ui.adminOnly;
      if (!hasOutageManageScope(adminActor.scope)) {
        return telegramAdminScopeDeniedMessage({ locale, area: 'outage' });
      }
      return handleServerRecoveredCommand(argsText, locale);
    case 'sysinfo':
      return isAdmin ? handleSysInfoCommand(chatId, config.botToken, locale) : ui.adminOnly;
    case 'backup':
      return isAdmin ? handleBackupCommand(chatId, config.botToken, locale) : ui.adminOnly;
    case 'help':
      return handleHelpCommand(chatId, config.botToken, isAdmin, locale);
    default:
      return ui.unknownCommand;
  }
}
