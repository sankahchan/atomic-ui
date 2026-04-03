import { writeAuditLog } from '@/lib/audit';
import { db } from '@/lib/db';
import { tagMatchesFilter } from '@/lib/tags';
import { formatBytes } from '@/lib/utils';
import {
  buildSharePageUrl,
  buildShortShareUrl,
  buildSubscriptionApiUrl,
} from '@/lib/subscription-links';
import {
  recordSubscriptionPageEvent,
  SUBSCRIPTION_EVENT_TYPES,
} from '@/lib/services/subscription-events';
import {
  TELEGRAM_ORDER_ACTIVE_STATUSES,
  getTelegramSalesSettings,
  resolveTelegramRejectionReasonLabel,
  type TelegramOrderActiveStatus,
} from '@/lib/services/telegram-sales';
import {
  escapeHtml,
  formatExpirationSummary,
  getTelegramUi,
} from '@/lib/services/telegram-ui';
import {
  getSubscriptionDefaults,
  getTelegramConfig,
  getTelegramDefaultLocale,
  getTelegramSupportLink,
  loadAccessKeyForMessaging,
  loadDynamicAccessKeyForMessaging,
  resolveTelegramChatIdForDynamicKey,
  resolveTelegramChatIdForKey,
  resolveTelegramLocaleForRecipient,
  sendTelegramMessage,
} from '@/lib/services/telegram-runtime';
import { buildTelegramOrderActionCallbackData } from '@/lib/services/telegram-callbacks';
import {
  ensureAccessKeySubscriptionToken,
  getDynamicKeyMessagingUrls,
} from '@/lib/services/telegram-links';

const TELEGRAM_SALES_DIGEST_STATE_KEY = 'telegram_sales_digest_last_run';

type TelegramOrderDigestRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type TelegramOrderDigestRiskReason =
  | 'duplicate_proof'
  | 'repeated_rejections'
  | 'payment_history_mismatch'
  | 'retry_pattern'
  | 'multiple_open_orders'
  | 'resubmitted_proof';

function isSameLocalDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function computeTelegramOrderDigestRisk(input: {
  order: {
    id: string;
    duplicateProofOrderCode?: string | null;
    paymentProofRevision?: number | null;
    retryOfOrderId?: string | null;
  };
  identityOrders: Array<{
    id: string;
    status: string;
    createdAt: Date;
    rejectionReasonCode?: string | null;
    retryOfOrderId?: string | null;
  }>;
}) {
  let score = 0;
  const reasons: TelegramOrderDigestRiskReason[] = [];
  const now = Date.now();
  const previousOrders = input.identityOrders.filter((candidate) => candidate.id !== input.order.id);
  const previousRejectedOrders = previousOrders.filter((candidate) => candidate.status === 'REJECTED');
  const recentRejectedOrders = previousRejectedOrders.filter(
    (candidate) => now - candidate.createdAt.getTime() <= 30 * 24 * 60 * 60 * 1000,
  );
  const mismatchHistoryCount = previousRejectedOrders.filter(
    (candidate) =>
      candidate.rejectionReasonCode === 'wrong_payment_method' ||
      candidate.rejectionReasonCode === 'amount_mismatch',
  ).length;
  const retryCount = input.identityOrders.filter((candidate) => Boolean(candidate.retryOfOrderId)).length;
  const openOrders = input.identityOrders.filter((candidate) =>
    TELEGRAM_ORDER_ACTIVE_STATUSES.includes(candidate.status as TelegramOrderActiveStatus),
  ).length;

  if (input.order.duplicateProofOrderCode) {
    score += 45;
    reasons.push('duplicate_proof');
  }

  if ((input.order.paymentProofRevision ?? 0) > 1) {
    score += 10;
    reasons.push('resubmitted_proof');
  }

  if (recentRejectedOrders.length >= 2 || previousRejectedOrders.length >= 3) {
    score += 20;
    reasons.push('repeated_rejections');
  } else if (previousRejectedOrders.length >= 1) {
    score += 10;
    reasons.push('repeated_rejections');
  }

  if (mismatchHistoryCount >= 1) {
    score += 10;
    reasons.push('payment_history_mismatch');
  }

  if (input.order.retryOfOrderId || retryCount >= 2) {
    score += input.order.retryOfOrderId ? 15 : 10;
    reasons.push('retry_pattern');
  }

  if (openOrders > 1) {
    score += 10;
    reasons.push('multiple_open_orders');
  }

  const riskScore = Math.min(100, score);
  const riskLevel: TelegramOrderDigestRiskLevel =
    riskScore >= 70
      ? 'CRITICAL'
      : riskScore >= 45
        ? 'HIGH'
        : riskScore >= 20
          ? 'MEDIUM'
          : 'LOW';

  return {
    riskScore,
    riskLevel,
    riskReasons: Array.from(new Set(reasons)),
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
    return null;
  }

  const config = await getTelegramConfig();
  if (!config) {
    return null;
  }

  const key = await loadAccessKeyForMessaging(input.accessKeyId);
  if (!key) {
    return null;
  }

  if (!key.telegramDeliveryEnabled) {
    return null;
  }

  const destinationChatId = resolveTelegramChatIdForKey(key);
  if (!destinationChatId) {
    return null;
  }

  const { defaultLanguage } = await getSubscriptionDefaults();
  const supportLink = await getTelegramSupportLink();
  const locale = await resolveTelegramLocaleForRecipient({
    telegramUserId: key.telegramId || null,
    telegramChatId: destinationChatId,
    fallbackLocale: defaultLanguage,
  });
  const ui = getTelegramUi(locale);
  const isTrialKey = tagMatchesFilter(key.tags || '', 'trial');
  const recentlyActive =
    Boolean(
      (key.lastTrafficAt && key.lastTrafficAt.getTime() >= Date.now() - 14 * 24 * 60 * 60 * 1000) ||
      (key.lastUsedAt && key.lastUsedAt.getTime() >= Date.now() - 14 * 24 * 60 * 60 * 1000),
    );
  const includeSharePage = input.type === 'EXPIRING_7D' || input.type === 'EXPIRING_3D';
  const token = includeSharePage
    ? await ensureAccessKeySubscriptionToken(key.id, key.subscriptionToken)
    : null;
  const sharePageUrl = token
    ? (
        key.publicSlug
          ? buildShortShareUrl(key.publicSlug, { source: 'telegram_notification', lang: locale })
          : buildSharePageUrl(token, { source: 'telegram_notification', lang: locale })
      )
    : null;

  const lines =
    input.type === 'DISABLED'
      ? [
          ui.lifecycleDisabledTitle,
          '',
          `🔑 ${escapeHtml(key.name)}`,
          ui.lifecycleDisabledBody,
        ]
      : input.type === 'EXPIRING_7D'
        ? [
            ui.lifecycleExpiring7Title,
            '',
            `🔑 ${escapeHtml(key.name)}`,
            ui.lifecycleExpiring7Body(input.daysLeft ?? 7),
          ]
        : input.type === 'EXPIRING_3D'
          ? [
              ui.lifecycleExpiring3Title,
              '',
              `🔑 ${escapeHtml(key.name)}`,
              ui.lifecycleExpiring3Body(input.daysLeft ?? 3),
            ]
          : [
              ui.lifecycleExpiredTitle,
              '',
              `🔑 ${escapeHtml(key.name)}`,
              ui.lifecycleExpiredBody,
            ];

  if (input.type === 'EXPIRING_7D' || input.type === 'EXPIRING_3D') {
    lines.push(
      '',
      locale === 'my'
        ? 'ဆက်လက်အသုံးပြုလိုပါက အောက်ပါ button ကိုနှိပ်ပြီး ဤ key ကို တိုက်ရိုက် renewal အော်ဒါတင်နိုင်ပါသည်။'
        : 'If you want to keep using this key, use the button below to place a renewal order directly for this key.',
    );
  }

  if (input.type === 'EXPIRED') {
    if (isTrialKey) {
      lines.push(
        '',
        locale === 'my'
          ? 'Free trial သက်တမ်းကုန်သွားပါပြီ။ ဆက်လက်အသုံးပြုလိုပါက paid plan တစ်ခုကို ရွေးချယ်ပြီး အော်ဒါတင်နိုင်ပါသည်။'
          : 'Your free trial has ended. If you want to keep using the service, choose a paid plan and place a new order.',
      );
    } else if (recentlyActive) {
      lines.push(
        '',
        locale === 'my'
          ? 'ဤ key ကို မကြာသေးမီက အသုံးပြုခဲ့သည့်အတွက် renewal အော်ဒါတင်ပြီး ဆက်လက်အသုံးပြုနိုင်ပါသည်။'
          : 'Because this key was recently active, you can place a renewal order and continue using the same service.',
      );
    }
  }

  if (sharePageUrl) {
    lines.push('', `${ui.sharePageLabel}: ${sharePageUrl}`);
  }
  if (supportLink) {
    lines.push(`${ui.supportLabel}: ${supportLink}`);
  }

  const buttons: Array<Array<{ text: string; url?: string; callback_data?: string }>> = sharePageUrl
    ? [[{ text: ui.openSharePage, url: sharePageUrl }]]
    : [];
  if (input.type === 'EXPIRING_7D' || input.type === 'EXPIRING_3D') {
    buttons.unshift([
      {
        text: ui.orderActionRenewKey,
        callback_data: buildTelegramOrderActionCallbackData(
          'ky',
          key.id,
          input.type === 'EXPIRING_3D' ? 'renewal_3d' : 'renewal_7d',
        ),
      },
    ]);
  }
  if (input.type === 'EXPIRED' && isTrialKey) {
    buttons.unshift([
      {
        text: ui.orderActionBuyNewKey,
        callback_data: buildTelegramOrderActionCallbackData('by', key.id, 'trial_expired'),
      },
    ]);
  } else if (input.type === 'EXPIRED' && recentlyActive) {
    buttons.unshift([
      {
        text: ui.orderActionRenewKey,
        callback_data: buildTelegramOrderActionCallbackData('ky', key.id, 'expired_recovery'),
      },
    ]);
  }
  if (supportLink) {
    buttons.push([{ text: ui.getSupport, url: supportLink }]);
  }

  await sendTelegramMessage(config.botToken, destinationChatId, lines.join('\n'), {
    replyMarkup: buttons.length > 0 ? { inline_keyboard: buttons } : undefined,
  });

  await recordSubscriptionPageEvent({
    accessKeyId: key.id,
    eventType: SUBSCRIPTION_EVENT_TYPES.TELEGRAM_SENT,
    source: 'telegram_notification',
    metadata: {
      notificationType: input.type,
      destinationChatId,
      sharePageIncluded: Boolean(sharePageUrl),
    },
  });

  await writeAuditLog({
    action: 'TELEGRAM_NOTIFICATION_SENT',
    entity: 'ACCESS_KEY',
    entityId: key.id,
    details: {
      notificationType: input.type,
      destinationChatId,
      sharePageIncluded: Boolean(sharePageUrl),
    },
  });

  return {
    sharePageUrl,
    destinationChatId,
  };
}

