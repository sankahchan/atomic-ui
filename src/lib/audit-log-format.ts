import { formatBytes, formatDateTime } from './utils';
import { RENEWAL_AUDIT_ACTIONS } from './renewal-reminder-tracking';

export { RENEWAL_AUDIT_ACTIONS } from './renewal-reminder-tracking';

export function isRenewalAuditAction(action: string) {
  return RENEWAL_AUDIT_ACTIONS.includes(action as (typeof RENEWAL_AUDIT_ACTIONS)[number]);
}

function parseAuditNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function parseAuditBigInt(value: unknown) {
  if (typeof value === 'bigint') {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }

  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
    return BigInt(value.trim());
  }

  return null;
}

function formatCompactNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
}

export function formatAuditMonths(value: unknown, fallback = '-') {
  const months = parseAuditNumber(value);

  if (!months || months <= 0) {
    return fallback;
  }

  return `+${formatCompactNumber(months)} ${months === 1 ? 'month' : 'months'}`;
}

export function formatAuditAddedData(value: unknown, emptyLabel = 'No data added') {
  const gb = parseAuditNumber(value);

  if (!gb || gb <= 0) {
    return emptyLabel;
  }

  return `+${formatCompactNumber(gb)} GB`;
}

export function formatAuditBytes(value: unknown, fallback = '-') {
  const bytes = parseAuditBigInt(value);

  if (bytes === null) {
    return fallback;
  }

  return formatBytes(bytes);
}

export function formatAuditDateTimeValue(value: unknown, fallback = '-') {
  if (typeof value !== 'string' && !(value instanceof Date)) {
    return fallback;
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return formatDateTime(date);
}

export function formatAuditTransition<T>(
  previousValue: T,
  nextValue: T,
  formatter: (value: T) => string,
) {
  return `${formatter(previousValue)} -> ${formatter(nextValue)}`;
}
