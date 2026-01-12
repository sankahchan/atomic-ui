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

    // Verify cron secret if provided (for automated calls)
    const expectedSecret = process.env.CRON_SECRET;
    if (expectedSecret && cronSecret && cronSecret !== expectedSecret) {
      return NextResponse.json(
        { error: 'Invalid cron secret' },
        { status: 401 }
      );
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
      return NextResponse.json({
        success: true,
        message: 'No active servers to check',
        results: [],
      });
    }

    // Run health checks in parallel
    const results = await Promise.all(
      servers.map((server) => performHealthCheck(server))
    );

    // Process results and update database
    for (const result of results) {
      await updateHealthCheckRecord(result);
    }

    // Check for status changes and send notifications
    await processStatusChanges(results);

    return NextResponse.json({
      success: true,
      message: `Checked ${results.length} server(s)`,
      results: results.map((r) => ({
        serverId: r.serverId,
        serverName: r.serverName,
        status: r.status,
        latencyMs: r.latencyMs,
        error: r.error,
      })),
    });
  } catch (error) {
    console.error('Health check error:', error);
    return NextResponse.json(
      { error: 'Health check failed', details: String(error) },
      { status: 500 }
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

    return NextResponse.json({
      success: true,
      servers: status,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Health status error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch health status' },
      { status: 500 }
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
async function processStatusChanges(results: HealthCheckResult[]): Promise<void> {
  // Get notification settings
  const notificationsEnabled = await prisma.settings.findUnique({
    where: { key: 'enableNotifications' },
  });

  if (notificationsEnabled?.value !== 'true') {
    return;
  }

  // Get notification channels
  const channels = await prisma.notificationChannel.findMany({
    where: { isActive: true },
  });

  if (channels.length === 0) {
    return;
  }

  // Check for servers that went down
  const downServers = results.filter((r) => r.status === 'DOWN');
  
  if (downServers.length > 0) {
    const message = formatAlertMessage(downServers);
    
    for (const channel of channels) {
      try {
        await sendNotification(channel, message);
      } catch (error) {
        console.error(`Failed to send notification via ${channel.type}:`, error);
      }
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
async function sendNotification(
  channel: {
    type: string;
    config: unknown;
  },
  message: string
): Promise<void> {
  const config = channel.config as Record<string, string>;

  switch (channel.type) {
    case 'TELEGRAM':
      await sendTelegramNotification(config, message);
      break;

    case 'WEBHOOK':
      await sendWebhookNotification(config, message);
      break;

    case 'EMAIL':
      // Email notification would go here
      console.log('Email notifications not yet implemented');
      break;

    default:
      console.warn(`Unknown notification channel type: ${channel.type}`);
  }
}

/**
 * Send a notification via Telegram Bot API.
 */
async function sendTelegramNotification(
  config: Record<string, string>,
  message: string
): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN || config.botToken;
  const chatId = config.chatId;

  if (!botToken || !chatId) {
    throw new Error('Telegram bot token or chat ID not configured');
  }

  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Telegram API error: ${error}`);
  }
}

/**
 * Send a notification via webhook.
 */
async function sendWebhookNotification(
  config: Record<string, string>,
  message: string
): Promise<void> {
  const webhookUrl = config.url;

  if (!webhookUrl) {
    throw new Error('Webhook URL not configured');
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.headers ? JSON.parse(config.headers) : {}),
    },
    body: JSON.stringify({
      type: 'server_alert',
      message,
      timestamp: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    throw new Error(`Webhook request failed: ${response.status}`);
  }
}
