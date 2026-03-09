import { z } from 'zod';
import { db } from '@/lib/db';
import { generateReportData } from '@/lib/services/report-generator';
import { enqueueNotificationsForChannels } from '@/lib/services/notification-queue';
import { writeAuditLog } from '@/lib/audit';
import { logger } from '@/lib/logger';

const SCHEDULED_REPORTS_SETTING_KEY = 'scheduled_reports';
const DEFAULT_WEEKDAY = 1;

export const scheduledReportsConfigSchema = z.object({
  enabled: z.boolean().default(false),
  frequency: z.enum(['DAILY', 'WEEKLY']).default('WEEKLY'),
  weekday: z.number().int().min(0).max(6).default(DEFAULT_WEEKDAY),
  hour: z.number().int().min(0).max(23).default(9),
  minute: z.number().int().min(0).max(59).default(0),
  lookbackDays: z.number().int().min(1).max(31).default(7),
  channelIds: z.array(z.string()).max(20).default([]),
  includeRevenue: z.boolean().default(true),
  includeUsage: z.boolean().default(true),
  includeExpirations: z.boolean().default(true),
  includeFailedLogins: z.boolean().default(true),
  includeServerHealth: z.boolean().default(true),
  revenueAmount: z.number().min(0).nullable().default(null),
  revenueCurrency: z.string().trim().min(3).max(8).default('USD'),
  lastRunAt: z.string().datetime().nullable().default(null),
  lastRunStatus: z.enum(['IDLE', 'SUCCESS', 'FAILED']).default('IDLE'),
  lastRunSummary: z.string().nullable().default(null),
});

export type ScheduledReportsConfig = z.infer<typeof scheduledReportsConfigSchema>;

export const DEFAULT_SCHEDULED_REPORTS_CONFIG: ScheduledReportsConfig =
  scheduledReportsConfigSchema.parse({});

function parseScheduledReportsConfig(value: string | null | undefined) {
  if (!value) {
    return DEFAULT_SCHEDULED_REPORTS_CONFIG;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return scheduledReportsConfigSchema.parse({
      ...DEFAULT_SCHEDULED_REPORTS_CONFIG,
      ...(parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}),
    });
  } catch {
    return DEFAULT_SCHEDULED_REPORTS_CONFIG;
  }
}

function isSameLocalDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function getWeekStart(date: Date) {
  const next = new Date(date);
  const diff = (next.getDay() + 6) % 7;
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() - diff);
  return next;
}

function buildScheduledTime(config: ScheduledReportsConfig, now: Date) {
  const scheduled = new Date(now);
  scheduled.setHours(config.hour, config.minute, 0, 0);
  return scheduled;
}

function isScheduledRunDue(config: ScheduledReportsConfig, now: Date) {
  if (!config.enabled) {
    return { due: false as const, reason: 'disabled' };
  }

  if (config.channelIds.length === 0) {
    return { due: false as const, reason: 'no-channels' };
  }

  const scheduledToday = buildScheduledTime(config, now);
  if (now.getTime() < scheduledToday.getTime()) {
    return { due: false as const, reason: 'scheduled-time-not-reached' };
  }

  const lastRunAt = config.lastRunAt ? new Date(config.lastRunAt) : null;

  if (config.frequency === 'DAILY') {
    if (lastRunAt && isSameLocalDay(lastRunAt, now)) {
      return { due: false as const, reason: 'already-ran-today' };
    }

    return { due: true as const };
  }

  if (now.getDay() !== config.weekday) {
    return { due: false as const, reason: 'wrong-weekday' };
  }

  if (lastRunAt && getWeekStart(lastRunAt).getTime() === getWeekStart(now).getTime()) {
    return { due: false as const, reason: 'already-ran-this-week' };
  }

  return { due: true as const };
}

