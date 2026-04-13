import { db } from '@/lib/db';
import { coerceSupportedLocale, type SupportedLocale } from '@/lib/i18n/config';
import { type TelegramSupportIssueCategory } from '@/lib/services/telegram-support-types';

export type SupportReplyTemplateStatusAction =
  | 'WORKING'
  | 'NEED_DETAILS'
  | 'ESCALATE'
  | 'HANDLED';

export type ResolvedSupportReplyTemplate = {
  id: string;
  title: string;
  category: TelegramSupportIssueCategory;
  locale: SupportedLocale;
  message: string;
  statusAction: SupportReplyTemplateStatusAction | null;
  isDefault: boolean;
  createdByUserId: string | null;
};

type DefaultTemplateSeed = {
  key: string;
  title: Record<SupportedLocale, string>;
  message: Record<SupportedLocale, string>;
  statusAction?: SupportReplyTemplateStatusAction | null;
};

const DEFAULT_SUPPORT_TEMPLATE_SEEDS: Record<TelegramSupportIssueCategory, DefaultTemplateSeed[]> = {
  ORDER: [
    {
      key: 'payment_working',
      title: {
        en: 'Payment review in progress',
        my: 'Payment review in progress',
      },
      message: {
        en: 'We are checking the payment and order review now. We will update you again shortly.',
        my: 'Payment နှင့် order review ကို စစ်ဆေးနေပါသည်။ Update ကို မကြာမီ ပြန်ပို့ပါမည်။',
      },
      statusAction: 'WORKING',
    },
    {
      key: 'proof_issue',
      title: {
        en: 'Need clearer proof',
        my: 'Need clearer proof',
      },
      message: {
        en: 'Please send the order code, payment amount, and a clearer screenshot that shows the amount, account, and transfer time.',
        my: 'Order code, payment amount နှင့် amount, account, transfer time ကို ရှင်းလင်းစွာ မြင်ရသော screenshot ကို ထပ်ပို့ပေးပါ။',
      },
      statusAction: 'NEED_DETAILS',
    },
    {
      key: 'payment_escalated',
      title: {
        en: 'Payment escalated',
        my: 'Payment escalated',
      },
      message: {
        en: 'We escalated this payment issue to the dashboard review queue for a deeper manual check.',
        my: 'ဤ payment issue ကို dashboard review queue သို့ escalate လုပ်ထားပါသည်။',
      },
      statusAction: 'ESCALATE',
    },
    {
      key: 'payment_handled',
      title: {
        en: 'Payment resolved',
        my: 'Payment resolved',
      },
      message: {
        en: 'The payment issue has been handled. If anything still looks wrong, reply in this thread and we will continue.',
        my: 'Payment issue ကို ကိုင်တွယ်ပြီးပါပြီ။ လိုအပ်ပါက ဤ thread ကို reply လုပ်ပြီး ပြန်ဆက်သွယ်နိုင်ပါသည်။',
      },
      statusAction: 'HANDLED',
    },
  ],
  KEY: [
    {
      key: 'key_working',
      title: {
        en: 'Checking key diagnostics',
        my: 'Checking key diagnostics',
      },
      message: {
        en: 'We are checking the key, usage, and server diagnostics now. We will update you again shortly.',
        my: 'Key, usage နှင့် server diagnostics ကို စစ်ဆေးနေပါသည်။ Update ကို မကြာမီ ပြန်ပို့ပါမည်။',
      },
      statusAction: 'WORKING',
    },
    {
      key: 'key_need_details',
      title: {
        en: 'Need key details',
        my: 'Need key details',
      },
      message: {
        en: 'Please send the key name, the current server, and the exact issue detail so we can continue.',
        my: 'Key name, current server နှင့် exact issue detail ကို ထပ်ပို့ပေးပါ။',
      },
      statusAction: 'NEED_DETAILS',
    },
    {
      key: 'key_escalated',
      title: {
        en: 'Key issue escalated',
        my: 'Key issue escalated',
      },
      message: {
        en: 'We escalated this key issue for a deeper panel-side review because it needs more than a quick support response.',
        my: 'ဤ key issue ကို panel-side review အတွက် escalate လုပ်ထားပါသည်။',
      },
      statusAction: 'ESCALATE',
    },
    {
      key: 'key_handled',
      title: {
        en: 'Key issue resolved',
        my: 'Key issue resolved',
      },
      message: {
        en: 'This key issue has been handled. Reply in the same thread if you want us to re-check anything.',
        my: 'ဤ key issue ကို ကိုင်တွယ်ပြီးပါပြီ။ ထပ်စစ်ဆေးလိုပါက ဤ thread ကို reply လုပ်နိုင်ပါသည်။',
      },
      statusAction: 'HANDLED',
    },
  ],
  SERVER: [
    {
      key: 'server_working',
      title: {
        en: 'Investigating server route',
        my: 'Investigating server route',
      },
      message: {
        en: 'We are checking the server or route issue now, including whether recovery or replacement is needed.',
        my: 'Server သို့ route issue ကို စစ်ဆေးနေပါသည်။ Recovery သို့ replacement လိုအပ်သလားကို ကြည့်နေပါသည်။',
      },
      statusAction: 'WORKING',
    },
    {
      key: 'server_need_details',
      title: {
        en: 'Need server details',
        my: 'Need server details',
      },
      message: {
        en: 'Please send the server or region name, issue time, and a screenshot or error detail.',
        my: 'Server/region name, issue time နှင့် screenshot သို့ error detail ကို ထပ်ပို့ပေးပါ။',
      },
      statusAction: 'NEED_DETAILS',
    },
    {
      key: 'server_escalated',
      title: {
        en: 'Server issue escalated',
        my: 'Server issue escalated',
      },
      message: {
        en: 'This server issue has been escalated to the operations panel for a deeper routing and health review.',
        my: 'ဤ server issue ကို operations panel သို့ escalate လုပ်ထားပါသည်။',
      },
      statusAction: 'ESCALATE',
    },
    {
      key: 'server_handled',
      title: {
        en: 'Server issue resolved',
        my: 'Server issue resolved',
      },
      message: {
        en: 'The server issue has been handled. If you still notice the same route problem, reply here and we will continue.',
        my: 'Server issue ကို ကိုင်တွယ်ပြီးပါပြီ။ Route problem ဆက်ရှိနေသေးပါက ဤ thread ကို reply လုပ်နိုင်ပါသည်။',
      },
      statusAction: 'HANDLED',
    },
  ],
  BILLING: [
    {
      key: 'billing_working',
      title: {
        en: 'Billing review in progress',
        my: 'Billing review in progress',
      },
      message: {
        en: 'We are checking the billing or refund issue now. We will update you again shortly.',
        my: 'Billing သို့ refund issue ကို စစ်ဆေးနေပါသည်။ Update ကို မကြာမီ ပြန်ပို့ပါမည်။',
      },
      statusAction: 'WORKING',
    },
    {
      key: 'billing_need_details',
      title: {
        en: 'Need billing details',
        my: 'Need billing details',
      },
      message: {
        en: 'Please send the receipt, payment screenshot, and the billing or refund detail so we can continue.',
        my: 'Receipt, payment screenshot နှင့် billing/refund detail ကို ထပ်ပို့ပေးပါ။',
      },
      statusAction: 'NEED_DETAILS',
    },
    {
      key: 'billing_escalated',
      title: {
        en: 'Billing issue escalated',
        my: 'Billing issue escalated',
      },
      message: {
        en: 'We escalated this billing issue to the finance review flow for a deeper manual check.',
        my: 'ဤ billing issue ကို finance review flow သို့ escalate လုပ်ထားပါသည်။',
      },
      statusAction: 'ESCALATE',
    },
    {
      key: 'billing_handled',
      title: {
        en: 'Billing issue resolved',
        my: 'Billing issue resolved',
      },
      message: {
        en: 'The billing or refund issue has been handled. Reply here if you want us to continue in the same thread.',
        my: 'Billing/refund issue ကို ကိုင်တွယ်ပြီးပါပြီ။ လိုအပ်ပါက ဤ thread ကို reply လုပ်ပြီး ဆက်နိုင်ပါသည်။',
      },
      statusAction: 'HANDLED',
    },
  ],
  GENERAL: [
    {
      key: 'general_working',
      title: {
        en: 'Working on it',
        my: 'Working on it',
      },
      message: {
        en: 'We are checking this now and will update you again shortly.',
        my: 'Issue ကို စစ်ဆေးနေပါသည်။ Update ကို မကြာမီ ပြန်ပို့ပါမည်။',
      },
      statusAction: 'WORKING',
    },
    {
      key: 'general_need_details',
      title: {
        en: 'Need more detail',
        my: 'Need more detail',
      },
      message: {
        en: 'Please send a little more detail or a clearer screenshot so we can continue.',
        my: 'ဆက်လုပ်ရန် detail သို့ screenshot အနည်းငယ် ထပ်ပို့ပေးပါ။',
      },
      statusAction: 'NEED_DETAILS',
    },
    {
      key: 'general_escalated',
      title: {
        en: 'Escalated for deeper review',
        my: 'Escalated for deeper review',
      },
      message: {
        en: 'This issue has been escalated to the dashboard panel for deeper review.',
        my: 'ဤ issue ကို dashboard panel သို့ escalate လုပ်ထားပါသည်။',
      },
      statusAction: 'ESCALATE',
    },
    {
      key: 'general_handled',
      title: {
        en: 'Handled',
        my: 'Handled',
      },
      message: {
        en: 'This issue has been handled. Reply here if you still need help and we can continue in the same thread.',
        my: 'ဤ issue ကို ကိုင်တွယ်ပြီးပါပြီ။ လိုအပ်ပါက ဤ thread ကို reply လုပ်ပြီး ပြန်ဆက်သွယ်နိုင်ပါသည်။',
      },
      statusAction: 'HANDLED',
    },
  ],
};

