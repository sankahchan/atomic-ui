export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        // Only import and run cron in Node.js runtime environment
        // This prevents it from running in build/edge environments where not supported
        const cron = await import('node-cron');
        const { checkSubscriptions } = await import('@/server/jobs/notification-worker');
        const { checkPeriodicLimits } = await import('@/server/jobs/limit-reset');

        // Run every hour
        cron.schedule('0 * * * *', async () => {
            console.log('Running background jobs...');
            await Promise.all([
                checkSubscriptions(),
                checkPeriodicLimits()
            ]);
        });

        console.log('Background jobs registered');
    }
}
