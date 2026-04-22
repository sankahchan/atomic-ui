import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

export type SchedulerJobCategory =
  | 'CORE'
  | 'NOTIFICATIONS'
  | 'TELEGRAM'
  | 'SECURITY'
  | 'OPERATIONS';

export type SchedulerJobTrigger = 'SCHEDULED' | 'STARTUP' | 'MANUAL';
export type SchedulerJobStatus = 'IDLE' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SKIPPED';
export type SchedulerExecutionGate = {
  allowed: boolean;
  reason?: 'PAUSED';
  summary?: string;
};

export type SchedulerJobDefinition = {
  key: string;
  name: string;
  description: string;
  category: SchedulerJobCategory;
  cadenceLabel: string;
  cronExpression?: string;
  startupOnly?: boolean;
  manualRunSupported?: boolean;
};

type SchedulerObservedOutcome<T> = {
  value: T;
  status?: Extract<SchedulerJobStatus, 'SUCCESS' | 'SKIPPED'>;
  summary?: string | null;
  resultPreview?: unknown;
};

const MAX_STORED_RUNS_PER_JOB = 25;
const SQLITE_DATABASE_URL_PREFIX = 'file:';
const SCHEDULER_CATALOG_SYNC_TTL_MS = 60_000;
const SCHEDULER_RUNTIME_STATE_TTL_MS = 15_000;
const SCHEDULER_FAILURE_BACKOFF_MINUTES = [0, 2, 5, 15, 30, 60];
const shouldSerializeObservedSchedulerJobs =
  process.env.DATABASE_URL?.startsWith(SQLITE_DATABASE_URL_PREFIX) ?? false;

let lastSchedulerJobCatalogSyncAt = 0;
let schedulerJobCatalogSyncPromise: Promise<void> | null = null;
let observedSchedulerQueue: Promise<void> = Promise.resolve();
const executingSchedulerJobKeys = new Set<string>();
const pausedSchedulerJobKeys = new Set<string>();
const schedulerRuntimeStateCache = new Map<
  string,
  {
    expiresAt: number;
    state: {
      isPaused: boolean;
      pausedAt: Date | null;
      pausedReason: string | null;
      pausedBy: string | null;
      lastStatus: string;
      lastFinishedAt: Date | null;
      consecutiveFailures: number;
    };
  }
>();

