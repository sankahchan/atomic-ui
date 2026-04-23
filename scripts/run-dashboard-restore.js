#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const AdmZip = require('adm-zip');

const POSTGRES_BACKUP_BUNDLE_MANIFEST = 'atomic-ui-backup-manifest.json';
const POSTGRES_BACKUP_BUNDLE_RESTORE_ENV = 'atomic-ui-restore.env';
const POSTGRES_BACKUP_BUNDLE_DUMP = 'backup.dump';
const POSTGRES_RESTORE_ENV_KEYS = new Set([
  'SETTINGS_ENCRYPTION_KEY',
  'TOTP_ENCRYPTION_KEY',
  'JWT_SECRET',
  'TELEGRAM_WEBHOOK_SECRET',
]);

function parseArgs(argv) {
  const args = [...argv];
  const values = {};

  while (args.length > 0) {
    const current = args.shift();
    if (!current || !current.startsWith('--')) {
      continue;
    }

    const key = current.slice(2);
    values[key] = args.shift() || '';
  }

  for (const required of ['app-root', 'job-file', 'job-id', 'backup', 'backup-filename']) {
    if (!values[required]) {
      throw new Error(`Missing required argument: --${required}`);
    }
  }

  return values;
}

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

function applyEnvDefaults(appRoot) {
  const envPath = path.join(appRoot, '.env');
  const fileEnv = loadEnvFile(envPath);
  for (const [key, value] of Object.entries(fileEnv)) {
    if (typeof process.env[key] === 'undefined') {
      process.env[key] = value;
    }
  }
}

function inferBackupFileKind(filename) {
  const normalized = filename.trim().toLowerCase();
  if (normalized.endsWith('.postgres.zip') || normalized.endsWith('.pg.zip')) {
    return 'postgres_archive';
  }
  if (normalized.endsWith('.dump')) {
    return 'postgres_dump';
  }
  if (normalized.endsWith('.sql')) {
    return 'postgres_sql';
  }
  if (normalized.endsWith('.db') || normalized.endsWith('.sqlite') || normalized.endsWith('.bak') || normalized.endsWith('.zip')) {
    return 'sqlite';
  }
  return 'unknown';
}

function parseRestoreEnv(content) {
  return content
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
      if (!POSTGRES_RESTORE_ENV_KEYS.has(key)) {
        return acc;
      }

      let value = trimmed.slice(separator + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      acc[key] = value;
      return acc;
    }, {});
}

function quoteEnvValue(value) {
  return JSON.stringify(value);
}

function applyRestoreEnv(appRoot, values, jobId) {
  const entries = Object.entries(values).filter(([, value]) => typeof value === 'string' && value.trim());
  if (entries.length === 0) {
    return null;
  }

  const envPath = path.join(appRoot, '.env');
  const backupPath = `${envPath}.pre-restore-${jobId}`;
  const existingContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  if (fs.existsSync(envPath) && !fs.existsSync(backupPath)) {
    fs.copyFileSync(envPath, backupPath);
  }

  const lines = existingContent ? existingContent.split(/\r?\n/) : [];
  const pending = new Map(entries);
  const nextLines = lines.map((line) => {
    const separator = line.indexOf('=');
    if (separator === -1) {
      return line;
    }

    const key = line.slice(0, separator).trim();
    if (!pending.has(key)) {
      return line;
    }

    const value = pending.get(key);
    pending.delete(key);
    return `${key}=${quoteEnvValue(value)}`;
  });

  for (const [key, value] of pending.entries()) {
    nextLines.push(`${key}=${quoteEnvValue(value)}`);
  }

  fs.writeFileSync(envPath, nextLines.join('\n').replace(/\n*$/, '\n'));
  for (const [key, value] of entries) {
    process.env[key] = value;
  }

  return backupPath;
}

function readJob(jobFile) {
  return JSON.parse(fs.readFileSync(jobFile, 'utf8'));
}

