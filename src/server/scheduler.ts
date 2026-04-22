
/**
 * Application Scheduler
 *
 * Manages periodic background tasks using node-cron.
 * Tasks include:
 * - Traffic usage snapshots (Hourly)
 * - Expiration checks (Every 5 mins)
 * - Health checks (Every 2 mins)
 * - Traffic activity collection (Every minute)
 * - Key rotation checks (Every 15 mins)
 * - Audit log cleanup (Daily)
 * - Backup verification (Daily)
 * - Notification queue processing (Every minute)
 * - Smart rebalancer planning (Every 30 mins)
 * - Scheduled reports (Every 5 mins)
 */

import cron from 'node-cron';
import { snapshotTraffic } from '@/lib/services/analytics';
import { checkExpirations } from '@/lib/services/expiration';
import { checkBandwidthAlerts, formatThresholdCountSummary } from '@/lib/services/bandwidth-alerts';
import { runHealthChecks, ensureHealthChecks } from '@/lib/services/health-check';
import { checkKeyRotations } from '@/lib/services/key-rotation';
import { cleanupOldAuditLogs } from '@/lib/services/audit-log';
import { verifyLatestBackups } from '@/lib/services/backup-verification';
import { processNotificationQueue } from '@/lib/services/notification-queue';
import { runScheduledRebalanceCycle } from '@/lib/services/load-balancer';
import { syncIncidentState } from '@/lib/services/incidents';
import { runScheduledReportsCycle } from '@/lib/services/scheduled-reports';
import { runTelegramDigestCycle } from '@/lib/services/telegram-digest';
import { runTelegramFinanceDigestCycle } from '@/lib/services/telegram-finance';
import { runTelegramAnnouncementCycle } from '@/lib/services/telegram-announcements';
import { runTelegramSalesOrderCycle } from '@/lib/services/telegram-bot';
import {
    runAdminQueueHealthAlertCycle,
    runBackupVerificationFailureAlertCycle,
    runTelegramWebhookHealthAlertCycle,
} from '@/lib/services/monitoring-alerts';
import { runTelegramPremiumRegionAlertCycle } from '@/lib/services/telegram-premium';
import { runTelegramSupportSlaAlertCycle } from '@/lib/services/telegram-support';
import { collectTrafficActivity } from '@/lib/services/traffic-activity';
import { logger } from '@/lib/logger';
import { runAdminLoginIncidentDigestCycle } from '@/lib/services/admin-login-protection';
import { runServerOutageCycle } from '@/lib/services/server-outage';
import { runAccessKeyDeviceLimitCycle } from '@/lib/services/device-limits';
import {
    getSchedulerJobExecutionGate,
    hydratePausedSchedulerJobState,
    runObservedSchedulerJob,
    SCHEDULER_JOB_DEFINITIONS,
    syncSchedulerJobCatalog,
} from '@/lib/services/scheduler-jobs';

let isSchedulerRunning = false;

function getSkippedSummary(result: { skipped: boolean } & Record<string, unknown>) {
    if ('reason' in result && typeof result.reason === 'string' && result.reason.trim().length > 0) {
        return `Skipped: ${result.reason}`;
    }

    return 'Skipped';
}

async function shouldRunTriggeredSchedulerJob(definition: (typeof SCHEDULER_JOB_DEFINITIONS)[keyof typeof SCHEDULER_JOB_DEFINITIONS]) {
    const gate = await getSchedulerJobExecutionGate(definition.key);
    if (!gate.allowed) {
        logger.info(`Scheduler job ${definition.key} skipped: ${gate.summary || 'Paused'}`);
    }
    return gate.allowed;
}

function scheduleManagedJob(
    cronExpression: string,
    definition: (typeof SCHEDULER_JOB_DEFINITIONS)[keyof typeof SCHEDULER_JOB_DEFINITIONS],
    errorMessage: string,
    task: () => Promise<void>,
) {
    cron.schedule(cronExpression, async () => {
        if (!(await shouldRunTriggeredSchedulerJob(definition))) {
            return;
        }

        try {
            await task();
        } catch (error) {
            logger.error(errorMessage, error);
        }
    });
}

async function runStartupManagedJob(
    definition: (typeof SCHEDULER_JOB_DEFINITIONS)[keyof typeof SCHEDULER_JOB_DEFINITIONS],
    errorMessage: string,
    task: () => Promise<void>,
) {
    if (!(await shouldRunTriggeredSchedulerJob(definition))) {
        return;
    }

    try {
        await task();
    } catch (error) {
        logger.error(errorMessage, error);
    }
}

