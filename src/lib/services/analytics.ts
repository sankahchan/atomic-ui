
/**
 * Analytics Service
 * 
 * Handles the collection and storage of historical traffic data.
 * This service is designed to be run periodically (e.g., hourly) by a scheduler.
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { createOutlineClient } from '@/lib/outline-api';

interface TrafficSnapshot {
    success: number;
    failed: number;
    errors: string[];
}

/**
 * Snapshot current traffic usage for all active servers.
 * 
 * Iterates through all servers, fetches current usage from Outline,
 * and records the delta (usage since last log) in the TrafficLog table.
 */
export async function snapshotTraffic(): Promise<TrafficSnapshot> {
    const result: TrafficSnapshot = {
        success: 0,
        failed: 0,
        errors: [],
    };

    try {
        // 1. Get all active servers
        const servers = await db.server.findMany({
            where: { isActive: true },
            include: { accessKeys: true },
        });

        for (const server of servers) {
            if (!server.apiUrl) continue;

            try {
                // 2. Fetch usage from Outline API
                const client = createOutlineClient(server.apiUrl, server.apiCertSha256);
                const usageData = await client.getDataUsage(); // Returns Map<keyId, bytes>

                // 3. Process each key
                for (const key of server.accessKeys) {
                    const rawBytes = usageData.bytesByAccessKey[key.outlineKeyId] || 0;
                    const rawBigInt = BigInt(Math.floor(rawBytes));
                    const offset = key.usageOffset || BigInt(0);
                    const effectiveUsedBytes = rawBigInt < offset ? rawBigInt : rawBigInt - offset;

                    let delta = BigInt(0);
                    if (effectiveUsedBytes >= key.usedBytes) {
                        delta = effectiveUsedBytes - key.usedBytes;
                    } else {
                        delta = effectiveUsedBytes;
                    }

                    // 5. Create new log
                    await db.trafficLog.create({
                        data: {
                            accessKeyId: key.id,
                            bytesUsed: effectiveUsedBytes,
                            deltaBytes: delta,
                        },
                    });

                    // 6. Keep the key record aligned with the effective cumulative usage.
                    await db.accessKey.update({
                        where: { id: key.id },
                        data: {
                            usedBytes: effectiveUsedBytes,
                            ...(rawBigInt < offset ? { usageOffset: BigInt(0) } : {}),
                        },
                    });

                    result.success++;
                }
            } catch (error) {
                logger.warn(`Failed to snapshot traffic for server ${server.name}`, error);
                result.failed++;
                result.errors.push(`${server.name}: ${(error as Error).message}`);
            }
        }
    } catch (error) {
        logger.error('Traffic snapshot failed', error);
        result.errors.push(`Global error: ${(error as Error).message}`);
    }

    return result;
}
