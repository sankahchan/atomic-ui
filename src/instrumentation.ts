export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        // Only import and run cron in Node.js runtime environment
        // This prevents it from running in build/edge environments where not supported
        const cron = await import('node-cron');
        const { checkSubscriptions } = await import('@/server/jobs/notification-worker');

        // Run every hour
        cron.schedule('0 * * * *', async () => {
            console.log('Running subscription check job...');
            await checkSubscriptions();
        });

        console.log('Background jobs registered');
    }
}
