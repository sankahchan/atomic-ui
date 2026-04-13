import { db } from '@/lib/db';
import { type SupportedLocale } from '@/lib/i18n/config';
import { type TelegramRetentionSource } from '@/lib/services/telegram-callbacks';
import {
  appendTelegramOrderAdminNote,
  buildTelegramCouponReadyLines,
  buildTelegramOrderPlanSnapshot,
  buildTelegramOrderPaymentStageFields,
  buildTelegramPaymentMethodSelectionKeyboard,
  buildTelegramPaymentMethodSelectionPromptText,
  buildTelegramPlanSelectionKeyboard,
  buildTelegramRenewKeySelectionKeyboard,
  buildTelegramSalesPlanPromptText,
  buildTelegramServerSelectionKeyboard,
  buildTelegramServerSelectionPromptText,
  cancelStaleTelegramConversationOrders,
  createTelegramOrderRecord,
  fulfillTelegramNewAccessOrder,
  handleStartCommand as handleTelegramStartCommand,
  isEligibleForTelegramFreeTrial,
  listAssignableTelegramOrderServers,
  listAvailableTelegramPlansForOrder,
  matchTelegramRenewableKeyOption,
  resolveTelegramCouponForOrderStart,
  resolveTelegramOrderPlanContext,
  sendAccessKeySharePageToTelegram,
  sendTelegramOrderPaymentPromptCard,
  sendTelegramOrderReviewAlert,
  sendTelegramRenewalPlanSelection,
} from '@/lib/services/telegram-bot-core';
import {
  getActiveTelegramOrder,
  handleBuyCommand as handleTelegramBuyCommand,
  handleRenewOrderCommand as handleTelegramRenewOrderCommand,
  handleTelegramOrderProofMessage as handleTelegramOrderProofMessageModule,
  handleTelegramOrderTextMessage as handleTelegramOrderTextMessageModule,
} from '@/lib/services/telegram-order-state';
import { getTelegramConfig, sendTelegramMessage } from '@/lib/services/telegram-runtime';
import { getTelegramReferralSummary } from '@/lib/services/telegram-referrals';
import {
  generateTelegramOrderCode,
  getTelegramSalesSettings,
  resolveTelegramSalesPlan,
  resolveTelegramSalesPlanLabel,
  resolveTelegramSalesPriceLabel,
} from '@/lib/services/telegram-sales';
import { escapeHtml, getTelegramUi } from '@/lib/services/telegram-ui';
import { buildTelegramLocaleSelectorKeyboard, buildTelegramLocaleSelectorMessage } from '@/lib/services/telegram-callbacks';

export { handleTelegramStartCommand as handleStartCommand };

export async function handleEmailLink(
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

export async function handleLanguageCommand(
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

export async function handleTelegramOrderProofMessage(input: {
  botToken: string;
  chatId: number;
  telegramUserId: number;
  messageId: number;
  photo?: {
    file_id: string;
    width: number;
    height: number;
    file_size?: number;
  }[];
  document?: {
    file_id: string;
    file_name?: string;
    mime_type?: string;
    file_size?: number;
  };
  caption?: string;
}) {
  return handleTelegramOrderProofMessageModule({
    ...input,
    deps: {
      sendTelegramOrderReviewAlert,
    },
  });
}

export async function handleBuyCommand(
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

export async function handleGiftCommand(
  chatId: number,
  telegramUserId: number,
  username: string,
  locale: SupportedLocale,
  botToken: string,
  argsText?: string,
) {
  const trimmed = argsText?.trim() || '';
  const ui = getTelegramUi(locale);
  if (!trimmed) {
    return locale === 'my'
      ? '🎁 အသုံးပြုပုံ: /gift @recipient_username [COUPON]\n\nဥပမာ: /gift @friend TRIAL500\nRecipient က bot ကို အနည်းဆုံး တစ်ကြိမ် start လုပ်ထားပါက delivery ကို recipient chat ထဲသို့လည်း ပို့ရန် ကြိုးစားပါမည်။'
      : '🎁 Usage: /gift @recipient_username [COUPON]\n\nExample: /gift @friend TRIAL500\nIf the recipient has already started the bot, we will also try to deliver the access details into the recipient chat.';
  }

  if (!trimmed.split(/\s+/)[0]?.startsWith('@')) {
    return locale === 'my'
      ? '❌ Gift flow အတွက် recipient Telegram username ကို @username ပုံစံဖြင့် အရင်ရေးပါ။'
      : '❌ Start the gift flow with the recipient Telegram username in the @username format.';
  }

  return handleTelegramBuyCommand({
    chatId,
    telegramUserId,
    username,
    locale,
    botToken,
    argsText: trimmed,
    retentionSource: null,
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

export async function handleReferralCommand(
  chatId: number,
  telegramUserId: number,
  username: string,
  locale: SupportedLocale,
) {
  const summary = await getTelegramReferralSummary({
    telegramUserId: String(telegramUserId),
    telegramChatId: String(chatId),
    username,
    displayName: username,
  });
  const config = await getTelegramConfig();
  const botUsername = config?.botUsername?.trim().replace(/^@+/, '') || 'atomicui_bot';
  const inviteLink = `https://t.me/${botUsername}?start=ref_${summary.referralCode}`;
  const revenueLabel = summary.revenue > 0
    ? new Intl.NumberFormat('en-US').format(summary.revenue)
    : '0';

  return locale === 'my'
    ? [
        '🔗 <b>Referral center</b>',
        '',
        `Code: <b>${summary.referralCode}</b>`,
        `Invite link: ${inviteLink}`,
        `Converted orders: <b>${summary.fulfilledOrders}</b>`,
        `Revenue: <b>${revenueLabel} MMK</b>`,
        '',
        'ဤ link ကို သူငယ်ချင်းထံ ပို့ပြီး bot ကို start လုပ်ခိုင်းပါ။ နောက်ထပ် /buy order တွင် code ကို attach လုပ်ပေးပါမည်။',
      ].join('\n')
    : [
        '🔗 <b>Referral center</b>',
        '',
        `Code: <b>${summary.referralCode}</b>`,
        `Invite link: ${inviteLink}`,
        `Converted orders: <b>${summary.fulfilledOrders}</b>`,
        `Revenue: <b>${revenueLabel} MMK</b>`,
        '',
        'Share this link with a friend. When they start the bot and place their next /buy order, the referral code will be attached automatically.',
      ].join('\n');
}

export async function handleTrialCommand(
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

  const servers = await listAssignableTelegramOrderServers({
    allowDraining: true,
  });
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

export async function handleRenewOrderCommand(
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

export async function handleTelegramOrderTextMessage(input: {
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
