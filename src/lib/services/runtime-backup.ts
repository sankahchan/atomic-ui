import { promisify } from 'util';
import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { resolveDatabaseEngine, resolveSqliteDbPathFromUrl } from '@/lib/database-engine';
import { resolvePostgresCliErrorMessage } from '@/lib/services/postgres-cli-errors';

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

    const filename = `backup-${timestamp}.dump`;
    const filePath = path.join(outputDir, filename);

    try {
      await createPostgresDump(filePath, databaseUrl);
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
