
/**
 * Application Scheduler
 *
 * Manages periodic background tasks using node-cron.
 * Tasks include:
 * - Traffic usage snapshots (Hourly)
 * - Expiration checks (Every 5 mins)
 * - Data limit resets (Daily)
 * - Notification checks (Every 5 mins)
 */

import cron from 'node-cron';
import { snapshotTraffic } from '@/lib/services/analytics';
import { checkExpirations } from '@/lib/services/expiration';
// import { checkNotifications } from '@/lib/services/notifications'; // Future
// import { resetDataLimits } from '@/lib/services/limits'; // Future

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

    // Run expiration check immediately on startup
    setTimeout(async () => {
        console.log('⏰ Running initial expiration check on startup...');
        try {
            const result = await checkExpirations();
            console.log(`✅ Initial expiration check complete: ${result.expiredKeys} expired, ${result.depletedKeys} depleted, ${result.archivedKeys} archived`);
        } catch (error) {
            console.error('❌ Initial expiration check failed:', error);
        }
    }, 5000); // Wait 5 seconds for DB to be ready

    // Future tasks can be added here...
    // cron.schedule('*/5 * * * *', checkNotifications);

    isSchedulerRunning = true;
    console.log('✅ Scheduler started successfully');
}
