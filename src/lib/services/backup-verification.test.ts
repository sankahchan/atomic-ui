import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { BACKUP_DIR, inspectBackupFile } from './backup-verification';

function ensureSqliteCli() {
  const result = spawnSync('sqlite3', ['-version'], { encoding: 'utf8' });
  return result.status === 0;
}

test('inspectBackupFile validates a healthy SQLite backup', async (t) => {
  if (!ensureSqliteCli()) {
    t.skip('sqlite3 CLI is not available');
    return;
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const filename = `test-backup-${process.pid}-${Date.now()}.db`;
  const filePath = path.join(BACKUP_DIR, filename);
  t.after(() => {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  });

  const createDb = spawnSync(
    'sqlite3',
    [
      filePath,
      [
        'CREATE TABLE "User" ("id" TEXT PRIMARY KEY);',
        'CREATE TABLE "Server" ("id" TEXT PRIMARY KEY);',
        'CREATE TABLE "AccessKey" ("id" TEXT PRIMARY KEY);',
        "INSERT INTO \"User\" VALUES ('user-1');",
        "INSERT INTO \"AccessKey\" VALUES ('key-1');",
      ].join(' '),
    ],
    { encoding: 'utf8' },
  );

  assert.equal(createDb.status, 0, createDb.stderr || createDb.stdout);

  const result = await inspectBackupFile(filename);

  assert.equal(result.status, 'SUCCESS');
  assert.equal(result.restoreReady, true);
  assert.equal(result.integrityCheck, 'ok');
  assert.equal(result.userCount, 1);
  assert.equal(result.accessKeyCount, 1);
  assert.equal(result.error, null);
});

test('inspectBackupFile rejects non-SQLite backup files', async (t) => {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const filename = `test-invalid-backup-${process.pid}-${Date.now()}.db`;
  const filePath = path.join(BACKUP_DIR, filename);
  t.after(() => {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  });

  fs.writeFileSync(filePath, 'not a sqlite database');

  const result = await inspectBackupFile(filename);

  assert.equal(result.status, 'FAILED');
  assert.equal(result.restoreReady, false);
  assert.match(result.error ?? '', /not a valid sqlite/i);
});
