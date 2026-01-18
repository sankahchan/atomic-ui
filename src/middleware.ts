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

/**
 * Routes that don't require authentication
 * These patterns are matched against the request pathname.
 */
const publicRoutes = [
  '/login',
  '/sub/',                  // Subscription URLs (Pages)
  '/api/subscription/',     // Subscription API (Bypass auth)
  '/api/sub/',              // Alternative Subscription API
  '/api/health',            // Health check endpoint
  '/api/trpc/auth.login',   // Login API endpoint
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
  const secret = process.env.JWT_SECRET || 'atomic-ui-default-secret';
  return new TextEncoder().encode(secret);
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
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
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
      const url = request.nextUrl.clone();
      url.pathname = '/portal';
      return NextResponse.redirect(url);
    }

    // Redirect ADMIN role trying to access user portal (optional, but keeps things clean)
    if (role === 'ADMIN' && pathname.startsWith('/portal')) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }

    // Redirect USER/CLIENT accessing root to portal
    if ((role === 'USER' || role === 'CLIENT') && pathname === '/') {
      const url = request.nextUrl.clone();
      url.pathname = '/portal';
      return NextResponse.redirect(url);
    }

    // Redirect ADMIN accessing root to dashboard
    if (role === 'ADMIN' && pathname === '/') {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
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
        const url = request.nextUrl.clone();
        url.pathname = '/login';
        return NextResponse.redirect(url);
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
