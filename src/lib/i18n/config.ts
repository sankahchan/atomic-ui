/**
 * Internationalization Configuration
 *
 * Keeps the full translation registry available while limiting user-facing
 * language selection to the project's supported locales.
 */

export const locales = ['en', 'zh', 'my', 'ja', 'ko', 'ru'] as const;
export type Locale = (typeof locales)[number];

export const supportedLocales = ['en', 'my'] as const;
export type SupportedLocale = (typeof supportedLocales)[number];

export const defaultLocale: SupportedLocale = 'en';

export const localeNames: Record<Locale, string> = {
  en: 'English',
  zh: '中文',
  my: 'မြန်မာ',
  ja: '日本語',
  ko: '한국어',
  ru: 'Русский',
};

export const localeFlags: Record<Locale, string> = {
  en: '🇺🇸',
  zh: '🇨🇳',
  my: '🇲🇲',
  ja: '🇯🇵',
  ko: '🇰🇷',
  ru: '🇷🇺',
};

export function isSupportedLocale(value: string): value is SupportedLocale {
  return supportedLocales.includes(value as SupportedLocale);
}

export function coerceSupportedLocale(value: string | null | undefined): SupportedLocale | null {
  if (!value) {
    return null;
  }

  return isSupportedLocale(value) ? value : null;
}
