import assert from 'node:assert/strict';
import test from 'node:test';

import { ADMIN_SLOW_ALERT_MIN_CONSECUTIVE, shouldSendAdminSlowAlert } from './health-check';

test('slow admin alerts do not fire on the first slow sample', () => {
  assert.equal(
    shouldSendAdminSlowAlert({
      previousSlowConsecutiveCount: 0,
      currentSlowConsecutiveCount: 1,
      lastNotifiedAt: null,
      notifyCooldownMins: 30,
    }),
    false,
  );
});

test('slow admin alerts fire when the slow streak reaches the sustained threshold', () => {
  assert.equal(ADMIN_SLOW_ALERT_MIN_CONSECUTIVE, 2);
  assert.equal(
    shouldSendAdminSlowAlert({
      previousSlowConsecutiveCount: 1,
      currentSlowConsecutiveCount: 2,
      lastNotifiedAt: null,
      notifyCooldownMins: 30,
    }),
    true,
  );
});

test('slow admin alerts respect the notification cooldown between separate incidents', () => {
  const now = new Date('2026-04-30T03:00:00.000Z');

  assert.equal(
    shouldSendAdminSlowAlert({
      previousSlowConsecutiveCount: 1,
      currentSlowConsecutiveCount: 2,
      lastNotifiedAt: new Date(now.getTime() - 10 * 60_000),
      notifyCooldownMins: 30,
      now: now.getTime(),
    }),
    false,
  );

  assert.equal(
    shouldSendAdminSlowAlert({
      previousSlowConsecutiveCount: 1,
      currentSlowConsecutiveCount: 2,
      lastNotifiedAt: new Date(now.getTime() - 45 * 60_000),
      notifyCooldownMins: 30,
      now: now.getTime(),
    }),
    true,
  );
});

test('slow admin alerts do not repeat while the same slow streak is still in progress', () => {
  assert.equal(
    shouldSendAdminSlowAlert({
      previousSlowConsecutiveCount: 2,
      currentSlowConsecutiveCount: 3,
      lastNotifiedAt: null,
      notifyCooldownMins: 30,
    }),
    false,
  );
});
