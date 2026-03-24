import { db } from '@/lib/db';

export const DYNAMIC_ROUTING_EVENT_TYPES = {
  BACKEND_SWITCH: 'BACKEND_SWITCH',
  NO_MATCH: 'NO_MATCH',
  STICKY_SESSION: 'STICKY_SESSION',
  ROTATION_TRIGGERED: 'ROTATION_TRIGGERED',
  ROTATION_SKIPPED: 'ROTATION_SKIPPED',
  HEALTH_ALERT: 'HEALTH_ALERT',
  QUOTA_ALERT: 'QUOTA_ALERT',
  FLAPPING_ALERT: 'FLAPPING_ALERT',
  TEST_RUN: 'TEST_RUN',
  FAILOVER_SIMULATION: 'FAILOVER_SIMULATION',
  PIN_APPLIED: 'PIN_APPLIED',
  PIN_CLEARED: 'PIN_CLEARED',
} as const;

export type DynamicRoutingEventType =
  (typeof DYNAMIC_ROUTING_EVENT_TYPES)[keyof typeof DYNAMIC_ROUTING_EVENT_TYPES];

export type DynamicRoutingEventSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

const ALERT_EVENT_TYPES = new Set<string>([
  DYNAMIC_ROUTING_EVENT_TYPES.NO_MATCH,
  DYNAMIC_ROUTING_EVENT_TYPES.HEALTH_ALERT,
  DYNAMIC_ROUTING_EVENT_TYPES.QUOTA_ALERT,
  DYNAMIC_ROUTING_EVENT_TYPES.FLAPPING_ALERT,
]);

