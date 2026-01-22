/**
 * Sync Lock - Prevents concurrent sync operations
 * 
 * Uses an in-memory lock with timeout to prevent multiple sync operations
 * from running simultaneously, which can cause race conditions and
 * "database is locked" errors on SQLite.
 */

interface SyncLock {
  isLocked: boolean;
  lockedAt: number | null;
  lockedBy: string | null;
}

const globalForLock = globalThis as unknown as {
  syncLock: SyncLock | undefined;
};

// Initialize lock state
if (!globalForLock.syncLock) {
  globalForLock.syncLock = {
    isLocked: false,
    lockedAt: null,
    lockedBy: null,
  };
}

const lock = globalForLock.syncLock;

// Lock timeout - if a sync takes longer than this, assume it crashed
const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export interface AcquireLockResult {
  acquired: boolean;
  reason?: string;
  lockedBy?: string;
  lockedFor?: number;
}

/**
 * Try to acquire the sync lock
 * @param operationId - Unique identifier for this sync operation
 * @returns Object with acquired status and details
 */
export function acquireSyncLock(operationId: string): AcquireLockResult {
  const now = Date.now();
  
  // Check if lock is stale (timed out)
  if (lock.isLocked && lock.lockedAt) {
    const lockAge = now - lock.lockedAt;
    if (lockAge > LOCK_TIMEOUT_MS) {
      // Lock is stale, force release
      releaseSyncLock(lock.lockedBy || 'unknown');
    }
  }
  
  // Check if already locked
  if (lock.isLocked) {
    return {
      acquired: false,
      reason: 'Another sync operation is in progress',
      lockedBy: lock.lockedBy || undefined,
      lockedFor: lock.lockedAt ? now - lock.lockedAt : undefined,
    };
  }
  
  // Acquire the lock
  lock.isLocked = true;
  lock.lockedAt = now;
  lock.lockedBy = operationId;
  
  return { acquired: true };
}

/**
 * Release the sync lock
 * @param operationId - Must match the ID that acquired the lock
 * @returns true if released, false if not the lock owner
 */
export function releaseSyncLock(operationId: string): boolean {
  // Only release if we own the lock (or force release with matching ID)
  if (lock.lockedBy !== operationId && lock.isLocked) {
    return false;
  }
  
  lock.isLocked = false;
  lock.lockedAt = null;
  lock.lockedBy = null;
  
  return true;
}

/**
 * Check current lock status
 */
export function getSyncLockStatus(): { isLocked: boolean; lockedBy: string | null; lockedForMs: number | null } {
  return {
    isLocked: lock.isLocked,
    lockedBy: lock.lockedBy,
    lockedForMs: lock.lockedAt ? Date.now() - lock.lockedAt : null,
  };
}

/**
 * Helper to run a function with the sync lock
 * Automatically acquires and releases the lock
 */
export async function withSyncLock<T>(
  operationId: string,
  fn: () => Promise<T>
): Promise<{ success: true; result: T } | { success: false; error: string }> {
  const lockResult = acquireSyncLock(operationId);
  
  if (!lockResult.acquired) {
    return {
      success: false,
      error: lockResult.reason || 'Failed to acquire sync lock',
    };
  }
  
  try {
    const result = await fn();
    return { success: true, result };
  } finally {
    releaseSyncLock(operationId);
  }
}
