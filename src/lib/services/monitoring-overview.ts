import { db } from '@/lib/db';
import { getMonitoringSettings } from '@/lib/services/monitoring-config';
import {
  collectAdminQueueHealthSnapshot,
  collectTelegramWebhookMonitorSnapshot,
  MONITOR_ADMIN_QUEUE_HEALTH_EVENT_PREFIX,
  MONITOR_BACKUP_VERIFICATION_FAILED_EVENT_PREFIX,
  MONITOR_TELEGRAM_WEBHOOK_HEALTH_EVENT_PREFIX,
} from '@/lib/services/monitoring-alerts';

type MonitoringSchedulerState = {
  key: string;
  name: string;
  cadenceLabel: string | null;
  lastStatus: string;
  lastFinishedAt: Date | null;
  lastSummary: string | null;
  nextRunAt: Date | null;
  isPaused: boolean;
};

type MonitoringAlertHistory = {
  lastAlertAt: Date | null;
};

export type MonitoringOverview = {
  settings: Awaited<ReturnType<typeof getMonitoringSettings>>;
  backupVerification: {
    status: 'healthy' | 'error' | 'unknown';
    latestVerifiedAt: Date | null;
    latestRecords: Array<{
      id: string;
      filename: string;
      status: string;
      restoreReady: boolean;
      error: string | null;
      verifiedAt: Date;
    }>;
    failedCount: number;
    lastAlertAt: Date | null;
    job: MonitoringSchedulerState | null;
  };
  telegramWebhook: {
    status: 'healthy' | 'error' | 'warning' | 'not_configured';
    configured: boolean;
    alertsConfigured: boolean;
    adminChatCount: number;
    expectedWebhookUrl: string | null;
    currentWebhookUrl: string | null;
    issueCode: string | null;
    summary: string | null;
    pendingUpdateCount: number;
    lastErrorMessage: string | null;
    lastErrorAt: Date | null;
    backlogThreshold: number;
    lastAlertAt: Date | null;
    job: MonitoringSchedulerState | null;
  };
  adminQueue: {
    status: 'healthy' | 'warning';
    supportOverdueCount: number;
    oldestSupportOverdueMinutes: number | null;
    supportThreadCodes: string[];
    pendingReviewCount: number;
    unclaimedReviewCount: number;
    oldestReviewAgeMinutes: number | null;
    reviewOrderCodes: string[];
    reviewThresholdHours: number;
    lastAlertAt: Date | null;
    job: MonitoringSchedulerState | null;
  };
};

async function getLatestMonitoringAlert(prefix: string): Promise<MonitoringAlertHistory> {
  const record = await db.notificationLog.findFirst({
    where: {
      event: {
        startsWith: prefix,
      },
      status: 'SUCCESS',
    },
    orderBy: { sentAt: 'desc' },
    select: { sentAt: true },
  });

  return {
    lastAlertAt: record?.sentAt || null,
  };
}

function mapSchedulerState(
  records: Array<{
    key: string;
    name: string;
    cadenceLabel: string | null;
    lastStatus: string;
    lastFinishedAt: Date | null;
    lastSummary: string | null;
    nextRunAt: Date | null;
    isPaused: boolean;
  }>,
  key: string,
): MonitoringSchedulerState | null {
  const record = records.find((item) => item.key === key);
  if (!record) {
    return null;
  }

  return {
    key: record.key,
    name: record.name,
    cadenceLabel: record.cadenceLabel,
    lastStatus: record.lastStatus,
    lastFinishedAt: record.lastFinishedAt,
    lastSummary: record.lastSummary,
    nextRunAt: record.nextRunAt,
    isPaused: record.isPaused,
  };
}

