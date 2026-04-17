import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildUploadedBackupFilename,
  INVALID_BACKUP_UPLOAD_MESSAGE,
  storeUploadedBackupFile,
} from './backup-upload';

test('buildUploadedBackupFilename keeps the original name when unused', () => {
  assert.equal(
    buildUploadedBackupFilename('backup-2026-04-18.db', []),
    'backup-2026-04-18.db',
  );
});

test('buildUploadedBackupFilename appends an upload timestamp when the file already exists', () => {
  const nextFilename = buildUploadedBackupFilename(
    'backup-2026-04-18.db',
    ['backup-2026-04-18.db'],
    new Date('2026-04-18T00:00:00.000Z'),
  );

  assert.match(nextFilename, /^backup-2026-04-18-upload-2026-04-18T00-00-00-000Z\.db$/);
});

test('storeUploadedBackupFile rejects unsupported backup uploads', () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-ui-upload-'));

  assert.throws(
    () =>
      storeUploadedBackupFile({
        filename: 'notes.txt',
        buffer: Buffer.from('hello'),
        outputDir,
      }),
    new RegExp(INVALID_BACKUP_UPLOAD_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  );
});

test('storeUploadedBackupFile stores sqlite archive uploads', () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-ui-upload-'));
  const result = storeUploadedBackupFile({
    filename: 'atomic-backup.zip',
    buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    outputDir,
  });

  assert.equal(result.fileKind, 'sqlite_archive');
  assert.equal(fs.existsSync(result.filePath), true);
});
