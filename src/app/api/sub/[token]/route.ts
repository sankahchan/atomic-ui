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
import {
  DYNAMIC_ROUTING_EVENT_TYPES,
  recordDynamicRoutingEvent,
  recordDynamicRoutingEventOnce,
} from '@/lib/services/dynamic-routing-events';
import {
  getSelfManagedServerCandidate,
  parseDynamicRoutingPreferences,
  selectDynamicAccessKeyForClient,
} from '@/lib/services/dynamic-subscription-routing';

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
  name: string;
  accessUrl: string | null;
  password: string | null;
  port: number | null;
  method: string | null;
  status: string;
  server: {
    id: string;
    hostnameForAccessKeys: string | null;
    name: string;
    countryCode?: string | null;
  };
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
  algorithm?: string,
  clientIp?: string,
  lastSelectedKeyIndex?: number,
  preferredServerIds?: string[],
  preferredCountryCodes?: string[],
  preferredServerWeights?: Record<string, number>,
  preferredCountryWeights?: Record<string, number>,
  preferredRegionMode?: 'PREFER' | 'ONLY',
  sessionStickinessMode?: 'NONE' | 'DRAIN',
  drainGraceMinutes?: number,
  pinnedAccessKeyId?: string | null,
  pinnedServerId?: string | null,
): Promise<{
  accessUrl: string;
  keyId: string;
  keyName: string;
  selectionReason: string;
  server: {
    id: string;
    name: string;
    countryCode: string | null;
    hostnameForAccessKeys: string | null;
  };
} | null> {
  const keyName = `self-managed-dak-${dakId}`;

  const existingKeys = await db.accessKey.findMany({
    where: {
      dynamicKeyId: dakId,
      name: { startsWith: 'self-managed-dak-' },
      status: 'ACTIVE',
    },
    include: {
      server: true,
    },
  });

  const pickExistingKey = () => {
    if (pinnedAccessKeyId) {
      const pinnedKey = existingKeys.find((key) => key.id === pinnedAccessKeyId && key.accessUrl);
      if (pinnedKey) {
        return pinnedKey;
      }
    }

    if (pinnedServerId) {
      const pinnedServerKey = existingKeys.find((key) => key.serverId === pinnedServerId && key.accessUrl);
      if (pinnedServerKey) {
        return pinnedServerKey;
      }
    }

    return [...existingKeys]
      .filter((key) => Boolean(key.accessUrl))
      .sort((left, right) => {
        const leftTime = (left.lastTrafficAt ?? left.lastUsedAt ?? left.createdAt).getTime();
        const rightTime = (right.lastTrafficAt ?? right.lastUsedAt ?? right.createdAt).getTime();
        return rightTime - leftTime;
      })[0] ?? null;
  };

  const existingKey = pickExistingKey();

  if (existingKey && existingKey.accessUrl) {
    return {
      accessUrl: existingKey.accessUrl,
      keyId: existingKey.id,
      keyName: existingKey.name,
      selectionReason: pinnedAccessKeyId || pinnedServerId
        ? 'Reusing the pinned self-managed backend for this dynamic key.'
        : 'Reusing the active self-managed backend that already exists for this dynamic key.',
      server: {
        id: existingKey.server.id,
        name: existingKey.server.name,
        countryCode: existingKey.server.countryCode ?? null,
        hostnameForAccessKeys: existingKey.server.hostnameForAccessKeys,
      },
    };
  }

  // Get available servers based on tags
  const serverTagIds: string[] = JSON.parse(serverTagsJson || '[]');

  const candidate = await getSelfManagedServerCandidate({
    dakId,
    serverTagIds,
    algorithm: (algorithm as 'IP_HASH' | 'RANDOM' | 'ROUND_ROBIN' | 'LEAST_LOAD') || 'IP_HASH',
    clientIp,
    lastSelectedKeyIndex,
    preferredServerIds,
    preferredCountryCodes,
    preferredServerWeights,
    preferredCountryWeights,
    preferredRegionMode,
    sessionStickinessMode,
    drainGraceMinutes,
    pinnedServerId,
    persistRoundRobin: true,
  });

  if (!candidate) {
    return null;
  }

  const selectedServer = await db.server.findUnique({
    where: { id: candidate.serverId },
  });

  if (!selectedServer) {
    return null;
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
      keyId: newKey.id,
      keyName: newKey.name,
      selectionReason: candidate.reason,
      server: {
        id: newKey.server.id,
        name: newKey.server.name,
        countryCode: newKey.server.countryCode ?? null,
        hostnameForAccessKeys: newKey.server.hostnameForAccessKeys,
      },
    };
  } catch (error) {
    console.error('Failed to create self-managed key:', error);
    return null;
  }
}

