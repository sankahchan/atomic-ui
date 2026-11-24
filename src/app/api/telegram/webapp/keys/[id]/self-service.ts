export type UsageDay = { date: string; bytes: string };
export type UsageSnapshotRow = { deltaBytes: bigint; createdAt: Date };

type EligibilityKey = {
  autoRenewPolicy: string | null;
  autoRenewDurationDays: number | null;
  userId: string | null;
};

export function getUsageDayKeys(days: number, now = new Date()): string[] {
  const cursor = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1)),
  );
  const dayKeys: string[] = [];
  for (let index = 0; index < days; index += 1) {
    dayKeys.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dayKeys;
}

/**
 * Bucket UsageSnapshot.deltaBytes into UTC day buckets, filling empty days
 * with zero. Mirrors the daily bucketing used by the dashboard/analytics code.
 */
export function bucketDailyUsage(
  snapshots: UsageSnapshotRow[],
  days: number,
  now = new Date(),
): UsageDay[] {
  const totals = new Map<string, bigint>();
  for (const snapshot of snapshots) {
    const date = snapshot.createdAt.toISOString().slice(0, 10);
    totals.set(date, (totals.get(date) ?? BigInt(0)) + snapshot.deltaBytes);
  }

  return getUsageDayKeys(days, now).map((date) => ({
    date,
    bytes: (totals.get(date) ?? BigInt(0)).toString(),
  }));
}

/**
 * Eligibility mirrors keys.selfExtend and keys.requestMoreData: only keys
 * configured for EXTEND_DURATION can self-extend, and only keys assigned to a
 * user can have a data request filed.
 */
export function getSelfActionEligibility(key: EligibilityKey) {
  const extendDays =
    key.autoRenewPolicy === 'EXTEND_DURATION' && key.autoRenewDurationDays
      ? key.autoRenewDurationDays
      : null;

  return {
    canExtend: extendDays !== null,
    extendDays,
    canRequestData: Boolean(key.userId),
  };
}
