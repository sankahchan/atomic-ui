const TELEGRAM_BOT_USERNAME_PATTERN = /^[A-Za-z0-9_]{5,32}$/;

export function normalizeTelegramBotUsernameHandle(value: string | null | undefined) {
  const trimmed = value?.trim() || '';
  if (!trimmed) {
    return '';
  }

  if (/^tg:\/\/resolve\?/i.test(trimmed)) {
    return '';
  }

  const withoutScheme = trimmed.replace(/^https?:\/\//i, '');
  const telegramMatch = withoutScheme.match(/^(?:t|telegram)\.me\/([^/?#]+)$/i);
  if (telegramMatch) {
    const handle = telegramMatch[1]?.trim().replace(/^@+/, '') || '';
    return TELEGRAM_BOT_USERNAME_PATTERN.test(handle) ? handle : '';
  }

  const handle = trimmed.replace(/^@+/, '');
  return TELEGRAM_BOT_USERNAME_PATTERN.test(handle) ? handle : '';
}

export function formatTelegramBotUsername(value: string | null | undefined) {
  const handle = normalizeTelegramBotUsernameHandle(value);
  return handle ? `@${handle}` : '';
}

export function buildTelegramBotProfileUrl(value: string | null | undefined) {
  const handle = normalizeTelegramBotUsernameHandle(value);
  return handle ? `https://t.me/${handle}` : null;
}
