import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRenewalOutreachSnapshotMap,
  deriveRenewalOutreachState,
} from './renewal-outreach-tracking';

test('renewal outreach tracking distinguishes prepared and completed state for the current cycle', () => {
  const preparedAt = new Date('2026-06-12T02:00:00.000Z');
  const completedAt = new Date('2026-06-12T03:00:00.000Z');

  const snapshots = buildRenewalOutreachSnapshotMap([
    {
      entityId: 'key-1',
      action: 'ACCESS_KEY_RENEWAL_OUTREACH_COPIED',
      createdAt: preparedAt,
    },
    {
      entityId: 'key-1',
      action: 'ACCESS_KEY_RENEWAL_OUTREACH_COMPLETED',
      createdAt: completedAt,
    },
  ]);

  const state = deriveRenewalOutreachState(snapshots.get('key-1'));

  assert.equal(state.preparedThisCycle, true);
  assert.equal(state.resultLoggedThisCycle, true);
  assert.equal(state.completedThisCycle, true);
  assert.equal(state.lastOutcome, 'DONE');
  assert.equal(state.lastResultAt?.toISOString(), completedAt.toISOString());
  assert.equal(state.pendingResult, false);
  assert.equal(state.pendingCompletion, false);
  assert.equal(state.neverPrepared, false);
});

test('renewal outreach tracking resets after a renewal starts a new cycle', () => {
  const preparedAt = new Date('2026-06-12T02:00:00.000Z');
  const renewedAt = new Date('2026-06-12T04:00:00.000Z');

  const snapshots = buildRenewalOutreachSnapshotMap([
    {
      entityId: 'key-2',
      action: 'ACCESS_KEY_RENEWAL_OUTREACH_EXPORTED',
      createdAt: preparedAt,
    },
    {
      entityId: 'key-2',
      action: 'ACCESS_KEY_RENEWED',
      createdAt: renewedAt,
    },
  ]);

  const state = deriveRenewalOutreachState(snapshots.get('key-2'));

  assert.equal(state.preparedThisCycle, false);
  assert.equal(state.resultLoggedThisCycle, false);
  assert.equal(state.completedThisCycle, false);
  assert.equal(state.pendingResult, false);
  assert.equal(state.pendingCompletion, false);
  assert.equal(state.neverPrepared, true);
});

test('renewal outreach tracking keeps the latest explicit outcome for the current cycle', () => {
  const sentAt = new Date('2026-06-12T02:00:00.000Z');
  const repliedAt = new Date('2026-06-12T05:00:00.000Z');

  const snapshots = buildRenewalOutreachSnapshotMap([
    {
      entityId: 'key-3',
      action: 'ACCESS_KEY_RENEWAL_OUTREACH_SENT',
      createdAt: sentAt,
    },
    {
      entityId: 'key-3',
      action: 'ACCESS_KEY_RENEWAL_OUTREACH_REPLIED',
      createdAt: repliedAt,
    },
  ]);

  const state = deriveRenewalOutreachState(snapshots.get('key-3'));

  assert.equal(state.resultLoggedThisCycle, true);
  assert.equal(state.completedThisCycle, true);
  assert.equal(state.lastOutcome, 'REPLIED');
  assert.equal(state.lastResultAt?.toISOString(), repliedAt.toISOString());
});
