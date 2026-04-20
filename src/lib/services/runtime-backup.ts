import { promisify } from 'util';
import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import AdmZip from 'adm-zip';
import { resolveDatabaseEngine, resolveSqliteDbPathFromUrl } from '@/lib/database-engine';
import { resolvePostgresCliErrorMessage } from '@/lib/services/postgres-cli-errors';
import {
  POSTGRES_BACKUP_BUNDLE_DUMP,
  POSTGRES_BACKUP_BUNDLE_MANIFEST,
  POSTGRES_BACKUP_BUNDLE_RESTORE_ENV,
  buildPostgresBackupBundleManifest,
  buildPostgresBackupRestoreEnvFile,
} from '@/lib/portable-backup';

const execFileAsync = promisify(execFile);

export type RuntimeBackupResult = {
  engine: 'sqlite' | 'postgres';
  filename: string;
  filePath: string;
};

function buildTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function ensureDirectory(directory: string) {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

function resolveSanitizedPostgresUrl(databaseUrl: string) {
  const parsed = new URL(databaseUrl);
  const password = parsed.password ? decodeURIComponent(parsed.password) : '';
  parsed.password = '';

  return {
    connectionString: parsed.toString(),
    password,
  };
}

async function createPostgresDump(filePath: string, databaseUrl: string) {
  if (databaseUrl.trim().toLowerCase().startsWith('prisma+postgres://')) {
    throw new Error(
      'Dashboard Postgres backups require a direct postgresql:// connection string. prisma+postgres:// runtimes must use database-native backup tooling against the primary database.',
    );
  }

  const { connectionString, password } = resolveSanitizedPostgresUrl(databaseUrl);
  const commandEnv = {
    ...process.env,
    ...(password ? { PGPASSWORD: password } : {}),
  };

  await execFileAsync(
    'pg_dump',
    [
      '--format=custom',
      '--no-owner',
      '--no-privileges',
      '--file',
      filePath,
      '--dbname',
      connectionString,
    ],
    {
      env: commandEnv,
      maxBuffer: 1024 * 1024,
    },
  );
}

async function createPostgresBundle(filePath: string, databaseUrl: string) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-ui-pg-backup-'));
  const tempDumpPath = path.join(tempDir, POSTGRES_BACKUP_BUNDLE_DUMP);

  try {
    await createPostgresDump(tempDumpPath, databaseUrl);

    const archive = new AdmZip();
    archive.addLocalFile(tempDumpPath, '', POSTGRES_BACKUP_BUNDLE_DUMP);
    archive.addFile(
      POSTGRES_BACKUP_BUNDLE_MANIFEST,
      Buffer.from(JSON.stringify(buildPostgresBackupBundleManifest(), null, 2), 'utf8'),
    );
    archive.addFile(
      POSTGRES_BACKUP_BUNDLE_RESTORE_ENV,
      Buffer.from(buildPostgresBackupRestoreEnvFile(), 'utf8'),
    );
    archive.writeZip(filePath);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

export async function createRuntimeBackup(outputDir: string, databaseUrl = process.env.DATABASE_URL) {
  ensureDirectory(outputDir);

  const engine = resolveDatabaseEngine(databaseUrl);
  const timestamp = buildTimestamp();

  if (engine === 'sqlite') {
    const dbPath = resolveSqliteDbPathFromUrl(databaseUrl);
    if (!fs.existsSync(dbPath)) {
      throw new Error('Database file not found.');
    }

    const filename = `backup-${timestamp}.db`;
    const filePath = path.join(outputDir, filename);
    fs.copyFileSync(dbPath, filePath);

    return {
      engine,
      filename,
      filePath,
    } satisfies RuntimeBackupResult;
  }

  if (engine === 'postgres') {
    if (!databaseUrl?.trim()) {
      throw new Error('DATABASE_URL is not configured.');
    }

    const filename = `backup-${timestamp}.postgres.zip`;
    const filePath = path.join(outputDir, filename);

    try {
      await createPostgresBundle(filePath, databaseUrl);
    } catch (error) {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      throw new Error(
        resolvePostgresCliErrorMessage(
          error,
          'pg_dump',
          'pg_dump failed while creating the Postgres backup.',
        ),
      );
    }

    return {
      engine,
      filename,
      filePath,
    } satisfies RuntimeBackupResult;
  }

  throw new Error(
    'Dashboard backup creation currently supports SQLite and Postgres connection strings only.',
  );
}
