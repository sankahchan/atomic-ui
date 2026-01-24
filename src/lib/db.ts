import { PrismaClient } from '@prisma/client';

// PrismaClient is attached to the `global` object in development to prevent
// exhausting your database connection limit.
// Learn more: https://pris.ly/d/help/next-js-best-practices

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaInitialized: boolean | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

// Enable WAL mode for SQLite - improves concurrency and reduces "database is locked" errors
// WAL mode allows readers and writers to operate concurrently
async function initializeDatabase() {
  if (globalForPrisma.prismaInitialized) return;
  
  try {
    // Use $queryRawUnsafe for PRAGMA commands since they return results
    await db.$queryRawUnsafe('PRAGMA journal_mode = WAL;');
    await db.$queryRawUnsafe('PRAGMA busy_timeout = 5000;');
    await db.$queryRawUnsafe('PRAGMA foreign_keys = ON;');
    
    globalForPrisma.prismaInitialized = true;
  } catch (error) {
    // Log but don't throw - these are optimizations, not requirements
    console.error('Failed to initialize SQLite pragmas:', error);
  }
}

// Initialize on first import (fire and forget)
initializeDatabase();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

export default db;