export async function getMonitoringOverview(): Promise<MonitoringOverview> {
  const settings = await getMonitoringSettings();

  const [
    latestBackupRecords,
    backupAlertHistory,
    webhookAlertHistory,
    queueAlertHistory,
    schedulerStates,
    telegramWebhookSnapshot,
    adminQueueSnapshot,
  ] = await Promise.all([
    db.backupVerification.findMany({
      orderBy: { verifiedAt: 'desc' },
      take: 3,
      select: {
        id: true,
        filename: true,
        status: true,
        restoreReady: true,
        error: true,
        verifiedAt: true,
      },
    }),
    getLatestMonitoringAlert(MONITOR_BACKUP_VERIFICATION_FAILED_EVENT_PREFIX),
    getLatestMonitoringAlert(MONITOR_TELEGRAM_WEBHOOK_HEALTH_EVENT_PREFIX),
    getLatestMonitoringAlert(MONITOR_ADMIN_QUEUE_HEALTH_EVENT_PREFIX),
    db.schedulerJob.findMany({
      where: {
        key: {
          in: ['backup_verification', 'telegram_webhook_health', 'admin_queue_health'],
        },
      },
      select: {
        key: true,
        name: true,
        cadenceLabel: true,
        lastStatus: true,
        lastFinishedAt: true,
        lastSummary: true,
        nextRunAt: true,
        isPaused: true,
      },
    }),
    collectTelegramWebhookMonitorSnapshot({ settings }),
    collectAdminQueueHealthSnapshot({ settings }),
  ]);

  const backupFailedCount = latestBackupRecords.filter((item) => item.status === 'FAILED').length;
  const backupStatus: MonitoringOverview['backupVerification']['status'] =
    latestBackupRecords.length === 0 ? 'unknown' : backupFailedCount > 0 ? 'error' : 'healthy';

  const webhookStatus: MonitoringOverview['telegramWebhook']['status'] =
    !telegramWebhookSnapshot.configured
      ? 'not_configured'
      : !telegramWebhookSnapshot.issue || telegramWebhookSnapshot.issue.healthy
        ? (telegramWebhookSnapshot.alertsConfigured ? 'healthy' : 'warning')
        : 'error';

  return {
    settings,
    backupVerification: {
      status: backupStatus,
      latestVerifiedAt: latestBackupRecords[0]?.verifiedAt || null,
      latestRecords: latestBackupRecords,
      failedCount: backupFailedCount,
      lastAlertAt: backupAlertHistory.lastAlertAt,
      job: mapSchedulerState(schedulerStates, 'backup_verification'),
    },
    telegramWebhook: {
      status: webhookStatus,
      configured: telegramWebhookSnapshot.configured,
      alertsConfigured: telegramWebhookSnapshot.alertsConfigured,
      adminChatCount: telegramWebhookSnapshot.adminChatCount,
      expectedWebhookUrl: telegramWebhookSnapshot.expectedWebhookUrl,
      currentWebhookUrl: telegramWebhookSnapshot.issue?.currentWebhookUrl || null,
      issueCode: telegramWebhookSnapshot.issue?.issueCode || null,
      summary: telegramWebhookSnapshot.issue?.summary || null,
      pendingUpdateCount: telegramWebhookSnapshot.issue?.pendingUpdateCount || 0,
      lastErrorMessage: telegramWebhookSnapshot.issue?.lastErrorMessage || null,
      lastErrorAt: telegramWebhookSnapshot.issue?.lastErrorAt || null,
      backlogThreshold: telegramWebhookSnapshot.backlogThreshold,
      lastAlertAt: webhookAlertHistory.lastAlertAt,
      job: mapSchedulerState(schedulerStates, 'telegram_webhook_health'),
    },
    adminQueue: {
      status: adminQueueSnapshot.healthy ? 'healthy' : 'warning',
      supportOverdueCount: adminQueueSnapshot.supportOverdueCount,
      oldestSupportOverdueMinutes: adminQueueSnapshot.oldestSupportOverdueMinutes,
      supportThreadCodes: adminQueueSnapshot.supportThreadCodes,
      pendingReviewCount: adminQueueSnapshot.pendingReviewCount,
      unclaimedReviewCount: adminQueueSnapshot.unclaimedReviewCount,
      oldestReviewAgeMinutes: adminQueueSnapshot.oldestReviewAgeMinutes,
      reviewOrderCodes: adminQueueSnapshot.reviewOrderCodes,
      reviewThresholdHours: adminQueueSnapshot.reviewThresholdHours,
      lastAlertAt: queueAlertHistory.lastAlertAt,
      job: mapSchedulerState(schedulerStates, 'admin_queue_health'),
    },
  };
}
