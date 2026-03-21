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
} as const;

export type DynamicRoutingEventType =
  (typeof DYNAMIC_ROUTING_EVENT_TYPES)[keyof typeof DYNAMIC_ROUTING_EVENT_TYPES];

export type DynamicRoutingEventSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

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
  return db.dynamicRoutingEvent.create({
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
