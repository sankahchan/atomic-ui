import fs from 'node:fs';
import path from 'node:path';

import { PrismaClient } from '@prisma/client';

import { getDatabaseRuntimeSummary } from '@/lib/database-engine';
import {
  applyEnvFileToProcessEnv,
  loadEnvFile,
  validateProductionEnvironment,
} from '@/lib/services/production-validation';

async function main() {
  const envPath = path.join(process.cwd(), '.env');
  applyEnvFileToProcessEnv(envPath);
  const env = {
    ...loadEnvFile(envPath),
    ...Object.fromEntries(Object.entries(process.env).map(([key, value]) => [key, value || undefined])),
  };
  const runtime = getDatabaseRuntimeSummary(env);
  const validation = validateProductionEnvironment(env);

  let counts: Record<string, number> | null = null;
  let sqliteFileSizeBytes: number | null = null;
  let sqliteFileExists = false;

  if (runtime.engine === 'sqlite' && runtime.sqlitePath) {
    sqliteFileExists = fs.existsSync(runtime.sqlitePath);
    sqliteFileSizeBytes = sqliteFileExists ? fs.statSync(runtime.sqlitePath).size : null;
  }

  try {
    const prisma = new PrismaClient();
    counts = {
      users: await prisma.user.count(),
      servers: await prisma.server.count(),
      accessKeys: await prisma.accessKey.count(),
      dynamicKeys: await prisma.dynamicAccessKey.count(),
      telegramOrders: await prisma.telegramOrder.count(),
      supportThreads: await prisma.telegramSupportThread.count(),
      schedulerJobs: await prisma.schedulerJob.count(),
    };
    await prisma.$disconnect();
  } catch (error) {
    counts = null;
    validation.warnings.push(`Unable to query live counts: ${(error as Error).message}`);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    envPath,
    runtime,
    validation,
    counts,
    sqliteFileExists,
    sqliteFileSizeBytes,
    nextSteps:
      runtime.engine === 'sqlite'
        ? [
            'Create a production Postgres database and set TARGET_DATABASE_URL before cutover.',
            'Run npm run db:cutover:preflight to validate the target and current environment.',
            'Run npm run db:cutover:export before switching the production runtime.',
          ]
        : [
            'Runtime is no longer SQLite-backed. Use db:cutover:verify and pg_dump-based backups before relying on the new runtime.',
          ],
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
