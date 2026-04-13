import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computeSchedulerJobFailureBackoffMinutes,
  computeSchedulerJobBackoffUntil,
} from '@/lib/services/scheduler-jobs';
import {
  getDatabaseRuntimeSummary,
  resolveDatabaseEngine,
  resolveSqliteDbPathFromUrl,
} from '@/lib/database-engine';

test('resolveDatabaseEngine detects supported engines', () => {
  assert.equal(resolveDatabaseEngine('file:./data/atomic-ui.db'), 'sqlite');
  assert.equal(resolveDatabaseEngine('postgresql://user:pass@localhost:5432/atomic'), 'postgres');
  assert.equal(resolveDatabaseEngine('mysql://user:pass@localhost/test'), 'unknown');
});

test('resolveSqliteDbPathFromUrl resolves relative prisma paths', () => {
  const result = resolveSqliteDbPathFromUrl('file:./data/atomic-ui.db');
  assert.match(result, /prisma\/data\/atomic-ui\.db$/);
});

test('getDatabaseRuntimeSummary warns for production sqlite', () => {
  const result = getDatabaseRuntimeSummary({
    DATABASE_URL: 'file:./data/atomic-ui.db',
    NODE_ENV: 'production',
  });

  assert.equal(result.engine, 'sqlite');
  assert.equal(result.productionReady, false);
  assert.ok(result.warnings.some((warning) => warning.includes('Production is still using SQLite')));
});

test('scheduler failure backoff grows after repeated failures', () => {
  assert.equal(computeSchedulerJobFailureBackoffMinutes(0), 0);
  assert.equal(computeSchedulerJobFailureBackoffMinutes(1), 0);
  assert.equal(computeSchedulerJobFailureBackoffMinutes(2), 2);
  assert.equal(computeSchedulerJobFailureBackoffMinutes(4), 15);
  assert.equal(computeSchedulerJobFailureBackoffMinutes(10), 60);
});

test('scheduler failure backoff timestamp is derived from last finish time', () => {
  const backoffUntil = computeSchedulerJobBackoffUntil(new Date('2026-04-14T00:00:00.000Z'), 3);
  assert.equal(backoffUntil?.toISOString(), '2026-04-14T00:05:00.000Z');
});