export const SCHEDULER_JOB_DEFINITIONS: Record<string, SchedulerJobDefinition> = {
  trafficSnapshot: {
    key: 'traffic_snapshot',
    name: 'Traffic Snapshot',
    description: 'Snapshots current Outline usage for analytics and reporting.',
    category: 'CORE',
    cadenceLabel: 'Hourly',
    cronExpression: '0 * * * *',
    manualRunSupported: true,
  },
  expirationCheck: {
    key: 'expiration_check',
    name: 'Expiration Check',
    description: 'Expires, depletes, and archives keys based on lifecycle rules.',
    category: 'CORE',
    cadenceLabel: 'Every 5 minutes',
    cronExpression: '*/5 * * * *',
    manualRunSupported: true,
  },
  bandwidthReview: {
    key: 'bandwidth_review',
    name: 'Bandwidth Review',
    description: 'Reviews quota thresholds and auto-disables keys at the hard limit.',
    category: 'CORE',
    cadenceLabel: 'Every 5 minutes',
    cronExpression: '*/5 * * * *',
    manualRunSupported: true,
  },
  deviceLimits: {
    key: 'device_limits',
    name: 'Device Limit Enforcement',
    description: 'Warns or disables keys when estimated device count exceeds policy.',
    category: 'SECURITY',
    cadenceLabel: 'Every 5 minutes',
    cronExpression: '*/5 * * * *',
    manualRunSupported: true,
  },
  healthCheck: {
    key: 'health_check',
    name: 'Health Check',
    description: 'Checks server latency and outage state, then syncs incidents.',
    category: 'OPERATIONS',
    cadenceLabel: 'Every 2 minutes',
    cronExpression: '*/2 * * * *',
    manualRunSupported: true,
  },
  trafficActivity: {
    key: 'traffic_activity',
    name: 'Traffic Activity Collection',
    description: 'Collects short-window traffic activity used by dashboards and heuristics.',
    category: 'CORE',
    cadenceLabel: 'Every minute',
    cronExpression: '* * * * *',
    manualRunSupported: true,
  },
  dynamicKeyAlerts: {
    key: 'dynamic_key_alerts',
    name: 'Dynamic Key Alerts',
    description: 'Evaluates dynamic routing events and smart alert conditions.',
    category: 'OPERATIONS',
    cadenceLabel: 'Every 15 minutes',
    cronExpression: '*/15 * * * *',
    manualRunSupported: true,
  },
  keyRotation: {
    key: 'key_rotation',
    name: 'Key Rotation',
    description: 'Rotates standalone access keys that reached their scheduled interval.',
    category: 'SECURITY',
    cadenceLabel: 'Every 15 minutes',
    cronExpression: '*/15 * * * *',
    manualRunSupported: true,
  },
  auditCleanup: {
    key: 'audit_cleanup',
    name: 'Audit Cleanup',
    description: 'Removes old audit logs according to retention settings.',
    category: 'SECURITY',
    cadenceLabel: 'Daily at 03:30',
    cronExpression: '30 3 * * *',
  },
  notificationQueue: {
    key: 'notification_queue',
    name: 'Notification Queue',
    description: 'Processes queued panel, email, Telegram, and webhook notifications.',
    category: 'NOTIFICATIONS',
    cadenceLabel: 'Every minute',
    cronExpression: '* * * * *',
    manualRunSupported: true,
  },
  backupVerification: {
    key: 'backup_verification',
    name: 'Backup Verification',
    description: 'Verifies the latest generated backups for corruption or missing data.',
    category: 'OPERATIONS',
    cadenceLabel: 'Daily at 04:00',
    cronExpression: '0 4 * * *',
    manualRunSupported: true,
  },
  telegramWebhookHealth: {
    key: 'telegram_webhook_health',
    name: 'Telegram Webhook Health',
    description: 'Checks Telegram webhook delivery health and alerts admins on delivery failures.',
    category: 'TELEGRAM',
    cadenceLabel: 'Every 15 minutes',
    cronExpression: '*/15 * * * *',
    manualRunSupported: true,
  },
  adminQueueHealth: {
    key: 'admin_queue_health',
    name: 'Admin Queue Health',
    description: 'Alerts admins when support SLA and review backlog age drift beyond the healthy window.',
    category: 'OPERATIONS',
    cadenceLabel: 'Every 30 minutes',
    cronExpression: '*/30 * * * *',
    manualRunSupported: true,
  },
  rebalancePlanner: {
    key: 'rebalance_planner',
    name: 'Rebalance Planner',
    description: 'Plans and optionally applies safer server rebalancing recommendations.',
    category: 'OPERATIONS',
    cadenceLabel: 'Every 30 minutes',
    cronExpression: '*/30 * * * *',
    manualRunSupported: true,
  },
  scheduledReports: {
    key: 'scheduled_reports',
    name: 'Scheduled Reports',
    description: 'Builds and delivers scheduled report exports.',
    category: 'NOTIFICATIONS',
    cadenceLabel: 'Every 5 minutes',
    cronExpression: '*/5 * * * *',
    manualRunSupported: true,
  },
  telegramDigest: {
    key: 'telegram_digest',
    name: 'Telegram Digest',
    description: 'Sends periodic Telegram admin digests.',
    category: 'TELEGRAM',
    cadenceLabel: 'Every 15 minutes',
    cronExpression: '*/15 * * * *',
  },
  telegramSupportSla: {
    key: 'telegram_support_sla',
    name: 'Telegram Support SLA Alerts',
    description: 'Alerts admins when support threads breach first-response SLA.',
    category: 'TELEGRAM',
    cadenceLabel: 'Every 15 minutes',
    cronExpression: '*/15 * * * *',
    manualRunSupported: true,
  },
  adminLoginDigest: {
    key: 'admin_login_digest',
    name: 'Admin Login Incident Digest',
    description: 'Sends risk and approval incident summaries for admin login protection.',
    category: 'SECURITY',
    cadenceLabel: 'Every 15 minutes',
    cronExpression: '*/15 * * * *',
  },
  telegramSalesOrders: {
    key: 'telegram_sales_orders',
    name: 'Telegram Sales Workflow',
    description: 'Processes reminders, coupon journeys, expiries, and follow-ups in Telegram sales.',
    category: 'TELEGRAM',
    cadenceLabel: 'Every 15 minutes',
    cronExpression: '*/15 * * * *',
  },
  serverOutage: {
    key: 'server_outage',
    name: 'Server Outage Alerts',
    description: 'Sends delayed outage notifications and resolves recovered outages.',
    category: 'OPERATIONS',
    cadenceLabel: 'Every 15 minutes',
    cronExpression: '*/15 * * * *',
    manualRunSupported: true,
  },
  telegramFinanceDigest: {
    key: 'telegram_finance_digest',
    name: 'Telegram Finance Digest',
    description: 'Sends Telegram finance queue summaries to admins.',
    category: 'TELEGRAM',
    cadenceLabel: 'Every 15 minutes',
    cronExpression: '*/15 * * * *',
  },
  telegramAnnouncements: {
    key: 'telegram_announcements',
    name: 'Telegram Announcements',
    description: 'Dispatches scheduled Telegram announcements and recurring sends.',
    category: 'TELEGRAM',
    cadenceLabel: 'Every 5 minutes',
    cronExpression: '*/5 * * * *',
  },
  telegramPremiumAlerts: {
    key: 'telegram_premium_alerts',
    name: 'Telegram Premium Region Alerts',
    description: 'Pins degraded premium routing notices and resolves recovered states.',
    category: 'TELEGRAM',
    cadenceLabel: 'Every 15 minutes',
    cronExpression: '*/15 * * * *',
  },
};