function normalizeSupportTemplateLocale(locale?: string | null): SupportedLocale {
  return coerceSupportedLocale(locale) || 'en';
}

function normalizeSupportTemplateCategory(category?: string | null): TelegramSupportIssueCategory {
  switch ((category || '').trim().toUpperCase()) {
    case 'ORDER':
      return 'ORDER';
    case 'KEY':
      return 'KEY';
    case 'SERVER':
      return 'SERVER';
    case 'BILLING':
      return 'BILLING';
    default:
      return 'GENERAL';
  }
}

function buildDefaultTemplateId(
  category: TelegramSupportIssueCategory,
  locale: SupportedLocale,
  key: string,
) {
  return `default:${category}:${locale}:${key}`;
}

export function listDefaultSupportReplyTemplates(input?: {
  category?: string | null;
  locale?: string | null;
}) {
  const locale = normalizeSupportTemplateLocale(input?.locale);
  const categories = input?.category
    ? [normalizeSupportTemplateCategory(input.category)]
    : (['ORDER', 'KEY', 'SERVER', 'BILLING', 'GENERAL'] as TelegramSupportIssueCategory[]);

  return categories.flatMap((category) =>
    DEFAULT_SUPPORT_TEMPLATE_SEEDS[category].map<ResolvedSupportReplyTemplate>((seed) => ({
      id: buildDefaultTemplateId(category, locale, seed.key),
      title: seed.title[locale],
      category,
      locale,
      message: seed.message[locale],
      statusAction: seed.statusAction ?? null,
      isDefault: true,
      createdByUserId: null,
    })),
  );
}

