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
 *   "method": "chacha20-ietf-poly1305",
 *   "prefix": "POST " (optional, for restricted networks)
 * }
 *
 * URL Format: /sub/{token}
 *
 * The token can be either:
 * - A Dynamic Access Key's dynamicUrl token
 * - A regular Access Key's subscriptionToken
 *
 * Load Balancing Algorithms (for Dynamic Access Keys):
 * - IP_HASH: Uses CRC32 of client IP for consistent server selection
 * - RANDOM: Randomly selects from available access keys
 * - ROUND_ROBIN: Cycles through access keys sequentially
 * - LEAST_LOAD: Smart selection based on server load (key count + bandwidth)
 * 
 * SELF_MANAGED Mode:
 * - Automatically creates access keys on available servers
 * - Keys are named: self-managed-dak-{dakId}
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createOutlineClient } from '@/lib/outline-api';
import { generateRandomString } from '@/lib/utils';
import { selectKeyByLeastLoad, selectLeastLoadedServer } from '@/lib/services/load-balancer';

/**
 * Simple CRC32 implementation for IP-based hashing
 * Used to consistently route the same client IP to the same server
 */
function crc32(str: string): number {
  let crc = 0xffffffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i);
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Get client IP address from request headers
 * Checks multiple headers for proxied requests
 */
function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  const clientIp = request.headers.get('x-client-ip');
  if (clientIp) {
    return clientIp;
  }

  return '127.0.0.1';
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

/**
 * Access key with server info for load balancing
 */
interface AccessKeyWithServer {
  id: string;
  accessUrl: string | null;
  password: string | null;
  port: number | null;
  method: string | null;
  status: string;
  server: {
    id: string;
    hostnameForAccessKeys: string | null;
    name: string;
  };
}

/**
 * Select an access key based on the load balancing algorithm
 */
async function selectAccessKey(
  dakId: string,
  accessKeys: AccessKeyWithServer[],
  algorithm: string,
  clientIp: string,
  lastSelectedKeyIndex: number
): Promise<{ key: AccessKeyWithServer; newIndex: number } | null> {
  if (accessKeys.length === 0) {
    return null;
  }

  if (accessKeys.length === 1) {
    return { key: accessKeys[0], newIndex: 0 };
  }

  let selectedIndex: number;

  switch (algorithm) {
    case 'IP_HASH': {
      // Use CRC32 hash of client IP for consistent routing
      const hash = crc32(clientIp);
      selectedIndex = hash % accessKeys.length;
      break;
    }

    case 'RANDOM': {
      // Random selection
      selectedIndex = Math.floor(Math.random() * accessKeys.length);
      break;
    }

    case 'ROUND_ROBIN': {
      // Cycle through keys sequentially
      selectedIndex = (lastSelectedKeyIndex + 1) % accessKeys.length;

      // Update the index in the database for next request
      await db.dynamicAccessKey.update({
        where: { id: dakId },
        data: { lastSelectedKeyIndex: selectedIndex },
      });
      break;
    }

    case 'LEAST_LOAD': {
      // Smart selection based on server load
      const keysWithServer = accessKeys.map((key, idx) => ({
        ...key,
        _originalIndex: idx,
        server: { id: key.server.id, name: key.server.name },
      }));
      const bestIndex = await selectKeyByLeastLoad(keysWithServer);
      selectedIndex = bestIndex ?? 0;
      break;
    }

    default:
      // Default to IP_HASH
      const defaultHash = crc32(clientIp);
      selectedIndex = defaultHash % accessKeys.length;
  }

  return { key: accessKeys[selectedIndex], newIndex: selectedIndex };
}

/**
 * Create or get existing self-managed access key for a Dynamic Access Key.
 * This implements OutlineAdmin-style SELF_MANAGED behavior.
 */
