import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { createOutlineClient } from '@/lib/outline-api';
import {
  CONNECTION_SESSION_TIMEOUT_MS,
  refreshAccessKeySessionCounts,
} from '@/lib/services/session-management';

// A smaller delta is enough to prove fresh traffic for the "Traffic Active" badge.
export const MIN_TRAFFIC_ACTIVITY_BYTES = BigInt(16 * 1024);
// A larger delta is used for the human-facing "last seen" timestamp.
export const MIN_MEANINGFUL_TRAFFIC_BYTES = BigInt(64 * 1024);
// Recent traffic badge window. Longer than the UI poll interval, but short enough
// that the badge drops quickly after traffic stops.
export const TRAFFIC_ACTIVE_WINDOW_MS = 60 * 1000;

export function isTrafficActive(lastTrafficAt: Date | null | undefined, now = new Date()) {
  if (!lastTrafficAt) {
    return false;
  }

  return now.getTime() - lastTrafficAt.getTime() <= TRAFFIC_ACTIVE_WINDOW_MS;
}

type ObservedAccessKey = {
  id: string;
  outlineKeyId: string;
  usageOffset: bigint | null;
  usedBytes: bigint;
  status: string;
  firstUsedAt: Date | null;
  lastTrafficAt: Date | null;
  lastUsedAt: Date | null;
  dataLimitBytes: bigint | null;
  durationDays: number | null;
  peakDevices: number;
  dynamicKeyId: string | null;
};

type CollectorOptions = {
  serverId?: string;
  keyIds?: string[];
  persist?: boolean;
};

export type CollectedAccessKeyTraffic = {
  id: string;
  usedBytes: bigint;
  lastTrafficAt: Date | null;
  isTrafficActive: boolean;
  recentTrafficDeltaBytes: bigint;
};

export type CollectedDynamicKeyTraffic = {
  id: string;
  usedBytes: bigint;
  lastTrafficAt: Date | null;
  isTrafficActive: boolean;
};

