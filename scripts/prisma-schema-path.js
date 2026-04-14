#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

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

function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const fileEnv = loadEnvFile(path.join(process.cwd(), '.env'));
  return fileEnv.DATABASE_URL || '';
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

function ensureSchemaPathForCurrentDatabase() {
  const rootDir = process.cwd();
  const canonicalSchemaPath = path.join(rootDir, 'prisma', 'schema.prisma');
  const databaseUrl = resolveDatabaseUrl();
  const engine = resolveDatabaseEngine(databaseUrl);

  if (engine === 'sqlite') {
    return canonicalSchemaPath;
  }

  if (engine !== 'postgres') {
    throw new Error('DATABASE_URL must be a SQLite or Postgres connection string before Prisma commands can run.');
  }

  const generatedDir = path.join(rootDir, 'prisma', '.generated');
  const postgresSchemaPath = path.join(generatedDir, 'schema.postgres.prisma');
  const canonicalSchema = fs.readFileSync(canonicalSchemaPath, 'utf8');
  const postgresSchema = canonicalSchema.replace(
    'provider = "sqlite"',
    'provider = "postgresql"',
  );

  fs.mkdirSync(generatedDir, { recursive: true });
  if (!fs.existsSync(postgresSchemaPath) || fs.readFileSync(postgresSchemaPath, 'utf8') !== postgresSchema) {
    fs.writeFileSync(postgresSchemaPath, postgresSchema);
  }

  return postgresSchemaPath;
}

try {
  process.stdout.write(ensureSchemaPathForCurrentDatabase());
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