async function createSelfManagedKey(
  dakId: string,
  serverTagsJson: string | null,
  method: string | null,
  prefix: string | null,
  algorithm?: string
): Promise<{ accessUrl: string; server: { hostnameForAccessKeys: string | null } } | null> {
  const keyName = `self-managed-dak-${dakId}`;

  // Check if a key already exists for this DAK
  const existingKey = await db.accessKey.findFirst({
    where: {
      dynamicKeyId: dakId,
      name: { startsWith: 'self-managed-dak-' },
      status: 'ACTIVE',
    },
    include: {
      server: true,
    },
  });

  if (existingKey && existingKey.accessUrl) {
    return {
      accessUrl: existingKey.accessUrl,
      server: { hostnameForAccessKeys: existingKey.server.hostnameForAccessKeys },
    };
  }

  // Get available servers based on tags
  const serverTagIds: string[] = JSON.parse(serverTagsJson || '[]');

  let servers;
  if (serverTagIds.length > 0) {
    // Filter by tags
    servers = await db.server.findMany({
      where: {
        isActive: true,
        tags: {
          some: {
            tagId: { in: serverTagIds },
          },
        },
      },
    });
  } else {
    // Get all active servers
    servers = await db.server.findMany({
      where: { isActive: true },
    });
  }

  if (servers.length === 0) {
    return null;
  }

  // Select server based on algorithm
  let selectedServer;
  if (algorithm === 'LEAST_LOAD' && servers.length > 1) {
    // Use smart load-based selection
    const leastLoaded = await selectLeastLoadedServer(serverTagIds);
    if (leastLoaded) {
      selectedServer = servers.find(s => s.id === leastLoaded.serverId) || servers[0];
    } else {
      selectedServer = servers[Math.floor(Math.random() * servers.length)];
    }
  } else {
    // Default: random selection
    selectedServer = servers[Math.floor(Math.random() * servers.length)];
  }

  try {
    // Create key on Outline server
    const client = createOutlineClient(selectedServer.apiUrl, selectedServer.apiCertSha256);
    const outlineKey = await client.createAccessKey({
      name: keyName,
      method: method || 'chacha20-ietf-poly1305',
    });

    // Save to database and attach to Dynamic Key
    const subscriptionToken = generateRandomString(32);
    const newKey = await db.accessKey.create({
      data: {
        outlineKeyId: outlineKey.id,
        name: keyName,
        accessUrl: outlineKey.accessUrl,
        password: outlineKey.password,
        port: outlineKey.port,
        method: outlineKey.method,
        serverId: selectedServer.id,
        dynamicKeyId: dakId,
        status: 'ACTIVE',
        subscriptionToken,
        prefix: prefix,
      },
      include: {
        server: true,
      },
    });

    return {
      accessUrl: newKey.accessUrl!,
      server: { hostnameForAccessKeys: newKey.server.hostnameForAccessKeys },
    };
  } catch (error) {
    console.error('Failed to create self-managed key:', error);
    return null;
  }
}

/**
 * Build Outline-compatible JSON response from parsed SS URL
 */
function buildOutlineJson(
  parsed: {
    method: string;
    password: string;
    host: string;
    port: number;
  },
  prefix?: string | null
): object {
  const result: Record<string, unknown> = {
    server: parsed.host,
    server_port: parsed.port,
    password: parsed.password,
    method: parsed.method,
  };

  // Add prefix if specified (for restricted networks)
  if (prefix) {
    result.prefix = prefix;
  }

  return result;
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

    // Get client IP for load balancing
    const clientIp = getClientIp(request);

    // First, try to find a Dynamic Access Key by dynamicUrl
    const dynamicKey = await db.dynamicAccessKey.findUnique({
      where: { dynamicUrl: token },
      include: {
        accessKeys: {
          where: {
            status: 'ACTIVE',
          },
          include: {
            server: {
              select: {
                id: true,
                name: true,
                hostnameForAccessKeys: true,
                tags: {
                  include: {
                    tag: true,
                  },
                },
              },
            },
          },
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

      // Handle SELF_MANAGED vs MANUAL mode differently
      if (dynamicKey.type === 'SELF_MANAGED') {
        // SELF_MANAGED: Auto-create keys on demand
        const selfManagedResult = await createSelfManagedKey(
          dynamicKey.id,
          dynamicKey.serverTagsJson,
          dynamicKey.method,
          dynamicKey.prefix,
          dynamicKey.loadBalancerAlgorithm
        );

        if (!selfManagedResult) {
          return NextResponse.json(
            { error: 'No servers available. Please configure servers first.' },
            { status: 503 }
          );
        }

        // Parse and return
        const parsed = parseSSUrl(selfManagedResult.accessUrl);
        if (!parsed) {
          return new NextResponse(selfManagedResult.accessUrl, {
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        }

        return NextResponse.json(buildOutlineJson(parsed, dynamicKey.prefix), {
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        });
      }

      // MANUAL mode: Use attached keys with load balancing
      // Filter access keys by server tags if specified
      let availableKeys = dynamicKey.accessKeys;
      const serverTagIds: string[] = JSON.parse(dynamicKey.serverTagsJson || '[]');

      if (serverTagIds.length > 0) {
        // Filter keys to only those from servers with matching tags
        availableKeys = dynamicKey.accessKeys.filter((key) => {
          const serverTags = key.server.tags?.map((st) => st.tag.id) || [];
          return serverTagIds.some((tagId) => serverTags.includes(tagId));
        });
      }

      // Select an access key using the load balancing algorithm
      const selection = await selectAccessKey(
        dynamicKey.id,
        availableKeys as AccessKeyWithServer[],
        dynamicKey.loadBalancerAlgorithm,
        clientIp,
        dynamicKey.lastSelectedKeyIndex
      );

      if (!selection || !selection.key.accessUrl) {
        return NextResponse.json(
          { error: 'No active access key available. Please attach keys to this dynamic key.' },
          { status: 404 }
        );
      }

      const attachedKey = selection.key;
      const accessUrl = attachedKey.accessUrl as string;

      // Parse the access URL and return Outline-compatible JSON
      const parsed = parseSSUrl(accessUrl);

      if (!parsed) {
        // Return the raw ss:// URL if parsing fails
        return new NextResponse(accessUrl, {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
          },
        });
      }

      // Return Outline-compatible JSON with optional prefix
      return NextResponse.json(buildOutlineJson(parsed, dynamicKey.prefix), {
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

    // Return Outline-compatible JSON with optional prefix
    return NextResponse.json(buildOutlineJson(parsed, accessKey.prefix), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
    });
  } catch (error) {
    console.error('Subscription endpoint error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
