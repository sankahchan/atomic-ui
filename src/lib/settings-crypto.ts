import crypto from 'node:crypto';

const SETTINGS_SECRET_PREFIX = 'enc:v1';
const DEV_SETTINGS_ENCRYPTION_SECRET = 'atomic-ui-dev-settings-secret';
export const MASKED_SETTING_SECRET = '********';

function getSettingsEncryptionKey() {
  const configured = process.env.SETTINGS_ENCRYPTION_KEY?.trim();

  if (configured) {
    if (/^[a-fA-F0-9]{64,}$/.test(configured)) {
      return Buffer.from(configured.slice(0, 64), 'hex');
    }

    return crypto.createHash('sha256').update(configured).digest();
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('SETTINGS_ENCRYPTION_KEY must be set in production.');
  }

  return crypto.createHash('sha256').update(DEV_SETTINGS_ENCRYPTION_SECRET).digest();
}

export function isEncryptedSettingSecret(value: string) {
  return value.startsWith(`${SETTINGS_SECRET_PREFIX}:`);
}

export function isMaskedSettingSecret(value: string | null | undefined) {
  return value?.trim() === MASKED_SETTING_SECRET;
}

export function maskSettingSecret(value: string | null | undefined) {
  return value && value.trim().length > 0 ? MASKED_SETTING_SECRET : '';
}

export function encryptSettingSecret(secret: string) {
  const iv = crypto.randomBytes(12);
  const key = getSettingsEncryptionKey();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    SETTINGS_SECRET_PREFIX,
    iv.toString('hex'),
    tag.toString('hex'),
    encrypted.toString('hex'),
  ].join(':');
}

export function decryptSettingSecret(value: string) {
  if (!isEncryptedSettingSecret(value)) {
    return value;
  }

  const [, version, ivHex, tagHex, encryptedHex] = value.split(':');
  if (
    version !== 'v1' ||
    !ivHex ||
    !tagHex ||
    !encryptedHex
  ) {
    throw new Error('Invalid encrypted settings secret payload.');
  }

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getSettingsEncryptionKey(),
    Buffer.from(ivHex, 'hex'),
  );
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}
