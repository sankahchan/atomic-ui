import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveRenewalOutreachState } from './renewal-outreach-tracking';
import { compareRenewalQueuePriority } from './renewal-queue-prioritization';

function buildCandidate(input: {
  id: string;
  createdAt: string;
  expiresAt?: string | null;
  status?: string;
  dataLimitBytes?: bigint | null;
  usedBytes?: bigint;
  outreachState?: ReturnType<typeof deriveRenewalOutreachState>;
}) {
  return {
    id: input.id,
    status: input.status ?? 'ACTIVE',
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    dataLimitBytes: input.dataLimitBytes ?? null,
    usedBytes: input.usedBytes ?? BigInt(0),
    createdAt: new Date(input.createdAt),
    outreachState: input.outreachState ?? deriveRenewalOutreachState(null),
  };
}

test('renewal queue priority sorts untouched and unresolved outreach work before resolved outcomes', () => {
  const items = [
    buildCandidate({
      id: 'renewed',
      createdAt: '2026-06-12T10:00:00.000Z',
      outreachState: deriveRenewalOutreachState({
        lastPreparedAt: new Date('2026-06-12T01:00:00.000Z'),
        lastResultAt: new Date('2026-06-12T02:00:00.000Z'),
        lastCompletedAt: new Date('2026-06-12T02:00:00.000Z'),
        lastOutcome: 'RENEWED',
      }),
    }),
    buildCandidate({
      id: 'sent',
      createdAt: '2026-06-12T09:00:00.000Z',
      outreachState: deriveRenewalOutreachState({
        lastPreparedAt: new Date('2026-06-12T01:00:00.000Z'),
        lastResultAt: new Date('2026-06-12T02:00:00.000Z'),
        lastCompletedAt: new Date('2026-06-12T02:00:00.000Z'),
        lastOutcome: 'SENT',
      }),
    }),
    buildCandidate({
      id: 'pending',
      createdAt: '2026-06-12T08:00:00.000Z',
      outreachState: deriveRenewalOutreachState({
        lastPreparedAt: new Date('2026-06-12T01:00:00.000Z'),
      }),
    }),
    buildCandidate({
      id: 'never',
      createdAt: '2026-06-12T07:00:00.000Z',
      outreachState: deriveRenewalOutreachState(null),
    }),
    buildCandidate({
      id: 'no-response',
      createdAt: '2026-06-12T06:00:00.000Z',
      outreachState: deriveRenewalOutreachState({
        lastPreparedAt: new Date('2026-06-12T01:00:00.000Z'),
        lastResultAt: new Date('2026-06-12T03:00:00.000Z'),
        lastCompletedAt: new Date('2026-06-12T03:00:00.000Z'),
        lastOutcome: 'NO_RESPONSE',
      }),
    }),
  ];

  items.sort(compareRenewalQueuePriority);

  assert.deepEqual(
    items.map((item) => item.id),
    ['never', 'pending', 'sent', 'no-response', 'renewed'],
  );
});

test('renewal queue priority uses due urgency inside the same outreach bucket', () => {
  const items = [
    buildCandidate({
      id: 'later-expiry',
      createdAt: '2026-06-12T10:00:00.000Z',
      expiresAt: '2026-06-20T00:00:00.000Z',
      outreachState: deriveRenewalOutreachState(null),
    }),
    buildCandidate({
      id: 'depleted',
      createdAt: '2026-06-12T09:00:00.000Z',
      status: 'DEPLETED',
      dataLimitBytes: BigInt(10),
      usedBytes: BigInt(10),
      outreachState: deriveRenewalOutreachState(null),
    }),
    buildCandidate({
      id: 'earlier-expiry',
      createdAt: '2026-06-12T08:00:00.000Z',
      expiresAt: '2026-06-14T00:00:00.000Z',
      outreachState: deriveRenewalOutreachState(null),
    }),
  ];

  items.sort(compareRenewalQueuePriority);

  assert.deepEqual(
    items.map((item) => item.id),
    ['depleted', 'earlier-expiry', 'later-expiry'],
  );
});
