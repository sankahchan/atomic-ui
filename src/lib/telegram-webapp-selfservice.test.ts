import assert from 'node:assert/strict';
import test from 'node:test';

import {
  bucketDailyUsage,
  getSelfActionEligibility,
  getUsageDayKeys,
} from '../app/api/telegram/webapp/keys/[id]/self-service';

const NOW = new Date('2026-11-24T15:30:00.000Z');

test('getUsageDayKeys returns a contiguous UTC window ending today', () => {
  const keys = getUsageDayKeys(7, NOW);
  assert.equal(keys.length, 7);
  assert.equal(keys[0], '2026-11-18');
  assert.equal(keys[6], '2026-11-24');
});

test('bucketDailyUsage sums deltaBytes per day and fills empty days with zero', () => {
  const days = bucketDailyUsage(
    [
      { deltaBytes: BigInt(100), createdAt: new Date('2026-11-24T01:00:00.000Z') },
      { deltaBytes: BigInt(50), createdAt: new Date('2026-11-24T23:00:00.000Z') },
      { deltaBytes: BigInt(25), createdAt: new Date('2026-11-22T12:00:00.000Z') },
      { deltaBytes: BigInt(999), createdAt: new Date('2026-11-01T12:00:00.000Z') },
    ],
    3,
    NOW,
  );

  assert.deepEqual(days, [
    { date: '2026-11-22', bytes: '25' },
    { date: '2026-11-23', bytes: '0' },
    { date: '2026-11-24', bytes: '150' },
  ]);
});

test('self action eligibility follows selfExtend and requestMoreData gates', () => {
  assert.deepEqual(
    getSelfActionEligibility({
      autoRenewPolicy: 'EXTEND_DURATION',
      autoRenewDurationDays: 30,
      userId: 'user-1',
    }),
    { canExtend: true, extendDays: 30, canRequestData: true },
  );
  assert.deepEqual(
    getSelfActionEligibility({
      autoRenewPolicy: 'NONE',
      autoRenewDurationDays: 30,
      userId: 'user-1',
    }),
    { canExtend: false, extendDays: null, canRequestData: true },
  );
  assert.deepEqual(
    getSelfActionEligibility({
      autoRenewPolicy: 'EXTEND_DURATION',
      autoRenewDurationDays: 7,
      userId: null,
    }),
    { canExtend: true, extendDays: 7, canRequestData: false },
  );
});
