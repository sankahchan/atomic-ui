/**
 * Bandwidth Alerts Service
 *
 * Monitors access key data usage and sends Telegram alerts at 80% and 90%.
 * Auto-disables keys when they reach 100% of their data limit.
 *
 * Runs every 5 minutes via the scheduler alongside expiration checks.
 */

import { db } from '@/lib/db';
import {
    computeArchiveAfterAt,
    parseQuotaAlertsSent,
    parseQuotaAlertThresholds,
    serializeQuotaAlertsSent,
} from '@/lib/access-key-policies';
import { createOutlineClient } from '@/lib/outline-api';
import { getTelegramConfig } from '@/lib/services/telegram-bot';
import { sendTelegramMessage } from '@/lib/services/telegram-runtime';
import { formatBytes } from '@/lib/utils';

interface BandwidthAlertResult {
    alertsSent80: number;
    alertsSent90: number;
    autoDisabled: number;
    errors: string[];
}

/**
 * Check bandwidth usage for all active keys with data limits.
 * - Sends Telegram alert at 80% usage (once)
 * - Sends Telegram alert at 90% usage (once)
 * - Auto-disables key at 100% if autoDisableOnLimit is true
 */
export async function checkBandwidthAlerts(): Promise<BandwidthAlertResult> {
    const result: BandwidthAlertResult = {
        alertsSent80: 0,
        alertsSent90: 0,
        autoDisabled: 0,
        errors: [],
    };

    try {
        // Get Telegram config for sending alerts
        const telegramConfig = await getTelegramConfig();

        // Find all active keys with data limits
        const keys = await db.accessKey.findMany({
            where: {
                status: 'ACTIVE',
                dataLimitBytes: { not: null },
            },
            select: {
                id: true,
                name: true,
                outlineKeyId: true,
                usedBytes: true,
                dataLimitBytes: true,
                telegramId: true,
                email: true,
                bandwidthAlertAt80: true,
                bandwidthAlertAt90: true,
                quotaAlertThresholds: true,
                quotaAlertsSent: true,
                autoDisableOnLimit: true,
                autoArchiveAfterDays: true,
                telegramDeliveryEnabled: true,
                serverId: true,
                server: {
                    select: {
                        name: true,
                        apiUrl: true,
                        apiCertSha256: true,
                    },
                },
            },
        });

        for (const key of keys) {
            if (!key.dataLimitBytes) continue;

            const usedBytes = Number(key.usedBytes);
            const limitBytes = Number(key.dataLimitBytes);
            const usagePercent = (usedBytes / limitBytes) * 100;
            const thresholds = parseQuotaAlertThresholds(key.quotaAlertThresholds);
            const sentThresholds = parseQuotaAlertsSent(key.quotaAlertsSent);

            try {
                // --- 100% Check: Auto-disable ---
                if (usagePercent >= 100 && key.autoDisableOnLimit) {
                    await autoDisableKey(key);
                    result.autoDisabled++;

                    // Notify about auto-disable
                    if (telegramConfig && key.telegramDeliveryEnabled) {
                        await sendBandwidthNotification(
                            telegramConfig.botToken,
                            key,
                            usagePercent,
                            'DISABLED',
                            telegramConfig.adminChatIds,
                            { serverName: key.server.name }
                        );
                    }
                    continue; // Skip lower threshold checks
                }

                const crossedThresholds = thresholds.filter((threshold) => usagePercent >= threshold);
                const newlyCrossed = crossedThresholds.filter((threshold) => !sentThresholds.includes(threshold));

                if (newlyCrossed.length > 0) {
                    const highestThreshold = newlyCrossed[newlyCrossed.length - 1];

                    await db.accessKey.update({
                        where: { id: key.id },
                        data: {
                            quotaAlertsSent: serializeQuotaAlertsSent([...sentThresholds, ...crossedThresholds]),
                            bandwidthAlertAt80: key.bandwidthAlertAt80 || crossedThresholds.some((threshold) => threshold >= 80),
                            bandwidthAlertAt90: key.bandwidthAlertAt90 || crossedThresholds.some((threshold) => threshold >= 90),
                        },
                    });

                    if (telegramConfig && key.telegramDeliveryEnabled) {
                        await sendBandwidthNotification(
                            telegramConfig.botToken,
                            key,
                            usagePercent,
                            highestThreshold,
                            telegramConfig.adminChatIds,
                            { serverName: key.server.name }
                        );
                    }

                    await logNotification(
                        key.id,
                        `BANDWIDTH_${highestThreshold}`,
                        `Key "${key.name}" reached ${usagePercent.toFixed(1)}% of data limit`
                    );

                    if (highestThreshold >= 90) {
                        result.alertsSent90++;
                    } else {
                        result.alertsSent80++;
                    }
                }
            } catch (keyError) {
                result.errors.push(`Key ${key.name}: ${(keyError as Error).message}`);
            }
        }

        const dynamicKeys = await db.dynamicAccessKey.findMany({
            where: {
                status: 'ACTIVE',
                dataLimitBytes: { not: null },
            },
            select: {
                id: true,
                name: true,
                usedBytes: true,
                dataLimitBytes: true,
                telegramId: true,
                bandwidthAlertAt80: true,
                bandwidthAlertAt90: true,
                quotaAlertThresholds: true,
                quotaAlertsSent: true,
                autoDisableOnLimit: true,
            },
        });

        for (const key of dynamicKeys) {
            if (!key.dataLimitBytes) continue;

            const usedBytes = Number(key.usedBytes);
            const limitBytes = Number(key.dataLimitBytes);
            const usagePercent = (usedBytes / limitBytes) * 100;
            const thresholds = parseQuotaAlertThresholds(key.quotaAlertThresholds);
            const sentThresholds = parseQuotaAlertsSent(key.quotaAlertsSent);

            try {
                if (usagePercent >= 100 && key.autoDisableOnLimit) {
                    await autoDisableDynamicKey(key.id);
                    result.autoDisabled++;

                    if (telegramConfig) {
                        await sendBandwidthNotification(
                            telegramConfig.botToken,
                            {
                                name: key.name,
                                telegramId: key.telegramId,
                                usedBytes: key.usedBytes,
                                dataLimitBytes: key.dataLimitBytes,
                            },
                            usagePercent,
                            'DISABLED',
                            telegramConfig.adminChatIds,
                            { keyTypeLabel: 'Dynamic key', serverName: 'Dynamic routing' }
                        );
                    }
                    continue;
                }

                const crossedThresholds = thresholds.filter((threshold) => usagePercent >= threshold);
                const newlyCrossed = crossedThresholds.filter((threshold) => !sentThresholds.includes(threshold));

                if (newlyCrossed.length > 0) {
                    const highestThreshold = newlyCrossed[newlyCrossed.length - 1];

                    await db.dynamicAccessKey.update({
                        where: { id: key.id },
                        data: {
                            quotaAlertsSent: serializeQuotaAlertsSent([...sentThresholds, ...crossedThresholds]),
                            bandwidthAlertAt80: key.bandwidthAlertAt80 || crossedThresholds.some((threshold) => threshold >= 80),
                            bandwidthAlertAt90: key.bandwidthAlertAt90 || crossedThresholds.some((threshold) => threshold >= 90),
                        },
                    });

                    if (telegramConfig) {
                        await sendBandwidthNotification(
                            telegramConfig.botToken,
                            {
                                name: key.name,
                                telegramId: key.telegramId,
                                usedBytes: key.usedBytes,
                                dataLimitBytes: key.dataLimitBytes,
                            },
                            usagePercent,
                            highestThreshold,
                            telegramConfig.adminChatIds,
                            { keyTypeLabel: 'Dynamic key', serverName: 'Dynamic routing' }
                        );
                    }

                    if (highestThreshold >= 90) {
                        result.alertsSent90++;
                    } else {
                        result.alertsSent80++;
                    }
                }
            } catch (keyError) {
                result.errors.push(`Dynamic key ${key.name}: ${(keyError as Error).message}`);
            }
        }
    } catch (error) {
        result.errors.push(`Global error: ${(error as Error).message}`);
    }

    return result;
}

