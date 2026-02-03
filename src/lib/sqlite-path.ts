import path from 'path';

/**
 * Resolve the SQLite database file path from DATABASE_URL.
 * Prisma resolves relative file URLs from the prisma directory.
 */
export function resolveSqliteDbPath(): string {
  const dbUrl = process.env.DATABASE_URL;

  if (!dbUrl || !dbUrl.startsWith('file:')) {
    throw new Error('DATABASE_URL must be a SQLite file URL (file:...)');
  }

  const rawPath = dbUrl.slice('file:'.length);

  // file:/absolute/path.db
  if (path.isAbsolute(rawPath)) {
    return rawPath;
  }

  // file:./data/app.db (relative to prisma schema directory)
  return path.resolve(process.cwd(), 'prisma', rawPath);
}
