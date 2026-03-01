/**
 * Key Auto-Rotation Service
 *
 * Rotates underlying access keys for Dynamic Access Keys on a schedule.
 * The subscription URL remains stable — only the server-side keys change.
 *
 * Rotation process:
 * 1. Create new access keys on the same (or load-balanced) servers
 * 2. Attach the new keys to the DAK
 * 3. Delete the old keys from Outline servers
 * 4. Remove old key records from DB
 * 5. Update rotation timestamp
 *
 * This ensures clients transparently get new credentials on their next
 * subscription refresh without any URL change.
 */

import { db } from '@/lib/db';
import { createOutlineClient } from '@/lib/outline-api';
import { generateRandomString } from '@/lib/utils';
import { logger } from '@/lib/logger';

interface RotationResult {
  rotated: number;
  skipped: number;
  errors: string[];
}

/**
 * Calculate the next rotation date based on interval.
 */
function calculateNextRotation(interval: string, fromDate: Date = new Date()): Date | null {
  const next = new Date(fromDate);

  switch (interval) {
    case 'DAILY':
      next.setDate(next.getDate() + 1);
      return next;
    case 'WEEKLY':
      next.setDate(next.getDate() + 7);
      return next;
    case 'BIWEEKLY':
      next.setDate(next.getDate() + 14);
      return next;
    case 'MONTHLY':
      next.setMonth(next.getMonth() + 1);
      return next;
    default:
      return null;
  }
}

/**
 * Rotate keys for a single Dynamic Access Key.
 *
 * Creates new keys on the same servers, swaps them in, and deletes the old ones.
 */
async function rotateDakKeys(dakId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Fetch DAK with its current attached keys
    const dak = await db.dynamicAccessKey.findUnique({
      where: { id: dakId },
      include: {
        accessKeys: {
          where: { status: 'ACTIVE' },
          include: {
            server: true,
          },
        },
      },
    });

    if (!dak) {
      return { success: false, error: 'DAK not found' };
    }

    if (dak.accessKeys.length === 0) {
      // Nothing to rotate — mark as rotated anyway
      await db.dynamicAccessKey.update({
        where: { id: dakId },
        data: {
          lastRotatedAt: new Date(),
          nextRotationAt: calculateNextRotation(dak.rotationInterval),
          rotationCount: { increment: 1 },
        },
      });
      return { success: true };
    }

    const oldKeys = dak.accessKeys;
    const newKeyIds: string[] = [];

    // For each old key, create a replacement on the same server
    for (const oldKey of oldKeys) {
      try {
        const client = createOutlineClient(
          oldKey.server.apiUrl,
          oldKey.server.apiCertSha256
        );

        // Create new key on Outline server
        const newOutlineKey = await client.createAccessKey({
          name: `${dak.name}-rotated-${Date.now()}`,
          method: oldKey.method || dak.method || 'chacha20-ietf-poly1305',
        });

        // Copy data limit from old key if it exists
        if (oldKey.dataLimitBytes) {
          try {
            await client.setAccessKeyDataLimit(
              newOutlineKey.id,
              Number(oldKey.dataLimitBytes)
            );
          } catch {
            // Non-critical: limit will be enforced by bandwidth alerts
          }
        }

        // Create new DB record attached to the DAK
        const newKey = await db.accessKey.create({
          data: {
            outlineKeyId: newOutlineKey.id,
            name: oldKey.name, // Keep the same display name
            email: oldKey.email,
            telegramId: oldKey.telegramId,
            notes: oldKey.notes,
            userId: oldKey.userId,
            serverId: oldKey.serverId,
            accessUrl: newOutlineKey.accessUrl,
            password: newOutlineKey.password,
            port: newOutlineKey.port,
            method: newOutlineKey.method,
            dataLimitBytes: oldKey.dataLimitBytes,
            dataLimitResetStrategy: oldKey.dataLimitResetStrategy,
            expirationType: oldKey.expirationType,
            expiresAt: oldKey.expiresAt,
            durationDays: oldKey.durationDays,
            status: 'ACTIVE',
            prefix: oldKey.prefix,
            subscriptionToken: generateRandomString(32),
            dynamicKeyId: dakId,
            autoDisableOnLimit: oldKey.autoDisableOnLimit,
          },
        });

        newKeyIds.push(newKey.id);

        // Delete old key from Outline server
        try {
          await client.deleteAccessKey(oldKey.outlineKeyId);
        } catch {
          // Key may already be gone — continue
          logger.warn(`Could not delete old key ${oldKey.outlineKeyId} from Outline`);
        }

        // Delete old key from DB
        await db.accessKey.delete({
          where: { id: oldKey.id },
        });

        logger.debug(
          `🔄 Rotated key "${oldKey.name}" on server "${oldKey.server.name}" ` +
          `(old: ${oldKey.outlineKeyId} → new: ${newOutlineKey.id})`
        );
      } catch (keyError) {
        logger.error(`Failed to rotate key "${oldKey.name}":`, keyError);
        // Continue with other keys even if one fails
      }
    }

    // Update DAK rotation metadata
    const now = new Date();
    await db.dynamicAccessKey.update({
      where: { id: dakId },
      data: {
        lastRotatedAt: now,
        nextRotationAt: calculateNextRotation(dak.rotationInterval, now),
        rotationCount: { increment: 1 },
      },
    });

    logger.info(
      `✅ Rotated ${newKeyIds.length}/${oldKeys.length} keys for DAK "${dak.name}"`
    );

    return { success: true };
  } catch (error) {
    const msg = (error as Error).message;
    logger.error(`Rotation failed for DAK ${dakId}: ${msg}`);
    return { success: false, error: msg };
  }
}

/**
 * Check all DAKs with rotation enabled and rotate any that are due.
 * Called periodically by the scheduler.
 */
export async function checkKeyRotations(): Promise<RotationResult> {
  const result: RotationResult = {
    rotated: 0,
    skipped: 0,
    errors: [],
  };

  const now = new Date();

  // Find all DAKs that are due for rotation
  const daksToRotate = await db.dynamicAccessKey.findMany({
    where: {
      rotationEnabled: true,
      rotationInterval: { not: 'NEVER' },
      status: 'ACTIVE',
      OR: [
        { nextRotationAt: { lte: now } },
        { nextRotationAt: null, lastRotatedAt: null }, // Never rotated yet
      ],
    },
    select: {
      id: true,
      name: true,
      rotationInterval: true,
    },
  });

  for (const dak of daksToRotate) {
    logger.debug(`🔄 Rotating keys for DAK "${dak.name}" (interval: ${dak.rotationInterval})`);

    const rotationResult = await rotateDakKeys(dak.id);

    if (rotationResult.success) {
      result.rotated++;
    } else {
      result.errors.push(`${dak.name}: ${rotationResult.error}`);
    }
  }

  result.skipped = (await db.dynamicAccessKey.count({
    where: {
      rotationEnabled: true,
      rotationInterval: { not: 'NEVER' },
      status: 'ACTIVE',
      nextRotationAt: { gt: now },
    },
  }));

  return result;
}

/**
 * Manually trigger rotation for a specific DAK.
 * Called from the UI when an admin clicks "Rotate Now".
 */
export async function triggerManualRotation(
  dakId: string
): Promise<{ success: boolean; error?: string }> {
  return rotateDakKeys(dakId);
}

export { calculateNextRotation };
