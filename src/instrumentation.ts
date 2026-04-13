
export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.DISABLE_SCHEDULER !== '1') {
        const { initScheduler } = await import('./server/scheduler');
        initScheduler();
    }
}
