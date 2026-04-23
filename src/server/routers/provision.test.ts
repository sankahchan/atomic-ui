import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';

import {
  inspectProvisionTokenValue,
  isProvisionTokenValueEncrypted,
  parseProvisionTokenValue,
  serializeProvisionTokenValue,
} from './provision';

const originalSettingsEncryptionKey = process.env.SETTINGS_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.SETTINGS_ENCRYPTION_KEY = 'b'.repeat(64);
});

afterEach(() => {
  if (originalSettingsEncryptionKey === undefined) {
    delete process.env.SETTINGS_ENCRYPTION_KEY;
  } else {
    process.env.SETTINGS_ENCRYPTION_KEY = originalSettingsEncryptionKey;
  }
});

test('serializeProvisionTokenValue encrypts provider tokens before persistence', () => {
  const storedValue = serializeProvisionTokenValue('do-secret-token');

  assert.notEqual(storedValue, JSON.stringify('do-secret-token'));
  assert.equal(parseProvisionTokenValue(storedValue), 'do-secret-token');
});

test('parseProvisionTokenValue accepts legacy plaintext storage', () => {
  assert.equal(parseProvisionTokenValue(JSON.stringify('legacy-token')), 'legacy-token');
});

test('isProvisionTokenValueEncrypted distinguishes migrated values from legacy plaintext', () => {
  assert.equal(isProvisionTokenValueEncrypted(serializeProvisionTokenValue('do-secret-token')), true);
  assert.equal(isProvisionTokenValueEncrypted(JSON.stringify('legacy-token')), false);
});

test('inspectProvisionTokenValue flags legacy provider tokens for explicit migration', () => {
  const result = inspectProvisionTokenValue(JSON.stringify('legacy-token'));

  assert.equal(result.hasToken, true);
  assert.equal(result.token, 'legacy-token');
  assert.equal(result.encrypted, false);
  assert.equal(result.needsMigration, true);
  assert.equal(result.error, null);
});

test('inspectProvisionTokenValue does not treat invalid stored data as configured', () => {
  const result = inspectProvisionTokenValue('{bad-json');

  assert.equal(result.hasToken, false);
  assert.equal(result.needsMigration, false);
  assert.match(result.error ?? '', /could not be decrypted/);
});
