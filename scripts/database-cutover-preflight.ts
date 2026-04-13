import fs from 'node:fs';
import path from 'node:path';

import { getDatabaseRuntimeSummary, isPostgresDatabaseUrl } from '@/lib/database-engine';
import { loadEnvFile, validateProductionEnvironment } from '@/lib/services/production-validation';

function getMergedEnv() {
  const envPath = path.join(process.cwd(), '.env');
  return {
    ...loadEnvFile(envPath),
    ...Object.fromEntries(Object.entries(process.env).map(([key, value]) => [key, value || undefined])),
  };
}

function main() {
  const env = getMergedEnv();
  const validation = validateProductionEnvironment(env);
  const runtime = getDatabaseRuntimeSummary(env);
  const targetDatabaseUrl = process.env.TARGET_DATABASE_URL?.trim() || env.TARGET_DATABASE_URL?.trim() || '';
  const targetRuntime = getDatabaseRuntimeSummary({
    ...env,
    DATABASE_URL: targetDatabaseUrl,
  });

  const errors = [...validation.errors];
  const warnings = [...validation.warnings];

  if (runtime.engine !== 'sqlite') {
    warnings.push('Current runtime is not SQLite. This preflight is mainly intended for SQLite-to-Postgres cutovers.');
  }

  if (!targetDatabaseUrl) {
    errors.push('TARGET_DATABASE_URL is required for Postgres cutover preflight.');
  } else if (!isPostgresDatabaseUrl(targetDatabaseUrl)) {
    errors.push('TARGET_DATABASE_URL must be a Postgres connection string.');
  }

  if (runtime.engine === 'sqlite' && runtime.sqlitePath && !fs.existsSync(runtime.sqlitePath)) {
    errors.push(`SQLite database file was not found at ${runtime.sqlitePath}.`);
  }

  if (runtime.engine === 'sqlite') {
    warnings.push('Dashboard backup/restore are still SQLite-first. Plan a maintenance window before production cutover.');
  }

  if (targetRuntime.engine === 'postgres') {
    warnings.push('After cutover, file-based backup and restore routes must be replaced with pg_dump/pg_restore automation.');
  }

  const result = {
    generatedAt: new Date().toISOString(),
    current: runtime,
    target: targetRuntime,
    errors,
    warnings,
    ready: errors.length === 0,
  };

  console.log(JSON.stringify(result, null, 2));
  if (errors.length > 0) {
    process.exit(1);
  }
}

main();
