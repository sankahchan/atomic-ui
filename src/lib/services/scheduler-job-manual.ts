import { snapshotTraffic } from '@/lib/services/analytics';
import { checkBandwidthAlerts, formatThresholdCountSummary } from '@/lib/services/bandwidth-alerts';
import { verifyLatestBackups } from '@/lib/services/backup-verification';
import { runAccessKeyDeviceLimitCycle } from '@/lib/services/device-limits';
import { evaluateDynamicKeyAlerts } from '@/lib/services/dynamic-routing-events';
import { checkExpirations } from '@/lib/services/expiration';
import { runHealthChecks } from '@/lib/services/health-check';
import { syncIncidentState } from '@/lib/services/incidents';
import { checkKeyRotations } from '@/lib/services/key-rotation';
import { runScheduledRebalanceCycle } from '@/lib/services/load-balancer';
import { processNotificationQueue } from '@/lib/services/notification-queue';
import { runScheduledReportsCycle } from '@/lib/services/scheduled-reports';
import {
  getSchedulerJobDefinitionByKey,
  isSchedulerJobManualRunSupported,
  runObservedSchedulerJob,
  type SchedulerJobDefinition,
} from '@/lib/services/scheduler-jobs';
import { runServerOutageCycle } from '@/lib/services/server-outage';
import { runTelegramSupportSlaAlertCycle } from '@/lib/services/telegram-support';
import { collectTrafficActivity } from '@/lib/services/traffic-activity';

function getSkippedSummary(result: { skipped: boolean } & Record<string, unknown>) {
  if ('reason' in result && typeof result.reason === 'string' && result.reason.trim().length > 0) {
    return `Skipped: ${result.reason}`;
  }

  return 'Skipped';
}

async function runTrafficSnapshot(definition: SchedulerJobDefinition) {
  return runObservedSchedulerJob(definition, 'MANUAL', async () => {
    const result = await snapshotTraffic();
    return {
      value: result,
      summary: `${result.success} success, ${result.failed} failed`,
      resultPreview: {
        success: result.success,
        failed: result.failed,
        errors: result.errors.length,
      },
    };
  });
}

async function runExpirationCheck(definition: SchedulerJobDefinition) {
  return runObservedSchedulerJob(definition, 'MANUAL', async () => {
    const result = await checkExpirations();
    return {
      value: result,
      summary: `${result.expiredKeys} expired, ${result.depletedKeys} depleted, ${result.archivedKeys} archived`,
      resultPreview: result,
    };
  });
}

async function runBandwidthReview(definition: SchedulerJobDefinition) {
  return runObservedSchedulerJob(definition, 'MANUAL', async () => {
    const result = await checkBandwidthAlerts();
    return {
      value: result,
      summary: `${result.pendingAlertsTotal} pending (${formatThresholdCountSummary(result.pendingAlertsByThreshold)}), ${result.autoDisabled} auto-disabled`,
      resultPreview: {
        pendingAlertsTotal: result.pendingAlertsTotal,
        pendingAlertsByThreshold: result.pendingAlertsByThreshold,
        autoDisabled: result.autoDisabled,
        errors: result.errors.length,
      },
    };
  });
}

async function runDeviceLimits(definition: SchedulerJobDefinition) {
  return runObservedSchedulerJob(definition, 'MANUAL', async () => {
    const result = await runAccessKeyDeviceLimitCycle();
    return {
      value: result,
      summary: `${result.warned} warned, ${result.disabled} disabled, ${result.cleared} cleared`,
      resultPreview: {
        warned: result.warned,
        disabled: result.disabled,
        cleared: result.cleared,
        errors: result.errors.length,
      },
    };
  });
}

async function runHealthCheck(definition: SchedulerJobDefinition) {
  return runObservedSchedulerJob(definition, 'MANUAL', async () => {
    const result = await runHealthChecks();
    await syncIncidentState('scheduler');
    return {
      value: result,
      summary: `${result.up} up, ${result.down} down, ${result.slow} slow`,
      resultPreview: result,
    };
  });
}

async function runTrafficActivity(definition: SchedulerJobDefinition) {
  return runObservedSchedulerJob(definition, 'MANUAL', async () => {
    await collectTrafficActivity();
    return {
      value: null,
      summary: 'Traffic activity collected',
    };
  });
}

async function runDynamicKeyAlerts(definition: SchedulerJobDefinition) {
  return runObservedSchedulerJob(definition, 'MANUAL', async () => {
    await evaluateDynamicKeyAlerts();
    return {
      value: null,
      summary: 'Dynamic key alerts evaluated',
    };
  });
}

