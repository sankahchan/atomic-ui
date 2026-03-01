/**
 * Report Generator Service
 *
 * Generates aggregated usage data for reports.
 * Collects traffic data from TrafficLog and UsageSnapshot tables,
 * then aggregates per-server and per-key usage for the given period.
 */

import { db } from '@/lib/db';

interface ServerReport {
  serverId: string;
  serverName: string;
  location: string | null;
  countryCode: string | null;
  totalKeys: number;
  activeKeys: number;
  totalUsedBytes: string;
  deltaBytes: string;
  keys: KeyReport[];
}

interface KeyReport {
  keyId: string;
  keyName: string;
  email: string | null;
  telegramId: string | null;
  status: string;
  usedBytes: string;
  dataLimitBytes: string | null;
  usagePercent: number | null;
  createdAt: string;
  expiresAt: string | null;
}

export interface ReportData {
  reportData: {
    generatedAt: string;
    periodStart: string;
    periodEnd: string;
    servers: ServerReport[];
    topConsumers: Array<{
      keyName: string;
      serverName: string;
      usedBytes: string;
    }>;
    summary: {
      totalServers: number;
      totalKeys: number;
      activeKeys: number;
      expiredKeys: number;
      depletedKeys: number;
      totalBytesUsed: string;
      totalDeltaBytes: string;
      averageBytesPerKey: string;
    };
  };
  totalServers: number;
  totalKeys: number;
  totalBytesUsed: bigint;
  totalDeltaBytes: bigint;
}

/**
 * Generate report data for the given period.
 *
 * Aggregates:
 * - Per-server traffic totals
 * - Per-key usage during the period
 * - Top consumers ranking
 * - Summary statistics
 */
export async function generateReportData(
  periodStart: Date,
  periodEnd: Date
): Promise<ReportData> {
  // Get all servers with their keys
  const servers = await db.server.findMany({
    where: { isActive: true },
    include: {
      accessKeys: {
        select: {
          id: true,
          name: true,
          email: true,
          telegramId: true,
          status: true,
          usedBytes: true,
          dataLimitBytes: true,
          createdAt: true,
          expiresAt: true,
          outlineKeyId: true,
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  // Get traffic logs during this period for delta calculation
  const trafficLogs = await db.trafficLog.findMany({
    where: {
      recordedAt: {
        gte: periodStart,
        lte: periodEnd,
      },
    },
    select: {
      accessKeyId: true,
      deltaBytes: true,
    },
  });

  // Calculate delta bytes per key during this period
  const deltaByKey = new Map<string, bigint>();
  for (const log of trafficLogs) {
    const current = deltaByKey.get(log.accessKeyId) ?? BigInt(0);
    deltaByKey.set(log.accessKeyId, current + log.deltaBytes);
  }

  // Build per-server reports
  const serverReports: ServerReport[] = [];
  let grandTotalUsed = BigInt(0);
  let grandTotalDelta = BigInt(0);
  let totalKeyCount = 0;
  let activeKeyCount = 0;
  let expiredKeyCount = 0;
  let depletedKeyCount = 0;
  const allKeyUsage: Array<{ keyName: string; serverName: string; usedBytes: bigint }> = [];

  for (const server of servers) {
    let serverTotalUsed = BigInt(0);
    let serverDeltaBytes = BigInt(0);
    let serverActiveKeys = 0;

    const keyReports: KeyReport[] = [];

    for (const key of server.accessKeys) {
      const keyDelta = deltaByKey.get(key.id) ?? BigInt(0);
      const usedBytes = key.usedBytes;

      serverTotalUsed += usedBytes;
      serverDeltaBytes += keyDelta;
      totalKeyCount++;

      if (key.status === 'ACTIVE') {
        serverActiveKeys++;
        activeKeyCount++;
      } else if (key.status === 'EXPIRED') {
        expiredKeyCount++;
      } else if (key.status === 'DEPLETED') {
        depletedKeyCount++;
      }

      const usagePercent = key.dataLimitBytes
        ? Number((usedBytes * BigInt(10000)) / key.dataLimitBytes) / 100
        : null;

      keyReports.push({
        keyId: key.id,
        keyName: key.name,
        email: key.email,
        telegramId: key.telegramId,
        status: key.status,
        usedBytes: usedBytes.toString(),
        dataLimitBytes: key.dataLimitBytes?.toString() || null,
        usagePercent,
        createdAt: key.createdAt.toISOString(),
        expiresAt: key.expiresAt?.toISOString() || null,
      });

      allKeyUsage.push({
        keyName: key.name,
        serverName: server.name,
        usedBytes,
      });
    }

    grandTotalUsed += serverTotalUsed;
    grandTotalDelta += serverDeltaBytes;

    serverReports.push({
      serverId: server.id,
      serverName: server.name,
      location: server.location,
      countryCode: server.countryCode,
      totalKeys: server.accessKeys.length,
      activeKeys: serverActiveKeys,
      totalUsedBytes: serverTotalUsed.toString(),
      deltaBytes: serverDeltaBytes.toString(),
      keys: keyReports,
    });
  }

  // Top 10 consumers by total usage
  allKeyUsage.sort((a, b) => (b.usedBytes > a.usedBytes ? 1 : -1));
  const topConsumers = allKeyUsage.slice(0, 10).map((k) => ({
    keyName: k.keyName,
    serverName: k.serverName,
    usedBytes: k.usedBytes.toString(),
  }));

  // Average bytes per key
  const avgBytesPerKey = totalKeyCount > 0
    ? grandTotalUsed / BigInt(totalKeyCount)
    : BigInt(0);

  return {
    reportData: {
      generatedAt: new Date().toISOString(),
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      servers: serverReports,
      topConsumers,
      summary: {
        totalServers: servers.length,
        totalKeys: totalKeyCount,
        activeKeys: activeKeyCount,
        expiredKeys: expiredKeyCount,
        depletedKeys: depletedKeyCount,
        totalBytesUsed: grandTotalUsed.toString(),
        totalDeltaBytes: grandTotalDelta.toString(),
        averageBytesPerKey: avgBytesPerKey.toString(),
      },
    },
    totalServers: servers.length,
    totalKeys: totalKeyCount,
    totalBytesUsed: grandTotalUsed,
    totalDeltaBytes: grandTotalDelta,
  };
}

/**
 * Generate CSV content from report data.
 *
 * CSV format:
 * Server, Key Name, Email, Telegram, Status, Used (bytes), Limit (bytes), Usage %, Created, Expires
 */
export function generateReportCSV(reportData: {
  servers: ServerReport[];
  periodStart: string;
  periodEnd: string;
}): string {
  const headers = [
    'Server',
    'Server Location',
    'Key Name',
    'Email',
    'Telegram ID',
    'Status',
    'Used (bytes)',
    'Data Limit (bytes)',
    'Usage %',
    'Created At',
    'Expires At',
  ];

  const rows: string[][] = [];

  for (const server of reportData.servers) {
    for (const key of server.keys) {
      rows.push([
        server.serverName,
        server.location || '',
        key.keyName,
        key.email || '',
        key.telegramId || '',
        key.status,
        key.usedBytes,
        key.dataLimitBytes || 'Unlimited',
        key.usagePercent !== null ? `${key.usagePercent.toFixed(1)}%` : 'N/A',
        key.createdAt,
        key.expiresAt || 'Never',
      ]);
    }
  }

  const csvContent = [
    `# Report Period: ${reportData.periodStart} to ${reportData.periodEnd}`,
    `# Generated: ${new Date().toISOString()}`,
    '',
    headers.join(','),
    ...rows.map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ),
  ].join('\n');

  return csvContent;
}
