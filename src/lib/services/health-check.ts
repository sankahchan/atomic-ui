/**
 * Health Check Service
 * 
 * Monitors the health and availability of Outline VPN servers.
 * Pings servers periodically and updates their status in the database.
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { createOutlineClient } from '@/lib/outline-api';
import { writeAuditLog } from '@/lib/audit';
import { sendAdminAlert } from '@/lib/services/telegram-bot';
import { sendServerIssueNoticeToTelegram } from '@/lib/services/telegram-runtime';
import {
  markServerOutageDetected,
  markServerOutageRecovered,
} from '@/lib/services/server-outage';

export interface HealthCheckResult {
    serverId: string;
    serverName: string;
    status: 'UP' | 'DOWN' | 'SLOW' | 'UNKNOWN';
    latencyMs: number | null;
    error?: string;
}

/**
 * Check the health of a single server
 */
export async function checkServerHealth(server: {
    id: string;
    name: string;
    apiUrl: string;
    apiCertSha256: string;
    healthCheck: { latencyThresholdMs: number } | null;
}): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
        const client = createOutlineClient(server.apiUrl, server.apiCertSha256);
        await client.getServerInfo();

        const latencyMs = Date.now() - startTime;
        const threshold = server.healthCheck?.latencyThresholdMs ?? 500;

        return {
            serverId: server.id,
            serverName: server.name,
            status: latencyMs > threshold ? 'SLOW' : 'UP',
            latencyMs,
        };
    } catch (error) {
        return {
            serverId: server.id,
            serverName: server.name,
            status: 'DOWN',
            latencyMs: null,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

async function listAffectedTelegramChatIdsForServer(serverId: string) {
    const [accessKeys, dynamicKeys] = await Promise.all([
        db.accessKey.findMany({
            where: {
                serverId,
                status: { in: ['ACTIVE', 'PENDING', 'DISABLED'] },
            },
            select: {
                telegramId: true,
                user: {
                    select: {
                        telegramChatId: true,
                    },
                },
            },
        }),
        db.dynamicAccessKey.findMany({
            where: {
                status: 'ACTIVE',
                accessKeys: {
                    some: {
                        serverId,
                    },
                },
            },
            select: {
                telegramId: true,
                user: {
                    select: {
                        telegramChatId: true,
                    },
                },
            },
        }),
    ]);

    return Array.from(
        new Set(
            [...accessKeys, ...dynamicKeys]
                .flatMap((record) => [record.telegramId, record.user?.telegramChatId])
                .filter((value): value is string => Boolean(value && value.trim())),
        ),
    );
}

async function maybeAutoDrainSlowServer(input: {
    server: {
        id: string;
        name: string;
        lifecycleMode: string | null;
        healthCheck: {
            slowAutoDrainEnabled: boolean;
            slowAutoDrainThreshold: number;
        } | null;
    };
    consecutiveSlowCount: number;
    latencyMs: number;
    thresholdMs: number;
}) {
    if (!input.server.healthCheck?.slowAutoDrainEnabled) {
        return false;
    }

    if (input.consecutiveSlowCount < input.server.healthCheck.slowAutoDrainThreshold) {
        return false;
    }

    if ((input.server.lifecycleMode || 'ACTIVE') !== 'ACTIVE') {
        return false;
    }

    await db.server.update({
        where: { id: input.server.id },
        data: {
            lifecycleMode: 'DRAINING',
            lifecycleNote: `Auto-drained after ${input.consecutiveSlowCount} consecutive slow health checks (${input.latencyMs}ms > ${input.thresholdMs}ms).`,
            lifecycleChangedAt: new Date(),
        },
    });

    await writeAuditLog({
        action: 'SERVER_AUTO_DRAIN_SLOW',
        entity: 'SERVER',
        entityId: input.server.id,
        details: {
            serverName: input.server.name,
            consecutiveSlowCount: input.consecutiveSlowCount,
            latencyMs: input.latencyMs,
            thresholdMs: input.thresholdMs,
        },
    });

    await sendAdminAlert(
        `🟡 <b>Server auto-drained</b>\n\n<b>${input.server.name}</b> was moved to <b>DRAINING</b> after ${input.consecutiveSlowCount} consecutive slow checks.\nLatency: <b>${input.latencyMs}ms</b> (threshold <b>${input.thresholdMs}ms</b>)`,
    );

    return true;
}

async function maybeNotifyUsersAboutSlowServer(input: {
    server: {
        id: string;
        name: string;
        healthCheck: {
            slowUserNotifyEnabled: boolean;
            slowUserNotifyThreshold: number;
            slowUserNotifyCooldownMins: number;
            slowUserAlertSentAt: Date | null;
        } | null;
    };
    consecutiveSlowCount: number;
    latencyMs: number;
    thresholdMs: number;
}) {
    if (!input.server.healthCheck?.slowUserNotifyEnabled) {
        return false;
    }

    if (input.consecutiveSlowCount < input.server.healthCheck.slowUserNotifyThreshold) {
        return false;
    }

    const cooldownMs = Math.max(15, input.server.healthCheck.slowUserNotifyCooldownMins) * 60_000;
    const lastSentAt = input.server.healthCheck.slowUserAlertSentAt;
    if (lastSentAt && Date.now() - lastSentAt.getTime() < cooldownMs) {
        return false;
    }

    const chatIds = await listAffectedTelegramChatIdsForServer(input.server.id);
    if (chatIds.length === 0) {
        return false;
    }

    const result = await sendServerIssueNoticeToTelegram({
        chatIds,
        serverName: input.server.name,
        noticeType: 'ISSUE',
        message: `We detected sustained high latency on this server (${input.latencyMs}ms). Please wait about 2 to 3 hours while we stabilize the route or prepare a replacement if needed.`,
    });

    if (result.sentCount > 0) {
        await db.healthCheck.update({
            where: { serverId: input.server.id },
            data: {
                slowUserAlertSentAt: new Date(),
            },
        });

        await writeAuditLog({
            action: 'SERVER_SLOW_USER_NOTICE_SENT',
            entity: 'SERVER',
            entityId: input.server.id,
            details: {
                serverName: input.server.name,
                consecutiveSlowCount: input.consecutiveSlowCount,
                latencyMs: input.latencyMs,
                thresholdMs: input.thresholdMs,
                sentToTelegramUsers: result.sentCount,
            },
        });
    }

    return result.sentCount > 0;
}

/**
 * Run health checks on all enabled servers
 */
export async function runHealthChecks(): Promise<{
    checked: number;
    up: number;
    down: number;
    slow: number;
    results: HealthCheckResult[];
}> {
    // Get all servers with health checks enabled
    const servers = await db.server.findMany({
        where: {
            isActive: true,
            healthCheck: {
                isEnabled: true,
            },
        },
        include: {
            healthCheck: true,
        },
    });

    const results: HealthCheckResult[] = [];
    let up = 0, down = 0, slow = 0;

    for (const server of servers) {
        const result = await checkServerHealth({
            id: server.id,
            name: server.name,
            apiUrl: server.apiUrl,
            apiCertSha256: server.apiCertSha256,
            healthCheck: server.healthCheck,
        });

        results.push(result);

        // Update counters
        if (result.status === 'UP') up++;
        else if (result.status === 'DOWN') down++;
        else if (result.status === 'SLOW') slow++;

        await db.serverMetric.create({
            data: {
                serverId: server.id,
                healthStatus: result.status,
                latencyMs: result.latencyMs,
            },
        });

        // Update the health check record
        if (server.healthCheck) {
            const wasDown = server.healthCheck.lastStatus === 'DOWN';
            const wasSlow = server.healthCheck.lastStatus === 'SLOW';
            const isNowDown = result.status === 'DOWN';
            const thresholdMs = server.healthCheck.latencyThresholdMs ?? 500;
            const consecutiveSlowCount = result.status === 'SLOW'
                ? (server.healthCheck.slowConsecutiveCount ?? 0) + 1
                : 0;

            await db.healthCheck.update({
                where: { id: server.healthCheck.id },
                data: {
                    lastStatus: result.status,
                    lastLatencyMs: result.latencyMs,
                    lastCheckedAt: new Date(),
                    slowConsecutiveCount: consecutiveSlowCount,
                    totalChecks: { increment: 1 },
                    successfulChecks: result.status !== 'DOWN' ? { increment: 1 } : undefined,
                    failedChecks: result.status === 'DOWN' ? { increment: 1 } : undefined,
                    uptimePercent: await calculateUptimePercent(server.healthCheck.id),
                },
            });

            if (wasDown !== isNowDown) {
                const statusEmoji = isNowDown ? '🔴' : '🟢';
                const statusText = isNowDown ? 'DOWN' : 'UP';
                const statusMsg = `${statusEmoji} <b>Server Alert:</b> ${server.name} is now <b>${statusText}</b>`;

                logger.info(`Server alert state changed: ${server.name} is now ${statusText}`);
                await sendAdminAlert(statusMsg);
            }

            if (!wasSlow && result.status === 'SLOW') {
                await sendAdminAlert(
                    `🟡 <b>Server slow</b>\n\n<b>${server.name}</b> is responding with high latency.\nLatency: <b>${result.latencyMs ?? '-'}ms</b> (threshold <b>${thresholdMs}ms</b>)`,
                );
            }

            if (isNowDown) {
                await markServerOutageDetected({
                    serverId: server.id,
                    cause: 'HEALTH_DOWN',
                });
            } else if (wasDown) {
                await markServerOutageRecovered(server.id);
            }

            if (result.status === 'SLOW' && typeof result.latencyMs === 'number') {
                await maybeAutoDrainSlowServer({
                    server,
                    consecutiveSlowCount,
                    latencyMs: result.latencyMs,
                    thresholdMs,
                });

                await maybeNotifyUsersAboutSlowServer({
                    server,
                    consecutiveSlowCount,
                    latencyMs: result.latencyMs,
                    thresholdMs,
                });
            }
        }
    }

    return {
        checked: servers.length,
        up,
        down,
        slow,
        results,
    };
}

/**
 * Calculate uptime percentage for a health check
 */
async function calculateUptimePercent(healthCheckId: string): Promise<number> {
    const healthCheck = await db.healthCheck.findUnique({
        where: { id: healthCheckId },
        select: { totalChecks: true, successfulChecks: true },
    });

    if (!healthCheck || healthCheck.totalChecks === 0) {
        return 100;
    }

    return Math.round((healthCheck.successfulChecks / healthCheck.totalChecks) * 10000) / 100;
}

/**
 * Ensure health check records exist for all servers
 */
export async function ensureHealthChecks(): Promise<number> {
    const serversWithoutHealthCheck = await db.server.findMany({
        where: {
            healthCheck: null,
        },
    });

    for (const server of serversWithoutHealthCheck) {
        await db.healthCheck.create({
            data: {
                serverId: server.id,
                isEnabled: true,
                checkIntervalMins: 5,
                notifyCooldownMins: 30,
                latencyThresholdMs: 500,
            },
        });
    }

    return serversWithoutHealthCheck.length;
}
