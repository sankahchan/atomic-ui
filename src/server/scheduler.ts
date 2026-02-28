
/**
 * Application Scheduler
 *
 * Manages periodic background tasks using node-cron.
 * Tasks include:
 * - Traffic usage snapshots (Hourly)
 * - Expiration checks (Every 5 mins)
 * - Health checks (Every 2 mins)
 * - Data limit resets (Daily)
 * - Notification checks (Every 5 mins)
 */

import cron from 'node-cron';
import { snapshotTraffic } from '@/lib/services/analytics';
import { checkExpirations } from '@/lib/services/expiration';
import { checkBandwidthAlerts } from '@/lib/services/bandwidth-alerts';
import { runHealthChecks, ensureHealthChecks } from '@/lib/services/health-check';
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

    // Run initial checks on startup
    setTimeout(async () => {
        logger.debug('⏰ Running initial expiration check on startup...');
        try {
            const result = await checkExpirations();
            logger.debug(`✅ Initial expiration check complete: ${result.expiredKeys} expired, ${result.depletedKeys} depleted, ${result.archivedKeys} archived`);
        } catch (error) {
            logger.error('❌ Initial expiration check failed:', error);
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
