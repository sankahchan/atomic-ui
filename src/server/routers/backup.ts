import { router, adminProcedure } from '../trpc';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { TRPCError } from '@trpc/server';
import { db } from '@/lib/db';
import { sendTelegramDocument } from '@/lib/telegram';
import { logger } from '@/lib/logger';
import { resolveSqliteDbPath } from '@/lib/sqlite-path';

// Ensure backup directory exists
const BACKUP_DIR = path.join(process.cwd(), 'storage', 'backups');

if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// Helper to get DB path
function getDbPath() {
    return resolveSqliteDbPath();
}

export const backupRouter = router({
    /**
     * List all backups
     */
    list: adminProcedure.query(async () => {
        try {
            if (!fs.existsSync(BACKUP_DIR)) {
                return [];
            }

            const files = fs.readdirSync(BACKUP_DIR);

            const backups = files
                .filter(file => file.endsWith('.db') || file.endsWith('.sqlite') || file.endsWith('.bak'))
                .map(file => {
                    const stats = fs.statSync(path.join(BACKUP_DIR, file));
                    return {
                        filename: file,
                        size: stats.size,
                        createdAt: stats.birthtime,
                    };
                })
                .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

            return backups;
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
    create: adminProcedure.mutation(async () => {
        try {
            const dbPath = getDbPath();

            if (!fs.existsSync(dbPath)) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Database file not found',
                });
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFilename = `backup-${timestamp}.db`;
            const backupPath = path.join(BACKUP_DIR, backupFilename);

            // Copy file
            fs.copyFileSync(dbPath, backupPath);

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
                            ).catch(e => logger.error(`Failed to send backup to ${chatId}:`, e))
                        ));
                    }
                }
            } catch (err) {
                logger.error('Failed to auto-send backup to Telegram:', err);
                // Don't fail the request, just log
            }

            return { success: true, filename: backupFilename };
        } catch (error: any) {
            logger.error('Failed to create backup:', error);
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: error.message || 'Failed to create backup',
            });
        }
    }),

    /**
     * Restore a backup
     */
    restore: adminProcedure
        .input(z.object({ filename: z.string() }))
        .mutation(async ({ input }) => {
            try {
                const backupPath = path.join(BACKUP_DIR, input.filename);
                const dbPath = getDbPath();

                if (!fs.existsSync(backupPath)) {
                    throw new TRPCError({
                        code: 'NOT_FOUND',
                        message: 'Backup file not found',
                    });
                }

                // Create a safety backup of current state before restoring
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const safetyBackup = path.join(BACKUP_DIR, `pre-restore-${timestamp}.db`);
                if (fs.existsSync(dbPath)) {
                    fs.copyFileSync(dbPath, safetyBackup);
                }

                // Restore
                fs.copyFileSync(backupPath, dbPath);

                return { success: true };
            } catch (error: any) {
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
        .mutation(async ({ input }) => {
            try {
                const backupPath = path.join(BACKUP_DIR, input.filename);

                if (fs.existsSync(backupPath)) {
                    fs.unlinkSync(backupPath);
                }

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