export async function sendAccessKeyRenewalReminder(input: {
  accessKeyId: string;
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
    ? buildShortShareUrl(key.publicSlug, { source: input.source || 'renewal_reminder', lang: locale })
    : buildSharePageUrl(token, { source: input.source || 'renewal_reminder', lang: locale });
  const subscriptionUrl = buildSubscriptionApiUrl(token, { source: input.source || 'renewal_reminder' });
  const supportLink = await getTelegramSupportLink();

  const lines = locale === 'my'
    ? [
        '🔔 <b>သက်တမ်းတိုးခြင်း အသိပေးချက်</b>',
        '',
        `🔑 Key: <b>${escapeHtml(key.name)}</b>`,
        `🖥 Server: ${escapeHtml(key.server.name)}`,
        `⏳ လက်ရှိသက်တမ်း: ${escapeHtml(formatExpirationSummary(key, locale))}`,
        key.dataLimitBytes
          ? `📦 အသုံးပြုမှု: ${formatBytes(key.usedBytes)} / ${formatBytes(key.dataLimitBytes)}`
          : `📦 အသုံးပြုမှု: ${ui.unlimited}`,
        '',
        ui.renewalBenefitsStandard,
        'သင့် key ကို ဆက်လက်အသုံးပြုလိုပါက administrator ထံ ဆက်သွယ်ပြီး သက်တမ်းတိုးနိုင်ပါသည်။',
        '',
        `🌐 Share page: ${sharePageUrl}`,
        `🔄 Subscription URL: ${subscriptionUrl}`,
      ]
    : [
        '🔔 <b>Renewal Reminder</b>',
        '',
        `🔑 Key: <b>${escapeHtml(key.name)}</b>`,
        `🖥 Server: ${escapeHtml(key.server.name)}`,
        `⏳ Current expiration: ${escapeHtml(formatExpirationSummary(key, locale))}`,
        key.dataLimitBytes
          ? `📦 Usage: ${formatBytes(key.usedBytes)} / ${formatBytes(key.dataLimitBytes)}`
          : `📦 Usage: ${ui.unlimited}`,
        '',
        ui.renewalBenefitsStandard,
        '',
        'If you want to keep using this key, please contact your administrator to renew it.',
        `🌐 Share page: ${sharePageUrl}`,
        `🔄 Subscription URL: ${subscriptionUrl}`,
      ];

  const inlineKeyboard: Array<Array<{ text: string; url?: string; callback_data?: string }>> = [
    [
      {
        text: ui.orderActionRenewKey,
        callback_data: buildTelegramOrderActionCallbackData('ky', key.id, 'renewal_manual'),
      },
    ],
    [{ text: ui.openSharePage, url: sharePageUrl }],
  ];

  if (supportLink) {
    inlineKeyboard.push([{ text: ui.getSupport, url: supportLink }]);
  }

  await sendTelegramMessage(config.botToken, destinationChatId, lines.join('\n'), {
    replyMarkup: { inline_keyboard: inlineKeyboard },
  });

  await recordSubscriptionPageEvent({
    accessKeyId: key.id,
    eventType: SUBSCRIPTION_EVENT_TYPES.TELEGRAM_SENT,
    source: input.source || 'renewal_reminder',
    metadata: {
      destinationChatId,
      notificationType: 'RENEWAL_REMINDER',
    },
  });

  await writeAuditLog({
    action: 'ACCESS_KEY_RENEWAL_REMINDER_SENT',
    entity: 'ACCESS_KEY',
    entityId: key.id,
    details: {
      destinationChatId,
      sharePageUrl,
      subscriptionUrl,
    },
  });

  return {
    destinationChatId,
    sharePageUrl,
    subscriptionUrl,
  };
}

export async function sendDynamicKeyRenewalReminder(input: {
  dynamicAccessKeyId: string;
  chatId?: string | number | null;
  daysLeft: number;
  source?: string | null;
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
    throw new Error('This premium dynamic key is not linked to a Telegram chat yet.');
  }

  const defaults = await getSubscriptionDefaults();
  const locale = await resolveTelegramLocaleForRecipient({
    telegramUserId: key.telegramId || null,
    telegramChatId: destinationChatId,
    fallbackLocale: defaults.defaultLanguage,
  });
  const ui = getTelegramUi(locale);
  const { sharePageUrl, subscriptionUrl } = getDynamicKeyMessagingUrls(
    key,
    input.source || 'premium_renewal_reminder',
    locale,
  );
  const supportLink = await getTelegramSupportLink();

  const lines = [
    ui.premiumRenewalTitle,
    '',
    `🔁 ${ui.keyLabel}: <b>${escapeHtml(key.name)}</b>`,
    `⏳ ${ui.expirationLabel}: ${escapeHtml(formatExpirationSummary(key, locale))}`,
    key.dataLimitBytes
      ? `📦 ${ui.quotaLabel}: ${formatBytes(key.usedBytes)} / ${formatBytes(key.dataLimitBytes)}`
      : `📦 ${ui.quotaLabel}: ${ui.unlimited}`,
    '',
    ui.premiumRenewalBody(input.daysLeft),
    ui.premiumRenewalBenefits,
  ];

  if (sharePageUrl) {
    lines.push('', `🌐 ${ui.sharePageLabel}: ${sharePageUrl}`);
  }
  if (subscriptionUrl) {
    lines.push(`🔄 ${ui.clientEndpointLabel}: ${subscriptionUrl}`);
  }

  const inlineKeyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [
    [
      {
        text: ui.premiumRenewNow,
        callback_data: buildTelegramOrderActionCallbackData(
          'ky',
          key.id,
          input.daysLeft <= 3 ? 'dynamic_renewal_3d' : 'dynamic_renewal_7d',
        ),
      },
    ],
  ];

  if (sharePageUrl) {
    inlineKeyboard.push([{ text: ui.openSharePage, url: sharePageUrl }]);
  }
  if (supportLink) {
    inlineKeyboard.push([{ text: ui.getSupport, url: supportLink }]);
  }

  await sendTelegramMessage(config.botToken, destinationChatId, lines.join('\n'), {
    replyMarkup: { inline_keyboard: inlineKeyboard },
  });

  await writeAuditLog({
    action: 'DYNAMIC_KEY_RENEWAL_REMINDER_SENT',
    entity: 'DYNAMIC_ACCESS_KEY',
    entityId: key.id,
    details: {
      destinationChatId,
      daysLeft: input.daysLeft,
      sharePageUrl,
      subscriptionUrl,
    },
  });

  return {
    destinationChatId,
    sharePageUrl,
    subscriptionUrl,
  };
}

export async function sendDynamicKeyExpiryTelegramNotification(input: {
  dynamicAccessKeyId: string;
  source?: string | null;
}) {
  const config = await getTelegramConfig();
  if (!config) {
    return null;
  }

  const key = await loadDynamicAccessKeyForMessaging(input.dynamicAccessKeyId);
  if (!key) {
    return null;
  }

  const destinationChatId = resolveTelegramChatIdForDynamicKey(key);
  if (!destinationChatId) {
    return null;
  }

  const defaults = await getSubscriptionDefaults();
  const locale = await resolveTelegramLocaleForRecipient({
    telegramUserId: key.telegramId || null,
    telegramChatId: destinationChatId,
    fallbackLocale: defaults.defaultLanguage,
  });
  const ui = getTelegramUi(locale);
  const supportLink = await getTelegramSupportLink();

  const inlineKeyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [
    [
      {
        text: ui.premiumRenewNow,
        callback_data: buildTelegramOrderActionCallbackData('ky', key.id, 'dynamic'),
      },
    ],
  ];

  if (supportLink) {
    inlineKeyboard.push([{ text: ui.getSupport, url: supportLink }]);
  }

  await sendTelegramMessage(
    config.botToken,
    destinationChatId,
    [ui.premiumExpiredTitle, '', ui.premiumExpiredBody(key.name)].join('\n'),
    {
      replyMarkup: { inline_keyboard: inlineKeyboard },
    },
  );

  await writeAuditLog({
    action: 'DYNAMIC_KEY_EXPIRED_NOTICE_SENT',
    entity: 'DYNAMIC_ACCESS_KEY',
    entityId: key.id,
    details: {
      destinationChatId,
      source: input.source || 'premium_expired',
    },
  });

  return { destinationChatId };
}

export async function sendAccessKeyTrialExpiryReminder(input: {
  accessKeyId: string;
  hoursLeft: number;
  source?: string | null;
}) {
  const config = await getTelegramConfig();
  if (!config) {
    return null;
  }

  const key = await loadAccessKeyForMessaging(input.accessKeyId);
  if (!key) {
    return null;
  }

  if (!key.telegramDeliveryEnabled) {
    return null;
  }

  const destinationChatId = resolveTelegramChatIdForKey(key);
  if (!destinationChatId) {
    return null;
  }

  const defaults = await getSubscriptionDefaults();
  const locale = await resolveTelegramLocaleForRecipient({
    telegramUserId: key.telegramId || null,
    telegramChatId: destinationChatId,
    fallbackLocale: defaults.defaultLanguage,
  });
  const ui = getTelegramUi(locale);
  const supportLink = await getTelegramSupportLink();
  const token = await ensureAccessKeySubscriptionToken(key.id, key.subscriptionToken);
  const sharePageUrl = key.publicSlug
    ? buildShortShareUrl(key.publicSlug, { source: input.source || 'trial_expiry', lang: locale })
    : buildSharePageUrl(token, { source: input.source || 'trial_expiry', lang: locale });

  const lines = [
    ui.trialExpiringTitle,
    '',
    `🔑 ${escapeHtml(key.name)}`,
    ui.trialExpiringBody(Math.max(1, input.hoursLeft)),
    ui.trialExpiringUpsell,
    '',
    `${ui.sharePageLabel}: ${sharePageUrl}`,
  ];

  if (supportLink) {
    lines.push(`${ui.supportLabel}: ${supportLink}`);
  }

  const inlineKeyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [
    [
      {
        text: ui.orderActionBuyNewKey,
        callback_data: buildTelegramOrderActionCallbackData('by', key.id, 'trial_expiry'),
      },
    ],
    [
      {
        text: ui.openSharePage,
        url: sharePageUrl,
      },
    ],
  ];

  if (supportLink) {
    inlineKeyboard.push([{ text: ui.getSupport, url: supportLink }]);
  }

  const sent = await sendTelegramMessage(config.botToken, destinationChatId, lines.join('\n'), {
    replyMarkup: { inline_keyboard: inlineKeyboard },
  });

  if (!sent) {
    await db.notificationLog.create({
      data: {
        event: 'TELEGRAM_TRIAL_EXPIRING',
        message: `Failed to send free-trial expiry reminder (${input.hoursLeft}h left)`,
        status: 'FAILED',
        accessKeyId: key.id,
      },
    });
    return null;
  }

  await recordSubscriptionPageEvent({
    accessKeyId: key.id,
    eventType: SUBSCRIPTION_EVENT_TYPES.TELEGRAM_SENT,
    source: input.source || 'trial_expiry',
    metadata: {
      destinationChatId,
      notificationType: 'TRIAL_EXPIRING',
      hoursLeft: input.hoursLeft,
    },
  });

  await db.notificationLog.create({
    data: {
      event: 'TELEGRAM_TRIAL_EXPIRING',
      message: `Sent free-trial expiry reminder (${input.hoursLeft}h left)`,
      status: 'SUCCESS',
      accessKeyId: key.id,
    },
  });

  await writeAuditLog({
    action: 'ACCESS_KEY_TRIAL_EXPIRY_REMINDER_SENT',
    entity: 'ACCESS_KEY',
    entityId: key.id,
    details: {
      destinationChatId,
      sharePageUrl,
      hoursLeft: input.hoursLeft,
    },
  });

  return {
    destinationChatId,
    sharePageUrl,
  };
}

export async function sendAccessKeyTrialCouponCampaign(input: {
  accessKeyId: string;
  hoursLeft: number;
  couponCode: string;
  discountLabel: string;
  source?: string | null;
}) {
  const config = await getTelegramConfig();
  if (!config) {
    return null;
  }

  const key = await loadAccessKeyForMessaging(input.accessKeyId);
  if (!key || !key.telegramDeliveryEnabled) {
    return null;
  }

  const destinationChatId = resolveTelegramChatIdForKey(key);
  if (!destinationChatId) {
    return null;
  }

  const defaults = await getSubscriptionDefaults();
  const locale = await resolveTelegramLocaleForRecipient({
    telegramUserId: key.telegramId || null,
    telegramChatId: destinationChatId,
    fallbackLocale: defaults.defaultLanguage,
  });
  const ui = getTelegramUi(locale);
  const supportLink = await getTelegramSupportLink();
  const token = await ensureAccessKeySubscriptionToken(key.id, key.subscriptionToken);
  const sharePageUrl = key.publicSlug
    ? buildShortShareUrl(key.publicSlug, { source: input.source || 'trial_coupon', lang: locale })
    : buildSharePageUrl(token, { source: input.source || 'trial_coupon', lang: locale });

  const lines = [
    ui.trialCouponTitle,
    '',
    `🔑 ${escapeHtml(key.name)}`,
    ui.trialCouponBody(Math.max(1, input.hoursLeft)),
    ui.trialCouponOffer(escapeHtml(input.couponCode), escapeHtml(input.discountLabel)),
    ui.trialCouponHint,
    '',
    `${ui.sharePageLabel}: ${sharePageUrl}`,
  ];

  if (supportLink) {
    lines.push(`${ui.supportLabel}: ${supportLink}`);
  }

  const inlineKeyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [
    [
      {
        text: ui.orderActionBuyNewKey,
        callback_data: buildTelegramOrderActionCallbackData('by', key.id, 'trial_coupon'),
      },
    ],
    [
      {
        text: ui.openSharePage,
        url: sharePageUrl,
      },
    ],
  ];

  if (supportLink) {
    inlineKeyboard.push([{ text: ui.getSupport, url: supportLink }]);
  }

  const sent = await sendTelegramMessage(config.botToken, destinationChatId, lines.join('\n'), {
    replyMarkup: { inline_keyboard: inlineKeyboard },
  });

  if (!sent) {
    await db.notificationLog.create({
      data: {
        event: 'TELEGRAM_TRIAL_COUPON',
        message: `Failed to send trial coupon campaign (${input.hoursLeft}h left)`,
        status: 'FAILED',
        accessKeyId: key.id,
      },
    });
    return null;
  }

  await recordSubscriptionPageEvent({
    accessKeyId: key.id,
    eventType: SUBSCRIPTION_EVENT_TYPES.TELEGRAM_SENT,
    source: input.source || 'trial_coupon',
    metadata: {
      destinationChatId,
      notificationType: 'TRIAL_COUPON',
      hoursLeft: input.hoursLeft,
      couponCode: input.couponCode,
      discountLabel: input.discountLabel,
    },
  });

  await db.notificationLog.create({
    data: {
      event: 'TELEGRAM_TRIAL_COUPON',
      message: `Sent trial coupon campaign (${input.hoursLeft}h left)`,
      status: 'SUCCESS',
      accessKeyId: key.id,
    },
  });

  await writeAuditLog({
    action: 'ACCESS_KEY_TRIAL_COUPON_SENT',
    entity: 'ACCESS_KEY',
    entityId: key.id,
    details: {
      destinationChatId,
      sharePageUrl,
      hoursLeft: input.hoursLeft,
      couponCode: input.couponCode,
      discountLabel: input.discountLabel,
    },
  });

  return {
    destinationChatId,
    sharePageUrl,
  };
}

export async function sendAccessKeyRenewalCouponCampaign(input: {
  accessKeyId: string;
  daysLeft: number;
  couponCode: string;
  discountLabel: string;
}) {
  const config = await getTelegramConfig();
  if (!config) {
    return null;
  }

  const key = await loadAccessKeyForMessaging(input.accessKeyId);
  if (!key || !key.telegramDeliveryEnabled) {
    return null;
  }

  const destinationChatId = resolveTelegramChatIdForKey(key);
  if (!destinationChatId) {
    return null;
  }

  const defaults = await getSubscriptionDefaults();
  const locale = await resolveTelegramLocaleForRecipient({
    telegramUserId: key.telegramId || null,
    telegramChatId: destinationChatId,
    fallbackLocale: defaults.defaultLanguage,
  });
  const ui = getTelegramUi(locale);
  const supportLink = await getTelegramSupportLink();

  const lines = [
    ui.renewalCouponTitle,
    '',
    `🔑 ${escapeHtml(key.name)}`,
    ui.renewalCouponBody(Math.max(1, input.daysLeft)),
    ui.trialCouponOffer(escapeHtml(input.couponCode), escapeHtml(input.discountLabel)),
    ui.couponReadyHint,
  ];

  if (supportLink) {
    lines.push('', `${ui.supportLabel}: ${supportLink}`);
  }

  const sent = await sendTelegramMessage(config.botToken, destinationChatId, lines.join('\n'), {
    replyMarkup: {
      inline_keyboard: [
        [
          {
            text: ui.orderActionRenewKey,
            callback_data: buildTelegramOrderActionCallbackData('ky', key.id, 'renewal_coupon'),
          },
        ],
        ...(supportLink ? [[{ text: ui.getSupport, url: supportLink }]] : []),
      ],
    },
  });

  return sent ? { destinationChatId } : null;
}

export async function sendAccessKeyPremiumUpsellCouponCampaign(input: {
  accessKeyId: string;
  usagePercent: number;
  couponCode: string;
  discountLabel: string;
}) {
  const config = await getTelegramConfig();
  if (!config) {
    return null;
  }

  const key = await loadAccessKeyForMessaging(input.accessKeyId);
  if (!key || !key.telegramDeliveryEnabled) {
    return null;
  }

  const destinationChatId = resolveTelegramChatIdForKey(key);
  if (!destinationChatId) {
    return null;
  }

  const defaults = await getSubscriptionDefaults();
  const locale = await resolveTelegramLocaleForRecipient({
    telegramUserId: key.telegramId || null,
    telegramChatId: destinationChatId,
    fallbackLocale: defaults.defaultLanguage,
  });
  const ui = getTelegramUi(locale);
  const supportLink = await getTelegramSupportLink();

  const lines = [
    ui.premiumUpsellCouponTitle,
    '',
    `🔑 ${escapeHtml(key.name)}`,
    ui.premiumUpsellCouponBody(Math.max(1, input.usagePercent)),
    ui.trialCouponOffer(escapeHtml(input.couponCode), escapeHtml(input.discountLabel)),
    ui.couponReadyHint,
  ];

  if (supportLink) {
    lines.push('', `${ui.supportLabel}: ${supportLink}`);
  }

  const sent = await sendTelegramMessage(config.botToken, destinationChatId, lines.join('\n'), {
    replyMarkup: {
      inline_keyboard: [
        [
          {
            text: ui.orderActionBuyNewKey,
            callback_data: buildTelegramOrderActionCallbackData('by', key.id, 'premium_upsell_coupon'),
          },
        ],
        ...(supportLink ? [[{ text: ui.getSupport, url: supportLink }]] : []),
      ],
    },
  });

  return sent ? { destinationChatId } : null;
}

export async function sendTelegramWinbackCouponCampaign(input: {
  telegramChatId: string;
  telegramUserId: string;
  locale: 'en' | 'my';
  inactiveDays: number;
  couponCode: string;
  discountLabel: string;
}) {
  const config = await getTelegramConfig();
  if (!config) {
    return null;
  }

  const ui = getTelegramUi(input.locale);
  const supportLink = await getTelegramSupportLink();
  const lines = [
    ui.winbackCouponTitle,
    '',
    ui.winbackCouponBody(Math.max(1, input.inactiveDays)),
    ui.trialCouponOffer(escapeHtml(input.couponCode), escapeHtml(input.discountLabel)),
    ui.couponReadyHint,
  ];

  if (supportLink) {
    lines.push('', `${ui.supportLabel}: ${supportLink}`);
  }

  const sent = await sendTelegramMessage(config.botToken, input.telegramChatId, lines.join('\n'), {
    replyMarkup: {
      inline_keyboard: [
        [
          {
            text: ui.orderActionBuyNewKey,
            callback_data: buildTelegramOrderActionCallbackData('by', 'winback', 'winback_coupon'),
          },
        ],
        ...(supportLink ? [[{ text: ui.getSupport, url: supportLink }]] : []),
      ],
    },
  });

  return sent ? { destinationChatId: input.telegramChatId } : null;
}

export async function sendTelegramDigestToAdmins(input?: {
  now?: Date;
}) {
  const config = await getTelegramConfig();
  if (!config || config.adminChatIds.length === 0) {
    return { sent: false, reason: 'not-configured' as const };
  }

  const now = input?.now || new Date();
  const lookbackHours = config.digestLookbackHours || 24;
  const locale = await getTelegramDefaultLocale();
  const ui = getTelegramUi(locale);
  const since = new Date(now.getTime() - lookbackHours * 60 * 60 * 1000);

  const [activeKeys, pendingKeys, depletedKeys, expiringSoon, openIncidents, healthCounts, recentViews] =
    await Promise.all([
      db.accessKey.count({ where: { status: 'ACTIVE' } }),
      db.accessKey.count({ where: { status: 'PENDING' } }),
      db.accessKey.count({ where: { status: 'DEPLETED' } }),
      db.accessKey.count({
        where: {
          status: { in: ['ACTIVE', 'PENDING'] },
          expiresAt: {
            gte: now,
            lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),
      db.incident.count({
        where: {
          status: 'OPEN',
        },
      }),
      db.healthCheck.groupBy({
        by: ['lastStatus'],
        _count: { lastStatus: true },
      }),
      db.subscriptionPageEvent.count({
        where: {
          createdAt: {
            gte: since,
          },
        },
      }),
    ]);

  const healthSummary = {
    up: 0,
    slow: 0,
    down: 0,
    unknown: 0,
  };

  for (const row of healthCounts) {
    switch (row.lastStatus) {
      case 'UP':
        healthSummary.up = row._count.lastStatus;
        break;
      case 'SLOW':
        healthSummary.slow = row._count.lastStatus;
        break;
      case 'DOWN':
        healthSummary.down = row._count.lastStatus;
        break;
      default:
        healthSummary.unknown += row._count.lastStatus;
        break;
    }
  }

  const message = [
    ui.digestTitle,
    '',
    ui.digestWindow(lookbackHours),
    `${ui.digestActiveKeys}: ${activeKeys}`,
    `${ui.digestPendingKeys}: ${pendingKeys}`,
    `${ui.digestDepletedKeys}: ${depletedKeys}`,
    `${ui.digestExpiringSoon}: ${expiringSoon}`,
    `${ui.digestOpenIncidents}: ${openIncidents}`,
    `${ui.digestEvents}: ${recentViews}`,
    '',
    `${ui.digestServerHealth}: ${ui.digestHealthSummary(healthSummary.up, healthSummary.slow, healthSummary.down, healthSummary.unknown)}`,
  ].join('\n');

  for (const chatId of config.adminChatIds) {
    await sendTelegramMessage(config.botToken, chatId, message);
  }

  await writeAuditLog({
    action: 'TELEGRAM_DIGEST_SENT',
    entity: 'TELEGRAM',
    details: {
      adminChats: config.adminChatIds.length,
      lookbackHours,
      activeKeys,
      expiringSoon,
      openIncidents,
      recentViews,
    },
  });

  return {
    sent: true as const,
    adminChats: config.adminChatIds.length,
    lookbackHours,
  };
}

export async function sendTelegramSalesDigestToAdmins(input?: {
  now?: Date;
}) {
  const now = input?.now || new Date();
  const [config, salesSettings] = await Promise.all([
    getTelegramConfig(),
    getTelegramSalesSettings(),
  ]);

  if (!config) {
    return { sent: false as const, reason: 'not-configured' as const };
  }

  if (config.adminChatIds.length === 0) {
    return { sent: false as const, reason: 'no-admin-chats' as const };
  }

  if (!salesSettings.enabled) {
    return { sent: false as const, reason: 'sales-disabled' as const };
  }

  const locale = config.defaultLanguage || (await getTelegramDefaultLocale());
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const ui =
    locale === 'my'
      ? {
          title: '💸 <b>Telegram Sales Digest</b>',
          window: 'အချိန်ကာလ: နောက်ဆုံး 24 နာရီ',
          created: 'Order အသစ်များ',
          pending: 'Pending review',
          fulfilled: 'Fulfilled',
          rejected: 'Rejected',
          awaitingPayment: 'Awaiting payment',
          highRisk: 'High-risk pending',
          unclaimed: 'Unclaimed pending',
          myQueue: 'Claim လုပ်ထားသော orders',
          revenue: 'ဝင်ငွေ',
          trend: 'ယခင် 24 နာရီနှင့် နှိုင်းယှဉ်မှု',
          revenueDelta: 'ဝင်ငွေ အပြောင်းအလဲ',
          topReasons: 'အများဆုံး reject reason များ',
          topMethods: 'အသုံးအများဆုံး payment method များ',
          none: 'မရှိ',
        }
      : {
          title: '💸 <b>Telegram Sales Digest</b>',
          window: 'Window: last 24 hours',
          created: 'New orders',
          pending: 'Pending review',
          fulfilled: 'Fulfilled',
          rejected: 'Rejected',
          awaitingPayment: 'Awaiting payment',
          highRisk: 'High-risk pending',
          unclaimed: 'Unclaimed pending',
          myQueue: 'Claimed pending',
          revenue: 'Revenue',
          trend: 'Trend vs previous 24h',
          revenueDelta: 'Revenue delta',
          topReasons: 'Top rejection reasons',
          topMethods: 'Top payment methods',
          none: 'None',
        };

  const previousSince = new Date(since.getTime() - 24 * 60 * 60 * 1000);
  const [orders, previousOrders] = await Promise.all([
    db.telegramOrder.findMany({
      where: {
        createdAt: {
          gte: since,
        },
      },
      select: {
        id: true,
        status: true,
        priceAmount: true,
        priceCurrency: true,
        paymentMethodLabel: true,
        paymentMethodCode: true,
        rejectionReasonCode: true,
        assignedReviewerEmail: true,
        assignedReviewerUserId: true,
        paymentSubmittedAt: true,
        duplicateProofOrderCode: true,
        paymentProofRevision: true,
        retryOfOrderId: true,
        telegramUserId: true,
        telegramChatId: true,
        requestedEmail: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: 'desc' }],
    }),
    db.telegramOrder.findMany({
      where: {
        createdAt: {
          gte: previousSince,
          lt: since,
        },
      },
      select: {
        id: true,
        status: true,
        priceAmount: true,
        priceCurrency: true,
        paymentMethodLabel: true,
        paymentMethodCode: true,
        rejectionReasonCode: true,
        assignedReviewerEmail: true,
        assignedReviewerUserId: true,
        paymentSubmittedAt: true,
        duplicateProofOrderCode: true,
        paymentProofRevision: true,
        retryOfOrderId: true,
        telegramUserId: true,
        telegramChatId: true,
        requestedEmail: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: 'desc' }],
    }),
  ]);

  const normalizeEmail = (value?: string | null) => value?.trim().toLowerCase() || null;

  const summarizeOrders = (
    digestOrders: typeof orders,
  ) => {
    const summary = {
      created: digestOrders.length,
      pending: 0,
      fulfilled: 0,
      rejected: 0,
      awaitingPayment: 0,
      highRiskPending: 0,
      unclaimedPending: 0,
      claimedPending: 0,
    };
    const revenueByCurrency = new Map<string, number>();
    const rejectionReasons = new Map<string, number>();
    const paymentMethods = new Map<string, number>();

    for (const order of digestOrders) {
      const identityOrders = digestOrders.filter((candidate) => {
        if (candidate.id === order.id) {
          return false;
        }
        if (candidate.telegramUserId && candidate.telegramUserId === order.telegramUserId) {
          return true;
        }
        if (candidate.telegramChatId && candidate.telegramChatId === order.telegramChatId) {
          return true;
        }
        const orderEmail = normalizeEmail(order.requestedEmail);
        const candidateEmail = normalizeEmail(candidate.requestedEmail);
        return Boolean(orderEmail && candidateEmail && orderEmail === candidateEmail);
      });
      const risk = computeTelegramOrderDigestRisk({
        order,
        identityOrders,
      });

      switch (order.status) {
        case 'PENDING_REVIEW':
          summary.pending += 1;
          if (risk.riskLevel === 'HIGH' || risk.riskLevel === 'CRITICAL') {
            summary.highRiskPending += 1;
          }
          if (order.assignedReviewerUserId) {
            summary.claimedPending += 1;
          } else {
            summary.unclaimedPending += 1;
          }
          break;
        case 'FULFILLED':
          summary.fulfilled += 1;
          if (typeof order.priceAmount === 'number' && order.priceAmount > 0) {
            const currency = (order.priceCurrency || 'MMK').trim().toUpperCase();
            revenueByCurrency.set(currency, (revenueByCurrency.get(currency) || 0) + order.priceAmount);
          }
          break;
        case 'REJECTED':
          summary.rejected += 1;
          rejectionReasons.set(
            order.rejectionReasonCode?.trim() || 'custom',
            (rejectionReasons.get(order.rejectionReasonCode?.trim() || 'custom') || 0) + 1,
          );
          break;
        case 'AWAITING_PAYMENT_METHOD':
        case 'AWAITING_PAYMENT_PROOF':
          summary.awaitingPayment += 1;
          break;
        default:
          break;
      }

      if (order.paymentMethodLabel || order.paymentMethodCode) {
        const key = order.paymentMethodLabel || order.paymentMethodCode || 'Unknown';
        paymentMethods.set(key, (paymentMethods.get(key) || 0) + 1);
      }
    }

    return {
      summary,
      revenueByCurrency,
      rejectionReasons,
      paymentMethods,
    };
  };

  const currentWindow = summarizeOrders(orders);
  const previousWindow = summarizeOrders(previousOrders);
  const summary = currentWindow.summary;
  const revenueByCurrency = currentWindow.revenueByCurrency;
  const rejectionReasons = currentWindow.rejectionReasons;
  const paymentMethods = currentWindow.paymentMethods;

  const revenueLabel = Array.from(revenueByCurrency.entries())
    .sort((left, right) => right[1] - left[1])
    .map(([currency, amount]) => {
      const formatted = new Intl.NumberFormat(locale === 'my' ? 'my-MM' : 'en-US').format(amount);
      return `${formatted} ${currency}`;
    })
    .join(' • ') || ui.none;
  const topReasons = Array.from(rejectionReasons.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([code, count]) => `${resolveTelegramRejectionReasonLabel(code, locale)} (${count})`)
    .join(' • ') || ui.none;
  const topMethods = Array.from(paymentMethods.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([label, count]) => `${label} (${count})`)
    .join(' • ') || ui.none;

  const formatDelta = (value: number) => {
    if (value === 0) {
      return '0';
    }
    return value > 0 ? `+${value}` : `${value}`;
  };
  const revenueCurrencies = Array.from(
    new Set([
      ...Array.from(revenueByCurrency.keys()),
      ...Array.from(previousWindow.revenueByCurrency.keys()),
    ]),
  );
  const revenueDeltaLabel =
    revenueCurrencies
      .map((currency) => {
        const current = revenueByCurrency.get(currency) || 0;
        const previous = previousWindow.revenueByCurrency.get(currency) || 0;
        const delta = current - previous;
        const formatted = new Intl.NumberFormat(locale === 'my' ? 'my-MM' : 'en-US').format(Math.abs(delta));
        const prefix = delta === 0 ? '0' : delta > 0 ? `+${formatted}` : `-${formatted}`;
        return `${prefix} ${currency}`;
      })
      .join(' • ') || ui.none;

  const message = [
    ui.title,
    '',
    ui.window,
    `${ui.created}: ${summary.created}`,
    `${ui.pending}: ${summary.pending}`,
    `${ui.fulfilled}: ${summary.fulfilled}`,
    `${ui.rejected}: ${summary.rejected}`,
    `${ui.awaitingPayment}: ${summary.awaitingPayment}`,
    `${ui.highRisk}: ${summary.highRiskPending}`,
    `${ui.unclaimed}: ${summary.unclaimedPending}`,
    `${ui.myQueue}: ${summary.claimedPending}`,
    `${ui.revenue}: ${revenueLabel}`,
    '',
    ui.trend,
    `${ui.created}: ${formatDelta(summary.created - previousWindow.summary.created)}`,
    `${ui.pending}: ${formatDelta(summary.pending - previousWindow.summary.pending)}`,
    `${ui.fulfilled}: ${formatDelta(summary.fulfilled - previousWindow.summary.fulfilled)}`,
    `${ui.rejected}: ${formatDelta(summary.rejected - previousWindow.summary.rejected)}`,
    `${ui.revenueDelta}: ${revenueDeltaLabel}`,
    '',
    `${ui.topReasons}: ${topReasons}`,
    `${ui.topMethods}: ${topMethods}`,
  ].join('\n');

  for (const adminChatId of config.adminChatIds) {
    await sendTelegramMessage(config.botToken, adminChatId, message);
  }

  await writeAuditLog({
    action: 'TELEGRAM_SALES_DIGEST_SENT',
    entity: 'TELEGRAM',
    details: {
      adminChats: config.adminChatIds.length,
      created: summary.created,
      pending: summary.pending,
      fulfilled: summary.fulfilled,
      rejected: summary.rejected,
      highRiskPending: summary.highRiskPending,
      unclaimedPending: summary.unclaimedPending,
      claimedPending: summary.claimedPending,
      trend: {
        created: summary.created - previousWindow.summary.created,
        pending: summary.pending - previousWindow.summary.pending,
        fulfilled: summary.fulfilled - previousWindow.summary.fulfilled,
        rejected: summary.rejected - previousWindow.summary.rejected,
        revenueByCurrency: Object.fromEntries(
          revenueCurrencies.map((currency) => [
            currency,
            (revenueByCurrency.get(currency) || 0) - (previousWindow.revenueByCurrency.get(currency) || 0),
          ]),
        ),
      },
    },
  });

  return {
    sent: true as const,
    adminChats: config.adminChatIds.length,
    summary,
  };
}

export async function runTelegramSalesDigestCycle(input?: {
  force?: boolean;
  now?: Date;
}) {
  const force = input?.force ?? false;
  const now = input?.now ?? new Date();
  const settings = await getTelegramSalesSettings();

  if (!settings.enabled) {
    return { skipped: true as const, reason: 'sales-disabled' };
  }

  if (!force && !settings.dailySalesDigestEnabled) {
    return { skipped: true as const, reason: 'disabled' };
  }

  const config = await getTelegramConfig();
  if (!config) {
    return { skipped: true as const, reason: 'not-configured' };
  }

  if (config.adminChatIds.length === 0) {
    return { skipped: true as const, reason: 'no-admin-chats' };
  }

  const lastRun = await db.settings.findUnique({
    where: { key: TELEGRAM_SALES_DIGEST_STATE_KEY },
    select: { value: true },
  });

  if (!force) {
    const scheduled = new Date(now);
    scheduled.setHours(settings.dailySalesDigestHour ?? 20, settings.dailySalesDigestMinute ?? 0, 0, 0);

    if (now.getTime() < scheduled.getTime()) {
      return { skipped: true as const, reason: 'scheduled-time-not-reached' };
    }

    if (lastRun?.value) {
      const lastRunAt = new Date(lastRun.value);
      if (!Number.isNaN(lastRunAt.getTime()) && isSameLocalDay(lastRunAt, now)) {
        return { skipped: true as const, reason: 'already-ran-today' };
      }
    }
  }

  const result = await sendTelegramSalesDigestToAdmins({ now });
  if (!result.sent) {
    return { skipped: true as const, reason: result.reason };
  }

  await db.settings.upsert({
    where: { key: TELEGRAM_SALES_DIGEST_STATE_KEY },
    create: {
      key: TELEGRAM_SALES_DIGEST_STATE_KEY,
      value: now.toISOString(),
    },
    update: {
      value: now.toISOString(),
    },
  });

  return {
    skipped: false as const,
    adminChats: result.adminChats,
    summary: result.summary,
  };
}
