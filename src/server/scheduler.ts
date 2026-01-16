
/**
 * Application Scheduler
 * 
 * Manages periodic background tasks using node-cron.
 * Tasks include:
 * - Traffic usage snapshots (Hourly)
 * - Data limit resets (Daily)
 * - Notification checks (Every 5 mins)
 */

import cron from 'node-cron';
import { snapshotTraffic } from '@/lib/services/analytics';
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

    // Future tasks can be added here...
    // cron.schedule('*/5 * * * *', checkNotifications);

    isSchedulerRunning = true;
    console.log('✅ Scheduler started successfully');
}
