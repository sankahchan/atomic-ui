import assert from 'node:assert/strict';
import test from 'node:test';

import {
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
