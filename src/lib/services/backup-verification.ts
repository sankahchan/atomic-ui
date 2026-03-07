import { createHash } from 'crypto';
import { promisify } from 'util';
import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { writeAuditLog } from '@/lib/audit';

const execFileAsync = promisify(execFile);

export const BACKUP_DIR = path.join(process.cwd(), 'storage', 'backups');
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
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
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

  const details: Record<string, unknown> = {
    filePath,
    header,
  };

  if (!header.startsWith('SQLite format 3')) {
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
      error: 'Backup file is not a valid SQLite database.',
      details,
    };
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
      error: error instanceof Error ? error.message : 'Backup verification failed.',
      details,
    };
  }
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
        .filter((file) => file.endsWith('.db') || file.endsWith('.sqlite') || file.endsWith('.bak'))
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
