/**
 * Usage Snapshot Background Worker
 *
 * This worker runs as a separate Node.js process (not inside Next.js)
 * and periodically collects usage snapshots from all Outline servers.
 *
 * Features:
 * - DB-based locking to prevent double-runs
 * - Exponential backoff on server errors
 * - Partial failure handling (continues if one server fails)
 * - Heartbeat mechanism for lock renewal
 *
 * Run via: npx ts-node src/server/worker.ts
 * Or: node dist/server/worker.js (after build)
 */

import { PrismaClient } from '@prisma/client';
import { createOutlineClient } from '../lib/outline-api';

// Initialize Prisma
const prisma = new PrismaClient();

// Configuration
const WORKER_ID = `worker-${process.pid}-${Date.now()}`;
const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const LOCK_TTL_MS = 10 * 60 * 1000; // 10 minutes (lock expires if worker crashes)
const HEARTBEAT_INTERVAL_MS = 60 * 1000; // 1 minute
const MAX_BACKOFF_MS = 5 * 60 * 1000; // 5 minutes max backoff
const LOCK_ID = 'usage-snapshot-worker';

// Track backoff per server
const serverBackoffs = new Map<string, { delay: number; until: number }>();

// Logging helper
function log(level: 'INFO' | 'WARN' | 'ERROR', message: string, data?: unknown) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level}] [${WORKER_ID}]`;
  if (data) {
    console.log(`${prefix} ${message}`, data);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

/**
 * Acquire the distributed lock
 * Returns true if lock acquired, false otherwise
 */
async function acquireLock(): Promise<boolean> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LOCK_TTL_MS);

  try {
    // Try to create a new lock
    await prisma.workerLock.create({
      data: {
        id: LOCK_ID,
        workerId: WORKER_ID,
        lockedAt: now,
        expiresAt,
        heartbeatAt: now,
      },
    });
    log('INFO', 'Lock acquired successfully');
    return true;
  } catch (error) {
    // Lock might already exist, try to acquire if expired
    const existingLock = await prisma.workerLock.findUnique({
      where: { id: LOCK_ID },
    });

    if (existingLock) {
      // Check if lock is expired
      if (existingLock.expiresAt < now) {
        log('INFO', `Found expired lock from ${existingLock.workerId}, taking over`);
        await prisma.workerLock.update({
          where: { id: LOCK_ID },
          data: {
            workerId: WORKER_ID,
            lockedAt: now,
            expiresAt,
            heartbeatAt: now,
          },
        });
        return true;
      }

      // Lock is held by another worker
      log('INFO', `Lock held by ${existingLock.workerId} until ${existingLock.expiresAt.toISOString()}`);
      return false;
    }

    // Unknown error
    log('ERROR', 'Failed to acquire lock', { error: String(error) });
    return false;
  }
}

/**
 * Renew the lock (heartbeat)
 */
async function renewLock(): Promise<boolean> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LOCK_TTL_MS);

  try {
    const result = await prisma.workerLock.updateMany({
      where: {
        id: LOCK_ID,
        workerId: WORKER_ID,
      },
      data: {
        expiresAt,
        heartbeatAt: now,
      },
    });

    if (result.count === 0) {
      log('WARN', 'Lock renewal failed - lock no longer held by this worker');
      return false;
    }

    return true;
  } catch (error) {
    log('ERROR', 'Failed to renew lock', error);
    return false;
  }
}

/**
 * Release the lock
 */
async function releaseLock(): Promise<void> {
  try {
    await prisma.workerLock.deleteMany({
      where: {
        id: LOCK_ID,
        workerId: WORKER_ID,
      },
    });
    log('INFO', 'Lock released');
  } catch (error) {
    log('ERROR', 'Failed to release lock', error);
  }
}

/**
 * Get backoff delay for a server
 */
function getBackoffDelay(serverId: string): number {
  const backoff = serverBackoffs.get(serverId);
  if (!backoff) return 0;

  const now = Date.now();
  if (now >= backoff.until) {
    serverBackoffs.delete(serverId);
    return 0;
  }

  return backoff.until - now;
}

/**
 * Set backoff for a server (exponential)
 */
function setBackoff(serverId: string): void {
  const existing = serverBackoffs.get(serverId);
  const currentDelay = existing?.delay || 30000; // Start at 30 seconds
  const newDelay = Math.min(currentDelay * 2, MAX_BACKOFF_MS);

  serverBackoffs.set(serverId, {
    delay: newDelay,
    until: Date.now() + newDelay,
  });

  log('WARN', `Server ${serverId} backoff set to ${newDelay / 1000}s`);
}

/**
 * Clear backoff for a server
 */
function clearBackoff(serverId: string): void {
  if (serverBackoffs.has(serverId)) {
    serverBackoffs.delete(serverId);
    log('INFO', `Server ${serverId} backoff cleared`);
  }
}

/**
 * Collect usage snapshots from a single server
 */
async function collectServerSnapshots(server: {
  id: string;
  name: string;
  apiUrl: string;
  apiCertSha256: string;
}): Promise<{ success: boolean; keysProcessed: number }> {
  // Check backoff
  const backoffDelay = getBackoffDelay(server.id);
  if (backoffDelay > 0) {
    log('INFO', `Skipping server ${server.name} (in backoff for ${Math.round(backoffDelay / 1000)}s)`);
    return { success: false, keysProcessed: 0 };
  }

  try {
    const client = createOutlineClient(server.apiUrl, server.apiCertSha256);

    // Get metrics from Outline
    const metrics = await client.getMetrics();
    const usageByKey = metrics.bytesTransferredByUserId;

    // Get all access keys for this server from our DB
    const accessKeys = await prisma.accessKey.findMany({
      where: {
        serverId: server.id,
        status: { not: 'DISABLED' },
      },
      select: {
        id: true,
        outlineKeyId: true,
        usedBytes: true,
      },
    });

    // Create a map of outlineKeyId to our internal key
    const keyMap = new Map(accessKeys.map(k => [k.outlineKeyId, k]));

    // Collect snapshots
    const snapshots: {
      serverId: string;
      keyId: string;
      keyType: string;
      usedBytes: bigint;
      deltaBytes: bigint;
    }[] = [];

    for (const [outlineKeyId, usedBytes] of Object.entries(usageByKey)) {
      const key = keyMap.get(outlineKeyId);
      if (!key) continue; // Key not in our DB

      // Get last snapshot to calculate delta
      const lastSnapshot = await prisma.usageSnapshot.findFirst({
        where: { keyId: key.id },
        orderBy: { createdAt: 'desc' },
      });

      const currentBytes = BigInt(usedBytes);
      const lastBytes = lastSnapshot?.usedBytes || BigInt(0);
      const deltaBytes = currentBytes > lastBytes ? currentBytes - lastBytes : BigInt(0);

      snapshots.push({
        serverId: server.id,
        keyId: key.id,
        keyType: 'ACCESS_KEY',
        usedBytes: currentBytes,
        deltaBytes,
      });
    }

    // Batch insert snapshots
    if (snapshots.length > 0) {
      await prisma.usageSnapshot.createMany({
        data: snapshots,
      });
    }

    // Clear backoff on success
    clearBackoff(server.id);

    log('INFO', `Server ${server.name}: collected ${snapshots.length} snapshots`);
    return { success: true, keysProcessed: snapshots.length };
  } catch (error) {
    log('ERROR', `Failed to collect snapshots from server ${server.name}`, error);
    setBackoff(server.id);
    return { success: false, keysProcessed: 0 };
  }
}

/**
 * Collect snapshots for dynamic keys (aggregated from their attached keys)
 */
async function collectDynamicKeySnapshots(): Promise<number> {
  try {
    const dynamicKeys = await prisma.dynamicAccessKey.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        usedBytes: true,
      },
    });

    const snapshots: {
      keyId: string;
      keyType: string;
      usedBytes: bigint;
      deltaBytes: bigint;
    }[] = [];

    for (const dak of dynamicKeys) {
      // Get last snapshot
      const lastSnapshot = await prisma.usageSnapshot.findFirst({
        where: { keyId: dak.id, keyType: 'DYNAMIC_KEY' },
        orderBy: { createdAt: 'desc' },
      });

      const currentBytes = dak.usedBytes;
      const lastBytes = lastSnapshot?.usedBytes || BigInt(0);
      const deltaBytes = currentBytes > lastBytes ? currentBytes - lastBytes : BigInt(0);

      snapshots.push({
        keyId: dak.id,
        keyType: 'DYNAMIC_KEY',
        usedBytes: currentBytes,
        deltaBytes,
      });
    }

    if (snapshots.length > 0) {
      await prisma.usageSnapshot.createMany({
        data: snapshots,
      });
    }

    log('INFO', `Collected ${snapshots.length} dynamic key snapshots`);
    return snapshots.length;
  } catch (error) {
    log('ERROR', 'Failed to collect dynamic key snapshots', error);
    return 0;
  }
}

/**
 * Main snapshot collection cycle
 */
async function collectSnapshots(): Promise<void> {
  log('INFO', 'Starting snapshot collection cycle');

  // Get all active servers
  const servers = await prisma.server.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      apiUrl: true,
      apiCertSha256: true,
    },
  });

  log('INFO', `Found ${servers.length} active servers`);

  let totalSuccess = 0;
  let totalFailed = 0;
  let totalKeys = 0;

  // Process each server
  for (const server of servers) {
    const result = await collectServerSnapshots(server);
    if (result.success) {
      totalSuccess++;
      totalKeys += result.keysProcessed;
    } else {
      totalFailed++;
    }
  }

  // Collect dynamic key snapshots
  const dynamicKeysProcessed = await collectDynamicKeySnapshots();

  log('INFO', `Snapshot collection complete: ${totalSuccess} servers succeeded, ${totalFailed} failed, ${totalKeys + dynamicKeysProcessed} keys processed`);
}

/**
 * Cleanup old snapshots (keep 30 days)
 */
async function cleanupOldSnapshots(): Promise<void> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 30);

  try {
    const result = await prisma.usageSnapshot.deleteMany({
      where: {
        createdAt: { lt: cutoffDate },
      },
    });

    if (result.count > 0) {
      log('INFO', `Cleaned up ${result.count} old snapshots`);
    }
  } catch (error) {
    log('ERROR', 'Failed to cleanup old snapshots', error);
  }
}

/**
 * Main worker loop
 */
async function runWorker(): Promise<void> {
  log('INFO', 'Usage Snapshot Worker starting...');

  // Try to acquire lock
  const hasLock = await acquireLock();
  if (!hasLock) {
    log('INFO', 'Could not acquire lock, another worker is running. Exiting.');
    await prisma.$disconnect();
    process.exit(0);
  }

  // Setup heartbeat interval
  const heartbeatInterval = setInterval(async () => {
    const stillHaveLock = await renewLock();
    if (!stillHaveLock) {
      log('ERROR', 'Lost lock! Stopping worker.');
      clearInterval(heartbeatInterval);
      await prisma.$disconnect();
      process.exit(1);
    }
  }, HEARTBEAT_INTERVAL_MS);

  // Setup graceful shutdown
  const shutdown = async (signal: string) => {
    log('INFO', `Received ${signal}, shutting down gracefully...`);
    clearInterval(heartbeatInterval);
    await releaseLock();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Initial collection
  await collectSnapshots();

  // Schedule periodic collection
  setInterval(async () => {
    try {
      await collectSnapshots();

      // Cleanup old snapshots occasionally (every hour = 12 cycles)
      if (Math.random() < 0.08) {
        await cleanupOldSnapshots();
      }
    } catch (error) {
      log('ERROR', 'Error in snapshot collection cycle', error);
    }
  }, SNAPSHOT_INTERVAL_MS);

  log('INFO', `Worker started. Collecting snapshots every ${SNAPSHOT_INTERVAL_MS / 1000}s`);
}

// Run the worker
runWorker().catch((error) => {
  log('ERROR', 'Worker crashed', error);
  process.exit(1);
});
