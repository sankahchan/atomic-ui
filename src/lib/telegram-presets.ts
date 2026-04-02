import type { SupportedLocale } from '@/lib/i18n/config';

export type TelegramAnnouncementPresetAudience =
  | 'ACTIVE_USERS'
  | 'STANDARD_USERS'
  | 'PREMIUM_USERS'
  | 'TRIAL_USERS';

export type TelegramAnnouncementPresetType =
  | 'INFO'
  | 'ANNOUNCEMENT'
  | 'PROMO'
  | 'NEW_SERVER'
  | 'MAINTENANCE';

export type TelegramAnnouncementPreset = {
  code: string;
  audience: TelegramAnnouncementPresetAudience;
  type: TelegramAnnouncementPresetType;
  includeSupportButton: boolean;
  filters?: {
    tag?: string | null;
    serverId?: string | null;
    countryCode?: string | null;
  };
  name: Record<SupportedLocale, string>;
  title: Record<SupportedLocale, string>;
  message: Record<SupportedLocale, string>;
};

export const TELEGRAM_ANNOUNCEMENT_PRESETS: TelegramAnnouncementPreset[] = [
  {
    code: 'new_server_active',
    audience: 'ACTIVE_USERS',
    type: 'NEW_SERVER',
    includeSupportButton: true,
    name: {
      en: 'New server launch',
      my: 'Server အသစ်ကြေညာချက်',
    },
    title: {
      en: 'New Server Added',
      my: 'Server အသစ် ထပ်တိုးပြီးပါပြီ',
    },
    message: {
      en: 'We added a new server for better speed and stability. If you want to move your key, please contact admin through /support.',
      my: 'Speed နဲ့ stability ပိုကောင်းစေရန် server အသစ် ထပ်တိုးထားပါသည်။ Key ကို ပြောင်းလိုပါက /support မှတဆင့် admin ကို ဆက်သွယ်နိုင်ပါသည်။',
    },
  },
  {
    code: 'maintenance_active',
    audience: 'ACTIVE_USERS',
    type: 'MAINTENANCE',
    includeSupportButton: true,
    name: {
      en: 'Planned maintenance',
      my: 'Maintenance အသိပေးချက်',
    },
    title: {
      en: 'Scheduled Maintenance',
      my: 'Server Maintenance Notice',
    },
    message: {
      en: 'One of our servers is under maintenance. Please wait 2 to 3 hours while we complete the update. If needed, contact admin through /support.',
      my: 'Server တစ်ခုကို maintenance လုပ်နေပါသည်။ Update ပြီးဆုံးရန် ၂ မှ ၃ နာရီခန့် စောင့်ပေးပါ။ လိုအပ်ပါက /support မှ admin ကို ဆက်သွယ်ပါ။',
    },
  },
  {
    code: 'downtime_active',
    audience: 'ACTIVE_USERS',
    type: 'INFO',
    includeSupportButton: true,
    name: {
      en: 'Server issue notice',
      my: 'Server ပြဿနာ အသိပေးချက်',
    },
    title: {
      en: 'Server Issue Notice',
      my: 'Server ပြဿနာ အသိပေးချက်',
    },
    message: {
      en: 'We are currently investigating a server issue affecting some users. Please wait while we work on recovery. We will send another update as soon as possible.',
      my: 'User အချို့အပေါ် သက်ရောက်နေသော server ပြဿနာတစ်ခုကို စစ်ဆေးနေပါသည်။ Recovery ပြုလုပ်နေစဉ် ခဏစောင့်ပေးပါ။ Update အသစ်ကို ထပ်မံပို့ပေးပါမည်။',
    },
  },
  {
    code: 'discount_active',
    audience: 'ACTIVE_USERS',
    type: 'PROMO',
    includeSupportButton: true,
    name: {
      en: 'Discount offer',
      my: 'Discount အထူးအစီအစဉ်',
    },
    title: {
      en: 'Discount Offer',
      my: 'Discount အထူးအစီအစဉ်',
    },
    message: {
      en: 'Special offer is now available for new and renewal orders. Contact admin for the latest price and package details.',
      my: 'Key အသစ်ဝယ်ယူခြင်းနှင့် renewal အတွက် အထူးဈေးနှုန်း ရရှိနိုင်ပါသည်။ အသေးစိတ်ကို admin ထံ ဆက်သွယ်မေးမြန်းနိုင်ပါသည်။',
    },
  },
  {
    code: 'premium_active',
    audience: 'ACTIVE_USERS',
    type: 'PROMO',
    includeSupportButton: true,
    name: {
      en: 'Premium promo',
      my: 'Premium ကြော်ငြာ',
    },
    title: {
      en: 'Premium Key Available',
      my: 'Premium Key ရရှိနိုင်ပါပြီ',
    },
    message: {
      en: 'Premium key plans are now available with better routing, stronger stability, and priority support. Contact admin for details.',
      my: 'Premium key ကို stability ပိုကောင်းခြင်း၊ routing ပိုကောင်းခြင်း၊ support အထူးရရှိခြင်းတို့နှင့်အတူ ဝယ်ယူနိုင်ပါပြီ။ အသေးစိတ်ကို admin ထံ ဆက်သွယ်ပါ။',
    },
  },
  {
    code: 'trial_to_paid',
    audience: 'TRIAL_USERS',
    type: 'PROMO',
    includeSupportButton: true,
    name: {
      en: 'Trial upgrade',
      my: 'Trial upgrade',
    },
    title: {
      en: 'Upgrade Your Trial',
      my: 'Trial မှ ဆက်လက်အသုံးပြုရန်',
    },
    message: {
      en: 'If you want to continue after your trial, you can now buy a standard or premium key directly from Telegram. Use /buy to get started.',
      my: 'Trial ပြီးနောက် ဆက်လက်အသုံးပြုလိုပါက standard key သို့မဟုတ် premium key ကို Telegram မှတဆင့် ဝယ်ယူနိုင်ပါပြီ။ /buy ကို အသုံးပြုပါ။',
    },
  },
  {
    code: 'renewal_active',
    audience: 'ACTIVE_USERS',
    type: 'INFO',
    includeSupportButton: true,
    name: {
      en: 'Renewal reminder',
      my: 'Renewal reminder',
    },
    title: {
      en: 'Renewal Reminder',
      my: 'Renewal Reminder',
    },
    message: {
      en: 'If your key is close to expiration, please renew early to avoid interruption. Use /renew or contact admin for help.',
      my: 'Key သက်တမ်းကုန်ရန် နီးလာပါက အနှောင့်အယှက်မဖြစ်စေရန် ကြိုတင် renewal လုပ်ပါ။ /renew ကို သုံးနိုင်သလို admin ကိုလည်း ဆက်သွယ်နိုင်ပါသည်။',
    },
  },
  {
    code: 'telegram_users',
    audience: 'ACTIVE_USERS',
    type: 'INFO',
    includeSupportButton: true,
    filters: {
      tag: 'tele',
    },
    name: {
      en: 'Telegram service update',
      my: 'Telegram service update',
    },
    title: {
      en: 'Telegram Support Update',
      my: 'Telegram Service Update',
    },
    message: {
      en: 'Telegram orders, support, refund requests, and announcements are fully available. Use /help to see all commands.',
      my: 'Telegram မှတဆင့် key ဝယ်ယူခြင်း၊ renewal လုပ်ခြင်း၊ refund request တင်ခြင်း၊ support ရယူခြင်းနှင့် announcement များကို လုပ်ဆောင်နိုင်ပါပြီ။ Command များကြည့်ရန် /help ကို သုံးပါ။',
    },
  },
];