export async function collectTrafficActivity(options: CollectorOptions = {}) {
  const now = new Date();
  const persist = options.persist !== false;
  const staleThreshold = new Date(now.getTime() - CONNECTION_SESSION_TIMEOUT_MS);

  const servers = await db.server.findMany({
    where: {
      isActive: true,
      ...(options.serverId ? { id: options.serverId } : {}),
    },
    select: {
      id: true,
      apiUrl: true,
      apiCertSha256: true,
      accessKeys: {
        where: {
          status: 'ACTIVE',
          ...(options.keyIds && options.keyIds.length > 0 ? { id: { in: options.keyIds } } : {}),
        },
        select: {
          id: true,
          outlineKeyId: true,
          usageOffset: true,
          usedBytes: true,
          status: true,
          firstUsedAt: true,
          lastTrafficAt: true,
          lastUsedAt: true,
          dataLimitBytes: true,
          durationDays: true,
          peakDevices: true,
          dynamicKeyId: true,
        },
      },
    },
  });

  const observedByKeyId = new Map<string, CollectedAccessKeyTraffic>();
  const dynamicUsageMap = new Map<string, bigint>();
  const dynamicTrafficMap = new Map<string, Date>();
  const touchedSessionKeyIds = new Set<string>();
  const activeKeyIds: string[] = [];

  for (const server of servers) {
    for (const key of server.accessKeys) {
      activeKeyIds.push(key.id);
      observedByKeyId.set(key.id, {
        id: key.id,
        usedBytes: key.usedBytes,
        lastTrafficAt: key.lastTrafficAt,
        isTrafficActive: isTrafficActive(key.lastTrafficAt, now),
        recentTrafficDeltaBytes: BigInt(0),
      });
    }
  }

  await Promise.all(
    servers.map(async (server) => {
      if (server.accessKeys.length === 0) {
        return;
      }

      try {
        const client = createOutlineClient(server.apiUrl, server.apiCertSha256);
        const metrics = await client.getMetrics();
        const bytesTransferredByUserId = metrics?.bytesTransferredByUserId ?? {};

        for (const key of server.accessKeys) {
          const rawBytes =
            bytesTransferredByUserId[key.outlineKeyId] ??
            bytesTransferredByUserId[String(key.outlineKeyId)] ??
            0;

          const metricBytes = BigInt(rawBytes);
          const offset = key.usageOffset ?? BigInt(0);
          const effectiveUsedBytes = metricBytes < offset ? metricBytes : metricBytes - offset;
          const bytesDelta = effectiveUsedBytes - key.usedBytes;
          const hasFreshTraffic = bytesDelta >= MIN_TRAFFIC_ACTIVITY_BYTES;
          const hasMeaningfulTraffic = bytesDelta >= MIN_MEANINGFUL_TRAFFIC_BYTES;

          const updateData: Record<string, unknown> = {};

          if (effectiveUsedBytes !== key.usedBytes) {
            updateData.usedBytes = effectiveUsedBytes;
          }

          if (metricBytes < offset) {
            updateData.usageOffset = BigInt(0);
          }

          if (key.status === 'PENDING' && effectiveUsedBytes > BigInt(0)) {
            updateData.status = 'ACTIVE';
            updateData.firstUsedAt = key.firstUsedAt ?? now;

            if (key.durationDays) {
              const expiresAt = new Date(now);
              expiresAt.setDate(expiresAt.getDate() + key.durationDays);
              updateData.expiresAt = expiresAt;
            }
          }

          if (
            key.status === 'ACTIVE' &&
            key.dataLimitBytes &&
            effectiveUsedBytes >= key.dataLimitBytes
          ) {
            updateData.status = 'DEPLETED';
          }

          if (hasFreshTraffic) {
            updateData.lastTrafficAt = now;
            touchedSessionKeyIds.add(key.id);
          }

          if (hasMeaningfulTraffic) {
            updateData.lastUsedAt = now;
          }

          if (persist && Object.keys(updateData).length > 0) {
            await db.accessKey.update({
              where: { id: key.id },
              data: updateData,
            });
          }

          if (persist && hasFreshTraffic) {
            const activeSession = await db.connectionSession.findFirst({
              where: {
                accessKeyId: key.id,
                isActive: true,
              },
              orderBy: { startedAt: 'desc' },
              select: { id: true },
            });

            if (activeSession) {
              await db.connectionSession.update({
                where: { id: activeSession.id },
                data: {
                  lastActiveAt: now,
                  bytesUsed: {
                    increment: bytesDelta > BigInt(0) ? bytesDelta : BigInt(0),
                  },
                },
              });
            } else {
              await db.connectionSession.create({
                data: {
                  accessKeyId: key.id,
                  bytesUsed: bytesDelta > BigInt(0) ? bytesDelta : BigInt(0),
                },
              });
            }
          }

          const observedLastTrafficAt = hasFreshTraffic ? now : key.lastTrafficAt;
          observedByKeyId.set(key.id, {
            id: key.id,
            usedBytes: effectiveUsedBytes,
            lastTrafficAt: observedLastTrafficAt,
            isTrafficActive: isTrafficActive(observedLastTrafficAt, now),
            recentTrafficDeltaBytes: bytesDelta > BigInt(0) ? bytesDelta : BigInt(0),
          });

          if (key.dynamicKeyId) {
            dynamicUsageMap.set(
              key.dynamicKeyId,
              (dynamicUsageMap.get(key.dynamicKeyId) ?? BigInt(0)) + effectiveUsedBytes,
            );

            if (observedLastTrafficAt) {
              const currentTrafficAt = dynamicTrafficMap.get(key.dynamicKeyId);
              if (!currentTrafficAt || observedLastTrafficAt > currentTrafficAt) {
                dynamicTrafficMap.set(key.dynamicKeyId, observedLastTrafficAt);
              }
            }
          }
        }
      } catch (error) {
        logger.verbose('traffic-activity', 'Skipping traffic collection for unreachable server', {
          serverId: server.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  );

  if (persist) {
    const staleSessions = await db.connectionSession.findMany({
      where: {
        accessKeyId: { in: activeKeyIds },
        isActive: true,
        lastActiveAt: { lt: staleThreshold },
      },
      select: {
        id: true,
        accessKeyId: true,
      },
    });

    if (staleSessions.length > 0) {
      await db.connectionSession.updateMany({
        where: { id: { in: staleSessions.map((session) => session.id) } },
        data: {
          isActive: false,
          endedAt: now,
          endedReason: 'INACTIVITY_TIMEOUT',
        },
      });

      for (const session of staleSessions) {
        touchedSessionKeyIds.add(session.accessKeyId);
      }
    }

    await Promise.all(
      Array.from(touchedSessionKeyIds).map((accessKeyId) => refreshAccessKeySessionCounts(accessKeyId)),
    );
  }

  const dynamicIds = Array.from(dynamicUsageMap.keys());
  const dynamicCurrentState = dynamicIds.length
    ? await db.dynamicAccessKey.findMany({
        where: { id: { in: dynamicIds } },
        select: {
          id: true,
          usedBytes: true,
          firstUsedAt: true,
          lastTrafficAt: true,
        },
      })
    : [];

  const dynamicCurrentById = new Map(dynamicCurrentState.map((item) => [item.id, item]));
  const collectedDynamicKeys: CollectedDynamicKeyTraffic[] = [];

  for (const dynamicId of dynamicIds) {
    const usedBytes = dynamicUsageMap.get(dynamicId) ?? BigInt(0);
    const observedTrafficAt = dynamicTrafficMap.get(dynamicId) ?? dynamicCurrentById.get(dynamicId)?.lastTrafficAt ?? null;
    const current = dynamicCurrentById.get(dynamicId);
    const updateData: Record<string, unknown> = {};

    if (!current || current.usedBytes !== usedBytes) {
      updateData.usedBytes = usedBytes;
    }

    if (observedTrafficAt && (!current?.lastTrafficAt || observedTrafficAt > current.lastTrafficAt)) {
      updateData.lastTrafficAt = observedTrafficAt;
    }

    if (!current?.firstUsedAt && usedBytes > BigInt(0)) {
      updateData.firstUsedAt = now;
    }

    if (persist && Object.keys(updateData).length > 0) {
      await db.dynamicAccessKey.update({
        where: { id: dynamicId },
        data: updateData,
      });
    }

    collectedDynamicKeys.push({
      id: dynamicId,
      usedBytes,
      lastTrafficAt: observedTrafficAt,
      isTrafficActive: isTrafficActive(observedTrafficAt, now),
    });
  }

  return {
    now,
    accessKeys: Array.from(observedByKeyId.values()),
    dynamicKeys: collectedDynamicKeys,
  };
}
