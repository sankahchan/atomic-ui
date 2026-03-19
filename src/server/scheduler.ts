
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
import { checkBandwidthAlerts } from '@/lib/services/bandwidth-alerts';
import { runHealthChecks, ensureHealthChecks } from '@/lib/services/health-check';
import { checkKeyRotations } from '@/lib/services/key-rotation';
import { cleanupOldAuditLogs } from '@/lib/services/audit-log';
import { verifyLatestBackups } from '@/lib/services/backup-verification';
import { processNotificationQueue } from '@/lib/services/notification-queue';
import { runScheduledRebalanceCycle } from '@/lib/services/load-balancer';
import { syncIncidentState } from '@/lib/services/incidents';
import { runScheduledReportsCycle } from '@/lib/services/scheduled-reports';
import { runTelegramDigestCycle } from '@/lib/services/telegram-digest';
import { collectTrafficActivity } from '@/lib/services/traffic-activity';
import { logger } from '@/lib/logger';

let isSchedulerRunning = false;

export function initScheduler() {
    if (isSchedulerRunning) {
        logger.verbose('scheduler', 'Scheduler init requested while already running');
        return;
    }

    logger.verbose('scheduler', 'Initializing scheduler');

    // 1. Hourly Traffic Snapshot (At minute 0 of every hour)
    cron.schedule('0 * * * *', async () => {
        const result = await snapshotTraffic();
        if (result.success > 0 || result.failed > 0) {
            logger.info(`Traffic snapshot complete: ${result.success} success, ${result.failed} failed`);
        }
        if (result.errors.length > 0) {
            logger.warn('Traffic snapshot completed with errors', result.errors);
        }
    });

    // 2. Expiration Check (Every 5 minutes)
    cron.schedule('*/5 * * * *', async () => {
        try {
            const result = await checkExpirations();
            if (result.expiredKeys > 0 || result.depletedKeys > 0 || result.archivedKeys > 0) {
                logger.info(`Expiration check complete: ${result.expiredKeys} expired, ${result.depletedKeys} depleted, ${result.archivedKeys} archived`);
            }
        } catch (error) {
            logger.error('Expiration check failed', error);
        }
    });

    // 3. Bandwidth Alert Check (Every 5 minutes)
    cron.schedule('*/5 * * * *', async () => {
        try {
            const result = await checkBandwidthAlerts();
            if (result.alertsSent80 > 0 || result.alertsSent90 > 0 || result.autoDisabled > 0) {
                logger.info(`Bandwidth alerts: ${result.alertsSent80} at 80%, ${result.alertsSent90} at 90%, ${result.autoDisabled} auto-disabled`);
            }
        } catch (error) {
            logger.error('Bandwidth alert check failed', error);
        }
    });

    // 4. Health Check (Every 2 minutes)
    cron.schedule('*/2 * * * *', async () => {
        try {
            const result = await runHealthChecks();
            await syncIncidentState('scheduler');
            if (result.down > 0 || result.slow > 0) {
                logger.warn(`Health check summary: ${result.up} up, ${result.down} down, ${result.slow} slow`);
            }
        } catch (error) {
            logger.error('Health check failed', error);
        }
    });

    // 5. Traffic activity collection (Every minute)
    cron.schedule('* * * * *', async () => {
        try {
            await collectTrafficActivity();
        } catch (error) {
            logger.error('Traffic activity collection failed', error);
        }
    });

    // 6. Key Rotation Check (Every 15 minutes)
    cron.schedule('*/15 * * * *', async () => {
        try {
            const result = await checkKeyRotations();
            if (result.rotated > 0 || result.errors.length > 0) {
                logger.info(`Key rotation: ${result.rotated} rotated, ${result.skipped} skipped, ${result.errors.length} errors`);
            }
        } catch (error) {
            logger.error('Key rotation check failed', error);
        }
    });

    // 7. Audit Log Cleanup (Daily at 03:30)
    cron.schedule('30 3 * * *', async () => {
        try {
            const result = await cleanupOldAuditLogs({ triggeredBy: 'scheduler' });
            if (!result.cleanupEnabled) {
                return;
            }

            if (result.deletedCount > 0) {
                logger.info(`Audit log cleanup removed ${result.deletedCount} entries`);
            }
        } catch (error) {
            logger.error('Audit log cleanup failed', error);
        }
    });

    // 8. Notification Queue Processing (Every minute)
    cron.schedule('* * * * *', async () => {
        try {
            const result = await processNotificationQueue({ limit: 50 });
            if (result.claimed > 0) {
                logger.info(`Notification queue: ${result.delivered} delivered, ${result.rescheduled} rescheduled, ${result.failed} failed`);
            }
        } catch (error) {
            logger.error('Notification queue processing failed', error);
        }
    });

    // 9. Backup Verification (Daily at 04:00)
    cron.schedule('0 4 * * *', async () => {
        try {
            const result = await verifyLatestBackups({ limit: 3, triggeredBy: 'scheduler' });
            if (result.length > 0) {
                const failed = result.filter((item) => item.status === 'FAILED').length;
                logger.info(`Backup verification: ${result.length - failed} passed, ${failed} failed`);
            }
        } catch (error) {
            logger.error('Backup verification failed', error);
        }
    });

    // 10. Smart Rebalance Planning (Every 30 minutes)
    cron.schedule('*/30 * * * *', async () => {
        try {
            const result = await runScheduledRebalanceCycle();
            if (result.skipped) {
                return;
            }

            if (result.recommendations > 0 || result.autoApplied > 0) {
                logger.info(
                    `Rebalance planner: ${result.recommendations} recommendations, ${result.autoApplied} auto-applied, ${result.failedRecommendations} partially failed`,
                );
            }
        } catch (error) {
            logger.error('Scheduled rebalance planner failed', error);
        }
    });

    // 11. Scheduled report delivery (Every 5 minutes)
    cron.schedule('*/5 * * * *', async () => {
        try {
            const result = await runScheduledReportsCycle();
            if (!result.skipped) {
                logger.info(`Scheduled report generated: ${result.reportName}`);
            }
        } catch (error) {
            logger.error('Scheduled report cycle failed', error);
        }
    });

    // 12. Telegram digest delivery (Every 15 minutes)
    cron.schedule('*/15 * * * *', async () => {
        try {
            const result = await runTelegramDigestCycle();
            if (!result.skipped) {
                logger.info(`Telegram digest delivered to ${result.adminChats} admin chat(s)`);
            }
        } catch (error) {
            logger.error('Telegram digest cycle failed', error);
        }
    });

    // Run initial checks on startup
    setTimeout(async () => {
        logger.verbose('scheduler', 'Running scheduler startup maintenance');
        try {
            const result = await checkExpirations();
            if (result.expiredKeys > 0 || result.depletedKeys > 0 || result.archivedKeys > 0) {
                logger.info(`Initial expiration check complete: ${result.expiredKeys} expired, ${result.depletedKeys} depleted, ${result.archivedKeys} archived`);
            }
        } catch (error) {
            logger.error('Initial expiration check failed', error);
        }

        try {
            const result = await processNotificationQueue({ limit: 25 });
            if (result.claimed > 0) {
                logger.info(`Initial notification queue: ${result.delivered} delivered, ${result.rescheduled} rescheduled, ${result.failed} failed`);
            }
        } catch (error) {
            logger.error('Initial notification queue processing failed', error);
        }

        try {
            await collectTrafficActivity();
        } catch (error) {
            logger.error('Initial traffic activity collection failed', error);
        }

        // Ensure health check records exist for all servers
        try {
            const created = await ensureHealthChecks();
            if (created > 0) {
                logger.info(`Created ${created} health check records`);
            }

            // Run initial health check
            const result = await runHealthChecks();
            if (result.down > 0 || result.slow > 0) {
                logger.warn(`Initial health check summary: ${result.up} up, ${result.down} down, ${result.slow} slow`);
            }
        } catch (error) {
            logger.error('Initial health check failed', error);
        }
    }, 5000); // Wait 5 seconds for DB to be ready

    isSchedulerRunning = true;
    logger.verbose('scheduler', 'Scheduler started successfully');
}
