/**
 * Archived Keys Router
 *
 * Handles operations for archived (expired/deleted/depleted) access keys.
 * Archived keys are stored for 3 months before automatic permanent deletion.
 */

import { z } from 'zod';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { db } from '@/lib/db';
import { TRPCError } from '@trpc/server';

export const archivedKeysRouter = router({
  /**
   * List all archived keys with filtering and pagination.
   */
  list: protectedProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
        reason: z.enum(['ALL', 'EXPIRED', 'DEPLETED', 'DELETED', 'DISABLED']).default('ALL'),
        search: z.string().optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      const { page = 1, limit = 20, reason = 'ALL', search } = input || {};
      const skip = (page - 1) * limit;

      const where: Record<string, unknown> = {};

      if (reason !== 'ALL') {
        where.archiveReason = reason;
      }

      if (search) {
        where.OR = [
          { name: { contains: search } },
          { email: { contains: search } },
          { serverName: { contains: search } },
        ];
      }

      const [keys, total] = await Promise.all([
        db.archivedKey.findMany({
          where,
          orderBy: { archivedAt: 'desc' },
          skip,
          take: limit,
        }),
        db.archivedKey.count({ where }),
      ]);

      return {
        keys: keys.map(key => ({
          ...key,
          usedBytes: key.usedBytes.toString(),
          dataLimitBytes: key.dataLimitBytes?.toString() || null,
        })),
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    }),

  /**
   * Get statistics for archived keys.
   */
  getStats: protectedProcedure.query(async () => {
    const [total, expired, depleted, deleted, disabled] = await Promise.all([
      db.archivedKey.count(),
      db.archivedKey.count({ where: { archiveReason: 'EXPIRED' } }),
      db.archivedKey.count({ where: { archiveReason: 'DEPLETED' } }),
      db.archivedKey.count({ where: { archiveReason: 'DELETED' } }),
      db.archivedKey.count({ where: { archiveReason: 'DISABLED' } }),
    ]);

    // Get total data used by archived keys
    const usageResult = await db.archivedKey.aggregate({
      _sum: { usedBytes: true },
    });

    return {
      total,
      expired,
      depleted,
      deleted,
      disabled,
      totalUsedBytes: usageResult._sum.usedBytes?.toString() || '0',
    };
  }),

  /**
   * Permanently delete an archived key.
   */
  permanentDelete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const key = await db.archivedKey.findUnique({
        where: { id: input.id },
      });

      if (!key) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Archived key not found',
        });
      }

      await db.archivedKey.delete({
        where: { id: input.id },
      });

      return { success: true };
    }),

  /**
   * Permanently delete multiple archived keys.
   */
  permanentDeleteMany: adminProcedure
    .input(z.object({ ids: z.array(z.string()) }))
    .mutation(async ({ input }) => {
      const result = await db.archivedKey.deleteMany({
        where: { id: { in: input.ids } },
      });

      return { deleted: result.count };
    }),

  /**
   * Clean up old archived keys (older than 3 months).
   * This should be called periodically by a cron job.
   */
  cleanupOld: adminProcedure.mutation(async () => {
    const now = new Date();

    const result = await db.archivedKey.deleteMany({
      where: {
        deleteAfter: { lte: now },
      },
    });

    return { deleted: result.count };
  }),

  /**
   * Export archived keys data for CSV/Excel.
   */
  exportData: protectedProcedure
    .input(
      z.object({
        reason: z.enum(['ALL', 'EXPIRED', 'DEPLETED', 'DELETED', 'DISABLED']).default('ALL'),
      }).optional()
    )
    .query(async ({ input }) => {
      const { reason = 'ALL' } = input || {};

      const where: Record<string, unknown> = {};
      if (reason !== 'ALL') {
        where.archiveReason = reason;
      }

      const keys = await db.archivedKey.findMany({
        where,
        orderBy: { archivedAt: 'desc' },
      });

      return keys.map(key => ({
        id: key.id,
        name: key.name,
        email: key.email || '',
        telegramId: key.telegramId || '',
        serverName: key.serverName,
        serverLocation: key.serverLocation || '',
        usedBytes: key.usedBytes.toString(),
        dataLimitBytes: key.dataLimitBytes?.toString() || '',
        archiveReason: key.archiveReason,
        originalStatus: key.originalStatus,
        expiresAt: key.expiresAt?.toISOString() || '',
        firstUsedAt: key.firstUsedAt?.toISOString() || '',
        lastUsedAt: key.lastUsedAt?.toISOString() || '',
        createdAt: key.createdAt.toISOString(),
        archivedAt: key.archivedAt.toISOString(),
        deleteAfter: key.deleteAfter.toISOString(),
      }));
    }),
});
