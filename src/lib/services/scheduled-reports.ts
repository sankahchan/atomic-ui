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
  subjectTemplate: z.string().trim().max(200).default('Atomic-UI {{frequency_label}} Summary'),
  bodyTemplate: z
    .string()
    .trim()
    .max(8000)
    .default(
      [
        '{{subject}}',
        'Generated at: {{generated_at}}',
        'Period: {{period_start}} to {{period_end}}',
        '',
        '{{revenue_line}}',
        '{{usage_line}}',
        '{{expirations_line}}',
        '{{failed_logins_line}}',
        '{{server_health_line}}',
      ].join('\n'),
    ),
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

function renderTemplate(template: string, variables: Record<string, string>) {
  return template.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, key: string) => variables[key] ?? '');
}

function buildTemplateVariables({
  config,
  generatedAt,
  periodStart,
  periodEnd,
  totalTrafficBytes,
  activeKeys,
  expiringSoon,
  expiredKeys,
  failedLogins,
  serverHealth,
}: {
  config: ScheduledReportsConfig;
  generatedAt: Date;
  periodStart: Date;
  periodEnd: Date;
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
  const frequencyLabel = config.frequency === 'DAILY' ? 'Daily' : 'Weekly';
  const subject = renderTemplate(config.subjectTemplate, {
    frequency_label: frequencyLabel,
  }).trim();

  const variables = {
    subject,
    frequency_label: frequencyLabel,
    generated_at: generatedAt.toISOString(),
    period_start: periodStart.toISOString(),
    period_end: periodEnd.toISOString(),
    revenue_line:
      config.includeRevenue && config.revenueAmount != null
        ? `Revenue: ${formatCurrency(config.revenueAmount, config.revenueCurrency)}`
        : config.includeRevenue
          ? 'Revenue: Not configured'
          : '',
    usage_line: config.includeUsage
      ? `Usage: ${formatBytes(totalTrafficBytes)} across ${activeKeys} active key(s)`
      : '',
    expirations_line: config.includeExpirations
      ? `Expirations: ${expiringSoon} expiring soon, ${expiredKeys} already expired`
      : '',
    failed_logins_line: config.includeFailedLogins ? `Failed logins: ${failedLogins}` : '',
    server_health_line: config.includeServerHealth
      ? `Server health: ${serverHealth.up} up, ${serverHealth.slow} slow, ${serverHealth.down} down, ${serverHealth.unknown} unknown`
      : '',
  };

  return {
    subject,
    body: renderTemplate(config.bodyTemplate, variables)
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line, index, all) => line || (index > 0 && all[index - 1]))
      .join('\n')
      .trim(),
  };
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

  const rendered = buildTemplateVariables({
    config,
    generatedAt: now,
    periodStart,
    periodEnd,
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
    subject: rendered.subject,
    summaryMessage: rendered.body,
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

function mapDeliveryStatus(status: string) {
  switch (status) {
    case 'SUCCESS':
      return 'SUCCESS';
    case 'FAILED':
      return 'FAILED';
    case 'SKIPPED':
      return 'SKIPPED';
    default:
      return 'QUEUED';
  }
}

export async function listScheduledReportRuns(input?: {
  page?: number;
  pageSize?: number;
}) {
  const page = input?.page ?? 1;
  const pageSize = input?.pageSize ?? 10;

  const [runs, total] = await Promise.all([
    db.scheduledReportRun.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        report: {
          select: {
            id: true,
            name: true,
            status: true,
            periodStart: true,
            periodEnd: true,
          },
        },
        deliveries: true,
      },
    }),
    db.scheduledReportRun.count(),
  ]);

  const notificationDeliveryIds = Array.from(
    new Set(
      runs
        .flatMap((run) => run.deliveries.map((delivery) => delivery.notificationDeliveryId))
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const queueDeliveries = notificationDeliveryIds.length
    ? await db.notificationDelivery.findMany({
        where: {
          id: {
            in: notificationDeliveryIds,
          },
        },
        select: {
          id: true,
          status: true,
          lastError: true,
          processedAt: true,
          updatedAt: true,
        },
      })
    : [];

  const queueById = new Map(queueDeliveries.map((delivery) => [delivery.id, delivery]));

  return {
    items: runs.map((run) => ({
      id: run.id,
      frequency: run.frequency,
      status: run.status,
      triggeredBy: run.triggeredBy,
      periodStart: run.periodStart,
      periodEnd: run.periodEnd,
      summaryMessage: run.summaryMessage,
      error: run.error,
      createdAt: run.createdAt,
      completedAt: run.completedAt,
      report: run.report,
      deliveries: run.deliveries.map((delivery) => {
        const queueDelivery = delivery.notificationDeliveryId
          ? queueById.get(delivery.notificationDeliveryId)
          : null;

        return {
          id: delivery.id,
          channelId: delivery.channelId,
          channelName: delivery.channelName,
          channelType: delivery.channelType,
          status: queueDelivery ? mapDeliveryStatus(queueDelivery.status) : delivery.status,
          lastError: queueDelivery?.lastError ?? delivery.lastError,
          deliveredAt: queueDelivery?.processedAt ?? delivery.deliveredAt,
          notificationDeliveryId: delivery.notificationDeliveryId,
        };
      }),
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getScheduledReportRunById(runId: string) {
  const run = await db.scheduledReportRun.findUnique({
    where: { id: runId },
    include: {
      report: true,
      deliveries: true,
    },
  });

  if (!run) {
    return null;
  }

  const queueDeliveries = run.deliveries.length
    ? await db.notificationDelivery.findMany({
        where: {
          id: {
            in: run.deliveries
              .map((delivery) => delivery.notificationDeliveryId)
              .filter((id): id is string => Boolean(id)),
          },
        },
        select: {
          id: true,
          status: true,
          lastError: true,
          processedAt: true,
          updatedAt: true,
        },
      })
    : [];

  const queueById = new Map(queueDeliveries.map((delivery) => [delivery.id, delivery]));

  return {
    id: run.id,
    frequency: run.frequency,
    status: run.status,
    triggeredBy: run.triggeredBy,
    periodStart: run.periodStart,
    periodEnd: run.periodEnd,
    summaryMessage: run.summaryMessage,
    configSnapshot: run.configSnapshot ? (JSON.parse(run.configSnapshot) as Record<string, unknown>) : null,
    error: run.error,
    createdAt: run.createdAt,
    completedAt: run.completedAt,
    report: run.report,
    deliveries: run.deliveries.map((delivery) => {
      const queueDelivery = delivery.notificationDeliveryId
        ? queueById.get(delivery.notificationDeliveryId)
        : null;

      return {
        id: delivery.id,
        channelId: delivery.channelId,
        channelName: delivery.channelName,
        channelType: delivery.channelType,
        status: queueDelivery ? mapDeliveryStatus(queueDelivery.status) : delivery.status,
        lastError: queueDelivery?.lastError ?? delivery.lastError,
        deliveredAt: queueDelivery?.processedAt ?? delivery.deliveredAt,
      };
    }),
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

  const snapshot = await buildScheduledReportSnapshot(config, now);
  const name = `${config.frequency === 'DAILY' ? 'Daily' : 'Weekly'} Summary - ${now.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })}`;

  const run = await db.scheduledReportRun.create({
    data: {
      frequency: config.frequency,
      status: 'RUNNING',
      triggeredBy,
      periodStart: snapshot.periodStart,
      periodEnd: snapshot.periodEnd,
      summaryMessage: snapshot.summaryMessage,
      configSnapshot: JSON.stringify(config),
    },
  });

  try {
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
          subject: snapshot.subject,
          summary: snapshot.dashboardSummary,
          usage: snapshot.reportData.reportData,
        }),
        totalServers: snapshot.reportData.totalServers,
        totalKeys: snapshot.reportData.totalKeys,
        totalBytesUsed: snapshot.reportData.totalBytesUsed,
        totalDeltaBytes: snapshot.reportData.totalDeltaBytes,
      },
    });

    const channelSnapshots = config.channelIds.length
      ? await db.notificationChannel.findMany({
          where: {
            id: {
              in: config.channelIds,
            },
          },
          select: {
            id: true,
            name: true,
            type: true,
          },
        })
      : [];

    const payload = {
      type: 'scheduled_report',
      reportId: report.id,
      reportRunId: run.id,
      reportName: name,
      subject: snapshot.subject,
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

    await db.scheduledReportRun.update({
      where: { id: run.id },
      data: {
        status: 'SUCCESS',
        reportId: report.id,
        completedAt: now,
      },
    });

    for (const item of delivery.deliveries) {
      const snapshotChannel = channelSnapshots.find((channel) => channel.id === item.channelId);
      await db.scheduledReportDelivery.create({
        data: {
          runId: run.id,
          channelId: item.channelId,
          channelName: snapshotChannel?.name ?? item.channelId,
          channelType: snapshotChannel?.type ?? 'UNKNOWN',
          status: item.suppressed ? 'SKIPPED' : 'QUEUED',
          notificationDeliveryId: item.suppressed ? null : (item.notificationDeliveryId ?? null),
          lastError: item.suppressed
            ? `Suppressed until ${item.blockedUntil?.toISOString() ?? 'cooldown window'}`
            : null,
          deliveredAt: item.suppressed ? now : null,
        },
      });
    }

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
        reportRunId: run.id,
        reportName: name,
        deliveryCount: delivery.count,
        suppressedCount: delivery.suppressedCount,
        frequency: config.frequency,
      },
    });

    logger.info(`Scheduled report generated: ${name}`, {
      reportId: report.id,
      reportRunId: run.id,
      deliveryCount: delivery.count,
      suppressedCount: delivery.suppressedCount,
    });

    return {
      skipped: false as const,
      runId: run.id,
      reportId: report.id,
      reportName: name,
      delivery,
      config: nextConfig,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    await db.scheduledReportRun.update({
      where: { id: run.id },
      data: {
        status: 'FAILED',
        error: message,
        completedAt: now,
      },
    });

    await saveScheduledReportsConfig({
      ...config,
      lastRunAt: now.toISOString(),
      lastRunStatus: 'FAILED',
      lastRunSummary: message,
    });

    throw error;
  }
}
