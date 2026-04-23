import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';

import { decryptSettingSecret, encryptSettingSecret, isEncryptedSettingSecret } from './settings-crypto';

const originalEnv = {
  nodeEnv: process.env.NODE_ENV,
  jwtSecret: process.env.JWT_SECRET,
  settingsEncryptionKey: process.env.SETTINGS_ENCRYPTION_KEY,
};

beforeEach(() => {
  process.env.SETTINGS_ENCRYPTION_KEY = 'a'.repeat(64);
  (process.env as Record<string, string | undefined>).NODE_ENV = 'test';
});

afterEach(() => {
  const mutableEnv = process.env as Record<string, string | undefined>;
  if (originalEnv.nodeEnv === undefined) {
    delete mutableEnv.NODE_ENV;
  } else {
    mutableEnv.NODE_ENV = originalEnv.nodeEnv;
  }

  if (originalEnv.jwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalEnv.jwtSecret;
  }

  if (originalEnv.settingsEncryptionKey === undefined) {
    delete process.env.SETTINGS_ENCRYPTION_KEY;
  } else {
    process.env.SETTINGS_ENCRYPTION_KEY = originalEnv.settingsEncryptionKey;
  }
});

test('encryptSettingSecret stores provider secrets in encrypted form', () => {
  const encrypted = encryptSettingSecret('do-token-123');

  assert.equal(isEncryptedSettingSecret(encrypted), true);
  assert.notEqual(encrypted.includes('do-token-123'), true);
  assert.equal(decryptSettingSecret(encrypted), 'do-token-123');
});

test('decryptSettingSecret preserves legacy plaintext values for backward compatibility', () => {
  assert.equal(decryptSettingSecret('legacy-plaintext-token'), 'legacy-plaintext-token');
});

test('production encryption requires a dedicated settings key', () => {
  (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
  delete process.env.SETTINGS_ENCRYPTION_KEY;

  assert.throws(
    () => encryptSettingSecret('do-token-123'),
    /SETTINGS_ENCRYPTION_KEY must be set in production/,
  );
});

test('development fallback is independent from JWT_SECRET', () => {
  (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
  delete process.env.SETTINGS_ENCRYPTION_KEY;
  process.env.JWT_SECRET = 'first-jwt-secret';

  const encrypted = encryptSettingSecret('do-token-123');
  process.env.JWT_SECRET = 'different-jwt-secret';

  assert.equal(decryptSettingSecret(encrypted), 'do-token-123');
});
