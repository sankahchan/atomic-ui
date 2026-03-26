import { db } from '@/lib/db';
import { resolveAccessKeyPublicIdentifier } from '@/lib/access-key-public-identifiers';

export const SUBSCRIPTION_EVENT_TYPES = {
  PAGE_VIEW: 'PAGE_VIEW',
  COPY_URL: 'COPY_URL',
  OPEN_QR: 'OPEN_QR',
  OPEN_APP: 'OPEN_APP',
  CLIENT_FETCH: 'CLIENT_FETCH',
  TELEGRAM_SENT: 'TELEGRAM_SENT',
  TELEGRAM_CONNECTED: 'TELEGRAM_CONNECTED',
} as const;

export type SubscriptionEventType =
  (typeof SUBSCRIPTION_EVENT_TYPES)[keyof typeof SUBSCRIPTION_EVENT_TYPES];

export async function recordSubscriptionPageEvent(input: {
  accessKeyId?: string | null;
  dynamicAccessKeyId?: string | null;
  eventType: string;
  source?: string | null;
  platform?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
}) {
  if (!input.accessKeyId && !input.dynamicAccessKeyId) {
    return null;
  }

  return db.subscriptionPageEvent.create({
    data: {
      accessKeyId: input.accessKeyId ?? null,
      dynamicAccessKeyId: input.dynamicAccessKeyId ?? null,
      eventType: input.eventType,
      source: input.source ?? null,
      platform: input.platform ?? null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    },
  });
}

export async function recordSubscriptionPageEventByToken(input: {
  token: string;
  eventType: string;
  source?: string | null;
  platform?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
}) {
  const resolvedAccessKey = await resolveAccessKeyPublicIdentifier(input.token);

  const [accessKey, dynamicKey] = await Promise.all([
    resolvedAccessKey
      ? db.accessKey.findUnique({
          where: { id: resolvedAccessKey.id },
          select: { id: true },
        })
      : Promise.resolve(null),
    db.dynamicAccessKey.findUnique({
      where: { dynamicUrl: input.token },
      select: { id: true },
    }),
  ]);

  const dynamicKeyBySlug = !dynamicKey
    ? await db.dynamicAccessKey.findFirst({
        where: { publicSlug: input.token },
        select: { id: true },
      })
    : null;

  if (!accessKey && !dynamicKey && !dynamicKeyBySlug) {
    return null;
  }

  return recordSubscriptionPageEvent({
    accessKeyId: accessKey?.id ?? null,
    dynamicAccessKeyId: dynamicKey?.id ?? dynamicKeyBySlug?.id ?? null,
    eventType: input.eventType,
    source: input.source ?? null,
    platform: input.platform ?? null,
    metadata: input.metadata ?? null,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });
}

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

