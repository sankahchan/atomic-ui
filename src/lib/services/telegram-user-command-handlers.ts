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
import { getTelegramConfig, getTelegramSupportLink, sendTelegramMessage } from '@/lib/services/telegram-runtime';
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
import {
  buildTelegramStoreActiveKeysView,
  buildTelegramStoreHelpView,
  buildTelegramStorePlanListView,
  buildTelegramStoreQuickStatusView,
  buildTelegramStoreReferralView,
  buildTelegramStoreRenewView,
  buildTelegramStoreSetupHomeView,
  buildTelegramStoreSetupNoKeyView,
  buildTelegramStoreSetupKeyPickerView,
  buildTelegramStoreSetupGuideText,
  buildTelegramStoreSupportContactView,
  buildTelegramStoreSwitchKeySelectionView,
  buildTelegramStoreSwitchLimitReachedView,
  buildTelegramStoreSwitchServerSelectionView,
  buildTelegramStorefrontCallbackData,
  escapeTelegramMarkdownV2,
  loadTelegramStoreAccountData,
  loadTelegramStoreActiveKeysData,
  loadTelegramStoreRenewData,
  loadTelegramStoreSwitchServerOptions,
  loadTelegramStoreSwitchableKeysData,
} from '@/lib/services/telegram-storefront';

export { handleTelegramStartCommand as handleStartCommand };

async function sendTelegramStoreView(input: {
  botToken: string;
  chatId: number;
  text: string;
  replyMarkup?: Record<string, unknown>;
}) {
  const sent = await sendTelegramMessage(input.botToken, input.chatId, input.text, {
    parseMode: 'MarkdownV2',
    replyMarkup: input.replyMarkup,
  });

  return sent ? null : input.text;
}

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

