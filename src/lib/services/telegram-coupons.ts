import { db } from '@/lib/db';
import type { SupportedLocale } from '@/lib/i18n/config';
import {
  resolveTelegramSalesPlanLabel,
  resolveTelegramSalesPriceLabel,
  type TelegramSalesPlan,
} from '@/lib/services/telegram-sales';

export type TelegramCampaignCouponType =
  | 'TRIAL_TO_PAID'
  | 'RENEWAL_SOON'
  | 'PREMIUM_UPSELL'
  | 'WINBACK';

export type TelegramCampaignCouponSource =
  | 'trial_coupon'
  | 'renewal_coupon'
  | 'premium_upsell_coupon'
  | 'winback_coupon';

export type TelegramCampaignCouponConfig = {
  campaignType: TelegramCampaignCouponType;
  source: TelegramCampaignCouponSource;
  enabled: boolean;
  couponCode: string;
  discountLabel: string;
  discountAmount: number;
};

export function getTelegramCampaignCouponTypeFromSource(
  source?: string | null,
): TelegramCampaignCouponType | null {
  switch (source) {
    case 'trial_coupon':
      return 'TRIAL_TO_PAID';
    case 'renewal_coupon':
      return 'RENEWAL_SOON';
    case 'premium_upsell_coupon':
      return 'PREMIUM_UPSELL';
    case 'winback_coupon':
      return 'WINBACK';
    default:
      return null;
  }
}

export function formatTelegramSalesMoneyAmount(
  amount: number | null | undefined,
  currency: string | null | undefined,
  locale: SupportedLocale,
) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    return '';
  }

  const normalizedCurrency = (currency || 'MMK').trim().toUpperCase();
  const formatted = new Intl.NumberFormat(locale === 'my' ? 'my-MM' : 'en-US').format(amount);

  switch (normalizedCurrency) {
    case 'MMK':
      return locale === 'my' ? `${formatted} ကျပ်` : `${formatted} Kyat`;
    case 'USD':
      return locale === 'my' ? `${formatted} ဒေါ်လာ` : `$${formatted}`;
    case 'THB':
      return locale === 'my' ? `${formatted} ဘတ်` : `${formatted} Baht`;
    default:
      return `${formatted} ${normalizedCurrency}`;
  }
}

export function buildTelegramCouponAdjustedPlanSnapshot(input: {
  plan: TelegramSalesPlan;
  locale: SupportedLocale;
  durationMonths?: number | null;
  durationDays?: number | null;
  couponCampaignType?: string | null;
  couponCode?: string | null;
  couponDiscountAmount?: number | null;
  couponDiscountLabel?: string | null;
}) {
  const durationMonths =
    input.durationMonths ??
    input.plan.fixedDurationMonths ??
    input.plan.minDurationMonths ??
    null;
  const durationDays = input.durationDays ?? input.plan.fixedDurationDays ?? null;
  const basePriceAmount =
    typeof input.plan.priceAmount === 'number' && Number.isFinite(input.plan.priceAmount)
      ? input.plan.priceAmount
      : null;
  const currency = (input.plan.priceCurrency || 'MMK').trim().toUpperCase();
  const couponCode = input.couponCode?.trim() || null;
  const couponCampaignType = input.couponCampaignType?.trim() || null;
  const discountAmount =
    couponCode && typeof input.couponDiscountAmount === 'number' && input.couponDiscountAmount > 0
      ? Math.max(0, Math.floor(input.couponDiscountAmount))
      : 0;

  const originalPriceAmount =
    typeof basePriceAmount === 'number' && basePriceAmount > 0 ? basePriceAmount : null;
  const finalPriceAmount =
    typeof originalPriceAmount === 'number'
      ? Math.max(0, originalPriceAmount - discountAmount)
      : basePriceAmount;

  const planForPricing: TelegramSalesPlan = {
    ...input.plan,
    priceAmount: finalPriceAmount,
  };
  const priceLabel =
    finalPriceAmount !== null
      ? resolveTelegramSalesPriceLabel(planForPricing, input.locale)
      : resolveTelegramSalesPriceLabel(input.plan, input.locale);
  const planLabel = resolveTelegramSalesPlanLabel(input.plan, input.locale);

  return {
    planCode: input.plan.code,
    planName: priceLabel ? `${planLabel} (${priceLabel})` : planLabel,
    priceAmount: finalPriceAmount ?? null,
    priceCurrency: currency,
    priceLabel: priceLabel || null,
    originalPriceAmount,
    couponCampaignType,
    couponCode,
    couponDiscountAmount: discountAmount > 0 ? discountAmount : null,
    couponDiscountLabel: couponCode ? input.couponDiscountLabel?.trim() || null : null,
    deliveryType: input.plan.deliveryType,
    templateId: input.plan.deliveryType === 'ACCESS_KEY' ? input.plan.templateId || null : null,
    dynamicTemplateId:
      input.plan.deliveryType === 'DYNAMIC_KEY' ? input.plan.dynamicTemplateId || null : null,
    durationMonths,
    durationDays,
    dataLimitBytes: input.plan.unlimitedQuota
      ? null
      : input.plan.dataLimitGB
        ? BigInt(input.plan.dataLimitGB) * BigInt(1024 * 1024 * 1024)
        : null,
    unlimitedQuota: input.plan.unlimitedQuota,
  };
}