async function runKeyRotation(definition: SchedulerJobDefinition) {
  return runObservedSchedulerJob(definition, 'MANUAL', async () => {
    const result = await checkKeyRotations();
    return {
      value: result,
      summary: `${result.rotated} rotated, ${result.skipped} skipped`,
      resultPreview: {
        rotated: result.rotated,
        skipped: result.skipped,
        errors: result.errors.length,
      },
    };
  });
}

async function runNotificationQueue(definition: SchedulerJobDefinition) {
  return runObservedSchedulerJob(definition, 'MANUAL', async () => {
    const result = await processNotificationQueue({ limit: 50 });
    return {
      value: result,
      summary: `${result.delivered} delivered, ${result.rescheduled} rescheduled, ${result.failed} failed`,
      resultPreview: result,
    };
  });
}

async function runBackupVerification(definition: SchedulerJobDefinition) {
  return runObservedSchedulerJob(definition, 'MANUAL', async () => {
    const result = await verifyLatestBackups({ limit: 3, triggeredBy: 'manual' });
    return {
      value: result,
      status: result.length === 0 ? 'SKIPPED' : 'SUCCESS',
      summary:
        result.length === 0
          ? 'No backups to verify'
          : `${result.filter((item) => item.status !== 'FAILED').length} passed, ${result.filter((item) => item.status === 'FAILED').length} failed`,
      resultPreview: result,
    };
  });
}

async function runRebalancePlanner(definition: SchedulerJobDefinition) {
  return runObservedSchedulerJob(definition, 'MANUAL', async () => {
    const result = await runScheduledRebalanceCycle();
    return {
      value: result,
      status: result.skipped ? 'SKIPPED' : 'SUCCESS',
      summary:
        result.skipped
          ? 'Rebalance cycle skipped'
          : `${result.recommendations} recommendations, ${result.autoApplied} auto-applied`,
      resultPreview: result,
    };
  });
}

async function runScheduledReports(definition: SchedulerJobDefinition) {
  return runObservedSchedulerJob(definition, 'MANUAL', async () => {
    const result = await runScheduledReportsCycle();
    return {
      value: result,
      status: result.skipped ? 'SKIPPED' : 'SUCCESS',
      summary: result.skipped ? getSkippedSummary(result) : `Generated ${result.reportName}`,
      resultPreview: result,
    };
  });
}

async function runTelegramSupportSla(definition: SchedulerJobDefinition) {
  return runObservedSchedulerJob(definition, 'MANUAL', async () => {
    const result = await runTelegramSupportSlaAlertCycle();
    return {
      value: result,
      status: result.skipped ? 'SKIPPED' : 'SUCCESS',
      summary: result.skipped ? getSkippedSummary(result) : `${result.alerted} alerted, ${result.errors.length} errors`,
      resultPreview: result,
    };
  });
}

async function runServerOutage(definition: SchedulerJobDefinition) {
  return runObservedSchedulerJob(definition, 'MANUAL', async () => {
    const result = await runServerOutageCycle();
    return {
      value: result,
      summary: `${result.alerted} alerted, ${result.resolved} resolved, ${result.skipped} skipped`,
      resultPreview: result,
    };
  });
}

export async function runManualSchedulerJob(jobKey: string) {
  const definition = getSchedulerJobDefinitionByKey(jobKey);
  if (!definition || !definition.manualRunSupported || !isSchedulerJobManualRunSupported(jobKey)) {
    throw new Error('This scheduler job does not support manual runs.');
  }

  switch (jobKey) {
    case 'traffic_snapshot':
      return runTrafficSnapshot(definition);
    case 'expiration_check':
      return runExpirationCheck(definition);
    case 'bandwidth_review':
      return runBandwidthReview(definition);
    case 'device_limits':
      return runDeviceLimits(definition);
    case 'health_check':
      return runHealthCheck(definition);
    case 'traffic_activity':
      return runTrafficActivity(definition);
    case 'dynamic_key_alerts':
      return runDynamicKeyAlerts(definition);
    case 'key_rotation':
      return runKeyRotation(definition);
    case 'notification_queue':
      return runNotificationQueue(definition);
    case 'backup_verification':
      return runBackupVerification(definition);
    case 'rebalance_planner':
      return runRebalancePlanner(definition);
    case 'scheduled_reports':
      return runScheduledReports(definition);
    case 'telegram_support_sla':
      return runTelegramSupportSla(definition);
    case 'server_outage':
      return runServerOutage(definition);
    default:
      throw new Error('This scheduler job does not support manual runs.');
  }
}
