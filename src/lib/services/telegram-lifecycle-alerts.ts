import { db } from '@/lib/db';
import { sendAccessKeyLifecycleTelegramNotification } from '@/lib/services/telegram-bot-core';

export const TELEGRAM_DEPLETED_NOTIFICATION_EVENT = 'KEY_DEPLETED_TELEGRAM';

/** Pure candidate selection, kept separate from DB/network side effects. */
export function selectDepletedAlertCandidates(
  keys: Array<{ id: string }>,
  notifiedKeyIds: Iterable<string>,
) {
  const notified = new Set(notifiedKeyIds);
  return keys.filter((key) => !notified.has(key.id));
}

export async function runTelegramLifecycleAlertCycle(input?: { limit?: number }) {
  const result = {
    processed: 0,
    sent: 0,
    skipped: 0,
    errors: [] as string[],
  };

  const keys = await db.accessKey.findMany({
    where: {
      status: 'DEPLETED',
      telegramDeliveryEnabled: true,
    },
    select: { id: true },
    orderBy: { updatedAt: 'asc' },
    take: input?.limit ?? 100,
  });

  if (keys.length === 0) {
    return result;
  }

  const alreadySent = await db.notificationLog.findMany({
    where: {
      event: TELEGRAM_DEPLETED_NOTIFICATION_EVENT,
      accessKeyId: { in: keys.map((key) => key.id) },
    },
    select: { accessKeyId: true },
  });

  const candidates = selectDepletedAlertCandidates(
    keys,
    alreadySent.map((row) => row.accessKeyId).filter((id): id is string => Boolean(id)),
  );
  result.skipped = keys.length - candidates.length;

  for (const key of candidates) {
    result.processed++;
    try {
      const delivery = await sendAccessKeyLifecycleTelegramNotification({
        accessKeyId: key.id,
        type: 'DEPLETED',
      });
      if (!delivery) {
        // No bot config or no linked chat — retry on a later cycle.
        result.skipped++;
        continue;
      }

      await db.notificationLog.create({
        data: {
          event: TELEGRAM_DEPLETED_NOTIFICATION_EVENT,
          message: 'Sent Telegram data-depleted notice',
          status: 'SUCCESS',
          accessKeyId: key.id,
        },
      });
      result.sent++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`Key ${key.id}: ${message}`);
    }
  }

  return result;
}
