import fs from 'fs';
import path from 'path';
import { inferBackupFileKind, isSupportedBackupFileKind } from '@/lib/backup-files';

export const INVALID_BACKUP_UPLOAD_MESSAGE =
  'Invalid backup upload. Please choose a .db, .dump, .sql, .postgres.zip, or .zip backup file and try again.';

function sanitizeBackupUploadFilename(filename: string) {
  const sanitized = path.basename(filename).replace(/[\r\n"]/g, '_').trim();
  return sanitized || 'backup-upload';
}

export function buildUploadedBackupFilename(
  filename: string,
  existingFilenames: Iterable<string>,
  now = new Date(),
) {
  const sanitized = sanitizeBackupUploadFilename(filename);
  const existing = new Set(existingFilenames);
  if (!existing.has(sanitized)) {
    return sanitized;
  }

  const parsed = path.parse(sanitized);
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const baseName = parsed.name || 'backup-upload';
  const extension = parsed.ext || '';

  let candidate = `${baseName}-upload-${timestamp}${extension}`;
  let counter = 2;
  while (existing.has(candidate)) {
    candidate = `${baseName}-upload-${timestamp}-${counter}${extension}`;
    counter += 1;
  }

  return candidate;
}

function readBackupHeader(buffer: Buffer) {
  return buffer.subarray(0, 16).toString('utf8');
}

export function storeUploadedBackupFile(input: {
  filename: string;
  buffer: Buffer;
  outputDir: string;
}) {
  if (input.buffer.byteLength === 0) {
    throw new Error(INVALID_BACKUP_UPLOAD_MESSAGE);
  }

  fs.mkdirSync(input.outputDir, { recursive: true });
  const storedFilename = buildUploadedBackupFilename(input.filename, fs.readdirSync(input.outputDir));
  const fileKind = inferBackupFileKind(storedFilename, readBackupHeader(input.buffer));

  if (!isSupportedBackupFileKind(fileKind)) {
    throw new Error(INVALID_BACKUP_UPLOAD_MESSAGE);
  }

  const filePath = path.join(input.outputDir, storedFilename);
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, input.buffer);
  fs.renameSync(tempPath, filePath);

  return {
    filename: storedFilename,
    filePath,
    fileKind,
  };
}
