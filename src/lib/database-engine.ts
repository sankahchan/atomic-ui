import path from 'path';

export type DatabaseEngine = 'sqlite' | 'postgres' | 'unknown';
export type DatabaseBackupMode = 'SQLITE_FILE' | 'POSTGRES_DUMP' | 'UNSUPPORTED';

export function resolveDatabaseEngine(databaseUrl = process.env.DATABASE_URL): DatabaseEngine {
  const normalized = databaseUrl?.trim().toLowerCase() || '';
  if (normalized.startsWith('file:')) {
    return 'sqlite';
  }
  if (
    normalized.startsWith('postgres://') ||
    normalized.startsWith('postgresql://') ||
    normalized.startsWith('prisma+postgres://')
  ) {
    return 'postgres';
  }
  return 'unknown';
}

export function isSqliteDatabaseUrl(databaseUrl = process.env.DATABASE_URL) {
  return resolveDatabaseEngine(databaseUrl) === 'sqlite';
}

export function isPostgresDatabaseUrl(databaseUrl = process.env.DATABASE_URL) {
  return resolveDatabaseEngine(databaseUrl) === 'postgres';
}

export function resolveSqliteDbPathFromUrl(databaseUrl = process.env.DATABASE_URL): string {
  if (!isSqliteDatabaseUrl(databaseUrl)) {
    throw new Error('DATABASE_URL must be a SQLite file URL (file:...)');
  }

  const rawPath = (databaseUrl || '').slice('file:'.length);
  if (path.isAbsolute(rawPath)) {
    return rawPath;
  }

  return path.resolve(process.cwd(), 'prisma', rawPath);
}

export function getDatabaseBackupMode(databaseUrl = process.env.DATABASE_URL): DatabaseBackupMode {
  const engine = resolveDatabaseEngine(databaseUrl);
  if (engine === 'sqlite') {
    return 'SQLITE_FILE';
  }
  if (engine === 'postgres') {
    return 'POSTGRES_DUMP';
  }
  return 'UNSUPPORTED';
}

export function getDatabaseRuntimeSummary(env: Record<string, string | undefined> = process.env) {
  const databaseUrl = env.DATABASE_URL;
  const engine = resolveDatabaseEngine(databaseUrl);
  const isProduction = env.NODE_ENV === 'production';
  const warnings: string[] = [];

  if (!databaseUrl?.trim()) {
    warnings.push('DATABASE_URL is not configured.');
  }

  if (isProduction && engine === 'sqlite') {
    warnings.push(
      'Production is still using SQLite. This is functional, but background jobs and concurrent admin traffic will scale better on Postgres.',
    );
  }

  if (engine === 'postgres') {
    warnings.push(
      'App runtime is Postgres-ready at the environment layer, but file-based backup and restore routes must use pg_dump/pg_restore instead of SQLite file copy.',
    );
  }

  if (engine === 'unknown' && databaseUrl?.trim()) {
    warnings.push('DATABASE_URL does not look like a supported SQLite or Postgres connection string.');
  }

  return {
    engine,
    databaseUrl: databaseUrl || '',
    backupMode: getDatabaseBackupMode(databaseUrl),
    sqlitePath: engine === 'sqlite' ? resolveSqliteDbPathFromUrl(databaseUrl) : null,
    isProduction,
    productionReady: engine === 'postgres',
    warnings,
  };
}
