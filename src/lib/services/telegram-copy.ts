import type { SupportedLocale } from '@/lib/i18n/config';
import { normalizeLocalizedTemplateMap, type LocalizedTemplateMap } from '@/lib/localized-templates';

export const DEFAULT_TELEGRAM_WELCOME_MESSAGES: Record<SupportedLocale, string> = {
  en: 'Welcome to Atomic-UI. Use /buy to order a new key, /renew to extend an existing key, or send your email address to link a current key.',
  my: 'Atomic-UI မှ ကြိုဆိုပါတယ်။ /buy ဖြင့် key အသစ်မှာယူနိုင်သည်၊ /renew ဖြင့် လက်ရှိ key ကို သက်တမ်းတိုးနိုင်သည်၊ သို့မဟုတ် သင့် email ကို ပို့ပြီး လက်ရှိ key ကို ချိတ်ဆက်နိုင်သည်။',
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
