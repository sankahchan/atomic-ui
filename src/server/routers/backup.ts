import { spawnSync } from 'child_process';
import { router, adminProcedure } from '../trpc';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { TRPCError } from '@trpc/server';
import { db } from '@/lib/db';
import { sendTelegramDocument } from '@/lib/services/telegram-runtime';
import { logger } from '@/lib/logger';
import { writeAuditLog } from '@/lib/audit';
import { verifyBackupFile } from '@/lib/services/backup-verification';
import { createRuntimeBackup } from '@/lib/services/runtime-backup';
import { ensureBackupDirectory, resolveAppRootDir } from '@/lib/backup-storage';
import { hasBackupManageScope, hasRestoreManageScope } from '@/lib/admin-scope';
import {
    createRestoreJobRecord,
    hasActiveRestoreJob,
    listRestoreJobs,
    writeRestoreJob,
} from '@/lib/restore-jobs';

function assertBackupManageScope(scope?: string | null) {
    if (!hasBackupManageScope(scope)) {
        throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Only owner-scoped admins can manage full backups.',
        });
    }
}

function assertRestoreManageScope(scope?: string | null) {
    if (!hasRestoreManageScope(scope)) {
        throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Only owner-scoped admins can restore backups.',
        });
    }
}

function parseVerificationDetails(details: string | null) {
    if (!details) {
        return null;
    }

    try {
        return JSON.parse(details) as Record<string, unknown>;
    } catch {
        return { raw: details };
    }
}

