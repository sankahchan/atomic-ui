import fs from 'node:fs';
import path from 'node:path';

import { Prisma } from '@prisma/client';

import { resolveDatabaseEngine, resolveSqliteDbPathFromUrl } from '@/lib/database-engine';

export const DATABASE_CUTOVER_FORMAT_VERSION = 1;
export const DATABASE_CUTOVER_EXPORT_DIR = path.join(process.cwd(), 'storage', 'cutover');

export interface DatabaseCutoverModelPlan {
  modelName: string;
  delegateName: string;
  dependencies: string[];
  orderBy:
    | Record<string, 'asc'>
    | Array<Record<string, 'asc'>>
    | undefined;
  scalarFields: Array<{
    name: string;
    type: string;
  }>;
}

export interface DatabaseCutoverManifest {
  version: number;
  generatedAt: string;
  sourceEngine: ReturnType<typeof resolveDatabaseEngine>;
  sourceDatabaseUrl: string;
  sourceSqliteBackupFile: string | null;
  batchSize: number;
  modelOrder: string[];
  counts: Record<string, number>;
  totalRows: number;
}

function getDelegateName(modelName: string) {
  return `${modelName.charAt(0).toLowerCase()}${modelName.slice(1)}`;
}

function getPrimaryKeyFields(model: (typeof Prisma.dmmf.datamodel.models)[number]) {
  if (model.primaryKey?.fields?.length) {
    return model.primaryKey.fields;
  }

  return model.fields.filter((field) => field.isId).map((field) => field.name);
}

function getOrderByForModel(model: (typeof Prisma.dmmf.datamodel.models)[number]) {
  const primaryKeyFields = getPrimaryKeyFields(model);
  if (primaryKeyFields.length === 1) {
    return { [primaryKeyFields[0]]: 'asc' } as Record<string, 'asc'>;
  }

  if (primaryKeyFields.length > 1) {
    return primaryKeyFields.map((fieldName) => ({ [fieldName]: 'asc' as const }));
  }

  if (model.fields.some((field) => field.name === 'createdAt' && field.kind === 'scalar')) {
    return { createdAt: 'asc' } as Record<string, 'asc'>;
  }

  const firstScalarField = model.fields.find((field) => field.kind === 'scalar');
  if (!firstScalarField) {
    return undefined;
  }

  return { [firstScalarField.name]: 'asc' } as Record<string, 'asc'>;
}

export function getDatabaseCutoverModelPlans(): DatabaseCutoverModelPlan[] {
  const models = Prisma.dmmf.datamodel.models;
  const remaining = new Map(
    models.map((model) => [
      model.name,
      new Set(
        model.fields
          .filter(
            (field) =>
              field.kind === 'object' &&
              Array.isArray(field.relationFromFields) &&
              field.relationFromFields.length > 0 &&
              field.type !== model.name,
          )
          .map((field) => field.type),
      ),
    ]),
  );
  const orderedModelNames: string[] = [];

  while (remaining.size > 0) {
    const ready = Array.from(remaining.entries())
      .filter(([, dependencies]) => dependencies.size === 0)
      .map(([modelName]) => modelName)
      .sort();

    if (ready.length === 0) {
      throw new Error('Database cutover model order contains a relation cycle that cannot be resolved automatically.');
    }

    for (const modelName of ready) {
      orderedModelNames.push(modelName);
      remaining.delete(modelName);
    }

    for (const dependencies of Array.from(remaining.values())) {
      for (const modelName of ready) {
        dependencies.delete(modelName);
      }
    }
  }

  return orderedModelNames.map((modelName) => {
    const model = models.find((entry) => entry.name === modelName);
    if (!model) {
      throw new Error(`Unknown Prisma model in cutover order: ${modelName}`);
    }

    const dependencies = model.fields
      .filter(
        (field) =>
          field.kind === 'object' &&
          Array.isArray(field.relationFromFields) &&
          field.relationFromFields.length > 0 &&
          field.type !== model.name,
      )
      .map((field) => field.type)
      .sort();

    return {
      modelName,
      delegateName: getDelegateName(modelName),
      dependencies,
      orderBy: getOrderByForModel(model),
      scalarFields: model.fields
        .filter((field) => field.kind === 'scalar')
        .map((field) => ({
          name: field.name,
          type: field.type,
        })),
    };
  });
}

export function getDatabaseCutoverModelOrder() {
  return getDatabaseCutoverModelPlans().map((plan) => plan.modelName);
}

export function ensureDatabaseCutoverDirectory(directoryPath = DATABASE_CUTOVER_EXPORT_DIR) {
  fs.mkdirSync(directoryPath, { recursive: true });
  return directoryPath;
}

export function createDatabaseCutoverExportDirectory(label?: string) {
  const exportRoot = ensureDatabaseCutoverDirectory();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeLabel = (label || 'sqlite-export').replace(/[^a-zA-Z0-9_-]+/g, '-');
  const exportDir = path.join(exportRoot, `${timestamp}-${safeLabel}`);
  fs.mkdirSync(exportDir, { recursive: true });
  return exportDir;
}

export function redactDatabaseUrl(databaseUrl: string) {
  if (!databaseUrl) {
    return '';
  }

  try {
    const parsed = new URL(databaseUrl);
    if (parsed.password) {
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return databaseUrl;
  }
}

export function createSqliteCutoverSafetyBackup(exportDir: string, databaseUrl = process.env.DATABASE_URL) {
  if (resolveDatabaseEngine(databaseUrl) !== 'sqlite') {
    return null;
  }

  const sqlitePath = resolveSqliteDbPathFromUrl(databaseUrl);
  if (!fs.existsSync(sqlitePath)) {
    throw new Error(`SQLite source database file was not found at ${sqlitePath}.`);
  }

  const backupFile = path.join(exportDir, 'sqlite-source-safety-backup.db');
  fs.copyFileSync(sqlitePath, backupFile);
  return backupFile;
}

export function stringifyCutoverRow(row: Record<string, unknown>) {
  return JSON.stringify(row, (_key, value) =>
    typeof value === 'bigint' ? { __atomicBigInt: value.toString() } : value,
  );
}

export function parseCutoverRow(line: string, plan: DatabaseCutoverModelPlan) {
  const row = JSON.parse(line, (_key, value) => {
    if (
      value &&
      typeof value === 'object' &&
      '__atomicBigInt' in value &&
      typeof value.__atomicBigInt === 'string'
    ) {
      return BigInt(value.__atomicBigInt);
    }
    return value;
  }) as Record<string, unknown>;

  for (const field of plan.scalarFields) {
    if (row[field.name] == null) {
      continue;
    }

    if (field.type === 'DateTime' && typeof row[field.name] === 'string') {
      row[field.name] = new Date(row[field.name] as string);
    }
  }

  return row;
}

export function getCutoverDataFilePath(exportDir: string, index: number, modelName: string) {
  return path.join(exportDir, `${String(index + 1).padStart(3, '0')}-${modelName}.ndjson`);
}
