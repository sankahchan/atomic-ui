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
import {
  APP_BUILD_COOKIE_NAME,
  CLIENT_BUILD_HEADER_NAME,
  getCurrentBuildId,
  shouldRejectStaleBuildRequest,
} from '@/lib/deploy-guard';
import { getJwtSecretString } from '@/lib/session-secret';

/**
 * Routes that don't require authentication
 * These patterns are matched against the request pathname.
 */
const publicRoutes = [
  '/login',
  '/login-approval',
  '/verify-2fa',
  '/sub/',                  // Subscription URLs (Pages)
  '/s/',                    // Short subscription URLs (Pages)
  '/share/',                // Expiring public invite links
  '/c/',                    // Short client URLs
  '/status',                // Public uptime page
  '/api/subscription/',     // Subscription API (Bypass auth)
  '/api/sub/',              // Alternative Subscription API
  '/api/health',            // Health check endpoint
  '/api/health-check',      // Background server checks (cron/manual secret)
  '/api/app-version',       // Public build/version check for stale-tab reload guard
  '/api/finance/receipt',   // Printable public receipt/refund confirmation
  '/api/telegram/announcements/', // Public announcement open/click tracking
  '/api/telegram/webhook',  // Telegram webhook from external service
  '/telegram/',             // Public Telegram help/proof example media
  '/api/trpc/auth.login',   // Login API endpoint
  '/api/trpc/auth.getAdminLoginApprovalStatus',
  '/api/trpc/auth.completeAdminLoginApproval',
  '/api/trpc/auth.generateWebAuthnLoginOptions',
  '/api/trpc/auth.verifyWebAuthnLogin',
  '/api/trpc/auth.verify2FA', // 2FA verification endpoint
  '/api/trpc/auth.logout',  // Logout API endpoint
  '/api/tasks/',            // Background tasks (cron jobs)
  '/_next',                 // Next.js static files
  '/favicon.ico',           // Favicon
  '/uploads/',              // Uploaded files (covers, etc.)
];

const shareDomainRoutes = [
  '/sub/',
  '/s/',
  '/share/',
  '/c/',
  '/api/subscription/',
  '/api/sub/',
  '/_next',
  '/favicon.ico',
  '/uploads/',
];

/**
 * Check if a path matches any of the public route patterns
 * Uses startsWith for prefix matching to handle dynamic segments.
 */
export function isPublicRoute(pathname: string): boolean {
  return publicRoutes.some((route) =>
    route.endsWith('/')
      ? pathname.startsWith(route)
      : pathname === route || pathname.startsWith(`${route}/`)
  );
}

function isShareDomainRoute(pathname: string): boolean {
  return shareDomainRoutes.some((route) =>
    route.endsWith('/')
      ? pathname.startsWith(route)
      : pathname === route || pathname.startsWith(`${route}/`)
  );
}

function normalizeHost(value: string | null | undefined) {
  if (!value) {
    return '';
  }

  const withoutProtocol = value.replace(/^https?:\/\//i, '');
  const hostPort = withoutProtocol.split('/')[0] ?? '';
  return hostPort.split(':')[0]?.toLowerCase() ?? '';
}

function getRequestHost(request: NextRequest) {
  return normalizeHost(
    request.headers.get('x-forwarded-host') ||
      request.headers.get('host') ||
      request.nextUrl.host,
  );
}

function getPublicShareHost() {
  return normalizeHost(
    process.env.NEXT_PUBLIC_PUBLIC_SHARE_URL ||
      process.env.PUBLIC_SHARE_URL ||
      process.env.PUBLIC_SHARE_DOMAIN,
  );
}

/**
 * Get the JWT secret as a Uint8Array for jose library
 * The secret is read from environment variables.
 */
function getJwtSecret(): Uint8Array {
  const secret = getJwtSecretString();
  return new TextEncoder().encode(secret);
}

function getBasePath(request: NextRequest): string {
  return request.nextUrl.basePath || process.env.PANEL_PATH || '';
}

function normalizePathname(request: NextRequest, pathname: string): string {
  const basePath = getBasePath(request);

  if (!basePath) {
    return pathname;
  }

  if (pathname === basePath) {
    return '/';
  }

  return pathname.startsWith(`${basePath}/`) ? pathname.slice(basePath.length) : pathname;
}

function buildRedirectUrl(
  request: NextRequest,
  pathname: string,
  searchParams?: Record<string, string>
): URL {
  const basePath = getBasePath(request);
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const forwardedHost = request.headers.get('x-forwarded-host');
  const host = forwardedHost || request.headers.get('host') || request.nextUrl.host;
  const protocol = forwardedProto || request.nextUrl.protocol.replace(':', '') || 'http';
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const appPath = basePath && !normalizedPath.startsWith(`${basePath}/`) && normalizedPath !== basePath
    ? `${basePath}${normalizedPath}`
    : normalizedPath;
  const url = new URL(`${protocol}://${host}${appPath}`);

  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, value);
    }
  }

  return url;
}

