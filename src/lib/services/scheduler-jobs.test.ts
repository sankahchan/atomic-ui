import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computeNextSchedulerJobRun,
  isSchedulerJobManualRunSupported,
} from './scheduler-jobs';

test('computeNextSchedulerJobRun handles every-minute cadence', () => {
  const next = computeNextSchedulerJobRun('* * * * *', new Date('2026-04-13T11:26:57.000Z'));
  assert.equal(next?.toISOString(), '2026-04-13T11:27:00.000Z');
});

test('computeNextSchedulerJobRun handles interval cadence', () => {
  const next = computeNextSchedulerJobRun('*/15 * * * *', new Date('2026-04-13T11:26:57.000Z'));
  assert.equal(next?.toISOString(), '2026-04-13T11:30:00.000Z');
});

test('computeNextSchedulerJobRun handles daily fixed time cadence', () => {
  const now = new Date('2026-04-13T11:26:57.000Z');
  const next = computeNextSchedulerJobRun('30 3 * * *', now);
  const expected = new Date(now);
  expected.setHours(3, 30, 0, 0);
  if (expected.getTime() <= now.getTime()) {
    expected.setDate(expected.getDate() + 1);
  }
  assert.equal(next?.toISOString(), expected.toISOString());
});

test('manual scheduler support is only enabled for safe job keys', () => {
  assert.equal(isSchedulerJobManualRunSupported('health_check'), true);
  assert.equal(isSchedulerJobManualRunSupported('notification_queue'), true);
  assert.equal(isSchedulerJobManualRunSupported('telegram_webhook_health'), true);
  assert.equal(isSchedulerJobManualRunSupported('admin_queue_health'), true);
  assert.equal(isSchedulerJobManualRunSupported('telegram_digest'), false);
  assert.equal(isSchedulerJobManualRunSupported('telegram_sales_orders'), false);
  assert.equal(isSchedulerJobManualRunSupported('missing_job'), false);
});