export function listSchedulerJobDefinitions() {
  return Object.values(SCHEDULER_JOB_DEFINITIONS);
}

export function getSchedulerJobDefinitionByKey(jobKey: string) {
  return listSchedulerJobDefinitions().find((job) => job.key === jobKey) || null;
}

export function isSchedulerJobManualRunSupported(jobKey: string) {
  return Boolean(getSchedulerJobDefinitionByKey(jobKey)?.manualRunSupported);
}

export function isSchedulerJobExecuting(jobKey: string) {
  return executingSchedulerJobKeys.has(jobKey);
}

export function getExecutingSchedulerJobKeys() {
  return Array.from(executingSchedulerJobKeys);
}

export function isSchedulerJobPaused(jobKey: string) {
  return pausedSchedulerJobKeys.has(jobKey);
}

export function computeSchedulerJobFailureBackoffMinutes(consecutiveFailures: number) {
  if (!Number.isFinite(consecutiveFailures) || consecutiveFailures <= 1) {
    return 0;
  }

  const index = Math.min(
    SCHEDULER_FAILURE_BACKOFF_MINUTES.length - 1,
    Math.max(1, consecutiveFailures - 1),
  );
  return SCHEDULER_FAILURE_BACKOFF_MINUTES[index];
}

export function computeSchedulerJobBackoffUntil(
  lastFinishedAt?: Date | null,
  consecutiveFailures = 0,
) {
  if (!lastFinishedAt) {
    return null;
  }

  const backoffMinutes = computeSchedulerJobFailureBackoffMinutes(consecutiveFailures);
  if (backoffMinutes <= 0) {
    return null;
  }

  return new Date(lastFinishedAt.getTime() + backoffMinutes * 60_000);
}

