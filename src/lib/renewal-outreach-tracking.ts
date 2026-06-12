import { RENEWAL_AUDIT_ACTIONS } from './renewal-reminder-tracking';

export const RENEWAL_OUTREACH_PREPARED_AUDIT_ACTIONS = [
  'ACCESS_KEY_RENEWAL_OUTREACH_COPIED',
  'ACCESS_KEY_RENEWAL_OUTREACH_EXPORTED',
] as const;

export const RENEWAL_OUTREACH_COMPLETED_AUDIT_ACTIONS = [
  'ACCESS_KEY_RENEWAL_OUTREACH_COMPLETED',
] as const;

export const RENEWAL_OUTREACH_AUDIT_ACTIONS = [
  ...RENEWAL_OUTREACH_PREPARED_AUDIT_ACTIONS,
  ...RENEWAL_OUTREACH_COMPLETED_AUDIT_ACTIONS,
] as const;

export type RenewalOutreachSnapshot = {
  lastPreparedAt: Date | null;
  lastCompletedAt: Date | null;
  lastRenewedAt: Date | null;
};

export type RenewalOutreachState = RenewalOutreachSnapshot & {
  preparedThisCycle: boolean;
  completedThisCycle: boolean;
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
    ) {
      if (!snapshot.lastCompletedAt || row.createdAt > snapshot.lastCompletedAt) {
        snapshot.lastCompletedAt = row.createdAt;
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
  const lastRenewedAt = snapshot?.lastRenewedAt ?? null;
  const preparedThisCycle = Boolean(
    lastPreparedAt
    && (!lastRenewedAt || lastPreparedAt.getTime() > lastRenewedAt.getTime()),
  );
  const completedThisCycle = Boolean(
    lastCompletedAt
    && (!lastRenewedAt || lastCompletedAt.getTime() > lastRenewedAt.getTime()),
  );

  return {
    lastPreparedAt,
    lastCompletedAt,
    lastRenewedAt,
    preparedThisCycle,
    completedThisCycle,
    pendingCompletion: preparedThisCycle && !completedThisCycle,
    neverPrepared: !preparedThisCycle,
  };
}
