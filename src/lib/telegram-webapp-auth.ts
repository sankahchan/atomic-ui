import { createHmac, timingSafeEqual } from 'crypto';
import { SignJWT } from 'jose/jwt/sign';
import { jwtVerify } from 'jose/jwt/verify';
import { getJwtSecretBytes } from './session-secret';

export const TELEGRAM_WEBAPP_SESSION_TTL_SECONDS = 15 * 60;
export const TELEGRAM_WEBAPP_INIT_DATA_MAX_AGE_SECONDS = 10 * 60;

export interface TelegramWebAppIdentity {
  telegramUserId: number;
  chatId?: number;
  username?: string;
  locale?: string;
}

/**
 * Verify Telegram WebApp initData exactly as documented by Telegram.
 *
 * The WebAppData secret is deliberately derived from the bot token with a
 * different label than the webhook secret. Never reuse deriveLegacyTelegramWebhookSecret here.
 */
export function verifyTelegramWebAppInitData(
  initData: string,
  botToken: string,
  nowMs = Date.now(),
): TelegramWebAppIdentity {
  if (!initData || !botToken) {
    throw new Error('Missing Telegram Web App initData or bot token');
  }

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]+$/i.test(hash)) {
    throw new Error('Telegram Web App initData hash is missing or invalid');
  }

  params.delete('hash');
  const dataCheckString = Array.from(params.entries())
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');

  const webAppDataKey = createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();
  const expectedHash = createHmac('sha256', webAppDataKey)
    .update(dataCheckString)
    .digest();
  const providedHash = Buffer.from(hash, 'hex');

  if (
    providedHash.length !== expectedHash.length ||
    !timingSafeEqual(providedHash, expectedHash)
  ) {
    throw new Error('Telegram Web App initData signature mismatch');
  }

  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate) || authDate <= 0) {
    throw new Error('Telegram Web App initData auth_date is invalid');
  }

  const ageSeconds = Math.floor(nowMs / 1000) - authDate;
  if (ageSeconds < -60 || ageSeconds > TELEGRAM_WEBAPP_INIT_DATA_MAX_AGE_SECONDS) {
    throw new Error('Telegram Web App initData is expired');
  }

  const rawUser = params.get('user');
  if (!rawUser) {
    throw new Error('Telegram Web App initData does not contain a user');
  }

  let user: Record<string, unknown>;
  try {
    user = JSON.parse(rawUser) as Record<string, unknown>;
  } catch {
    throw new Error('Telegram Web App initData user is invalid');
  }

  const telegramUserId = Number(user.id);
  if (!Number.isInteger(telegramUserId) || telegramUserId <= 0) {
    throw new Error('Telegram Web App initData user id is invalid');
  }

  const chatId = Number(params.get('chat') ? parseJsonField(params.get('chat'), 'id') : NaN);
  const identity: TelegramWebAppIdentity = {
    telegramUserId,
    chatId: Number.isInteger(chatId) && chatId !== 0 ? chatId : undefined,
    username: typeof user.username === 'string' ? user.username : undefined,
    locale: typeof user.language_code === 'string' ? user.language_code : undefined,
  };

  return identity;
}

function parseJsonField(raw: string | null, key: string) {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    return value[key] ?? null;
  } catch {
    return null;
  }
}

/** Mint a short-lived token for same-origin Web App API calls. */
export async function createTelegramWebAppSession(
  identity: TelegramWebAppIdentity,
): Promise<string> {
  return new SignJWT({
    scope: 'telegram_webapp',
    telegramUserId: identity.telegramUserId,
    chatId: identity.chatId ?? null,
    username: identity.username ?? null,
    locale: identity.locale ?? null,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${TELEGRAM_WEBAPP_SESSION_TTL_SECONDS}s`)
    .sign(getJwtSecretBytes());
}

/** Verify a Web App session token. Returns null for any invalid or expired token. */
export async function verifyTelegramWebAppSession(
  token: string,
): Promise<TelegramWebAppIdentity | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecretBytes());
    if (payload.scope !== 'telegram_webapp') return null;

    const telegramUserId = Number(payload.telegramUserId);
    if (!Number.isInteger(telegramUserId) || telegramUserId <= 0) return null;

    const chatId = Number(payload.chatId);
    const username = typeof payload.username === 'string' ? payload.username : undefined;
    const locale = typeof payload.locale === 'string' ? payload.locale : undefined;

    return {
      telegramUserId,
      chatId: Number.isInteger(chatId) && chatId !== 0 ? chatId : undefined,
      username,
      locale,
    };
  } catch {
    return null;
  }
}
