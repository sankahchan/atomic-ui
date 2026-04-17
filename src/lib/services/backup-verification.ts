import { createHash, randomUUID } from 'crypto';
import { promisify } from 'util';
import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import AdmZip from 'adm-zip';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { writeAuditLog } from '@/lib/audit';
import { inferBackupFileKind } from '@/lib/backup-files';
import {
  BACKUP_DIR as CANONICAL_BACKUP_DIR,
  ensureBackupDirectory as ensureCanonicalBackupDirectory,
} from '@/lib/backup-storage';

const execFileAsync = promisify(execFile);

export const BACKUP_DIR = CANONICAL_BACKUP_DIR;
export const BACKUP_EXPECTED_TABLES = ['User', 'Server', 'AccessKey'] as const;

export interface BackupVerificationSummary {
  filename: string;
  status: 'SUCCESS' | 'FAILED';
  triggeredBy?: string;
  fileSizeBytes: bigint;
  fileHashSha256: string;
  restoreReady: boolean;
  integrityCheck: string | null;
  tableCount: number | null;
  accessKeyCount: number | null;
  userCount: number | null;
  error: string | null;
  details: Record<string, unknown>;
}

function ensureBackupDirectory() {
  ensureCanonicalBackupDirectory();
}

function getBackupPath(filename: string) {
  const normalizedFilename = path.basename(filename);
  return path.join(BACKUP_DIR, normalizedFilename);
}

async function runSqliteQuery(filePath: string, sql: string) {
  const { stdout } = await execFileAsync('sqlite3', [filePath, sql], {
    maxBuffer: 1024 * 1024,
  });

  return stdout.trim();
}

async function hashFileSha256(filePath: string) {
  const hash = createHash('sha256');

  await new Promise<void>((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve());
    stream.on('error', reject);
  });

  return hash.digest('hex');
}

