import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

import { PrismaClient } from '@prisma/client';

import { getDatabaseRuntimeSummary } from '@/lib/database-engine';
import {
  DATABASE_CUTOVER_FORMAT_VERSION,
  getCutoverDataFilePath,
  getDatabaseCutoverModelPlans,
  parseCutoverRow,
  type DatabaseCutoverManifest,
} from '@/lib/database-cutover';
import { applyEnvFileToProcessEnv } from '@/lib/services/production-validation';

function getArg(name: string) {
  const match = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return match ? match.slice(name.length + 3) : undefined;
}

function getRequiredExportDir() {
  const exportDir = getArg('dir') || process.env.CUTOVER_EXPORT_DIR;
  if (!exportDir) {
    throw new Error('CUTOVER_EXPORT_DIR or --dir=/absolute/path is required for cutover import.');
  }
  return path.resolve(process.cwd(), exportDir);
}

async function main() {
  const envPath = path.join(process.cwd(), '.env');
  applyEnvFileToProcessEnv(envPath);

  const runtime = getDatabaseRuntimeSummary(process.env);
  if (runtime.engine !== 'postgres') {
    throw new Error('Cutover import must be run after DATABASE_URL has been switched to the target Postgres database.');
  }

  const exportDir = getRequiredExportDir();
  const manifestPath = path.join(exportDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Cutover manifest not found at ${manifestPath}.`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as DatabaseCutoverManifest;
  if (manifest.version !== DATABASE_CUTOVER_FORMAT_VERSION) {
    throw new Error(`Unsupported cutover manifest version ${manifest.version}.`);
  }

  const batchSize = Number.parseInt(
    getArg('batch-size') || process.env.CUTOVER_BATCH_SIZE || String(manifest.batchSize || 500),
    10,
  );
  const resetTarget =
    (getArg('reset-target') || process.env.CUTOVER_RESET_TARGET || '').toLowerCase() === 'true';

  const prisma = new PrismaClient();
  const plans = getDatabaseCutoverModelPlans();
  const plansByModel = new Map(plans.map((plan) => [plan.modelName, plan]));
  const targetCountsBefore: Record<string, number> = {};

  for (const plan of plans) {
    const delegate = (prisma as Record<string, any>)[plan.delegateName];
    targetCountsBefore[plan.modelName] = await delegate.count();
  }

  const nonEmptyModels = Object.entries(targetCountsBefore).filter(([, count]) => count > 0);
  if (nonEmptyModels.length > 0 && !resetTarget) {
    throw new Error(
      `Target Postgres database is not empty (${nonEmptyModels
        .slice(0, 8)
        .map(([modelName, count]) => `${modelName}:${count}`)
        .join(', ')}). Re-run with CUTOVER_RESET_TARGET=true if this database is disposable.`,
    );
  }

  if (resetTarget) {
    for (const plan of [...plans].reverse()) {
      const delegate = (prisma as Record<string, any>)[plan.delegateName];
      await delegate.deleteMany();
    }
  }

  const importedCounts: Record<string, number> = {};

  for (const [index, modelName] of manifest.modelOrder.entries()) {
    const plan = plansByModel.get(modelName);
    if (!plan) {
      throw new Error(`Manifest references unknown model ${modelName}.`);
    }

    const expectedCount = manifest.counts[modelName] || 0;
    if (expectedCount === 0) {
      importedCounts[modelName] = 0;
      continue;
    }

    const delegate = (prisma as Record<string, any>)[plan.delegateName];
    const filePath = getCutoverDataFilePath(exportDir, index, modelName);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing cutover data file for ${modelName}: ${filePath}`);
    }

    const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    const lineReader = readline.createInterface({
      input: stream,
      crlfDelay: Infinity,
    });

    let batch: Array<Record<string, unknown>> = [];
    let inserted = 0;

    for await (const line of lineReader) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      batch.push(parseCutoverRow(trimmed, plan));
      if (batch.length >= batchSize) {
        await delegate.createMany({ data: batch });
        inserted += batch.length;
        batch = [];
      }
    }

    if (batch.length > 0) {
      await delegate.createMany({ data: batch });
      inserted += batch.length;
    }

    const actualCount = await delegate.count();
    importedCounts[modelName] = actualCount;

    if (actualCount !== expectedCount) {
      throw new Error(`Count mismatch for ${modelName}: expected ${expectedCount}, found ${actualCount} after import.`);
    }

    if (inserted !== expectedCount) {
      throw new Error(`Import row mismatch for ${modelName}: inserted ${inserted}, expected ${expectedCount}.`);
    }
  }

  await prisma.$disconnect();

  console.log(
    JSON.stringify(
      {
        exportDir,
        importedCounts,
        totalImportedRows: Object.values(importedCounts).reduce((sum, value) => sum + value, 0),
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
