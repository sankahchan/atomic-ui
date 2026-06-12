import { RENEWAL_AUDIT_ACTIONS } from './renewal-reminder-tracking';

export const RENEWAL_OUTREACH_PREPARED_AUDIT_ACTIONS = [
  'ACCESS_KEY_RENEWAL_OUTREACH_COPIED',
  'ACCESS_KEY_RENEWAL_OUTREACH_EXPORTED',
] as const;

export const RENEWAL_OUTREACH_COMPLETED_AUDIT_ACTIONS = [
  'ACCESS_KEY_RENEWAL_OUTREACH_COMPLETED',
] as const;

export const RENEWAL_OUTREACH_RESULT_ACTIONS_BY_OUTCOME = {
  DONE: 'ACCESS_KEY_RENEWAL_OUTREACH_COMPLETED',
  SENT: 'ACCESS_KEY_RENEWAL_OUTREACH_SENT',
  REPLIED: 'ACCESS_KEY_RENEWAL_OUTREACH_REPLIED',
  RENEWED: 'ACCESS_KEY_RENEWAL_OUTREACH_RENEWED',
  NO_RESPONSE: 'ACCESS_KEY_RENEWAL_OUTREACH_NO_RESPONSE',
} as const;

export const RENEWAL_OUTREACH_RESULT_OUTCOMES = Object.keys(
  RENEWAL_OUTREACH_RESULT_ACTIONS_BY_OUTCOME,
) as Array<keyof typeof RENEWAL_OUTREACH_RESULT_ACTIONS_BY_OUTCOME>;

export type RenewalOutreachResultOutcome =
  keyof typeof RENEWAL_OUTREACH_RESULT_ACTIONS_BY_OUTCOME;

export const RENEWAL_OUTREACH_RESULT_AUDIT_ACTIONS = Object.values(
  RENEWAL_OUTREACH_RESULT_ACTIONS_BY_OUTCOME,
) as Array<(typeof RENEWAL_OUTREACH_RESULT_ACTIONS_BY_OUTCOME)[RenewalOutreachResultOutcome]>;

export const RENEWAL_OUTREACH_AUDIT_ACTIONS = [
  ...RENEWAL_OUTREACH_PREPARED_AUDIT_ACTIONS,
  ...RENEWAL_OUTREACH_COMPLETED_AUDIT_ACTIONS,
  ...RENEWAL_OUTREACH_RESULT_AUDIT_ACTIONS,
] as const;

export type RenewalOutreachSnapshot = {
  lastPreparedAt: Date | null;
  lastCompletedAt: Date | null;
  lastResultAt: Date | null;
  lastOutcome: RenewalOutreachResultOutcome | null;
  lastRenewedAt: Date | null;
};

export type RenewalOutreachState = RenewalOutreachSnapshot & {
  preparedThisCycle: boolean;
  resultLoggedThisCycle: boolean;
  completedThisCycle: boolean;
  pendingResult: boolean;
  pendingCompletion: boolean;
  neverPrepared: boolean;
};

export type RenewalOutreachAuditRow = {
  entityId: string | null;
  action: string;
  createdAt: Date;
};

export function buildRenewalOutreachSnapshotMap(rows: RenewalOutreachAuditRow[]) {
  const snapshots = new Map<string, RenewalOutreachSnapshot>();

  for (const row of rows) {
    if (!row.entityId) {
      continue;
    }

    const snapshot = snapshots.get(row.entityId) ?? {
      lastPreparedAt: null,
      lastCompletedAt: null,
      lastResultAt: null,
      lastOutcome: null,
      lastRenewedAt: null,
    };

    if (
      RENEWAL_OUTREACH_PREPARED_AUDIT_ACTIONS.includes(
        row.action as (typeof RENEWAL_OUTREACH_PREPARED_AUDIT_ACTIONS)[number],
      )
    ) {
      if (!snapshot.lastPreparedAt || row.createdAt > snapshot.lastPreparedAt) {
        snapshot.lastPreparedAt = row.createdAt;
      }
    }

    if (
      RENEWAL_OUTREACH_COMPLETED_AUDIT_ACTIONS.includes(
        row.action as (typeof RENEWAL_OUTREACH_COMPLETED_AUDIT_ACTIONS)[number],
      )
      || RENEWAL_OUTREACH_RESULT_AUDIT_ACTIONS.includes(
        row.action as (typeof RENEWAL_OUTREACH_RESULT_AUDIT_ACTIONS)[number],
      )
    ) {
      if (!snapshot.lastCompletedAt || row.createdAt > snapshot.lastCompletedAt) {
        snapshot.lastCompletedAt = row.createdAt;
      }

      if (!snapshot.lastResultAt || row.createdAt > snapshot.lastResultAt) {
        snapshot.lastResultAt = row.createdAt;
        snapshot.lastOutcome = getRenewalOutreachOutcomeForAction(row.action);
      }
    }

    if (RENEWAL_AUDIT_ACTIONS.includes(row.action as (typeof RENEWAL_AUDIT_ACTIONS)[number])) {
      if (!snapshot.lastRenewedAt || row.createdAt > snapshot.lastRenewedAt) {
        snapshot.lastRenewedAt = row.createdAt;
      }
    }

    snapshots.set(row.entityId, snapshot);
  }

  return snapshots;
}

export function deriveRenewalOutreachState(
  snapshot?: Partial<RenewalOutreachSnapshot> | null,
): RenewalOutreachState {
  const lastPreparedAt = snapshot?.lastPreparedAt ?? null;
  const lastCompletedAt = snapshot?.lastCompletedAt ?? null;
  const lastResultAt = snapshot?.lastResultAt ?? null;
  const lastOutcome = snapshot?.lastOutcome ?? null;
  const lastRenewedAt = snapshot?.lastRenewedAt ?? null;
  const preparedThisCycle = Boolean(
    lastPreparedAt
    && (!lastRenewedAt || lastPreparedAt.getTime() > lastRenewedAt.getTime()),
  );
  const resultLoggedThisCycle = Boolean(
    lastResultAt
    && (!lastRenewedAt || lastResultAt.getTime() > lastRenewedAt.getTime()),
  );
  const completedThisCycle = resultLoggedThisCycle;

  return {
    lastPreparedAt,
    lastCompletedAt,
    lastResultAt,
    lastOutcome,
    lastRenewedAt,
    preparedThisCycle,
    resultLoggedThisCycle,
    completedThisCycle,
    pendingResult: preparedThisCycle && !resultLoggedThisCycle,
    pendingCompletion: preparedThisCycle && !resultLoggedThisCycle,
    neverPrepared: !preparedThisCycle,
  };
}

function getRenewalOutreachOutcomeForAction(action: string): RenewalOutreachResultOutcome | null {
  for (const [outcome, outcomeAction] of Object.entries(RENEWAL_OUTREACH_RESULT_ACTIONS_BY_OUTCOME)) {
    if (outcomeAction === action) {
      return outcome as RenewalOutreachResultOutcome;
    }
  }

  return null;
}
