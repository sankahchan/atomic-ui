import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { router, adminProcedure } from '../trpc';
import { db } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit';
import {
  CONNECTION_SESSION_TIMEOUT_MS,
  getConnectionSessionDurationMinutes,
  isConnectionSessionStale,
  refreshAccessKeySessionCounts,
} from '@/lib/services/session-management';

const sessionStatusSchema = z.enum(['ALL', 'ACTIVE', 'STALE', 'ENDED']);

const listSessionsSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  status: sessionStatusSchema.default('ALL'),
  search: z.string().trim().max(200).optional(),
});

function buildSessionSearchWhere(search?: string) {
  if (!search) {
    return undefined;
  }

  return {
    OR: [
      { accessKey: { name: { contains: search } } },
      { accessKey: { email: { contains: search } } },
      { accessKey: { user: { is: { email: { contains: search } } } } },
      { accessKey: { server: { is: { name: { contains: search } } } } },
    ],
  };
}

export const sessionsRouter = router({
  summary: adminProcedure.query(async () => {
    const now = new Date();
    const staleCutoff = new Date(now.getTime() - CONNECTION_SESSION_TIMEOUT_MS);

    const [activeCount, staleCount, endedCount, activeSessions] = await Promise.all([
      db.connectionSession.count({
        where: {
          isActive: true,
          lastActiveAt: {
            gt: staleCutoff,
          },
        },
      }),
      db.connectionSession.count({
        where: {
          isActive: true,
          lastActiveAt: {
            lte: staleCutoff,
          },
        },
      }),
      db.connectionSession.count({
        where: {
          isActive: false,
        },
      }),
      db.connectionSession.findMany({
        where: {
          isActive: true,
        },
        select: {
          accessKeyId: true,
          bytesUsed: true,
          accessKey: {
            select: {
              userId: true,
            },
          },
        },
      }),
    ]);

    const activeKeyIds = new Set(activeSessions.map((session) => session.accessKeyId));
    const activeUserIds = new Set(
      activeSessions
        .map((session) => session.accessKey.userId)
        .filter((userId): userId is string => Boolean(userId)),
    );

    const totalActiveBytes = activeSessions.reduce((sum, session) => sum + session.bytesUsed, BigInt(0));

    return {
      activeCount,
      staleCount,
      endedCount,
      activeKeys: activeKeyIds.size,
      activeUsers: activeUserIds.size,
      totalActiveBytes: totalActiveBytes.toString(),
      staleThresholdMinutes: Math.round(CONNECTION_SESSION_TIMEOUT_MS / 60000),
    };
  }),
  list: adminProcedure
    .input(listSessionsSchema.optional())
    .query(async ({ input }) => {
      const now = new Date();
      const staleCutoff = new Date(now.getTime() - CONNECTION_SESSION_TIMEOUT_MS);
      const page = input?.page ?? 1;
      const pageSize = input?.pageSize ?? 20;
      const searchWhere = buildSessionSearchWhere(input?.search);

      const baseWhere = {
        ...(searchWhere ?? {}),
        ...(input?.status === 'ACTIVE'
          ? { isActive: true, lastActiveAt: { gt: staleCutoff } }
          : input?.status === 'STALE'
            ? { isActive: true, lastActiveAt: { lte: staleCutoff } }
            : input?.status === 'ENDED'
              ? { isActive: false }
              : {}),
      };

      const [sessions, total] = await Promise.all([
        db.connectionSession.findMany({
          where: baseWhere,
          include: {
            accessKey: {
              select: {
                id: true,
                name: true,
                email: true,
                userId: true,
                user: {
                  select: {
                    id: true,
                    email: true,
                  },
                },
                server: {
                  select: {
                    id: true,
                    name: true,
                    countryCode: true,
                  },
                },
              },
            },
          },
          orderBy: [
            { isActive: 'desc' },
            { lastActiveAt: 'desc' },
          ],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        db.connectionSession.count({
          where: baseWhere,
        }),
      ]);

      return {
        items: sessions.map((session) => ({
          id: session.id,
          accessKeyId: session.accessKeyId,
          accessKeyName: session.accessKey.name,
          accessKeyEmail: session.accessKey.email,
          userId: session.accessKey.user?.id ?? session.accessKey.userId ?? null,
          userEmail: session.accessKey.user?.email ?? null,
          serverId: session.accessKey.server.id,
          serverName: session.accessKey.server.name,
          serverCountryCode: session.accessKey.server.countryCode,
          startedAt: session.startedAt,
          lastActiveAt: session.lastActiveAt,
          endedAt: session.endedAt,
          isActive: session.isActive,
          stale: session.isActive && isConnectionSessionStale(session.lastActiveAt, now),
          endedReason: session.endedReason,
          bytesUsed: session.bytesUsed.toString(),
          durationMinutes: getConnectionSessionDurationMinutes(session, now),
        })),
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      };
    }),
  terminate: adminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const session = await db.connectionSession.findUnique({
        where: { id: input.id },
        include: {
          accessKey: {
            select: {
              id: true,
              name: true,
              server: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      });

      if (!session) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Connection session not found',
        });
      }

      if (!session.isActive) {
        return {
          success: true,
          alreadyClosed: true,
        };
      }

      await db.connectionSession.update({
        where: { id: session.id },
        data: {
          isActive: false,
          endedAt: new Date(),
          endedReason: 'ADMIN_TERMINATED',
        },
      });

      await refreshAccessKeySessionCounts(session.accessKeyId);

      await writeAuditLog({
        userId: ctx.user.id,
        ip: ctx.clientIp,
        action: 'CONNECTION_SESSION_TERMINATE',
        entity: 'ACCESS_KEY',
        entityId: session.accessKey.id,
        details: {
          sessionId: session.id,
          accessKeyName: session.accessKey.name,
          serverId: session.accessKey.server.id,
          serverName: session.accessKey.server.name,
        },
      });

      return {
        success: true,
        alreadyClosed: false,
      };
    }),
  terminateStale: adminProcedure.mutation(async ({ ctx }) => {
    const cutoff = new Date(Date.now() - CONNECTION_SESSION_TIMEOUT_MS);
    const staleSessions = await db.connectionSession.findMany({
      where: {
        isActive: true,
        lastActiveAt: {
          lte: cutoff,
        },
      },
      select: {
        id: true,
        accessKeyId: true,
      },
    });

    if (staleSessions.length === 0) {
      return { success: true, closedCount: 0 };
    }

    await db.connectionSession.updateMany({
      where: {
        id: {
          in: staleSessions.map((session) => session.id),
        },
      },
      data: {
        isActive: false,
        endedAt: new Date(),
        endedReason: 'ADMIN_STALE_CLEANUP',
      },
    });

    const accessKeyIds = Array.from(new Set(staleSessions.map((session) => session.accessKeyId)));
    await Promise.all(accessKeyIds.map((accessKeyId) => refreshAccessKeySessionCounts(accessKeyId)));

    await writeAuditLog({
      userId: ctx.user.id,
      ip: ctx.clientIp,
      action: 'CONNECTION_SESSION_STALE_CLEANUP',
      entity: 'ACCESS_KEY',
      details: {
        closedCount: staleSessions.length,
        accessKeyCount: accessKeyIds.length,
      },
    });

    return {
      success: true,
      closedCount: staleSessions.length,
    };
  }),
});
