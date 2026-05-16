import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import type { ReadableStream as NodeReadableStream } from 'stream/web';
import { inferBackupFileKind, isSupportedBackupFileKind, sanitizeBackupFilename } from '@/lib/backup-files';

export const INVALID_BACKUP_UPLOAD_MESSAGE =
  'Invalid backup upload. Please choose a .db, .dump, .sql, .postgres.zip, or .zip backup file and try again.';

function sanitizeBackupUploadFilename(filename: string) {
  return sanitizeBackupFilename(filename, 'backup-upload');
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

export async function streamUploadedBackupFile(input: {
  filename: string;
  file: File;
  outputDir: string;
}) {
  if (input.file.size <= 0) {
    throw new Error(INVALID_BACKUP_UPLOAD_MESSAGE);
  }

  fs.mkdirSync(input.outputDir, { recursive: true });
  const storedFilename = buildUploadedBackupFilename(input.filename, fs.readdirSync(input.outputDir));
  const filePath = path.join(input.outputDir, storedFilename);
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;

  const headerChunks: Buffer[] = [];
  let headerLength = 0;
  const writable = fs.createWriteStream(tempPath, { flags: 'wx' });

  try {
    for await (const chunk of Readable.fromWeb(input.file.stream() as unknown as NodeReadableStream)) {
      const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as ArrayBufferLike);
      if (headerLength < 16) {
        const remaining = 16 - headerLength;
        const headerPart = bufferChunk.subarray(0, remaining);
        if (headerPart.byteLength > 0) {
          headerChunks.push(headerPart);
          headerLength += headerPart.byteLength;
        }
      }

      if (!writable.write(bufferChunk)) {
        await new Promise<void>((resolve, reject) => {
          writable.once('drain', resolve);
          writable.once('error', reject);
        });
      }
    }

    await new Promise<void>((resolve, reject) => {
      writable.end(() => resolve());
      writable.once('error', reject);
    });

    const fileKind = inferBackupFileKind(storedFilename, Buffer.concat(headerChunks).toString('utf8'));
    if (!isSupportedBackupFileKind(fileKind)) {
      fs.rmSync(tempPath, { force: true });
      throw new Error(INVALID_BACKUP_UPLOAD_MESSAGE);
    }

    fs.renameSync(tempPath, filePath);

    return {
      filename: storedFilename,
      filePath,
      fileKind,
    };
  } catch (error) {
    writable.destroy();
    fs.rmSync(tempPath, { force: true });
    throw error;
  }
}
