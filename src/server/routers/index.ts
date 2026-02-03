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
import { dashboardRouter } from './dashboard';
import { provisionRouter } from './provision';
import { usersRouter } from './users';
import { z } from 'zod';
import crypto from 'crypto';
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
import { getTotpEncryptionKeyHex } from '@/lib/totp-crypto';

/**
 * Auth Router
 *
 * Handles user authentication including login, logout, and session management.
 * Login creates a JWT token stored in an HTTP-only cookie for security.
 * Supports two-factor authentication (TOTP and WebAuthn).
 */
const authRouter = router({
  /**
   * Login with email and password.
   *
   * On success, checks if 2FA is required. If so, returns requires2FA: true
   * and the client should redirect to the 2FA verification page.
   * Otherwise, creates a session and sets the authentication cookie.
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

      // Check if user has 2FA enabled
      const totpSecret = await db.totpSecret.findUnique({
        where: { userId: user.id },
        select: { verified: true },
      });

      const webAuthnCredentials = await db.webAuthnCredential.findMany({
        where: { userId: user.id },
        select: { id: true },
      });

      const has2FA = (totpSecret?.verified || false) || webAuthnCredentials.length > 0;

      if (has2FA) {
        // Create a temporary pre-2FA session token
        // This is stored in Settings temporarily and deleted after 2FA verification
        const tempToken = crypto.randomUUID();
        await db.settings.upsert({
          where: { key: `temp_auth_${tempToken}` },
          update: { value: JSON.stringify({ userId: user.id, email: user.email, role: user.role, timestamp: Date.now() }) },
          create: { key: `temp_auth_${tempToken}`, value: JSON.stringify({ userId: user.id, email: user.email, role: user.role, timestamp: Date.now() }) },
        });

        return {
          requires2FA: true,
          tempToken,
          totpEnabled: totpSecret?.verified || false,
          webAuthnEnabled: webAuthnCredentials.length > 0,
          id: user.id,
          email: user.email,
          role: user.role,
        };
      }

      // No 2FA - create session and set cookie
      const token = await createSession(user.id, user.email, user.role);
      await setSessionCookie(token);

      return {
        requires2FA: false,
        id: user.id,
        email: user.email,
        role: user.role,
      };
    }),

  /**
   * Verify TOTP code after initial login (2FA step 2)
   */
  verify2FA: publicProcedure
    .input(
      z.object({
        tempToken: z.string(),
        totpCode: z.string().length(6).regex(/^\d+$/).optional(),
        recoveryCode: z.string().min(8).max(10).optional(),
      })
    )
    .mutation(async ({ input }) => {
      // Get temp auth data
      const tempAuth = await db.settings.findUnique({
        where: { key: `temp_auth_${input.tempToken}` },
      });

      if (!tempAuth) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired session. Please login again.',
        });
      }

      const authData = JSON.parse(tempAuth.value);

      // Check if temp token is expired (5 minutes)
      if (Date.now() - authData.timestamp > 5 * 60 * 1000) {
        await db.settings.delete({ where: { key: `temp_auth_${input.tempToken}` } });
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Session expired. Please login again.',
        });
      }

      const { userId, email, role } = authData;

      // Try TOTP verification
      if (input.totpCode) {
        const otplib = await import('otplib');
        const cryptoModule = await import('crypto');

        const totpRecord = await db.totpSecret.findUnique({
          where: { userId },
        });

        if (!totpRecord || !totpRecord.verified) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'TOTP is not enabled for this account.',
          });
        }

        // Decrypt secret
        const ENCRYPTION_KEY = getTotpEncryptionKeyHex();
        const [ivHex, encrypted] = totpRecord.encryptedSecret.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const key = Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex');
        const decipher = cryptoModule.createDecipheriv('aes-256-cbc', key, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        const isValid = otplib.verify({ token: input.totpCode, secret: decrypted });

        if (!isValid) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'Invalid verification code.',
          });
        }
      }
      // Try recovery code verification
      else if (input.recoveryCode) {
        const bcrypt = await import('bcryptjs');
        const normalizedCode = input.recoveryCode.replace('-', '');

        const recoveryCodes = await db.recoveryCode.findMany({
          where: { userId, usedAt: null },
        });

        let found = false;
        for (const rc of recoveryCodes) {
          const isMatch = await bcrypt.compare(normalizedCode, rc.codeHash);
          if (isMatch) {
            await db.recoveryCode.update({
              where: { id: rc.id },
              data: { usedAt: new Date() },
            });
            found = true;
            break;
          }
        }

        if (!found) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'Invalid recovery code.',
          });
        }
      }
      else {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Please provide a TOTP code or recovery code.',
        });
      }

      // 2FA verified - clean up temp token and create real session
      await db.settings.delete({ where: { key: `temp_auth_${input.tempToken}` } });

      const token = await createSession(userId, email, role);
      await setSessionCookie(token);

      return {
        id: userId,
        email,
        role,
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

import { templatesRouter } from './templates';
import { securityRouter } from './security';

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
  templates: templatesRouter,
  security: securityRouter,
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
