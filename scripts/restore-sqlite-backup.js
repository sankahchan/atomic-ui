#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const AdmZip = require('adm-zip');

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

function resolveSqliteDbPath(databaseUrl) {
  if (resolveDatabaseEngine(databaseUrl) !== 'sqlite') {
    throw new Error('DATABASE_URL must be a SQLite file URL (file:...)');
  }

  const rawPath = (databaseUrl || '').slice('file:'.length);
  return path.isAbsolute(rawPath)
    ? rawPath
    : path.resolve(process.cwd(), 'prisma', rawPath);
}

function parseArgs(argv) {
  const args = [...argv];
  let backupPath = '';

  while (args.length > 0) {
    const current = args.shift();
    if (!current) {
      continue;
    }

    if (current === '--backup') {
      backupPath = args.shift() || '';
      continue;
    }

    if (current.startsWith('--backup=')) {
      backupPath = current.slice('--backup='.length);
      continue;
    }

    if (!backupPath) {
      backupPath = current;
    }
  }

  if (!backupPath) {
    throw new Error('Usage: node scripts/restore-sqlite-backup.js --backup /absolute/path/to/backup.zip');
  }

  return { backupPath: path.resolve(process.cwd(), backupPath) };
}

function ensureServiceIsStopped() {
  if (process.env.ATOMIC_UI_ALLOW_LIVE_RESTORE === '1') {
    return;
  }

  const result = spawnSync('systemctl', ['is-active', '--quiet', 'atomic-ui.service'], {
    stdio: 'ignore',
  });

  if (result.error) {
    return;
  }

  if (result.status === 0) {
    throw new Error(
      'atomic-ui.service is still running. Stop the service before restore, or rerun with ATOMIC_UI_ALLOW_LIVE_RESTORE=1 if you intentionally accept the risk.',
    );
  }
}

function restoreFromArchive(inputPath, dbPath, envPath, timestamp) {
  const zip = new AdmZip(inputPath);
  const entries = zip.getEntries();
  const dbBasename = path.basename(dbPath);
  const dbEntry = entries.find(
    (entry) => entry.entryName === 'atomic-ui.db' || entry.entryName === dbBasename,
  );

  if (!dbEntry) {
    throw new Error(`Backup archive does not contain atomic-ui.db or ${dbBasename}.`);
  }

  const tempDbPath = `${dbPath}.restore-${timestamp}.tmp`;
  fs.writeFileSync(tempDbPath, dbEntry.getData());
  fs.renameSync(tempDbPath, dbPath);

  const envEntry = entries.find((entry) => entry.entryName === '.env');
  if (envEntry) {
    fs.writeFileSync(envPath, envEntry.getData());
  }

  return {
    restoredEnv: Boolean(envEntry),
    sourceType: 'zip',
  };
}

function restoreFromDatabaseCopy(inputPath, dbPath, timestamp) {
  const tempDbPath = `${dbPath}.restore-${timestamp}.tmp`;
  fs.copyFileSync(inputPath, tempDbPath);
  fs.renameSync(tempDbPath, dbPath);
  return {
    restoredEnv: false,
    sourceType: 'sqlite-file',
  };
}

function createSafetyBackups(dbPath, envPath, timestamp) {
  const backups = {};

  if (fs.existsSync(dbPath)) {
    backups.db = `${dbPath}.bak-${timestamp}`;
    fs.copyFileSync(dbPath, backups.db);
  }

  if (fs.existsSync(envPath)) {
    backups.env = `${envPath}.bak-${timestamp}`;
    fs.copyFileSync(envPath, backups.env);
  }

  return backups;
}

function main() {
  applyEnvDefaults();

  const { backupPath } = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup file not found: ${backupPath}`);
  }

  const databaseUrl = process.env.DATABASE_URL || '';
  const engine = resolveDatabaseEngine(databaseUrl);
  if (engine !== 'sqlite') {
    throw new Error('restore:sqlite supports SQLite DATABASE_URL values only.');
  }

  ensureServiceIsStopped();

  const dbPath = resolveSqliteDbPath(databaseUrl);
  const envPath = path.join(process.cwd(), '.env');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safetyBackups = createSafetyBackups(dbPath, envPath, timestamp);

  const extension = path.extname(backupPath).toLowerCase();
  const result =
    extension === '.zip'
      ? restoreFromArchive(backupPath, dbPath, envPath, timestamp)
      : restoreFromDatabaseCopy(backupPath, dbPath, timestamp);

  process.stdout.write(
    [
      'SQLite restore complete.',
      `Source: ${backupPath}`,
      `Database: ${dbPath}`,
      `Backup type: ${result.sourceType}`,
      safetyBackups.db ? `Previous database backup: ${safetyBackups.db}` : null,
      safetyBackups.env ? `Previous env backup: ${safetyBackups.env}` : null,
      result.restoredEnv ? `Environment restored: ${envPath}` : 'Environment restored: no',
      'Restart atomic-ui.service before using the app again.',
    ]
      .filter(Boolean)
      .join('\n') + '\n',
  );
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
