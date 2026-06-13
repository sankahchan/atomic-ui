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

export const RENEWAL_OUTREACH_AGE_QUICK_FILTERS = [
  'outreachOlderThan24h',
  'outreachOlderThan72h',
] as const;

export type RenewalOutreachAgeQuickFilter =
  (typeof RENEWAL_OUTREACH_AGE_QUICK_FILTERS)[number];

export const RENEWAL_OUTREACH_QUICK_FILTERS = [
  'outreachNeverPrepared',
  'outreachPendingResult',
  'outreachSent',
  'outreachReplied',
  'outreachRenewed',
  'outreachNoResponse',
  'outreachDone',
] as const;

export type RenewalOutreachQuickFilter = (typeof RENEWAL_OUTREACH_QUICK_FILTERS)[number];

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

export type RenewalOutreachSummary = {
  tracked: number;
  neverPrepared: number;
  pendingResult: number;
  sent: number;
  replied: number;
  renewed: number;
  noResponse: number;
  done: number;
};

export type RenewalOutreachStaleSummary = {
  olderThan24h: number;
  olderThan72h: number;
  pendingResult24h: number;
  pendingResult72h: number;
  sent24h: number;
  sent72h: number;
  noResponse24h: number;
  noResponse72h: number;
};

export type RenewalOutreachAuditRow = {
  entityId: string | null;
  action: string;
  createdAt: Date;
};

type RenewalOutreachCurrentCycleActivitySource = Partial<
  Pick<
    RenewalOutreachState,
    | 'lastPreparedAt'
    | 'lastCompletedAt'
    | 'lastResultAt'
    | 'preparedThisCycle'
    | 'resultLoggedThisCycle'
    | 'completedThisCycle'
    | 'pendingResult'
    | 'pendingCompletion'
  >
>;

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

export function getRenewalOutreachCurrentCycleActivityAt(
  source?: RenewalOutreachCurrentCycleActivitySource | null,
): Date | null {
  const lastPreparedAt = source?.lastPreparedAt ?? null;
  const lastCompletedAt = source?.lastCompletedAt ?? null;
  const lastResultAt = source?.lastResultAt ?? null;

  if ((source?.resultLoggedThisCycle || source?.completedThisCycle) && (lastResultAt || lastCompletedAt)) {
    return lastResultAt ?? lastCompletedAt;
  }

  if (
    (source?.pendingResult || source?.pendingCompletion || source?.preparedThisCycle)
    && lastPreparedAt
  ) {
    return lastPreparedAt;
  }

  return null;
}

export function getRenewalOutreachCurrentCycleActivityAgeHours(
  source?: RenewalOutreachCurrentCycleActivitySource | null,
  now = new Date(),
): number | null {
  const activityAt = getRenewalOutreachCurrentCycleActivityAt(source);
  if (!activityAt) {
    return null;
  }

  return Math.max(0, (now.getTime() - activityAt.getTime()) / (60 * 60 * 1000));
}

export function isRenewalOutreachFollowUpStale(
  state: RenewalOutreachState,
  thresholdHours: number,
  now = new Date(),
) {
  const needsFollowUp =
    state.pendingResult
    || (state.resultLoggedThisCycle && (state.lastOutcome === 'SENT' || state.lastOutcome === 'NO_RESPONSE'));
  const ageHours = getRenewalOutreachCurrentCycleActivityAgeHours(state, now);

  return Boolean(needsFollowUp && ageHours != null && ageHours >= thresholdHours);
}

export function matchesRenewalOutreachAgeQuickFilter(
  state: RenewalOutreachState,
  filter: RenewalOutreachAgeQuickFilter,
  now = new Date(),
) {
  switch (filter) {
    case 'outreachOlderThan72h':
      return isRenewalOutreachFollowUpStale(state, 72, now);
    case 'outreachOlderThan24h':
    default:
      return isRenewalOutreachFollowUpStale(state, 24, now);
  }
}

