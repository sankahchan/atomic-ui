import fs from 'node:fs';
import path from 'node:path';

import { getDatabaseRuntimeSummary, isPostgresDatabaseUrl } from '@/lib/database-engine';
import {
  applyEnvFileToProcessEnv,
  loadEnvFile,
  validateProductionEnvironment,
} from '@/lib/services/production-validation';

function getMergedEnv() {
  const envPath = path.join(process.cwd(), '.env');
  applyEnvFileToProcessEnv(envPath);
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
    warnings.push('Plan a maintenance window and use db:cutover:export/import/verify instead of dashboard backup/restore for the production cutover.');
  }

  if (targetRuntime.engine === 'postgres') {
    warnings.push('After cutover, use pg_dump plus the repo Postgres cutover scripts instead of SQLite file-copy backup and restore.');
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
