/**
 * Key Expiration Check API Endpoint
 * 
 * This API route handles the periodic checking and updating of access key
 * expiration status. It's designed to be called by a cron job or scheduler
 * to keep key statuses accurate.
 * 
 * The endpoint performs several critical tasks:
 * 
 * 1. Expires keys that have passed their expiration date
 * 2. Marks keys as depleted when they exceed their data limits
 * 3. Updates traffic usage from the Outline servers
 * 4. Sends notifications for expiring keys (configurable warning period)
 * 
 * This is essential for maintaining accurate billing and access control,
 * especially when combined with the START_ON_FIRST_USE expiration type
 * which only begins counting down after first connection.
 * 
 * URL: POST /api/tasks/check-expirations
 * 
 * Query Parameters:
 * - secret: Optional - API secret for cron authentication
 * 
 * Recommended cron schedule: Every 15-30 minutes
 */

import { NextRequest, NextResponse } from 'next/server';
import { db as prisma } from '@/lib/db';
import { OutlineClient } from '@/lib/outline-api';

/**
 * POST Handler
 * 
 * Triggers the expiration check process. This should be called periodically
 * by a cron job to ensure key statuses remain accurate.
 */
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const cronSecret = searchParams.get('secret');

    // Verify cron secret if provided
    const expectedSecret = process.env.CRON_SECRET;
    if (expectedSecret && cronSecret && cronSecret !== expectedSecret) {
      return NextResponse.json(
        { error: 'Invalid cron secret' },
        { status: 401 }
      );
    }

    // Run all expiration checks
    const results = await runExpirationChecks();

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      results,
    });
  } catch (error) {
    console.error('Expiration check error:', error);
    return NextResponse.json(
      { error: 'Expiration check failed', details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * Run all expiration checks and return a summary of actions taken.
 */
async function runExpirationChecks(): Promise<{
  expiredKeys: number;
  depletedKeys: number;
  expiringKeys: number;
  trafficSynced: number;
}> {
  const now = new Date();

  // Step 1: Expire keys that have passed their expiration date
  const expiredResult = await prisma.accessKey.updateMany({
    where: {
      status: { in: ['ACTIVE', 'PENDING'] },
      expiresAt: {
        not: null,
        lte: now,
      },
    },
    data: {
      status: 'EXPIRED',
    },
  });

  // Step 2: Sync traffic usage from Outline servers
  const trafficSyncResult = await syncTrafficUsage();

  // Step 3: Mark keys as depleted if they've exceeded their data limit
  // We need to do this after syncing traffic to have accurate usage data
  const keysToCheck = await prisma.accessKey.findMany({
    where: {
      status: 'ACTIVE',
      dataLimitBytes: { not: null },
    },
    select: {
      id: true,
      usedBytes: true,
      dataLimitBytes: true,
    },
  });

  let depletedCount = 0;
  for (const key of keysToCheck) {
    if (key.dataLimitBytes && key.usedBytes >= key.dataLimitBytes) {
      await prisma.accessKey.update({
        where: { id: key.id },
        data: { status: 'DEPLETED' },
      });
      depletedCount++;
    }
  }

  // Step 4: Find keys expiring soon and potentially send notifications
  const warningDays = await getWarningDays();
  const warningDate = new Date(now.getTime() + warningDays * 24 * 60 * 60 * 1000);

  const expiringKeys = await prisma.accessKey.count({
    where: {
      status: 'ACTIVE',
      expiresAt: {
        not: null,
        gte: now,
        lte: warningDate,
      },
    },
  });

  // Send expiration warning notifications if enabled
  if (expiringKeys > 0) {
    await sendExpirationWarnings(warningDays);
  }

  return {
    expiredKeys: expiredResult.count,
    depletedKeys: depletedCount,
    expiringKeys,
    trafficSynced: trafficSyncResult,
  };
}

/**
 * Sync traffic usage from all Outline servers.
 * 
 * This function fetches the current traffic metrics from each Outline server
 * and updates the corresponding access keys in the database. This is important
 * for accurate usage tracking and data limit enforcement.
 */
async function syncTrafficUsage(): Promise<number> {
  // Get all active servers
  const servers = await prisma.server.findMany({
    where: { isActive: true },
    include: {
      accessKeys: {
        where: { status: { in: ['ACTIVE', 'PENDING'] } },
        select: { id: true, outlineKeyId: true },
      },
    },
  });

  let syncedCount = 0;

  for (const server of servers) {
    try {
      // Create Outline client
      const client = new OutlineClient(server.apiUrl, server.apiCertSha256);

      // Fetch metrics from Outline
      const metrics = await client.getMetrics();

      if (!metrics || !metrics.bytesTransferredByUserId) {
        continue;
      }

      // Update each key's usage
      for (const key of server.accessKeys) {
        const outlineKeyId = key.outlineKeyId;
        if (!outlineKeyId) continue;

        const usage = metrics.bytesTransferredByUserId[outlineKeyId];
        if (typeof usage === 'number') {
          await prisma.accessKey.update({
            where: { id: key.id },
            data: { usedBytes: BigInt(usage) },
          });
          syncedCount++;

          // Also log traffic for historical tracking
          await logTrafficUsage(key.id, usage);
        }
      }
    } catch (error) {
      console.error(`Failed to sync traffic for server ${server.name}:`, error);
      // Continue with other servers even if one fails
    }
  }

  return syncedCount;
}

/**
 * Log traffic usage for historical tracking.
 * 
 * This creates periodic snapshots of traffic usage that can be used for
 * analytics, billing calculations, and usage trend analysis.
 */
async function logTrafficUsage(keyId: string, bytes: number): Promise<void> {
  // Create a new traffic log entry
  // Note: For high-frequency updates, consider batching or using a time-series database
  await prisma.trafficLog.create({
    data: {
      accessKeyId: keyId,
      bytesUsed: BigInt(bytes),
    },
  });
}

/**
 * Get the warning period in days from settings.
 */
async function getWarningDays(): Promise<number> {
  const setting = await prisma.settings.findUnique({
    where: { key: 'keyExpiryWarningDays' },
  });

  return setting?.value ? parseInt(setting.value) : 3;
}

/**
 * Send expiration warning notifications.
 * 
 * This notifies users (via configured channels) about keys that are about
 * to expire, giving them time to renew or take action.
 */
async function sendExpirationWarnings(warningDays: number): Promise<void> {
  // Check if notifications are enabled
  const notificationsEnabled = await prisma.settings.findUnique({
    where: { key: 'enableNotifications' },
  });

  if (notificationsEnabled?.value !== 'true') {
    return;
  }

  // Get keys expiring soon with their contact info
  const now = new Date();
  const warningDate = new Date(now.getTime() + warningDays * 24 * 60 * 60 * 1000);
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const expiringKeys = await prisma.accessKey.findMany({
    where: {
      status: 'ACTIVE',
      expiresAt: {
        not: null,
        gte: now,
        lte: warningDate,
      },
      OR: [
        { lastWarningSentAt: null },
        { lastWarningSentAt: { lt: twentyFourHoursAgo } }
      ]
    },
    include: {
      server: {
        select: { name: true },
      },
    },
    take: 50, // Limit to prevent overwhelming notification systems
  });

  if (expiringKeys.length === 0) {
    return;
  }

  // Get notification channels
  const channels = await prisma.notificationChannel.findMany({
    where: { isActive: true },
  });

  if (channels.length === 0) {
    return;
  }

  // Format and send notifications
  for (const key of expiringKeys) {
    const daysRemaining = Math.ceil(
      (key.expiresAt!.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
    );

    const message = `⏰ Expiration Warning

Key: ${key.name}
Server: ${key.server.name}
Expires in: ${daysRemaining} day(s)
Expires at: ${key.expiresAt!.toISOString()}

Please renew this key to maintain VPN access.`;

    let sent = false;

    // Send to appropriate channels based on key contact info
    for (const channel of channels) {
      try {
        // Check if this channel type matches the key's contact info
        const config = channel.config as unknown as Record<string, string>;

        if (channel.type === 'TELEGRAM' && key.telegramId) {
          await sendTelegramMessage(config.botToken || process.env.TELEGRAM_BOT_TOKEN!, key.telegramId, message);
          sent = true;
        }

        // Admin notification channel (always notify)
        if (config.notifyAdmin === 'true') {
          await sendTelegramMessage(
            config.botToken || process.env.TELEGRAM_BOT_TOKEN!,
            config.adminChatId || config.chatId,
            message
          );
          sent = true;
        }
      } catch (error) {
        console.error(`Failed to send expiration warning via ${channel.type}:`, error);
      }
    }

    // Update lastWarningSentAt if notification was attempted
    if (sent) {
      await prisma.accessKey.update({
        where: { id: key.id },
        data: { lastWarningSentAt: new Date() }
      });
    }
  }
}

/**
 * Send a message via Telegram.
 */
async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  message: string
): Promise<void> {
  if (!botToken || !chatId) {
    return;
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
