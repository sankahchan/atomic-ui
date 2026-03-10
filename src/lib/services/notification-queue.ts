import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import {
  getNotificationCooldownMinutes,
  isTestNotificationEvent,
  parseNotificationChannelRecord,
  sendNotificationToChannel,
} from '@/lib/services/notification-channels';

export const NOTIFICATION_DELIVERY_STATUSES = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  RETRYING: 'RETRYING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
} as const;

const CLAIMABLE_STATUSES = [
  NOTIFICATION_DELIVERY_STATUSES.PENDING,
  NOTIFICATION_DELIVERY_STATUSES.RETRYING,
] as const;

const RETRY_DELAYS_MS = [
  60_000,
  5 * 60_000,
  15 * 60_000,
  60 * 60_000,
];

export const DEFAULT_NOTIFICATION_MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

type QueueStatus = (typeof NOTIFICATION_DELIVERY_STATUSES)[keyof typeof NOTIFICATION_DELIVERY_STATUSES];
type WebhookPayloadMode = 'WRAPPED' | 'RAW';

function serializePayload(payload?: Record<string, unknown>) {
  return payload ? JSON.stringify(payload) : null;
}

function parsePayload(payload: string | null) {
  if (!payload) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(payload) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function getRetryDelayMs(attemptCount: number) {
  const retryIndex = Math.max(0, attemptCount - 1);
  return RETRY_DELAYS_MS[Math.min(retryIndex, RETRY_DELAYS_MS.length - 1)];
}

async function writeQueueFailureLog({
  channelId,
  event,
  message,
  accessKeyId,
  error,
}: {
  channelId?: string | null;
  event: string;
  message: string;
  accessKeyId?: string | null;
  error: string;
}) {
  await db.notificationLog.create({
    data: {
      channelId: channelId ?? null,
      event,
      message,
      status: 'FAILED',
      error,
      accessKeyId: accessKeyId ?? null,
    },
  });
}

async function writeQueueSkippedLog({
  channelId,
  event,
  message,
  accessKeyId,
  reason,
}: {
  channelId: string;
  event: string;
  message: string;
  accessKeyId?: string | null;
  reason: string;
}) {
  await db.notificationLog.create({
    data: {
      channelId,
      event,
      message,
      status: 'SKIPPED',
      error: reason,
      accessKeyId: accessKeyId ?? null,
    },
  });
}

async function finalizeDelivery({
  id,
  status,
  lastError,
  nextAttemptAt,
}: {
  id: string;
  status: QueueStatus;
  lastError?: string | null;
  nextAttemptAt?: Date;
}) {
  await db.notificationDelivery.update({
    where: { id },
    data: {
      status,
      lastError: lastError ?? null,
      processedAt:
        status === NOTIFICATION_DELIVERY_STATUSES.SUCCESS || status === NOTIFICATION_DELIVERY_STATUSES.FAILED
          ? new Date()
          : null,
      nextAttemptAt,
    },
  });
}

async function claimDelivery(id: string, currentStatus: string, now: Date) {
  const result = await db.notificationDelivery.updateMany({
    where: {
      id,
      status: currentStatus,
      nextAttemptAt: {
        lte: now,
      },
    },
    data: {
      status: NOTIFICATION_DELIVERY_STATUSES.PROCESSING,
      lastAttemptAt: now,
      lastError: null,
      processedAt: null,
      attemptCount: {
        increment: 1,
      },
    },
  });

  return result.count > 0;
}

async function processQueuedDelivery(id: string) {
  const delivery = await db.notificationDelivery.findUnique({
    where: { id },
  });

  if (!delivery) {
    return { processed: false, status: 'missing' as const };
  }

  if (!delivery.channelId) {
    const error = 'Notification channel no longer exists';
    await writeQueueFailureLog({
      event: delivery.event,
      message: delivery.message,
      accessKeyId: delivery.accessKeyId,
      error,
    });
    await finalizeDelivery({
      id: delivery.id,
      status: NOTIFICATION_DELIVERY_STATUSES.FAILED,
      lastError: error,
    });
    return { processed: true, status: 'failed' as const };
  }

  const channel = await db.notificationChannel.findUnique({
    where: { id: delivery.channelId },
  });

  if (!channel) {
    const error = 'Notification channel no longer exists';
    await writeQueueFailureLog({
      channelId: delivery.channelId,
      event: delivery.event,
      message: delivery.message,
      accessKeyId: delivery.accessKeyId,
      error,
    });
    await finalizeDelivery({
      id: delivery.id,
      status: NOTIFICATION_DELIVERY_STATUSES.FAILED,
      lastError: error,
    });
    return { processed: true, status: 'failed' as const };
  }

  if (!channel.isActive) {
    const error = 'Notification channel is inactive';
    await writeQueueFailureLog({
      channelId: channel.id,
      event: delivery.event,
      message: delivery.message,
      accessKeyId: delivery.accessKeyId,
      error,
    });
    await finalizeDelivery({
      id: delivery.id,
      status: NOTIFICATION_DELIVERY_STATUSES.FAILED,
      lastError: error,
    });
    return { processed: true, status: 'failed' as const };
  }

  const parsedChannel = parseNotificationChannelRecord(channel);
  if (!parsedChannel) {
    const error = 'Notification channel configuration is invalid';
    await writeQueueFailureLog({
      channelId: channel.id,
      event: delivery.event,
      message: delivery.message,
      accessKeyId: delivery.accessKeyId,
      error,
    });
    await finalizeDelivery({
      id: delivery.id,
      status: NOTIFICATION_DELIVERY_STATUSES.FAILED,
      lastError: error,
    });
    return { processed: true, status: 'failed' as const };
  }

  const result = await sendNotificationToChannel({
    channel: parsedChannel,
    event: delivery.event,
    message: delivery.message,
    payload: parsePayload(delivery.payload),
    accessKeyId: delivery.accessKeyId ?? undefined,
    rawWebhookBody: delivery.payloadMode === 'RAW',
  });

  if (result.success) {
    await finalizeDelivery({
      id: delivery.id,
      status: NOTIFICATION_DELIVERY_STATUSES.SUCCESS,
    });
    return { processed: true, status: 'success' as const };
  }

  if (delivery.attemptCount >= delivery.maxAttempts) {
    await finalizeDelivery({
      id: delivery.id,
      status: NOTIFICATION_DELIVERY_STATUSES.FAILED,
      lastError: result.error,
    });
    return { processed: true, status: 'failed' as const };
  }

  await finalizeDelivery({
    id: delivery.id,
    status: NOTIFICATION_DELIVERY_STATUSES.RETRYING,
    lastError: result.error,
    nextAttemptAt: new Date(Date.now() + getRetryDelayMs(delivery.attemptCount)),
  });

  return { processed: true, status: 'retrying' as const };
}

export async function enqueueNotificationDelivery({
  channelId,
  event,
  message,
  payload,
  accessKeyId,
  maxAttempts = DEFAULT_NOTIFICATION_MAX_ATTEMPTS,
  sourceLogId,
  payloadMode = 'WRAPPED',
  cooldownKey,
  bypassCooldown = false,
}: {
  channelId: string;
  event: string;
  message: string;
  payload?: Record<string, unknown>;
  accessKeyId?: string;
  maxAttempts?: number;
  sourceLogId?: string;
  payloadMode?: WebhookPayloadMode;
  cooldownKey?: string;
  bypassCooldown?: boolean;
}) {
  const channel = await db.notificationChannel.findUnique({
    where: { id: channelId },
  });

  if (!channel) {
    throw new Error('Notification channel not found');
  }

  const parsedChannel = parseNotificationChannelRecord(channel);
  if (!parsedChannel) {
    throw new Error('Notification channel configuration is invalid');
  }

  if (!parsedChannel.isActive) {
    throw new Error('Notification channel is inactive');
  }

  const resolvedCooldownKey = cooldownKey ?? accessKeyId ?? null;
  const cooldownMinutes = bypassCooldown ? 0 : getNotificationCooldownMinutes(parsedChannel, event);

  if (cooldownMinutes > 0 && !isTestNotificationEvent(event)) {
    const cooldownWindowStart = new Date(Date.now() - cooldownMinutes * 60 * 1000);

    const recentDelivery = await db.notificationDelivery.findFirst({
      where: {
        channelId,
        event,
        cooldownKey: resolvedCooldownKey,
        OR: [
          {
            status: {
              in: [
                NOTIFICATION_DELIVERY_STATUSES.PENDING,
                NOTIFICATION_DELIVERY_STATUSES.PROCESSING,
                NOTIFICATION_DELIVERY_STATUSES.RETRYING,
              ],
            },
          },
          {
            status: NOTIFICATION_DELIVERY_STATUSES.SUCCESS,
            processedAt: {
              gte: cooldownWindowStart,
            },
          },
        ],
      },
      orderBy: [
        { processedAt: 'desc' },
        { createdAt: 'desc' },
      ],
      select: {
        id: true,
        status: true,
        processedAt: true,
        nextAttemptAt: true,
      },
    });

    if (recentDelivery) {
      const blockedUntil =
        recentDelivery.status === NOTIFICATION_DELIVERY_STATUSES.SUCCESS && recentDelivery.processedAt
          ? new Date(recentDelivery.processedAt.getTime() + cooldownMinutes * 60 * 1000)
          : recentDelivery.nextAttemptAt ?? recentDelivery.processedAt ?? new Date();

      await writeQueueSkippedLog({
        channelId,
        event,
        message,
        accessKeyId,
        reason: `Suppressed by ${cooldownMinutes} minute cooldown until ${blockedUntil.toISOString()}`,
      });

      return {
        id: recentDelivery.id,
        suppressed: true as const,
        blockedUntil,
      };
    }
  }

  return db.notificationDelivery.create({
    data: {
      channelId,
      event,
      message,
      payload: serializePayload(payload),
      payloadMode,
      cooldownKey: resolvedCooldownKey,
      status: NOTIFICATION_DELIVERY_STATUSES.PENDING,
      maxAttempts,
      accessKeyId,
      sourceLogId,
    },
  });
}

export async function enqueueNotificationsForChannels({
  channelIds,
  event,
  message,
  payload,
  accessKeyId,
  maxAttempts = DEFAULT_NOTIFICATION_MAX_ATTEMPTS,
  payloadMode = 'WRAPPED',
  cooldownKey,
  bypassCooldown = false,
}: {
  channelIds: string[];
  event: string;
  message: string;
  payload?: Record<string, unknown>;
  accessKeyId?: string;
  maxAttempts?: number;
  payloadMode?: WebhookPayloadMode;
  cooldownKey?: string;
  bypassCooldown?: boolean;
}) {
  const uniqueChannelIds = Array.from(new Set(channelIds.filter(Boolean)));
  if (uniqueChannelIds.length === 0) {
    return { count: 0, suppressedCount: 0, deliveries: [] as Array<{ channelId: string; suppressed: boolean; notificationDeliveryId?: string; blockedUntil?: Date }> };
  }

  let count = 0;
  let suppressedCount = 0;
  const deliveries: Array<{
    channelId: string;
    suppressed: boolean;
    notificationDeliveryId?: string;
    blockedUntil?: Date;
  }> = [];

  for (const channelId of uniqueChannelIds) {
    const result = await enqueueNotificationDelivery({
      channelId,
      event,
      message,
      payload,
      accessKeyId,
      maxAttempts,
      payloadMode,
      cooldownKey,
      bypassCooldown,
    });

    if ('suppressed' in result && result.suppressed) {
      suppressedCount += 1;
      deliveries.push({
        channelId,
        suppressed: true,
        notificationDeliveryId: result.id,
        blockedUntil: result.blockedUntil,
      });
    } else {
      count += 1;
      deliveries.push({
        channelId,
        suppressed: false,
        notificationDeliveryId: result.id,
      });
    }
  }

  return { count, suppressedCount, deliveries };
}

export async function getNotificationQueueStatus() {
  const now = new Date();

  const [
    pendingCount,
    processingCount,
    retryingCount,
    failedCount,
    successTodayCount,
    dueNowCount,
    nextDelivery,
  ] = await Promise.all([
    db.notificationDelivery.count({
      where: { status: NOTIFICATION_DELIVERY_STATUSES.PENDING },
    }),
    db.notificationDelivery.count({
      where: { status: NOTIFICATION_DELIVERY_STATUSES.PROCESSING },
    }),
    db.notificationDelivery.count({
      where: { status: NOTIFICATION_DELIVERY_STATUSES.RETRYING },
    }),
    db.notificationDelivery.count({
      where: { status: NOTIFICATION_DELIVERY_STATUSES.FAILED },
    }),
    db.notificationDelivery.count({
      where: {
        status: NOTIFICATION_DELIVERY_STATUSES.SUCCESS,
        processedAt: {
          gte: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        },
      },
    }),
    db.notificationDelivery.count({
      where: {
        status: {
          in: [...CLAIMABLE_STATUSES],
        },
        nextAttemptAt: {
          lte: now,
        },
      },
    }),
    db.notificationDelivery.findFirst({
      where: {
        status: {
          in: [...CLAIMABLE_STATUSES],
        },
      },
      orderBy: { nextAttemptAt: 'asc' },
      select: {
        id: true,
        event: true,
        nextAttemptAt: true,
        status: true,
        channelId: true,
      },
    }),
  ]);

  return {
    pendingCount,
    processingCount,
    retryingCount,
    failedCount,
    successTodayCount,
    dueNowCount,
    nextDelivery,
  };
}

export async function processNotificationQueue({
  limit = 25,
}: {
  limit?: number;
} = {}) {
  const now = new Date();
  const candidates = await db.notificationDelivery.findMany({
    where: {
      status: {
        in: [...CLAIMABLE_STATUSES],
      },
      nextAttemptAt: {
        lte: now,
      },
    },
    orderBy: [
      { nextAttemptAt: 'asc' },
      { createdAt: 'asc' },
    ],
    take: limit,
    select: {
      id: true,
      status: true,
    },
  });

  const summary = {
    claimed: 0,
    delivered: 0,
    rescheduled: 0,
    failed: 0,
    skipped: 0,
  };

  for (const candidate of candidates) {
    const claimed = await claimDelivery(candidate.id, candidate.status, now);
    if (!claimed) {
      summary.skipped += 1;
      continue;
    }

    summary.claimed += 1;

    try {
      const result = await processQueuedDelivery(candidate.id);

      if (!result.processed) {
        summary.skipped += 1;
        continue;
      }

      if (result.status === 'success') {
        summary.delivered += 1;
      } else if (result.status === 'retrying') {
        summary.rescheduled += 1;
      } else if (result.status === 'failed') {
        summary.failed += 1;
      }
    } catch (error) {
      logger.error('Notification queue delivery processing failed', error);

      const delivery = await db.notificationDelivery.findUnique({
        where: { id: candidate.id },
        select: {
          id: true,
          attemptCount: true,
          maxAttempts: true,
        },
      });

      if (!delivery) {
        summary.skipped += 1;
        continue;
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown notification queue error';
      if (delivery.attemptCount >= delivery.maxAttempts) {
        await finalizeDelivery({
          id: delivery.id,
          status: NOTIFICATION_DELIVERY_STATUSES.FAILED,
          lastError: errorMessage,
        });
        summary.failed += 1;
      } else {
        await finalizeDelivery({
          id: delivery.id,
          status: NOTIFICATION_DELIVERY_STATUSES.RETRYING,
          lastError: errorMessage,
          nextAttemptAt: new Date(Date.now() + getRetryDelayMs(delivery.attemptCount)),
        });
        summary.rescheduled += 1;
      }
    }
  }

  return {
    ...summary,
    scanned: candidates.length,
  };
}
