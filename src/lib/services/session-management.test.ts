import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONNECTION_SESSION_TIMEOUT_MS,
  getConnectionSessionDurationMinutes,
  isConnectionSessionStale,
} from './session-management';

test('isConnectionSessionStale only flags sessions beyond the timeout', () => {
  const now = new Date('2026-03-07T12:05:00.000Z');
  const exactThreshold = new Date(now.getTime() - CONNECTION_SESSION_TIMEOUT_MS);
  const beyondThreshold = new Date(now.getTime() - CONNECTION_SESSION_TIMEOUT_MS - 1);

  assert.equal(isConnectionSessionStale(exactThreshold, now), false);
  assert.equal(isConnectionSessionStale(beyondThreshold, now), true);
});

test('getConnectionSessionDurationMinutes uses endedAt when present', () => {
  const startedAt = new Date('2026-03-07T12:00:00.000Z');
  const endedAt = new Date('2026-03-07T12:17:29.000Z');

  assert.equal(
    getConnectionSessionDurationMinutes(
      {
        startedAt,
        endedAt,
      },
      new Date('2026-03-07T13:00:00.000Z'),
    ),
    17,
  );
});

test('getConnectionSessionDurationMinutes uses current time for active sessions', () => {
  assert.equal(
    getConnectionSessionDurationMinutes(
      {
        startedAt: new Date('2026-03-07T12:00:00.000Z'),
        endedAt: null,
      },
      new Date('2026-03-07T12:08:31.000Z'),
    ),
    9,
  );
});
