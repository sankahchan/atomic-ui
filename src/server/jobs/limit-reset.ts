
import { db } from '@/lib/db';
import { createOutlineClient } from '@/lib/outline-api';
import { logger } from '@/lib/logger';

function shouldResetQuota(lastReset: Date | null, strategy: string, now: Date) {
    if (!strategy || strategy === 'NEVER') {
        return false;
    }

    const previousReset = lastReset ? new Date(lastReset) : new Date(0);
    const diffTime = now.getTime() - previousReset.getTime();
    const diffDays = diffTime / (1000 * 3600 * 24);

    switch (strategy) {
        case 'DAILY':
            return diffDays >= 1;
        case 'WEEKLY':
            return diffDays >= 7;
        case 'MONTHLY':
            return diffDays >= 30;
        default:
            return false;
    }
}

async function getRawMetricBytesForKey(input: {
    outlineKeyId: string;
    apiUrl: string;
    apiCertSha256: string;
    usedBytes: bigint;
    usageOffset: bigint | null;
    status: string;
}) {
    if (input.status === 'DISABLED') {
        return input.usedBytes + (input.usageOffset ?? BigInt(0));
    }

    const client = createOutlineClient(input.apiUrl, input.apiCertSha256);
    const metrics = await client.getMetrics();
    const raw = metrics.bytesTransferredByUserId[input.outlineKeyId] ?? metrics.bytesTransferredByUserId[String(input.outlineKeyId)] ?? 0;
    return BigInt(Math.floor(raw));
}

export async function checkPeriodicLimits() {
    logger.debug('🔄 Checking periodic data limits...');

    // Get all Active servers
    const servers = await db.server.findMany({
        where: { isActive: true },
        include: {
            accessKeys: {
                where: {
                    dataLimitResetStrategy: { not: 'NEVER' }
                }
            }
        }
    });

    for (const server of servers) {
        if (server.accessKeys.length === 0) continue;

        try {
            const client = createOutlineClient(server.apiUrl, server.apiCertSha256);
            const metrics = await client.getMetrics();
            const bytesMap = metrics.bytesTransferredByUserId;

            for (const key of server.accessKeys) {
                if (!key.dataLimitResetStrategy || key.dataLimitResetStrategy === 'NEVER') continue;

                const now = new Date();
                const shouldReset = shouldResetQuota(key.lastDataLimitReset, key.dataLimitResetStrategy, now);

                if (shouldReset) {
                    logger.debug(`♻️ Resetting limit for key ${key.name} (${key.dataLimitResetStrategy})`);

                    // Get current Total Usage from server
                    // If key not found in metrics, assume 0 or keep current?
                    // Safe to assume current total from server is the truth
                    const currentTotal = bytesMap[key.outlineKeyId] ?? 0;

                    // New offset is current total (so effective usage becomes 0)
                    const newOffset = BigInt(Math.floor(currentTotal));

                    // Reset DB (including bandwidth alert flags)
                    await db.accessKey.update({
                        where: { id: key.id },
                        data: {
                            usageOffset: newOffset,
                            usedBytes: BigInt(0),
                            lastDataLimitReset: now,
                            status: key.status === 'DEPLETED' ? 'ACTIVE' : undefined, // Reactivate if depleted
                            bandwidthAlertAt80: false,
                            bandwidthAlertAt90: false,
                            quotaAlertsSent: '[]',
                        }
                    });

                    // Update Outline Server Limit
                    if (key.dataLimitBytes) {
                        const limitBytes = BigInt(key.dataLimitBytes);
                        // The server limit must be: UsageSoFar + Limit
                        // UsageSoFar is currentTotal
                        const newServerLimit = BigInt(Math.floor(currentTotal)) + limitBytes;

                        try {
                            await client.setAccessKeyDataLimit(key.outlineKeyId, Number(newServerLimit));
                            logger.debug(`   ✅ Limit updated on server: ${newServerLimit} (Offset: ${currentTotal} + Limit: ${limitBytes})`);
                        } catch (err) {
                            logger.error(`   ❌ Failed to update limit on server for key ${key.id}:`, err);
                        }
                    }
                }
            }
        } catch (error) {
            logger.error(`Error checking limits for server ${server.name}:`, error);
        }
    }

    const dynamicKeys = await db.dynamicAccessKey.findMany({
        where: {
            dataLimitResetStrategy: { not: 'NEVER' },
        },
        include: {
            accessKeys: {
                include: {
                    server: true,
                },
            },
        },
    });

    for (const dynamicKey of dynamicKeys) {
        const now = new Date();
        const shouldReset = shouldResetQuota(dynamicKey.lastDataLimitReset, dynamicKey.dataLimitResetStrategy, now);

        if (!shouldReset) {
            continue;
        }

        logger.debug(`♻️ Resetting limit for dynamic key ${dynamicKey.name} (${dynamicKey.dataLimitResetStrategy})`);

        try {
            for (const key of dynamicKey.accessKeys) {
                if (!key.server) {
                    continue;
                }

                const metricBytes = await getRawMetricBytesForKey({
                    outlineKeyId: key.outlineKeyId,
                    apiUrl: key.server.apiUrl,
                    apiCertSha256: key.server.apiCertSha256,
                    usedBytes: key.usedBytes,
                    usageOffset: key.usageOffset,
                    status: key.status,
                });

                if (key.status !== 'DISABLED' && key.dataLimitBytes) {
                    const client = createOutlineClient(key.server.apiUrl, key.server.apiCertSha256);
                    await client.setAccessKeyDataLimit(
                        key.outlineKeyId,
                        Number(metricBytes + key.dataLimitBytes),
                    );
                }

                await db.accessKey.update({
                    where: { id: key.id },
                    data: {
                        usedBytes: BigInt(0),
                        usageOffset: metricBytes,
                        lastDataLimitReset: now,
                        status: key.status === 'DEPLETED' ? 'ACTIVE' : key.status === 'DISABLED' ? 'ACTIVE' : key.status,
                        bandwidthAlertAt80: false,
                        bandwidthAlertAt90: false,
                        quotaAlertsSent: '[]',
                    },
                });
            }

            await db.dynamicAccessKey.update({
                where: { id: dynamicKey.id },
                data: {
                    usedBytes: BigInt(0),
                    lastDataLimitReset: now,
                    status: dynamicKey.status === 'DEPLETED' ? 'ACTIVE' : dynamicKey.status,
                    sharePageEnabled: dynamicKey.status === 'DEPLETED' ? true : dynamicKey.sharePageEnabled,
                    bandwidthAlertAt80: false,
                    bandwidthAlertAt90: false,
                    quotaAlertsSent: '[]',
                },
            });
        } catch (error) {
            logger.error(`Error checking limits for dynamic key ${dynamicKey.name}:`, error);
        }
    }
}