function formatCurrency(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function formatBytes(bytes: bigint) {
  const value = Number(bytes);
  if (value <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const size = value / 1024 ** exponent;
  return `${size.toFixed(size >= 10 ? 0 : 2)} ${units[exponent]}`;
}

function buildReportWindow(config: ScheduledReportsConfig, now: Date) {
  const periodEnd = new Date(now);
  periodEnd.setSeconds(59, 999);

  const periodStart = new Date(now);
  periodStart.setDate(periodStart.getDate() - Math.max(1, config.lookbackDays - 1));
  periodStart.setHours(0, 0, 0, 0);

  return { periodStart, periodEnd };
}

function buildSummaryMessage({
  config,
  generatedAt,
  totalTrafficBytes,
  activeKeys,
  expiringSoon,
  expiredKeys,
  failedLogins,
  serverHealth,
}: {
  config: ScheduledReportsConfig;
  generatedAt: Date;
  totalTrafficBytes: bigint;
  activeKeys: number;
  expiringSoon: number;
  expiredKeys: number;
  failedLogins: number;
  serverHealth: {
    up: number;
    down: number;
    slow: number;
    unknown: number;
  };
}) {
  const lines = [
    `Atomic-UI ${config.frequency === 'DAILY' ? 'Daily' : 'Weekly'} Summary`,
    `Generated at: ${generatedAt.toISOString()}`,
  ];

  if (config.includeRevenue) {
    lines.push(
      `Revenue: ${
        config.revenueAmount != null
          ? formatCurrency(config.revenueAmount, config.revenueCurrency)
          : 'Not configured'
      }`,
    );
  }

  if (config.includeUsage) {
    lines.push(`Usage: ${formatBytes(totalTrafficBytes)} across ${activeKeys} active key(s)`);
  }

  if (config.includeExpirations) {
    lines.push(`Expirations: ${expiringSoon} expiring soon, ${expiredKeys} already expired`);
  }

  if (config.includeFailedLogins) {
    lines.push(`Failed logins: ${failedLogins}`);
  }

  if (config.includeServerHealth) {
    lines.push(
      `Server health: ${serverHealth.up} up, ${serverHealth.slow} slow, ${serverHealth.down} down, ${serverHealth.unknown} unknown`,
    );
  }

  return lines.join('\n');
}

export async function getScheduledReportsConfig() {
  const record = await db.settings.findUnique({
    where: { key: SCHEDULED_REPORTS_SETTING_KEY },
    select: { value: true },
  });

  return parseScheduledReportsConfig(record?.value);
}

export async function saveScheduledReportsConfig(config: Partial<ScheduledReportsConfig>) {
  const current = await getScheduledReportsConfig();
  const next = scheduledReportsConfigSchema.parse({
    ...current,
    ...config,
  });

  await db.settings.upsert({
    where: { key: SCHEDULED_REPORTS_SETTING_KEY },
    create: {
      key: SCHEDULED_REPORTS_SETTING_KEY,
      value: JSON.stringify(next),
    },
    update: {
      value: JSON.stringify(next),
    },
  });

  return next;
}

export async function buildScheduledReportSnapshot(config: ScheduledReportsConfig, now = new Date()) {
  const { periodStart, periodEnd } = buildReportWindow(config, now);
  const [reportData, expiringSoon, expiredKeys, failedLogins, healthCounts] = await Promise.all([
    generateReportData(periodStart, periodEnd),
    db.accessKey.count({
      where: {
        status: 'ACTIVE',
        expiresAt: {
          gte: now,
          lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        },
      },
    }),
    db.accessKey.count({
      where: {
        status: 'EXPIRED',
      },
    }),
    db.auditLog.count({
      where: {
        createdAt: {
          gte: periodStart,
          lte: periodEnd,
        },
        action: {
          in: ['AUTH_LOGIN_FAILED', 'AUTH_2FA_FAILED'],
        },
      },
    }),
    db.healthCheck.groupBy({
      by: ['lastStatus'],
      _count: {
        lastStatus: true,
      },
    }),
  ]);

  const serverHealth = {
    up: 0,
    down: 0,
    slow: 0,
    unknown: 0,
  };

  for (const row of healthCounts) {
    switch (row.lastStatus) {
      case 'UP':
        serverHealth.up = row._count.lastStatus;
        break;
      case 'DOWN':
        serverHealth.down = row._count.lastStatus;
        break;
      case 'SLOW':
        serverHealth.slow = row._count.lastStatus;
        break;
      default:
        serverHealth.unknown += row._count.lastStatus;
        break;
    }
  }

  const summaryMessage = buildSummaryMessage({
    config,
    generatedAt: now,
    totalTrafficBytes: reportData.totalDeltaBytes,
    activeKeys: reportData.reportData.summary.activeKeys,
    expiringSoon,
    expiredKeys,
    failedLogins,
    serverHealth,
  });

  return {
    periodStart,
    periodEnd,
    summaryMessage,
    reportData,
    dashboardSummary: {
      revenueAmount: config.revenueAmount,
      revenueCurrency: config.revenueCurrency,
      expiringSoon,
      expiredKeys,
      failedLogins,
      serverHealth,
    },
  };
}

export async function runScheduledReportsCycle({
  force = false,
  now = new Date(),
  triggeredBy = 'scheduler',
  userId,
  ip,
}: {
  force?: boolean;
  now?: Date;
  triggeredBy?: string;
  userId?: string | null;
  ip?: string | null;
} = {}) {
  const config = await getScheduledReportsConfig();
  const due = force ? { due: true as const } : isScheduledRunDue(config, now);

  if (!due.due) {
    return {
      skipped: true as const,
      reason: due.reason,
      config,
    };
  }

  try {
    const snapshot = await buildScheduledReportSnapshot(config, now);
    const name = `${config.frequency === 'DAILY' ? 'Daily' : 'Weekly'} Summary - ${now.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })}`;

    const report = await db.report.create({
      data: {
        name,
        type: 'CUSTOM',
        status: 'READY',
        periodStart: snapshot.periodStart,
        periodEnd: snapshot.periodEnd,
        generatedBy: triggeredBy,
        reportData: JSON.stringify({
          kind: 'scheduled-summary',
          summary: snapshot.dashboardSummary,
          usage: snapshot.reportData.reportData,
        }),
        totalServers: snapshot.reportData.totalServers,
        totalKeys: snapshot.reportData.totalKeys,
        totalBytesUsed: snapshot.reportData.totalBytesUsed,
        totalDeltaBytes: snapshot.reportData.totalDeltaBytes,
      },
    });

    const payload = {
      type: 'scheduled_report',
      reportId: report.id,
      reportName: name,
      periodStart: snapshot.periodStart.toISOString(),
      periodEnd: snapshot.periodEnd.toISOString(),
      summary: snapshot.dashboardSummary,
      usageSummary: snapshot.reportData.reportData.summary,
    };

    const delivery = await enqueueNotificationsForChannels({
      channelIds: config.channelIds,
      event: 'SCHEDULED_REPORT',
      message: snapshot.summaryMessage,
      payload,
      cooldownKey: `${config.frequency}:${snapshot.periodStart.toISOString()}`,
      bypassCooldown: force,
    });

    const nextConfig = await saveScheduledReportsConfig({
      ...config,
      lastRunAt: now.toISOString(),
      lastRunStatus: 'SUCCESS',
      lastRunSummary: `Delivered to ${delivery.count} channel(s), ${delivery.suppressedCount} suppressed`,
    });

    await writeAuditLog({
      userId,
      ip,
      action: force ? 'REPORT_SCHEDULE_RUN_NOW' : 'REPORT_SCHEDULE_RUN',
      entity: 'REPORT',
      entityId: report.id,
      details: {
        triggeredBy,
        reportName: name,
        deliveryCount: delivery.count,
        suppressedCount: delivery.suppressedCount,
        frequency: config.frequency,
      },
    });

    logger.info(`Scheduled report generated: ${name}`, {
      reportId: report.id,
      deliveryCount: delivery.count,
      suppressedCount: delivery.suppressedCount,
    });

    return {
      skipped: false as const,
      reportId: report.id,
      reportName: name,
      delivery,
      config: nextConfig,
    };
  } catch (error) {
    await saveScheduledReportsConfig({
      ...config,
      lastRunAt: now.toISOString(),
      lastRunStatus: 'FAILED',
      lastRunSummary: error instanceof Error ? error.message : 'Unknown error',
    });

    throw error;
  }
}
