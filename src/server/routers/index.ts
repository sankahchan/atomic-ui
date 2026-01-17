/**
 * Root Router
 * 
 * This file combines all the individual routers into a single root router
 * that is exported for use by the tRPC adapter. Each sub-router handles
 * a specific domain of the application.
 * 
 * The router structure mirrors the application's feature organization:
 * - auth: Login, logout, session management
 * - servers: Outline server CRUD operations
 * - keys: Access key management
 * - tags: Server tagging system
 * - health: Server health monitoring
 * - notifications: Alert configuration
 * - settings: Application settings
 * - dashboard: Statistics and overview data
 */

import { router, publicProcedure, protectedProcedure, adminProcedure } from '../trpc';
import { serversRouter } from './servers';
import { keysRouter } from './keys';
import { dynamicKeysRouter } from './dynamic-keys';
import { telegramBotRouter } from './telegram-bot';
import { archivedKeysRouter } from './archived-keys';
import { systemRouter } from './system';
import { backupRouter } from './backup';
import { analyticsRouter } from './analytics';
import { provisionRouter } from './provision';
import { usersRouter } from './users';
import { z } from 'zod';
import { db } from '@/lib/db';
import { TRPCError } from '@trpc/server';
import {
  authenticateUser,
  createSession,
  setSessionCookie,
  clearSessionCookie,
  getCurrentUser,
  hashPassword,
  invalidateAllUserSessions,
  invalidateSession,
  getSessionToken,
} from '@/lib/auth';

/**
 * Auth Router
 * 
 * Handles user authentication including login, logout, and session management.
 * Login creates a JWT token stored in an HTTP-only cookie for security.
 */
const authRouter = router({
  /**
   * Login with email and password.
   * 
   * On success, creates a session and sets the authentication cookie.
   * Returns the authenticated user's public information.
   */
  login: publicProcedure
    .input(
      z.object({
        email: z.string().min(1),
        password: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      const user = await authenticateUser(input.email, input.password);

      if (!user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid email or password',
        });
      }

      // Create session and set cookie
      const token = await createSession(user.id, user.email, user.role);
      await setSessionCookie(token);

      return {
        id: user.id,
        email: user.email,
        role: user.role,
      };
    }),

  /**
   * Logout the current user.
   * 
   * Clears the session cookie, effectively logging out the user.
   */
  logout: publicProcedure.mutation(async () => {
    const token = await getSessionToken();
    if (token) {
      await invalidateSession(token);
    }
    await clearSessionCookie();
    return { success: true };
  }),

  /**
   * Get the currently authenticated user.
   * 
   * Returns null if not authenticated, otherwise returns user info.
   */
  me: publicProcedure.query(async () => {
    return await getCurrentUser();
  }),

  /**
   * Change the current user's password.
   */
  /**
   * Change the current user's password and/or username (email).
   */
  changePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(6).optional(),
        newUsername: z.string().min(1).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await db.user.findUnique({
        where: { id: ctx.user.id },
      });

      if (!user || !user.email) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      // Verify current password
      const isValid = await authenticateUser(user.email, input.currentPassword);
      if (!isValid) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Current password is incorrect',
        });
      }

      const updates: any = {};

      // Handle username/email change
      if (input.newUsername && input.newUsername !== user.email) {
        const existing = await db.user.findUnique({
          where: { email: input.newUsername },
        });

        if (existing) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Username is already taken',
          });
        }
        updates.email = input.newUsername;
      }

      // Handle password change
      if (input.newPassword) {
        updates.passwordHash = await hashPassword(input.newPassword);
      }

      if (Object.keys(updates).length === 0) {
        return { success: true };
      }

      await db.user.update({
        where: { id: ctx.user.id },
        data: updates,
      });

      // Invalidate sessions if password changed (security best practice)
      if (input.newPassword) {
        await invalidateAllUserSessions(ctx.user.id);
      }

      return { success: true };
    }),
});

/**
 * Tags Router
 * 
 * Manages server tags for organization and dynamic key server pools.
 */
