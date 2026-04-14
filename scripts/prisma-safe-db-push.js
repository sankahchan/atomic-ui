#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) {
    return {};
  }

  return fs
    .readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .reduce((acc, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        return acc;
      }

      const separator = trimmed.indexOf('=');
      if (separator === -1) {
        return acc;
      }

      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
      acc[key] = value;
      return acc;
    }, {});
}

function applyEnvDefaults() {
  const envPath = path.join(process.cwd(), '.env');
  const fileEnv = loadEnvFile(envPath);
  for (const [key, value] of Object.entries(fileEnv)) {
    if (typeof process.env[key] === 'undefined') {
      process.env[key] = value;
    }
  }
}

function resolveDatabaseEngine(databaseUrl) {
  const normalized = (databaseUrl || '').trim().toLowerCase();
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

function resolveSchemaPath() {
  const result = spawnSync(process.execPath, ['scripts/prisma-schema-path.js'], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    const message = (result.stderr || result.stdout || 'Failed to resolve Prisma schema path.').trim();
    throw new Error(message);
  }

  return result.stdout.trim();
}

async function findDuplicateReferralCodes(engine) {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  const query =
    engine === 'postgres'
      ? 'SELECT "referralCode" AS code, COUNT(*)::int AS count FROM "TelegramUserProfile" WHERE "referralCode" IS NOT NULL AND BTRIM("referralCode") <> \'\' GROUP BY "referralCode" HAVING COUNT(*) > 1 ORDER BY COUNT(*) DESC, "referralCode" ASC LIMIT 5'
      : "SELECT referralCode AS code, COUNT(*) AS count FROM TelegramUserProfile WHERE referralCode IS NOT NULL AND TRIM(referralCode) <> '' GROUP BY referralCode HAVING COUNT(*) > 1 ORDER BY COUNT(*) DESC, referralCode ASC LIMIT 5";

  try {
    const rows = await prisma.$queryRawUnsafe(query);
    return Array.isArray(rows)
      ? rows.map((row) => ({
          code: String(row.code),
          count: Number(row.count),
        }))
      : [];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const knownMissingTable =
      message.includes('no such table') ||
      message.includes('does not exist') ||
      message.includes('The table') ||
      message.includes('relation "') ||
      message.includes('P2021');

    if (knownMissingTable) {
      return [];
    }

    throw error;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

async function hasSqliteUserTables() {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  try {
    const rows = await prisma.$queryRawUnsafe(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%' LIMIT 1",
    );
    return Array.isArray(rows) && rows.length > 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const knownMissingDatabase =
      message.includes('no such table') ||
      message.includes('unable to open database file') ||
      message.includes('The table') ||
      message.includes('P2021');

    if (knownMissingDatabase) {
      return false;
    }

    throw error;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

function runPrismaDbPush(schemaPath, engine) {
  const prismaArgs = ['prisma', 'db', 'push', '--schema', schemaPath];
  if (engine === 'sqlite' && process.env.PRISMA_FORCE_ACCEPT_SQLITE_DATA_LOSS === '1') {
    prismaArgs.push('--accept-data-loss');
  }

  const result = spawnSync('npx', prismaArgs, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });

  if (typeof result.status === 'number') {
    process.exit(result.status);
  }

  process.exit(1);
}

async function main() {
  applyEnvDefaults();

  const databaseUrl = process.env.DATABASE_URL || '';
  const engine = resolveDatabaseEngine(databaseUrl);
  if (engine === 'unknown') {
    throw new Error('DATABASE_URL must be configured before Prisma schema push can run.');
  }

  const schemaPath = resolveSchemaPath();
  const duplicates = await findDuplicateReferralCodes(engine);
  if (duplicates.length > 0) {
    const details = duplicates.map((entry) => `  - ${entry.code}: ${entry.count}`).join('\n');
    throw new Error(
      `Refusing to continue because duplicate Telegram referral codes already exist.\n${details}\nResolve the duplicates in TelegramUserProfile before running Prisma db push again.`,
    );
  }

  if (engine === 'sqlite') {
    const populatedSqliteDatabase = await hasSqliteUserTables();
    if (populatedSqliteDatabase && process.env.PRISMA_FORCE_ACCEPT_SQLITE_DATA_LOSS !== '1') {
      throw new Error(
        'Refusing to auto-accept Prisma schema warnings on a populated SQLite database. Review the schema changes manually or rerun with PRISMA_FORCE_ACCEPT_SQLITE_DATA_LOSS=1 if you have already verified the migration impact.',
      );
    }

    if (!populatedSqliteDatabase) {
      process.env.PRISMA_FORCE_ACCEPT_SQLITE_DATA_LOSS = '1';
    }
  }

  runPrismaDbPush(schemaPath, engine);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
