import { resolveSqliteDbPathFromUrl } from '@/lib/database-engine';

/**
 * Resolve the SQLite database file path from DATABASE_URL.
 * Prisma resolves relative file URLs from the prisma directory.
 */
export function resolveSqliteDbPath(): string {
  return resolveSqliteDbPathFromUrl(process.env.DATABASE_URL);
}
