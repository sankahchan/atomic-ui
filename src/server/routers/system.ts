import { router, protectedProcedure } from '../trpc';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Helper to get disk usage of the root partition
 */
async function getDiskUsage() {
    try {
        // Linux/Mac compatible command (df -h /)
        // We use -P for portability (POSIX output format)
        const { stdout } = await execAsync('df -P /');
        const lines = stdout.trim().split('\n');
        if (lines.length < 2) return null;

        // Parse second line: Filesystem 1024-blocks Used Available Capacity Mounted on
        // Example: /dev/sda1 1000 500 500 50% /
        const parts = lines[1].replace(/\s+/g, ' ').split(' ');

        // index 1: total, 2: used, 3: available, 4: capacity %
        // df outputs in 1K blocks by default without -h
        const total = parseInt(parts[1]) * 1024; // Bytes
        const used = parseInt(parts[2]) * 1024;
        const free = parseInt(parts[3]) * 1024;

        return {
            total,
            used,
            free,
            percent: Math.round((used / total) * 100),
        };
    } catch (error) {
        console.error('Failed to get disk usage:', error);
        return null;
    }
}

/**
 * Helper to get CPU usage percentage
 * Returns average load over the last minute as a percentage of total cores
 * Note: This is a rough approximation. For real-time %, we'd need to compare cpu times over an interval.
 */
function getCpuLoad() {
    const cpus = os.cpus();
    const loadAvg = os.loadavg()[0]; // 1 minute load average

    // Normalize load by core count
    // If load is 2.0 on 4 cores, that's 50% utilization (roughly)
    // If load is 4.0 on 4 cores, that's 100%
    const percent = Math.min(100, Math.round((loadAvg / cpus.length) * 100));

    return {
        cores: cpus.length,
        model: cpus[0].model,
        loadAvg,
        percent,
    };
}

export const systemRouter = router({
    /**
     * Get current system statistics
     */
    getStats: protectedProcedure.query(async () => {
        const memTotal = os.totalmem();
        const memFree = os.freemem();
        const memUsed = memTotal - memFree;

        const disk = await getDiskUsage();
        const cpu = getCpuLoad();

        return {
            os: {
                platform: os.platform(),
                release: os.release(),
                uptime: os.uptime(), // seconds
            },
            cpu,
            memory: {
                total: memTotal,
                used: memUsed,
                free: memFree,
                percent: Math.round((memUsed / memTotal) * 100),
            },
            disk: disk || {
                total: 0,
                used: 0,
                free: 0,
                percent: 0,
            },
        };
    }),
    getMyIp: protectedProcedure.query(({ ctx }) => {
        return {
            ip: ctx.clientIp,
        };
    }),
});
