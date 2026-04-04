import { db } from '@/lib/db';
import type { SupportedLocale } from '@/lib/i18n/config';
import {
  formatTelegramSalesMoneyAmount,
  type TelegramCampaignCouponType,
} from '@/lib/services/telegram-coupons';
import { buildTelegramOrderActionCallbackData } from '@/lib/services/telegram-callbacks';
import { getTelegramSupportLink, sendTelegramMessage } from '@/lib/services/telegram-runtime';
import { escapeHtml, formatTelegramDateTime, getTelegramUi } from '@/lib/services/telegram-ui';

type TelegramOfferRecord = Awaited<
  ReturnType<typeof db.telegramCouponRedemption.findMany>
>[number];

function resolveTelegramOfferCampaignLabel(
  campaignType: string,
  locale: SupportedLocale,
) {
  const isMyanmar = locale === 'my';
  switch (campaignType) {
    case 'TRIAL_TO_PAID':
      return isMyanmar ? 'Trial to paid' : 'Trial to paid';
    case 'RENEWAL_SOON':
      return isMyanmar ? 'Renewal coupon' : 'Renewal coupon';
    case 'PREMIUM_UPSELL':
      return isMyanmar ? 'Premium upgrade' : 'Premium upgrade';
    case 'WINBACK':
      return isMyanmar ? 'Welcome-back offer' : 'Welcome-back offer';
    default:
      return campaignType;
  }
}

function resolveTelegramOfferStatusLabel(
  offer: TelegramOfferRecord,
  locale: SupportedLocale,
) {
  const isMyanmar = locale === 'my';
  if (offer.status === 'ISSUED' && (!offer.expiresAt || offer.expiresAt.getTime() > Date.now())) {
    return isMyanmar ? 'Active now' : 'Active now';
  }
  if (offer.status === 'REDEEMED') {
    return isMyanmar ? 'Used' : 'Used';
  }
  if (offer.status === 'EXPIRED') {
    return isMyanmar ? 'Expired' : 'Expired';
  }
  if (offer.status === 'CANCELLED') {
    return isMyanmar ? 'Revoked' : 'Revoked';
  }
  return offer.status;
}

function resolveTelegramOfferActionLine(
  offer: TelegramOfferRecord,
  locale: SupportedLocale,
  label?: string | null,
) {
  const isMyanmar = locale === 'my';
  if (offer.campaignType === 'RENEWAL_SOON') {
    return label
      ? isMyanmar
        ? `Best use: /renew • ${label}`
        : `Best use: /renew • ${label}`
      : isMyanmar
        ? 'Best use: /renew'
        : 'Best use: /renew';
  }

  return offer.couponCode
    ? isMyanmar
      ? `Best use: /buy ${offer.couponCode}`
      : `Best use: /buy ${offer.couponCode}`
    : isMyanmar
      ? 'Best use: /buy'
      : 'Best use: /buy';
}

function resolveTelegramOfferCallbackSource(
  campaignType: string,
): string | null {
  switch (campaignType as TelegramCampaignCouponType) {
    case 'TRIAL_TO_PAID':
      return 'trial_coupon';
    case 'RENEWAL_SOON':
      return 'renewal_coupon';
    case 'PREMIUM_UPSELL':
      return 'premium_upsell_coupon';
    case 'WINBACK':
      return 'winback_coupon';
    default:
      return null;
  }
}

