
/**
 * Analytics Router
 * 
 * Exposes endpoints for fetching historical traffic data.
 */

import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { db } from '@/lib/db';
import { TRPCError } from '@trpc/server';

export const analyticsRouter = router({
    /**
     * Get traffic statistics for a specific key.
     * 
     * Returns aggregated data points for charting.
     */
    getStats: protectedProcedure
        .input(z.object({
            keyId: z.string(),
            range: z.enum(['24h', '7d', '30d']),
        }))
        .query(async ({ ctx, input }) => {
            const { keyId, range } = input;

            // 1. Verify access
            const key = await db.accessKey.findUnique({
                where: { id: keyId },
            });

            if (!key) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Access key not found',
                });
            }

            // RBAC Check
            if (ctx.user.role !== 'ADMIN' && key.userId !== ctx.user.id) {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message: 'You do not have permission to view stats for this key',
                });
            }

            // 2. Calculate date range
            const endDate = new Date();
            const startDate = new Date();

            if (range === '24h') {
                startDate.setHours(endDate.getHours() - 24);
            } else if (range === '7d') {
                startDate.setDate(endDate.getDate() - 7);
            } else if (range === '30d') {
                startDate.setDate(endDate.getDate() - 30);
            }

            // 3. Fetch logs
            const logs = await db.trafficLog.findMany({
                where: {
                    accessKeyId: keyId,
                    recordedAt: {
                        gte: startDate,
                        lte: endDate,
                    },
                },
                orderBy: { recordedAt: 'asc' },
                select: {
                    recordedAt: true,
                    deltaBytes: true,
                    bytesUsed: true,
                },
            });

            // 4. Transform data for chart
            // For 24h: Hourly points
            // For 7d/30d: Daily aggregation might be better, but let's stick to raw hourly points for now if volume is manageable
            // or aggregate if logs > 100.

            const chartData = logs.map(log => ({
                timestamp: log.recordedAt.toISOString(),
                usage: Number(log.deltaBytes), // Delta is usage in that window
                total: Number(log.bytesUsed),
            }));

            return {
                keyId,
                range,
                data: chartData,
            };
        }),
});