function parseMetadata(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function dispatchDynamicRoutingAlert(input: {
  dynamicAccessKeyId: string;
  eventType: string;
  severity: DynamicRoutingEventSeverity;
  reason: string;
  metadata?: Record<string, unknown> | null;
}) {
  if (!ALERT_EVENT_TYPES.has(input.eventType)) {
    return;
  }

  const dynamicKey = await db.dynamicAccessKey.findUnique({
    where: { id: input.dynamicAccessKeyId },
    select: {
      id: true,
      name: true,
      type: true,
      dynamicUrl: true,
      publicSlug: true,
    },
  });

  if (!dynamicKey) {
    return;
  }

  const [
    { channelSupportsEvent, parseNotificationChannelRecord },
    { enqueueNotificationDelivery },
    { sendAdminAlert },
  ] = await Promise.all([
    import('@/lib/services/notification-channels'),
    import('@/lib/services/notification-queue'),
    import('@/lib/services/telegram-bot'),
  ]);

  const channels = await db.notificationChannel.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      type: true,
      config: true,
      events: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const activeChannels = channels
    .map((channel) => parseNotificationChannelRecord(channel))
    .filter((channel): channel is NonNullable<typeof channel> => Boolean(channel))
    .filter((channel) => channelSupportsEvent(channel, 'DYNAMIC_ROUTING_ALERT'));

  const cooldownKey = `dynamic-routing:${dynamicKey.id}:${input.eventType}`;
  const message = `[Dynamic Routing][${input.severity}] ${dynamicKey.name}: ${input.reason}`;
  const payload = {
    dynamicAccessKeyId: dynamicKey.id,
    dynamicKeyName: dynamicKey.name,
    dynamicKeyType: dynamicKey.type,
    eventType: input.eventType,
    severity: input.severity,
    reason: input.reason,
    publicSlug: dynamicKey.publicSlug,
    dynamicUrl: dynamicKey.dynamicUrl,
    metadata: input.metadata ?? null,
  };

  for (const channel of activeChannels) {
    await enqueueNotificationDelivery({
      channelId: channel.id,
      event: 'DYNAMIC_ROUTING_ALERT',
      message,
      payload,
      payloadMode: channel.type === 'WEBHOOK' ? 'RAW' : 'WRAPPED',
      cooldownKey,
    });
  }

  if (!activeChannels.some((channel) => channel.type === 'TELEGRAM')) {
    await sendAdminAlert(
      `Dynamic routing alert\nKey: ${dynamicKey.name}\nSeverity: ${input.severity}\nReason: ${input.reason}`,
    );
  }

  await db.dynamicAccessKey.update({
    where: { id: dynamicKey.id },
    data: { lastRoutingAlertAt: new Date() },
  });
}

export async function recordDynamicRoutingEvent(input: {
  dynamicAccessKeyId: string;
  eventType: string;
  severity?: DynamicRoutingEventSeverity;
  reason: string;
  fromKeyId?: string | null;
  fromKeyName?: string | null;
  fromServerId?: string | null;
  fromServerName?: string | null;
  toKeyId?: string | null;
  toKeyName?: string | null;
  toServerId?: string | null;
  toServerName?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const created = await db.dynamicRoutingEvent.create({
    data: {
      dynamicAccessKeyId: input.dynamicAccessKeyId,
      eventType: input.eventType,
      severity: input.severity ?? 'INFO',
      reason: input.reason,
      fromKeyId: input.fromKeyId ?? null,
      fromKeyName: input.fromKeyName ?? null,
      fromServerId: input.fromServerId ?? null,
      fromServerName: input.fromServerName ?? null,
      toKeyId: input.toKeyId ?? null,
      toKeyName: input.toKeyName ?? null,
      toServerId: input.toServerId ?? null,
      toServerName: input.toServerName ?? null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    },
  });

  await dispatchDynamicRoutingAlert({
    dynamicAccessKeyId: input.dynamicAccessKeyId,
    eventType: input.eventType,
    severity: input.severity ?? 'INFO',
    reason: input.reason,
    metadata: input.metadata,
  });

  return created;
}

export async function recordDynamicRoutingEventOnce(input: {
  dynamicAccessKeyId: string;
  eventType: string;
  severity?: DynamicRoutingEventSeverity;
  reason: string;
  windowMinutes: number;
  metadata?: Record<string, unknown> | null;
}) {
  const since = new Date(Date.now() - input.windowMinutes * 60_000);
  const existing = await db.dynamicRoutingEvent.findFirst({
    where: {
      dynamicAccessKeyId: input.dynamicAccessKeyId,
      eventType: input.eventType,
      createdAt: {
        gte: since,
      },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });

  if (existing) {
    return existing;
  }

  return recordDynamicRoutingEvent({
    dynamicAccessKeyId: input.dynamicAccessKeyId,
    eventType: input.eventType,
    severity: input.severity,
    reason: input.reason,
    metadata: input.metadata,
  });
}

export async function getDynamicRoutingTimeline(dynamicAccessKeyId: string, limit = 12) {
  const events = await db.dynamicRoutingEvent.findMany({
    where: { dynamicAccessKeyId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return events.map((event) => ({
    ...event,
    metadata: parseMetadata(event.metadata),
  }));
}

export async function getDynamicRoutingAlerts(input: {
  dynamicAccessKeyId: string;
  usedBytes: bigint;
  dataLimitBytes?: bigint | null;
}) {
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60_000);
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60_000);

  const [recentEvents, recentSwitches] = await Promise.all([
    db.dynamicRoutingEvent.findMany({
      where: {
        dynamicAccessKeyId: input.dynamicAccessKeyId,
        createdAt: { gte: twentyFourHoursAgo },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    db.dynamicRoutingEvent.count({
      where: {
        dynamicAccessKeyId: input.dynamicAccessKeyId,
        eventType: DYNAMIC_ROUTING_EVENT_TYPES.BACKEND_SWITCH,
        createdAt: { gte: thirtyMinutesAgo },
      },
    }),
  ]);

  const alerts: Array<{
    id: string;
    severity: DynamicRoutingEventSeverity;
    title: string;
    description: string;
    createdAt: string;
  }> = [];

  if (input.dataLimitBytes && input.dataLimitBytes > BigInt(0)) {
    const usagePercent = Number((input.usedBytes * BigInt(100)) / input.dataLimitBytes);
    if (usagePercent >= 85) {
      alerts.push({
        id: 'quota',
        severity: usagePercent >= 95 ? 'CRITICAL' : 'WARNING',
        title: 'Quota threshold reached',
        description: `This dynamic key has used ${usagePercent}% of its configured traffic allowance.`,
        createdAt: new Date().toISOString(),
      });
    }
  }

  if (recentSwitches >= 3) {
    alerts.push({
      id: 'flapping',
      severity: 'WARNING',
      title: 'Backend flapping detected',
      description: `${recentSwitches} backend switches were recorded in the last 30 minutes.`,
      createdAt: new Date().toISOString(),
    });
  }

  const degradedEvent = recentEvents.find((event) =>
    event.eventType === DYNAMIC_ROUTING_EVENT_TYPES.HEALTH_ALERT ||
    event.eventType === DYNAMIC_ROUTING_EVENT_TYPES.NO_MATCH,
  );

  if (degradedEvent) {
    alerts.push({
      id: `event-${degradedEvent.id}`,
      severity: (degradedEvent.severity as DynamicRoutingEventSeverity) ?? 'WARNING',
      title: 'Routing degradation detected',
      description: degradedEvent.reason,
      createdAt: degradedEvent.createdAt.toISOString(),
    });
  }

  return alerts;
}

export async function evaluateDynamicKeyAlerts() {
  const daks = await db.dynamicAccessKey.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, usedBytes: true, dataLimitBytes: true }
  });
  
  for (const dak of daks) {
    const alerts = await getDynamicRoutingAlerts({
      dynamicAccessKeyId: dak.id,
      usedBytes: dak.usedBytes,
      dataLimitBytes: dak.dataLimitBytes,
    });
    
    for (const alert of alerts) {
      if (alert.id === 'flapping') {
        await recordDynamicRoutingEventOnce({
          dynamicAccessKeyId: dak.id,
          eventType: DYNAMIC_ROUTING_EVENT_TYPES.FLAPPING_ALERT,
          severity: alert.severity,
          reason: alert.description,
          windowMinutes: 60,
        });
      } else if (alert.id === 'quota') {
        await recordDynamicRoutingEventOnce({
          dynamicAccessKeyId: dak.id,
          eventType: DYNAMIC_ROUTING_EVENT_TYPES.QUOTA_ALERT,
          severity: alert.severity,
          reason: alert.description,
          windowMinutes: 24 * 60, // Warn about quota at most once per day
        });
      }
    }
  }
}
