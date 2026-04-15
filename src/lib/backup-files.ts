export type BackupFileKind = 'sqlite' | 'postgres_dump' | 'postgres_sql' | 'unknown';

function normalizeBackupFilename(filename: string) {
  return filename.trim().toLowerCase();
}

export function inferBackupFileKind(filename: string, header?: string | null): BackupFileKind {
  const normalizedFilename = normalizeBackupFilename(filename);
  const normalizedHeader = (header || '').trim();

  if (normalizedHeader.startsWith('SQLite format 3')) {
    return 'sqlite';
  }

  if (normalizedHeader.startsWith('PGDMP')) {
    return 'postgres_dump';
  }

  if (
    normalizedFilename.endsWith('.db') ||
    normalizedFilename.endsWith('.sqlite') ||
    normalizedFilename.endsWith('.bak')
  ) {
    return 'sqlite';
  }

  if (normalizedFilename.endsWith('.dump')) {
    return 'postgres_dump';
  }

  if (normalizedFilename.endsWith('.sql')) {
    return 'postgres_sql';
  }

  return 'unknown';
}

export function buildOfflineRestoreCommand(filename: string, absolutePath: string) {
  const fileKind = inferBackupFileKind(filename);

  switch (fileKind) {
    case 'postgres_dump':
      return `pg_restore --clean --if-exists --no-owner --no-privileges --dbname "$DATABASE_URL" ${absolutePath}`;
    case 'postgres_sql':
      return `psql "$DATABASE_URL" < ${absolutePath}`;
    case 'sqlite':
    case 'unknown':
    default:
      return `npm run restore:sqlite -- --backup ${absolutePath}`;
  }
}
