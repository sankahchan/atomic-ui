/**
 * Health Check API Endpoint
 * 
 * This API route provides endpoints for managing server health checks.
 * Health checks are periodic tests that verify whether Outline servers
 * are reachable and responding correctly.
 * 
 * The endpoint serves two purposes:
 * 1. Manual trigger: POST /api/health-check to run health checks on demand
 * 2. Cron trigger: Can be called by external cron services or schedulers
 * 
 * For production use, you would typically set up a cron job or use a service
 * like Vercel Cron to call this endpoint at regular intervals (e.g., every 5 minutes).
 * 
 * Example cron setup in vercel.json:
 *   crons: [{ path: "/api/health-check", schedule: "every 5 minutes" }]
 */

import { NextRequest, NextResponse } from 'next/server';
import { db as prisma } from '@/lib/db';
import { OutlineClient } from '@/lib/outline-api';
import { getCurrentUser } from '@/lib/auth';
import {
  channelSupportsEvent,
  parseNotificationChannelRecord,
} from '@/lib/services/notification-channels';
import { enqueueNotificationsForChannels } from '@/lib/services/notification-queue';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

/**
 * Health check result for a single server.
 */
interface HealthCheckResult {
  serverId: string;
  serverName: string;
  status: 'UP' | 'DOWN' | 'SLOW';
  latencyMs: number | null;
  error?: string;
  checkedAt: Date;
}

/**
 * Threshold in milliseconds above which a server is considered "slow".
 * This helps identify servers that may be overloaded or experiencing issues.
 */
const SLOW_THRESHOLD_MS = 3000;

/**
 * Timeout for health check requests in milliseconds.
 * If a server doesn't respond within this time, it's marked as DOWN.
 */
const CHECK_TIMEOUT_MS = 10000;