export async function listSupportReplyTemplates(input?: {
  category?: string | null;
  locale?: string | null;
}) {
  const locale = normalizeSupportTemplateLocale(input?.locale);
  const category = input?.category ? normalizeSupportTemplateCategory(input.category) : null;
  const customTemplates = await db.supportReplyTemplate.findMany({
    where: {
      locale,
      ...(category ? { category } : {}),
    },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });

  return [
    ...listDefaultSupportReplyTemplates({ category, locale }),
    ...customTemplates.map<ResolvedSupportReplyTemplate>((template) => ({
      id: template.id,
      title: template.title,
      category: normalizeSupportTemplateCategory(template.category),
      locale,
      message: template.message,
      statusAction: (template.statusAction as SupportReplyTemplateStatusAction | null) ?? null,
      isDefault: template.isDefault,
      createdByUserId: template.createdByUserId,
    })),
  ];
}

export async function resolveSupportReplyTemplateById(input: {
  templateId: string;
  locale?: string | null;
}) {
  const locale = normalizeSupportTemplateLocale(input.locale);
  if (input.templateId.startsWith('default:')) {
    return listDefaultSupportReplyTemplates({ locale }).find((template) => template.id === input.templateId) || null;
  }

  const template = await db.supportReplyTemplate.findUnique({
    where: { id: input.templateId },
  });
  if (!template) {
    return null;
  }

  return {
    id: template.id,
    title: template.title,
    category: normalizeSupportTemplateCategory(template.category),
    locale: normalizeSupportTemplateLocale(template.locale),
    message: template.message,
    statusAction: (template.statusAction as SupportReplyTemplateStatusAction | null) ?? null,
    isDefault: template.isDefault,
    createdByUserId: template.createdByUserId,
  } satisfies ResolvedSupportReplyTemplate;
}
