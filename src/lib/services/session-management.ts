import { db } from '@/lib/db';

// A session should fall out quickly after traffic stops so the UI does not
// keep keys "online" long after the client disconnects.
export const CONNECTION_SESSION_TIMEOUT_MS = 60 * 1000;

// The dashboard online pill is intentionally shorter-lived than the
// underlying session timeout so presence clears fast without tearing down
// device/session history immediately.
export const ONLINE_ACTIVITY_WINDOW_MS = 20 * 1000;

export function isConnectionSessionStale(lastActiveAt: Date, now = new Date()) {
  return now.getTime() - lastActiveAt.getTime() > CONNECTION_SESSION_TIMEOUT_MS;
}

export function getConnectionSessionDurationMinutes(session: {
  startedAt: Date;
  endedAt: Date | null;
}, now = new Date()) {
  const endTime = session.endedAt ?? now;
  return Math.max(0, Math.round((endTime.getTime() - session.startedAt.getTime()) / 60000));
}

export async function refreshAccessKeySessionCounts(accessKeyId: string) {
  const [activeSessionCount, accessKey] = await Promise.all([
    db.connectionSession.count({
      where: {
        accessKeyId,
        isActive: true,
      },
    }),
    db.accessKey.findUnique({
      where: { id: accessKeyId },
      select: {
        peakDevices: true,
      },
    }),
  ]);

  if (!accessKey) {
    return null;
  }

  const peakDevices = Math.max(accessKey.peakDevices ?? 0, activeSessionCount);

  await db.accessKey.update({
    where: { id: accessKeyId },
    data: {
      estimatedDevices: activeSessionCount,
      peakDevices,
    },
  });

  return {
    estimatedDevices: activeSessionCount,
    peakDevices,
  };
}
