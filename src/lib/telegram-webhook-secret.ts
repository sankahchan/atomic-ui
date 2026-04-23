import { createHmac } from 'node:crypto';

export const TELEGRAM_WEBHOOK_SECRET_HEADER = 'x-telegram-bot-api-secret-token';

function normalizeSecret(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function deriveLegacyTelegramWebhookSecret(botToken: string, jwtSecret: string) {
  return createHmac('sha256', jwtSecret)
    .update(`telegram-webhook:${botToken}`)
    .digest('hex');
}

export function resolveTelegramWebhookSecret(input: {
  botToken: string;
  jwtSecret: string;
  configuredSecret?: unknown;
  persistedSecret?: unknown;
}) {
  const configuredSecret = normalizeSecret(input.configuredSecret);
  if (configuredSecret) {
    return configuredSecret;
  }

  const persistedSecret = normalizeSecret(input.persistedSecret);
  if (persistedSecret) {
    return persistedSecret;
  }

  return deriveLegacyTelegramWebhookSecret(input.botToken, input.jwtSecret);
}
