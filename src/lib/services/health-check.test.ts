import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ADMIN_SLOW_ALERT_MIN_CONSECUTIVE,
  buildServerSlowAdminAlertMessage,
  buildSlowAutoMigrationBlockedAlertMessage,
  buildSlowAutoMigrationFailedAlertMessage,
  buildSlowAutoMigrationStartedAlertMessage,
  shouldSendAdminSlowAlert,
} from './health-check';
import { validateTelegramHtmlMessage } from './telegram-message-validation';

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

test('slow admin alert messages stay compact and html-safe', () => {
  const messages = [
    buildServerSlowAdminAlertMessage({
      serverName: 'SG <primary>',
      consecutiveSlowCount: 2,
      latencyMs: 650,
      thresholdMs: 500,
    }),
    buildSlowAutoMigrationBlockedAlertMessage({
      serverName: 'SG <primary>',
      consecutiveSlowCount: 4,
    }),
    buildSlowAutoMigrationStartedAlertMessage({
      sourceServerName: 'SG <primary>',
      targetServerName: 'MY & fallback',
      consecutiveSlowCount: 4,
      latencyMs: 900,
      thresholdMs: 500,
    }),
    buildSlowAutoMigrationFailedAlertMessage({
      serverName: 'SG <primary>',
      consecutiveSlowCount: 4,
      error: 'target <not found>',
    }),
  ];

  for (const message of messages) {
    assert.deepEqual(validateTelegramHtmlMessage(message), { valid: true, invalidTags: [] });
    assert.ok(message.split('\n').length <= 3);
    assert.doesNotMatch(message, /auto-migration/i);
    assert.doesNotMatch(message, /currently available/i);
    assert.doesNotMatch(message, /could not complete/i);
    assert.match(message, /&lt;primary&gt;|MY &amp; fallback|target &lt;not found&gt;/);
  }
});
