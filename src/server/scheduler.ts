
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
import { runHealthChecks, ensureHealthChecks } from '@/lib/services/health-check';

let isSchedulerRunning = false;

export function initScheduler() {
    if (isSchedulerRunning) {
        console.log('⚠️ Scheduler is already running');
        return;
    }

    console.log('⏱️ Initializing Scheduler...');

    // 1. Hourly Traffic Snapshot (At minute 0 of every hour)
    cron.schedule('0 * * * *', async () => {
        console.log('📊 Running scheduled traffic snapshot...');
        const result = await snapshotTraffic();
        console.log(`✅ Snapshot complete: ${result.success} success, ${result.failed} failed`);
        if (result.errors.length > 0) {
            console.error('Errors:', result.errors);
        }
    });

    // 2. Expiration Check (Every 5 minutes)
    cron.schedule('*/5 * * * *', async () => {
        console.log('⏰ Running expiration check...');
        try {
            const result = await checkExpirations();
            console.log(`✅ Expiration check complete: ${result.expiredKeys} expired, ${result.depletedKeys} depleted, ${result.archivedKeys} archived`);
        } catch (error) {
            console.error('❌ Expiration check failed:', error);
        }
    });

    // 3. Health Check (Every 2 minutes)
    cron.schedule('*/2 * * * *', async () => {
        console.log('🏥 Running health checks...');
        try {
            const result = await runHealthChecks();
            console.log(`✅ Health check complete: ${result.up} up, ${result.down} down, ${result.slow} slow`);
        } catch (error) {
            console.error('❌ Health check failed:', error);
        }
    });

    // Run initial checks on startup
    setTimeout(async () => {
        console.log('⏰ Running initial expiration check on startup...');
        try {
            const result = await checkExpirations();
            console.log(`✅ Initial expiration check complete: ${result.expiredKeys} expired, ${result.depletedKeys} depleted, ${result.archivedKeys} archived`);
        } catch (error) {
            console.error('❌ Initial expiration check failed:', error);
        }

        // Ensure health check records exist for all servers
        console.log('🏥 Ensuring health check records exist...');
        try {
            const created = await ensureHealthChecks();
            if (created > 0) {
                console.log(`✅ Created ${created} health check records`);
            }

            // Run initial health check
            const result = await runHealthChecks();
            console.log(`✅ Initial health check: ${result.up} up, ${result.down} down, ${result.slow} slow`);
        } catch (error) {
            console.error('❌ Initial health check failed:', error);
        }
    }, 5000); // Wait 5 seconds for DB to be ready

    isSchedulerRunning = true;
    console.log('✅ Scheduler started successfully');
}