export const backupRouter = router({
    /**
     * List all backups
     */
    list: adminProcedure.query(async ({ ctx }) => {
        assertBackupManageScope(ctx.user.adminScope);

        try {
            const backupDir = ensureBackupDirectory();
            if (!fs.existsSync(backupDir)) {
                return [];
            }

            const files = fs.readdirSync(backupDir);

            const backups = files
                .filter(file => file.endsWith('.db') || file.endsWith('.sqlite') || file.endsWith('.bak') || file.endsWith('.sql') || file.endsWith('.dump'))
                .map(file => {
                    const stats = fs.statSync(path.join(backupDir, file));
                    return {
                        filename: file,
                        size: stats.size,
                        createdAt: stats.birthtime,
                    };
                })
                .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

            const verifications = backups.length > 0
              ? await db.backupVerification.findMany({
                  where: {
                    filename: {
                      in: backups.map((backup) => backup.filename),
                    },
                  },
                  orderBy: {
                    verifiedAt: 'desc',
                  },
                })
              : [];
            const latestVerificationByFilename = new Map<string, (typeof verifications)[number]>();
            for (const verification of verifications) {
              if (!latestVerificationByFilename.has(verification.filename)) {
                latestVerificationByFilename.set(verification.filename, verification);
              }
            }

            return backups.map((backup) => ({
              ...backup,
              latestVerification: (() => {
                const verification = latestVerificationByFilename.get(backup.filename);
                if (!verification) {
                    return null;
                }

                return {
                    ...verification,
                    details: parseVerificationDetails(verification.details),
                };
              })(),
            }));
        } catch (error: any) {
            logger.error('Failed to list backups:', error);
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to list backups',
            });
        }
    }),

    /**
     * Create a new backup
     */
    create: adminProcedure.mutation(async ({ ctx }) => {
        assertBackupManageScope(ctx.user.adminScope);

        try {
            const createdBackup = await createRuntimeBackup(ensureBackupDirectory());
            const backupFilename = createdBackup.filename;
            const backupPath = createdBackup.filePath;

            // Send to Telegram Admins (Fire and forget, or await safely)
            try {
                const settings = await db.settings.findUnique({ where: { key: 'telegram_bot' } });
                if (settings) {
                    const botSettings = JSON.parse(settings.value);
                    const { botToken, isEnabled, adminChatIds } = botSettings;

                    if (isEnabled && botToken && adminChatIds && Array.isArray(adminChatIds) && adminChatIds.length > 0) {
                        const fileBuffer = fs.readFileSync(backupPath);

                        await Promise.all(adminChatIds.map((chatId: string) =>
                            sendTelegramDocument(
                                botToken,
                                chatId,
                                fileBuffer,
                                backupFilename,
                                `Backup created via Dashboard at ${new Date().toLocaleString()}`
                            ).then((sent) => {
                                if (!sent) {
                                    logger.error(`Failed to send backup to ${chatId}: Telegram send returned false`);
                                }
                            }).catch(e => logger.error(`Failed to send backup to ${chatId}:`, e))
                        ));
                    }
                }
            } catch (err) {
                logger.error('Failed to auto-send backup to Telegram:', err);
                // Don't fail the request, just log
            }

            const verification = await verifyBackupFile(backupFilename, {
                userId: ctx.user.id,
                ip: ctx.clientIp,
                triggeredBy: 'create',
                writeAuditEntry: false,
            });

            await writeAuditLog({
                userId: ctx.user.id,
                ip: ctx.clientIp,
                action: 'BACKUP_CREATE',
                entity: 'BACKUP',
                entityId: backupFilename,
                details: {
                    filename: backupFilename,
                    verificationStatus: verification.status,
                    restoreReady: verification.restoreReady,
                },
            });

            return {
                success: true,
                filename: backupFilename,
                engine: createdBackup.engine,
                verification,
            };
        } catch (error: any) {
            if (error instanceof TRPCError) {
                throw error;
            }
            logger.error('Failed to create backup:', error);
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: error.message || 'Failed to create backup',
            });
        }
        }),

    verificationHistory: adminProcedure
        .input(z.object({ limit: z.number().int().min(1).max(100).default(20) }).optional())
        .query(async ({ ctx, input }) => {
            assertBackupManageScope(ctx.user.adminScope);

            const items = await db.backupVerification.findMany({
                orderBy: { verifiedAt: 'desc' },
                take: input?.limit ?? 20,
            });

            return items.map((item) => ({
                ...item,
                details: parseVerificationDetails(item.details),
            }));
        }),

    restoreJobs: adminProcedure
        .input(z.object({ limit: z.number().int().min(1).max(20).default(5) }).optional())
        .query(({ ctx, input }) => {
            assertRestoreManageScope(ctx.user.adminScope);
            return listRestoreJobs(input?.limit ?? 5);
        }),

    verify: adminProcedure
        .input(z.object({ filename: z.string() }))
        .mutation(async ({ ctx, input }) => {
            assertBackupManageScope(ctx.user.adminScope);
            return verifyBackupFile(input.filename, {
                userId: ctx.user.id,
                ip: ctx.clientIp,
                triggeredBy: 'admin',
            });
        }),

    /**
     * Restore a backup
     */
    restore: adminProcedure
        .input(z.object({ filename: z.string() }))
        .mutation(async ({ ctx, input }) => {
            assertRestoreManageScope(ctx.user.adminScope);

            try {
                const backupDir = ensureBackupDirectory();
                const backupPath = path.join(backupDir, input.filename);

                if (!fs.existsSync(backupPath)) {
                    throw new TRPCError({
                        code: 'NOT_FOUND',
                        message: 'Backup file not found',
                    });
                }

                const verification = await verifyBackupFile(input.filename, {
                    userId: ctx.user.id,
                    ip: ctx.clientIp,
                    triggeredBy: 'restore-precheck',
                });

                if (!verification.restoreReady) {
                    throw new TRPCError({
                        code: 'BAD_REQUEST',
                        message: verification.error || 'Backup verification failed. Restore aborted.',
                    });
                }

                if (hasActiveRestoreJob()) {
                    throw new TRPCError({
                        code: 'PRECONDITION_FAILED',
                        message: 'A restore job is already running. Wait for it to finish before scheduling another restore.',
                    });
                }

                const safetyBackup = await createRuntimeBackup(backupDir);
                const appRoot = resolveAppRootDir(process.cwd());
                const restoreJob = createRestoreJobRecord({
                    backupFilename: input.filename,
                    backupPath,
                    requestedByUserId: ctx.user.id,
                    requestedByEmail: ctx.user.email,
                    requestedByIp: ctx.clientIp,
                    safetyBackupFilename: safetyBackup.filename,
                });
                const restoreJobFile = writeRestoreJob(restoreJob, appRoot);
                const runnerScript = path.join(appRoot, 'scripts', 'run-dashboard-restore.js');

                const scheduleResult = spawnSync(
                    'systemd-run',
                    [
                        '--unit',
                        restoreJob.unitName,
                        '--collect',
                        '--on-active=5s',
                        '--property',
                        'Type=oneshot',
                        '--property',
                        `WorkingDirectory=${appRoot}`,
                        '--description',
                        `Atomic-UI restore ${input.filename}`,
                        process.execPath,
                        runnerScript,
                        '--app-root',
                        appRoot,
                        '--job-file',
                        restoreJobFile,
                        '--job-id',
                        restoreJob.jobId,
                        '--backup',
                        backupPath,
                        '--backup-filename',
                        input.filename,
                    ],
                    {
                        encoding: 'utf8',
                    },
                );

                if (scheduleResult.error || scheduleResult.status !== 0) {
                    const errorMessage =
                        (scheduleResult.error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT'
                            ? 'Dashboard restore requires a Linux host with systemd-run. Use the offline restore command on this environment.'
                            :
                        scheduleResult.error?.message ||
                        scheduleResult.stderr?.trim() ||
                        scheduleResult.stdout?.trim() ||
                        'Failed to schedule restore job.';
                    writeRestoreJob({
                        ...restoreJob,
                        status: 'FAILED',
                        completedAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        error: errorMessage,
                    }, appRoot);

                    throw new TRPCError({
                        code: 'INTERNAL_SERVER_ERROR',
                        message: errorMessage,
                    });
                }

                await writeAuditLog({
                    userId: ctx.user.id,
                    ip: ctx.clientIp,
                    action: 'BACKUP_RESTORE_SCHEDULED',
                    entity: 'BACKUP',
                    entityId: input.filename,
                    details: {
                        filename: input.filename,
                        verificationStatus: verification.status,
                        restoreJobId: restoreJob.jobId,
                        restoreUnitName: restoreJob.unitName,
                        safetyBackupFilename: safetyBackup.filename,
                    },
                });

                return {
                    success: true,
                    scheduled: true,
                    filename: input.filename,
                    safetyBackupFilename: safetyBackup.filename,
                    job: restoreJob,
                };
            } catch (error: any) {
                if (error instanceof TRPCError) {
                    throw error;
                }
                logger.error('Failed to restore backup:', error);
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: error.message || 'Failed to restore backup',
                });
            }
        }),

    /**
     * Delete a backup
     */
    delete: adminProcedure
        .input(z.object({ filename: z.string() }))
        .mutation(async ({ ctx, input }) => {
            assertBackupManageScope(ctx.user.adminScope);

            try {
                const backupPath = path.join(ensureBackupDirectory(), input.filename);

                if (fs.existsSync(backupPath)) {
                    fs.unlinkSync(backupPath);
                }

                await writeAuditLog({
                    userId: ctx.user.id,
                    ip: ctx.clientIp,
                    action: 'BACKUP_DELETE',
                    entity: 'BACKUP',
                    entityId: input.filename,
                    details: {
                        filename: input.filename,
                    },
                });

                return { success: true };
            } catch (error: any) {
                logger.error('Failed to delete backup:', error);
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Failed to delete backup',
                });
            }
        }),
});
