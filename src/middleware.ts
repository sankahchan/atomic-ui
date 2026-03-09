/**
 * Next.js Middleware for Authentication
 * 
 * This middleware runs on every request to protected routes and handles
 * authentication verification. It checks for a valid session cookie and
 * redirects unauthenticated users to the login page.
 * 
 * The middleware uses Next.js's Edge Runtime, which means it runs at the
 * edge (close to the user) for faster response times. However, this also
 * means we can't use Node.js-specific APIs or make database calls directly.
 * Instead, we verify the JWT token structure and rely on the API routes
 * to perform full session validation.
 * 
 * Route Protection Strategy:
 * - Public routes: /login, /sub/*, /api/health
 * - Protected routes: /dashboard/*, /api/trpc/*
 * - Static assets and Next.js internals are always allowed
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { getJwtSecretString } from '@/lib/session-secret';

/**
 * Routes that don't require authentication
 * These patterns are matched against the request pathname.
 */
const publicRoutes = [
  '/login',
  '/verify-2fa',
  '/sub/',                  // Subscription URLs (Pages)
  '/api/subscription/',     // Subscription API (Bypass auth)
  '/api/sub/',              // Alternative Subscription API
  '/api/health',            // Health check endpoint
  '/api/health-check',      // Background server checks (cron/manual secret)
  '/api/telegram/webhook',  // Telegram webhook from external service
  '/api/trpc/auth.login',   // Login API endpoint
  '/api/trpc/auth.verify2FA', // 2FA verification endpoint
  '/api/trpc/auth.logout',  // Logout API endpoint
  '/api/tasks/',            // Background tasks (cron jobs)
  '/_next',                 // Next.js static files
  '/favicon.ico',           // Favicon
  '/uploads/',              // Uploaded files (covers, etc.)
];

/**
 * Check if a path matches any of the public route patterns
 * Uses startsWith for prefix matching to handle dynamic segments.
 */
function isPublicRoute(pathname: string): boolean {
  return publicRoutes.some((route) => pathname.startsWith(route));
}

/**
 * Get the JWT secret as a Uint8Array for jose library
 * The secret is read from environment variables.
 */
function getJwtSecret(): Uint8Array {
  const secret = getJwtSecretString();
  return new TextEncoder().encode(secret);
}

function buildRedirectUrl(
  request: NextRequest,
  pathname: string,
  searchParams?: Record<string, string>
): URL {
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const forwardedHost = request.headers.get('x-forwarded-host');
  const host = forwardedHost || request.headers.get('host') || request.nextUrl.host;
  const protocol = forwardedProto || request.nextUrl.protocol.replace(':', '') || 'http';
  const url = new URL(`${protocol}://${host}${pathname}`);

  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, value);
    }
  }

  return url;
}

/**
 * Middleware function
 * 
 * This function is called for every request matching the configured
 * matcher pattern. It performs authentication checks and handles
 * redirects as needed.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes without authentication
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // Check for the session cookie
  const sessionToken = request.cookies.get('atomic-session')?.value;

  // If no session cookie, redirect to login
  if (!sessionToken) {
    // For API routes, return 401 instead of redirecting
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Please log in to continue.' },
        { status: 401 }
      );
    }

    // For page routes, redirect to login with return URL
    // For page routes, redirect to login with return URL
    return NextResponse.redirect(
      buildRedirectUrl(request, '/login', { from: pathname })
    );
  }

  // Verify the JWT token structure
  // Note: We can't verify against the database in middleware (Edge Runtime),
  // so we only check that the token is structurally valid. Full session
  // validation happens in the tRPC context.
  try {
    const { payload } = await jwtVerify(sessionToken, getJwtSecret());
    const role = payload.role as string;

    // Role-based Access Control (RBAC)
    // Redirect USER/CLIENT role trying to access admin dashboard
    if ((role === 'USER' || role === 'CLIENT') && pathname.startsWith('/dashboard')) {
      return NextResponse.redirect(buildRedirectUrl(request, '/portal'));
    }

    // Redirect ADMIN role trying to access user portal (optional, but keeps things clean)
    if (role === 'ADMIN' && pathname.startsWith('/portal')) {
      return NextResponse.redirect(buildRedirectUrl(request, '/dashboard'));
    }

    // Redirect USER/CLIENT accessing root to portal
    if ((role === 'USER' || role === 'CLIENT') && pathname === '/') {
      return NextResponse.redirect(buildRedirectUrl(request, '/portal'));
    }

    // Redirect ADMIN accessing root to dashboard
    if (role === 'ADMIN' && pathname === '/') {
      return NextResponse.redirect(buildRedirectUrl(request, '/dashboard'));
    }

    // Token is valid, allow the request to proceed
    return NextResponse.next();
  } catch (error) {
    // Token is invalid or expired
    console.error('Middleware: Invalid session token');

    // Clear the invalid cookie
    const response = pathname.startsWith('/api/')
      ? NextResponse.json(
        { error: 'Unauthorized', message: 'Session expired. Please log in again.' },
        { status: 401 }
      )
      : (() => {
        return NextResponse.redirect(buildRedirectUrl(request, '/login'));
      })();

    response.cookies.delete('atomic-session');
    return response;
  }
}

/**
 * Middleware Configuration
 * 
 * The matcher specifies which routes the middleware should run on.
 * We exclude static files and Next.js internals to improve performance.
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    '/((?!_next/static|_next/image|favicon.ico|public/).*)',
  ],
};
