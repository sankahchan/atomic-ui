import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addCalendarMonths,
  getRenewalBaseDate,
  resolveRenewedAccessKeyStatus,
} from './access-key-renewal';

test('addCalendarMonths clamps to the last day of the target month', () => {
  const result = addCalendarMonths(new Date('2026-01-31T12:00:00Z'), 1);

  assert.equal(result.getUTCFullYear(), 2026);
  assert.equal(result.getUTCMonth(), 1);
  assert.equal(result.getUTCDate(), 28);
});

test('getRenewalBaseDate uses the future expiry when it exists', () => {
  const now = new Date('2026-06-02T00:00:00Z');
  const futureExpiry = new Date('2026-06-20T00:00:00Z');

  const result = getRenewalBaseDate(futureExpiry, now);

  assert.equal(result.toISOString(), futureExpiry.toISOString());
});

test('getRenewalBaseDate uses now when the current expiry is already in the past', () => {
  const now = new Date('2026-06-02T00:00:00Z');
  const pastExpiry = new Date('2026-05-20T00:00:00Z');

  const result = getRenewalBaseDate(pastExpiry, now);

  assert.equal(result.toISOString(), now.toISOString());
});

test('resolveRenewedAccessKeyStatus marks exhausted limited keys as depleted', () => {
  assert.equal(
    resolveRenewedAccessKeyStatus({
      usedBytes: BigInt(12),
      dataLimitBytes: BigInt(10),
    }),
    'DEPLETED',
  );

  assert.equal(
    resolveRenewedAccessKeyStatus({
      usedBytes: BigInt(12),
      dataLimitBytes: BigInt(20),
    }),
    'ACTIVE',
  );
});
