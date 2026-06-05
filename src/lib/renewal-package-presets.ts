import { coerceSupportedLocale, defaultLocale } from '@/lib/i18n/config';
import {
  resolveTelegramSalesPlanLabel,
  resolveTelegramSalesPriceLabel,
  type TelegramSalesPlanCode,
  type TelegramSalesSettings,
} from '@/lib/services/telegram-sales';

export type RenewalPackagePreset = {
  code: TelegramSalesPlanCode;
  label: string;
  priceLabel: string | null;
  months: 1 | 2 | 3;
  dataLimitGB: number;
  badge: 'Popular' | 'Best Deal' | null;
};

export function resolveAccessKeyRenewalPresets(
  settings: TelegramSalesSettings,
  locale?: string | null,
): RenewalPackagePreset[] {
  const resolvedLocale = coerceSupportedLocale(locale) ?? defaultLocale;

  return settings.plans.flatMap((plan) => {
    if (!plan.enabled || plan.deliveryType !== 'ACCESS_KEY') {
      return [];
    }

    if (
      typeof plan.fixedDurationMonths !== 'number'
      || !Number.isFinite(plan.fixedDurationMonths)
      || plan.fixedDurationMonths < 1
      || plan.fixedDurationMonths > 3
    ) {
      return [];
    }

    if (
      typeof plan.dataLimitGB !== 'number'
      || !Number.isFinite(plan.dataLimitGB)
      || plan.dataLimitGB <= 0
    ) {
      return [];
    }

    return [{
      code: plan.code,
      label: resolveTelegramSalesPlanLabel(plan, resolvedLocale),
      priceLabel: resolveTelegramSalesPriceLabel(plan, resolvedLocale).trim() || null,
      months: plan.fixedDurationMonths as 1 | 2 | 3,
      dataLimitGB: plan.dataLimitGB,
      badge:
        plan.badge === 'Popular' || plan.badge === 'Best Deal'
          ? plan.badge
          : null,
    }];
  });
}
