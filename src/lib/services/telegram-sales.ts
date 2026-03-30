import { z } from 'zod';
import { db } from '@/lib/db';
import type { SupportedLocale } from '@/lib/i18n/config';
import { coerceSupportedLocale } from '@/lib/i18n/config';
import {
  normalizeLocalizedTemplateMap,
  resolveLocalizedTemplate,
  type LocalizedTemplateMap,
} from '@/lib/localized-templates';
import { generateRandomString } from '@/lib/utils';

export const TELEGRAM_SALES_SETTING_KEY = 'telegram_sales';

export const telegramSalesPlanCodeSchema = z.enum([
  'trial_1d_3gb',
  '1m_150gb',
  '2m_300gb',
  '3plus_unlimited',
]);

export const telegramSalesPlanSchema = z.object({
  code: telegramSalesPlanCodeSchema,
  enabled: z.boolean().default(true),
  label: z.string().min(1).max(80),
  localizedLabels: z.record(z.string(), z.string()).optional().default({}),
  priceAmount: z.number().int().nonnegative().optional().nullable(),
  priceCurrency: z.string().trim().min(1).max(16).optional().default('MMK'),
  priceLabel: z.string().max(120).optional().default(''),
  localizedPriceLabels: z.record(z.string(), z.string()).optional().default({}),
  deliveryType: z.enum(['ACCESS_KEY', 'DYNAMIC_KEY']).default('ACCESS_KEY'),
  templateId: z.string().optional().nullable(),
  dynamicTemplateId: z.string().optional().nullable(),
  fixedDurationDays: z.number().int().min(1).max(365).optional().nullable(),
  fixedDurationMonths: z.number().int().min(1).max(24).optional().nullable(),
  minDurationMonths: z.number().int().min(1).max(24).optional().nullable(),
  dataLimitGB: z.number().int().positive().optional().nullable(),
  unlimitedQuota: z.boolean().default(false),
});

export const telegramSalesPaymentMethodSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(/^[a-z0-9_]+$/i),
  enabled: z.boolean().default(true),
  label: z.string().min(1).max(80),
  localizedLabels: z.record(z.string(), z.string()).optional().default({}),
  accountName: z.string().max(120).optional().default(''),
  accountNumber: z.string().max(160).optional().default(''),
  imageUrl: z.string().trim().max(1000).optional().default(''),
  note: z.string().max(240).optional().default(''),
  localizedNotes: z.record(z.string(), z.string()).optional().default({}),
});

export const telegramSalesSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  allowRenewals: z.boolean().default(true),
  supportLink: z.string().trim().max(500).optional().default(''),
  paymentReminderHours: z.number().int().min(1).max(168).default(3),
  pendingReviewReminderHours: z.number().int().min(1).max(168).default(6),
  unpaidOrderExpiryHours: z.number().int().min(1).max(720).default(24),
  paymentInstructions: z.string().max(2000).optional().default(''),
  localizedPaymentInstructions: z.record(z.string(), z.string()).optional().default({}),
  paymentMethods: z.array(telegramSalesPaymentMethodSchema).default([]),
  plans: z.array(telegramSalesPlanSchema).default([]),
});

export type TelegramSalesPlanCode = z.infer<typeof telegramSalesPlanCodeSchema>;
export type TelegramSalesPlan = z.infer<typeof telegramSalesPlanSchema>;
export type TelegramSalesPaymentMethod = z.infer<typeof telegramSalesPaymentMethodSchema>;
export type TelegramSalesSettings = z.infer<typeof telegramSalesSettingsSchema>;

export const TELEGRAM_ORDER_ACTIVE_STATUSES = [
  'AWAITING_KEY_SELECTION',
  'AWAITING_PLAN',
  'AWAITING_MONTHS',
  'AWAITING_SERVER_SELECTION',
  'AWAITING_KEY_NAME',
  'AWAITING_PAYMENT_METHOD',
  'AWAITING_PAYMENT_PROOF',
  'PENDING_REVIEW',
  'APPROVED',
] as const;

export const TELEGRAM_ORDER_TERMINAL_STATUSES = [
  'FULFILLED',
  'REJECTED',
  'CANCELLED',
] as const;

export type TelegramOrderActiveStatus = (typeof TELEGRAM_ORDER_ACTIVE_STATUSES)[number];
export type TelegramOrderTerminalStatus = (typeof TELEGRAM_ORDER_TERMINAL_STATUSES)[number];

