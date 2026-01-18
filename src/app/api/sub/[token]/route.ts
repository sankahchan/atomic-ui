/**
 * Dynamic Subscription URL Endpoint
 *
 * This endpoint serves access key configurations to VPN clients.
 * It supports both Dynamic Access Keys and regular Access Keys.
 *
 * For Outline clients, this returns a JSON object in the format:
 * {
 *   "server": "hostname",
 *   "server_port": 8388,
 *   "password": "secret",
 *   "method": "chacha20-ietf-poly1305"
 * }
 *
 * URL Format: /sub/{token}
 *
 * The token can be either:
 * - A Dynamic Access Key's dynamicUrl token
 * - A regular Access Key's subscriptionToken
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * Parse a Shadowsocks ss:// URL
 * Extracts the method, password, host, and port from the URL.
 */
function parseSSUrl(url: string): {
  method: string;
  password: string;
  host: string;
  port: number;
} | null {
  try {
    // ss:// URLs can be in two formats:
    // 1. ss://BASE64(method:password)@host:port#tag
    // 2. ss://method:password@host:port#tag (deprecated)

    const match = url.match(/^ss:\/\/([^@]+)@([^:]+):(\d+)/);
    if (!match) return null;

    const [, userInfo, host, portStr] = match;
    const port = parseInt(portStr, 10);

    // Try to decode Base64 userinfo
    let method: string;
    let password: string;

    try {
      const decoded = Buffer.from(userInfo, 'base64').toString('utf-8');
      const colonIndex = decoded.indexOf(':');
      if (colonIndex > 0) {
        method = decoded.substring(0, colonIndex);
        password = decoded.substring(colonIndex + 1);
      } else {
        // Fallback: assume chacha20-ietf-poly1305
        method = 'chacha20-ietf-poly1305';
        password = decoded;
      }
    } catch {
      // Not Base64, try direct parsing
      const colonIndex = userInfo.indexOf(':');
      if (colonIndex > 0) {
        method = userInfo.substring(0, colonIndex);
        password = userInfo.substring(colonIndex + 1);
      } else {
        return null;
      }
    }

    return { method, password, host, port };
  } catch {
    return null;
  }
}

/**
 * Build Outline-compatible JSON response from parsed SS URL
 */
function buildOutlineJson(parsed: {
  method: string;
  password: string;
  host: string;
  port: number;
}): object {
  return {
    server: parsed.host,
    server_port: parsed.port,
    password: parsed.password,
    method: parsed.method,
  };
}

/**
 * GET /sub/[token]
 *
 * Retrieves the access key configuration for the given token.
 * Returns JSON format compatible with Outline clients.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    // First, try to find a Dynamic Access Key by dynamicUrl
    const dynamicKey = await db.dynamicAccessKey.findUnique({
      where: { dynamicUrl: token },
      include: {
        accessKeys: {
          where: {
            status: 'ACTIVE',
          },
          include: {
            server: true,
          },
          take: 1,
        },
      },
    });

    if (dynamicKey) {
      // Found a dynamic key - validate it
      if (dynamicKey.status !== 'ACTIVE' && dynamicKey.status !== 'PENDING') {
        return NextResponse.json(
          { error: `Key is ${dynamicKey.status.toLowerCase()}` },
          { status: 403 }
        );
      }

      // Check if expired
      if (dynamicKey.expiresAt && new Date() > dynamicKey.expiresAt) {
        return NextResponse.json({ error: 'Key has expired' }, { status: 403 });
      }

      // Check data limit
      if (dynamicKey.dataLimitBytes && dynamicKey.usedBytes >= dynamicKey.dataLimitBytes) {
        return NextResponse.json({ error: 'Data limit exceeded' }, { status: 403 });
      }

      // Handle START_ON_FIRST_USE expiration type
      if (dynamicKey.expirationType === 'START_ON_FIRST_USE' && !dynamicKey.firstUsedAt) {
        const firstUsedAt = new Date();
        const expiresAt = dynamicKey.durationDays
          ? new Date(firstUsedAt.getTime() + dynamicKey.durationDays * 24 * 60 * 60 * 1000)
          : null;

        await db.dynamicAccessKey.update({
          where: { id: dynamicKey.id },
          data: {
            firstUsedAt,
            expiresAt,
            status: 'ACTIVE',
          },
        });
      }

      // Get the attached access key
      const attachedKey = dynamicKey.accessKeys[0];

      if (!attachedKey || !attachedKey.accessUrl) {
        return NextResponse.json(
          { error: 'No active access key attached to this dynamic key' },
          { status: 404 }
        );
      }

      // Parse the access URL and return Outline-compatible JSON
      const parsed = parseSSUrl(attachedKey.accessUrl);

      if (!parsed) {
        // Return the raw ss:// URL if parsing fails
        return new NextResponse(attachedKey.accessUrl, {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
          },
        });
      }

      // Return Outline-compatible JSON
      return NextResponse.json(buildOutlineJson(parsed), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
      });
    }

    // Fall back to regular access key lookup by subscriptionToken
    const accessKey = await db.accessKey.findUnique({
      where: { subscriptionToken: token },
      include: {
        server: true,
      },
    });

    if (!accessKey) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    // Check if key is active
    if (accessKey.status !== 'ACTIVE' && accessKey.status !== 'PENDING') {
      return NextResponse.json(
        { error: `Key is ${accessKey.status.toLowerCase()}` },
        { status: 403 }
      );
    }

    // Check if key has expired
    if (accessKey.expiresAt && new Date() > accessKey.expiresAt) {
      return NextResponse.json({ error: 'Key has expired' }, { status: 403 });
    }

    // Check if data limit exceeded
    if (accessKey.dataLimitBytes && accessKey.usedBytes >= accessKey.dataLimitBytes) {
      return NextResponse.json({ error: 'Data limit exceeded' }, { status: 403 });
    }

    // Handle START_ON_FIRST_USE expiration type
    if (accessKey.expirationType === 'START_ON_FIRST_USE' && !accessKey.firstUsedAt) {
      const firstUsedAt = new Date();
      const expiresAt = accessKey.durationDays
        ? new Date(firstUsedAt.getTime() + accessKey.durationDays * 24 * 60 * 60 * 1000)
        : null;

      await db.accessKey.update({
        where: { id: accessKey.id },
        data: {
          firstUsedAt,
          expiresAt,
          status: 'ACTIVE',
        },
      });
    }

    if (!accessKey.accessUrl) {
      return NextResponse.json({ error: 'No access URL available' }, { status: 404 });
    }

    // Parse the access URL and return Outline-compatible JSON
    const parsed = parseSSUrl(accessKey.accessUrl);

    if (!parsed) {
      // Return the raw ss:// URL if parsing fails
      return new NextResponse(accessKey.accessUrl, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
        },
      });
    }

    // Return Outline-compatible JSON
    return NextResponse.json(buildOutlineJson(parsed), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
    });
  } catch (error) {
    console.error('Subscription endpoint error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
