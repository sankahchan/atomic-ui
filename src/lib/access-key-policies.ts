const DEFAULT_QUOTA_THRESHOLDS = [80, 90];

export function parseQuotaAlertThresholds(value?: string | null) {
  if (!value?.trim()) {
    return [...DEFAULT_QUOTA_THRESHOLDS];
  }

  const thresholds = value
    .split(',')
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter((item) => Number.isFinite(item) && item > 0 && item < 100);

  const unique = Array.from(new Set(thresholds)).sort((left, right) => left - right);
  return unique.length > 0 ? unique : [...DEFAULT_QUOTA_THRESHOLDS];
}

export function stringifyQuotaAlertThresholds(value: number[] | string | null | undefined) {
  if (typeof value === 'string') {
    return parseQuotaAlertThresholds(value).join(',');
  }

  return parseQuotaAlertThresholds(Array.isArray(value) ? value.join(',') : undefined).join(',');
}

export function parseQuotaAlertsSent(value?: string | null) {
  if (!value?.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return Array.from(
      new Set(
        parsed
          .map((item) => Number.parseInt(String(item), 10))
          .filter((item) => Number.isFinite(item) && item > 0 && item < 100),
      ),
    ).sort((left, right) => left - right);
  } catch {
    return [];
  }
}

export function serializeQuotaAlertsSent(value: number[]) {
  return JSON.stringify(
    Array.from(new Set(value.filter((item) => Number.isFinite(item) && item > 0 && item < 100))).sort(
      (left, right) => left - right,
    ),
  );
}

export function computeArchiveAfterAt(now: Date, autoArchiveAfterDays?: number | null) {
  const archiveDate = new Date(now);
  const days = Math.max(0, autoArchiveAfterDays ?? 0);
  archiveDate.setDate(archiveDate.getDate() + days);
  return archiveDate;
}

export function resolveAutoRenewDays(input: {
  autoRenewPolicy?: string | null;
  autoRenewDurationDays?: number | null;
  durationDays?: number | null;
}) {
  if (input.autoRenewPolicy !== 'EXTEND_DURATION') {
    return null;
  }

  const candidate = input.autoRenewDurationDays ?? input.durationDays ?? null;
  return candidate && candidate > 0 ? candidate : null;
}