export function initScheduler() {
    if (isSchedulerRunning) {
        logger.verbose('scheduler', 'Scheduler init requested while already running');
        return;
    }

    logger.verbose('scheduler', 'Initializing scheduler');
    void syncSchedulerJobCatalog().catch((error) => {
        logger.error('Scheduler job catalog sync failed', error);
    });
    void hydratePausedSchedulerJobState().catch((error) => {
        logger.error('Paused scheduler job state sync failed', error);
    });

    // 1. Hourly Traffic Snapshot (At minute 0 of every hour)
    scheduleManagedJob('0 * * * *', SCHEDULER_JOB_DEFINITIONS.trafficSnapshot, 'Traffic snapshot failed', async () => {
            await runObservedSchedulerJob(
                SCHEDULER_JOB_DEFINITIONS.trafficSnapshot,
                'SCHEDULED',
                async () => {
                    const result = await snapshotTraffic();
                    if (result.success > 0 || result.failed > 0) {
                        logger.info(`Traffic snapshot complete: ${result.success} success, ${result.failed} failed`);
                    }
                    if (result.errors.length > 0) {
                        logger.warn('Traffic snapshot completed with errors', result.errors);
                    }
                    return {
                        value: result,
                        summary: `${result.success} success, ${result.failed} failed`,
                        resultPreview: {
                            success: result.success,
                            failed: result.failed,
                            errors: result.errors.length,
                        },
                    };
                },
            );
    });

    // 2. Expiration Check (Every 5 minutes)
    scheduleManagedJob('*/5 * * * *', SCHEDULER_JOB_DEFINITIONS.expirationCheck, 'Expiration check failed', async () => {
            const result = await runObservedSchedulerJob(
                SCHEDULER_JOB_DEFINITIONS.expirationCheck,
                'SCHEDULED',
                async () => {
                    const result = await checkExpirations();
                    return {
                        value: result,
                        summary: `${result.expiredKeys} expired, ${result.depletedKeys} depleted, ${result.archivedKeys} archived`,
                        resultPreview: result,
                    };
                },
            );
            if (result.expiredKeys > 0 || result.depletedKeys > 0 || result.archivedKeys > 0) {
                logger.info(`Expiration check complete: ${result.expiredKeys} expired, ${result.depletedKeys} depleted, ${result.archivedKeys} archived`);
            }
    });

    // 3. Bandwidth quota review + auto-disable (Every 5 minutes)
    scheduleManagedJob('*/5 * * * *', SCHEDULER_JOB_DEFINITIONS.bandwidthReview, 'Bandwidth alert check failed', async () => {
            const result = await runObservedSchedulerJob(
                SCHEDULER_JOB_DEFINITIONS.bandwidthReview,
                'SCHEDULED',
                async () => {
                    const result = await checkBandwidthAlerts();
                    return {
                        value: result,
                        summary: `${result.pendingAlertsTotal} pending, ${result.autoDisabled} auto-disabled`,
                        resultPreview: {
                            pendingAlertsTotal: result.pendingAlertsTotal,
                            pendingAlertsByThreshold: result.pendingAlertsByThreshold,
                            autoDisabled: result.autoDisabled,
                            errors: result.errors.length,
                        },
                    };
                },
            );
            if (result.pendingAlertsTotal > 0 || result.autoDisabled > 0) {
                logger.info(
                    `Bandwidth review: ${result.pendingAlertsTotal} pending (${formatThresholdCountSummary(result.pendingAlertsByThreshold)}), ${result.autoDisabled} auto-disabled`,
                );
            }
    });

    scheduleManagedJob('*/5 * * * *', SCHEDULER_JOB_DEFINITIONS.deviceLimits, 'Device limit cycle failed', async () => {
            const result = await runObservedSchedulerJob(
                SCHEDULER_JOB_DEFINITIONS.deviceLimits,
                'SCHEDULED',
                async () => {
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
                },
            );
            if (result.warned > 0 || result.disabled > 0 || result.cleared > 0 || result.errors.length > 0) {
                logger.info(
                    `Device limits: ${result.warned} warned, ${result.disabled} disabled, ${result.cleared} cleared, ${result.errors.length} errors`,
                );
            }
    });

    // 4. Health Check (Every 2 minutes)
    scheduleManagedJob('*/2 * * * *', SCHEDULER_JOB_DEFINITIONS.healthCheck, 'Health check failed', async () => {
            const result = await runObservedSchedulerJob(
                SCHEDULER_JOB_DEFINITIONS.healthCheck,
                'SCHEDULED',
                async () => {
                    const result = await runHealthChecks();
                    await syncIncidentState('scheduler');
                    return {
                        value: result,
                        summary: `${result.up} up, ${result.down} down, ${result.slow} slow`,
                        resultPreview: result,
                    };
                },
            );
            if (result.down > 0 || result.slow > 0) {
                logger.warn(`Health check summary: ${result.up} up, ${result.down} down, ${result.slow} slow`);
            }
    });

    // 5. Traffic activity collection (Every minute)
    scheduleManagedJob('* * * * *', SCHEDULER_JOB_DEFINITIONS.trafficActivity, 'Traffic activity collection failed', async () => {
            await runObservedSchedulerJob(
                SCHEDULER_JOB_DEFINITIONS.trafficActivity,
                'SCHEDULED',
                async () => {
                    await collectTrafficActivity();
                    return {
                        value: null,
                        summary: 'Traffic activity collected',
                    };
                },
            );
    });

    // 6. Dynamic Key Smart Alerts (Every 15 minutes)
    scheduleManagedJob('*/15 * * * *', SCHEDULER_JOB_DEFINITIONS.dynamicKeyAlerts, 'Dynamic key smart alerts check failed', async () => {
            await runObservedSchedulerJob(
                SCHEDULER_JOB_DEFINITIONS.dynamicKeyAlerts,
                'SCHEDULED',
                async () => {
                    const { evaluateDynamicKeyAlerts } = await import('@/lib/services/dynamic-routing-events');
                    await evaluateDynamicKeyAlerts();
                    return {
                        value: null,
                        summary: 'Dynamic key alerts evaluated',
                    };
                },
            );
    });

    // 6. Key Rotation Check (Every 15 minutes)
    scheduleManagedJob('*/15 * * * *', SCHEDULER_JOB_DEFINITIONS.keyRotation, 'Key rotation check failed', async () => {
            const result = await runObservedSchedulerJob(
                SCHEDULER_JOB_DEFINITIONS.keyRotation,
                'SCHEDULED',
                async () => {
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
                },
            );
            if (result.rotated > 0 || result.errors.length > 0) {
                logger.info(`Key rotation: ${result.rotated} rotated, ${result.skipped} skipped, ${result.errors.length} errors`);
            }
    });

    // 7. Audit Log Cleanup (Daily at 03:30)
    scheduleManagedJob('30 3 * * *', SCHEDULER_JOB_DEFINITIONS.auditCleanup, 'Audit log cleanup failed', async () => {
            const result = await runObservedSchedulerJob(
                SCHEDULER_JOB_DEFINITIONS.auditCleanup,
                'SCHEDULED',
                async () => {
                    const result = await cleanupOldAuditLogs({ triggeredBy: 'scheduler' });
                    return {
                        value: result,
                        status: result.cleanupEnabled ? 'SUCCESS' : 'SKIPPED',
                        summary: result.cleanupEnabled
                            ? `${result.deletedCount} entries removed`
                            : 'Cleanup disabled',
                        resultPreview: result,
                    };
                },
            );
            if (!result.cleanupEnabled) {
                return;
            }

            if (result.deletedCount > 0) {
                logger.info(`Audit log cleanup removed ${result.deletedCount} entries`);
            }
    });

    // 8. Notification Queue Processing (Every minute)
    scheduleManagedJob('* * * * *', SCHEDULER_JOB_DEFINITIONS.notificationQueue, 'Notification queue processing failed', async () => {
            const result = await runObservedSchedulerJob(
                SCHEDULER_JOB_DEFINITIONS.notificationQueue,
                'SCHEDULED',
                async () => {
                    const result = await processNotificationQueue({ limit: 50 });
                    return {
                        value: result,
                        summary: `${result.delivered} delivered, ${result.rescheduled} rescheduled, ${result.failed} failed`,
                        resultPreview: result,
                    };
                },
            );
            if (result.claimed > 0) {
                logger.info(`Notification queue: ${result.delivered} delivered, ${result.rescheduled} rescheduled, ${result.failed} failed`);
            }
    });

    // 9. Backup Verification (Daily at 04:00)
    scheduleManagedJob('0 4 * * *', SCHEDULER_JOB_DEFINITIONS.backupVerification, 'Backup verification failed', async () => {
            const result = await runObservedSchedulerJob(
                SCHEDULER_JOB_DEFINITIONS.backupVerification,
                'SCHEDULED',
                async () => {
                    const result = await verifyLatestBackups({ limit: 3, triggeredBy: 'scheduler' });
                    return {
                        value: result,
                        status: result.length === 0 ? 'SKIPPED' : 'SUCCESS',
                        summary: result.length === 0
                            ? 'No backups to verify'
                            : `${result.filter((item) => item.status !== 'FAILED').length} passed, ${result.filter((item) => item.status === 'FAILED').length} failed`,
                        resultPreview: result,
                    };
                },
            );
            if (result.length > 0) {
                const failed = result.filter((item) => item.status === 'FAILED').length;
                logger.info(`Backup verification: ${result.length - failed} passed, ${failed} failed`);
                if (failed > 0) {
                    const alertResult = await runBackupVerificationFailureAlertCycle({ results: result });
                    if (alertResult.alerted > 0 || alertResult.errors.length > 0) {
                        logger.warn(
                            `Backup verification alerts: ${alertResult.failedCount} failed, ${alertResult.alerted} alerted, ${alertResult.suppressed} suppressed, ${alertResult.errors.length} errors`,
                        );
                    }
                }
            }
    });

    // 9b. Telegram webhook health monitoring (Every 15 minutes)
    scheduleManagedJob('*/15 * * * *', SCHEDULER_JOB_DEFINITIONS.telegramWebhookHealth, 'Telegram webhook health check failed', async () => {
            const result = await runObservedSchedulerJob(
                SCHEDULER_JOB_DEFINITIONS.telegramWebhookHealth,
                'SCHEDULED',
                async () => {
                    const result = await runTelegramWebhookHealthAlertCycle();
                    return {
                        value: result,
                        status: result.skipped ? 'SKIPPED' : 'SUCCESS',
                        summary: result.skipped
                            ? getSkippedSummary(result)
                            : result.healthy
                                ? 'Webhook healthy'
                                : `${result.alerted} alerted, ${result.suppressed} suppressed, ${result.errors.length} errors`,
                        resultPreview: result,
                    };
                },
            );
            if (!result.skipped && (!result.healthy || result.errors.length > 0)) {
                logger.warn(
                    `Telegram webhook health: ${result.alerted} alerted, ${result.suppressed} suppressed, ${result.pendingUpdateCount} pending, ${result.errors.length} errors`,
                );
            }
    });

    // 10. Smart Rebalance Planning (Every 30 minutes)
    scheduleManagedJob('*/30 * * * *', SCHEDULER_JOB_DEFINITIONS.rebalancePlanner, 'Scheduled rebalance planner failed', async () => {
            const result = await runObservedSchedulerJob(
                SCHEDULER_JOB_DEFINITIONS.rebalancePlanner,
                'SCHEDULED',
                async () => {
                    const result = await runScheduledRebalanceCycle();
                    return {
                        value: result,
                        status: result.skipped ? 'SKIPPED' : 'SUCCESS',
                        summary: result.skipped
                            ? 'Rebalance cycle skipped'
                            : `${result.recommendations} recommendations, ${result.autoApplied} auto-applied`,
                        resultPreview: result,
                    };
                },
            );
            if (result.skipped) {
                return;
            }

            if (result.recommendations > 0 || result.autoApplied > 0) {
                logger.info(
                    `Rebalance planner: ${result.recommendations} recommendations, ${result.autoApplied} auto-applied, ${result.failedRecommendations} partially failed`,
                );
            }
    });

    // 11. Scheduled report delivery (Every 5 minutes)
    scheduleManagedJob('*/5 * * * *', SCHEDULER_JOB_DEFINITIONS.scheduledReports, 'Scheduled report cycle failed', async () => {
            const result = await runObservedSchedulerJob(
                SCHEDULER_JOB_DEFINITIONS.scheduledReports,
                'SCHEDULED',
                async () => {
                    const result = await runScheduledReportsCycle();
                    return {
                        value: result,
                        status: result.skipped ? 'SKIPPED' : 'SUCCESS',
                        summary: result.skipped
                            ? getSkippedSummary(result)
                            : `Generated ${result.reportName}`,
                        resultPreview: result,
                    };
                },
            );
            if (!result.skipped) {
                logger.info(`Scheduled report generated: ${result.reportName}`);
            }
    });

    // 12. Telegram digest delivery (Every 15 minutes)
    scheduleManagedJob('*/15 * * * *', SCHEDULER_JOB_DEFINITIONS.telegramDigest, 'Telegram digest cycle failed', async () => {
            const result = await runObservedSchedulerJob(
                SCHEDULER_JOB_DEFINITIONS.telegramDigest,
                'SCHEDULED',
                async () => {
                    const result = await runTelegramDigestCycle();
                    return {
                        value: result,
                        status: result.skipped ? 'SKIPPED' : 'SUCCESS',
                        summary: result.skipped
                            ? getSkippedSummary(result)
                            : `Delivered to ${result.adminChats} admin chats`,
                        resultPreview: result,
                    };
                },
            );
            if (!result.skipped) {
                logger.info(`Telegram digest delivered to ${result.adminChats} admin chat(s)`);
            }
    });

    // 12b. Support SLA breach alerts (Every 15 minutes)
    scheduleManagedJob('*/15 * * * *', SCHEDULER_JOB_DEFINITIONS.telegramSupportSla, 'Support SLA alert cycle failed', async () => {
            const result = await runObservedSchedulerJob(
                SCHEDULER_JOB_DEFINITIONS.telegramSupportSla,
                'SCHEDULED',
                async () => {
                    const result = await runTelegramSupportSlaAlertCycle();
                    return {
                        value: result,
                        status: result.skipped ? 'SKIPPED' : 'SUCCESS',
                        summary: result.skipped
                            ? getSkippedSummary(result)
                            : `${result.alerted} alerted, ${result.errors.length} errors`,
                        resultPreview: result,
                    };
                },
            );
            if (!result.skipped && (result.alerted > 0 || result.errors.length > 0)) {
                logger.warn(`Support SLA alerts: ${result.alerted} alerted, ${result.errors.length} errors`);
            }
    });

    // 12c. Admin queue aging monitor (Every 30 minutes)
    scheduleManagedJob('*/30 * * * *', SCHEDULER_JOB_DEFINITIONS.adminQueueHealth, 'Admin queue health cycle failed', async () => {
            const result = await runObservedSchedulerJob(
                SCHEDULER_JOB_DEFINITIONS.adminQueueHealth,
                'SCHEDULED',
                async () => {
                    const result = await runAdminQueueHealthAlertCycle();
                    return {
                        value: result,
                        status: result.skipped ? 'SKIPPED' : 'SUCCESS',
                        summary: result.skipped
                            ? getSkippedSummary(result)
                            : `${result.supportOverdueCount} support overdue, ${result.pendingReviewCount} review pending`,
                        resultPreview: result,
                    };
                },
            );
            if (!result.skipped && (!result.healthy || result.errors.length > 0)) {
                logger.warn(
                    `Admin queue health: ${result.supportOverdueCount} support overdue, ${result.pendingReviewCount} review pending, ${result.unclaimedReviewCount ?? 0} unclaimed, ${result.alerted} alerted, ${result.suppressed} suppressed, ${result.errors.length} errors`,
                );
            }
    });

    // 13. Admin login incident digest delivery (Every 15 minutes)
    scheduleManagedJob('*/15 * * * *', SCHEDULER_JOB_DEFINITIONS.adminLoginDigest, 'Admin login incident digest cycle failed', async () => {
            const result = await runObservedSchedulerJob(
                SCHEDULER_JOB_DEFINITIONS.adminLoginDigest,
                'SCHEDULED',
                async () => {
                    const result = await runAdminLoginIncidentDigestCycle();
                    return {
                        value: result,
                        status: result.skipped ? 'SKIPPED' : 'SUCCESS',
                        summary: result.skipped
                            ? getSkippedSummary(result)
                            : `${result.incidentCount} incidents, ${result.adminChats} admin chats`,
                        resultPreview: result,
                    };
                },
            );
            if (!result.skipped) {
                logger.info(
                    `Admin login incident digest delivered to ${result.adminChats} admin chat(s) for ${result.incidentCount} incident(s)`,
                );
            }
    });

    // 14. Telegram unpaid order reminders / expiry (Every 15 minutes)
    scheduleManagedJob('*/15 * * * *', SCHEDULER_JOB_DEFINITIONS.telegramSalesOrders, 'Telegram sales order cycle failed', async () => {
            const result = await runObservedSchedulerJob(
                SCHEDULER_JOB_DEFINITIONS.telegramSalesOrders,
                'SCHEDULED',
                async () => {
                    const result = await runTelegramSalesOrderCycle();
                    return {
                        value: result,
                        status: result.skipped ? 'SKIPPED' : 'SUCCESS',
                        summary: result.skipped
                            ? getSkippedSummary(result)
                            : `${result.reminded} payment reminders, ${result.expired} expired`,
                        resultPreview: result,
                    };
                },
            );
            if (
                !result.skipped &&
                (
                    result.reminded > 0 ||
                    result.pendingReviewReminded > 0 ||
                    result.rejectedFollowUpReminded > 0 ||
                    result.retryReminded > 0 ||
                    result.trialCouponReminded > 0 ||
                    result.renewalCouponReminded > 0 ||
                    result.premiumUpsellReminded > 0 ||
                    result.winbackCouponReminded > 0 ||
                    result.expiredCoupons > 0 ||
                    result.trialReminded > 0 ||
                    result.premiumRenewalReminded > 0 ||
                    result.premiumExpired > 0 ||
                    result.salesDigestSent ||
                    result.expired > 0 ||
                    result.errors.length > 0
                )
            ) {
                logger.info(
                    `Telegram sales orders: ${result.reminded} payment reminded, ${result.pendingReviewReminded} review reminded, ${result.rejectedFollowUpReminded} rejected follow-up reminded, ${result.retryReminded} retry reminded, ${result.trialCouponReminded} trial coupon reminded, ${result.renewalCouponReminded} renewal coupon reminded, ${result.premiumUpsellReminded} premium upsell reminded, ${result.winbackCouponReminded} winback coupon reminded, ${result.expiredCoupons} coupons expired, ${result.trialReminded} trial reminded, ${result.premiumRenewalReminded} premium renewal reminded, ${result.premiumExpired} premium expired, ${result.expired} expired, ${result.salesDigestSent ? `${result.salesDigestAdminChats} sales digest chat(s)` : '0 sales digest chat(s)'}, ${result.errors.length} errors`,
                );
            }
    });

    // 15. Delayed server outage user alerts (Every 15 minutes)
    scheduleManagedJob('*/15 * * * *', SCHEDULER_JOB_DEFINITIONS.serverOutage, 'Server outage cycle failed', async () => {
            const result = await runObservedSchedulerJob(
                SCHEDULER_JOB_DEFINITIONS.serverOutage,
                'SCHEDULED',
                async () => {
                    const result = await runServerOutageCycle();
                    return {
                        value: result,
                        summary: `${result.alerted} alerted, ${result.resolved} resolved, ${result.skipped} skipped`,
                        resultPreview: result,
                    };
                },
            );
            if (result.alerted > 0 || result.resolved > 0) {
                logger.info(
                    `Server outage cycle: ${result.alerted} user alert(s), ${result.resolved} resolved, ${result.skipped} skipped`,
                );
            }
    });

    // 16. Telegram finance digest delivery (Every 15 minutes)
    scheduleManagedJob('*/15 * * * *', SCHEDULER_JOB_DEFINITIONS.telegramFinanceDigest, 'Telegram finance digest cycle failed', async () => {
            const result = await runObservedSchedulerJob(
                SCHEDULER_JOB_DEFINITIONS.telegramFinanceDigest,
                'SCHEDULED',
                async () => {
                    const result = await runTelegramFinanceDigestCycle();
                    return {
                        value: result,
                        status: result.skipped ? 'SKIPPED' : 'SUCCESS',
                        summary: result.skipped
                            ? getSkippedSummary(result)
                            : `Delivered to ${result.adminChats} admin chats`,
                        resultPreview: result,
                    };
                },
            );
            if (!result.skipped) {
                logger.info(`Telegram finance digest delivered to ${result.adminChats} admin chat(s)`);
            }
    });

    // 17. Scheduled Telegram announcements (Every 5 minutes)
    scheduleManagedJob('*/5 * * * *', SCHEDULER_JOB_DEFINITIONS.telegramAnnouncements, 'Telegram announcement cycle failed', async () => {
            const result = await runObservedSchedulerJob(
                SCHEDULER_JOB_DEFINITIONS.telegramAnnouncements,
                'SCHEDULED',
                async () => {
                    const result = await runTelegramAnnouncementCycle();
                    return {
                        value: result,
                        status: result.skipped ? 'SKIPPED' : 'SUCCESS',
                        summary: result.skipped
                            ? getSkippedSummary(result)
                            : `${result.processed} processed, ${result.sent} sent, ${result.failed} failed`,
                        resultPreview: result,
                    };
                },
            );
            if (!result.skipped) {
                logger.info(`Telegram announcements: ${result.processed} processed, ${result.sent} sent, ${result.failed} failed`);
            }
    });

    // 18. Premium region degradation alerts (Every 15 minutes)
    scheduleManagedJob('*/15 * * * *', SCHEDULER_JOB_DEFINITIONS.telegramPremiumAlerts, 'Premium region alert cycle failed', async () => {
            const result = await runObservedSchedulerJob(
                SCHEDULER_JOB_DEFINITIONS.telegramPremiumAlerts,
                'SCHEDULED',
                async () => {
                    const result = await runTelegramPremiumRegionAlertCycle();
                    return {
                        value: result,
                        status: result.skipped ? 'SKIPPED' : 'SUCCESS',
                        summary: result.skipped
                            ? getSkippedSummary(result)
                            : `${result.alerted} alerted, ${result.recovered} recovered`,
                        resultPreview: result,
                    };
                },
            );
            if (!result.skipped && (result.alerted > 0 || result.fallbackPinned > 0 || result.recovered > 0 || result.errors.length > 0)) {
                logger.info(
                    `Premium region alerts: ${result.alerted} alerted, ${result.fallbackPinned} fallback-pinned, ${result.recovered} recovered, ${result.deduped} deduped, ${result.skippedHealthy} healthy, ${result.skippedPreferences} pref-skipped, ${result.skippedNoDestination} no-destination, ${result.errors.length} errors`,
                );
            }
    });

    // Run initial checks on startup
    setTimeout(async () => {
        logger.verbose('scheduler', 'Running scheduler startup maintenance');
        await runStartupManagedJob(SCHEDULER_JOB_DEFINITIONS.expirationCheck, 'Initial expiration check failed', async () => {
            const result = await runObservedSchedulerJob(
                SCHEDULER_JOB_DEFINITIONS.expirationCheck,
                'STARTUP',
                async () => {
                    const result = await checkExpirations();
                    return {
                        value: result,
                        summary: `${result.expiredKeys} expired, ${result.depletedKeys} depleted, ${result.archivedKeys} archived`,
                        resultPreview: result,
                    };
                },
            );
            if (result.expiredKeys > 0 || result.depletedKeys > 0 || result.archivedKeys > 0) {
                logger.info(`Initial expiration check complete: ${result.expiredKeys} expired, ${result.depletedKeys} depleted, ${result.archivedKeys} archived`);
            }
        });

        await runStartupManagedJob(SCHEDULER_JOB_DEFINITIONS.notificationQueue, 'Initial notification queue processing failed', async () => {
            const result = await runObservedSchedulerJob(
                SCHEDULER_JOB_DEFINITIONS.notificationQueue,
                'STARTUP',
                async () => {
                    const result = await processNotificationQueue({ limit: 25 });
                    return {
                        value: result,
                        summary: `${result.delivered} delivered, ${result.rescheduled} rescheduled, ${result.failed} failed`,
                        resultPreview: result,
                    };
                },
            );
            if (result.claimed > 0) {
                logger.info(`Initial notification queue: ${result.delivered} delivered, ${result.rescheduled} rescheduled, ${result.failed} failed`);
            }
        });

        await runStartupManagedJob(SCHEDULER_JOB_DEFINITIONS.trafficActivity, 'Initial traffic activity collection failed', async () => {
            await runObservedSchedulerJob(
                SCHEDULER_JOB_DEFINITIONS.trafficActivity,
                'STARTUP',
                async () => {
                    await collectTrafficActivity();
                    return {
                        value: null,
                        summary: 'Traffic activity collected',
                    };
                },
            );
        });

        await runStartupManagedJob(SCHEDULER_JOB_DEFINITIONS.deviceLimits, 'Initial device limit cycle failed', async () => {
            const result = await runObservedSchedulerJob(
                SCHEDULER_JOB_DEFINITIONS.deviceLimits,
                'STARTUP',
                async () => {
                    const result = await runAccessKeyDeviceLimitCycle();
                    return {
                        value: result,
                        summary: `${result.warned} warned, ${result.disabled} disabled, ${result.cleared} cleared`,
                        resultPreview: result,
                    };
                },
            );
            if (result.warned > 0 || result.disabled > 0 || result.cleared > 0 || result.errors.length > 0) {
                logger.info(
                    `Initial device limit cycle: ${result.warned} warned, ${result.disabled} disabled, ${result.cleared} cleared, ${result.errors.length} errors`,
                );
            }
        });

        await runStartupManagedJob(SCHEDULER_JOB_DEFINITIONS.telegramSalesOrders, 'Initial Telegram sales order cycle failed', async () => {
            const result = await runObservedSchedulerJob(
                SCHEDULER_JOB_DEFINITIONS.telegramSalesOrders,
                'STARTUP',
                async () => {
                    const result = await runTelegramSalesOrderCycle();
                    return {
                        value: result,
                        status: result.skipped ? 'SKIPPED' : 'SUCCESS',
                        summary: result.skipped
                            ? getSkippedSummary(result)
                            : `${result.reminded} payment reminders, ${result.expired} expired`,
                        resultPreview: result,
                    };
                },
            );
            if (
                !result.skipped &&
                (
                    result.reminded > 0 ||
                    result.pendingReviewReminded > 0 ||
                    result.rejectedFollowUpReminded > 0 ||
                    result.retryReminded > 0 ||
                    result.trialCouponReminded > 0 ||
                    result.renewalCouponReminded > 0 ||
                    result.premiumUpsellReminded > 0 ||
                    result.winbackCouponReminded > 0 ||
                    result.expiredCoupons > 0 ||
                    result.trialReminded > 0 ||
                    result.premiumRenewalReminded > 0 ||
                    result.premiumExpired > 0 ||
                    result.expired > 0 ||
                    result.errors.length > 0
                )
            ) {
                logger.info(
                    `Initial Telegram sales order cycle: ${result.reminded} payment reminded, ${result.pendingReviewReminded} review reminded, ${result.rejectedFollowUpReminded} rejected follow-up reminded, ${result.retryReminded} retry reminded, ${result.trialCouponReminded} trial coupon reminded, ${result.renewalCouponReminded} renewal coupon reminded, ${result.premiumUpsellReminded} premium upsell reminded, ${result.winbackCouponReminded} winback coupon reminded, ${result.expiredCoupons} coupons expired, ${result.trialReminded} trial reminded, ${result.premiumRenewalReminded} premium renewal reminded, ${result.premiumExpired} premium expired, ${result.expired} expired, ${result.errors.length} errors`,
                );
            }
        });

        await runStartupManagedJob(SCHEDULER_JOB_DEFINITIONS.telegramFinanceDigest, 'Initial Telegram finance digest cycle failed', async () => {
            const result = await runObservedSchedulerJob(
                SCHEDULER_JOB_DEFINITIONS.telegramFinanceDigest,
                'STARTUP',
                async () => {
                    const result = await runTelegramFinanceDigestCycle();
                    return {
                        value: result,
                        status: result.skipped ? 'SKIPPED' : 'SUCCESS',
                        summary: result.skipped
                            ? getSkippedSummary(result)
                            : `Delivered to ${result.adminChats} admin chats`,
                        resultPreview: result,
                    };
                },
            );
            if (!result.skipped) {
                logger.info(`Initial Telegram finance digest delivered to ${result.adminChats} admin chat(s)`);
            }
        });

        await runStartupManagedJob(SCHEDULER_JOB_DEFINITIONS.telegramAnnouncements, 'Initial Telegram announcement cycle failed', async () => {
            const result = await runObservedSchedulerJob(
                SCHEDULER_JOB_DEFINITIONS.telegramAnnouncements,
                'STARTUP',
                async () => {
                    const result = await runTelegramAnnouncementCycle();
                    return {
                        value: result,
                        status: result.skipped ? 'SKIPPED' : 'SUCCESS',
                        summary: result.skipped
                            ? getSkippedSummary(result)
                            : `${result.processed} processed, ${result.sent} sent, ${result.failed} failed`,
                        resultPreview: result,
                    };
                },
            );
            if (!result.skipped) {
                logger.info(`Initial Telegram announcement cycle: ${result.processed} processed, ${result.sent} sent, ${result.failed} failed`);
            }
        });

        await runStartupManagedJob(SCHEDULER_JOB_DEFINITIONS.telegramPremiumAlerts, 'Initial premium region alert cycle failed', async () => {
            const result = await runObservedSchedulerJob(
                SCHEDULER_JOB_DEFINITIONS.telegramPremiumAlerts,
                'STARTUP',
                async () => {
                    const result = await runTelegramPremiumRegionAlertCycle();
                    return {
                        value: result,
                        status: result.skipped ? 'SKIPPED' : 'SUCCESS',
                        summary: result.skipped
                            ? getSkippedSummary(result)
                            : `${result.alerted} alerted, ${result.recovered} recovered`,
                        resultPreview: result,
                    };
                },
            );
            if (!result.skipped && (result.alerted > 0 || result.fallbackPinned > 0 || result.recovered > 0 || result.errors.length > 0)) {
                logger.info(
                    `Initial premium region alert cycle: ${result.alerted} alerted, ${result.fallbackPinned} fallback-pinned, ${result.recovered} recovered, ${result.deduped} deduped, ${result.skippedHealthy} healthy, ${result.skippedPreferences} pref-skipped, ${result.skippedNoDestination} no-destination, ${result.errors.length} errors`,
                );
            }
        });

        // Ensure health check records exist for all servers
        await runStartupManagedJob(SCHEDULER_JOB_DEFINITIONS.healthCheck, 'Initial health check failed', async () => {
            const created = await ensureHealthChecks();
            if (created > 0) {
                logger.info(`Created ${created} health check records`);
            }

            // Run initial health check
            const result = await runObservedSchedulerJob(
                SCHEDULER_JOB_DEFINITIONS.healthCheck,
                'STARTUP',
                async () => {
                    const result = await runHealthChecks();
                    return {
                        value: result,
                        summary: `${result.up} up, ${result.down} down, ${result.slow} slow`,
                        resultPreview: {
                            ...result,
                            createdHealthChecks: created,
                        },
                    };
                },
            );
            if (result.down > 0 || result.slow > 0) {
                logger.warn(`Initial health check summary: ${result.up} up, ${result.down} down, ${result.slow} slow`);
            }
        });
    }, 5000); // Wait 5 seconds for DB to be ready

    isSchedulerRunning = true;
    logger.verbose('scheduler', 'Scheduler started successfully');
}
