import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateNextRotation, isStandaloneAccessKeyRotationDue } from './key-rotation';

test('calculateNextRotation supports each scheduled interval', () => {
  const base = new Date('2026-04-13T00:00:00.000Z');

  assert.equal(calculateNextRotation('NEVER', base), null);
  assert.equal(calculateNextRotation('DAILY', base)?.toISOString(), '2026-04-14T00:00:00.000Z');
  assert.equal(calculateNextRotation('WEEKLY', base)?.toISOString(), '2026-04-20T00:00:00.000Z');
  assert.equal(calculateNextRotation('BIWEEKLY', base)?.toISOString(), '2026-04-27T00:00:00.000Z');
  assert.equal(calculateNextRotation('MONTHLY', base)?.toISOString(), '2026-05-13T00:00:00.000Z');
});

test('isStandaloneAccessKeyRotationDue only returns true for active enabled due keys', () => {
  const now = new Date('2026-04-13T12:00:00.000Z');

  assert.equal(
    isStandaloneAccessKeyRotationDue({
      rotationEnabled: true,
      status: 'ACTIVE',
      nextRotationAt: new Date('2026-04-13T11:59:59.000Z'),
      now,
    }),
    true,
  );

  assert.equal(
    isStandaloneAccessKeyRotationDue({
      rotationEnabled: false,
      status: 'ACTIVE',
      nextRotationAt: new Date('2026-04-13T11:59:59.000Z'),
      now,
    }),
    false,
  );

  assert.equal(
    isStandaloneAccessKeyRotationDue({
      rotationEnabled: true,
      status: 'DISABLED',
      nextRotationAt: new Date('2026-04-13T11:59:59.000Z'),
      now,
    }),
    false,
  );

  assert.equal(
    isStandaloneAccessKeyRotationDue({
      rotationEnabled: true,
      status: 'ACTIVE',
      nextRotationAt: new Date('2026-04-13T12:00:01.000Z'),
      now,
    }),
    false,
  );
});
