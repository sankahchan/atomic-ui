import { resolveTelegramWebhookSecret } from '@/lib/telegram-webhook-secret';

export interface TelegramSmokeStoredConfig {
  botToken: string | null;
  webhookSecretToken: string | null;
}

function normalizeOptionalString(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeOrigin(value: string | null) {
  return value ? value.replace(/\/$/, '') : null;
}

function normalizeBasePath(value: string | null) {
  if (!value || value === '/') {
    return '';
  }

  const trimmed = value.replace(/\/+$/, '');
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export function parseTelegramSmokeStoredConfig(rawValue: unknown): TelegramSmokeStoredConfig {
  if (typeof rawValue !== 'string' || rawValue.trim().length === 0) {
    return {
      botToken: null,
      webhookSecretToken: null,
    };
  }

  try {
    const parsed = JSON.parse(rawValue) as Record<string, unknown>;
    return {
      botToken: normalizeOptionalString(parsed.botToken),
      webhookSecretToken: normalizeOptionalString(parsed.webhookSecretToken),
    };
  } catch {
    return {
      botToken: null,
      webhookSecretToken: null,
    };
  }
}

export function resolveTelegramSmokeWebhookUrl(input: {
  explicitUrl?: unknown;
  env: Record<string, string | undefined>;
}) {
  const explicitUrl =
    normalizeOptionalString(input.explicitUrl) || normalizeOptionalString(input.env.TELEGRAM_SMOKE_WEBHOOK_URL);
  if (explicitUrl) {
    return normalizeOrigin(explicitUrl);
  }

  const origin =
    normalizeOrigin(normalizeOptionalString(input.env.NEXT_PUBLIC_APP_URL)) ||
    normalizeOrigin(normalizeOptionalString(input.env.APP_URL)) ||
    normalizeOrigin(normalizeOptionalString(input.env.NEXTAUTH_URL));
  if (!origin) {
    return null;
  }

  const basePath = normalizeBasePath(
    normalizeOptionalString(input.env.NEXT_PUBLIC_BASE_PATH) ||
      normalizeOptionalString(input.env.NEXT_PUBLIC_PANEL_PATH) ||
      normalizeOptionalString(input.env.PANEL_PATH),
  );

  return `${origin}${basePath}/api/telegram/webhook`;
}

export function resolveTelegramSmokeWebhookSecret(input: {
  explicitSecret?: unknown;
  env: Record<string, string | undefined>;
  botToken?: unknown;
  persistedSecret?: unknown;
}) {
  const explicitSecret =
    normalizeOptionalString(input.explicitSecret) ||
    normalizeOptionalString(input.env.TELEGRAM_SMOKE_WEBHOOK_SECRET);
  if (explicitSecret) {
    return explicitSecret;
  }

  const configuredSecret = normalizeOptionalString(input.env.TELEGRAM_WEBHOOK_SECRET);
  if (configuredSecret) {
    return configuredSecret;
  }

  const persistedSecret = normalizeOptionalString(input.persistedSecret);
  if (persistedSecret) {
    return persistedSecret;
  }

  const botToken =
    normalizeOptionalString(input.botToken) || normalizeOptionalString(input.env.TELEGRAM_BOT_TOKEN);
  const jwtSecret = normalizeOptionalString(input.env.JWT_SECRET);
  if (!botToken || !jwtSecret) {
    return null;
  }

  return resolveTelegramWebhookSecret({
    botToken,
    jwtSecret,
  });
}
