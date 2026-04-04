import { db } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { createOutlineClient } from '@/lib/outline-api';
import { sendAdminAlert } from '@/lib/services/telegram-runtime';
import { sendAccessKeySupportMessage } from '@/lib/services/telegram-bot';

export const DEVICE_LIMIT_ACTIVITY_WINDOW_MS = 30 * 60 * 1000;
export const DEVICE_LIMIT_DISABLE_DELAY_MS = 15 * 60 * 1000;

type DeviceLimitSourceEvent = {
  accessKeyId: string | null;
  ip: string | null;
  userAgent: string | null;
  platform: string | null;
  createdAt: Date;
};

export type DeviceLimitEvidence = {
  ip: string | null;
  userAgent: string | null;
  platform: string | null;
  lastSeenAt: Date;
};

export type DeviceLimitStage = 'OK' | 'WARNED' | 'PENDING_DISABLE' | 'SUPPRESSED' | 'DISABLED';

export type DeviceLimitSnapshot = {
  accessKeyId: string;
  maxDevices: number | null;
  observedDevices: number;
  overLimit: boolean;
  stage: DeviceLimitStage;
  disableAt: Date | null;
  suppressedUntil: Date | null;
  autoDisabledAt: Date | null;
  evidence: DeviceLimitEvidence[];
};

type SnapshotAccessKey = {
  id: string;
  maxDevices: number | null;
  status: string;
  deviceLimitExceededAt: Date | null;
  deviceLimitWarningSentAt: Date | null;
  deviceLimitSuppressedUntil: Date | null;
  deviceLimitAutoDisabledAt: Date | null;
};

type EnforcementAccessKey = SnapshotAccessKey & {
  name: string;
  email: string | null;
  telegramId: string | null;
  userId: string | null;
  outlineKeyId: string;
  estimatedDevices: number;
  peakDevices: number;
  deviceLimitLastObservedDevices: number | null;
  deviceLimitSuppressedUntil: Date | null;
  deviceLimitAutoDisabledAt: Date | null;
  server: {
    id: string;
    name: string;
    apiUrl: string;
    apiCertSha256: string;
  };
};

function normalizeUserAgent(userAgent: string | null | undefined) {
  return userAgent?.trim().toLowerCase() || 'unknown-agent';
}

export function buildDeviceFingerprint(ip: string | null | undefined, userAgent: string | null | undefined) {
  return `${ip?.trim() || 'unknown-ip'}::${normalizeUserAgent(userAgent)}`;
}

export function buildDeviceEvidenceMap(events: DeviceLimitSourceEvent[]) {
  const evidenceByKey = new Map<string, Map<string, DeviceLimitEvidence>>();

  for (const event of events) {
    if (!event.accessKeyId || !event.ip) {
      continue;
    }

    const keyEvidence = evidenceByKey.get(event.accessKeyId) ?? new Map<string, DeviceLimitEvidence>();
    const fingerprint = buildDeviceFingerprint(event.ip, event.userAgent);
    const existing = keyEvidence.get(fingerprint);

    if (!existing || existing.lastSeenAt < event.createdAt) {
      keyEvidence.set(fingerprint, {
        ip: event.ip,
        userAgent: event.userAgent,
        platform: event.platform,
        lastSeenAt: event.createdAt,
      });
    }

    evidenceByKey.set(event.accessKeyId, keyEvidence);
  }

  return evidenceByKey;
}

