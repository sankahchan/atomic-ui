import { withAbsoluteBasePath } from '@/lib/base-path';
import { type SupportedLocale } from '@/lib/i18n/config';

export function getTelegramWebAppUrl() {
  const hasOrigin = Boolean(
    process.env.NEXT_PUBLIC_APP_URL
    || process.env.APP_URL
    || process.env.NEXTAUTH_URL,
  );
  if (!hasOrigin) return null;
  try {
    return new URL(withAbsoluteBasePath('/webapp')).toString();
  } catch {
    return null;
  }
}

export function buildTelegramWebAppInlineButton(locale: SupportedLocale) {
  const webAppUrl = getTelegramWebAppUrl();
  if (!webAppUrl) return null;

  return {
    text: locale === 'my' ? '📲 Mini App ဖွင့်မည်' : '📲 Open Mini App',
    web_app: { url: webAppUrl },
  };
}

export function buildTelegramWebAppKeyboard(locale: SupportedLocale) {
  const button = buildTelegramWebAppInlineButton(locale);
  if (!button) return null;

  return { inline_keyboard: [[button]] };
}
