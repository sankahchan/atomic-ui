import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatMissingPostgresCliMessage,
  resolveBackupRuntimeCompatibilityMessage,
  resolvePostgresCliErrorMessage,
} from './postgres-cli-errors';

test('resolvePostgresCliErrorMessage explains missing pg_restore binaries', () => {
  const error = Object.assign(new Error('spawn pg_restore ENOENT'), { code: 'ENOENT' });

  assert.equal(
    resolvePostgresCliErrorMessage(error, 'pg_restore', 'fallback'),
    formatMissingPostgresCliMessage('pg_restore'),
  );
});

test('resolvePostgresCliErrorMessage explains missing psql from shell output', () => {
  const error = new Error('/bin/bash: line 1: psql: command not found');

  assert.equal(
    resolvePostgresCliErrorMessage(error, 'psql', 'fallback'),
    formatMissingPostgresCliMessage('psql'),
  );
});

test('resolveBackupRuntimeCompatibilityMessage rejects Postgres backups on SQLite runtimes', () => {
  assert.equal(
    resolveBackupRuntimeCompatibilityMessage('postgres_dump', 'file:./data/atomic-ui.db'),
    'This server is using SQLite. Postgres backups can only be restored on servers configured with a PostgreSQL DATABASE_URL.',
  );
  assert.equal(
    resolveBackupRuntimeCompatibilityMessage('postgres_archive', 'file:./data/atomic-ui.db'),
    'This server is using SQLite. Postgres backups can only be restored on servers configured with a PostgreSQL DATABASE_URL.',
  );
});

test('resolveBackupRuntimeCompatibilityMessage rejects SQLite backups on Postgres runtimes', () => {
  assert.equal(
    resolveBackupRuntimeCompatibilityMessage('sqlite_archive', 'postgresql://user:pass@localhost:5432/atomic_ui'),
    'This server is using Postgres. SQLite backups can only be restored on SQLite runtimes.',
  );
});