function buildTelegramOffersKeyboard(input: {
  locale: SupportedLocale;
  activeOffers: Array<
    TelegramOfferRecord & {
      accessKeyName?: string | null;
      dynamicKeyName?: string | null;
    }
  >;
  supportLink?: string | null;
}) {
  const ui = getTelegramUi(input.locale);
  const rows: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [];

  for (const offer of input.activeOffers.slice(0, 4)) {
    const callbackSource = resolveTelegramOfferCallbackSource(offer.campaignType);
    if (!callbackSource) {
      continue;
    }

    if (offer.campaignType === 'RENEWAL_SOON') {
      const targetId = offer.dynamicAccessKeyId || offer.accessKeyId;
      const targetLabel = offer.dynamicKeyName || offer.accessKeyName || offer.couponCode;
      if (!targetId) {
        continue;
      }

      const secondary =
        offer.dynamicAccessKeyId ? `dynamic_${callbackSource}` : callbackSource;
      rows.push([
        {
          text:
            input.locale === 'my'
              ? `🔄 ${targetLabel}`
              : `🔄 ${targetLabel}`,
          callback_data: buildTelegramOrderActionCallbackData('ky', targetId, secondary),
        },
      ]);
      continue;
    }

    rows.push([
      {
        text:
          input.locale === 'my'
            ? `🛒 ${offer.couponCode}`
            : `🛒 ${offer.couponCode}`,
        callback_data: buildTelegramOrderActionCallbackData('by', offer.id, callbackSource),
      },
    ]);
  }

  if (input.supportLink) {
    rows.push([{ text: ui.getSupport, url: input.supportLink }]);
  }

  return rows.length > 0 ? { inline_keyboard: rows } : undefined;
}

