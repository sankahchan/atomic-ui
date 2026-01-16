
/**
 * Analytics Service
 * 
 * Handles the collection and storage of historical traffic data.
 * This service is designed to be run periodically (e.g., hourly) by a scheduler.
 */

import { db } from '@/lib/db';
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
                    const currentBytes = usageData.bytesByAccessKey[key.outlineKeyId] || 0;
                    const currentBigInt = BigInt(Math.floor(currentBytes));

                    // 4. Find the last log to calculate delta
                    const lastLog = await db.trafficLog.findFirst({
                        where: { accessKeyId: key.id },
                        orderBy: { recordedAt: 'desc' },
                    });

                    // Calculate delta
                    // Use 0 if no previous log, or if usage has reset (current < last)
                    // For periodic resets (e.g. monthly), Outline might reset the counter.
                    // IF Atomic-UI handles resets, we might still see monotonically increasing stats from Outline depending on reset strategy.
                    // Assuming Outline returns CUMULATIVE usage since its own internal reset.
                    let delta = BigInt(0);

                    if (lastLog) {
                        if (currentBigInt >= lastLog.bytesUsed) {
                            delta = currentBigInt - lastLog.bytesUsed;
                        } else {
                            // Usage reset occurred on server side
                            delta = currentBigInt;
                        }
                    } else {
                        // First log, delta is entire current usage
                        delta = currentBigInt;
                    }

                    // 5. Create new log
                    await db.trafficLog.create({
                        data: {
                            accessKeyId: key.id,
                            bytesUsed: currentBigInt,
                            deltaBytes: delta,
                        },
                    });

                    // 6. Update the key's 'usedBytes' field as well to keep it in sync
                    // Atomic-UI's 'usedBytes' is intended to be 'Total Used', but often we sync it from Outline.
                    // Let's ensure it reflects the latest known value.
                    await db.accessKey.update({
                        where: { id: key.id },
                        data: { usedBytes: currentBigInt },
                    });

                    result.success++;
                }
            } catch (error) {
                console.error(`Failed to snapshot server ${server.name}:`, error);
                result.failed++;
                result.errors.push(`${server.name}: ${(error as Error).message}`);
            }
        }
    } catch (error) {
        console.error('Snapshot failed:', error);
        result.errors.push(`Global error: ${(error as Error).message}`);
    }

    return result;
}
