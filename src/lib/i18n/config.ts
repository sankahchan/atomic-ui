/**
 * Internationalization Configuration
 *
 * Defines supported locales and their display names/flags.
 * Used by the language selector and translation system.
 */

export const locales = ['en', 'zh', 'my', 'ja', 'ko', 'ru'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

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
