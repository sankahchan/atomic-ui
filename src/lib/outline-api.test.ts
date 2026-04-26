import assert from 'node:assert/strict';
import test from 'node:test';

import {
  OutlineClient,
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
