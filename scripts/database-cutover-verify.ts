import fs from 'node:fs';
import path from 'node:path';

import { PrismaClient } from '@prisma/client';

import { getDatabaseRuntimeSummary } from '@/lib/database-engine';
import { type DatabaseCutoverManifest, getDatabaseCutoverModelPlans } from '@/lib/database-cutover';
import { applyEnvFileToProcessEnv } from '@/lib/services/production-validation';

function getArg(name: string) {
  const match = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return match ? match.slice(name.length + 3) : undefined;
}

function getRequiredExportDir() {
  const exportDir = getArg('dir') || process.env.CUTOVER_EXPORT_DIR;
  if (!exportDir) {
    throw new Error('CUTOVER_EXPORT_DIR or --dir=/absolute/path is required for cutover verification.');
  }
  return path.resolve(process.cwd(), exportDir);
}

async function main() {
  const envPath = path.join(process.cwd(), '.env');
  applyEnvFileToProcessEnv(envPath);

  const runtime = getDatabaseRuntimeSummary(process.env);
  const exportDir = getRequiredExportDir();
  const manifestPath = path.join(exportDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Cutover manifest not found at ${manifestPath}.`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as DatabaseCutoverManifest;
  const prisma = new PrismaClient();
  const plans = getDatabaseCutoverModelPlans();
  const counts: Record<string, number> = {};
  const mismatches: Array<{ modelName: string; expected: number; actual: number }> = [];

  for (const plan of plans) {
    const delegate = (prisma as Record<string, any>)[plan.delegateName];
    const actual = await delegate.count();
    const expected = manifest.counts[plan.modelName] || 0;
    counts[plan.modelName] = actual;

    if (actual !== expected) {
      mismatches.push({
        modelName: plan.modelName,
        expected,
        actual,
      });
    }
  }

  await prisma.$disconnect();

  const result = {
    runtime,
    exportDir,
    counts,
    mismatches,
    ready: mismatches.length === 0,
  };

  console.log(JSON.stringify(result, null, 2));

  if (mismatches.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
