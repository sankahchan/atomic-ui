
import { db } from '@/lib/db';
import { createOutlineClient } from '@/lib/outline-api';

export async function checkPeriodicLimits() {
    console.log('🔄 Checking periodic data limits...');

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

                const lastReset = key.lastDataLimitReset ? new Date(key.lastDataLimitReset) : new Date(0);
                const now = new Date();
                let shouldReset = false;

                // Check interval
                const diffTime = now.getTime() - lastReset.getTime();
                const diffDays = diffTime / (1000 * 3600 * 24);

                switch (key.dataLimitResetStrategy) {
                    case 'DAILY':
                        if (diffDays >= 1) shouldReset = true;
                        break;
                    case 'WEEKLY':
                        if (diffDays >= 7) shouldReset = true;
                        break;
                    case 'MONTHLY':
                        if (diffDays >= 30) shouldReset = true;
                        break;
                }

                if (shouldReset) {
                    console.log(`♻️ Resetting limit for key ${key.name} (${key.dataLimitResetStrategy})`);

                    // Get current Total Usage from server
                    // If key not found in metrics, assume 0 or keep current?
                    // Safe to assume current total from server is the truth
                    const currentTotal = bytesMap[key.outlineKeyId] ?? 0;

                    // New offset is current total (so effective usage becomes 0)
                    const newOffset = BigInt(Math.floor(currentTotal));

                    // Reset DB
                    await db.accessKey.update({
                        where: { id: key.id },
                        data: {
                            usageOffset: newOffset,
                            usedBytes: BigInt(0),
                            lastDataLimitReset: now,
                            status: key.status === 'DEPLETED' ? 'ACTIVE' : undefined, // Reactivate if depleted
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
                            console.log(`   ✅ Limit updated on server: ${newServerLimit} (Offset: ${currentTotal} + Limit: ${limitBytes})`);
                        } catch (err) {
                            console.error(`   ❌ Failed to update limit on server for key ${key.id}:`, err);
                        }
                    }
                }
            }
        } catch (error) {
            console.error(`Error checking limits for server ${server.name}:`, error);
        }
    }
}
