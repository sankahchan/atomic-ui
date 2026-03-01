/**
 * Server Migration Service
 *
 * Migrates access keys from one Outline server to another.
 * For each key:
 *   1. Create a new key on the target Outline server
 *   2. Copy data limit (if set)
 *   3. Update the DB record (serverId, outlineKeyId, accessUrl, etc.)
 *   4. Delete the old key from the source Outline server
 *
 * Supports single-key and bulk migration with per-key error handling
 * so that one failure doesn't abort the entire batch.
 */

import { db } from '@/lib/db';
import { createOutlineClient } from '@/lib/outline-api';
import { logger } from '@/lib/logger';

// ────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────

export interface MigrationKeyResult {
  keyId: string;
  keyName: string;
  success: boolean;
  error?: string;
  /** Outline key ID on the new server (set on success) */
  newOutlineKeyId?: string;
}

export interface MigrationResult {
  migrated: number;
  failed: number;
  total: number;
  results: MigrationKeyResult[];
}

export interface MigrationPreview {
  sourceServer: {
    id: string;
    name: string;
    location: string | null;
  };
  targetServer: {
    id: string;
    name: string;
    location: string | null;
  };
  keys: {
    id: string;
    name: string;
    outlineKeyId: string;
    status: string;
    usedBytes: string;
    dataLimitBytes: string | null;
    dynamicKeyId: string | null;
    dynamicKeyName: string | null;
  }[];
  totalKeys: number;
}

// ────────────────────────────────────────────────
// Preview — show what will be migrated
// ────────────────────────────────────────────────

/**
 * Build a preview of the keys that will be migrated.
 * If `keyIds` is empty/undefined, all active keys on the source server are included.
 */
export async function getMigrationPreview(
  sourceServerId: string,
  targetServerId: string,
  keyIds?: string[],
): Promise<MigrationPreview> {
  const [sourceServer, targetServer] = await Promise.all([
    db.server.findUnique({ where: { id: sourceServerId } }),
    db.server.findUnique({ where: { id: targetServerId } }),
  ]);

  if (!sourceServer) throw new Error('Source server not found');
  if (!targetServer) throw new Error('Target server not found');

  const where: Record<string, unknown> = {
    serverId: sourceServerId,
    status: { in: ['ACTIVE', 'PENDING'] },
  };

  if (keyIds && keyIds.length > 0) {
    where.id = { in: keyIds };
  }

  const keys = await db.accessKey.findMany({
    where,
    include: {
      dynamicKey: { select: { id: true, name: true } },
    },
    orderBy: { name: 'asc' },
  });

  return {
    sourceServer: {
      id: sourceServer.id,
      name: sourceServer.name,
      location: sourceServer.location,
    },
    targetServer: {
      id: targetServer.id,
      name: targetServer.name,
      location: targetServer.location,
    },
    keys: keys.map((k) => ({
      id: k.id,
      name: k.name,
      outlineKeyId: k.outlineKeyId,
      status: k.status,
      usedBytes: k.usedBytes.toString(),
      dataLimitBytes: k.dataLimitBytes?.toString() ?? null,
      dynamicKeyId: k.dynamicKey?.id ?? null,
      dynamicKeyName: k.dynamicKey?.name ?? null,
    })),
    totalKeys: keys.length,
  };
}

// ────────────────────────────────────────────────
// Migrate a single key
// ────────────────────────────────────────────────

