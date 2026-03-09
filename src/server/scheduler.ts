
/**
 * Application Scheduler
 *
 * Manages periodic background tasks using node-cron.
 * Tasks include:
 * - Traffic usage snapshots (Hourly)
 * - Expiration checks (Every 5 mins)
 * - Health checks (Every 2 mins)
 * - Key rotation checks (Every 15 mins)
 * - Audit log cleanup (Daily)
 * - Backup verification (Daily)
 * - Notification queue processing (Every minute)
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
import { runScheduledReportsCycle } from '@/lib/services/scheduled-reports';
import { logger } from '@/lib/logger';

let isSchedulerRunning = false;

export function initScheduler() {
    if (isSchedulerRunning) {
        logger.info('⚠️ Scheduler is already running');
        return;
    }

    logger.info('⏱️ Initializing Scheduler...');

    // 1. Hourly Traffic Snapshot (At minute 0 of every hour)
    cron.schedule('0 * * * *', async () => {
        logger.debug('📊 Running scheduled traffic snapshot...');
        const result = await snapshotTraffic();
        logger.debug(`✅ Snapshot complete: ${result.success} success, ${result.failed} failed`);
        if (result.errors.length > 0) {
            logger.error('Errors:', result.errors);
        }
    });

    // 2. Expiration Check (Every 5 minutes)
    cron.schedule('*/5 * * * *', async () => {
        logger.debug('⏰ Running expiration check...');
        try {
            const result = await checkExpirations();
            logger.debug(`✅ Expiration check complete: ${result.expiredKeys} expired, ${result.depletedKeys} depleted, ${result.archivedKeys} archived`);
        } catch (error) {
            logger.error('❌ Expiration check failed:', error);
        }
    });

    // 3. Bandwidth Alert Check (Every 5 minutes)
    cron.schedule('*/5 * * * *', async () => {
        logger.debug('⚠️ Running bandwidth alert check...');
        try {
            const result = await checkBandwidthAlerts();
            if (result.alertsSent80 > 0 || result.alertsSent90 > 0 || result.autoDisabled > 0) {
                logger.info(`⚠️ Bandwidth alerts: ${result.alertsSent80} at 80%, ${result.alertsSent90} at 90%, ${result.autoDisabled} auto-disabled`);
            }
        } catch (error) {
            logger.error('❌ Bandwidth alert check failed:', error);
        }
    });

    // 4. Health Check (Every 2 minutes)
    cron.schedule('*/2 * * * *', async () => {
        logger.debug('🏥 Running health checks...');
        try {
            const result = await runHealthChecks();
            logger.debug(`✅ Health check complete: ${result.up} up, ${result.down} down, ${result.slow} slow`);
        } catch (error) {
            logger.error('❌ Health check failed:', error);
        }
    });

    // 5. Key Rotation Check (Every 15 minutes)
    cron.schedule('*/15 * * * *', async () => {
        logger.debug('🔄 Running key rotation check...');
        try {
            const result = await checkKeyRotations();
            if (result.rotated > 0 || result.errors.length > 0) {
                logger.info(`🔄 Key rotation: ${result.rotated} rotated, ${result.skipped} skipped, ${result.errors.length} errors`);
            }
        } catch (error) {
            logger.error('❌ Key rotation check failed:', error);
        }
    });

    // 6. Audit Log Cleanup (Daily at 03:30)
    cron.schedule('30 3 * * *', async () => {
        logger.debug('🧹 Running audit log cleanup...');
        try {
            const result = await cleanupOldAuditLogs({ triggeredBy: 'scheduler' });
            if (!result.cleanupEnabled) {
                logger.debug('ℹ️ Audit log cleanup skipped because retention is disabled');
                return;
            }

            if (result.deletedCount > 0) {
                logger.info(`🧹 Audit log cleanup removed ${result.deletedCount} entries`);
            }
        } catch (error) {
            logger.error('❌ Audit log cleanup failed:', error);
        }
    });

    // 7. Notification Queue Processing (Every minute)
    cron.schedule('* * * * *', async () => {
        logger.debug('📨 Processing notification queue...');
        try {
            const result = await processNotificationQueue({ limit: 50 });
            if (result.claimed > 0) {
                logger.info(`📨 Notification queue: ${result.delivered} delivered, ${result.rescheduled} rescheduled, ${result.failed} failed`);
            }
        } catch (error) {
            logger.error('❌ Notification queue processing failed:', error);
        }
    });

    // 8. Backup Verification (Daily at 04:00)
    cron.schedule('0 4 * * *', async () => {
        logger.debug('🧪 Running scheduled backup verification...');
        try {
            const result = await verifyLatestBackups({ limit: 3, triggeredBy: 'scheduler' });
            if (result.length > 0) {
                const failed = result.filter((item) => item.status === 'FAILED').length;
                logger.info(`🧪 Backup verification: ${result.length - failed} passed, ${failed} failed`);
            }
        } catch (error) {
            logger.error('❌ Backup verification failed:', error);
        }
    });

    // 9. Scheduled report delivery (Every 5 minutes)
    cron.schedule('*/5 * * * *', async () => {
        logger.debug('🗓️ Running scheduled reports...');
        try {
            const result = await runScheduledReportsCycle();
            if (!result.skipped) {
                logger.info(`🗓️ Scheduled report generated: ${result.reportName}`);
            }
        } catch (error) {
            logger.error('❌ Scheduled report cycle failed:', error);
        }
    });

    // Run initial checks on startup
    setTimeout(async () => {
        logger.debug('⏰ Running initial expiration check on startup...');
        try {
            const result = await checkExpirations();
            logger.debug(`✅ Initial expiration check complete: ${result.expiredKeys} expired, ${result.depletedKeys} depleted, ${result.archivedKeys} archived`);
        } catch (error) {
            logger.error('❌ Initial expiration check failed:', error);
        }

        logger.debug('📨 Processing initial notification queue on startup...');
        try {
            const result = await processNotificationQueue({ limit: 25 });
            if (result.claimed > 0) {
                logger.debug(`✅ Initial notification queue: ${result.delivered} delivered, ${result.rescheduled} rescheduled, ${result.failed} failed`);
            }
        } catch (error) {
            logger.error('❌ Initial notification queue processing failed:', error);
        }

        // Ensure health check records exist for all servers
        logger.debug('🏥 Ensuring health check records exist...');
        try {
            const created = await ensureHealthChecks();
            if (created > 0) {
                logger.debug(`✅ Created ${created} health check records`);
            }

            // Run initial health check
            const result = await runHealthChecks();
            logger.debug(`✅ Initial health check: ${result.up} up, ${result.down} down, ${result.slow} slow`);
        } catch (error) {
            logger.error('❌ Initial health check failed:', error);
        }
    }, 5000); // Wait 5 seconds for DB to be ready

    isSchedulerRunning = true;
    logger.info('✅ Scheduler started successfully');
}
