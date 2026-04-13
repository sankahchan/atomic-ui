import { router, protectedProcedure, adminProcedure } from '../trpc';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { db } from '@/lib/db';
import {
    getExecutingSchedulerJobKeys,
    isSchedulerJobManualRunSupported,
    isSchedulerJobExecuting,
    syncSchedulerJobCatalog,
} from '@/lib/services/scheduler-jobs';
import { runManualSchedulerJob } from '@/lib/services/scheduler-job-manual';
import { writeAuditLog } from '@/lib/audit';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

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
    getStats: adminProcedure.query(async () => {
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
    getSchedulerJobs: adminProcedure.query(async () => {
        await syncSchedulerJobCatalog();

        const jobs = await db.schedulerJob.findMany({
            orderBy: [{ category: 'asc' }, { name: 'asc' }],
            include: {
                runs: {
                    orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }],
                    take: 6,
                },
            },
        });

        const executingKeys = new Set(getExecutingSchedulerJobKeys());
        const normalizedJobs = jobs.map((job) => ({
            ...job,
            lastStatus: executingKeys.has(job.key) ? 'RUNNING' : job.lastStatus,
            manualRunSupported: isSchedulerJobManualRunSupported(job.key),
        }));

        const totals = {
            jobs: normalizedJobs.length,
            running: normalizedJobs.filter((job) => job.lastStatus === 'RUNNING').length,
            failed: normalizedJobs.filter((job) => job.lastStatus === 'FAILED').length,
            skipped: normalizedJobs.filter((job) => job.lastStatus === 'SKIPPED').length,
            healthy: normalizedJobs.filter((job) => ['SUCCESS', 'IDLE'].includes(job.lastStatus)).length,
        };

        return {
            totals,
            jobs: normalizedJobs,
        };
    }),
    runSchedulerJob: adminProcedure
        .input(
            z.object({
                jobKey: z.string().trim().min(1),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            await syncSchedulerJobCatalog();

            if (!isSchedulerJobManualRunSupported(input.jobKey)) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'This scheduler job cannot be triggered manually.',
                });
            }

            const existingJob = await db.schedulerJob.findUnique({
                where: { key: input.jobKey },
                select: {
                    key: true,
                    name: true,
                    lastStatus: true,
                },
            });

            if (existingJob?.lastStatus === 'RUNNING' || isSchedulerJobExecuting(input.jobKey)) {
                throw new TRPCError({
                    code: 'CONFLICT',
                    message: 'This scheduler job is already running.',
                });
            }

            await writeAuditLog({
                userId: ctx.user.id,
                ip: ctx.clientIp,
                action: 'SCHEDULER_JOB_RUN_MANUAL',
                entity: 'SCHEDULER_JOB',
                entityId: input.jobKey,
                details: {
                    jobKey: input.jobKey,
                    jobName: existingJob?.name || input.jobKey,
                },
            });

            await runManualSchedulerJob(input.jobKey);

            const job = await db.schedulerJob.findUnique({
                where: { key: input.jobKey },
                include: {
                    runs: {
                        orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }],
                        take: 6,
                    },
                },
            });

            return {
                job: job
                    ? {
                        ...job,
                        manualRunSupported: isSchedulerJobManualRunSupported(job.key),
                    }
                    : null,
            };
        }),
    getMyIp: protectedProcedure.query(({ ctx }) => {
        return {
            ip: ctx.clientIp,
        };
    }),
});
