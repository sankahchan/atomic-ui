
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { db } from '@/lib/db';
import { TRPCError } from '@trpc/server';

export const dashboardRouter = router({
    /**
     * Get traffic history for charts (last 30 days by default).
     */
    trafficHistory: protectedProcedure
        .input(
            z.object({
                days: z.number().int().min(1).max(365).default(30),
                serverId: z.string().optional(),
            }).optional()
        )
        .query(async ({ input }) => {
            const days = input?.days ?? 30;
            const serverId = input?.serverId;

            // Get traffic logs from the last N days
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);

            const where: Record<string, unknown> = {
                recordedAt: { gte: startDate },
            };

            if (serverId) {
                where.accessKey = { serverId };
            }

            const trafficLogs = await db.trafficLog.findMany({
                where,
                select: {
                    bytesUsed: true,
                    recordedAt: true,
                },
                orderBy: { recordedAt: 'asc' },
            });

            // Group by date
            const dailyTraffic: Record<string, bigint> = {};

            for (const log of trafficLogs) {
                const dateKey = log.recordedAt.toISOString().split('T')[0];
                dailyTraffic[dateKey] = (dailyTraffic[dateKey] || BigInt(0)) + log.bytesUsed;
            }

            // Fill in missing days with 0
            const result: Array<{ date: string; bytes: number; label: string }> = [];
            const current = new Date(startDate);
            const today = new Date();

            while (current <= today) {
                const dateKey = current.toISOString().split('T')[0];
                const bytes = dailyTraffic[dateKey] || BigInt(0);
                result.push({
                    date: dateKey,
                    bytes: Number(bytes),
                    label: current.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                });
                current.setDate(current.getDate() + 1);
            }

            return result;
        }),

    /**
     * Get overview statistics for the dashboard.
     */
    stats: protectedProcedure.query(async () => {
        // Get server counts
        const [totalServers, activeServers] = await Promise.all([
            db.server.count(),
            db.server.count({ where: { isActive: true } }),
        ]);

        // Get key counts by status
        const keyCounts = await db.accessKey.groupBy({
            by: ['status'],
            _count: { status: true },
        });

        const keyStats = {
            total: 0,
            active: 0,
            expired: 0,
            depleted: 0,
            pending: 0,
            disabled: 0,
        };

        for (const item of keyCounts) {
            keyStats.total += item._count.status;
            switch (item.status) {
                case 'ACTIVE':
                    keyStats.active = item._count.status;
                    break;
                case 'EXPIRED':
                    keyStats.expired = item._count.status;
                    break;
                case 'DEPLETED':
                    keyStats.depleted = item._count.status;
                    break;
                case 'PENDING':
                    keyStats.pending = item._count.status;
                    break;
                case 'DISABLED':
                    keyStats.disabled = item._count.status;
                    break;
            }
        }

        // Get health check status
        const healthCounts = await db.healthCheck.groupBy({
            by: ['lastStatus'],
            _count: { lastStatus: true },
        });

        let downServers = 0;
        for (const item of healthCounts) {
            if (item.lastStatus === 'DOWN') {
                downServers = item._count.lastStatus;
            }
        }

        // Get keys expiring in 24 hours
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const expiringIn24h = await db.accessKey.count({
            where: {
                status: 'ACTIVE',
                expiresAt: {
                    lte: tomorrow,
                    gte: new Date(),
                },
            },
        });

        // Calculate total traffic (sum of usedBytes)
        const trafficResult = await db.accessKey.aggregate({
            _sum: { usedBytes: true },
        });

        return {
            totalServers,
            activeServers,
            downServers,
            totalKeys: keyStats.total,
            activeKeys: keyStats.active,
            expiredKeys: keyStats.expired,
            depletedKeys: keyStats.depleted,
            pendingKeys: keyStats.pending,
            expiringIn24h,
            totalTrafficBytes: trafficResult._sum.usedBytes ?? BigInt(0),
        };
    }),

    /**
     * Get server status list for dashboard cards.
     */
    serverStatus: protectedProcedure.query(async () => {
        const servers = await db.server.findMany({
            where: { isActive: true },
            include: {
                healthCheck: true,
                _count: {
                    select: { accessKeys: true },
                },
            },
            orderBy: { name: 'asc' },
        });

        return servers.map((server) => ({
            id: server.id,
            name: server.name,
            countryCode: server.countryCode,
            status: server.healthCheck?.lastStatus ?? 'UNKNOWN',
            latencyMs: server.healthCheck?.lastLatencyMs,
            keyCount: server._count.accessKeys,
            uptimePercent: server.healthCheck?.uptimePercent ?? 100,
        }));
    }),

    /**
     * Get recent activity for the dashboard.
     */
    recentActivity: protectedProcedure.query(async () => {
        // Get recently created keys
        const recentKeys = await db.accessKey.findMany({
            take: 10,
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                name: true,
                createdAt: true,
                server: {
                    select: {
                        name: true,
                    },
                },
            },
        });

        // Get recent health check alerts
        const recentAlerts = await db.notificationLog.findMany({
            take: 10,
            orderBy: { sentAt: 'desc' },
            select: {
                id: true,
                event: true,
                message: true,
                sentAt: true,
            },
        });

        return {
            recentKeys: recentKeys.map((key) => ({
                id: key.id,
                name: key.name,
                serverName: key.server.name,
                createdAt: key.createdAt,
            })),
            recentAlerts,
        };
    }),

    /**
     * Get top users by bandwidth usage.
     */
    topUsers: protectedProcedure
        .input(z.object({
            limit: z.number().int().min(1).max(100).default(5),
        }).optional())
        .query(async ({ input }) => {
            const limit = input?.limit ?? 5;

            const topKeys = await db.accessKey.findMany({
                take: limit,
                orderBy: { usedBytes: 'desc' },
                select: {
                    id: true,
                    name: true,
                    usedBytes: true,
                    server: {
                        select: {
                            name: true,
                            countryCode: true,
                        }
                    }
                }
            });

            return topKeys.map(key => ({
                id: key.id,
                name: key.name,
                serverName: key.server.name,
                countryCode: key.server.countryCode,
                usedBytes: key.usedBytes,
            }));
        }),

    /**
     * Get peak usage hours (heatmap data).
     */
    peakHours: protectedProcedure
        .input(z.object({
            days: z.number().int().default(30)
        }).optional())
        .query(async ({ input }) => {
            const days = input?.days ?? 30;
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);

            const logs = await db.trafficLog.findMany({
                where: {
                    recordedAt: { gte: startDate },
                    deltaBytes: { gt: 0 }
                },
                select: {
                    recordedAt: true,
                    deltaBytes: true
                }
            });

            // Initialize grid: 7 days x 24 hours
            // day 0 = Sunday
            const heatmap: Record<number, Record<number, bigint>> = {};
            for (let d = 0; d < 7; d++) {
                heatmap[d] = {};
                for (let h = 0; h < 24; h++) {
                    heatmap[d][h] = BigInt(0);
                }
            }

            for (const log of logs) {
                const date = new Date(log.recordedAt);
                const day = date.getDay();
                const hour = date.getHours();
                heatmap[day][hour] += log.deltaBytes;
            }

            // Flatten for frontend
            const result = [];
            for (let d = 0; d < 7; d++) {
                for (let h = 0; h < 24; h++) {
                    result.push({
                        day: d,
                        hour: h,
                        bytes: Number(heatmap[d][h]),
                    });
                }
            }

            return result;
        }),
});
