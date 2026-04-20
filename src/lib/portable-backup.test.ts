import assert from 'node:assert/strict';
import test from 'node:test';

import {
  POSTGRES_BACKUP_BUNDLE_DUMP,
  POSTGRES_BACKUP_BUNDLE_FORMAT,
  POSTGRES_BACKUP_BUNDLE_RESTORE_ENV,
  buildPostgresBackupBundleManifest,
  buildPostgresBackupRestoreEnvFile,
} from './portable-backup';

test('buildPostgresBackupBundleManifest describes the portable postgres bundle', () => {
  const manifest = buildPostgresBackupBundleManifest(new Date('2026-04-20T00:00:00.000Z'));

  assert.equal(manifest.format, POSTGRES_BACKUP_BUNDLE_FORMAT);
  assert.equal(manifest.payload, POSTGRES_BACKUP_BUNDLE_DUMP);
  assert.equal(manifest.restoreEnv, POSTGRES_BACKUP_BUNDLE_RESTORE_ENV);
  assert.equal(manifest.createdAt, '2026-04-20T00:00:00.000Z');
});

test('buildPostgresBackupRestoreEnvFile includes only portable restore keys', () => {
  const envFile = buildPostgresBackupRestoreEnvFile({
    SETTINGS_ENCRYPTION_KEY: 'settings-secret',
    TOTP_ENCRYPTION_KEY: 'totp-secret',
    JWT_SECRET: 'jwt-secret',
    TELEGRAM_WEBHOOK_SECRET: 'telegram-secret',
    DATABASE_URL: 'postgresql://do-not-export',
  });

  assert.match(envFile, /SETTINGS_ENCRYPTION_KEY="settings-secret"/);
  assert.match(envFile, /TOTP_ENCRYPTION_KEY="totp-secret"/);
  assert.match(envFile, /JWT_SECRET="jwt-secret"/);
  assert.match(envFile, /TELEGRAM_WEBHOOK_SECRET="telegram-secret"/);
  assert.doesNotMatch(envFile, /DATABASE_URL/);
});