export function deriveDeviceLimitStage(input: {
  status: string;
  maxDevices: number | null;
  observedDevices: number;
  deviceLimitExceededAt: Date | null;
  deviceLimitWarningSentAt: Date | null;
  deviceLimitSuppressedUntil: Date | null;
  deviceLimitAutoDisabledAt: Date | null;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const overLimit = Boolean(
    input.maxDevices !== null &&
      input.maxDevices !== undefined &&
      input.maxDevices > 0 &&
      input.observedDevices > input.maxDevices,
  );

  const isSuppressed = Boolean(input.deviceLimitSuppressedUntil && input.deviceLimitSuppressedUntil > now);
  const disableAt =
    overLimit && input.deviceLimitExceededAt
      ? new Date(input.deviceLimitExceededAt.getTime() + DEVICE_LIMIT_DISABLE_DELAY_MS)
      : null;

  let stage: DeviceLimitStage = 'OK';
  if (input.status === 'DISABLED' && input.deviceLimitAutoDisabledAt) {
    stage = 'DISABLED';
  } else if (isSuppressed) {
    stage = 'SUPPRESSED';
  } else if (overLimit && input.deviceLimitWarningSentAt) {
    stage = disableAt && disableAt <= now ? 'PENDING_DISABLE' : 'WARNED';
  } else if (overLimit) {
    stage = 'WARNED';
  }

  return {
    overLimit,
    disableAt: isSuppressed ? null : disableAt,
    stage,
    suppressedUntil: input.deviceLimitSuppressedUntil,
    autoDisabledAt: input.deviceLimitAutoDisabledAt,
  };
}

export async function getAccessKeyDeviceLimitSnapshots(input: {
  accessKeys: SnapshotAccessKey[];
  now?: Date;
  includeEvidence?: boolean;
}) {
  const now = input.now ?? new Date();
  const accessKeyIds = input.accessKeys.map((key) => key.id);

  if (accessKeyIds.length === 0) {
    return new Map<string, DeviceLimitSnapshot>();
  }

  const cutoff = new Date(now.getTime() - DEVICE_LIMIT_ACTIVITY_WINDOW_MS);

  const [activeSessionCounts, subscriptionEvents] = await Promise.all([
    db.connectionSession.groupBy({
      by: ['accessKeyId'],
      where: {
        accessKeyId: { in: accessKeyIds },
        isActive: true,
      },
      _count: {
        accessKeyId: true,
      },
    }),
    db.subscriptionPageEvent.findMany({
      where: {
        accessKeyId: { in: accessKeyIds },
        createdAt: { gte: cutoff },
        ip: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        accessKeyId: true,
        ip: true,
        userAgent: true,
        platform: true,
        createdAt: true,
      },
    }),
  ]);

  const sessionCountByKey = new Map(
    activeSessionCounts.map((row) => [row.accessKeyId, row._count.accessKeyId]),
  );
  const evidenceByKey = buildDeviceEvidenceMap(subscriptionEvents);
  const result = new Map<string, DeviceLimitSnapshot>();

  for (const key of input.accessKeys) {
    const evidence = Array.from(evidenceByKey.get(key.id)?.values() ?? []).sort(
      (left, right) => right.lastSeenAt.getTime() - left.lastSeenAt.getTime(),
    );
    const activeSessionCount = sessionCountByKey.get(key.id) ?? 0;
    const observedDevices = Math.max(evidence.length, activeSessionCount > 0 ? 1 : 0);
    const state = deriveDeviceLimitStage({
      status: key.status,
      maxDevices: key.maxDevices,
      observedDevices,
      deviceLimitExceededAt: key.deviceLimitExceededAt,
      deviceLimitWarningSentAt: key.deviceLimitWarningSentAt,
      deviceLimitSuppressedUntil: key.deviceLimitSuppressedUntil,
      deviceLimitAutoDisabledAt: key.deviceLimitAutoDisabledAt,
      now,
    });

    result.set(key.id, {
      accessKeyId: key.id,
      maxDevices: key.maxDevices,
      observedDevices,
      overLimit: state.overLimit,
      stage: state.stage,
      disableAt: state.disableAt,
      suppressedUntil: state.suppressedUntil,
      autoDisabledAt: state.autoDisabledAt,
      evidence: input.includeEvidence ? evidence : [],
    });
  }

  return result;
}

async function sendDeviceLimitWarningNotifications(input: {
  key: EnforcementAccessKey;
  observedDevices: number;
}) {
  const message = input.key.maxDevices
    ? `We estimated that this key is active on more devices than allowed.\n\nLimit: ${input.key.maxDevices} device(s)\nCurrent estimate: ${input.observedDevices} device(s)\nWindow: recent activity from the last 30 minutes\n\nWhat to do now:\n• disconnect older devices first\n• wait a few minutes for old activity to disappear\n• contact support if the estimate looks wrong\n\nIf the estimate stays above the limit for about 15 minutes, the key will disable automatically.`
    : '';

  try {
    if (message) {
      await sendAccessKeySupportMessage({
        accessKeyId: input.key.id,
        message,
        source: 'device_limit_warning',
      });
    }
  } catch (error) {
    logger.warn('Failed to send device-limit warning to key owner', error);
  }

  try {
    await sendAdminAlert(
      [
        '📵 <b>Device limit warning</b>',
        '',
        `🔑 Key: <b>${input.key.name}</b>`,
        input.key.email ? `📧 Email: ${input.key.email}` : null,
        `🖥 Server: ${input.key.server.name}`,
        `📊 Estimated devices: <b>${input.observedDevices}</b>`,
        `🚦 Limit: <b>${input.key.maxDevices}</b>`,
        '🕒 Window: <b>last 30 minutes</b>',
      ]
        .filter(Boolean)
        .join('\n'),
    );
  } catch (error) {
    logger.warn('Failed to send device-limit warning admin alert', error);
  }
}

async function sendDeviceLimitDisabledNotifications(input: {
  key: EnforcementAccessKey;
  observedDevices: number;
}) {
  try {
    await sendAccessKeySupportMessage({
      accessKeyId: input.key.id,
      message: `Your key was disabled because the recent device estimate stayed above the allowed limit.\n\nLimit: ${input.key.maxDevices} device(s)\nCurrent estimate: ${input.observedDevices} device(s)\nWindow: recent activity from the last 30 minutes\n\nContact support if this looks wrong and we can review it.`,
      source: 'device_limit_disabled',
    });
  } catch (error) {
    logger.warn('Failed to send device-limit disabled message to key owner', error);
  }

  try {
    await sendAdminAlert(
      [
        '⛔ <b>Device limit auto-disabled</b>',
        '',
        `🔑 Key: <b>${input.key.name}</b>`,
        input.key.email ? `📧 Email: ${input.key.email}` : null,
        `🖥 Server: ${input.key.server.name}`,
        `📊 Estimated devices: <b>${input.observedDevices}</b>`,
        `🚦 Limit: <b>${input.key.maxDevices}</b>`,
        '🕒 Window: <b>last 30 minutes</b>',
      ]
        .filter(Boolean)
        .join('\n'),
    );
  } catch (error) {
    logger.warn('Failed to send device-limit disabled admin alert', error);
  }
}

async function disableKeyForDeviceLimit(input: {
  key: EnforcementAccessKey;
  observedDevices: number;
  now: Date;
}) {
  const client = createOutlineClient(input.key.server.apiUrl, input.key.server.apiCertSha256);

  try {
    await client.deleteAccessKey(input.key.outlineKeyId);
  } catch (error) {
    logger.error(`Failed to delete key ${input.key.outlineKeyId} for device-limit enforcement`, error);
  }

  await db.$transaction(async (tx) => {
    await tx.accessKey.update({
      where: { id: input.key.id },
      data: {
        status: 'DISABLED',
        disabledAt: input.now,
        disabledOutlineKeyId: input.key.outlineKeyId,
        estimatedDevices: 0,
        deviceLimitLastObservedDevices: input.observedDevices,
        deviceLimitAutoDisabledAt: input.now,
      },
    });

    await tx.connectionSession.updateMany({
      where: {
        accessKeyId: input.key.id,
        isActive: true,
      },
      data: {
        isActive: false,
        endedAt: input.now,
        endedReason: 'KEY_DISABLED',
      },
    });

    await tx.notificationLog.create({
      data: {
        event: 'DEVICE_LIMIT_DISABLED',
        message: `Device limit exceeded: ${input.observedDevices}/${input.key.maxDevices}`,
        status: 'SUCCESS',
        accessKeyId: input.key.id,
      },
    });
  });

  await writeAuditLog({
    action: 'ACCESS_KEY_DEVICE_LIMIT_DISABLED',
    entity: 'ACCESS_KEY',
    entityId: input.key.id,
    details: {
      observedDevices: input.observedDevices,
      maxDevices: input.key.maxDevices,
      serverId: input.key.server.id,
      scheduler: true,
    },
  });

  await sendDeviceLimitDisabledNotifications({
    key: input.key,
    observedDevices: input.observedDevices,
  });
}

export async function runAccessKeyDeviceLimitCycle(now = new Date()) {
  const keys = await db.accessKey.findMany({
    where: {
      maxDevices: { not: null },
      status: 'ACTIVE',
    },
    include: {
      server: {
        select: {
          id: true,
          name: true,
          apiUrl: true,
          apiCertSha256: true,
        },
      },
    },
  });

  if (keys.length === 0) {
    return {
      scanned: 0,
      warned: 0,
      disabled: 0,
      cleared: 0,
      errors: [] as string[],
    };
  }

  const snapshots = await getAccessKeyDeviceLimitSnapshots({
    accessKeys: keys.map((key) => ({
      id: key.id,
      maxDevices: key.maxDevices,
      status: key.status,
      deviceLimitExceededAt: key.deviceLimitExceededAt,
      deviceLimitWarningSentAt: key.deviceLimitWarningSentAt,
      deviceLimitSuppressedUntil: key.deviceLimitSuppressedUntil,
      deviceLimitAutoDisabledAt: key.deviceLimitAutoDisabledAt,
    })),
    now,
  });

  let warned = 0;
  let disabled = 0;
  let cleared = 0;
  const errors: string[] = [];

  for (const key of keys) {
    const snapshot = snapshots.get(key.id);
    if (!snapshot || key.maxDevices == null) {
      continue;
    }

    const nextPeakDevices = Math.max(key.peakDevices || 0, snapshot.observedDevices);
    const isSuppressed = Boolean(key.deviceLimitSuppressedUntil && key.deviceLimitSuppressedUntil > now);
    const shouldClearState =
      !snapshot.overLimit &&
      (key.deviceLimitExceededAt || key.deviceLimitWarningSentAt || key.deviceLimitLastObservedDevices !== snapshot.observedDevices || nextPeakDevices !== (key.peakDevices || 0));

    if (isSuppressed) {
      if (
        key.deviceLimitExceededAt ||
        key.deviceLimitWarningSentAt ||
        key.deviceLimitLastObservedDevices !== snapshot.observedDevices ||
        nextPeakDevices !== (key.peakDevices || 0)
      ) {
        await db.accessKey.update({
          where: { id: key.id },
          data: {
            deviceLimitExceededAt: null,
            deviceLimitWarningSentAt: null,
            deviceLimitLastObservedDevices: snapshot.observedDevices,
            peakDevices: nextPeakDevices,
          },
        });
      }
      continue;
    }

    if (shouldClearState) {
      await db.accessKey.update({
        where: { id: key.id },
        data: {
          deviceLimitExceededAt: null,
          deviceLimitWarningSentAt: null,
          deviceLimitLastObservedDevices: snapshot.observedDevices,
          peakDevices: nextPeakDevices,
        },
      });
      cleared += 1;
      continue;
    }

    if (!snapshot.overLimit) {
      if (nextPeakDevices !== (key.peakDevices || 0) || key.deviceLimitLastObservedDevices !== snapshot.observedDevices) {
        await db.accessKey.update({
          where: { id: key.id },
          data: {
            deviceLimitLastObservedDevices: snapshot.observedDevices,
            peakDevices: nextPeakDevices,
          },
        });
      }
      continue;
    }

    try {
      if (!key.deviceLimitExceededAt) {
        await db.accessKey.update({
          where: { id: key.id },
          data: {
            deviceLimitExceededAt: now,
            deviceLimitWarningSentAt: now,
            deviceLimitLastObservedDevices: snapshot.observedDevices,
            peakDevices: nextPeakDevices,
          },
        });

        await db.notificationLog.create({
          data: {
            event: 'DEVICE_LIMIT_WARNING',
            message: `Device limit warning: ${snapshot.observedDevices}/${key.maxDevices}`,
            status: 'SUCCESS',
            accessKeyId: key.id,
          },
        });

        await writeAuditLog({
          action: 'ACCESS_KEY_DEVICE_LIMIT_WARNED',
          entity: 'ACCESS_KEY',
          entityId: key.id,
          details: {
            observedDevices: snapshot.observedDevices,
            maxDevices: key.maxDevices,
            serverId: key.server.id,
            scheduler: true,
          },
        });

        await sendDeviceLimitWarningNotifications({
          key,
          observedDevices: snapshot.observedDevices,
        });

        warned += 1;
        continue;
      }

      await db.accessKey.update({
        where: { id: key.id },
        data: {
          deviceLimitLastObservedDevices: snapshot.observedDevices,
          peakDevices: nextPeakDevices,
        },
      });

      const disableAt = new Date(key.deviceLimitExceededAt.getTime() + DEVICE_LIMIT_DISABLE_DELAY_MS);
      if (disableAt <= now) {
        await disableKeyForDeviceLimit({
          key,
          observedDevices: snapshot.observedDevices,
          now,
        });
        disabled += 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${key.id}: ${message}`);
      logger.error('Device limit enforcement failed', {
        accessKeyId: key.id,
        error: message,
      });
    }
  }

  return {
    scanned: keys.length,
    warned,
    disabled,
    cleared,
    errors,
  };
}
