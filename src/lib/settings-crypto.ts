import crypto from 'node:crypto';

const SETTINGS_SECRET_PREFIX_V1 = 'enc:v1';
const SETTINGS_SECRET_PREFIX_V2 = 'enc:v2';
const SETTINGS_SECRET_PREFIX = SETTINGS_SECRET_PREFIX_V2;
const DEV_SETTINGS_ENCRYPTION_SECRET = 'atomic-ui-dev-settings-secret';
export const MASKED_SETTING_SECRET = '********';

function getSettingsEncryptionKeyV1() {
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

function getSettingsEncryptionKeyV2() {
  const configured = process.env.SETTINGS_ENCRYPTION_KEY?.trim();

  if (configured) {
    if (/^[a-fA-F0-9]{64,}$/.test(configured)) {
      return Buffer.from(configured.slice(0, 64), 'hex');
    }

    const salt = Buffer.from('atomic-ui-settings-kdf-2024');
    return crypto.pbkdf2Sync(configured, salt, 100_000, 32, 'sha256');
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('SETTINGS_ENCRYPTION_KEY must be set in production.');
  }

  const salt = Buffer.from('atomic-ui-settings-kdf-2024');
  return crypto.pbkdf2Sync(DEV_SETTINGS_ENCRYPTION_SECRET, salt, 100_000, 32, 'sha256');
}

export function isEncryptedSettingSecret(value: string) {
  return value.startsWith(`${SETTINGS_SECRET_PREFIX_V1}:`) || value.startsWith(`${SETTINGS_SECRET_PREFIX_V2}:`);
}

export function isMaskedSettingSecret(value: string | null | undefined) {
  return value?.trim() === MASKED_SETTING_SECRET;
}

export function maskSettingSecret(value: string | null | undefined) {
  return value && value.trim().length > 0 ? MASKED_SETTING_SECRET : '';
}

export function encryptSettingSecret(secret: string) {
  const iv = crypto.randomBytes(12);
  const key = getSettingsEncryptionKeyV2();
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

function decryptSettingSecretWithKey(value: string, key: Buffer) {
  const [, version, ivHex, tagHex, encryptedHex] = value.split(':');
  if (
    (version !== 'v1' && version !== 'v2') ||
    !ivHex ||
    !tagHex ||
    !encryptedHex
  ) {
    throw new Error('Invalid encrypted settings secret payload.');
  }

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(ivHex, 'hex'),
  );
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

export function decryptSettingSecret(value: string) {
  if (!isEncryptedSettingSecret(value)) {
    return value;
  }

  const versionMarker = value.startsWith(`${SETTINGS_SECRET_PREFIX_V1}:`) ? 'v1' : 'v2';
  const key = versionMarker === 'v1' ? getSettingsEncryptionKeyV1() : getSettingsEncryptionKeyV2();

  return decryptSettingSecretWithKey(value, key);
}
