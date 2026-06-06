export const RENEWAL_AUDIT_ACTIONS = [
  'ACCESS_KEY_RENEWED',
  'ACCESS_KEY_RENEWED_BULK',
] as const;

export const RENEWAL_REMINDER_AUDIT_ACTIONS = [
  'ACCESS_KEY_RENEWAL_REMINDER_SENT',
  'ACCESS_KEY_RENEWAL_REMINDER_TRIGGERED',
] as const;

export const RENEWAL_REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export type RenewalReminderQuickFilter =
  | 'neverReminded'
  | 'remindedToday'
  | 'reminded24hAgo'
  | 'renewedAfterReminder';

export type RenewalReminderSnapshot = {
  lastReminderAt: Date | null;
  lastRenewedAt: Date | null;
};

export type RenewalReminderState = RenewalReminderSnapshot & {
  neverReminded: boolean;
  remindedToday: boolean;
  reminded24hAgo: boolean;
  renewedAfterReminder: boolean;
  pendingFollowUp: boolean;
  cooldownActive: boolean;
  cooldownUntil: Date | null;
};

export type RenewalReminderAuditMaxRow = {
  entityId: string | null;
  action: string;
  _max: {
    createdAt: Date | null;
  };
};

export type RenewalReminderSummary = {
  reminded: number;
  neverReminded: number;
  remindedToday: number;
  renewedAfterReminder: number;
  pendingFollowUp: number;
};

function isSameLocalDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

export function buildRenewalReminderSnapshotMap(rows: RenewalReminderAuditMaxRow[]) {
  const snapshots = new Map<string, RenewalReminderSnapshot>();

  for (const row of rows) {
    if (!row.entityId || !row._max.createdAt) {
      continue;
    }

    const snapshot = snapshots.get(row.entityId) ?? {
      lastReminderAt: null,
      lastRenewedAt: null,
    };

    if (RENEWAL_REMINDER_AUDIT_ACTIONS.includes(row.action as (typeof RENEWAL_REMINDER_AUDIT_ACTIONS)[number])) {
      if (!snapshot.lastReminderAt || row._max.createdAt > snapshot.lastReminderAt) {
        snapshot.lastReminderAt = row._max.createdAt;
      }
    }

    if (RENEWAL_AUDIT_ACTIONS.includes(row.action as (typeof RENEWAL_AUDIT_ACTIONS)[number])) {
      if (!snapshot.lastRenewedAt || row._max.createdAt > snapshot.lastRenewedAt) {
        snapshot.lastRenewedAt = row._max.createdAt;
      }
    }

    snapshots.set(row.entityId, snapshot);
  }

  return snapshots;
}

export function deriveRenewalReminderState(
  snapshot?: Partial<RenewalReminderSnapshot> | null,
  now = new Date(),
): RenewalReminderState {
  const lastReminderAt = snapshot?.lastReminderAt ?? null;
  const lastRenewedAt = snapshot?.lastRenewedAt ?? null;
  const neverReminded = !lastReminderAt;
  const renewedAfterReminder = Boolean(
    lastReminderAt
    && lastRenewedAt
    && lastRenewedAt.getTime() > lastReminderAt.getTime(),
  );
  const remindedToday = Boolean(lastReminderAt && isSameLocalDay(lastReminderAt, now));
  const reminded24hAgo = Boolean(
    lastReminderAt
    && !renewedAfterReminder
    && now.getTime() - lastReminderAt.getTime() >= RENEWAL_REMINDER_COOLDOWN_MS,
  );
  const cooldownActive = Boolean(
    lastReminderAt
    && !renewedAfterReminder
    && now.getTime() - lastReminderAt.getTime() < RENEWAL_REMINDER_COOLDOWN_MS,
  );
  const cooldownUntil = lastReminderAt
    ? new Date(lastReminderAt.getTime() + RENEWAL_REMINDER_COOLDOWN_MS)
    : null;

  return {
    lastReminderAt,
    lastRenewedAt,
    neverReminded,
    remindedToday,
    reminded24hAgo,
    renewedAfterReminder,
    pendingFollowUp: reminded24hAgo,
    cooldownActive,
    cooldownUntil,
  };
}

export function matchesRenewalReminderQuickFilter(
  state: RenewalReminderState,
  filter: RenewalReminderQuickFilter,
) {
  switch (filter) {
    case 'neverReminded':
      return state.neverReminded;
    case 'remindedToday':
      return state.remindedToday;
    case 'reminded24hAgo':
      return state.reminded24hAgo;
    case 'renewedAfterReminder':
      return state.renewedAfterReminder;
    default:
      return false;
  }
}

export function summarizeRenewalReminderStates(states: Iterable<RenewalReminderState>): RenewalReminderSummary {
  const summary: RenewalReminderSummary = {
    reminded: 0,
    neverReminded: 0,
    remindedToday: 0,
    renewedAfterReminder: 0,
    pendingFollowUp: 0,
  };

  for (const state of states) {
    if (state.neverReminded) {
      summary.neverReminded += 1;
    } else {
      summary.reminded += 1;
    }

    if (state.remindedToday) {
      summary.remindedToday += 1;
    }

    if (state.renewedAfterReminder) {
      summary.renewedAfterReminder += 1;
    }

    if (state.pendingFollowUp) {
      summary.pendingFollowUp += 1;
    }
  }

  return summary;
}
