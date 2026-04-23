import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import AdmZip from 'adm-zip';
import {
  BACKUP_DIR,
  inspectBackupFile,
  shouldReuseSchedulerFailureVerification,
  type BackupVerificationSummary,
} from './backup-verification';
import {
  POSTGRES_BACKUP_BUNDLE_DUMP,
  POSTGRES_BACKUP_BUNDLE_MANIFEST,
  POSTGRES_BACKUP_BUNDLE_RESTORE_ENV,
  buildPostgresBackupBundleManifest,
} from '@/lib/portable-backup';

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

test('inspectBackupFile validates a healthy SQLite archive backup', async (t) => {
  if (!ensureSqliteCli()) {
    t.skip('sqlite3 CLI is not available');
    return;
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const dbFilename = `test-archive-source-${process.pid}-${Date.now()}.db`;
  const dbPath = path.join(BACKUP_DIR, dbFilename);
  const filename = `test-backup-${process.pid}-${Date.now()}.zip`;
  const filePath = path.join(BACKUP_DIR, filename);
  t.after(() => {
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  });

  const createDb = spawnSync(
    'sqlite3',
    [
      dbPath,
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

  const archive = new AdmZip();
  archive.addFile('atomic-ui.db', fs.readFileSync(dbPath));
  archive.addFile('.env', Buffer.from('DATABASE_URL=file:./dev.db\n'));
  archive.writeZip(filePath);

  const result = await inspectBackupFile(filename);

  assert.equal(result.status, 'SUCCESS');
  assert.equal(result.restoreReady, true);
  assert.equal(result.integrityCheck, 'ok');
  assert.equal(result.userCount, 1);
  assert.equal(result.accessKeyCount, 1);
  assert.equal(result.error, null);
});

test('inspectBackupFile rejects Postgres dumps on SQLite runtimes with a clear message', async (t) => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'file:./data/atomic-ui.db';
  t.after(() => {
    if (typeof previousDatabaseUrl === 'undefined') {
      delete process.env.DATABASE_URL;
      return;
    }

    process.env.DATABASE_URL = previousDatabaseUrl;
  });

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const filename = `test-postgres-backup-${process.pid}-${Date.now()}.dump`;
  const filePath = path.join(BACKUP_DIR, filename);
  t.after(() => {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  });

  const header = Buffer.alloc(32);
  header.write('PGDMP');
  fs.writeFileSync(filePath, header);

  const result = await inspectBackupFile(filename);

  assert.equal(result.status, 'FAILED');
  assert.equal(result.restoreReady, false);
  assert.equal(
    result.error,
    'This server is using SQLite. Postgres backups can only be restored on servers configured with a PostgreSQL DATABASE_URL.',
  );
});

test('inspectBackupFile rejects portable Postgres bundles on SQLite runtimes with a clear message', async (t) => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'file:./data/atomic-ui.db';
  t.after(() => {
    if (typeof previousDatabaseUrl === 'undefined') {
      delete process.env.DATABASE_URL;
      return;
    }

    process.env.DATABASE_URL = previousDatabaseUrl;
  });

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const filename = `test-postgres-bundle-${process.pid}-${Date.now()}.postgres.zip`;
  const filePath = path.join(BACKUP_DIR, filename);
  t.after(() => {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  });

  const header = Buffer.alloc(32);
  header.write('PGDMP');
  const archive = new AdmZip();
  archive.addFile(POSTGRES_BACKUP_BUNDLE_DUMP, header);
  archive.addFile(
    POSTGRES_BACKUP_BUNDLE_MANIFEST,
    Buffer.from(JSON.stringify(buildPostgresBackupBundleManifest()), 'utf8'),
  );
  archive.addFile(POSTGRES_BACKUP_BUNDLE_RESTORE_ENV, Buffer.from('SETTINGS_ENCRYPTION_KEY="x"\n'));
  archive.writeZip(filePath);

  const result = await inspectBackupFile(filename);

  assert.equal(result.status, 'FAILED');
  assert.equal(result.restoreReady, false);
  assert.equal(
    result.error,
    'This server is using SQLite. Postgres backups can only be restored on servers configured with a PostgreSQL DATABASE_URL.',
  );
  assert.equal(result.details.format, 'postgres_archive');
  assert.equal(result.details.restoreEnvAvailable, true);
});

test('shouldReuseSchedulerFailureVerification only reuses identical failed summaries', () => {
  const summary: BackupVerificationSummary = {
    filename: 'backup.dump',
    status: 'FAILED',
    triggeredBy: 'scheduler',
    fileSizeBytes: BigInt(123),
    fileHashSha256: 'abc123',
    restoreReady: false,
    integrityCheck: null,
    tableCount: null,
    accessKeyCount: null,
    userCount: null,
    error: 'This server is using SQLite. Postgres backups can only be restored on servers configured with a PostgreSQL DATABASE_URL.',
    details: {
      format: 'postgres_dump',
      runtimeEngine: 'sqlite',
    },
  };

  assert.equal(
    shouldReuseSchedulerFailureVerification(summary, {
      id: 'verification-1',
      filename: 'backup.dump',
      status: 'FAILED',
      fileHashSha256: 'abc123',
      restoreReady: false,
      integrityCheck: null,
      tableCount: null,
      accessKeyCount: null,
      userCount: null,
      error: 'This server is using SQLite. Postgres backups can only be restored on servers configured with a PostgreSQL DATABASE_URL.',
      verifiedAt: new Date('2026-04-19T09:00:00.000Z'),
    }),
    true,
  );

  assert.equal(
    shouldReuseSchedulerFailureVerification(summary, {
      id: 'verification-2',
      filename: 'backup.dump',
      status: 'FAILED',
      fileHashSha256: 'changed',
      restoreReady: false,
      integrityCheck: null,
      tableCount: null,
      accessKeyCount: null,
      userCount: null,
      error: 'This server is using SQLite. Postgres backups can only be restored on servers configured with a PostgreSQL DATABASE_URL.',
      verifiedAt: new Date('2026-04-19T09:00:00.000Z'),
    }),
    false,
  );
});
