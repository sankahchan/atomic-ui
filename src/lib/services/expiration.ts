/**
 * Expiration Service
 *
 * Handles the checking and updating of access key expiration status.
 * This service is designed to be run periodically (e.g., every 5 minutes) by a scheduler.
 *
 * Tasks:
 * 1. Mark keys as EXPIRED when their expiresAt date has passed
 * 2. Mark keys as DEPLETED when they exceed their data limits
 * 3. Archive expired/depleted keys and remove them from the Outline server
 */

import { db } from '@/lib/db';
import { createOutlineClient } from '@/lib/outline-api';

interface ExpirationResult {
    expiredKeys: number;
    depletedKeys: number;
    archivedKeys: number;
    errors: string[];
}

/**
 * Check and update expiration status for all keys.
 *
 * This function:
 * 1. Marks keys as EXPIRED if their expiresAt date has passed
 * 2. Marks keys as DEPLETED if they've exceeded their data limit
 * 3. Archives expired/depleted keys and removes them from Outline server
 */
export async function checkExpirations(): Promise<ExpirationResult> {
    const result: ExpirationResult = {
        expiredKeys: 0,
        depletedKeys: 0,
        archivedKeys: 0,
        errors: [],
    };

    const now = new Date();

    try {
        // Step 1: Find and mark expired keys (expiresAt has passed)
        const expiredResult = await db.accessKey.updateMany({
            where: {
                status: { in: ['ACTIVE', 'PENDING'] },
                expiresAt: {
                    not: null,
                    lte: now,
                },
            },
            data: {
                status: 'EXPIRED',
            },
        });
        result.expiredKeys = expiredResult.count;

        // Step 2: Find and mark depleted keys (usage >= limit)
        const keysToCheckDepletion = await db.accessKey.findMany({
            where: {
                status: 'ACTIVE',
                dataLimitBytes: { not: null },
            },
            select: {
                id: true,
                usedBytes: true,
                dataLimitBytes: true,
            },
        });

        for (const key of keysToCheckDepletion) {
            if (key.dataLimitBytes && key.usedBytes >= key.dataLimitBytes) {
                await db.accessKey.update({
                    where: { id: key.id },
                    data: { status: 'DEPLETED' },
                });
                result.depletedKeys++;
            }
        }

        // Step 3: Archive expired and depleted keys
        const keysToArchive = await db.accessKey.findMany({
            where: {
                status: { in: ['EXPIRED', 'DEPLETED'] },
            },
            include: {
                server: true,
            },
        });

        for (const key of keysToArchive) {
            try {
                // Remove from Outline server
                const client = createOutlineClient(key.server.apiUrl, key.server.apiCertSha256);
                try {
                    await client.deleteAccessKey(key.outlineKeyId);
                } catch (outlineError) {
                    // Log but continue with archiving even if Outline deletion fails
                    console.warn(`Failed to delete key ${key.name} from Outline:`, outlineError);
                }

                // Archive the key (keep for 3 months)
                const deleteAfter = new Date();
                deleteAfter.setMonth(deleteAfter.getMonth() + 3);

                await db.archivedKey.create({
                    data: {
                        originalKeyId: key.id,
                        outlineKeyId: key.outlineKeyId,
                        name: key.name,
                        email: key.email,
                        telegramId: key.telegramId,
                        notes: key.notes,
                        serverName: key.server.name,
                        serverLocation: key.server.location,
                        accessUrl: key.accessUrl,
                        dataLimitBytes: key.dataLimitBytes,
                        usedBytes: key.usedBytes,
                        expirationType: key.expirationType,
                        expiresAt: key.expiresAt,
                        durationDays: key.durationDays,
                        archiveReason: key.status === 'EXPIRED' ? 'EXPIRED' : 'DEPLETED',
                        originalStatus: key.status,
                        firstUsedAt: key.firstUsedAt,
                        lastUsedAt: key.lastUsedAt,
                        createdAt: key.createdAt,
                        deleteAfter,
                    },
                });

                // Delete the access key from the database
                await db.accessKey.delete({
                    where: { id: key.id },
                });

                result.archivedKeys++;
            } catch (archiveError) {
                console.error(`Failed to archive key ${key.name}:`, archiveError);
                result.errors.push(`${key.name}: ${(archiveError as Error).message}`);
            }
        }
    } catch (error) {
        console.error('Expiration check failed:', error);
        result.errors.push(`Global error: ${(error as Error).message}`);
    }

    return result;
}
