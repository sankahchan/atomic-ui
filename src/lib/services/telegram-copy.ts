import type { SupportedLocale } from '@/lib/i18n/config';
import { normalizeLocalizedTemplateMap, type LocalizedTemplateMap } from '@/lib/localized-templates';

export const DEFAULT_TELEGRAM_WELCOME_MESSAGES: Record<SupportedLocale, string> = {
  en: 'Welcome to Atomic-UI. Use the menu below to buy a key, renew, view your keys, or send your email address to link an existing account.',
  my: 'Atomic-UI မှ ကြိုဆိုပါတယ်။ အောက်ရှိ menu ဖြင့် key ဝယ်ယူခြင်း၊ renew လုပ်ခြင်း၊ key များကြည့်ခြင်းတို့ကို လုပ်နိုင်ပြီး လက်ရှိ account ကို ချိတ်ရန် email ကိုလည်း တိုက်ရိုက် ပို့နိုင်ပါသည်။',
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
