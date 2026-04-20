import { randomUUID } from 'crypto';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { db } from './db';
import { getJwtSecretBytes } from './session-secret';
import { normalizeLegacyAdminScopes } from './server-admin-scope';

// Constants for authentication
const SESSION_COOKIE_NAME = 'atomic-session';
// Validate session expiry
const getSessionExpiryDays = () => {
  const value = parseInt(process.env.SESSION_EXPIRY_DAYS || '');
  // Default to 7 if not set, invalid number, or non-positive
  if (isNaN(value) || value <= 0) {
    if (process.env.SESSION_EXPIRY_DAYS) {
      console.warn(`[Auth] Invalid SESSION_EXPIRY_DAYS "${process.env.SESSION_EXPIRY_DAYS}". Using default (7 days).`);
    }
    return 7;
  }
  return value;
};

const SESSION_EXPIRY_DAYS = getSessionExpiryDays();

// Types for authentication
export interface SessionPayload {
  userId: string;
  email: string;
  role: string;
  adminScope?: string | null;
  exp: number;
}

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  adminScope?: string | null;
}

export interface SessionMetadata {
  ip?: string | null;
  userAgent?: string | null;
}

function getConfiguredSessionOrigin() {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    ''
  );
}

export function shouldUseSecureSessionCookie() {
  return process.env.NODE_ENV === 'production' && getConfiguredSessionOrigin().startsWith('https://');
}

export function buildSessionCookieOptions() {
  const secure = shouldUseSecureSessionCookie();

  return {
    httpOnly: true,
    secure,
    sameSite: secure ? ('strict' as const) : ('lax' as const),
    priority: 'high' as const,
    maxAge: SESSION_EXPIRY_DAYS * 24 * 60 * 60,
    path: '/',
  };
}

function isExpectedSessionVerificationError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  if (
    [
      'JWTExpired',
      'JWTInvalid',
      'JWTClaimValidationFailed',
      'JWSInvalid',
      'JWSSignatureVerificationFailed',
    ].includes(error.name)
  ) {
    return true;
  }

  return /jwt|jws|signature|compact/i.test(error.message);
}

/**
 * Hash a password using bcrypt
 * The cost factor of 12 provides good security while maintaining reasonable performance
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

/**
 * Verify a password against its hash
 * Returns true if the password matches, false otherwise
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Create a new JWT session token
 * The token contains the user's ID, email, and role for authorization
 */
export async function createSession(
  userId: string,
  email: string,
  role: string,
  metadata?: SessionMetadata,
  adminScope?: string | null,
): Promise<string> {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_EXPIRY_DAYS);
  const jwtSecret = getJwtSecretBytes();

  // Create the JWT with user information
  const token = await new SignJWT({
    userId,
    email,
    role,
    adminScope: adminScope || null,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(jwtSecret);

  // Store the session in the database for tracking and revocation
  await db.session.create({
    data: {
      userId,
      token,
      ip: metadata?.ip ?? null,
      userAgent: metadata?.userAgent ?? null,
      expiresAt,
    },
  });

  return token;
}

/**
 * Verify and decode a JWT session token
 * Returns the payload if valid, null if invalid or expired
 */
export async function verifySession(token: string): Promise<SessionPayload | null> {
  let payload: Awaited<ReturnType<typeof jwtVerify>>['payload'];
  try {
    ({ payload } = await jwtVerify(token, getJwtSecretBytes()));
  } catch (error) {
    if (isExpectedSessionVerificationError(error)) {
      return null;
    }

    console.error('[Auth] Unexpected session verification failure:', error);
    throw error;
  }

  const session = await db.session.findUnique({
    where: { token },
  });

  if (!session || session.expiresAt < new Date()) {
    return null;
  }

  return payload as unknown as SessionPayload;
}

/**
 * Get the current authenticated user from the session cookie
 * Returns null if not authenticated
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);

  if (!sessionCookie?.value) {
    return null;
  }

  const payload = await verifySession(sessionCookie.value);

  if (!payload) {
    return null;
  }

  if (payload.role === 'ADMIN') {
    await normalizeLegacyAdminScopes();
  }

  const user = await db.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      email: true,
      role: true,
      adminScope: true,
      passwordHash: false,
    },
  });

  if (!user) return null;

  return {
    id: user.id,
    email: user.email || '',
    role: user.role,
    adminScope: user.adminScope,
  };
}

/**
 * Set the session cookie after successful login
 */
export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, buildSessionCookieOptions());
}

/**
 * Get the current session token from the cookie
 */
export async function getSessionToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value;
}

/**
 * Clear the session cookie (logout)
 */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Invalidate a session by removing it from the database
 */
export async function invalidateSession(token: string): Promise<void> {
  await db.session.delete({
    where: { token },
  }).catch(() => {
    // Session may already be deleted, ignore error
  });
}

/**
 * Invalidate all sessions for a user (useful for password change)
 */
export async function invalidateAllUserSessions(userId: string): Promise<void> {
  await db.session.deleteMany({
    where: { userId },
  });
}

/**
 * Clean up expired sessions from the database
 * This should be called periodically (e.g., via cron job)
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const result = await db.session.deleteMany({
    where: {
      expiresAt: {
        lt: new Date(),
      },
    },
  });

  return result.count;
}

/**
 * Authenticate a user with email and password
 * Returns the user if successful, null otherwise
 */
export async function authenticateUser(
  email: string,
  password: string
): Promise<AuthUser | null> {
  const user = await db.user.findUnique({
    where: { email },
  });

  if (!user || !user.passwordHash) {
    return null;
  }

  const isValid = await verifyPassword(password, user.passwordHash);

  if (!isValid) {
    return null;
  }

  return {
    id: user.id,
    email: user.email || '',
    role: user.role,
    adminScope: user.adminScope,
  };
}