export function matchesRenewalOutreachQuickFilter(
  state: RenewalOutreachState,
  filter: RenewalOutreachQuickFilter,
) {
  switch (filter) {
    case 'outreachNeverPrepared':
      return state.neverPrepared;
    case 'outreachPendingResult':
      return state.pendingResult;
    case 'outreachSent':
      return state.resultLoggedThisCycle && state.lastOutcome === 'SENT';
    case 'outreachReplied':
      return state.resultLoggedThisCycle && state.lastOutcome === 'REPLIED';
    case 'outreachRenewed':
      return state.resultLoggedThisCycle && state.lastOutcome === 'RENEWED';
    case 'outreachNoResponse':
      return state.resultLoggedThisCycle && state.lastOutcome === 'NO_RESPONSE';
    case 'outreachDone':
      return state.resultLoggedThisCycle && state.lastOutcome === 'DONE';
    default:
      return false;
  }
}

export function summarizeRenewalOutreachStates(states: Iterable<RenewalOutreachState>): RenewalOutreachSummary {
  const summary: RenewalOutreachSummary = {
    tracked: 0,
    neverPrepared: 0,
    pendingResult: 0,
    sent: 0,
    replied: 0,
    renewed: 0,
    noResponse: 0,
    done: 0,
  };

  for (const state of states) {
    if (state.preparedThisCycle) {
      summary.tracked += 1;
    } else {
      summary.neverPrepared += 1;
    }

    if (state.pendingResult) {
      summary.pendingResult += 1;
    }

    if (!state.resultLoggedThisCycle || !state.lastOutcome) {
      continue;
    }

    switch (state.lastOutcome) {
      case 'SENT':
        summary.sent += 1;
        break;
      case 'REPLIED':
        summary.replied += 1;
        break;
      case 'RENEWED':
        summary.renewed += 1;
        break;
      case 'NO_RESPONSE':
        summary.noResponse += 1;
        break;
      case 'DONE':
        summary.done += 1;
        break;
      default:
        break;
    }
  }

  return summary;
}

export function summarizeRenewalOutreachStaleStates(
  states: Iterable<RenewalOutreachState>,
  now = new Date(),
): RenewalOutreachStaleSummary {
  const summary: RenewalOutreachStaleSummary = {
    olderThan24h: 0,
    olderThan72h: 0,
    pendingResult24h: 0,
    pendingResult72h: 0,
    sent24h: 0,
    sent72h: 0,
    noResponse24h: 0,
    noResponse72h: 0,
  };

  for (const state of states) {
    const olderThan24h = isRenewalOutreachFollowUpStale(state, 24, now);
    const olderThan72h = isRenewalOutreachFollowUpStale(state, 72, now);

    if (olderThan24h) {
      summary.olderThan24h += 1;
    }

    if (olderThan72h) {
      summary.olderThan72h += 1;
    }

    if (state.pendingResult) {
      if (olderThan24h) {
        summary.pendingResult24h += 1;
      }
      if (olderThan72h) {
        summary.pendingResult72h += 1;
      }
      continue;
    }

    if (!state.resultLoggedThisCycle || !state.lastOutcome) {
      continue;
    }

    if (state.lastOutcome === 'SENT') {
      if (olderThan24h) {
        summary.sent24h += 1;
      }
      if (olderThan72h) {
        summary.sent72h += 1;
      }
      continue;
    }

    if (state.lastOutcome === 'NO_RESPONSE') {
      if (olderThan24h) {
        summary.noResponse24h += 1;
      }
      if (olderThan72h) {
        summary.noResponse72h += 1;
      }
    }
  }

  return summary;
}

function getRenewalOutreachOutcomeForAction(action: string): RenewalOutreachResultOutcome | null {
  for (const [outcome, outcomeAction] of Object.entries(RENEWAL_OUTREACH_RESULT_ACTIONS_BY_OUTCOME)) {
    if (outcomeAction === action) {
      return outcome as RenewalOutreachResultOutcome;
    }
  }

  return null;
}
