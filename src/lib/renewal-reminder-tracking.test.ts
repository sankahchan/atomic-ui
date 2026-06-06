import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRenewalReminderSnapshotMap,
  deriveRenewalReminderState,
  matchesRenewalReminderQuickFilter,
  summarizeRenewalReminderStates,
} from '@/lib/renewal-reminder-tracking';

test('buildRenewalReminderSnapshotMap keeps the latest reminder and renewal timestamps per key', () => {
  const reminderAt = new Date('2026-06-05T08:00:00.000Z');
  const triggeredAt = new Date('2026-06-05T08:00:02.000Z');
  const renewedAt = new Date('2026-06-05T09:30:00.000Z');

  const snapshots = buildRenewalReminderSnapshotMap([
    {
      entityId: 'key_1',
      action: 'ACCESS_KEY_RENEWAL_REMINDER_SENT',
      _max: { createdAt: reminderAt },
    },
    {
      entityId: 'key_1',
      action: 'ACCESS_KEY_RENEWAL_REMINDER_TRIGGERED',
      _max: { createdAt: triggeredAt },
    },
    {
      entityId: 'key_1',
      action: 'ACCESS_KEY_RENEWED',
      _max: { createdAt: renewedAt },
    },
  ]);

  assert.deepEqual(snapshots.get('key_1'), {
    lastReminderAt: triggeredAt,
    lastRenewedAt: renewedAt,
  });
});

test('deriveRenewalReminderState recognizes cooldown, follow-up, and conversion states', () => {
  const now = new Date('2026-06-06T12:00:00.000Z');

  const neverReminded = deriveRenewalReminderState(null, now);
  assert.equal(neverReminded.neverReminded, true);
  assert.equal(neverReminded.cooldownActive, false);

  const remindedToday = deriveRenewalReminderState({
    lastReminderAt: new Date('2026-06-06T08:30:00.000Z'),
    lastRenewedAt: null,
  }, now);
  assert.equal(remindedToday.remindedToday, true);
  assert.equal(remindedToday.cooldownActive, true);
  assert.equal(remindedToday.pendingFollowUp, false);

  const followUpDue = deriveRenewalReminderState({
    lastReminderAt: new Date('2026-06-05T07:00:00.000Z'),
    lastRenewedAt: null,
  }, now);
  assert.equal(followUpDue.reminded24hAgo, true);
  assert.equal(followUpDue.pendingFollowUp, true);
  assert.equal(followUpDue.cooldownActive, false);

  const converted = deriveRenewalReminderState({
    lastReminderAt: new Date('2026-06-05T07:00:00.000Z'),
    lastRenewedAt: new Date('2026-06-05T09:00:00.000Z'),
  }, now);
  assert.equal(converted.renewedAfterReminder, true);
  assert.equal(converted.pendingFollowUp, false);
  assert.equal(converted.cooldownActive, false);
});

test('renewal reminder helpers support queue filters and summary counts', () => {
  const now = new Date('2026-06-06T12:00:00.000Z');
  const states = [
    deriveRenewalReminderState(null, now),
    deriveRenewalReminderState({ lastReminderAt: new Date('2026-06-06T09:00:00.000Z') }, now),
    deriveRenewalReminderState({ lastReminderAt: new Date('2026-06-05T07:00:00.000Z') }, now),
    deriveRenewalReminderState({
      lastReminderAt: new Date('2026-06-05T07:00:00.000Z'),
      lastRenewedAt: new Date('2026-06-05T09:00:00.000Z'),
    }, now),
  ];

  assert.equal(matchesRenewalReminderQuickFilter(states[0], 'neverReminded'), true);
  assert.equal(matchesRenewalReminderQuickFilter(states[1], 'remindedToday'), true);
  assert.equal(matchesRenewalReminderQuickFilter(states[2], 'reminded24hAgo'), true);
  assert.equal(matchesRenewalReminderQuickFilter(states[3], 'renewedAfterReminder'), true);

  assert.deepEqual(summarizeRenewalReminderStates(states), {
    reminded: 3,
    neverReminded: 1,
    remindedToday: 1,
    renewedAfterReminder: 1,
    pendingFollowUp: 1,
  });
});