const tagsRouter = router({
  /**
   * List all tags with server counts.
   */
  list: protectedProcedure.query(async () => {
    return db.tag.findMany({
      include: {
        _count: {
          select: { servers: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }),

  /**
   * Create a new tag.
   */
  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(50),
        color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
        description: z.string().max(200).optional(),
      })
    )
    .mutation(async ({ input }) => {
      // Check for duplicate name
      const existing = await db.tag.findUnique({
        where: { name: input.name },
      });

      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'A tag with this name already exists',
        });
      }

      return db.tag.create({
        data: {
          name: input.name,
          color: input.color ?? '#06b6d4',
          description: input.description,
        },
      });
    }),

  /**
   * Update an existing tag.
   */
  update: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(50).optional(),
        color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
        description: z.string().max(200).optional().nullable(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      return db.tag.update({
        where: { id },
        data,
      });
    }),

  /**
   * Delete a tag.
   */
  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await db.tag.delete({
        where: { id: input.id },
      });
      return { success: true };
    }),
});

/**
 * Dashboard Router
 *
 * Provides aggregated statistics and overview data for the dashboard.
 */
const dashboardRouter = router({
  /**
   * Get traffic history for charts (last 30 days by default).
   */
  trafficHistory: protectedProcedure
    .input(
      z.object({
        days: z.number().int().min(1).max(365).default(30),
        serverId: z.string().optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      const days = input?.days ?? 30;
      const serverId = input?.serverId;

      // Get traffic logs from the last N days
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const where: Record<string, unknown> = {
        recordedAt: { gte: startDate },
      };

      if (serverId) {
        where.accessKey = { serverId };
      }

      const trafficLogs = await db.trafficLog.findMany({
        where,
        select: {
          bytesUsed: true,
          recordedAt: true,
        },
        orderBy: { recordedAt: 'asc' },
      });

      // Group by date
      const dailyTraffic: Record<string, bigint> = {};

      for (const log of trafficLogs) {
        const dateKey = log.recordedAt.toISOString().split('T')[0];
        dailyTraffic[dateKey] = (dailyTraffic[dateKey] || BigInt(0)) + log.bytesUsed;
      }

      // Fill in missing days with 0
      const result: Array<{ date: string; bytes: number; label: string }> = [];
      const current = new Date(startDate);
      const today = new Date();

      while (current <= today) {
        const dateKey = current.toISOString().split('T')[0];
        const bytes = dailyTraffic[dateKey] || BigInt(0);
        result.push({
          date: dateKey,
          bytes: Number(bytes),
          label: current.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        });
        current.setDate(current.getDate() + 1);
      }

      return result;
    }),

  /**
   * Get overview statistics for the dashboard.
   */
  stats: protectedProcedure.query(async () => {
    // Get server counts
    const [totalServers, activeServers] = await Promise.all([
      db.server.count(),
      db.server.count({ where: { isActive: true } }),
    ]);

    // Get key counts by status
    const keyCounts = await db.accessKey.groupBy({
      by: ['status'],
      _count: { status: true },
    });

    const keyStats = {
      total: 0,
      active: 0,
      expired: 0,
      depleted: 0,
      pending: 0,
      disabled: 0,
    };

    for (const item of keyCounts) {
      keyStats.total += item._count.status;
      switch (item.status) {
        case 'ACTIVE':
          keyStats.active = item._count.status;
          break;
        case 'EXPIRED':
          keyStats.expired = item._count.status;
          break;
        case 'DEPLETED':
          keyStats.depleted = item._count.status;
          break;
        case 'PENDING':
          keyStats.pending = item._count.status;
          break;
        case 'DISABLED':
          keyStats.disabled = item._count.status;
          break;
      }
    }

    // Get health check status
    const healthCounts = await db.healthCheck.groupBy({
      by: ['lastStatus'],
      _count: { lastStatus: true },
    });

    let downServers = 0;
    for (const item of healthCounts) {
      if (item.lastStatus === 'DOWN') {
        downServers = item._count.lastStatus;
      }
    }

    // Get keys expiring in 24 hours
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const expiringIn24h = await db.accessKey.count({
      where: {
        status: 'ACTIVE',
        expiresAt: {
          lte: tomorrow,
          gte: new Date(),
        },
      },
    });

    // Calculate total traffic (sum of usedBytes)
    const trafficResult = await db.accessKey.aggregate({
      _sum: { usedBytes: true },
    });

    return {
      totalServers,
      activeServers,
      downServers,
      totalKeys: keyStats.total,
      activeKeys: keyStats.active,
      expiredKeys: keyStats.expired,
      depletedKeys: keyStats.depleted,
      pendingKeys: keyStats.pending,
      expiringIn24h,
      totalTrafficBytes: trafficResult._sum.usedBytes ?? BigInt(0),
    };
  }),

  /**
   * Get server status list for dashboard cards.
   */
  serverStatus: protectedProcedure.query(async () => {
    const servers = await db.server.findMany({
      where: { isActive: true },
      include: {
        healthCheck: true,
        _count: {
          select: { accessKeys: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return servers.map((server) => ({
      id: server.id,
      name: server.name,
      countryCode: server.countryCode,
      status: server.healthCheck?.lastStatus ?? 'UNKNOWN',
      latencyMs: server.healthCheck?.lastLatencyMs,
      keyCount: server._count.accessKeys,
      uptimePercent: server.healthCheck?.uptimePercent ?? 100,
    }));
  }),

  /**
   * Get recent activity for the dashboard.
   */
  recentActivity: protectedProcedure.query(async () => {
    // Get recently created keys
    const recentKeys = await db.accessKey.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        createdAt: true,
        server: {
          select: {
            name: true,
          },
        },
      },
    });

    // Get recent health check alerts
    const recentAlerts = await db.notificationLog.findMany({
      take: 10,
      orderBy: { sentAt: 'desc' },
      select: {
        id: true,
        event: true,
        message: true,
        sentAt: true,
      },
    });

    return {
      recentKeys: recentKeys.map((key) => ({
        id: key.id,
        name: key.name,
        serverName: key.server.name,
        createdAt: key.createdAt,
      })),
      recentAlerts,
    };
  }),
});

/**
 * Settings Router
 * 
 * Manages application-wide settings.
 */
const settingsRouter = router({
  /**
   * Get all settings.
   */
  getAll: protectedProcedure.query(async () => {
    const settings = await db.settings.findMany();

    // Convert to key-value object
    const result: Record<string, unknown> = {};
    for (const setting of settings) {
      try {
        result[setting.key] = JSON.parse(setting.value);
      } catch {
        result[setting.key] = setting.value;
      }
    }

    return result;
  }),

  /**
   * Update a setting.
   */
  update: adminProcedure
    .input(
      z.object({
        key: z.string(),
        value: z.unknown(),
      })
    )
    .mutation(async ({ input }) => {
      await db.settings.upsert({
        where: { key: input.key },
        create: {
          key: input.key,
          value: JSON.stringify(input.value),
        },
        update: {
          value: JSON.stringify(input.value),
        },
      });

      return { success: true };
    }),
});

/**
 * Root Application Router
 * 
 * This combines all sub-routers into the main application router.
 * Each key becomes a namespace for the router's procedures.
 * 
 * For example:
 * - trpc.auth.login
 * - trpc.servers.list
 * - trpc.keys.create
 */
export const appRouter = router({
  auth: authRouter,
  servers: serversRouter,
  keys: keysRouter,
  dynamicKeys: dynamicKeysRouter,
  tags: tagsRouter,
  archivedKeys: archivedKeysRouter,
  dashboard: dashboardRouter,
  settings: settingsRouter,
  telegramBot: telegramBotRouter,
  system: systemRouter,
  backup: backupRouter,
  analytics: analyticsRouter,
  provision: provisionRouter,
  users: usersRouter,
});

/**
 * Export type for use in the client.
 * 
 * This type is used by @trpc/react-query to provide full type safety
 * and autocompletion for API calls in React components.
 */
export type AppRouter = typeof appRouter;