async function persistDynamicResolution(input: {
  dynamicAccessKey: {
    id: string;
    lastResolvedAccessKeyId: string | null;
    lastResolvedServerId: string | null;
  };
  next: {
    keyId: string | null;
    keyName: string | null;
    serverId: string | null;
    serverName: string | null;
    reason: string;
  };
  stickinessApplied?: boolean;
}) {
  const switched =
    input.dynamicAccessKey.lastResolvedAccessKeyId !== input.next.keyId ||
    input.dynamicAccessKey.lastResolvedServerId !== input.next.serverId;

  await db.dynamicAccessKey.update({
    where: { id: input.dynamicAccessKey.id },
    data: {
      lastResolvedAccessKeyId: input.next.keyId,
      lastResolvedServerId: input.next.serverId,
      lastResolvedAt: new Date(),
    },
  });

  if (switched && (input.dynamicAccessKey.lastResolvedAccessKeyId || input.dynamicAccessKey.lastResolvedServerId)) {
    await recordDynamicRoutingEvent({
      dynamicAccessKeyId: input.dynamicAccessKey.id,
      eventType: DYNAMIC_ROUTING_EVENT_TYPES.BACKEND_SWITCH,
      reason: input.next.reason,
      fromKeyId: input.dynamicAccessKey.lastResolvedAccessKeyId,
      fromServerId: input.dynamicAccessKey.lastResolvedServerId,
      toKeyId: input.next.keyId,
      toKeyName: input.next.keyName,
      toServerId: input.next.serverId,
      toServerName: input.next.serverName,
      metadata: {
        stickinessApplied: Boolean(input.stickinessApplied),
      },
    });
  } else if (input.stickinessApplied) {
    await recordDynamicRoutingEventOnce({
      dynamicAccessKeyId: input.dynamicAccessKey.id,
      eventType: DYNAMIC_ROUTING_EVENT_TYPES.STICKY_SESSION,
      reason: input.next.reason,
      windowMinutes: 30,
      metadata: {
        keyId: input.next.keyId,
        serverId: input.next.serverId,
      },
    });
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
export async function handleSubscriptionRequest(
  request: NextRequest,
  token: string,
) {
  try {
    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    // Get client IP for load balancing
    const clientIp = getClientIp(request);

    // First, try to find a Dynamic Access Key by dynamicUrl
    const dynamicKey = await db.dynamicAccessKey.findFirst({
      where: {
        OR: [
          { dynamicUrl: token },
          { publicSlug: token },
        ],
      },
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
      const routingPreferences = parseDynamicRoutingPreferences({
        preferredServerIdsJson: dynamicKey.preferredServerIdsJson,
        preferredCountryCodesJson: dynamicKey.preferredCountryCodesJson,
        preferredServerWeightsJson: dynamicKey.preferredServerWeightsJson,
        preferredCountryWeightsJson: dynamicKey.preferredCountryWeightsJson,
        preferredRegionMode: dynamicKey.preferredRegionMode,
        sessionStickinessMode: dynamicKey.sessionStickinessMode,
        drainGraceMinutes: dynamicKey.drainGraceMinutes,
      });

      if (dynamicKey.type === 'SELF_MANAGED') {
        // SELF_MANAGED: Auto-create keys on demand
        const selfManagedResult = await createSelfManagedKey(
          dynamicKey.id,
          dynamicKey.serverTagsJson,
          dynamicKey.method,
          dynamicKey.prefix,
          dynamicKey.loadBalancerAlgorithm,
          clientIp,
          dynamicKey.lastSelectedKeyIndex,
          routingPreferences.preferredServerIds,
          routingPreferences.preferredCountryCodes,
          routingPreferences.preferredServerWeights,
          routingPreferences.preferredCountryWeights,
          routingPreferences.preferredRegionMode,
          routingPreferences.sessionStickinessMode,
          routingPreferences.drainGraceMinutes,
          dynamicKey.pinnedAccessKeyId,
          dynamicKey.pinnedServerId,
        );

        if (!selfManagedResult) {
          await recordDynamicRoutingEventOnce({
            dynamicAccessKeyId: dynamicKey.id,
            eventType: DYNAMIC_ROUTING_EVENT_TYPES.NO_MATCH,
            severity: 'WARNING',
            reason: 'No self-managed server matched the current routing preferences.',
            windowMinutes: 30,
          });
          return NextResponse.json(
            { error: 'No servers available. Please configure servers first.' },
            { status: 503 }
          );
        }

        await persistDynamicResolution({
          dynamicAccessKey: {
            id: dynamicKey.id,
            lastResolvedAccessKeyId: dynamicKey.lastResolvedAccessKeyId,
            lastResolvedServerId: dynamicKey.lastResolvedServerId,
          },
          next: {
            keyId: selfManagedResult.keyId,
            keyName: selfManagedResult.keyName,
            serverId: selfManagedResult.server.id,
            serverName: selfManagedResult.server.name,
            reason: selfManagedResult.selectionReason,
          },
        });

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
      const selection = await selectDynamicAccessKeyForClient({
        dakId: dynamicKey.id,
        accessKeys: availableKeys as AccessKeyWithServer[],
        algorithm: dynamicKey.loadBalancerAlgorithm as 'IP_HASH' | 'RANDOM' | 'ROUND_ROBIN' | 'LEAST_LOAD',
        clientIp,
        lastSelectedKeyIndex: dynamicKey.lastSelectedKeyIndex,
        pinnedAccessKeyId: dynamicKey.pinnedAccessKeyId,
        preferredServerIds: routingPreferences.preferredServerIds,
        preferredCountryCodes: routingPreferences.preferredCountryCodes,
        preferredServerWeights: routingPreferences.preferredServerWeights,
        preferredCountryWeights: routingPreferences.preferredCountryWeights,
        preferredRegionMode: routingPreferences.preferredRegionMode,
        sessionStickinessMode: routingPreferences.sessionStickinessMode,
        drainGraceMinutes: routingPreferences.drainGraceMinutes,
        persistRoundRobin: true,
      });

      if (!selection || !selection.key.accessUrl) {
        await recordDynamicRoutingEventOnce({
          dynamicAccessKeyId: dynamicKey.id,
          eventType: DYNAMIC_ROUTING_EVENT_TYPES.NO_MATCH,
          severity: 'WARNING',
          reason: 'No attached backend matched the current dynamic routing preferences.',
          windowMinutes: 30,
        });
        return NextResponse.json(
          { error: 'No active access key available. Please attach keys to this dynamic key.' },
          { status: 404 }
        );
      }

      await persistDynamicResolution({
        dynamicAccessKey: {
          id: dynamicKey.id,
          lastResolvedAccessKeyId: dynamicKey.lastResolvedAccessKeyId,
          lastResolvedServerId: dynamicKey.lastResolvedServerId,
        },
        next: {
          keyId: selection.key.id,
          keyName: selection.key.name,
          serverId: selection.key.server.id,
          serverName: selection.key.server.name,
          reason: selection.selectionReason,
        },
        stickinessApplied: selection.stickinessApplied,
      });

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

    // Fall back to regular access key lookup by subscriptionToken or short slug
    const accessKey = await db.accessKey.findFirst({
      where: {
        OR: [
          { subscriptionToken: token },
          { publicSlug: token },
        ],
      },
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  return handleSubscriptionRequest(request, token);
}
