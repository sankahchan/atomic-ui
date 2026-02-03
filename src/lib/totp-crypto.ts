import crypto from 'crypto';

let warnedFallback = false;

/**
 * Return a stable 32-byte (64 hex chars) encryption key for TOTP secrets.
 * Accepts either a raw passphrase or a hex key via TOTP_ENCRYPTION_KEY.
 */
export function getTotpEncryptionKeyHex(): string {
  const configured = process.env.TOTP_ENCRYPTION_KEY?.trim();

  if (configured) {
    if (/^[a-fA-F0-9]{64,}$/.test(configured)) {
      return configured.slice(0, 64);
    }

    return crypto.createHash('sha256').update(configured).digest('hex');
  }

  if (!warnedFallback) {
    warnedFallback = true;
    console.warn('[Security] TOTP_ENCRYPTION_KEY is not set. Falling back to a derived key.');
  }

  const fallback = process.env.JWT_SECRET || 'atomic-ui-default-secret';
  return crypto.createHash('sha256').update(`totp:${fallback}`).digest('hex');
}
