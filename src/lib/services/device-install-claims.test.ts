import test from 'node:test';
import assert from 'node:assert/strict';

import {
  appendDeviceInstallToken,
  DEVICE_INSTALL_QUERY_PARAM,
  generateDeviceInstallToken,
  hashDeviceInstallToken,
  normalizeDeviceInstallToken,
  shouldUseBoundDeviceInstalls,
} from '@/lib/services/device-install-claims';

test('normalizeDeviceInstallToken rejects blank and too-short values', () => {
  assert.equal(normalizeDeviceInstallToken(''), null);
  assert.equal(normalizeDeviceInstallToken('   '), null);
  assert.equal(normalizeDeviceInstallToken('short-token'), null);
});

test('normalizeDeviceInstallToken keeps valid tokens intact after trimming', () => {
  const token = '  12345678-1234-1234-1234-123456789abc  ';
  assert.equal(normalizeDeviceInstallToken(token), '12345678-1234-1234-1234-123456789abc');
});

test('generateDeviceInstallToken produces a claimable token', () => {
  const token = generateDeviceInstallToken();
  assert.equal(typeof token, 'string');
  assert.ok(token.length >= 12);
  assert.equal(normalizeDeviceInstallToken(token), token);
});

test('hashDeviceInstallToken is deterministic', () => {
  const token = '12345678-1234-1234-1234-123456789abc';
  assert.equal(hashDeviceInstallToken(token), hashDeviceInstallToken(token));
});

test('shouldUseBoundDeviceInstalls only enables when both limit and flag are present', () => {
  assert.equal(shouldUseBoundDeviceInstalls({ maxDevices: 1, boundDeviceInstallsOnly: true }), true);
  assert.equal(shouldUseBoundDeviceInstalls({ maxDevices: null, boundDeviceInstallsOnly: true }), false);
  assert.equal(shouldUseBoundDeviceInstalls({ maxDevices: 2, boundDeviceInstallsOnly: false }), false);
});

test('appendDeviceInstallToken decorates URLs without losing existing query params', () => {
  const token = '12345678-1234-1234-1234-123456789abc';
  const url = appendDeviceInstallToken('https://example.com/sub/test?audience=page', token);
  const parsed = new URL(url);

  assert.equal(parsed.searchParams.get('audience'), 'page');
  assert.equal(parsed.searchParams.get(DEVICE_INSTALL_QUERY_PARAM), token);
});

test('appendDeviceInstallToken leaves URL unchanged when token is invalid', () => {
  const url = 'https://example.com/sub/test';
  assert.equal(appendDeviceInstallToken(url, 'bad-token'), url);
});