function writeJob(jobFile, updates) {
  const nextRecord = {
    ...readJob(jobFile),
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  const tempPath = `${jobFile}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(nextRecord, null, 2));
  fs.renameSync(tempPath, jobFile);
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: 'pipe',
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status === 'number' && result.status !== 0) {
    throw new Error(
      [result.stderr, result.stdout].filter(Boolean).join('\n').trim() || `${command} exited with status ${result.status}`,
    );
  }

  return result;
}

function formatMissingPostgresCliMessage(command) {
  return `${command} is not installed on this server. Install the PostgreSQL client tools (for example: apt-get install -y postgresql-client) and try again.`;
}

function formatPostgresRestoreError(error, command, fallback) {
  const message = error instanceof Error ? error.message || '' : String(error || '');

  if (
    (error && typeof error === 'object' && error.code === 'ENOENT') ||
    message.includes(`spawn ${command} ENOENT`) ||
    message.includes(`${command}: command not found`)
  ) {
    return formatMissingPostgresCliMessage(command);
  }

  return message.trim() || fallback;
}

function waitForServiceActive(serviceName) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const result = spawnSync('systemctl', ['is-active', '--quiet', serviceName], {
      stdio: 'ignore',
    });

    if (result.status === 0) {
      return;
    }

    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  }

  throw new Error(`${serviceName} did not become active after restore.`);
}

function restorePostgresDump(backupPath) {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured for Postgres restore.');
  }

  try {
    runCommand('pg_restore', [
      '--clean',
      '--if-exists',
      '--no-owner',
      '--no-privileges',
      '--dbname',
      process.env.DATABASE_URL,
      backupPath,
    ]);
  } catch (error) {
    throw new Error(
      formatPostgresRestoreError(
        error,
        'pg_restore',
        'pg_restore failed while restoring the backup.',
      ),
    );
  }
}

function restorePostgresSql(backupPath) {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured for Postgres restore.');
  }

  try {
    runCommand('/bin/bash', ['-lc', 'psql "$DATABASE_URL" < "$BACKUP_PATH"'], {
      env: {
        ...process.env,
        BACKUP_PATH: backupPath,
      },
    });
  } catch (error) {
    throw new Error(
      formatPostgresRestoreError(
        error,
        'psql',
        'psql failed while restoring the backup.',
      ),
    );
  }
}

function findPostgresDumpArchiveEntry(zip) {
  const entries = zip.getEntries().filter((entry) => !entry.isDirectory);
  return (
    entries.find((entry) => entry.entryName === POSTGRES_BACKUP_BUNDLE_DUMP) ||
    entries.find((entry) => path.posix.basename(entry.entryName).toLowerCase().endsWith('.dump'))
  );
}

function isPostgresArchiveBackup(backupPath) {
  try {
    const zip = new AdmZip(backupPath);
    return Boolean(zip.getEntry(POSTGRES_BACKUP_BUNDLE_MANIFEST) || findPostgresDumpArchiveEntry(zip));
  } catch {
    return false;
  }
}

function restorePostgresArchive(appRoot, backupPath, jobId) {
  const zip = new AdmZip(backupPath);
  const dumpEntry = findPostgresDumpArchiveEntry(zip);
  if (!dumpEntry) {
    throw new Error('Postgres backup bundle is missing backup.dump.');
  }

  const restoreEnvEntry = zip.getEntry(POSTGRES_BACKUP_BUNDLE_RESTORE_ENV);
  if (restoreEnvEntry) {
    applyRestoreEnv(appRoot, parseRestoreEnv(restoreEnvEntry.getData().toString('utf8')), jobId);
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-ui-postgres-restore-'));
  const tempDumpPath = path.join(tempDir, POSTGRES_BACKUP_BUNDLE_DUMP);

  try {
    fs.writeFileSync(tempDumpPath, dumpEntry.getData());
    restorePostgresDump(tempDumpPath);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function restoreSqlite(appRoot, backupPath) {
  runCommand(process.execPath, [path.join(appRoot, 'scripts', 'restore-sqlite-backup.js'), '--backup', backupPath], {
    cwd: appRoot,
    env: {
      ...process.env,
      ATOMIC_UI_ALLOW_LIVE_RESTORE: '1',
    },
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const appRoot = path.resolve(args['app-root']);
  const jobFile = path.resolve(args['job-file']);
  const backupPath = path.resolve(args.backup);
  const backupFilename = args['backup-filename'];
  const serviceName = 'atomic-ui.service';

  applyEnvDefaults(appRoot);
  writeJob(jobFile, {
    status: 'STOPPING_SERVICE',
    startedAt: new Date().toISOString(),
    error: null,
  });

  try {
    runCommand('systemctl', ['stop', serviceName]);

    writeJob(jobFile, { status: 'RESTORING' });

    let fileKind = inferBackupFileKind(backupFilename);
    if (fileKind === 'sqlite' && backupFilename.trim().toLowerCase().endsWith('.zip') && isPostgresArchiveBackup(backupPath)) {
      fileKind = 'postgres_archive';
    }

    if (fileKind === 'postgres_archive') {
      restorePostgresArchive(appRoot, backupPath, args['job-id']);
    } else if (fileKind === 'postgres_dump') {
      restorePostgresDump(backupPath);
    } else if (fileKind === 'postgres_sql') {
      restorePostgresSql(backupPath);
    } else {
      restoreSqlite(appRoot, backupPath);
    }

    writeJob(jobFile, { status: 'STARTING_SERVICE' });
    runCommand('systemctl', ['start', serviceName]);
    waitForServiceActive(serviceName);

    writeJob(jobFile, {
      status: 'SUCCEEDED',
      completedAt: new Date().toISOString(),
      error: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    try {
      runCommand('systemctl', ['start', serviceName]);
    } catch {
      // Best effort only.
    }

    writeJob(jobFile, {
      status: 'FAILED',
      completedAt: new Date().toISOString(),
      error: message,
    });
    throw error;
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
