import { router, adminProcedure } from '../trpc';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { TRPCError } from '@trpc/server';
import { db } from '@/lib/db';
import { sendTelegramDocument } from '@/lib/services/telegram-runtime';
import { logger } from '@/lib/logger';
import { writeAuditLog } from '@/lib/audit';
import { BACKUP_DIR, verifyBackupFile } from '@/lib/services/backup-verification';
import { createRuntimeBackup } from '@/lib/services/runtime-backup';
import { buildOfflineRestoreCommand } from '@/lib/backup-files';
import { ensureBackupDirectory } from '@/lib/backup-storage';

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
    list: adminProcedure.query(async () => {
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
        .query(async ({ input }) => {
            const items = await db.backupVerification.findMany({
                orderBy: { verifiedAt: 'desc' },
                take: input?.limit ?? 20,
            });

            return items.map((item) => ({
                ...item,
                details: parseVerificationDetails(item.details),
            }));
        }),

    verify: adminProcedure
        .input(z.object({ filename: z.string() }))
        .mutation(async ({ ctx, input }) => {
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
            try {
                const backupPath = path.join(ensureBackupDirectory(), input.filename);

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

                await writeAuditLog({
                    userId: ctx.user.id,
                    ip: ctx.clientIp,
                    action: 'BACKUP_RESTORE_BLOCKED',
                    entity: 'BACKUP',
                    entityId: input.filename,
                    details: {
                        filename: input.filename,
                        verificationStatus: verification.status,
                        restoreCommand: buildOfflineRestoreCommand(input.filename, backupPath),
                    },
                });

                throw new TRPCError({
                    code: 'PRECONDITION_FAILED',
                    message: `Dashboard restore is disabled while the app is running. Stop the service first, then run: ${buildOfflineRestoreCommand(input.filename, backupPath)}`,
                });
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
