import { SignJWT } from 'jose/jwt/sign';
import { jwtVerify } from 'jose/jwt/verify';
import { getJwtSecretBytes } from './session-secret';
import { verifyTelegramWebAppSession, type TelegramWebAppIdentity } from './telegram-webapp-auth';

export const MAGIC_LINK_TOKEN_KIND = 'MAGIC_LINK_SELF_SERVICE';
export const MAGIC_LINK_TTL_MINUTES = 30;
export const MAGIC_LINK_SESSION_TTL_SECONDS = 30 * 60;

export type MagicLinkKeyKind = 'normal' | 'dynamic';

export type MagicLinkClaims = {
  keyId: string;
  kind: MagicLinkKeyKind;
  locale: string;
};

export type WebAppAuthorization =
  | { type: 'telegram'; identity: TelegramWebAppIdentity }
  | { type: 'magic'; claims: MagicLinkClaims };

/** Mint a narrow session that only grants access to one key. */
export async function createMagicLinkSession(claims: MagicLinkClaims): Promise<string> {
  return new SignJWT({
    scope: 'magic_link',
    keyId: claims.keyId,
    keyKind: claims.kind,
    locale: claims.locale,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAGIC_LINK_SESSION_TTL_SECONDS}s`)
    .sign(getJwtSecretBytes());
}

/** Verify a magic-link session token. Returns null for invalid or expired tokens. */
export async function verifyMagicLinkSession(token: string): Promise<MagicLinkClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecretBytes());
    if (payload.scope !== 'magic_link') return null;

    const keyId = typeof payload.keyId === 'string' ? payload.keyId : null;
    const kind = payload.keyKind === 'dynamic' ? 'dynamic' : payload.keyKind === 'normal' ? 'normal' : null;
    if (!keyId || !kind) return null;

    return {
      keyId,
      kind,
      locale: typeof payload.locale === 'string' ? payload.locale : 'en',
    };
  } catch {
    return null;
  }
}

/** Accept either a Telegram Web App session or a magic-link session. */
export async function authorizeWebAppToken(token: string | null): Promise<WebAppAuthorization | null> {
  if (!token) return null;

  const telegram = await verifyTelegramWebAppSession(token);
  if (telegram) {
    return { type: 'telegram', identity: telegram };
  }

  const magic = await verifyMagicLinkSession(token);
  if (magic) {
    return { type: 'magic', claims: magic };
  }

  return null;
}