/**
 * Auto-disable a key that has exceeded its data limit.
 * Removes the key from the Outline server and updates status.
 */
async function autoDisableKey(key: {
    id: string;
    outlineKeyId: string;
    name: string;
    autoArchiveAfterDays: number;
    server: { apiUrl: string; apiCertSha256: string };
}) {
    try {
        // Delete from Outline server to stop traffic
        const client = createOutlineClient(key.server.apiUrl, key.server.apiCertSha256);
        try {
            await client.deleteAccessKey(key.outlineKeyId);
        } catch {
            // Key might already be gone, continue
        }

        // Update DB status
        await db.accessKey.update({
            where: { id: key.id },
            data: {
                status: 'DEPLETED',
                disabledAt: new Date(),
                disabledOutlineKeyId: key.outlineKeyId,
                estimatedDevices: 0,
                archiveAfterAt: computeArchiveAfterAt(new Date(), key.autoArchiveAfterDays),
            },
        });

        // Close active sessions
        await db.connectionSession.updateMany({
            where: {
                accessKeyId: key.id,
                isActive: true,
            },
            data: {
                isActive: false,
                endedAt: new Date(),
                endedReason: 'KEY_DEPLETED',
            },
        });
    } catch (error) {
        console.error(`Failed to auto-disable key ${key.name}:`, error);
        throw error;
    }
}