function applyBuildCookie(response: NextResponse) {
  const currentBuildId = getCurrentBuildId();
  if (!currentBuildId) {
    return response;
  }

  response.cookies.set(APP_BUILD_COOKIE_NAME, currentBuildId, {
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
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
  const normalizedPath = normalizePathname(request, pathname);
  const publicShareHost = getPublicShareHost();
  const requestHost = getRequestHost(request);
  const isServerActionRequest = request.headers.has('next-action');
  const isRscRequest = request.headers.has('rsc') || request.nextUrl.searchParams.has('_rsc');

  if (
    (isServerActionRequest || isRscRequest) &&
    shouldRejectStaleBuildRequest({
      currentBuildId: getCurrentBuildId(),
      headerBuildId: request.headers.get(CLIENT_BUILD_HEADER_NAME),
      cookieBuildId: request.cookies.get(APP_BUILD_COOKIE_NAME)?.value,
    })
  ) {
    const response = isServerActionRequest
      ? NextResponse.json(
        {
          ok: false,
          error: 'STALE_BUILD',
          message: 'This tab is using an older deploy and needs to reload.',
        },
        { status: 409 }
      )
      : new NextResponse('STALE_BUILD', { status: 409 });
    response.headers.set('x-atomic-stale-build', '1');
    return applyBuildCookie(response);
  }

  // The public share host must never expose admin/login routes.
  if (publicShareHost && requestHost === publicShareHost) {
    if (!isShareDomainRoute(normalizedPath)) {
      return new NextResponse(null, { status: 404 });
    }

    return applyBuildCookie(NextResponse.next());
  }

  // Allow public routes without authentication
  if (isPublicRoute(normalizedPath)) {
    return applyBuildCookie(NextResponse.next());
  }

  // Check for the session cookie
  const sessionToken = request.cookies.get('atomic-session')?.value;

  // If no session cookie, redirect to login
  if (!sessionToken) {
    // For API routes, return 401 instead of redirecting
    if (normalizedPath.startsWith('/api/')) {
      return applyBuildCookie(NextResponse.json(
        { error: 'Unauthorized', message: 'Please log in to continue.' },
        { status: 401 }
      ));
    }

    // For page routes, redirect to login with return URL
    // For page routes, redirect to login with return URL
    return applyBuildCookie(NextResponse.redirect(
      buildRedirectUrl(request, '/login', { from: normalizedPath })
    ));
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
    if ((role === 'USER' || role === 'CLIENT') && normalizedPath.startsWith('/dashboard')) {
      return applyBuildCookie(NextResponse.redirect(buildRedirectUrl(request, '/portal')));
    }

    // Redirect ADMIN role trying to access user portal (optional, but keeps things clean)
    if (role === 'ADMIN' && normalizedPath.startsWith('/portal')) {
      return applyBuildCookie(NextResponse.redirect(buildRedirectUrl(request, '/dashboard')));
    }

    // Redirect USER/CLIENT accessing root to portal
    if ((role === 'USER' || role === 'CLIENT') && normalizedPath === '/') {
      return applyBuildCookie(NextResponse.redirect(buildRedirectUrl(request, '/portal')));
    }

    // Redirect ADMIN accessing root to dashboard
    if (role === 'ADMIN' && normalizedPath === '/') {
      return applyBuildCookie(NextResponse.redirect(buildRedirectUrl(request, '/dashboard')));
    }

    // Token is valid, allow the request to proceed
    return applyBuildCookie(NextResponse.next());
  } catch (error) {
    // Token is invalid or expired
    console.error('Middleware: Invalid session token');

    // Clear the invalid cookie
    const response = normalizedPath.startsWith('/api/')
      ? NextResponse.json(
        { error: 'Unauthorized', message: 'Session expired. Please log in again.' },
        { status: 401 }
      )
      : (() => {
        return NextResponse.redirect(buildRedirectUrl(request, '/login'));
      })();

    response.cookies.delete('atomic-session');
    return applyBuildCookie(response);
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
