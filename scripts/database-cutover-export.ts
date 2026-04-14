import fs from 'node:fs';
import path from 'node:path';
import { once } from 'node:events';

import { PrismaClient } from '@prisma/client';

import { getDatabaseRuntimeSummary } from '@/lib/database-engine';
import {
  createDatabaseCutoverExportDirectory,
  createSqliteCutoverSafetyBackup,
  getCutoverDataFilePath,
  getDatabaseCutoverModelPlans,
  redactDatabaseUrl,
  stringifyCutoverRow,
  type DatabaseCutoverManifest,
  DATABASE_CUTOVER_FORMAT_VERSION,
} from '@/lib/database-cutover';
import { applyEnvFileToProcessEnv } from '@/lib/services/production-validation';

function getArg(name: string) {
  const match = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return match ? match.slice(name.length + 3) : undefined;
}

async function main() {
  const envPath = path.join(process.cwd(), '.env');
  applyEnvFileToProcessEnv(envPath);

  const runtime = getDatabaseRuntimeSummary(process.env);
  if (runtime.engine !== 'sqlite') {
    throw new Error('Cutover export must be run while DATABASE_URL still points at the source SQLite database.');
  }

  const exportDir = createDatabaseCutoverExportDirectory(
    getArg('label') || process.env.CUTOVER_EXPORT_LABEL,
  );
  const batchSize = Number.parseInt(
    getArg('batch-size') || process.env.CUTOVER_BATCH_SIZE || '500',
    10,
  );
  const skipSqliteBackup =
    (getArg('skip-sqlite-backup') || process.env.CUTOVER_SKIP_SQLITE_BACKUP || '').toLowerCase() ===
    'true';
  const sqliteSafetyBackupFile = skipSqliteBackup
    ? null
    : createSqliteCutoverSafetyBackup(exportDir, process.env.DATABASE_URL);

  const prisma = new PrismaClient();
  const plans = getDatabaseCutoverModelPlans();
  const counts: Record<string, number> = {};

  for (const [index, plan] of plans.entries()) {
    const delegate = (prisma as Record<string, any>)[plan.delegateName];
    if (!delegate || typeof delegate.findMany !== 'function' || typeof delegate.count !== 'function') {
      throw new Error(`Prisma delegate "${plan.delegateName}" is not available for model ${plan.modelName}.`);
    }

    const totalCount = await delegate.count();
    counts[plan.modelName] = totalCount;
    if (totalCount === 0) {
      continue;
    }

    const filePath = getCutoverDataFilePath(exportDir, index, plan.modelName);
    const stream = fs.createWriteStream(filePath, { encoding: 'utf8' });
    let offset = 0;

    while (offset < totalCount) {
      const rows = await delegate.findMany({
        ...(plan.orderBy ? { orderBy: plan.orderBy } : {}),
        skip: offset,
        take: batchSize,
      });

      if (rows.length === 0) {
        break;
      }

      for (const row of rows) {
        stream.write(`${stringifyCutoverRow(row)}\n`);
      }

      offset += rows.length;
    }

    stream.end();
    await once(stream, 'finish');
  }

  await prisma.$disconnect();

  const manifest: DatabaseCutoverManifest = {
    version: DATABASE_CUTOVER_FORMAT_VERSION,
    generatedAt: new Date().toISOString(),
    sourceEngine: runtime.engine,
    sourceDatabaseUrl: redactDatabaseUrl(process.env.DATABASE_URL || ''),
    sourceSqliteBackupFile: sqliteSafetyBackupFile ? path.basename(sqliteSafetyBackupFile) : null,
    batchSize,
    modelOrder: plans.map((plan) => plan.modelName),
    counts,
    totalRows: Object.values(counts).reduce((sum, value) => sum + value, 0),
  };

  fs.writeFileSync(path.join(exportDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log(
    JSON.stringify(
      {
        exportDir,
        manifest: path.join(exportDir, 'manifest.json'),
        sqliteSafetyBackupFile,
        counts,
        totalRows: manifest.totalRows,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