function setSchedulerRuntimeStateCache(
  jobKey: string,
  state: {
    isPaused: boolean;
    pausedAt: Date | null;
    pausedReason: string | null;
    pausedBy: string | null;
    lastStatus: string;
    lastFinishedAt: Date | null;
    consecutiveFailures: number;
  },
) {
  schedulerRuntimeStateCache.set(jobKey, {
    expiresAt: Date.now() + SCHEDULER_RUNTIME_STATE_TTL_MS,
    state,
  });

  if (state.isPaused) {
    pausedSchedulerJobKeys.add(jobKey);
  } else {
    pausedSchedulerJobKeys.delete(jobKey);
  }
}

export function invalidateSchedulerJobRuntimeState(jobKey?: string) {
  if (jobKey) {
    schedulerRuntimeStateCache.delete(jobKey);
    return;
  }

  schedulerRuntimeStateCache.clear();
}

export async function hydratePausedSchedulerJobState() {
  const jobs = await db.schedulerJob.findMany({
    where: { isPaused: true },
    select: { key: true },
  });

  pausedSchedulerJobKeys.clear();
  for (const job of jobs) {
    pausedSchedulerJobKeys.add(job.key);
  }
}

async function getSchedulerRuntimeState(jobKey: string) {
  const cached = schedulerRuntimeStateCache.get(jobKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.state;
  }

  const job = await db.schedulerJob.findUnique({
    where: { key: jobKey },
    select: {
      isPaused: true,
      pausedAt: true,
      pausedReason: true,
      pausedBy: true,
      lastStatus: true,
      lastFinishedAt: true,
      consecutiveFailures: true,
    },
  });

  const state = {
    isPaused: job?.isPaused ?? false,
    pausedAt: job?.pausedAt ?? null,
    pausedReason: job?.pausedReason ?? null,
    pausedBy: job?.pausedBy ?? null,
    lastStatus: job?.lastStatus ?? 'IDLE',
    lastFinishedAt: job?.lastFinishedAt ?? null,
    consecutiveFailures: job?.consecutiveFailures ?? 0,
  };
  setSchedulerRuntimeStateCache(jobKey, state);
  return state;
}

export async function getSchedulerJobExecutionGate(jobKey: string): Promise<SchedulerExecutionGate> {
  const state = await getSchedulerRuntimeState(jobKey);
  if (state.isPaused) {
    return {
      allowed: false,
      reason: 'PAUSED',
      summary: state.pausedReason?.trim()
        ? `Paused: ${state.pausedReason.trim()}`
        : 'Paused by an admin operator',
    };
  }

  return { allowed: true };
}

export function computeNextSchedulerJobRun(cronExpression: string, now = new Date()) {
  const trimmed = cronExpression.trim();
  if (trimmed === '* * * * *') {
    return new Date(Math.floor(now.getTime() / 60_000) * 60_000 + 60_000);
  }

  const parts = trimmed.split(/\s+/);
  if (parts.length !== 5) {
    return null;
  }

  const [minutePart, hourPart, dayPart, monthPart, weekDayPart] = parts;
  if (dayPart !== '*' || monthPart !== '*' || weekDayPart !== '*') {
    return null;
  }

  if (minutePart.startsWith('*/') && hourPart === '*') {
    const interval = Number.parseInt(minutePart.slice(2), 10);
    if (!Number.isFinite(interval) || interval <= 0) {
      return null;
    }
    const next = new Date(now);
    next.setSeconds(0, 0);
    next.setMinutes(next.getMinutes() + 1);
    while (next.getMinutes() % interval !== 0) {
      next.setMinutes(next.getMinutes() + 1);
    }
    return next;
  }

  if (/^\d+$/.test(minutePart) && hourPart === '*') {
    const minute = Number.parseInt(minutePart, 10);
    if (minute < 0 || minute > 59) {
      return null;
    }
    const next = new Date(now);
    next.setSeconds(0, 0);
    next.setMinutes(minute);
    if (next.getTime() <= now.getTime()) {
      next.setHours(next.getHours() + 1);
    }
    return next;
  }

  if (/^\d+$/.test(minutePart) && /^\d+$/.test(hourPart)) {
    const minute = Number.parseInt(minutePart, 10);
    const hour = Number.parseInt(hourPart, 10);
    if (minute < 0 || minute > 59 || hour < 0 || hour > 23) {
      return null;
    }
    const next = new Date(now);
    next.setSeconds(0, 0);
    next.setHours(hour, minute, 0, 0);
    if (next.getTime() <= now.getTime()) {
      next.setDate(next.getDate() + 1);
    }
    return next;
  }

  return null;
}