export async function handleStoreBuyCommand(
  chatId: number,
  telegramUserId: number,
  username: string,
  locale: SupportedLocale,
  botToken: string,
): Promise<string | null> {
  const ui = getTelegramUi(locale);
  const existing = await getActiveTelegramOrder(chatId, telegramUserId);
  if (existing?.status === 'PENDING_REVIEW') {
    return ui.activeOrderPendingReview(existing.orderCode);
  }

  await cancelStaleTelegramConversationOrders(chatId, telegramUserId);
  const { plans } = await loadTelegramStoreRenewData({
    chatId,
    telegramUserId,
  });
  const view = buildTelegramStorePlanListView(plans);

  return sendTelegramStoreView({
    botToken,
    chatId,
    text: view.text,
    replyMarkup: view.replyMarkup,
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
  const view = buildTelegramStoreReferralView({
    botUsername,
    telegramUserId,
    count: summary.fulfilledOrders,
    bonusGb: 0,
  });

  const botToken = config?.botToken;
  if (!botToken) {
    return view.text;
  }

  return sendTelegramStoreView({
    botToken,
    chatId,
    text: view.text,
    replyMarkup: view.replyMarkup,
  });
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

export async function handleStoreRenewCommand(
  chatId: number,
  telegramUserId: number,
  username: string,
  locale: SupportedLocale,
  botToken: string,
): Promise<string | null> {
  const ui = getTelegramUi(locale);
  const settings = await getTelegramSalesSettings();

  if (!settings.enabled || !settings.allowRenewals) {
    return ui.renewDisabled;
  }

  const existing = await getActiveTelegramOrder(chatId, telegramUserId);
  if (existing?.status === 'PENDING_REVIEW') {
    return ui.activeOrderPendingReview(existing.orderCode);
  }

  await cancelStaleTelegramConversationOrders(chatId, telegramUserId);
  const { plans, plan, renewTarget } = await loadTelegramStoreRenewData({
    chatId,
    telegramUserId,
  });

  if (!plan) {
    const planList = buildTelegramStorePlanListView(plans);
    return sendTelegramStoreView({
      botToken,
      chatId,
      text: planList.text,
      replyMarkup: planList.replyMarkup,
    });
  }

  const view = buildTelegramStoreRenewView({
    plan,
    renewTarget,
  });

  return sendTelegramStoreView({
    botToken,
    chatId,
    text: view.text,
    replyMarkup: view.replyMarkup,
  });
}

export async function handleStoreMyKeysCommand(input: {
  chatId: number;
  telegramUserId: number;
  locale: SupportedLocale;
  botToken: string;
}) {
  const { items } = await loadTelegramStoreActiveKeysData({
    chatId: input.chatId,
    telegramUserId: input.telegramUserId,
  });

  if (items.length === 0) {
    const text = [
      '🔑 *Your Active Keys*',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      'No active keys right now\\.',
      '',
      'Tap below to buy a new plan\\.',
    ].join('\n');

    return sendTelegramStoreView({
      botToken: input.botToken,
      chatId: input.chatId,
      text,
      replyMarkup: {
        inline_keyboard: [[
          {
            text: '➕ Buy New Plan',
            callback_data: buildTelegramStorefrontCallbackData({ action: 'show_plans' }),
          },
        ]],
      },
    });
  }

  const view = buildTelegramStoreActiveKeysView(items);
  return sendTelegramStoreView({
    botToken: input.botToken,
    chatId: input.chatId,
    text: view.text,
    replyMarkup: view.replyMarkup,
  });
}

export async function handleStoreStatusCommand(input: {
  chatId: number;
  telegramUserId: number;
  botToken: string;
}) {
  const account = await loadTelegramStoreAccountData({
    chatId: input.chatId,
    telegramUserId: input.telegramUserId,
  });
  const view = buildTelegramStoreQuickStatusView(account);

  await sendTelegramMessage(input.botToken, input.chatId, view.text, {
    parseMode: 'MarkdownV2',
  });

  return null;
}

export async function handleStoreSetupCommand(input: {
  chatId: number;
  telegramUserId: number;
  botToken: string;
}) {
  const { items } = await loadTelegramStoreActiveKeysData({
    chatId: input.chatId,
    telegramUserId: input.telegramUserId,
  });

  if (items.length === 0) {
    const view = buildTelegramStoreSetupNoKeyView();
    return sendTelegramStoreView({
      botToken: input.botToken,
      chatId: input.chatId,
      text: view.text,
      replyMarkup: view.replyMarkup,
    });
  }

  const view = buildTelegramStoreSetupHomeView();
  return sendTelegramStoreView({
    botToken: input.botToken,
    chatId: input.chatId,
    text: view.text,
    replyMarkup: view.replyMarkup,
  });
}

export async function handleStoreSupportCommand(input: {
  chatId: number;
  locale: SupportedLocale;
  botToken: string;
}) {
  const supportUrl = await getTelegramSupportLink();
  const view = buildTelegramStoreSupportContactView({
    locale: input.locale,
    supportUrl,
  });

  return sendTelegramStoreView({
    botToken: input.botToken,
    chatId: input.chatId,
    text: view.text,
    replyMarkup: view.replyMarkup,
  });
}

export async function handleStoreHelpCommand(input: {
  chatId: number;
  botToken: string;
}) {
  const supportUrl = await getTelegramSupportLink();
  const view = buildTelegramStoreHelpView({ supportUrl });

  return sendTelegramStoreView({
    botToken: input.botToken,
    chatId: input.chatId,
    text: view.text,
    replyMarkup: view.replyMarkup,
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

export async function handleSwitchServerCommand(
  chatId: number,
  telegramUserId: number,
  locale: SupportedLocale,
  botToken: string,
  argsText?: string,
): Promise<string | null> {
  const ui = getTelegramUi(locale);
  const accessKeys = await db.accessKey.findMany({
    where: {
      telegramId: String(telegramUserId),
      status: 'ACTIVE',
    },
    include: {
      server: { select: { name: true } },
    },
  });

  const eligibleAccessKeys = accessKeys.filter((k) => k.switchesMax !== 0);

  if (eligibleAccessKeys.length === 0) {
    return ui.switchServerNotSupported('Your key');
  }

  if (argsText?.trim()) {
    const search = argsText.trim().toLowerCase();
    const matchedAccess = eligibleAccessKeys.find(
      (k) => k.id === search || k.name.toLowerCase().includes(search),
    );

    if (matchedAccess) {
      return initiateServerSwitch(chatId, telegramUserId, locale, botToken, 'access', matchedAccess);
    }
  }

  if (eligibleAccessKeys.length === 1) {
    return initiateServerSwitch(chatId, telegramUserId, locale, botToken, 'access', eligibleAccessKeys[0]);
  }

  const rows = eligibleAccessKeys.map((k) => [
    [
      {
        text: `🔑 ${k.name} (${k.switchesUsed}/${k.switchesMax === -1 ? '∞' : k.switchesMax})`,
        callback_data: `sw_ky_access_${k.id}`,
      },
    ],
  ]);

  await sendTelegramMessage(botToken, chatId, ui.switchServerTitle, {
    replyMarkup: { inline_keyboard: rows },
  });

  return null;
}

export async function handleStoreSwitchServerCommand(input: {
  chatId: number;
  telegramUserId: number;
  locale: SupportedLocale;
  botToken: string;
  argsText?: string;
}) {
  const { keys } = await loadTelegramStoreSwitchableKeysData({
    chatId: input.chatId,
    telegramUserId: input.telegramUserId,
  });

  if (keys.length === 0) {
    const text = [
      '🔄 *Switch Server*',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      'No switchable active keys found\\.',
    ].join('\n');

    return sendTelegramStoreView({
      botToken: input.botToken,
      chatId: input.chatId,
      text,
      replyMarkup: {
        inline_keyboard: [[
          {
            text: '◀ Back',
            callback_data: buildTelegramStorefrontCallbackData({ action: 'main_menu' }),
          },
        ]],
      },
    });
  }

  const search = input.argsText?.trim().toLowerCase() || '';
  const matchedKey = search
    ? keys.find(
        (key) =>
          key.id.toLowerCase() === search
          || key.planName.toLowerCase().includes(search),
      ) || null
    : null;

  if (matchedKey) {
    if (matchedKey.switchesMax !== -1 && matchedKey.switchesUsed >= matchedKey.switchesMax) {
      const limitView = buildTelegramStoreSwitchLimitReachedView({
        max: matchedKey.switchesMaxLabel,
        planName: matchedKey.planName,
      });
      return sendTelegramStoreView({
        botToken: input.botToken,
        chatId: input.chatId,
        text: limitView.text,
        replyMarkup: limitView.replyMarkup,
      });
    }

    const serverOptions = await loadTelegramStoreSwitchServerOptions({
      keyId: matchedKey.id,
      kind: matchedKey.kind,
    });

    if (!serverOptions || serverOptions.servers.length === 0) {
      const text = [
        '🌍 *Select New Server*',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━',
        '',
        `Current  :  *${escapeTelegramMarkdownV2(matchedKey.currentServerName)}*`,
        `Used     :  ${escapeTelegramMarkdownV2(String(matchedKey.switchesUsed))} / ${escapeTelegramMarkdownV2(matchedKey.switchesMaxLabel)} switches`,
        '',
        'No alternate server is available right now\\.',
      ].join('\n');

      return sendTelegramStoreView({
        botToken: input.botToken,
        chatId: input.chatId,
        text,
        replyMarkup: {
          inline_keyboard: [[
            {
              text: '◀ Back',
              callback_data: buildTelegramStorefrontCallbackData({ action: 'main_menu' }),
            },
          ]],
        },
      });
    }

    const view = buildTelegramStoreSwitchServerSelectionView({
      keyId: matchedKey.id,
      currentServer: serverOptions.currentServerName,
      used: serverOptions.switchesUsed,
      maxLabel: matchedKey.switchesMaxLabel,
      servers: serverOptions.servers,
    });

    return sendTelegramStoreView({
      botToken: input.botToken,
      chatId: input.chatId,
      text: view.text,
      replyMarkup: view.replyMarkup,
    });
  }

  const view = buildTelegramStoreSwitchKeySelectionView(keys);
  return sendTelegramStoreView({
    botToken: input.botToken,
    chatId: input.chatId,
    text: view.text,
    replyMarkup: view.replyMarkup,
  });
}

export async function sendTelegramStoreSetupGuide(
  chatId: number,
  locale: SupportedLocale,
  botToken: string,
) {
  return sendTelegramStoreView({
    botToken,
    chatId,
    text: buildTelegramStoreSetupGuideText(locale),
  });
}

export function getTelegramStoreSupportAlert(locale: SupportedLocale) {
  return locale === 'my'
    ? '💬 Support contact ကို ဖွင့်ရန် /support ကို အသုံးပြုပါ။'
    : '💬 Use /support to open the support contact card.';
}

async function initiateServerSwitch(
  chatId: number,
  telegramUserId: number,
  locale: SupportedLocale,
  botToken: string,
  kind: 'access' | 'dynamic',
  key: any,
) {
  const ui = getTelegramUi(locale);

  if (kind !== 'access') {
    return ui.switchServerNotSupported(key.name);
  }

  if (key.switchesMax !== -1 && key.switchesUsed >= key.switchesMax) {
    return ui.switchServerLimitReached(key.name);
  }

  const servers = await listAssignableTelegramOrderServers({ allowDraining: true });
  const availableServers = servers.filter((s) => s.id !== key.serverId);

  if (availableServers.length === 0) {
    return ui.serverChangeNoAlternateServers;
  }

  const rows = availableServers.slice(0, 8).map((s) => [
    {
      text: `🖥 ${s.name}`,
      callback_data: `sw_sv_${kind}_${key.id}_${s.id}`,
    },
  ]);

  await sendTelegramMessage(
    botToken,
    chatId,
    ui.switchServerPrompt(key.switchesUsed, key.switchesMax),
    {
      replyMarkup: { inline_keyboard: rows },
    },
  );

  return null;
}