export type TelegramSupportReplyMacro = {
  code: string;
  label: Record<SupportedLocale, string>;
  message: Record<SupportedLocale, string>;
};

export const TELEGRAM_SUPPORT_REPLY_MACROS: TelegramSupportReplyMacro[] = [
  {
    code: 'general_support',
    label: {
      en: 'General support',
      my: 'အထွေထွေ support',
    },
    message: {
      en: 'Hello. We received your message and we are checking the issue now. Please send your key name or order code if you have it.',
      my: 'မင်္ဂလာပါ။ သင့် message ကို လက်ခံရရှိပြီး ပြဿနာကို စစ်ဆေးနေပါသည်။ Key name သို့မဟုတ် order code ရှိပါက ပို့ပေးပါ။',
    },
  },
  {
    code: 'need_screenshot',
    label: {
      en: 'Need screenshot',
      my: 'Screenshot လိုအပ်',
    },
    message: {
      en: 'Please send a clearer screenshot of the payment, including the amount, account name, and transaction time.',
      my: 'Payment screenshot ကို ပိုရှင်းလင်းအောင် ပြန်ပို့ပေးပါ။ Amount, account name နဲ့ transaction time ပါဝင်ရပါမည်။',
    },
  },
  {
    code: 'server_issue',
    label: {
      en: 'Server issue',
      my: 'Server ပြဿနာ',
    },
    message: {
      en: 'We understand the server is not working properly for you. We are checking it now. Please wait a little while, and we will update you again soon.',
      my: 'သင်အသုံးပြုနေသော server တွင် ပြဿနာရှိနေသည်ကို နားလည်ပါသည်။ လက်ရှိ စစ်ဆေးနေပါသည်။ ခဏစောင့်ပေးပါ၊ update ကို ထပ်ပို့ပေးပါမည်။',
    },
  },
  {
    code: 'need_order_info',
    label: {
      en: 'Need order info',
      my: 'Order အချက်အလက်လိုအပ်',
    },
    message: {
      en: 'Please send your order code or the email/name used for the order so we can check it faster.',
      my: 'Order code သို့မဟုတ် order လုပ်စဉ် အသုံးပြုထားသော email/name ကို ပို့ပေးပါက ပိုမြန်မြန် စစ်ဆေးပေးနိုင်ပါသည်။',
    },
  },
  {
    code: 'resolved',
    label: {
      en: 'Resolved',
      my: 'ဖြေရှင်းပြီး',
    },
    message: {
      en: 'Your issue should be resolved now. Please try again and let us know if the problem still continues.',
      my: 'ပြဿနာကို ဖြေရှင်းပြီးဖြစ်သင့်ပါသည်။ ထပ်မံစမ်းသုံးပြီး ပြဿနာရှိနေသေးပါက ပြန်လည်အသိပေးပါ။',
    },
  },
];