function truncateText(value: string | null | undefined, maxLength: number) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, Math.max(0, maxLength - 1))}…`;
}

function stringifyPreview(value: unknown) {
  if (value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    return truncateText(value, 1000);
  }

  try {
    return truncateText(JSON.stringify(value), 1000);
  } catch {
    return truncateText(String(value), 1000);
  }
}

async function pruneSchedulerJobRuns(jobKey: string) {
  const overflowRuns = await db.schedulerJobRun.findMany({
    where: { jobKey },
    orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }],
    skip: MAX_STORED_RUNS_PER_JOB,
    select: { id: true },
  });

  if (overflowRuns.length > 0) {
    await db.schedulerJobRun.deleteMany({
      where: {
        id: {
          in: overflowRuns.map((run) => run.id),
        },
      },
    });
  }
}

async function sendSchedulerJobFailureDigest(input: {
  job: SchedulerJobDefinition;
  summary?: string | null;
  error?: string | null;
  consecutiveFailures: number;
  finishedAt: Date;
}) {
  const lines = [
    `Scheduler job failed: ${input.job.name}`,
    `Key: ${input.job.key}`,
    `Consecutive failures: ${input.consecutiveFailures}`,
    `Time: ${input.finishedAt.toISOString()}`,
  ];

  if (input.summary?.trim()) {
    lines.push(`Summary: ${input.summary.trim()}`);
  }

  if (input.error?.trim()) {
    lines.push(`Error: ${input.error.trim()}`);
  }

  const message = lines.join('\n');

  try {
    const { parseNotificationChannelRecord, channelSupportsEvent } = await import('@/lib/services/notification-channels');
    const { enqueueNotificationsForChannels } = await import('@/lib/services/notification-queue');

    const channels = await db.notificationChannel.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        type: true,
        isActive: true,
        config: true,
        events: true,
      },
    });

    const channelIds = channels
      .map((channel) => parseNotificationChannelRecord(channel))
      .filter((channel): channel is NonNullable<typeof channel> => Boolean(channel))
      .filter((channel) => channelSupportsEvent(channel, 'AUDIT_ALERT'))
      .map((channel) => channel.id);

    if (channelIds.length > 0) {
      await enqueueNotificationsForChannels({
        channelIds,
        event: 'AUDIT_ALERT',
        message,
        payload: {
          source: 'scheduler_job',
          jobKey: input.job.key,
          consecutiveFailures: input.consecutiveFailures,
          finishedAt: input.finishedAt.toISOString(),
        },
        cooldownKey: input.job.key,
        cooldownMs: 60 * 60_000,
      });
      return;
    }
  } catch (error) {
    logger.warn(`Scheduler failure digest queue failed for ${input.job.key}`, error);
  }

  try {
    const { sendAdminAlert } = await import('@/lib/services/telegram-bot');
    await sendAdminAlert(message);
  } catch (error) {
    logger.warn(`Scheduler failure digest Telegram fallback failed for ${input.job.key}`, error);
  }
}

export async function syncSchedulerJobCatalog(now = new Date(), options?: { force?: boolean }) {
  const nowMs = now.getTime();
  if (!options?.force && lastSchedulerJobCatalogSyncAt > 0 && nowMs - lastSchedulerJobCatalogSyncAt < SCHEDULER_CATALOG_SYNC_TTL_MS) {
    return;
  }

  if (schedulerJobCatalogSyncPromise) {
    return schedulerJobCatalogSyncPromise;
  }

  const jobs = listSchedulerJobDefinitions();
  schedulerJobCatalogSyncPromise = (async () => {
    const syncJob = async (job: SchedulerJobDefinition) =>
      db.schedulerJob.upsert({
        where: { key: job.key },
        update: {
          name: job.name,
          description: job.description,
          category: job.category,
          cadenceLabel: job.cadenceLabel,
          cronExpression: job.cronExpression || null,
          startupOnly: job.startupOnly ?? false,
          nextRunAt: job.cronExpression ? computeNextSchedulerJobRun(job.cronExpression, now) : null,
        },
        create: {
          key: job.key,
          name: job.name,
          description: job.description,
          category: job.category,
          cadenceLabel: job.cadenceLabel,
          cronExpression: job.cronExpression || null,
          startupOnly: job.startupOnly ?? false,
          nextRunAt: job.cronExpression ? computeNextSchedulerJobRun(job.cronExpression, now) : null,
        },
      });

    if (shouldSerializeObservedSchedulerJobs) {
      for (const job of jobs) {
        await syncJob(job);
      }
    } else {
      await Promise.all(jobs.map((job) => syncJob(job)));
    }

    lastSchedulerJobCatalogSyncAt = Date.now();
  })().finally(() => {
    schedulerJobCatalogSyncPromise = null;
  });

  return schedulerJobCatalogSyncPromise;
}

export async function setSchedulerJobPausedState(input: {
  jobKey: string;
  paused: boolean;
  reason?: string | null;
  pausedBy?: string | null;
}) {
  const updated = await db.schedulerJob.update({
    where: { key: input.jobKey },
    data: {
      isPaused: input.paused,
      pausedAt: input.paused ? new Date() : null,
      pausedReason: input.paused ? input.reason?.trim() || null : null,
      pausedBy: input.paused ? input.pausedBy?.trim() || null : null,
    },
  });

  setSchedulerRuntimeStateCache(input.jobKey, {
    isPaused: updated.isPaused,
    pausedAt: updated.pausedAt,
    pausedReason: updated.pausedReason,
    pausedBy: updated.pausedBy,
    lastStatus: updated.lastStatus,
    lastFinishedAt: updated.lastFinishedAt,
    consecutiveFailures: updated.consecutiveFailures,
  });

  return updated;
}

async function markSchedulerJobStart(
  job: SchedulerJobDefinition,
  trigger: SchedulerJobTrigger,
  startedAt: Date,
) {
  await db.schedulerJob.upsert({
    where: { key: job.key },
    update: {
      name: job.name,
      description: job.description,
      category: job.category,
      cadenceLabel: job.cadenceLabel,
      cronExpression: job.cronExpression || null,
      startupOnly: job.startupOnly ?? false,
      lastStatus: 'RUNNING',
      lastTrigger: trigger,
      lastStartedAt: startedAt,
      lastFinishedAt: null,
      lastDurationMs: null,
      lastSummary: null,
      lastError: null,
      nextRunAt: job.cronExpression ? computeNextSchedulerJobRun(job.cronExpression, startedAt) : null,
    },
    create: {
      key: job.key,
      name: job.name,
      description: job.description,
      category: job.category,
      cadenceLabel: job.cadenceLabel,
      cronExpression: job.cronExpression || null,
      startupOnly: job.startupOnly ?? false,
      lastStatus: 'RUNNING',
      lastTrigger: trigger,
      lastStartedAt: startedAt,
      nextRunAt: job.cronExpression ? computeNextSchedulerJobRun(job.cronExpression, startedAt) : null,
      runCount: 0,
    },
  });
}

async function markSchedulerJobFinish(input: {
  job: SchedulerJobDefinition;
  trigger: SchedulerJobTrigger;
  status: Extract<SchedulerJobStatus, 'SUCCESS' | 'FAILED' | 'SKIPPED'>;
  startedAt: Date;
  finishedAt: Date;
  summary?: string | null;
  error?: string | null;
  resultPreview?: unknown;
  storeRunHistory?: boolean;
}) {
  const durationMs = Math.max(
    0,
    Math.round(input.finishedAt.getTime() - input.startedAt.getTime()),
  );
  const preview = stringifyPreview(input.resultPreview);
  const truncatedSummary = truncateText(input.summary, 500);
  const truncatedError = truncateText(input.error, 1000);

  const persistedJob = await db.schedulerJob.upsert({
    where: { key: input.job.key },
    update: {
      name: input.job.name,
      description: input.job.description,
      category: input.job.category,
      cadenceLabel: input.job.cadenceLabel,
      cronExpression: input.job.cronExpression || null,
      startupOnly: input.job.startupOnly ?? false,
      lastStatus: input.status,
      lastTrigger: input.trigger,
      lastStartedAt: input.startedAt,
      lastFinishedAt: input.finishedAt,
      lastSucceededAt:
        input.status === 'SUCCESS' ? input.finishedAt : undefined,
      lastDurationMs: durationMs,
      lastSummary: truncatedSummary,
      lastError: truncatedError,
      nextRunAt: input.job.cronExpression
        ? computeNextSchedulerJobRun(input.job.cronExpression, input.finishedAt)
        : null,
      runCount: { increment: 1 },
      successCount:
        input.status === 'SUCCESS' ? { increment: 1 } : undefined,
      failureCount:
        input.status === 'FAILED' ? { increment: 1 } : undefined,
      skippedCount:
        input.status === 'SKIPPED' ? { increment: 1 } : undefined,
      consecutiveFailures:
        input.status === 'FAILED' ? { increment: 1 } : 0,
    },
    create: {
      key: input.job.key,
      name: input.job.name,
      description: input.job.description,
      category: input.job.category,
      cadenceLabel: input.job.cadenceLabel,
      cronExpression: input.job.cronExpression || null,
      startupOnly: input.job.startupOnly ?? false,
      lastStatus: input.status,
      lastTrigger: input.trigger,
      lastStartedAt: input.startedAt,
      lastFinishedAt: input.finishedAt,
      lastSucceededAt: input.status === 'SUCCESS' ? input.finishedAt : null,
      lastDurationMs: durationMs,
      lastSummary: truncatedSummary,
      lastError: truncatedError,
      nextRunAt: input.job.cronExpression
        ? computeNextSchedulerJobRun(input.job.cronExpression, input.finishedAt)
        : null,
      runCount: 1,
      successCount: input.status === 'SUCCESS' ? 1 : 0,
      failureCount: input.status === 'FAILED' ? 1 : 0,
      skippedCount: input.status === 'SKIPPED' ? 1 : 0,
      consecutiveFailures: input.status === 'FAILED' ? 1 : 0,
    },
  });

  setSchedulerRuntimeStateCache(input.job.key, {
    isPaused: persistedJob.isPaused,
    pausedAt: persistedJob.pausedAt,
    pausedReason: persistedJob.pausedReason,
    pausedBy: persistedJob.pausedBy,
    lastStatus: persistedJob.lastStatus,
    lastFinishedAt: persistedJob.lastFinishedAt,
    consecutiveFailures: persistedJob.consecutiveFailures,
  });

  if (!input.storeRunHistory) {
    if (
      input.status === 'FAILED' &&
      (persistedJob.consecutiveFailures === 1 || persistedJob.consecutiveFailures % 3 === 0)
    ) {
      await sendSchedulerJobFailureDigest({
        job: input.job,
        summary: truncatedSummary,
        error: truncatedError,
        consecutiveFailures: persistedJob.consecutiveFailures,
        finishedAt: input.finishedAt,
      });
    }
    return;
  }

  await db.schedulerJobRun.create({
    data: {
      jobKey: input.job.key,
      trigger: input.trigger,
      status: input.status,
      startedAt: input.startedAt,
      finishedAt: input.finishedAt,
      durationMs,
      summary: truncatedSummary,
      error: truncatedError,
      resultPreview: preview,
    },
  });

  await pruneSchedulerJobRuns(input.job.key);

  if (
    input.status === 'FAILED' &&
    (persistedJob.consecutiveFailures === 1 || persistedJob.consecutiveFailures % 3 === 0)
  ) {
    await sendSchedulerJobFailureDigest({
      job: input.job,
      summary: truncatedSummary,
      error: truncatedError,
      consecutiveFailures: persistedJob.consecutiveFailures,
      finishedAt: input.finishedAt,
    });
  }
}

async function bestEffortMarkSchedulerJobStart(
  job: SchedulerJobDefinition,
  trigger: SchedulerJobTrigger,
  startedAt: Date,
) {
  try {
    await markSchedulerJobStart(job, trigger, startedAt);
  } catch (error) {
    logger.warn(`Scheduler telemetry start update failed for ${job.key}`, error);
  }
}

async function bestEffortMarkSchedulerJobFinish(
  input: Parameters<typeof markSchedulerJobFinish>[0],
) {
  try {
    await markSchedulerJobFinish(input);
  } catch (error) {
    logger.warn(`Scheduler telemetry finish update failed for ${input.job.key}`, error);
  }
}

function shouldStoreSchedulerRunHistory(
  trigger: SchedulerJobTrigger,
  status: Extract<SchedulerJobStatus, 'SUCCESS' | 'FAILED' | 'SKIPPED'>,
) {
  return trigger !== 'SCHEDULED' || status !== 'SUCCESS';
}

async function runObservedSchedulerJobExecution<T>(
  job: SchedulerJobDefinition,
  trigger: SchedulerJobTrigger,
  handler: () => Promise<SchedulerObservedOutcome<T>>,
) {
  const startedAt = new Date();
  const shouldPersistRunningState = trigger !== 'SCHEDULED';
  executingSchedulerJobKeys.add(job.key);

  try {
    if (shouldPersistRunningState) {
      await bestEffortMarkSchedulerJobStart(job, trigger, startedAt);
    }

    const outcome = await handler();
    const status = outcome.status || 'SUCCESS';
    const finishedAt = new Date();
    await bestEffortMarkSchedulerJobFinish({
      job,
      trigger,
      status,
      startedAt,
      finishedAt,
      summary: outcome.summary,
      resultPreview: outcome.resultPreview ?? outcome.value,
      storeRunHistory: shouldStoreSchedulerRunHistory(trigger, status),
    });
    return outcome.value;
  } catch (error) {
    const finishedAt = new Date();
    await bestEffortMarkSchedulerJobFinish({
      job,
      trigger,
      status: 'FAILED',
      startedAt,
      finishedAt,
      error: error instanceof Error ? error.message : String(error),
      storeRunHistory: true,
    });
    throw error;
  } finally {
    executingSchedulerJobKeys.delete(job.key);
  }
}

export async function runObservedSchedulerJob<T>(
  job: SchedulerJobDefinition,
  trigger: SchedulerJobTrigger,
  handler: () => Promise<SchedulerObservedOutcome<T>>,
) {
  if (!shouldSerializeObservedSchedulerJobs) {
    return runObservedSchedulerJobExecution(job, trigger, handler);
  }

  const queuedExecution = observedSchedulerQueue.then(
    () => runObservedSchedulerJobExecution(job, trigger, handler),
    () => runObservedSchedulerJobExecution(job, trigger, handler),
  );

  observedSchedulerQueue = queuedExecution.then(
    () => undefined,
    () => undefined,
  );

  return queuedExecution;
}
