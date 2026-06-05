import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatAuditAddedData,
  formatAuditBytes,
  formatAuditDateTimeValue,
  formatAuditMonths,
  isRenewalAuditAction,
} from '@/lib/audit-log-format';

test('isRenewalAuditAction detects single and bulk renewal audit actions', () => {
  assert.equal(isRenewalAuditAction('ACCESS_KEY_RENEWED'), true);
  assert.equal(isRenewalAuditAction('ACCESS_KEY_RENEWED_BULK'), true);
  assert.equal(isRenewalAuditAction('ACCESS_KEY_UPDATED'), false);
});

test('renewal audit formatters render stored renewal values for operators', () => {
  assert.equal(formatAuditMonths(1), '+1 month');
  assert.equal(formatAuditMonths('3'), '+3 months');
  assert.equal(formatAuditAddedData(null), 'No data added');
  assert.equal(formatAuditAddedData('25'), '+25 GB');
  assert.equal(formatAuditBytes('10737418240'), '10.00 GB');
});

test('formatAuditDateTimeValue rejects invalid audit timestamps', () => {
  assert.equal(formatAuditDateTimeValue('not-a-date', 'Unknown'), 'Unknown');
  assert.notEqual(formatAuditDateTimeValue('2026-06-01T12:00:00.000Z', 'Unknown'), 'Unknown');
});
