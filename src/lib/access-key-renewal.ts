export function addCalendarMonths(baseDate: Date, months: number): Date {
  const result = new Date(baseDate);
  const originalDay = result.getDate();

  result.setDate(1);
  result.setMonth(result.getMonth() + months);

  const lastDayOfTargetMonth = new Date(
    result.getFullYear(),
    result.getMonth() + 1,
    0,
  ).getDate();

  result.setDate(Math.min(originalDay, lastDayOfTargetMonth));

  return result;
}

export function getRenewalBaseDate(currentExpiresAt: Date | null | undefined, now = new Date()): Date {
  if (currentExpiresAt && currentExpiresAt.getTime() > now.getTime()) {
    return new Date(currentExpiresAt);
  }

  return new Date(now);
}

export function resolveRenewedAccessKeyStatus(input: {
  usedBytes: bigint;
  dataLimitBytes: bigint | null;
}): 'ACTIVE' | 'DEPLETED' {
  if (input.dataLimitBytes != null && input.usedBytes >= input.dataLimitBytes) {
    return 'DEPLETED';
  }

  return 'ACTIVE';
}
