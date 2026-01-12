/**
 * tRPC Server Configuration
 * 
 * This module sets up the tRPC server with proper context handling,
 * authentication middleware, and error handling. tRPC provides type-safe
 * API routes that are automatically validated on both client and server.
 * 
 * The pattern used here follows the "t3 stack" conventions for Next.js
 * applications using tRPC.
 */

import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { ZodError } from 'zod';
import { getCurrentUser, type AuthUser } from '@/lib/auth';

/**
 * Context available to all tRPC procedures.
 * 
 * The context is created fresh for each request and contains:
 * - user: The authenticated user (if any)
 * 
 * This allows procedures to access the current user without
 * having to manually handle authentication in each procedure.
 */
export interface Context {
  user: AuthUser | null;
}

/**
 * Creates the context for each tRPC request.
 * 
 * This function is called by the tRPC adapter for every request.
 * It fetches the current user from the session cookie and includes
 * them in the context. If no valid session exists, user will be null.
 */
export async function createContext(): Promise<Context> {
  const user = await getCurrentUser();
  return { user };
}

/**
 * Initialize tRPC with our context type and superjson transformer.
 * 
 * We use superjson as the transformer to properly serialize complex
 * types like Date, BigInt, and Map across the network boundary.
 * 
 * The error formatter converts Zod validation errors into a more
 * user-friendly format while preserving the original error shape
 * for debugging.
 */
const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        // Include Zod validation errors in a structured format
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

/**
 * Export tRPC router and procedure creators.
 * 
 * These are the building blocks for creating API routes:
 * - router: Creates a new router that groups related procedures
 * - publicProcedure: A procedure that can be called without authentication
 * - protectedProcedure: A procedure that requires authentication
 * - adminProcedure: A procedure that requires admin role
 */
export const router = t.router;
export const publicProcedure = t.procedure;

/**
 * Middleware that enforces authentication.
 * 
 * This middleware checks if a user is present in the context.
 * If not, it throws an UNAUTHORIZED error, preventing access
 * to protected procedures.
 * 
 * The middleware also narrows the context type to include a
 * non-null user, providing type safety in protected procedures.
 */
const enforceAuth = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'You must be logged in to access this resource',
    });
  }

  // Proceed with the narrowed context type that guarantees a user
  return next({
    ctx: {
      user: ctx.user,
    },
  });
});

/**
 * Middleware that enforces admin role.
 * 
 * This middleware extends enforceAuth by also checking that the
 * authenticated user has the ADMIN role. This is used for
 * sensitive operations like user management and system settings.
 */
const enforceAdmin = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'You must be logged in to access this resource',
    });
  }

  if (ctx.user.role !== 'ADMIN') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'You do not have permission to access this resource',
    });
  }

  return next({
    ctx: {
      user: ctx.user,
    },
  });
});

/**
 * Protected procedure that requires authentication.
 * 
 * Use this for any API endpoint that should only be accessible
 * to logged-in users. The context will have a guaranteed non-null
 * user property.
 * 
 * Example:
 *   protectedProcedure.query(({ ctx }) => {
 *     // ctx.user is guaranteed to exist here
 *     return ctx.user.username;
 *   })
 */
export const protectedProcedure = t.procedure.use(enforceAuth);

/**
 * Admin procedure that requires admin role.
 * 
 * Use this for sensitive operations that should only be accessible
 * to administrators. The context will have a guaranteed non-null
 * user with ADMIN role.
 * 
 * Example:
 *   adminProcedure.mutation(({ ctx }) => {
 *     // Only admins can reach here
 *     return deleteAllLogs();
 *   })
 */
export const adminProcedure = t.procedure.use(enforceAdmin);

/**
 * Middleware for logging procedures (development only).
 * 
 * This optional middleware logs procedure calls for debugging.
 * It's useful during development to see what's being called.
 */
export const loggerMiddleware = t.middleware(async ({ path, type, next }) => {
  const start = Date.now();
  const result = await next();
  const duration = Date.now() - start;

  if (process.env.NODE_ENV === 'development') {
    console.log(`[tRPC] ${type} ${path} - ${duration}ms`);
  }

  return result;
});

/**
 * Helper type for inferring router input/output types.
 * 
 * These types are useful when you need to type function parameters
 * or state that matches the shape of tRPC procedure inputs/outputs.
 */
export type { Context as TRPCContext };