function readSqliteHeader(filePath: string) {
  const fd = fs.openSync(filePath, 'r');

  try {
    const buffer = Buffer.alloc(16);
    fs.readSync(fd, buffer, 0, 16, 0);
    return buffer.toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}

function buildFailedVerificationSummary(
  filename: string,
  fileSizeBytes: bigint,
  fileHashSha256: string,
  error: string,
  details: Record<string, unknown>,
): BackupVerificationSummary {
  return {
    filename,
    status: 'FAILED',
    triggeredBy: undefined,
    fileSizeBytes,
    fileHashSha256,
    restoreReady: false,
    integrityCheck: null,
    tableCount: null,
    accessKeyCount: null,
    userCount: null,
    error,
    details,
  };
}

async function inspectSqliteBackupFile(
  filename: string,
  filePath: string,
  fileSizeBytes: bigint,
  fileHashSha256: string,
  header: string,
): Promise<BackupVerificationSummary> {
  const details: Record<string, unknown> = {
    filePath,
    header,
    format: 'sqlite',
  };

  if (!header.startsWith('SQLite format 3')) {
    return buildFailedVerificationSummary(
      filename,
      fileSizeBytes,
      fileHashSha256,
      'Backup file is not a valid SQLite database.',
      details,
    );
  }

  try {
    const [integrityCheck, tableNamesRaw, accessKeyCountRaw, userCountRaw] = await Promise.all([
      runSqliteQuery(filePath, 'PRAGMA integrity_check;'),
      runSqliteQuery(filePath, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"),
      runSqliteQuery(filePath, 'SELECT COUNT(*) FROM "AccessKey";'),
      runSqliteQuery(filePath, 'SELECT COUNT(*) FROM "User";'),
    ]);

    const tableNames = tableNamesRaw
      .split('\n')
      .map((value) => value.trim())
      .filter(Boolean);
    const missingTables = BACKUP_EXPECTED_TABLES.filter((tableName) => !tableNames.includes(tableName));
    const restoreReady = integrityCheck === 'ok' && missingTables.length === 0;

    details.tableNames = tableNames;
    details.missingTables = missingTables;

    return {
      filename,
      status: restoreReady ? 'SUCCESS' : 'FAILED',
      triggeredBy: undefined,
      fileSizeBytes,
      fileHashSha256,
      restoreReady,
      integrityCheck,
      tableCount: tableNames.length,
      accessKeyCount: Number.parseInt(accessKeyCountRaw || '0', 10),
      userCount: Number.parseInt(userCountRaw || '0', 10),
      error: restoreReady
        ? null
        : missingTables.length > 0
          ? `Missing expected tables: ${missingTables.join(', ')}`
          : `SQLite integrity check failed: ${integrityCheck}`,
      details,
    };
  } catch (error) {
    return buildFailedVerificationSummary(
      filename,
      fileSizeBytes,
      fileHashSha256,
      error instanceof Error ? error.message : 'Backup verification failed.',
      details,
    );
  }
}

async function inspectSqliteArchiveBackupFile(
  filename: string,
  filePath: string,
  fileSizeBytes: bigint,
  fileHashSha256: string,
): Promise<BackupVerificationSummary> {
  const details: Record<string, unknown> = {
    filePath,
    format: 'sqlite_archive',
  };

  try {
    const archive = new AdmZip(filePath);
    const entries = archive.getEntries().filter((entry) => !entry.isDirectory);
    details.archiveEntries = entries.map((entry) => entry.entryName);

    const dbEntry = entries.find((entry) => {
      const basename = path.posix.basename(entry.entryName).toLowerCase();
      return basename === 'atomic-ui.db'
        || basename.endsWith('.db')
        || basename.endsWith('.sqlite')
        || basename.endsWith('.bak');
    });

    if (!dbEntry) {
      return buildFailedVerificationSummary(
        filename,
        fileSizeBytes,
        fileHashSha256,
        'Backup archive does not contain a SQLite database file.',
        details,
      );
    }

    const dbBuffer = dbEntry.getData();
    const header = dbBuffer.subarray(0, 16).toString('utf8');
    details.archiveDbEntry = dbEntry.entryName;
    details.header = header;
    details.restoredEnvAvailable = entries.some((entry) => entry.entryName === '.env');

    if (!header.startsWith('SQLite format 3')) {
      return buildFailedVerificationSummary(
        filename,
        fileSizeBytes,
        fileHashSha256,
        'Backup archive does not contain a valid SQLite database.',
        details,
      );
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-ui-backup-verify-'));
    const tempDbPath = path.join(tempDir, `${randomUUID()}.db`);
    fs.writeFileSync(tempDbPath, dbBuffer);

    try {
      const [integrityCheck, tableNamesRaw, accessKeyCountRaw, userCountRaw] = await Promise.all([
        runSqliteQuery(tempDbPath, 'PRAGMA integrity_check;'),
        runSqliteQuery(tempDbPath, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"),
        runSqliteQuery(tempDbPath, 'SELECT COUNT(*) FROM "AccessKey";'),
        runSqliteQuery(tempDbPath, 'SELECT COUNT(*) FROM "User";'),
      ]);

      const tableNames = tableNamesRaw
        .split('\n')
        .map((value) => value.trim())
        .filter(Boolean);
      const missingTables = BACKUP_EXPECTED_TABLES.filter((tableName) => !tableNames.includes(tableName));
      const restoreReady = integrityCheck === 'ok' && missingTables.length === 0;

      details.tableNames = tableNames;
      details.missingTables = missingTables;

      return {
        filename,
        status: restoreReady ? 'SUCCESS' : 'FAILED',
        triggeredBy: undefined,
        fileSizeBytes,
        fileHashSha256,
        restoreReady,
        integrityCheck,
        tableCount: tableNames.length,
        accessKeyCount: Number.parseInt(accessKeyCountRaw || '0', 10),
        userCount: Number.parseInt(userCountRaw || '0', 10),
        error: restoreReady
          ? null
          : missingTables.length > 0
            ? `Missing expected tables: ${missingTables.join(', ')}`
            : `SQLite integrity check failed: ${integrityCheck}`,
        details,
      };
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  } catch (error) {
    return buildFailedVerificationSummary(
      filename,
      fileSizeBytes,
      fileHashSha256,
      error instanceof Error ? error.message : 'Backup archive verification failed.',
      details,
    );
  }
}

async function inspectPostgresDumpFile(
  filename: string,
  filePath: string,
  fileSizeBytes: bigint,
  fileHashSha256: string,
  header: string,
): Promise<BackupVerificationSummary> {
  const details: Record<string, unknown> = {
    filePath,
    header,
    format: 'postgres_dump',
  };

  if (!header.startsWith('PGDMP')) {
    return buildFailedVerificationSummary(
      filename,
      fileSizeBytes,
      fileHashSha256,
      'Backup file is not a valid Postgres custom dump.',
      details,
    );
  }

  try {
    const { stdout } = await execFileAsync('pg_restore', ['--list', filePath], {
      maxBuffer: 4 * 1024 * 1024,
    });
    const tocLines = stdout
      .split('\n')
      .map((value) => value.trim())
      .filter((value) => value.length > 0 && !value.startsWith(';'));
    const missingTables = BACKUP_EXPECTED_TABLES.filter((tableName) => {
      const tablePattern = new RegExp(`\\b(?:TABLE|TABLE DATA)\\b[^\\n]*\\b${tableName}\\b`, 'i');
      return !tablePattern.test(stdout);
    });
    const tableCount = tocLines.filter((line) => /\bTABLE\b/i.test(line) && !/\bTABLE DATA\b/i.test(line)).length;
    const restoreReady = missingTables.length === 0;

    details.missingTables = missingTables;
    details.tocEntryCount = tocLines.length;

    return {
      filename,
      status: restoreReady ? 'SUCCESS' : 'FAILED',
      triggeredBy: undefined,
      fileSizeBytes,
      fileHashSha256,
      restoreReady,
      integrityCheck: 'pg_restore list ok',
      tableCount,
      accessKeyCount: null,
      userCount: null,
      error: restoreReady ? null : `Missing expected tables: ${missingTables.join(', ')}`,
      details,
    };
  } catch (error) {
    return buildFailedVerificationSummary(
      filename,
      fileSizeBytes,
      fileHashSha256,
      error instanceof Error ? error.message : 'pg_restore failed while inspecting the dump.',
      details,
    );
  }
}

export async function inspectBackupFile(filename: string): Promise<BackupVerificationSummary> {
  ensureBackupDirectory();

  const filePath = getBackupPath(filename);
  if (!fs.existsSync(filePath)) {
    throw new Error('Backup file not found.');
  }

  const stats = fs.statSync(filePath);
  const fileSizeBytes = BigInt(stats.size);
  const fileHashSha256 = await hashFileSha256(filePath);
  const header = readSqliteHeader(filePath);
  const fileKind = inferBackupFileKind(filename, header);

  if (fileKind === 'sqlite') {
    return inspectSqliteBackupFile(filename, filePath, fileSizeBytes, fileHashSha256, header);
  }

  if (fileKind === 'sqlite_archive') {
    return inspectSqliteArchiveBackupFile(filename, filePath, fileSizeBytes, fileHashSha256);
  }

  if (fileKind === 'postgres_dump') {
    return inspectPostgresDumpFile(filename, filePath, fileSizeBytes, fileHashSha256, header);
  }

  return buildFailedVerificationSummary(
    filename,
    fileSizeBytes,
    fileHashSha256,
    'Backup file format is not supported for verification.',
    {
      filePath,
      header,
      format: fileKind,
    },
  );
}

export async function recordBackupVerification(
  summary: BackupVerificationSummary,
  options?: {
    userId?: string;
    ip?: string | null;
    triggeredBy?: string;
    writeAuditEntry?: boolean;
  },
) {
  const verification = await db.backupVerification.create({
    data: {
      filename: summary.filename,
      status: summary.status,
      triggeredBy: options?.triggeredBy ?? summary.triggeredBy ?? null,
      fileSizeBytes: summary.fileSizeBytes,
      fileHashSha256: summary.fileHashSha256,
      restoreReady: summary.restoreReady,
      integrityCheck: summary.integrityCheck,
      tableCount: summary.tableCount,
      accessKeyCount: summary.accessKeyCount,
      userCount: summary.userCount,
      error: summary.error,
      details: JSON.stringify(summary.details),
    },
  });

  if (options?.writeAuditEntry !== false) {
    await writeAuditLog({
      userId: options?.userId ?? null,
      ip: options?.ip ?? null,
      action: 'BACKUP_VERIFY',
      entity: 'BACKUP',
      entityId: summary.filename,
      details: {
        filename: summary.filename,
        status: summary.status,
        restoreReady: summary.restoreReady,
        triggeredBy: options?.triggeredBy ?? summary.triggeredBy ?? 'manual',
        error: summary.error,
      },
    });
  }

  return verification;
}

export async function verifyBackupFile(
  filename: string,
  options?: {
    userId?: string;
    ip?: string | null;
    triggeredBy?: string;
    writeAuditEntry?: boolean;
  },
) {
  const summary = await inspectBackupFile(filename);
  summary.triggeredBy = options?.triggeredBy ?? summary.triggeredBy;
  const verification = await recordBackupVerification(summary, options);

  return {
    ...summary,
    id: verification.id,
    verifiedAt: verification.verifiedAt,
  };
}

export async function verifyLatestBackups(options?: {
  limit?: number;
  triggeredBy?: string;
}) {
  ensureBackupDirectory();

  const files = fs.existsSync(BACKUP_DIR)
    ? fs.readdirSync(BACKUP_DIR)
        .filter((file) => inferBackupFileKind(file) !== 'unknown')
        .map((file) => ({
          filename: file,
          createdAt: fs.statSync(path.join(BACKUP_DIR, file)).mtime,
        }))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    : [];

  const results = [];
  const limit = options?.limit ?? 3;

  for (const file of files.slice(0, limit)) {
    try {
      results.push(
        await verifyBackupFile(file.filename, {
          triggeredBy: options?.triggeredBy ?? 'scheduler',
          writeAuditEntry: false,
        }),
      );
    } catch (error) {
      logger.error('Failed to verify backup', error);
    }
  }

  return results;
}
