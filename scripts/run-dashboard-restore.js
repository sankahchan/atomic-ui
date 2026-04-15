#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

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

  runCommand('pg_restore', [
    '--clean',
    '--if-exists',
    '--no-owner',
    '--no-privileges',
    '--dbname',
    process.env.DATABASE_URL,
    backupPath,
  ]);
}

function restorePostgresSql(backupPath) {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured for Postgres restore.');
  }

  runCommand('/bin/bash', ['-lc', 'psql "$DATABASE_URL" < "$BACKUP_PATH"'], {
    env: {
      ...process.env,
      BACKUP_PATH: backupPath,
    },
  });
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

    const fileKind = inferBackupFileKind(backupFilename);
    if (fileKind === 'postgres_dump') {
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
