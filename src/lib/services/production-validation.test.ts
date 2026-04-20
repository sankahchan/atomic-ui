import assert from 'node:assert/strict';
import test from 'node:test';

import { validateProductionEnvironment } from './production-validation';

const baseEnv = {
  DATABASE_URL: 'postgresql://atomic:secret@127.0.0.1:5432/atomic_ui',
  JWT_SECRET: 'j'.repeat(32),
  TOTP_ENCRYPTION_KEY: 'a'.repeat(64),
  SETTINGS_ENCRYPTION_KEY: 'b'.repeat(64),
  CRON_SECRET: 'c'.repeat(48),
  APP_URL: 'https://panel.example.com',
  NEXT_PUBLIC_APP_URL: 'https://panel.example.com',
  NODE_ENV: 'production',
};

test('validateProductionEnvironment requires SETTINGS_ENCRYPTION_KEY', () => {
  const env = { ...baseEnv, SETTINGS_ENCRYPTION_KEY: '' };
  const result = validateProductionEnvironment(env);

  assert.equal(
    result.errors.includes('SETTINGS_ENCRYPTION_KEY is required for production'),
    true,
  );
});

test('validateProductionEnvironment accepts a strong settings encryption key', () => {
  const result = validateProductionEnvironment(baseEnv);

  assert.equal(result.errors.length, 0);
});