export async function handleOffersCommand(input: {
  chatId: number;
  telegramUserId: number;
  locale: SupportedLocale;
  botToken: string;
}) {
  const chatIdValue = String(input.chatId);
  const telegramUserIdValue = String(input.telegramUserId);
  const ui = getTelegramUi(input.locale);
  const offers = await db.telegramCouponRedemption.findMany({
    where: {
      OR: [
        { telegramChatId: chatIdValue },
        { telegramUserId: telegramUserIdValue },
      ],
    },
    orderBy: [{ updatedAt: 'desc' }, { issuedAt: 'desc' }],
    take: 12,
  });

  if (offers.length === 0) {
    return input.locale === 'my'
      ? '🎟 <b>Offer wallet</b>\n\nActive promo မရှိသေးပါ။ Trial, renewal, or promo announcements ရရှိသည့်အခါ ဒီနေရာမှာ တစ်နေရာတည်းမှာ ပြသပေးပါမည်။'
      : '🎟 <b>Offer wallet</b>\n\nThere are no active offers yet. Trial, renewal, and promo coupons will appear here in one place.';
  }

  const accessKeyIds = Array.from(
    new Set(offers.map((offer) => offer.accessKeyId).filter((value): value is string => Boolean(value))),
  );
  const dynamicKeyIds = Array.from(
    new Set(
      offers.map((offer) => offer.dynamicAccessKeyId).filter((value): value is string => Boolean(value)),
    ),
  );
  const [accessKeys, dynamicKeys, supportLink] = await Promise.all([
    accessKeyIds.length
      ? db.accessKey.findMany({
          where: { id: { in: accessKeyIds } },
          select: { id: true, name: true },
        })
      : [],
    dynamicKeyIds.length
      ? db.dynamicAccessKey.findMany({
          where: { id: { in: dynamicKeyIds } },
          select: { id: true, name: true },
        })
      : [],
    getTelegramSupportLink(),
  ]);

  const accessKeyNames = new Map(accessKeys.map((key) => [key.id, key.name]));
  const dynamicKeyNames = new Map(dynamicKeys.map((key) => [key.id, key.name]));
  const activeOffers = offers.filter(
    (offer) =>
      offer.status === 'ISSUED' &&
      (!offer.expiresAt || offer.expiresAt.getTime() > Date.now()),
  );
  const usedOffers = offers.filter((offer) => offer.status === 'REDEEMED').slice(0, 3);
  const inactiveOffers = offers.filter(
    (offer) =>
      offer.status === 'EXPIRED' ||
      offer.status === 'CANCELLED' ||
      (offer.status === 'ISSUED' &&
        offer.expiresAt &&
        offer.expiresAt.getTime() <= Date.now()),
  );

  const lines = [
    input.locale === 'my' ? '🎟 <b>Offer wallet</b>' : '🎟 <b>Offer wallet</b>',
    '',
    input.locale === 'my'
      ? `${activeOffers.length} active • ${usedOffers.length} used • ${inactiveOffers.length} unavailable`
      : `${activeOffers.length} active • ${usedOffers.length} used • ${inactiveOffers.length} unavailable`,
    '',
  ];

  if (activeOffers.length > 0) {
    lines.push(input.locale === 'my' ? '<b>Active offers</b>' : '<b>Active offers</b>');
    for (const offer of activeOffers) {
      const offerLabel =
        offer.couponDiscountLabel?.trim() ||
        formatTelegramSalesMoneyAmount(
          offer.couponDiscountAmount,
          offer.currency,
          input.locale,
        );
      const targetLabel =
        offer.dynamicAccessKeyId
          ? dynamicKeyNames.get(offer.dynamicAccessKeyId) || null
          : offer.accessKeyId
            ? accessKeyNames.get(offer.accessKeyId) || null
            : null;
      lines.push(
        `• <b>${escapeHtml(offer.couponCode)}</b> • ${escapeHtml(
          resolveTelegramOfferCampaignLabel(offer.campaignType, input.locale),
        )}`,
        offerLabel ? `  ${escapeHtml(offerLabel)}` : '',
        targetLabel ? `  ${escapeHtml(targetLabel)}` : '',
        `  ${escapeHtml(resolveTelegramOfferActionLine(offer, input.locale, targetLabel))}`,
        offer.expiresAt
          ? `  ${input.locale === 'my' ? 'Expires' : 'Expires'}: ${escapeHtml(
              formatTelegramDateTime(offer.expiresAt, input.locale),
            )}`
          : '',
      );
    }
    lines.push('');
  }

  if (usedOffers.length > 0) {
    lines.push(input.locale === 'my' ? '<b>Used recently</b>' : '<b>Used recently</b>');
    for (const offer of usedOffers) {
      lines.push(
        `• <b>${escapeHtml(offer.couponCode)}</b> • ${escapeHtml(
          resolveTelegramOfferCampaignLabel(offer.campaignType, input.locale),
        )}`,
        `  ${input.locale === 'my' ? 'Used on' : 'Used on'}: <b>${escapeHtml(
          offer.redeemedOrderCode || 'Order',
        )}</b>`,
        offer.redeemedAt
          ? `  ${escapeHtml(formatTelegramDateTime(offer.redeemedAt, input.locale))}`
          : '',
      );
    }
    lines.push('');
  }

  if (inactiveOffers.length > 0) {
    lines.push(input.locale === 'my' ? '<b>Unavailable now</b>' : '<b>Unavailable now</b>');
    for (const offer of inactiveOffers.slice(0, 3)) {
      lines.push(
        `• <b>${escapeHtml(offer.couponCode)}</b> • ${escapeHtml(
          resolveTelegramOfferStatusLabel(offer, input.locale),
        )}`,
      );
    }
    lines.push('');
  }

  lines.push(
    input.locale === 'my'
      ? 'Tip: renewal offer များကို key တစ်ခုချင်းစီအတွက် ပေးထားပြီး promo/win-back offer များကို /buy COUPON-CODE ဖြင့် စတင်နိုင်ပါသည်။'
      : 'Tip: renewal offers are tied to a specific key, while promo and win-back offers can start with /buy COUPON-CODE.',
  );

  const message = lines.join('\n');
  const sent = await sendTelegramMessage(input.botToken, input.chatId, message, {
    replyMarkup: buildTelegramOffersKeyboard({
      locale: input.locale,
      activeOffers: activeOffers.map((offer) => ({
        ...offer,
        accessKeyName: offer.accessKeyId ? accessKeyNames.get(offer.accessKeyId) || null : null,
        dynamicKeyName: offer.dynamicAccessKeyId
          ? dynamicKeyNames.get(offer.dynamicAccessKeyId) || null
          : null,
      })),
      supportLink,
    }),
  });

  return sent ? null : message;
}
