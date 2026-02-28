/**
 * Bandwidth Alerts Service
 *
 * Monitors access key data usage and sends Telegram alerts at 80% and 90%.
 * Auto-disables keys when they reach 100% of their data limit.
 *
 * Runs every 5 minutes via the scheduler alongside expiration checks.
 */

import { db } from '@/lib/db';
import { createOutlineClient } from '@/lib/outline-api';
import { getTelegramConfig } from '@/lib/services/telegram-bot';
import { sendTelegramMessage } from '@/lib/telegram';
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
                autoDisableOnLimit: true,
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

            try {
                // --- 100% Check: Auto-disable ---
                if (usagePercent >= 100 && key.autoDisableOnLimit) {
                    await autoDisableKey(key);
                    result.autoDisabled++;

                    // Notify about auto-disable
                    if (telegramConfig) {
                        await sendBandwidthNotification(
                            telegramConfig.botToken,
                            key,
                            usagePercent,
                            'DISABLED',
                            telegramConfig.adminChatIds
                        );
                    }
                    continue; // Skip lower threshold checks
                }

                // --- 90% Check ---
                if (usagePercent >= 90 && !key.bandwidthAlertAt90) {
                    await db.accessKey.update({
                        where: { id: key.id },
                        data: { bandwidthAlertAt90: true },
                    });

                    if (telegramConfig) {
                        await sendBandwidthNotification(
                            telegramConfig.botToken,
                            key,
                            usagePercent,
                            '90',
                            telegramConfig.adminChatIds
                        );
                    }

                    await logNotification(key.id, 'BANDWIDTH_90', `Key "${key.name}" reached ${usagePercent.toFixed(1)}% of data limit`);
                    result.alertsSent90++;
                    continue; // Don't also send 80% if we just sent 90%
                }

                // --- 80% Check ---
                if (usagePercent >= 80 && !key.bandwidthAlertAt80) {
                    await db.accessKey.update({
                        where: { id: key.id },
                        data: { bandwidthAlertAt80: true },
                    });

                    if (telegramConfig) {
                        await sendBandwidthNotification(
                            telegramConfig.botToken,
                            key,
                            usagePercent,
                            '80',
                            telegramConfig.adminChatIds
                        );
                    }

                    await logNotification(key.id, 'BANDWIDTH_80', `Key "${key.name}" reached ${usagePercent.toFixed(1)}% of data limit`);
                    result.alertsSent80++;
                }
            } catch (keyError) {
                result.errors.push(`Key ${key.name}: ${(keyError as Error).message}`);
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
        server: { name: string };
    },
    usagePercent: number,
    level: '80' | '90' | 'DISABLED',
    adminChatIds: string[]
) {
    const used = formatBytes(key.usedBytes);
    const limit = key.dataLimitBytes ? formatBytes(key.dataLimitBytes) : 'N/A';
    const remaining = key.dataLimitBytes
        ? formatBytes(BigInt(Math.max(0, Number(key.dataLimitBytes) - Number(key.usedBytes))))
        : 'N/A';

    let emoji: string;
    let title: string;
    let statusLine: string;

    switch (level) {
        case '80':
            emoji = '⚠️';
            title = 'Data Usage Warning (80%)';
            statusLine = `📊 Usage: <b>${usagePercent.toFixed(1)}%</b>`;
            break;
        case '90':
            emoji = '🔴';
            title = 'Data Usage Critical (90%)';
            statusLine = `📊 Usage: <b>${usagePercent.toFixed(1)}%</b>`;
            break;
        case 'DISABLED':
            emoji = '🚫';
            title = 'Key Auto-Disabled (100%)';
            statusLine = '📊 Data limit reached — key has been disabled';
            break;
    }

    const message = [
        `${emoji} <b>${title}</b>`,
        '',
        `🔑 Key: <b>${key.name}</b>`,
        `🖥 Server: ${key.server.name}`,
        '',
        statusLine,
        `📈 Used: ${used} / ${limit}`,
        level !== 'DISABLED' ? `📉 Remaining: ${remaining}` : '',
        '',
        level === 'DISABLED'
            ? '⚡ This key has been automatically disabled. Contact admin to re-enable.'
            : level === '90'
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
        },
    });
}
