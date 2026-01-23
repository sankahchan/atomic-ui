/**
 * Analytics Router
 *
 * Provides analytics endpoints for usage tracking, anomaly detection,
 * time-to-quota forecasting, and historical traffic data.
 */

import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { db } from '@/lib/db';
import { TRPCError } from '@trpc/server';

// Time range options
const timeRangeSchema = z.enum(['24h', '7d', '30d']);

type TimeRange = z.infer<typeof timeRangeSchema>;

/**
 * Get date cutoff for a time range
 */
function getDateCutoff(range: TimeRange): Date {
  const now = new Date();
  switch (range) {
    case '24h':
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case '7d':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case '30d':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
}

/**
 * Calculate linear regression slope for forecasting
 */
function calculateSlope(data: { x: number; y: number }[]): number {
  if (data.length < 2) return 0;

  const n = data.length;
  const sumX = data.reduce((sum, p) => sum + p.x, 0);
  const sumY = data.reduce((sum, p) => sum + p.y, 0);
  const sumXY = data.reduce((sum, p) => sum + p.x * p.y, 0);
  const sumX2 = data.reduce((sum, p) => sum + p.x * p.x, 0);

  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) return 0;

  return (n * sumXY - sumX * sumY) / denominator;
}

export const analyticsRouter = router({
  /**
   * Get traffic statistics for a specific key (legacy endpoint).
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
      const chartData = logs.map(log => ({
        timestamp: log.recordedAt.toISOString(),
        usage: Number(log.deltaBytes),
        total: Number(log.bytesUsed),
      }));

      return {
        keyId,
        range,
        data: chartData,
      };
    }),

  /**
   * Get top consumers by usage delta over a time range
   */
  topConsumers: protectedProcedure
    .input(z.object({
      range: timeRangeSchema.default('24h'),
      limit: z.number().int().min(1).max(50).default(10),
      keyType: z.enum(['ACCESS_KEY', 'DYNAMIC_KEY', 'ALL']).default('ALL'),
    }))
    .query(async ({ input }) => {
      const cutoff = getDateCutoff(input.range);

      // Get aggregated deltas from snapshots
      const snapshots = await db.usageSnapshot.groupBy({
        by: ['keyId', 'keyType'],
        where: {
          createdAt: { gte: cutoff },
          keyId: { not: null },
          ...(input.keyType !== 'ALL' ? { keyType: input.keyType } : {}),
        },
        _sum: {
          deltaBytes: true,
        },
        orderBy: {
          _sum: {
            deltaBytes: 'desc',
          },
        },
        take: input.limit,
      });

      // Fetch key details
      const results = await Promise.all(
        snapshots.map(async (s) => {
          const deltaBytes = s._sum.deltaBytes || BigInt(0);

          if (s.keyType === 'ACCESS_KEY') {
            const key = await db.accessKey.findUnique({
              where: { id: s.keyId || '' },
              select: {
                id: true,
                name: true,
                email: true,
                status: true,
                usedBytes: true,
                dataLimitBytes: true,
                server: {
                  select: { name: true, countryCode: true },
                },
              },
            });

            if (!key) return null;

            return {
              id: key.id,
              name: key.name,
              email: key.email,
              type: 'ACCESS_KEY' as const,
              status: key.status,
              serverName: key.server.name,
              countryCode: key.server.countryCode,
              deltaBytes: deltaBytes.toString(),
              totalUsedBytes: key.usedBytes.toString(),
              dataLimitBytes: key.dataLimitBytes?.toString() || null,
            };
          } else {
            const dak = await db.dynamicAccessKey.findUnique({
              where: { id: s.keyId || '' },
              select: {
                id: true,
                name: true,
                email: true,
                status: true,
                usedBytes: true,
                dataLimitBytes: true,
              },
            });

            if (!dak) return null;

            return {
              id: dak.id,
              name: dak.name,
              email: dak.email,
              type: 'DYNAMIC_KEY' as const,
              status: dak.status,
              serverName: null,
              countryCode: null,
              deltaBytes: deltaBytes.toString(),
              totalUsedBytes: dak.usedBytes.toString(),
              dataLimitBytes: dak.dataLimitBytes?.toString() || null,
            };
          }
        })
      );

      return results.filter((r): r is NonNullable<typeof r> => r !== null);
    }),

  /**
   * Detect anomalies - keys with usage rate > 3x their baseline
   */
  anomalies: protectedProcedure
    .input(z.object({
      range: timeRangeSchema.default('24h'),
      threshold: z.number().default(3), // Multiplier threshold
    }))
    .query(async ({ input }) => {
      const cutoff = getDateCutoff(input.range);
      const baselineCutoff = new Date(cutoff.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days before range

      // Get recent usage per key
      const recentUsage = await db.usageSnapshot.groupBy({
        by: ['keyId', 'keyType'],
        where: {
          createdAt: { gte: cutoff },
          keyId: { not: null },
        },
        _sum: {
          deltaBytes: true,
        },
      });

      // Get baseline usage per key (7 days before the selected range)
      const baselineUsage = await db.usageSnapshot.groupBy({
        by: ['keyId', 'keyType'],
        where: {
          createdAt: {
            gte: baselineCutoff,
            lt: cutoff,
          },
          keyId: { not: null },
        },
        _sum: {
          deltaBytes: true,
        },
      });

      // Create baseline map
      const baselineMap = new Map<string, bigint>();
      for (const b of baselineUsage) {
        if (b.keyId) {
          baselineMap.set(b.keyId, b._sum.deltaBytes || BigInt(0));
        }
      }

      // Find anomalies
      const anomalies: {
        keyId: string;
        keyType: string;
        recentDelta: bigint;
        baselineDelta: bigint;
        ratio: number;
      }[] = [];

      for (const recent of recentUsage) {
        if (!recent.keyId) continue;

        const recentDelta = recent._sum.deltaBytes || BigInt(0);
        const baselineDelta = baselineMap.get(recent.keyId) || BigInt(0);

        // Skip if baseline is too low (< 1MB) to avoid false positives
        if (baselineDelta < BigInt(1024 * 1024)) continue;

        const ratio = Number(recentDelta) / Number(baselineDelta);

        if (ratio >= input.threshold) {
          anomalies.push({
            keyId: recent.keyId,
            keyType: recent.keyType || 'ACCESS_KEY',
            recentDelta,
            baselineDelta,
            ratio,
          });
        }
      }

      // Sort by ratio descending and limit
      anomalies.sort((a, b) => b.ratio - a.ratio);
      const topAnomalies = anomalies.slice(0, 20);

      // Fetch key details
      const results = await Promise.all(
        topAnomalies.map(async (a) => {
          if (a.keyType === 'ACCESS_KEY') {
            const key = await db.accessKey.findUnique({
              where: { id: a.keyId },
              select: {
                id: true,
                name: true,
                email: true,
                status: true,
                server: {
                  select: { name: true },
                },
              },
            });

            return {
              id: a.keyId,
              name: key?.name || 'Unknown',
              email: key?.email || null,
              type: 'ACCESS_KEY' as const,
              serverName: key?.server.name || null,
              status: key?.status || 'UNKNOWN',
              recentDeltaBytes: a.recentDelta.toString(),
              baselineDeltaBytes: a.baselineDelta.toString(),
              ratio: Math.round(a.ratio * 10) / 10,
            };
          } else {
            const dak = await db.dynamicAccessKey.findUnique({
              where: { id: a.keyId },
              select: {
                id: true,
                name: true,
                email: true,
                status: true,
              },
            });

            return {
              id: a.keyId,
              name: dak?.name || 'Unknown',
              email: dak?.email || null,
              type: 'DYNAMIC_KEY' as const,
              serverName: null,
              status: dak?.status || 'UNKNOWN',
              recentDeltaBytes: a.recentDelta.toString(),
              baselineDeltaBytes: a.baselineDelta.toString(),
              ratio: Math.round(a.ratio * 10) / 10,
            };
          }
        })
      );

      return results;
    }),

  /**
   * Forecast time-to-quota for a specific key
   */
  forecast: protectedProcedure
    .input(z.object({
      keyId: z.string(),
      keyType: z.enum(['ACCESS_KEY', 'DYNAMIC_KEY']).default('ACCESS_KEY'),
    }))
    .query(async ({ input }) => {
      // Get key details
      let currentUsage: bigint;
      let dataLimit: bigint | null;
      let keyName: string;

      if (input.keyType === 'ACCESS_KEY') {
        const key = await db.accessKey.findUnique({
          where: { id: input.keyId },
          select: {
            name: true,
            usedBytes: true,
            dataLimitBytes: true,
          },
        });

        if (!key) {
          return {
            keyId: input.keyId,
            keyType: input.keyType,
            hasQuota: false,
            daysToQuota: null,
            confidence: 'low' as const,
            message: 'Key not found',
          };
        }

        currentUsage = key.usedBytes;
        dataLimit = key.dataLimitBytes;
        keyName = key.name;
      } else {
        const dak = await db.dynamicAccessKey.findUnique({
          where: { id: input.keyId },
          select: {
            name: true,
            usedBytes: true,
            dataLimitBytes: true,
          },
        });

        if (!dak) {
          return {
            keyId: input.keyId,
            keyType: input.keyType,
            hasQuota: false,
            daysToQuota: null,
            confidence: 'low' as const,
            message: 'Key not found',
          };
        }

        currentUsage = dak.usedBytes;
        dataLimit = dak.dataLimitBytes;
        keyName = dak.name;
      }

      // No data limit = no forecast needed
      if (!dataLimit) {
        return {
          keyId: input.keyId,
          keyType: input.keyType,
          keyName,
          hasQuota: false,
          daysToQuota: null,
          confidence: 'high' as const,
          message: 'No data limit set',
        };
      }

      // Get snapshots from last 7 days for forecasting
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 7);

      const snapshots = await db.usageSnapshot.findMany({
        where: {
          keyId: input.keyId,
          createdAt: { gte: cutoff },
        },
        orderBy: { createdAt: 'asc' },
        select: {
          usedBytes: true,
          createdAt: true,
        },
      });

      if (snapshots.length < 2) {
        return {
          keyId: input.keyId,
          keyType: input.keyType,
          keyName,
          hasQuota: true,
          currentUsageBytes: currentUsage.toString(),
          dataLimitBytes: dataLimit.toString(),
          usagePercent: Math.round((Number(currentUsage) / Number(dataLimit)) * 100),
          daysToQuota: null,
          confidence: 'low' as const,
          message: 'Not enough data for forecast (need at least 2 snapshots)',
        };
      }

      // Convert to data points for regression
      const baseTime = snapshots[0].createdAt.getTime();
      const dataPoints = snapshots.map(s => ({
        x: (s.createdAt.getTime() - baseTime) / (24 * 60 * 60 * 1000), // Days since first snapshot
        y: Number(s.usedBytes),
      }));

      // Calculate daily usage rate (bytes per day)
      const slope = calculateSlope(dataPoints);

      if (slope <= 0) {
        return {
          keyId: input.keyId,
          keyType: input.keyType,
          keyName,
          hasQuota: true,
          currentUsageBytes: currentUsage.toString(),
          dataLimitBytes: dataLimit.toString(),
          usagePercent: Math.round((Number(currentUsage) / Number(dataLimit)) * 100),
          daysToQuota: null,
          dailyRateBytes: '0',
          confidence: 'medium' as const,
          message: 'Usage is stable or decreasing',
        };
      }

      // Calculate days until quota is reached
      const remaining = Number(dataLimit) - Number(currentUsage);
      const daysToQuota = Math.ceil(remaining / slope);

      // Determine confidence based on data quality
      let confidence: 'low' | 'medium' | 'high' = 'low';
      if (snapshots.length >= 10) {
        confidence = 'high';
      } else if (snapshots.length >= 5) {
        confidence = 'medium';
      }

      return {
        keyId: input.keyId,
        keyType: input.keyType,
        keyName,
        hasQuota: true,
        currentUsageBytes: currentUsage.toString(),
        dataLimitBytes: dataLimit.toString(),
        usagePercent: Math.round((Number(currentUsage) / Number(dataLimit)) * 100),
        daysToQuota: daysToQuota > 0 ? daysToQuota : 0,
        dailyRateBytes: Math.round(slope).toString(),
        confidence,
        message: daysToQuota > 0
          ? `Projected to reach quota in ~${daysToQuota} days`
          : 'Quota already reached or exceeded',
      };
    }),

  /**
   * Get usage history for a key (for charts)
   */
  usageHistory: protectedProcedure
    .input(z.object({
      keyId: z.string(),
      range: timeRangeSchema.default('7d'),
    }))
    .query(async ({ input }) => {
      const cutoff = getDateCutoff(input.range);

      const snapshots = await db.usageSnapshot.findMany({
        where: {
          keyId: input.keyId,
          createdAt: { gte: cutoff },
        },
        orderBy: { createdAt: 'asc' },
        select: {
          usedBytes: true,
          deltaBytes: true,
          createdAt: true,
        },
      });

      return snapshots.map(s => ({
        usedBytes: s.usedBytes.toString(),
        deltaBytes: s.deltaBytes.toString(),
        timestamp: s.createdAt.toISOString(),
      }));
    }),

  /**
   * Get overall analytics summary
   */
  summary: protectedProcedure
    .input(z.object({
      range: timeRangeSchema.default('24h'),
    }))
    .query(async ({ input }) => {
      const cutoff = getDateCutoff(input.range);

      // Total usage in range
      const totalUsage = await db.usageSnapshot.aggregate({
        where: {
          createdAt: { gte: cutoff },
        },
        _sum: {
          deltaBytes: true,
        },
      });

      // Count of active keys with usage
      const activeKeys = await db.usageSnapshot.groupBy({
        by: ['keyId'],
        where: {
          createdAt: { gte: cutoff },
          deltaBytes: { gt: 0 },
          keyId: { not: null },
        },
      });

      // Get anomaly count
      const baselineCutoff = new Date(cutoff.getTime() - 7 * 24 * 60 * 60 * 1000);

      const recentUsageMap = new Map<string, bigint>();
      const recentSnapshots = await db.usageSnapshot.groupBy({
        by: ['keyId'],
        where: {
          createdAt: { gte: cutoff },
          keyId: { not: null },
        },
        _sum: {
          deltaBytes: true,
        },
      });

      for (const s of recentSnapshots) {
        if (s.keyId) {
          recentUsageMap.set(s.keyId, s._sum.deltaBytes || BigInt(0));
        }
      }

      const baselineSnapshots = await db.usageSnapshot.groupBy({
        by: ['keyId'],
        where: {
          createdAt: {
            gte: baselineCutoff,
            lt: cutoff,
          },
          keyId: { not: null },
        },
        _sum: {
          deltaBytes: true,
        },
      });

      let anomalyCount = 0;
      for (const b of baselineSnapshots) {
        if (!b.keyId) continue;
        const baseline = b._sum.deltaBytes || BigInt(0);
        if (baseline < BigInt(1024 * 1024)) continue;

        const recent = recentUsageMap.get(b.keyId) || BigInt(0);
        const ratio = Number(recent) / Number(baseline);
        if (ratio >= 3) {
          anomalyCount++;
        }
      }

      // Snapshot count (for data health indication)
      const snapshotCount = await db.usageSnapshot.count({
        where: {
          createdAt: { gte: cutoff },
        },
      });

      return {
        totalDeltaBytes: (totalUsage._sum.deltaBytes || BigInt(0)).toString(),
        activeKeysCount: activeKeys.length,
        anomalyCount,
        snapshotCount,
        range: input.range,
      };
    }),
});