export function buildTelegramAnnouncementCommand(input: {
  audience: TelegramAnnouncementPresetAudience;
  type: TelegramAnnouncementPresetType;
  title: string;
  message: string;
  includeSupportButton?: boolean;
  filters?: {
    tag?: string | null;
    serverId?: string | null;
    countryCode?: string | null;
  };
}) {
  const parts = ['/announce', resolveTelegramAnnouncementAudienceToken(input.audience)];

  parts.push(`type=${resolveTelegramAnnouncementTypeToken(input.type)}`);

  if (input.filters?.tag) {
    parts.push(`tag=${input.filters.tag}`);
  }
  if (input.filters?.serverId) {
    parts.push(`server=${input.filters.serverId}`);
  }
  if (input.filters?.countryCode) {
    parts.push(`region=${input.filters.countryCode.toUpperCase()}`);
  }

  parts.push(`support=${input.includeSupportButton === false ? 'no' : 'yes'}`);

  return `${parts.join(' ')} :: ${input.title} :: ${input.message}`;
}

function resolveTelegramAnnouncementAudienceToken(audience: TelegramAnnouncementPresetAudience) {
  switch (audience) {
    case 'STANDARD_USERS':
      return 'standard';
    case 'PREMIUM_USERS':
      return 'premium';
    case 'TRIAL_USERS':
      return 'trial';
    case 'ACTIVE_USERS':
    default:
      return 'active';
  }
}

function resolveTelegramAnnouncementTypeToken(type: TelegramAnnouncementPresetType) {
  switch (type) {
    case 'INFO':
      return 'info';
    case 'PROMO':
      return 'promo';
    case 'NEW_SERVER':
      return 'new_server';
    case 'MAINTENANCE':
      return 'maintenance';
    case 'ANNOUNCEMENT':
    default:
      return 'announcement';
  }
}