/**
 * POST Handler
 * 
 * Triggers health checks for all active servers. This can be called manually
 * by administrators or automatically by a cron job.
 * 
 * The handler:
 * 1. Fetches all active servers from the database
 * 2. Performs health checks in parallel
 * 3. Updates the HealthCheck records with results
 * 4. Updates server metrics (uptime percentage)
 * 5. Triggers notifications for status changes
 * 
 * Query Parameters:
 * - serverId: Optional - Check only a specific server
 * - secret: Optional - API secret for cron authentication
 */
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const specificServerId = searchParams.get('serverId');
    const cronSecret = searchParams.get('secret');

    // Verify cron secret / admin session
    const expectedSecret = process.env.CRON_SECRET;
    const hasValidSecret = !!expectedSecret && cronSecret === expectedSecret;

    if (expectedSecret) {
      if (!hasValidSecret) {
        const user = await getCurrentUser();
        if (!user || user.role !== 'ADMIN') {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
      }
    } else {
      const user = await getCurrentUser();
      if (!user || user.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    // Fetch servers to check
    const servers = await prisma.server.findMany({
      where: {
        isActive: true,
        ...(specificServerId ? { id: specificServerId } : {}),
      },
      include: {
        healthCheck: true,
      },
    });

    if (servers.length === 0) {
      return NextResponse.json(
        {
          success: true,
          message: 'No active servers to check',
          results: [],
        },
        { headers: NO_STORE_HEADERS },
      );
    }

    // Run health checks in parallel
    const results = await Promise.all(
      servers.map((server) => performHealthCheck(server))
    );

    const previousStatusByServerId = new Map(
      servers.map((server) => [server.id, server.healthCheck?.lastStatus ?? 'UNKNOWN']),
    );

    // Process results and update database
    for (const result of results) {
      await updateHealthCheckRecord(result);
    }

    // Check for status changes and send notifications
    await processStatusChanges(results, previousStatusByServerId);

    return NextResponse.json(
      {
        success: true,
        message: `Checked ${results.length} server(s)`,
        results: results.map((r) => ({
          serverId: r.serverId,
          serverName: r.serverName,
          status: r.status,
          latencyMs: r.latencyMs,
          error: r.error,
        })),
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error('Health check error:', error);
    return NextResponse.json(
      { error: 'Health check failed', details: String(error) },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

/**
 * GET Handler
 * 
 * Returns the current health status of all servers without performing
 * new checks. This is useful for dashboards that need quick status updates.
 */
export async function GET() {
  try {
    const servers = await prisma.server.findMany({
      where: { isActive: true },
      include: {
        healthCheck: true,
        _count: {
          select: { accessKeys: true },
        },
      },
    });

    const status = servers.map((server) => ({
      id: server.id,
      name: server.name,
      status: server.healthCheck?.lastStatus || 'UNKNOWN',
      latencyMs: server.healthCheck?.lastLatencyMs || null,
      uptimePercent: server.healthCheck?.uptimePercent || 0,
      lastCheckedAt: server.healthCheck?.lastCheckedAt || null,
      keyCount: server._count.accessKeys,
    }));

    return NextResponse.json(
      {
        success: true,
        servers: status,
        checkedAt: new Date().toISOString(),
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error('Health status error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch health status' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

/**
 * Perform a health check on a single server.
 * 
 * This function creates an Outline API client and attempts to fetch the
 * server info endpoint. The response time is measured and the result is
 * categorized as UP, SLOW, or DOWN based on the response.
 */
async function performHealthCheck(server: {
  id: string;
  name: string;
  apiUrl: string;
  apiCertSha256: string;
}): Promise<HealthCheckResult> {
  const startTime = Date.now();
  
  try {
    // Create Outline client with timeout
    const client = new OutlineClient(server.apiUrl, server.apiCertSha256);
    
    // Perform the health check with timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Health check timeout')), CHECK_TIMEOUT_MS);
    });

    const checkPromise = client.healthCheck();
    
    // Race between check and timeout
    const result = await Promise.race([checkPromise, timeoutPromise]);
    
    const latencyMs = Date.now() - startTime;
    
    // Determine status based on latency
    const status = latencyMs > SLOW_THRESHOLD_MS ? 'SLOW' : 'UP';

    return {
      serverId: server.id,
      serverName: server.name,
      status,
      latencyMs,
      checkedAt: new Date(),
    };
  } catch (error) {
    return {
      serverId: server.id,
      serverName: server.name,
      status: 'DOWN',
      latencyMs: null,
      error: error instanceof Error ? error.message : 'Unknown error',
      checkedAt: new Date(),
    };
  }
}

/**
 * Update the HealthCheck record in the database with the check result.
 * 
 * This function also calculates the running uptime percentage using an
 * exponential moving average to smooth out temporary fluctuations.
 */
async function updateHealthCheckRecord(result: HealthCheckResult): Promise<void> {
  const { serverId, status, latencyMs, checkedAt } = result;

  // Get or create health check record
  const existing = await prisma.healthCheck.findUnique({
    where: { serverId },
  });

  // Calculate new uptime percentage using exponential moving average
  // Weight of 0.1 means recent checks have less impact on the overall average
  const isUp = status === 'UP' || status === 'SLOW';
  const currentUptime = existing?.uptimePercent ?? 100;
  const weight = 0.1;
  const newUptime = currentUptime * (1 - weight) + (isUp ? 100 : 0) * weight;

  // Update counters
  const totalChecks = (existing?.totalChecks || 0) + 1;
  const successfulChecks = (existing?.successfulChecks || 0) + (isUp ? 1 : 0);
  const failedChecks = (existing?.failedChecks || 0) + (isUp ? 0 : 1);

  // Update or create the record
  await prisma.healthCheck.upsert({
    where: { serverId },
    update: {
      lastStatus: status,
      lastLatencyMs: latencyMs,
      lastCheckedAt: checkedAt,
      uptimePercent: Math.round(newUptime * 100) / 100,
      totalChecks,
      successfulChecks,
      failedChecks,
    },
    create: {
      serverId,
      lastStatus: status,
      lastLatencyMs: latencyMs,
      lastCheckedAt: checkedAt,
      uptimePercent: newUptime,
      totalChecks: 1,
      successfulChecks: isUp ? 1 : 0,
      failedChecks: isUp ? 0 : 1,
    },
  });
}

/**
 * Process status changes and trigger notifications.
 * 
 * This function checks if any servers have changed status since the last
 * check and sends notifications through configured channels (Telegram, email, etc.)
 */
async function processStatusChanges(
  results: HealthCheckResult[],
  previousStatusByServerId: Map<string, string>,
): Promise<void> {
  // Get notification settings
  const notificationsEnabled = await prisma.settings.findUnique({
    where: { key: 'enableNotifications' },
  });

  if (notificationsEnabled?.value !== 'true') {
    return;
  }

  // Get notification channels
  const rawChannels = await prisma.notificationChannel.findMany({
    where: { isActive: true },
  });
  const channels = rawChannels
    .map((channel) => parseNotificationChannelRecord(channel))
    .filter((channel): channel is NonNullable<typeof channel> => Boolean(channel))
    .filter((channel) => channelSupportsEvent(channel, 'SERVER_DOWN'));

  if (channels.length === 0) {
    return;
  }

  // Check for servers that went down
  const downServers = results.filter(
    (result) => result.status === 'DOWN' && previousStatusByServerId.get(result.serverId) !== 'DOWN',
  );
  
  if (downServers.length > 0) {
    const message = formatAlertMessage(downServers);

    try {
      const cooldownKey = downServers
        .map((server) => server.serverId)
        .sort()
        .join(',');

      await enqueueNotificationsForChannels({
        channelIds: channels.map((channel) => channel.id),
        event: 'SERVER_DOWN',
        message,
        cooldownKey,
        payload: {
          type: 'server_alert',
          downServers: downServers.map((server) => ({
            serverId: server.serverId,
            serverName: server.serverName,
            status: server.status,
            latencyMs: server.latencyMs,
            error: server.error,
            checkedAt: server.checkedAt.toISOString(),
          })),
        },
      });
    } catch (error) {
      console.error('Failed to enqueue server down notifications:', error);
    }
  }
}

/**
 * Format an alert message for notification channels.
 */
function formatAlertMessage(downServers: HealthCheckResult[]): string {
  const serverList = downServers
    .map((s) => `• ${s.serverName}: ${s.error || 'Unreachable'}`)
    .join('\n');

  return `🚨 Server Alert

${downServers.length} server(s) are down:

${serverList}

Checked at: ${new Date().toISOString()}`;
}

/**
 * Send a notification through the specified channel.
 * 
 * Currently supports:
 * - Telegram: Sends via Telegram Bot API
 * - Email: Would integrate with email service (not implemented)
 * - Webhook: Sends POST request to configured URL
 */
