import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { db } from './db';

// Constants for authentication
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'atomic-ui-default-secret');
const SESSION_COOKIE_NAME = 'atomic-session';
const SESSION_EXPIRY_DAYS = parseInt(process.env.SESSION_EXPIRY_DAYS || '7');
const COOKIE_SECURE_SETTING = process.env.COOKIE_SECURE;

function resolveCookieSecureSetting(): boolean {
  if (COOKIE_SECURE_SETTING === 'true') {
    return true;
  }

  if (COOKIE_SECURE_SETTING === 'false') {
    return false;
  }

  return process.env.NODE_ENV === 'production';
}

// Types for authentication
export interface SessionPayload {
  userId: string;
  username: string;
  role: string;
  exp: number;
}

export interface AuthUser {
  id: string;
  username: string;
  email: string | null;
  role: string;
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
 * The token contains the user's ID, username, and role for authorization
 */
export async function createSession(userId: string, username: string, role: string): Promise<string> {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_EXPIRY_DAYS);

  // Create the JWT with user information
  const token = await new SignJWT({
    userId,
    username,
    role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(JWT_SECRET);

  // Store the session in the database for tracking and revocation
  await db.session.create({
    data: {
      userId,
      token,
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
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);

    // Check if the session exists in the database (not revoked)
    const session = await db.session.findUnique({
      where: { token },
    });

    if (!session || session.expiresAt < new Date()) {
      return null;
    }

    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

/**
 * Get the current authenticated user from the session cookie
 * Returns null if not authenticated
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);

    if (!sessionCookie?.value) {
      return null;
    }

    const payload = await verifySession(sessionCookie.value);

    if (!payload) {
      return null;
    }

    // Fetch the full user from the database
    const user = await db.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
      },
    });

    return user;
  } catch {
    return null;
  }
}

/**
 * Set the session cookie after successful login
 */
export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: resolveCookieSecureSetting(),
    sameSite: 'lax',
    maxAge: SESSION_EXPIRY_DAYS * 24 * 60 * 60, // Convert days to seconds
    path: '/',
  });
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
 * Authenticate a user with username and password
 * Returns the user if successful, null otherwise
 */
export async function authenticateUser(
  username: string,
  password: string
): Promise<AuthUser | null> {
  const user = await db.user.findUnique({
    where: { username },
  });

  if (!user) {
    return null;
  }

  const isValid = await verifyPassword(password, user.passwordHash);

  if (!isValid) {
    return null;
  }

  // Update last login info
  await db.user.update({
    where: { id: user.id },
    data: {
      lastLoginAt: new Date(),
    },
  });

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
  };
}
