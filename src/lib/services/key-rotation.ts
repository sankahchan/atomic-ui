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
import { parseDynamicRoutingPreferences } from '@/lib/services/dynamic-subscription-routing';
import {
  DYNAMIC_ROUTING_EVENT_TYPES,
  recordDynamicRoutingEvent,
  recordDynamicRoutingEventOnce,
} from '@/lib/services/dynamic-routing-events';

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

async function shouldSkipRotationForDrain(input: {
  accessKeyIds: string[];
  drainGraceMinutes: number;
}) {
  if (input.accessKeyIds.length === 0) {
    return false;
  }

  const cutoff = new Date(Date.now() - input.drainGraceMinutes * 60_000);
  const session = await db.connectionSession.findFirst({
    where: {
      accessKeyId: { in: input.accessKeyIds },
      OR: [{ isActive: true }, { lastActiveAt: { gte: cutoff } }],
    },
    orderBy: [{ isActive: 'desc' }, { lastActiveAt: 'desc' }],
    select: {
      id: true,
      isActive: true,
      lastActiveAt: true,
    },
  });

  return session;
}

function resolveRotationTrigger(input: {
  rotationTriggerMode: string;
  nextRotationAt: Date | null;
  dataLimitBytes: bigint | null;
  usedBytes: bigint;
  rotationUsageThresholdPercent: number;
  rotateOnHealthFailure: boolean;
  healthStatuses: Array<'UP' | 'DOWN' | 'SLOW' | 'UNKNOWN'>;
  now: Date;
}) {
  const scheduledDue = Boolean(input.nextRotationAt && input.nextRotationAt <= input.now);
  const usagePercent = input.dataLimitBytes && input.dataLimitBytes > BigInt(0)
    ? Number((input.usedBytes * BigInt(100)) / input.dataLimitBytes)
    : null;
  const usageDue = usagePercent !== null && usagePercent >= input.rotationUsageThresholdPercent;
  const healthDue = input.rotateOnHealthFailure && input.healthStatuses.some((status) => status === 'DOWN' || status === 'SLOW');

  switch (input.rotationTriggerMode) {
    case 'USAGE':
      return usageDue
        ? { shouldRotate: true, reason: `Usage reached ${usagePercent}% of quota.`, trigger: 'USAGE' as const }
        : { shouldRotate: false, reason: 'Usage threshold has not been reached yet.', trigger: 'USAGE' as const };
    case 'HEALTH':
      return healthDue
        ? { shouldRotate: true, reason: 'A serving backend is degraded or down.', trigger: 'HEALTH' as const }
        : { shouldRotate: false, reason: 'No serving backend is degraded right now.', trigger: 'HEALTH' as const };
    case 'COMBINED':
      if (healthDue) {
        return { shouldRotate: true, reason: 'A serving backend is degraded or down.', trigger: 'HEALTH' as const };
      }
      if (usageDue) {
        return { shouldRotate: true, reason: `Usage reached ${usagePercent}% of quota.`, trigger: 'USAGE' as const };
      }
      if (scheduledDue) {
        return { shouldRotate: true, reason: 'The scheduled rotation window has been reached.', trigger: 'SCHEDULED' as const };
      }
      return { shouldRotate: false, reason: 'No rotation trigger has fired yet.', trigger: 'COMBINED' as const };
    default:
      return scheduledDue
        ? { shouldRotate: true, reason: 'The scheduled rotation window has been reached.', trigger: 'SCHEDULED' as const }
        : { shouldRotate: false, reason: 'The next scheduled rotation is not due yet.', trigger: 'SCHEDULED' as const };
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
      status: 'ACTIVE',
    },
    include: {
      accessKeys: {
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          server: {
            select: {
              id: true,
              name: true,
              healthCheck: {
                select: { lastStatus: true },
              },
            },
          },
        },
      },
    },
  });

  for (const dak of daksToRotate) {
    const routingPreferences = parseDynamicRoutingPreferences({
      preferredServerIdsJson: dak.preferredServerIdsJson,
      preferredCountryCodesJson: dak.preferredCountryCodesJson,
      preferredServerWeightsJson: dak.preferredServerWeightsJson,
      preferredCountryWeightsJson: dak.preferredCountryWeightsJson,
      preferredRegionMode: dak.preferredRegionMode,
      sessionStickinessMode: dak.sessionStickinessMode,
      drainGraceMinutes: dak.drainGraceMinutes,
    });
    const trigger = resolveRotationTrigger({
      rotationTriggerMode: dak.rotationTriggerMode,
      nextRotationAt: dak.nextRotationAt,
      dataLimitBytes: dak.dataLimitBytes,
      usedBytes: dak.usedBytes,
      rotationUsageThresholdPercent: dak.rotationUsageThresholdPercent,
      rotateOnHealthFailure: dak.rotateOnHealthFailure,
      healthStatuses: dak.accessKeys.map((key) => (key.server?.healthCheck?.lastStatus as 'UP' | 'DOWN' | 'SLOW' | 'UNKNOWN' | null) ?? 'UNKNOWN'),
      now,
    });

    if (!trigger.shouldRotate) {
      result.skipped++;
      continue;
    }

    if (routingPreferences.sessionStickinessMode === 'DRAIN') {
      const activeSession = await shouldSkipRotationForDrain({
        accessKeyIds: dak.accessKeys.map((key) => key.id),
        drainGraceMinutes: routingPreferences.drainGraceMinutes,
      });

      if (activeSession) {
        result.skipped++;
        await recordDynamicRoutingEventOnce({
          dynamicAccessKeyId: dak.id,
          eventType: DYNAMIC_ROUTING_EVENT_TYPES.ROTATION_SKIPPED,
          severity: 'INFO',
          reason: `Rotation skipped because drain mode detected an active or recent session within ${routingPreferences.drainGraceMinutes} minutes.`,
          windowMinutes: routingPreferences.drainGraceMinutes,
          metadata: {
            trigger: trigger.trigger,
            sessionId: activeSession.id,
          },
        });
        continue;
      }
    }

    logger.debug(`🔄 Rotating keys for DAK "${dak.name}" (${trigger.trigger.toLowerCase()})`);

    await recordDynamicRoutingEvent({
      dynamicAccessKeyId: dak.id,
      eventType: DYNAMIC_ROUTING_EVENT_TYPES.ROTATION_TRIGGERED,
      reason: trigger.reason,
      metadata: {
        trigger: trigger.trigger,
      },
    });

    const rotationResult = await rotateDakKeys(dak.id);

    if (rotationResult.success) {
      result.rotated++;
    } else {
      result.errors.push(`${dak.name}: ${rotationResult.error}`);
    }
  }

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