/**
 * Send bandwidth alert via Telegram to the key's user and admin.
 */
async function sendBandwidthNotification(
    botToken: string,
    key: {
        name: string;
        telegramId: string | null;
        usedBytes: bigint;
        dataLimitBytes: bigint | null;
    },
    usagePercent: number,
    level: number | 'DISABLED',
    adminChatIds: string[],
    options?: { keyTypeLabel?: string; serverName?: string }
) {
    const used = formatBytes(key.usedBytes);
    const limit = key.dataLimitBytes ? formatBytes(key.dataLimitBytes) : 'N/A';
    const remaining = key.dataLimitBytes
        ? formatBytes(BigInt(Math.max(0, Number(key.dataLimitBytes) - Number(key.usedBytes))))
        : 'N/A';
    const keyTypeLabel = options?.keyTypeLabel ?? 'Key';
    const serverName = options?.serverName;

    let emoji = '⚠️';
    let title = 'Data Usage Warning';
    let statusLine = `📊 Usage: <b>${usagePercent.toFixed(1)}%</b>`;

    switch (level) {
        case 70:
        case 80:
        case 85:
            emoji = '⚠️';
            title = `Data Usage Warning (${level}%)`;
            statusLine = `📊 Usage: <b>${usagePercent.toFixed(1)}%</b>`;
            break;
        case 90:
        case 95:
            emoji = '🔴';
            title = `Data Usage Critical (${level}%)`;
            statusLine = `📊 Usage: <b>${usagePercent.toFixed(1)}%</b>`;
            break;
        case 'DISABLED':
            emoji = '🚫';
            title = 'Key Auto-Disabled (100%)';
            statusLine = '📊 Data limit reached — key has been disabled';
            break;
        default:
            break;
    }

    const message = [
        `${emoji} <b>${title}</b>`,
        '',
        `🔑 ${keyTypeLabel}: <b>${key.name}</b>`,
        serverName ? `🖥 Server: ${serverName}` : null,
        '',
        statusLine,
        `📈 Used: ${used} / ${limit}`,
        level !== 'DISABLED' ? `📉 Remaining: ${remaining}` : '',
        '',
        level === 'DISABLED'
            ? '⚡ This key has been automatically disabled. Contact admin to re-enable.'
            : typeof level === 'number' && level >= 90
                ? '⚡ Please reduce usage or contact admin to extend your limit.'
                : '💡 Consider monitoring your usage to avoid interruption.',
    ].filter(Boolean).join('\n');

    // Send to user if they have a Telegram ID
    if (key.telegramId) {
        await sendTelegramMessage(botToken, key.telegramId, message);
    }

    // Send to all admin chat IDs
    for (const adminId of adminChatIds) {
        await sendTelegramMessage(botToken, adminId, message);
    }
}

/**
 * Log a notification event to prevent duplicate alerts.
 */
async function logNotification(accessKeyId: string, event: string, message: string) {
    await db.notificationLog.create({
        data: {
            event,
            message,
            status: 'SUCCESS',
            accessKeyId,
        },
    });
}

/**
 * Reset bandwidth alert flags for a key.
 * Called when a key's data limit is reset (periodic reset) or manually.
 */
export async function resetBandwidthAlerts(keyId: string) {
    await db.accessKey.update({
        where: { id: keyId },
        data: {
            bandwidthAlertAt80: false,
            bandwidthAlertAt90: false,
            quotaAlertsSent: '[]',
        },
    });
}

async function autoDisableDynamicKey(dynamicKeyId: string) {
    const dak = await db.dynamicAccessKey.findUnique({
        where: { id: dynamicKeyId },
        include: {
            accessKeys: {
                include: {
                    server: true,
                },
            },
        },
    });

    if (!dak) {
        return;
    }

    for (const key of dak.accessKeys) {
        if (!key.server) {
            continue;
        }

        const client = createOutlineClient(key.server.apiUrl, key.server.apiCertSha256);
        try {
            await client.deleteAccessKey(key.outlineKeyId);
        } catch {
            // Key might already be gone
        }

        await db.accessKey.update({
            where: { id: key.id },
            data: {
                status: 'DEPLETED',
                disabledAt: new Date(),
                disabledOutlineKeyId: key.outlineKeyId,
                estimatedDevices: 0,
            },
        });

        await db.connectionSession.updateMany({
            where: { accessKeyId: key.id, isActive: true },
            data: { isActive: false, endedAt: new Date(), endedReason: 'KEY_DEPLETED' },
        });
    }

    await db.dynamicAccessKey.update({
        where: { id: dynamicKeyId },
        data: {
            status: 'DEPLETED',
            sharePageEnabled: false,
        },
    });
}