export async function getAccessKeySubscriptionAnalytics(accessKeyId: string) {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [aggregate, recentEvents, lastViewedAt, lastCopiedAt, lastTelegramSentAt, lastQrScanAt, lastClientFetchAt] = await Promise.all([
    db.subscriptionPageEvent.groupBy({
      by: ['eventType'],
      where: { accessKeyId },
      _count: { eventType: true },
    }),
    db.subscriptionPageEvent.findMany({
      where: { accessKeyId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        eventType: true,
        source: true,
        platform: true,
        metadata: true,
        createdAt: true,
      },
    }),
    db.subscriptionPageEvent.findFirst({
      where: { accessKeyId, eventType: SUBSCRIPTION_EVENT_TYPES.PAGE_VIEW },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    db.subscriptionPageEvent.findFirst({
      where: { accessKeyId, eventType: SUBSCRIPTION_EVENT_TYPES.COPY_URL },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    db.subscriptionPageEvent.findFirst({
      where: { accessKeyId, eventType: SUBSCRIPTION_EVENT_TYPES.TELEGRAM_SENT },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    db.subscriptionPageEvent.findFirst({
      where: { accessKeyId, eventType: SUBSCRIPTION_EVENT_TYPES.OPEN_QR },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    db.subscriptionPageEvent.findFirst({
      where: { accessKeyId, eventType: SUBSCRIPTION_EVENT_TYPES.CLIENT_FETCH },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
  ]);

  const counts = Object.fromEntries(aggregate.map((row) => [row.eventType, row._count.eventType]));
  const last7dCount = await db.subscriptionPageEvent.count({
    where: {
      accessKeyId,
      createdAt: {
        gte: sevenDaysAgo,
      },
    },
  });

  return {
    counts: {
      pageViews: counts[SUBSCRIPTION_EVENT_TYPES.PAGE_VIEW] ?? 0,
      copyClicks: counts[SUBSCRIPTION_EVENT_TYPES.COPY_URL] ?? 0,
      qrOpens: counts[SUBSCRIPTION_EVENT_TYPES.OPEN_QR] ?? 0,
      appOpens: counts[SUBSCRIPTION_EVENT_TYPES.OPEN_APP] ?? 0,
      clientFetches: counts[SUBSCRIPTION_EVENT_TYPES.CLIENT_FETCH] ?? 0,
      telegramSends: counts[SUBSCRIPTION_EVENT_TYPES.TELEGRAM_SENT] ?? 0,
      telegramConnects: counts[SUBSCRIPTION_EVENT_TYPES.TELEGRAM_CONNECTED] ?? 0,
      last7dEvents: last7dCount,
    },
    lastViewedAt: lastViewedAt?.createdAt ?? null,
    lastCopiedAt: lastCopiedAt?.createdAt ?? null,
    lastQrScanAt: lastQrScanAt?.createdAt ?? null,
    lastClientFetchAt: lastClientFetchAt?.createdAt ?? null,
    lastTelegramSentAt: lastTelegramSentAt?.createdAt ?? null,
    recentEvents: recentEvents.map((event) => ({
      ...event,
      metadata: parseMetadata(event.metadata),
    })),
  };
}

export async function getDynamicKeySubscriptionAnalytics(dynamicAccessKeyId: string) {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [aggregate, recentEvents, lastViewedAt, lastCopiedAt, lastTelegramSentAt, lastQrScanAt, lastClientFetchAt] = await Promise.all([
    db.subscriptionPageEvent.groupBy({
      by: ['eventType'],
      where: { dynamicAccessKeyId },
      _count: { eventType: true },
    }),
    db.subscriptionPageEvent.findMany({
      where: { dynamicAccessKeyId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        eventType: true,
        source: true,
        platform: true,
        metadata: true,
        createdAt: true,
      },
    }),
    db.subscriptionPageEvent.findFirst({
      where: { dynamicAccessKeyId, eventType: SUBSCRIPTION_EVENT_TYPES.PAGE_VIEW },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    db.subscriptionPageEvent.findFirst({
      where: { dynamicAccessKeyId, eventType: SUBSCRIPTION_EVENT_TYPES.COPY_URL },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    db.subscriptionPageEvent.findFirst({
      where: { dynamicAccessKeyId, eventType: SUBSCRIPTION_EVENT_TYPES.TELEGRAM_SENT },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    db.subscriptionPageEvent.findFirst({
      where: { dynamicAccessKeyId, eventType: SUBSCRIPTION_EVENT_TYPES.OPEN_QR },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    db.subscriptionPageEvent.findFirst({
      where: { dynamicAccessKeyId, eventType: SUBSCRIPTION_EVENT_TYPES.CLIENT_FETCH },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
  ]);

  const counts = Object.fromEntries(aggregate.map((row) => [row.eventType, row._count.eventType]));
  const last7dCount = await db.subscriptionPageEvent.count({
    where: {
      dynamicAccessKeyId,
      createdAt: {
        gte: sevenDaysAgo,
      },
    },
  });

  return {
    counts: {
      pageViews: counts[SUBSCRIPTION_EVENT_TYPES.PAGE_VIEW] ?? 0,
      copyClicks: counts[SUBSCRIPTION_EVENT_TYPES.COPY_URL] ?? 0,
      qrOpens: counts[SUBSCRIPTION_EVENT_TYPES.OPEN_QR] ?? 0,
      appOpens: counts[SUBSCRIPTION_EVENT_TYPES.OPEN_APP] ?? 0,
      clientFetches: counts[SUBSCRIPTION_EVENT_TYPES.CLIENT_FETCH] ?? 0,
      telegramSends: counts[SUBSCRIPTION_EVENT_TYPES.TELEGRAM_SENT] ?? 0,
      telegramConnects: counts[SUBSCRIPTION_EVENT_TYPES.TELEGRAM_CONNECTED] ?? 0,
      last7dEvents: last7dCount,
    },
    lastViewedAt: lastViewedAt?.createdAt ?? null,
    lastCopiedAt: lastCopiedAt?.createdAt ?? null,
    lastQrScanAt: lastQrScanAt?.createdAt ?? null,
    lastClientFetchAt: lastClientFetchAt?.createdAt ?? null,
    lastTelegramSentAt: lastTelegramSentAt?.createdAt ?? null,
    recentEvents: recentEvents.map((event) => ({
      ...event,
      metadata: parseMetadata(event.metadata),
    })),
  };
}
