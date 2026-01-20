/**
 * Health Check Service
 * 
 * Monitors the health and availability of Outline VPN servers.
 * Pings servers periodically and updates their status in the database.
 */

import { db } from '@/lib/db';
import { createOutlineClient } from '@/lib/outline-api';
import { sendAdminAlert } from '@/lib/services/telegram-bot';

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

        // Update the health check record
        if (server.healthCheck) {
            const wasDown = server.healthCheck.lastStatus === 'DOWN';
            const isNowDown = result.status === 'DOWN';

            await db.healthCheck.update({
                where: { id: server.healthCheck.id },
                data: {
                    lastStatus: result.status,
                    lastLatencyMs: result.latencyMs,
                    lastCheckedAt: new Date(),
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

                console.log(`🔔 ${statusMsg.replace(/<[^>]*>/g, '')}`);
                await sendAdminAlert(statusMsg);
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
