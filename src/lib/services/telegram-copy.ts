import type { SupportedLocale } from '@/lib/i18n/config';
import { normalizeLocalizedTemplateMap, type LocalizedTemplateMap } from '@/lib/localized-templates';

export const DEFAULT_TELEGRAM_WELCOME_MESSAGES: Record<SupportedLocale, string> = {
  en: '🚀 <b>Welcome to Atomic-UI</b>\n\nExperience high-speed, secure browsing with our premium routing. Use the menu below to buy new plans, manage your keys, or get support instantly.',
  my: '🚀 <b>Atomic-UI မှ ကြိုဆိုပါတယ်</b>\n\nအဆင့်မြင့် routing စနစ်ဖြင့် မြန်ဆန်စိတ်ချရသော အင်တာနက်ကို အသုံးပြုလိုက်ပါ။ အစီအစဉ်အသစ်များ ဝယ်ယူရန်၊ key များ စစ်ဆေးရန်နှင့် အကူအညီ ရယူရန် အောက်ပါ menu ကို အသုံးပြုနိုင်ပါသည်။',
};

export const DEFAULT_TELEGRAM_KEY_NOT_FOUND_MESSAGES: Record<SupportedLocale, string> = {
  en: 'No active key is linked to this account yet. Send your email address to link an existing key, or use /buy to place a new order.',
  my: 'ဤ account နှင့် ချိတ်ထားသော active key မရှိသေးပါ။ လက်ရှိ key ကို ချိတ်ရန် သင့် email ကို ပို့ပါ၊ သို့မဟုတ် key အသစ်မှာယူရန် /buy ကို အသုံးပြုပါ။',
};

export function buildDefaultTelegramTemplateMap(
  defaults: Record<SupportedLocale, string>,
  overrides?: unknown,
): LocalizedTemplateMap {
  return {
    ...defaults,
    ...normalizeLocalizedTemplateMap(overrides),
  };
}