async function migrateSingleKey(
  keyId: string,
  targetServerId: string,
  deleteFromSource: boolean,
): Promise<MigrationKeyResult> {
  // 1. Fetch the key with its current server
  const key = await db.accessKey.findUnique({
    where: { id: keyId },
    include: { server: true },
  });

  if (!key) {
    return { keyId, keyName: 'Unknown', success: false, error: 'Key not found' };
  }

  const targetServer = await db.server.findUnique({
    where: { id: targetServerId },
  });

  if (!targetServer) {
    return { keyId, keyName: key.name, success: false, error: 'Target server not found' };
  }

  if (key.serverId === targetServerId) {
    return { keyId, keyName: key.name, success: false, error: 'Key is already on the target server' };
  }

  const sourceClient = createOutlineClient(key.server.apiUrl, key.server.apiCertSha256);
  const targetClient = createOutlineClient(targetServer.apiUrl, targetServer.apiCertSha256);

  try {
    // 2. Create key on target server
    const newOutlineKey = await targetClient.createAccessKey({
      name: key.name,
      method: key.method || 'chacha20-ietf-poly1305',
    });

    // 3. Copy data limit if set
    if (key.dataLimitBytes) {
      try {
        await targetClient.setAccessKeyDataLimit(
          newOutlineKey.id,
          Number(key.dataLimitBytes),
        );
      } catch {
        // Non-critical — bandwidth alerts will enforce the limit
        logger.warn(`Could not set data limit on new key ${newOutlineKey.id}`);
      }
    }

    // 4. Update DB record to point to the new server
    await db.accessKey.update({
      where: { id: keyId },
      data: {
        serverId: targetServerId,
        outlineKeyId: newOutlineKey.id,
        accessUrl: newOutlineKey.accessUrl,
        password: newOutlineKey.password,
        port: newOutlineKey.port,
        method: newOutlineKey.method,
        // Reset usage tracking for the new server context
        usageOffset: key.usedBytes, // Preserve cumulative count by setting offset
      },
    });

    // 5. Delete old key from source server (if requested)
    if (deleteFromSource) {
      try {
        await sourceClient.deleteAccessKey(key.outlineKeyId);
      } catch {
        logger.warn(
          `Could not delete old key ${key.outlineKeyId} from source server "${key.server.name}"`,
        );
      }
    }

    logger.info(
      `✅ Migrated key "${key.name}" from "${key.server.name}" → "${targetServer.name}" ` +
        `(old: ${key.outlineKeyId} → new: ${newOutlineKey.id})`,
    );

    return {
      keyId,
      keyName: key.name,
      success: true,
      newOutlineKeyId: newOutlineKey.id,
    };
  } catch (error) {
    const msg = (error as Error).message;
    logger.error(`Migration failed for key "${key.name}": ${msg}`);
    return { keyId, keyName: key.name, success: false, error: msg };
  }
}

// ────────────────────────────────────────────────
// Bulk migration
// ────────────────────────────────────────────────

/**
 * Migrate multiple keys from one server to another.
 *
 * @param sourceServerId  - The server to move keys FROM
 * @param targetServerId  - The server to move keys TO
 * @param keyIds          - Specific key IDs to migrate (empty = all active keys on source)
 * @param deleteFromSource - Whether to delete the old key from the source Outline server
 */
export async function migrateKeys(
  sourceServerId: string,
  targetServerId: string,
  keyIds: string[],
  deleteFromSource: boolean = true,
): Promise<MigrationResult> {
  const result: MigrationResult = {
    migrated: 0,
    failed: 0,
    total: 0,
    results: [],
  };

  // If no specific keys, get all eligible keys from the source server
  let idsToMigrate = keyIds;

  if (idsToMigrate.length === 0) {
    const keys = await db.accessKey.findMany({
      where: {
        serverId: sourceServerId,
        status: { in: ['ACTIVE', 'PENDING'] },
      },
      select: { id: true },
    });
    idsToMigrate = keys.map((k) => k.id);
  }

  result.total = idsToMigrate.length;

  // Migrate keys sequentially to avoid overwhelming servers
  for (const id of idsToMigrate) {
    const keyResult = await migrateSingleKey(id, targetServerId, deleteFromSource);
    result.results.push(keyResult);

    if (keyResult.success) {
      result.migrated++;
    } else {
      result.failed++;
    }
  }

  logger.info(
    `🔄 Migration complete: ${result.migrated}/${result.total} migrated, ${result.failed} failed`,
  );

  return result;
}
