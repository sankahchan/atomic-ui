import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRenewalOutreachSnapshotMap,
  deriveRenewalOutreachState,
  matchesRenewalOutreachQuickFilter,
  summarizeRenewalOutreachStates,
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

test('renewal outreach quick filters and summaries reflect current-cycle state', () => {
  const pendingResult = deriveRenewalOutreachState({
    lastPreparedAt: new Date('2026-06-12T02:00:00.000Z'),
  });
  const replied = deriveRenewalOutreachState({
    lastPreparedAt: new Date('2026-06-12T02:00:00.000Z'),
    lastCompletedAt: new Date('2026-06-12T05:00:00.000Z'),
    lastResultAt: new Date('2026-06-12T05:00:00.000Z'),
    lastOutcome: 'REPLIED',
  });
  const renewed = deriveRenewalOutreachState({
    lastPreparedAt: new Date('2026-06-12T02:00:00.000Z'),
    lastCompletedAt: new Date('2026-06-12T06:00:00.000Z'),
    lastResultAt: new Date('2026-06-12T06:00:00.000Z'),
    lastOutcome: 'RENEWED',
  });
  const noResponse = deriveRenewalOutreachState({
    lastPreparedAt: new Date('2026-06-12T02:00:00.000Z'),
    lastCompletedAt: new Date('2026-06-12T07:00:00.000Z'),
    lastResultAt: new Date('2026-06-12T07:00:00.000Z'),
    lastOutcome: 'NO_RESPONSE',
  });
  const none = deriveRenewalOutreachState(null);

  assert.equal(matchesRenewalOutreachQuickFilter(pendingResult, 'outreachPendingResult'), true);
  assert.equal(matchesRenewalOutreachQuickFilter(replied, 'outreachReplied'), true);
  assert.equal(matchesRenewalOutreachQuickFilter(renewed, 'outreachRenewed'), true);
  assert.equal(matchesRenewalOutreachQuickFilter(noResponse, 'outreachNoResponse'), true);
  assert.equal(matchesRenewalOutreachQuickFilter(none, 'outreachNeverPrepared'), true);
  assert.equal(matchesRenewalOutreachQuickFilter(none, 'outreachRenewed'), false);

  assert.deepEqual(
    summarizeRenewalOutreachStates([pendingResult, replied, renewed, noResponse, none]),
    {
      tracked: 4,
      neverPrepared: 1,
      pendingResult: 1,
      sent: 0,
      replied: 1,
      renewed: 1,
      noResponse: 1,
      done: 0,
    },
  );
});