export const TELEGRAM_REJECTION_REASON_PRESETS = [
  {
    code: 'proof_unclear',
    labels: {
      en: 'Screenshot unclear',
      my: 'Screenshot မရှင်းလင်း',
    },
    customerMessages: {
      en: 'The payment screenshot is not clear enough to verify. Please send a clearer screenshot that shows the amount, account, and transfer time.',
      my: 'Payment screenshot ကို အတည်ပြုရန် မရှင်းလင်းသေးပါ။ Amount, account နှင့် transfer time ကို ရှင်းလင်းစွာ မြင်ရသော screenshot အသစ်တစ်ခု ပြန်ပို့ပေးပါ။',
    },
  },
  {
    code: 'amount_mismatch',
    labels: {
      en: 'Amount mismatch',
      my: 'ငွေပမာဏ မကိုက်ညီ',
    },
    customerMessages: {
      en: 'The payment amount does not match the selected plan. Please contact support or send a corrected payment screenshot.',
      my: 'ငွေပေးချေထားသော amount သည် ရွေးထားသော plan နှင့် မကိုက်ညီပါ။ Support ကို ဆက်သွယ်ပါ သို့မဟုတ် မှန်ကန်သော payment screenshot ကို ပြန်ပို့ပေးပါ။',
    },
  },
  {
    code: 'wrong_payment_method',
    labels: {
      en: 'Wrong payment method',
      my: 'ငွေပေးချေမှုနည်းလမ်း မမှန်',
    },
    customerMessages: {
      en: 'The screenshot does not match the selected payment method. Please switch the payment method or upload the correct screenshot.',
      my: 'Screenshot သည် ရွေးထားသော payment method နှင့် မကိုက်ညီပါ။ Payment method ကို ပြောင်းပါ သို့မဟုတ် မှန်ကန်သော screenshot ကို တင်ပေးပါ။',
    },
  },
  {
    code: 'duplicate_payment',
    labels: {
      en: 'Duplicate payment proof',
      my: 'Duplicate payment proof',
    },
    customerMessages: {
      en: 'This payment proof appears to have been used before. Please contact support for manual review.',
      my: 'ဤ payment proof ကို ယခင်က အသုံးပြုထားသည့်ပုံစံ တွေ့ရပါသည်။ Manual review အတွက် support ကို ဆက်သွယ်ပါ။',
    },
  },
  {
    code: 'manual_review_required',
    labels: {
      en: 'Needs manual review',
      my: 'Manual review လိုအပ်',
    },
    customerMessages: {
      en: 'We need a little more time to review this payment. Please contact support for follow-up on this order.',
      my: 'ဤ payment ကို စစ်ဆေးရန် အချိန်ပိုလိုအပ်ပါသည်။ ဤ order အတွက် နောက်ဆက်တွဲအခြေအနေကို support နှင့် ဆက်သွယ်ပေးပါ။',
    },
  },
] as const;

export type TelegramRejectionReasonCode =
  (typeof TELEGRAM_REJECTION_REASON_PRESETS)[number]['code'];

export function getTelegramRejectionReasonPreset(code?: string | null) {
  if (!code) {
    return null;
  }

  return TELEGRAM_REJECTION_REASON_PRESETS.find((preset) => preset.code === code) || null;
}