export async function issueTelegramCampaignCoupon(input: {
  campaignType: TelegramCampaignCouponType;
  couponCode: string;
  couponDiscountAmount: number;
  couponDiscountLabel?: string | null;
  currency?: string | null;
  telegramChatId: string;
  telegramUserId: string;
  accessKeyId?: string | null;
  dynamicAccessKeyId?: string | null;
  expiresAt?: Date | null;
}) {
  const normalizedCode = input.couponCode.trim().toUpperCase();
  if (!normalizedCode) {
    return null;
  }

  const now = new Date();
  const activeExisting = await db.telegramCouponRedemption.findFirst({
    where: {
      campaignType: input.campaignType,
      couponCode: normalizedCode,
      telegramChatId: input.telegramChatId,
      telegramUserId: input.telegramUserId,
      accessKeyId: input.accessKeyId ?? null,
      dynamicAccessKeyId: input.dynamicAccessKeyId ?? null,
      status: 'ISSUED',
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: [{ createdAt: 'desc' }],
  });

  if (activeExisting) {
    return { coupon: activeExisting, created: false as const };
  }

  const alreadyRedeemed = await db.telegramCouponRedemption.count({
    where: {
      couponCode: normalizedCode,
      telegramUserId: input.telegramUserId,
      status: 'REDEEMED',
    },
  });

  if (alreadyRedeemed > 0) {
    return null;
  }

  const coupon = await db.telegramCouponRedemption.create({
    data: {
      campaignType: input.campaignType,
      couponCode: normalizedCode,
      couponDiscountAmount: Math.max(0, Math.floor(input.couponDiscountAmount)),
      couponDiscountLabel: input.couponDiscountLabel?.trim() || null,
      currency: (input.currency || 'MMK').trim().toUpperCase(),
      telegramChatId: input.telegramChatId,
      telegramUserId: input.telegramUserId,
      accessKeyId: input.accessKeyId ?? null,
      dynamicAccessKeyId: input.dynamicAccessKeyId ?? null,
      status: 'ISSUED',
      expiresAt: input.expiresAt ?? null,
    },
  });

  return { coupon, created: true as const };
}

export async function findTelegramApplicableCoupon(input: {
  telegramChatId: string;
  telegramUserId: string;
  source?: string | null;
  couponCode?: string | null;
  accessKeyId?: string | null;
  dynamicAccessKeyId?: string | null;
}) {
  const now = new Date();
  const sourceCampaignType = getTelegramCampaignCouponTypeFromSource(input.source);
  const normalizedCouponCode = input.couponCode?.trim().toUpperCase() || null;
  const candidates = await db.telegramCouponRedemption.findMany({
    where: {
      telegramChatId: input.telegramChatId,
      telegramUserId: input.telegramUserId,
      status: 'ISSUED',
      ...(normalizedCouponCode ? { couponCode: normalizedCouponCode } : {}),
      ...(sourceCampaignType ? { campaignType: sourceCampaignType } : {}),
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: [{ issuedAt: 'desc' }],
    take: 20,
  });

  return (
    candidates.find((coupon) => {
      if (input.accessKeyId && coupon.accessKeyId && coupon.accessKeyId !== input.accessKeyId) {
        return false;
      }
      if (
        input.dynamicAccessKeyId &&
        coupon.dynamicAccessKeyId &&
        coupon.dynamicAccessKeyId !== input.dynamicAccessKeyId
      ) {
        return false;
      }
      return true;
    }) || null
  );
}

export async function expireTelegramCoupons(now = new Date()) {
  const result = await db.telegramCouponRedemption.updateMany({
    where: {
      status: 'ISSUED',
      expiresAt: {
        not: null,
        lte: now,
      },
    },
    data: {
      status: 'EXPIRED',
    },
  });

  return result.count;
}

export async function redeemTelegramCouponForOrder(input: {
  telegramOrderId: string;
  telegramUserId: string;
  telegramChatId: string;
  couponCode?: string | null;
  orderCode: string;
}) {
  const normalizedCouponCode = input.couponCode?.trim().toUpperCase();
  if (!normalizedCouponCode) {
    return null;
  }

  const issuedCoupon = await db.telegramCouponRedemption.findFirst({
    where: {
      telegramUserId: input.telegramUserId,
      telegramChatId: input.telegramChatId,
      couponCode: normalizedCouponCode,
      status: 'ISSUED',
    },
    orderBy: [{ issuedAt: 'desc' }],
  });

  if (!issuedCoupon) {
    return null;
  }

  return db.telegramCouponRedemption.update({
    where: { id: issuedCoupon.id },
    data: {
      status: 'REDEEMED',
      redeemedAt: new Date(),
      redeemedOrderId: input.telegramOrderId,
      redeemedOrderCode: input.orderCode,
    },
  });
}

export async function cancelTelegramCouponForOrder(input: {
  telegramUserId: string;
  telegramChatId: string;
  couponCode?: string | null;
}) {
  const normalizedCouponCode = input.couponCode?.trim().toUpperCase();
  if (!normalizedCouponCode) {
    return 0;
  }

  const result = await db.telegramCouponRedemption.updateMany({
    where: {
      telegramUserId: input.telegramUserId,
      telegramChatId: input.telegramChatId,
      couponCode: normalizedCouponCode,
      status: 'ISSUED',
    },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
    },
  });

  return result.count;
}
