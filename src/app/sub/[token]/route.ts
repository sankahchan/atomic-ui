/**
 * Subscription URL Endpoint
 * 
 * This endpoint serves access key configurations to VPN clients. It supports
 * multiple output formats commonly used by different Shadowsocks clients,
 * including raw, Base64-encoded, Clash YAML, and SIP008 JSON formats.
 * 
 * The endpoint is designed to be compatible with popular VPN client applications
 * that support subscription URLs, allowing users to automatically update their
 * server configurations without manual entry.
 * 
 * URL Format: /sub/{token}?format={format}
 * 
 * Supported Formats:
 * - raw: Plain ss:// URL (default)
 * - base64: Base64-encoded ss:// URL
 * - clash: Clash proxy configuration YAML
 * - sip008: SIP008 JSON format for Outline/Shadowsocks clients
 * 
 * The token is a unique identifier generated for each access key, providing
 * a level of security by requiring knowledge of the specific token to access
 * the configuration.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db as prisma } from '@/lib/db';

/**
 * Supported subscription formats
 * Each format is designed for compatibility with different VPN client apps.
 */
type SubscriptionFormat = 'raw' | 'base64' | 'clash' | 'sip008';

/**
 * GET /sub/[token]
 * 
 * Retrieves the access key configuration for the given subscription token.
 * The response format can be specified via the `format` query parameter.
 * 
 * This endpoint also tracks key usage by recording the "first use" timestamp,
 * which is important for keys with START_ON_FIRST_USE expiration type.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const { token } = params;
    const format = (request.nextUrl.searchParams.get('format') || 'raw') as SubscriptionFormat;

    // Find the access key by subscription token
    const accessKey = await prisma.accessKey.findUnique({
      where: { subscriptionToken: token },
      include: {
        server: true,
      },
    });

    // Return 404 if key not found
    if (!accessKey) {
      return new NextResponse('Subscription not found', { status: 404 });
    }

    // Check if key is active
    if (accessKey.status !== 'ACTIVE' && accessKey.status !== 'PENDING') {
      return new NextResponse('Subscription is no longer active', { status: 403 });
    }

    // Check if key has expired
    if (accessKey.expiresAt && new Date() > accessKey.expiresAt) {
      return new NextResponse('Subscription has expired', { status: 403 });
    }

    // Check if data limit exceeded
    if (accessKey.dataLimitBytes && accessKey.usedBytes >= accessKey.dataLimitBytes) {
      return new NextResponse('Data limit exceeded', { status: 403 });
    }

    // Handle START_ON_FIRST_USE expiration type
    // If this is the first access, activate the key and start the expiration timer
    if (accessKey.expirationType === 'START_ON_FIRST_USE' && !accessKey.firstUsedAt) {
      const firstUsedAt = new Date();
      const expiresAt = accessKey.durationDays
        ? new Date(firstUsedAt.getTime() + accessKey.durationDays * 24 * 60 * 60 * 1000)
        : null;

      await prisma.accessKey.update({
        where: { id: accessKey.id },
        data: {
          firstUsedAt,
          expiresAt,
          status: 'ACTIVE',
        },
      });
    }

    // Build the access URL if not already stored
    const accessUrl = accessKey.accessUrl || buildAccessUrl(accessKey);

    // Return response in the requested format
    switch (format) {
      case 'base64':
        return new NextResponse(Buffer.from(accessUrl).toString('base64'), {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Content-Disposition': `inline; filename="${accessKey.name}.txt"`,
          },
        });

      case 'clash':
        const clashConfig = buildClashConfig(accessKey, accessUrl);
        return new NextResponse(clashConfig, {
          headers: {
            'Content-Type': 'text/yaml; charset=utf-8',
            'Content-Disposition': `inline; filename="${accessKey.name}.yaml"`,
          },
        });

      case 'sip008':
        const sip008Config = buildSIP008Config(accessKey, accessUrl);
        return new NextResponse(JSON.stringify(sip008Config), {
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Disposition': `inline; filename="${accessKey.name}.json"`,
          },
        });

      case 'raw':
      default:
        return new NextResponse(accessUrl, {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
          },
        });
    }
  } catch (error) {
    console.error('Subscription endpoint error:', error);
    return new NextResponse('Internal server error', { status: 500 });
  }
}

/**
 * Build the ss:// access URL from key data
 * This creates a standard Shadowsocks URI that can be imported by clients.
 */
function buildAccessUrl(accessKey: {
  outlineKeyId: string;
  server: {
    hostnameForAccessKeys: string | null;
    portForNewAccessKeys: number | null;
  };
}): string {
  // Note: In a real implementation, this would need the actual key credentials
  // from the Outline server. For now, we return a placeholder.
  // The actual accessUrl should be stored when the key is created.
  return `ss://placeholder@${accessKey.server.hostnameForAccessKeys}:${accessKey.server.portForNewAccessKeys}#${accessKey.outlineKeyId}`;
}

/**
 * Build Clash proxy configuration
 * Clash is a popular proxy client that uses YAML configuration files.
 */
function buildClashConfig(
  accessKey: {
    name: string;
    server: {
      name: string;
      hostnameForAccessKeys: string | null;
      portForNewAccessKeys: number | null;
    };
  },
  accessUrl: string
): string {
  // Parse the ss:// URL to extract server details
  // Format: ss://BASE64(method:password)@host:port#name
  // or: ss://BASE64(userinfo)@host:port/?plugin=...#name
  
  const parsed = parseSSUrl(accessUrl);
  if (!parsed) {
    return `# Error: Could not parse access URL`;
  }

  return `# Clash Configuration for ${accessKey.name}
# Server: ${accessKey.server.name}
# Generated by Atomic-UI

proxies:
  - name: "${accessKey.name}"
    type: ss
    server: ${parsed.host}
    port: ${parsed.port}
    cipher: ${parsed.method}
    password: "${parsed.password}"

proxy-groups:
  - name: "Proxy"
    type: select
    proxies:
      - "${accessKey.name}"

rules:
  - MATCH,Proxy
`;
}

/**
 * Build SIP008 JSON configuration
 * SIP008 is a standard format for Shadowsocks server configurations,
 * supported by Outline and many other Shadowsocks clients.
 */
function buildSIP008Config(
  accessKey: {
    name: string;
    server: {
      name: string;
      hostnameForAccessKeys: string | null;
      portForNewAccessKeys: number | null;
    };
  },
  accessUrl: string
): object {
  const parsed = parseSSUrl(accessUrl);
  if (!parsed) {
    return { error: 'Could not parse access URL' };
  }

  return {
    version: 1,
    servers: [
      {
        id: accessKey.name,
        remarks: `${accessKey.server.name} - ${accessKey.name}`,
        server: parsed.host,
        server_port: parsed.port,
        password: parsed.password,
        method: parsed.method,
      },
    ],
    bytes_used: 0,
    bytes_remaining: null,
  };
}

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