export function resolveTelegramRejectionReasonLabel(
  code: string | null | undefined,
  locale: SupportedLocale,
) {
  const preset = getTelegramRejectionReasonPreset(code);
  if (preset) {
    return locale === 'my' ? preset.labels.my : preset.labels.en;
  }

  if (!code) {
    return locale === 'my' ? 'Custom reason' : 'Custom reason';
  }

  const normalized = code.replaceAll('_', ' ').trim();
  if (!normalized) {
    return locale === 'my' ? 'Custom reason' : 'Custom reason';
  }

  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

export function resolveTelegramRejectionReasonMessage(
  code: string | null | undefined,
  locale: SupportedLocale,
) {
  const preset = getTelegramRejectionReasonPreset(code);
  if (!preset) {
    return '';
  }

  return locale === 'my' ? preset.customerMessages.my : preset.customerMessages.en;
}

const DEFAULT_PAYMENT_INSTRUCTIONS_EN =
  'After payment, send the payment screenshot here as a photo or document. Please make sure the amount, transfer ID, and payment time are visible. Your order will stay pending until an admin approves it.';
const DEFAULT_PAYMENT_INSTRUCTIONS_MY =
  'ငွေပေးချေပြီးပါက payment screenshot ကို ဤ chat ထဲသို့ photo သို့မဟုတ် document အဖြစ် ပို့ပေးပါ။ Amount, transfer ID နှင့် အချိန်ကို ရှင်းလင်းစွာ မြင်ရပါမည်။ Admin အတည်ပြုပြီးမှ key ကို ထုတ်ပေးပါမည်။';

function defaultPlans(): TelegramSalesPlan[] {
  return [
    {
      code: 'trial_1d_3gb',
      enabled: true,
      label: 'Free Trial / 1 Day / 3 GB',
      localizedLabels: { my: 'Free Trial / ၁ ရက် / 3 GB' },
      priceAmount: 0,
      priceCurrency: 'MMK',
      priceLabel: 'Free Trial',
      localizedPriceLabels: {
        en: 'Free Trial',
        my: 'အခမဲ့ အစမ်းသုံး',
      },
      deliveryType: 'ACCESS_KEY',
      templateId: null,
      dynamicTemplateId: null,
      fixedDurationDays: 1,
      fixedDurationMonths: null,
      minDurationMonths: null,
      dataLimitGB: 3,
      unlimitedQuota: false,
    },
    {
      code: '1m_150gb',
      enabled: true,
      label: '1 Month / 150 GB',
      localizedLabels: { my: '၁ လ / 150 GB' },
      priceAmount: 5000,
      priceCurrency: 'MMK',
      priceLabel: '',
      localizedPriceLabels: {},
      deliveryType: 'ACCESS_KEY',
      templateId: null,
      dynamicTemplateId: null,
      fixedDurationDays: null,
      fixedDurationMonths: 1,
      minDurationMonths: null,
      dataLimitGB: 150,
      unlimitedQuota: false,
    },
    {
      code: '2m_300gb',
      enabled: true,
      label: '2 Months / 300 GB',
      localizedLabels: { my: '၂ လ / 300 GB' },
      priceAmount: null,
      priceCurrency: 'MMK',
      priceLabel: '',
      localizedPriceLabels: {},
      deliveryType: 'ACCESS_KEY',
      templateId: null,
      dynamicTemplateId: null,
      fixedDurationDays: null,
      fixedDurationMonths: 2,
      minDurationMonths: null,
      dataLimitGB: 300,
      unlimitedQuota: false,
    },
    {
      code: '3plus_unlimited',
      enabled: true,
      label: '3+ Months / Unlimited',
      localizedLabels: { my: '၃ လနှင့်အထက် / Unlimited' },
      priceAmount: null,
      priceCurrency: 'MMK',
      priceLabel: '',
      localizedPriceLabels: {},
      deliveryType: 'DYNAMIC_KEY',
      templateId: null,
      dynamicTemplateId: null,
      fixedDurationDays: null,
      fixedDurationMonths: null,
      minDurationMonths: 3,
      dataLimitGB: null,
      unlimitedQuota: true,
    },
  ];
}

function defaultPaymentMethods(): TelegramSalesPaymentMethod[] {
  return [
    {
      code: 'kpay',
      enabled: true,
      label: 'KPay',
      localizedLabels: { my: 'KPay' },
      accountName: '',
      accountNumber: '',
      imageUrl: '',
      note: '',
      localizedNotes: {},
    },
    {
      code: 'wavepay',
      enabled: true,
      label: 'Wave Pay',
      localizedLabels: { my: 'Wave Pay' },
      accountName: '',
      accountNumber: '',
      imageUrl: '',
      note: '',
      localizedNotes: {},
    },
    {
      code: 'aya_pay',
      enabled: true,
      label: 'AYA Pay',
      localizedLabels: { my: 'AYA Pay' },
      accountName: '',
      accountNumber: '',
      imageUrl: '',
      note: '',
      localizedNotes: {},
    },
  ];
}

export function getDefaultTelegramSalesSettings(): TelegramSalesSettings {
  return {
    enabled: false,
    allowRenewals: true,
    supportLink: '',
    paymentReminderHours: 3,
    pendingReviewReminderHours: 6,
    unpaidOrderExpiryHours: 24,
    paymentInstructions: DEFAULT_PAYMENT_INSTRUCTIONS_EN,
    localizedPaymentInstructions: {
      en: DEFAULT_PAYMENT_INSTRUCTIONS_EN,
      my: DEFAULT_PAYMENT_INSTRUCTIONS_MY,
    },
    paymentMethods: defaultPaymentMethods(),
    plans: defaultPlans(),
  };
}

export function normalizeTelegramSalesSettings(value: unknown): TelegramSalesSettings {
  const defaults = getDefaultTelegramSalesSettings();
  const parsed = telegramSalesSettingsSchema.safeParse(value);
  if (!parsed.success) {
    return defaults;
  }

  const next = parsed.data;
  const paymentReminderHours =
    typeof next.paymentReminderHours === 'number' && Number.isFinite(next.paymentReminderHours)
      ? next.paymentReminderHours
      : defaults.paymentReminderHours;
  const pendingReviewReminderHours =
    typeof next.pendingReviewReminderHours === 'number' &&
    Number.isFinite(next.pendingReviewReminderHours)
      ? next.pendingReviewReminderHours
      : defaults.pendingReviewReminderHours;
  const unpaidOrderExpiryHours =
    typeof next.unpaidOrderExpiryHours === 'number' && Number.isFinite(next.unpaidOrderExpiryHours)
      ? Math.max(next.unpaidOrderExpiryHours, paymentReminderHours)
      : defaults.unpaidOrderExpiryHours;
  const plansByCode = new Map(next.plans.map((plan) => [plan.code, plan]));
  const paymentMethodsByCode = new Map(next.paymentMethods.map((method) => [method.code, method]));

  return {
    enabled: next.enabled,
    allowRenewals: next.allowRenewals,
    supportLink: next.supportLink?.trim() || '',
    paymentReminderHours,
    pendingReviewReminderHours,
    unpaidOrderExpiryHours,
    paymentInstructions: next.paymentInstructions || defaults.paymentInstructions,
    localizedPaymentInstructions: normalizeLocalizedTemplateMap(next.localizedPaymentInstructions),
    paymentMethods: defaultPaymentMethods().map((fallbackMethod) => {
      const override = paymentMethodsByCode.get(fallbackMethod.code);
      if (!override) {
        return fallbackMethod;
      }

      return {
        ...fallbackMethod,
        ...override,
        imageUrl: override.imageUrl?.trim() || '',
        localizedLabels: normalizeLocalizedTemplateMap(override.localizedLabels),
        localizedNotes: normalizeLocalizedTemplateMap(override.localizedNotes),
      };
    }),
    plans: defaults.plans.map((fallbackPlan) => {
      const override = plansByCode.get(fallbackPlan.code);
      if (!override) {
        return fallbackPlan;
      }

      return {
        ...fallbackPlan,
        ...override,
        localizedLabels: normalizeLocalizedTemplateMap(override.localizedLabels),
        localizedPriceLabels: normalizeLocalizedTemplateMap(override.localizedPriceLabels),
        deliveryType: override.deliveryType === 'DYNAMIC_KEY' ? 'DYNAMIC_KEY' : fallbackPlan.deliveryType,
        templateId:
          (override.templateId ?? '').trim() || (override.deliveryType === 'ACCESS_KEY' ? fallbackPlan.templateId ?? null : null),
        dynamicTemplateId:
          (override.dynamicTemplateId ?? '').trim() ||
          (override.deliveryType === 'DYNAMIC_KEY' ? fallbackPlan.dynamicTemplateId ?? null : null),
        fixedDurationDays:
          typeof override.fixedDurationDays === 'number' && Number.isFinite(override.fixedDurationDays)
            ? override.fixedDurationDays
            : fallbackPlan.fixedDurationDays ?? null,
        priceAmount:
          typeof override.priceAmount === 'number' && Number.isFinite(override.priceAmount)
            ? override.priceAmount
            : fallbackPlan.priceAmount ?? null,
        priceCurrency: (override.priceCurrency || fallbackPlan.priceCurrency || 'MMK')
          .toString()
          .trim()
          .toUpperCase(),
      };
    }),
  };
}

export async function getTelegramSalesSettings(): Promise<TelegramSalesSettings> {
  const settings = await db.settings.findUnique({
    where: { key: TELEGRAM_SALES_SETTING_KEY },
    select: { value: true },
  });

  if (!settings) {
    return getDefaultTelegramSalesSettings();
  }

  try {
    return normalizeTelegramSalesSettings(JSON.parse(settings.value));
  } catch {
    return getDefaultTelegramSalesSettings();
  }
}

export function resolveTelegramSalesPlan(
  settings: TelegramSalesSettings,
  code: TelegramSalesPlanCode,
): TelegramSalesPlan | null {
  return settings.plans.find((plan) => plan.code === code) || null;
}

export function resolveTelegramSalesPlanLabel(
  plan: TelegramSalesPlan,
  locale: SupportedLocale,
): string {
  return (
    resolveLocalizedTemplate(plan.localizedLabels as LocalizedTemplateMap, locale, plan.label) ||
    plan.label
  ).trim();
}

export function resolveTelegramSalesPriceLabel(
  plan: TelegramSalesPlan,
  locale: SupportedLocale,
): string {
  const customLabel =
    resolveLocalizedTemplate(
      plan.localizedPriceLabels as LocalizedTemplateMap,
      locale,
      plan.priceLabel,
    ) || plan.priceLabel
  ;

  if (customLabel.trim()) {
    return customLabel.trim();
  }

  if (typeof plan.priceAmount === 'number' && Number.isFinite(plan.priceAmount)) {
    const amount = new Intl.NumberFormat(locale === 'my' ? 'my-MM' : 'en-US').format(
      plan.priceAmount,
    );
    const currency = (plan.priceCurrency || 'MMK').trim().toUpperCase();

    switch (currency) {
      case 'MMK':
        return locale === 'my' ? `${amount} ကျပ်` : `${amount} Kyat`;
      case 'USD':
        return locale === 'my' ? `${amount} ဒေါ်လာ` : `$${amount}`;
      case 'THB':
        return locale === 'my' ? `${amount} ဘတ်` : `${amount} Baht`;
      default:
        return `${amount} ${currency}`;
    }
  }

  return '';
}

export function resolveTelegramSalesPaymentInstructions(
  settings: TelegramSalesSettings,
  locale: SupportedLocale,
): string {
  return (
    resolveLocalizedTemplate(
      normalizeLocalizedTemplateMap(settings.localizedPaymentInstructions),
      locale,
      settings.paymentInstructions,
    ) || settings.paymentInstructions
  ).trim();
}

export function resolveTelegramSalesPaymentMethodLabel(
  method: TelegramSalesPaymentMethod,
  locale: SupportedLocale,
) {
  return (
    resolveLocalizedTemplate(
      normalizeLocalizedTemplateMap(method.localizedLabels),
      locale,
      method.label,
    ) || method.label
  ).trim();
}

export function resolveTelegramSalesPaymentMethodNote(
  method: TelegramSalesPaymentMethod,
  locale: SupportedLocale,
) {
  return (
    resolveLocalizedTemplate(
      normalizeLocalizedTemplateMap(method.localizedNotes),
      locale,
      method.note,
    ) || method.note
  ).trim();
}

export function listEnabledTelegramSalesPaymentMethods(settings: TelegramSalesSettings) {
  return settings.paymentMethods.filter((method) => method.enabled);
}

export function resolveTelegramSalesPaymentMethod(
  settings: TelegramSalesSettings,
  code: string | null | undefined,
) {
  if (!code) {
    return null;
  }

  return settings.paymentMethods.find((method) => method.code === code) || null;
}

export function formatTelegramSalesPlanSummary(
  plan: TelegramSalesPlan,
  durationMonths: number | null | undefined,
  locale: SupportedLocale,
): string {
  const label = resolveTelegramSalesPlanLabel(plan, locale);
  const price = resolveTelegramSalesPriceLabel(plan, locale);

  if (!plan.unlimitedQuota || !durationMonths || plan.fixedDurationMonths) {
    return price ? `${label} (${price})` : label;
  }

  const withDuration =
    locale === 'my'
      ? `${durationMonths} လ / Unlimited`
      : `${durationMonths} month${durationMonths === 1 ? '' : 's'} / Unlimited`;

  return price ? `${withDuration} (${price})` : withDuration;
}

export function parseTelegramSalesLocale(input: unknown): SupportedLocale {
  if (typeof input === 'string') {
    return coerceSupportedLocale(input) || 'en';
  }

  return 'en';
}

export async function generateTelegramOrderCode(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = `ORD-${generateRandomString(8).toUpperCase()}`;
    const existing = await db.telegramOrder.findUnique({
      where: { orderCode: candidate },
      select: { id: true },
    });
    if (!existing) {
      return candidate;
    }
  }

  return `ORD-${Date.now().toString(36).toUpperCase()}`;
}
