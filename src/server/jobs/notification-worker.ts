import { db } from '@/lib/db';
import { sendTelegramMessage } from '@/lib/telegram';

const WARNING_THRESHOLD_PERCENT = 80;
const EXPIRY_WARNING_DAYS = 3;

export async function checkSubscriptions() {
    try {
        const settings = await db.settings.findUnique({
            where: { key: 'telegram_bot' },
        });

        if (!settings) return;

        const botSettings = JSON.parse(settings.value);
        const { botToken, isEnabled } = botSettings;

        if (!isEnabled || !botToken) return;

        // 1. Check Data Usage (80% Alert)
        // Find active keys that have a limit, are not depleted, and have exceeded threshold
        // We also need to avoid spamming, so we check if we already sent a specific log? 
        // For MVP, we'll just check if they are "close" and maybe rely on a "lastAlertSentAt" field if we had one.
        // Since we don't have that field on AccessKey, we will skip this complexity for now 
        // OR we can implement it by checking if usage is between 80% and 81%? No, that's flaky.
        // Let's implement a simple "daily" check by adding a NotificationLog entry.

        // Actually, let's look at NotificationLog.

        const activeKeys = await db.accessKey.findMany({
            where: {
                status: 'ACTIVE',
                dataLimitBytes: { not: null },
                telegramId: { not: null }, // Only alert users who linked Telegram
            },
            include: {
                server: true,
            },
        });

        for (const key of activeKeys) {
            if (!key.dataLimitBytes || !key.telegramId) continue;

            const used = Number(key.usedBytes);
            const limit = Number(key.dataLimitBytes);
            const percentage = (used / limit) * 100;

            if (percentage >= WARNING_THRESHOLD_PERCENT && percentage < 100) {
                // Check if we already sent a "DATA_USAGE" alert for this key in the last 24h
                const lastLog = await db.notificationLog.findFirst({
                    where: {
                        accessKeyId: key.id,
                        event: 'DATA_USAGE',
                        sentAt: {
                            gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24h
                        },
                    },
                });

                if (!lastLog) {
                    // Send Alert
                    const msg = `⚠️ <b>Data Usage Alert</b>\n\nYour key <b>${key.name}</b> has used <b>${percentage.toFixed(1)}%</b> of its data limit.\n\nUsage: ${(used / 1e9).toFixed(2)} GB / ${(limit / 1e9).toFixed(2)} GB`;
                    await sendTelegramMessage(botToken, key.telegramId, msg);

                    // Log it
                    await db.notificationLog.create({
                        data: {
                            event: 'DATA_USAGE',
                            message: `Sent usage alert to ${key.telegramId} (${percentage.toFixed(1)}%)`,
                            accessKeyId: key.id,
                        },
                    });
                }
            }
        }

        // 2. Check Expiry (3 Days Alert)
        const expiringSoon = await db.accessKey.findMany({
            where: {
                status: 'ACTIVE',
                telegramId: { not: null },
                expiresAt: {
                    lte: new Date(Date.now() + EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000), // < 3 days from now
                    gte: new Date(), // Not already expired
                },
            },
            include: {
                server: true,
            },
        });

        for (const key of expiringSoon) {
            if (!key.telegramId || !key.expiresAt) continue;

            // Check if we already sent "EXPIRING_SOON" log
            const lastLog = await db.notificationLog.findFirst({
                where: {
                    accessKeyId: key.id,
                    event: 'EXPIRING_SOON',
                    sentAt: {
                        gte: new Date(Date.now() - 48 * 60 * 60 * 1000), // Don't spam more than once every 2 days
                    },
                },
            });

            if (!lastLog) {
                const daysLeft = Math.ceil((key.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                const msg = `⏳ <b>Expiry Warning</b>\n\nYour VPN key <b>${key.name}</b> will expire in <b>${daysLeft} days</b> (${key.expiresAt.toLocaleDateString()}).\n\nPlease contact admin to renew.`;

                await sendTelegramMessage(botToken, key.telegramId, msg);

                await db.notificationLog.create({
                    data: {
                        event: 'EXPIRING_SOON',
                        message: `Sent expiry alert to ${key.telegramId} (${daysLeft} days left)`,
                        accessKeyId: key.id,
                    },
                });
            }
        }

    } catch (error) {
        console.error('Error in checkSubscriptions job:', error);
    }
}
