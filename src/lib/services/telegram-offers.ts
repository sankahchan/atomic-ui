import { db } from '@/lib/db';
import type { SupportedLocale } from '@/lib/i18n/config';
import {
  formatTelegramSalesMoneyAmount,
  type TelegramCampaignCouponType,
} from '@/lib/services/telegram-coupons';
import {
  buildTelegramMenuCallbackData,
  buildTelegramOrderActionCallbackData,
} from '@/lib/services/telegram-callbacks';
import {
  getTelegramSupportLink,
  sendTelegramMessage,
  sendTelegramPhotoUrl,
} from '@/lib/services/telegram-runtime';
import { getTelegramBrandMediaUrl } from '@/lib/services/telegram-branding';
import { escapeHtml, formatTelegramDateTime, getTelegramUi } from '@/lib/services/telegram-ui';

type TelegramOfferRecord = Awaited<
  ReturnType<typeof db.telegramCouponRedemption.findMany>
>[number];

type TelegramOffersFilter = 'ALL' | 'ACTIVE' | 'USED' | 'UNAVAILABLE';

function parseTelegramOffersFilter(argsText?: string | null): TelegramOffersFilter {
  const normalized = argsText?.trim().toLowerCase() || '';
  switch (normalized) {
    case 'active':
      return 'ACTIVE';
    case 'used':
      return 'USED';
    case 'unavailable':
    case 'expired':
    case 'revoked':
      return 'UNAVAILABLE';
    default:
      return 'ALL';
  }
}

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

