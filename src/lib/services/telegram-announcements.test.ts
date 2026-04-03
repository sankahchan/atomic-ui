import test from 'node:test';
import assert from 'node:assert/strict';

import { computeNextTelegramAnnouncementRun } from '@/lib/services/telegram-announcements';

test('computeNextTelegramAnnouncementRun keeps recurring announcements in the future after missed runs', () => {
  const scheduledFor = new Date('2026-04-01T10:00:00.000Z');
  const now = new Date('2026-04-03T12:30:00.000Z');

  const nextRun = computeNextTelegramAnnouncementRun({
    recurrenceType: 'DAILY',
    scheduledFor,
    now,
  });

  assert.ok(nextRun instanceof Date);
  assert.equal(nextRun?.toISOString(), '2026-04-04T10:00:00.000Z');
});

test('computeNextTelegramAnnouncementRun preserves weekly cadence after a delayed execution', () => {
  const scheduledFor = new Date('2026-04-01T08:15:00.000Z');
  const now = new Date('2026-04-15T09:00:00.000Z');

  const nextRun = computeNextTelegramAnnouncementRun({
    recurrenceType: 'WEEKLY',
    scheduledFor,
    now,
  });

  assert.ok(nextRun instanceof Date);
  assert.equal(nextRun?.toISOString(), '2026-04-22T08:15:00.000Z');
});
