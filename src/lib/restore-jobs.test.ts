import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import test from 'node:test';

import {
  createRestoreJobRecord,
  hasActiveRestoreJob,
  isRestoreJobActive,
  isRestoreJobTerminal,
  listRestoreJobs,
  writeRestoreJob,
} from '@/lib/restore-jobs';

test('restore jobs are written and listed newest first', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-jobs-'));
  const older = createRestoreJobRecord({
    backupFilename: 'older.dump',
    backupPath: '/tmp/older.dump',
    requestedByUserId: 'user-1',
  });
  older.requestedAt = '2026-04-15T00:00:00.000Z';
  older.updatedAt = older.requestedAt;
  writeRestoreJob(older, cwd);

  const newer = createRestoreJobRecord({
    backupFilename: 'newer.dump',
    backupPath: '/tmp/newer.dump',
    requestedByUserId: 'user-2',
  });
  newer.requestedAt = '2026-04-15T01:00:00.000Z';
  newer.updatedAt = newer.requestedAt;
  writeRestoreJob(newer, cwd);

  const jobs = listRestoreJobs(10, cwd);
  assert.equal(jobs[0]?.backupFilename, 'newer.dump');
  assert.equal(jobs[1]?.backupFilename, 'older.dump');
});

test('active restore jobs are detected', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-jobs-'));
  const job = createRestoreJobRecord({
    backupFilename: 'backup.dump',
    backupPath: '/tmp/backup.dump',
    requestedByUserId: 'user-1',
  });
  writeRestoreJob(job, cwd);

  assert.equal(hasActiveRestoreJob(cwd), true);
  assert.equal(isRestoreJobActive(job.status), true);
  assert.equal(isRestoreJobTerminal(job.status), false);
});