function resolveTelegramOfferUnavailableReason(
  offer: TelegramOfferRecord,
  locale: SupportedLocale,
) {
  const isMyanmar = locale === 'my';
  if (offer.status === 'REDEEMED') {
    return offer.redeemedOrderCode
      ? isMyanmar
        ? `Used on ${offer.redeemedOrderCode}`
        : `Used on ${offer.redeemedOrderCode}`
      : isMyanmar
        ? 'Already used on an order'
        : 'Already used on an order';
  }
  if (offer.status === 'CANCELLED') {
    return isMyanmar ? 'Revoked by admin or campaign rules' : 'Revoked by admin or campaign rules';
  }
  if (offer.expiresAt && offer.expiresAt.getTime() <= Date.now()) {
    return isMyanmar
      ? `Expired at ${formatTelegramDateTime(offer.expiresAt, locale)}`
      : `Expired at ${formatTelegramDateTime(offer.expiresAt, locale)}`;
  }
  return isMyanmar ? 'Not available for use right now' : 'Not available for use right now';
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

function resolveTelegramOfferUseWithLabel(
  offer: TelegramOfferRecord,
  locale: SupportedLocale,
) {
  const isMyanmar = locale === 'my';
  return offer.campaignType === 'RENEWAL_SOON'
    ? isMyanmar
      ? 'Use with: Renew'
      : 'Use with: Renew'
    : isMyanmar
      ? 'Use with: Buy key'
      : 'Use with: Buy key';
}

function resolveTelegramOfferBestForLabel(
  offer: TelegramOfferRecord,
  locale: SupportedLocale,
) {
  const isMyanmar = locale === 'my';
  switch (offer.campaignType) {
    case 'TRIAL_TO_PAID':
      return isMyanmar ? 'Best for: your first paid order' : 'Best for: your first paid order';
    case 'RENEWAL_SOON':
      return isMyanmar ? 'Best for: extending your current key' : 'Best for: extending your current key';
    case 'PREMIUM_UPSELL':
      return isMyanmar ? 'Best for: upgrading to Premium' : 'Best for: upgrading to Premium';
    case 'WINBACK':
      return isMyanmar ? 'Best for: returning after inactivity' : 'Best for: returning after inactivity';
    default:
      return isMyanmar ? 'Best for: your next checkout' : 'Best for: your next checkout';
  }
}

function resolveTelegramOfferJourneyLabel(
  offer: TelegramOfferRecord,
  locale: SupportedLocale,
) {
  const isMyanmar = locale === 'my';
  switch (offer.campaignType) {
    case 'TRIAL_TO_PAID':
      return isMyanmar
        ? 'Journey: trial reminder → first paid order'
        : 'Journey: trial reminder -> first paid order';
    case 'RENEWAL_SOON':
      return isMyanmar
        ? 'Journey: renewal reminder → extend current key'
        : 'Journey: renewal reminder -> extend current key';
    case 'PREMIUM_UPSELL':
      return isMyanmar
        ? 'Journey: high usage → premium upgrade'
        : 'Journey: high usage -> premium upgrade';
    case 'WINBACK':
      return isMyanmar
        ? 'Journey: inactive user → welcome-back checkout'
        : 'Journey: inactive user -> welcome-back checkout';
    default:
      return isMyanmar
        ? 'Journey: offer → checkout'
        : 'Journey: offer -> checkout';
  }
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
  filter: TelegramOffersFilter;
  activeOffers: Array<
    TelegramOfferRecord & {
      accessKeyName?: string | null;
      dynamicKeyName?: string | null;
    }
  >;
  supportLink?: string | null;
}) {
  const ui = getTelegramUi(input.locale);
  const isMyanmar = input.locale === 'my';
  const rows: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [];
  const filterChip = (filter: TelegramOffersFilter, label: string) => ({
    text: input.filter === filter ? `• ${label}` : label,
    callback_data: buildTelegramMenuCallbackData('offers', filter.toLowerCase()),
  });

  rows.push([
    filterChip('ALL', isMyanmar ? 'အားလုံး' : 'All'),
    filterChip('ACTIVE', isMyanmar ? 'အသုံးပြုရန်' : 'Active'),
    filterChip('USED', isMyanmar ? 'သုံးပြီး' : 'Used'),
    filterChip('UNAVAILABLE', isMyanmar ? 'မရနိုင်' : 'Unavailable'),
  ]);

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
              ? `🔄 Renew • ${targetLabel}`
              : `🔄 Renew • ${targetLabel}`,
          callback_data: buildTelegramOrderActionCallbackData('ky', targetId, secondary),
        },
      ]);
      continue;
    }

    rows.push([
      {
        text:
          input.locale === 'my'
            ? `🛒 Buy • ${offer.couponCode}`
            : `🛒 Buy • ${offer.couponCode}`,
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
  argsText?: string;
}) {
  const chatIdValue = String(input.chatId);
  const telegramUserIdValue = String(input.telegramUserId);
  const ui = getTelegramUi(input.locale);
  const filter = parseTelegramOffersFilter(input.argsText);
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

  if (offers.length === 0) {
    const emptyMessage = input.locale === 'my'
      ? '🎟 <b>Offer wallet</b>\n\nActive promo မရှိသေးပါ။ Trial, renewal, or promo announcements ရရှိသည့်အခါ ဒီနေရာမှာ တစ်နေရာတည်းမှာ ပြသပေးပါမည်။'
      : '🎟 <b>Offer wallet</b>\n\nThere are no active offers yet. Trial, renewal, and promo coupons will appear here in one place.';
    const sent = await sendTelegramMessage(input.botToken, input.chatId, emptyMessage, {
      replyMarkup: buildTelegramOffersKeyboard({
        locale: input.locale,
        filter,
        activeOffers: [],
        supportLink,
      }),
    });
    return sent ? null : emptyMessage;
  }

  const lines = [
    input.locale === 'my' ? '🎟 <b>Offer wallet</b>' : '🎟 <b>Offer wallet</b>',
    '',
    input.locale === 'my'
      ? `${activeOffers.length} active • ${usedOffers.length} used • ${inactiveOffers.length} unavailable`
      : `${activeOffers.length} active • ${usedOffers.length} used • ${inactiveOffers.length} unavailable`,
    '',
  ];

  await sendTelegramPhotoUrl(
    input.botToken,
    input.chatId,
    getTelegramBrandMediaUrl('offersWallet'),
    [
      input.locale === 'my' ? '🎟 <b>Offer wallet</b>' : '🎟 <b>Offer wallet</b>',
      '',
      input.locale === 'my'
        ? `${activeOffers.length} active • ${usedOffers.length} used • ${inactiveOffers.length} unavailable`
        : `${activeOffers.length} active • ${usedOffers.length} used • ${inactiveOffers.length} unavailable`,
      activeOffers[0]?.couponCode
        ? `${input.locale === 'my' ? 'Live now' : 'Live now'}: <b>${escapeHtml(activeOffers[0].couponCode)}</b>`
        : '',
      input.locale === 'my'
        ? 'Atomic-UI offers • buy, renew, win-back, premium upgrade'
        : 'Atomic-UI offers • buy, renew, win-back, premium upgrade',
    ]
      .filter(Boolean)
      .join('\n'),
  );

  if ((filter === 'ALL' || filter === 'ACTIVE') && activeOffers.length > 0) {
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
      const useNowLabel =
        offer.campaignType === 'RENEWAL_SOON'
          ? input.locale === 'my'
            ? 'Tap the renew button below to use this offer.'
            : 'Tap the renew button below to use this offer.'
          : offer.couponCode
            ? input.locale === 'my'
              ? `Tap the buy button below or use /buy ${offer.couponCode}.`
              : `Tap the buy button below or use /buy ${offer.couponCode}.`
            : input.locale === 'my'
              ? 'Tap the action button below to continue with this offer.'
              : 'Tap the action button below to continue with this offer.';
      lines.push(
        `• 🎟 <b>${escapeHtml(offer.couponCode)}</b> • <b>${escapeHtml(resolveTelegramOfferStatusLabel(offer, input.locale))}</b>`,
        `  ${input.locale === 'my' ? 'Campaign' : 'Campaign'}: <b>${escapeHtml(
          resolveTelegramOfferCampaignLabel(offer.campaignType, input.locale),
        )}</b>`,
        offerLabel ? `  ${input.locale === 'my' ? 'Offer' : 'Offer'}: <b>${escapeHtml(offerLabel)}</b>` : '',
        targetLabel ? `  ${input.locale === 'my' ? 'For' : 'For'}: <b>${escapeHtml(targetLabel)}</b>` : '',
        `  ${escapeHtml(resolveTelegramOfferUseWithLabel(offer, input.locale))}`,
        `  ${escapeHtml(resolveTelegramOfferBestForLabel(offer, input.locale))}`,
        `  ${escapeHtml(resolveTelegramOfferJourneyLabel(offer, input.locale))}`,
        `  ${input.locale === 'my' ? 'Availability' : 'Availability'}: <b>${escapeHtml(resolveTelegramOfferStatusLabel(offer, input.locale))}</b>`,
        `  ${escapeHtml(resolveTelegramOfferActionLine(offer, input.locale, targetLabel))}`,
        `  ${escapeHtml(useNowLabel)}`,
        offer.expiresAt
          ? `  ${input.locale === 'my' ? 'Expires' : 'Expires'}: ${escapeHtml(
              formatTelegramDateTime(offer.expiresAt, input.locale),
            )}`
          : '',
      );
    }
    lines.push('');
  } else if (filter === 'ACTIVE') {
    lines.push(
      input.locale === 'my'
        ? '📭 လက်ရှိ အသုံးပြုနိုင်သော offer မရှိသေးပါ။'
        : '📭 There are no active offers right now.',
      '',
    );
  }

  if ((filter === 'ALL' || filter === 'USED') && usedOffers.length > 0) {
    lines.push(input.locale === 'my' ? '<b>Used recently</b>' : '<b>Used recently</b>');
    for (const offer of usedOffers) {
      lines.push(
        `• 🎟 <b>${escapeHtml(offer.couponCode)}</b> • <b>${escapeHtml(resolveTelegramOfferStatusLabel(offer, input.locale))}</b>`,
        `  ${input.locale === 'my' ? 'Campaign' : 'Campaign'}: <b>${escapeHtml(resolveTelegramOfferCampaignLabel(offer.campaignType, input.locale))}</b>`,
        `  ${input.locale === 'my' ? 'Used on' : 'Used on'}: <b>${escapeHtml(
          offer.redeemedOrderCode || 'Order',
        )}</b>`,
        offer.redeemedAt
          ? `  ${escapeHtml(formatTelegramDateTime(offer.redeemedAt, input.locale))}`
          : '',
      );
    }
    lines.push('');
  } else if (filter === 'USED') {
    lines.push(
      input.locale === 'my'
        ? '📭 မကြာသေးမီက အသုံးပြုပြီးသော offer မရှိသေးပါ။'
        : '📭 There are no recently used offers yet.',
      '',
    );
  }

  if ((filter === 'ALL' || filter === 'UNAVAILABLE') && inactiveOffers.length > 0) {
    lines.push(input.locale === 'my' ? '<b>Unavailable now</b>' : '<b>Unavailable now</b>');
    for (const offer of inactiveOffers.slice(0, 3)) {
      lines.push(
        `• 🎟 <b>${escapeHtml(offer.couponCode)}</b> • <b>${escapeHtml(resolveTelegramOfferStatusLabel(offer, input.locale))}</b>`,
        `  ${input.locale === 'my' ? 'Campaign' : 'Campaign'}: <b>${escapeHtml(resolveTelegramOfferCampaignLabel(offer.campaignType, input.locale))}</b>`,
        `  ${escapeHtml(resolveTelegramOfferUseWithLabel(offer, input.locale))}`,
        `  ${escapeHtml(resolveTelegramOfferBestForLabel(offer, input.locale))}`,
        `  ${escapeHtml(resolveTelegramOfferJourneyLabel(offer, input.locale))}`,
        `  ${escapeHtml(resolveTelegramOfferUnavailableReason(offer, input.locale))}`,
      );
    }
    lines.push('');
  } else if (filter === 'UNAVAILABLE') {
    lines.push(
      input.locale === 'my'
        ? '📭 လက်ရှိ unavailable offer မရှိသေးပါ။'
        : '📭 There are no unavailable offers right now.',
      '',
    );
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
      filter,
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
