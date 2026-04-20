import { BackupFileKind } from '@/lib/backup-files';
import { resolveDatabaseEngine } from '@/lib/database-engine';

export type PostgresCliCommand = 'pg_dump' | 'pg_restore' | 'psql';

export const POSTGRES_CLIENT_INSTALL_HINT =
  'Install the PostgreSQL client tools (for example: apt-get install -y postgresql-client) and try again.';

export function formatMissingPostgresCliMessage(command: PostgresCliCommand) {
  return `${command} is not installed on this server. ${POSTGRES_CLIENT_INSTALL_HINT}`;
}

export function resolvePostgresCliErrorMessage(
  error: unknown,
  command: PostgresCliCommand,
  fallback: string,
) {
  if (error instanceof Error) {
    const errnoError = error as NodeJS.ErrnoException;
    const message = error.message || '';
    if (
      errnoError.code === 'ENOENT' ||
      message.includes(`spawn ${command} ENOENT`) ||
      message.includes(`${command}: command not found`)
    ) {
      return formatMissingPostgresCliMessage(command);
    }

    if (message.trim()) {
      return message;
    }
  }

  return fallback;
}

export function resolveBackupRuntimeCompatibilityMessage(
  fileKind: BackupFileKind,
  databaseUrl = process.env.DATABASE_URL,
) {
  const runtimeEngine = resolveDatabaseEngine(databaseUrl);

  if (fileKind === 'sqlite' || fileKind === 'sqlite_archive') {
    if (runtimeEngine === 'postgres') {
      return 'This server is using Postgres. SQLite backups can only be restored on SQLite runtimes.';
    }

    if (runtimeEngine !== 'sqlite') {
      return 'This server does not have a supported SQLite DATABASE_URL configured, so SQLite backups cannot be restored here.';
    }
  }

  if (fileKind === 'postgres_dump' || fileKind === 'postgres_sql' || fileKind === 'postgres_archive') {
    if (runtimeEngine === 'sqlite') {
      return 'This server is using SQLite. Postgres backups can only be restored on servers configured with a PostgreSQL DATABASE_URL.';
    }

    if (runtimeEngine !== 'postgres') {
      return 'This server does not have a PostgreSQL DATABASE_URL configured, so Postgres backups cannot be restored here.';
    }
  }

  return null;
}
