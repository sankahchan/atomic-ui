import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOfflineRestoreCommand, inferBackupFileKind } from './backup-files';

test('inferBackupFileKind detects sqlite files', () => {
  assert.equal(inferBackupFileKind('backup-2026-04-15.db'), 'sqlite');
  assert.equal(inferBackupFileKind('backup-2026-04-15.anything', 'SQLite format 3'), 'sqlite');
  assert.equal(inferBackupFileKind('backup-2026-04-15.zip'), 'sqlite_archive');
});

test('inferBackupFileKind detects postgres dump files', () => {
  assert.equal(inferBackupFileKind('backup-2026-04-15.dump'), 'postgres_dump');
  assert.equal(inferBackupFileKind('backup-2026-04-15.anything', 'PGDMP'), 'postgres_dump');
  assert.equal(inferBackupFileKind('backup-2026-04-15.postgres.zip'), 'postgres_archive');
});

test('buildOfflineRestoreCommand returns engine-specific commands', () => {
  assert.equal(
    buildOfflineRestoreCommand('backup.dump', '/tmp/backup.dump'),
    'pg_restore --clean --if-exists --no-owner --no-privileges --dbname "$DATABASE_URL" /tmp/backup.dump',
  );
  assert.equal(
    buildOfflineRestoreCommand('backup.sql', '/tmp/backup.sql'),
    'psql "$DATABASE_URL" < /tmp/backup.sql',
  );
  assert.equal(
    buildOfflineRestoreCommand('backup.db', '/tmp/backup.db'),
    'npm run restore:sqlite -- --backup /tmp/backup.db',
  );
  assert.equal(
    buildOfflineRestoreCommand('backup.zip', '/tmp/backup.zip'),
    'npm run restore:sqlite -- --backup /tmp/backup.zip',
  );
  assert.equal(
    buildOfflineRestoreCommand('backup.postgres.zip', '/tmp/backup.postgres.zip'),
    'Upload /tmp/backup.postgres.zip in the dashboard and use Restore. The bundle contains the Postgres dump plus restore encryption metadata.',
  );
});
