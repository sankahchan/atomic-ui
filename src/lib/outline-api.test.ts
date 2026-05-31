import assert from 'node:assert/strict';
import test from 'node:test';

import {
  OutlineClient,
  isBlockedHostname,
  isBlockedIpAddress,
  matchesCertificateFingerprint,
  normalizeCertificateFingerprint,
} from './outline-api';

test('normalizeCertificateFingerprint removes separators and uppercases values', () => {
  assert.equal(
    normalizeCertificateFingerprint('aa:bb:cc:dd'),
    'AABBCCDD',
  );
});

test('matchesCertificateFingerprint accepts equivalent SHA-256 formats', () => {
  assert.equal(
    matchesCertificateFingerprint(
      'AA:BB:CC:DD',
      'aabbccdd',
    ),
    true,
  );
});

test('matchesCertificateFingerprint rejects mismatched fingerprints', () => {
  assert.equal(
    matchesCertificateFingerprint(
      'AA:BB:CC:DD',
      'AA:BB:CC:EE',
    ),
    false,
  );
});

test('OutlineClient disables TLS session caching for repeated self-signed requests', () => {
  const client = new OutlineClient('https://example.com/manager', 'AA');
  const agent = (client as unknown as { httpsAgent: { options?: { maxCachedSessions?: number } } }).httpsAgent;

  assert.equal(agent.options?.maxCachedSessions, 0);
});

test('isBlockedIpAddress rejects private, loopback, link-local, and mapped loopback addresses', () => {
  assert.equal(isBlockedIpAddress('127.0.0.1'), true);
  assert.equal(isBlockedIpAddress('10.1.2.3'), true);
  assert.equal(isBlockedIpAddress('172.16.10.9'), true);
  assert.equal(isBlockedIpAddress('192.168.1.5'), true);
  assert.equal(isBlockedIpAddress('169.254.10.20'), true);
  assert.equal(isBlockedIpAddress('::1'), true);
  assert.equal(isBlockedIpAddress('::ffff:127.0.0.1'), true);
  assert.equal(isBlockedIpAddress('8.8.8.8'), false);
});

test('isBlockedHostname rejects localhost-style names and allows public names', () => {
  assert.equal(isBlockedHostname('localhost'), true);
  assert.equal(isBlockedHostname('api.localhost'), true);
  assert.equal(isBlockedHostname('router.local'), true);
  assert.equal(isBlockedHostname('example.com'), false);
});
