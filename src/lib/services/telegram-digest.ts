import { db } from '@/lib/db';
import { getTelegramConfig, sendTelegramDigestToAdmins } from '@/lib/services/telegram-bot';

const TELEGRAM_DIGEST_STATE_KEY = 'telegram_digest_last_run';

function isSameLocalDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export async function runTelegramDigestCycle(input?: {
  force?: boolean;
  now?: Date;
}) {
  const force = input?.force ?? false;
  const now = input?.now ?? new Date();
  const config = await getTelegramConfig();

  if (!config) {
    return { skipped: true as const, reason: 'not-configured' };
  }

  if (!force && !config.dailyDigestEnabled) {
    return { skipped: true as const, reason: 'disabled' };
  }

  if (config.adminChatIds.length === 0) {
    return { skipped: true as const, reason: 'no-admin-chats' };
  }

  const lastRun = await db.settings.findUnique({
    where: { key: TELEGRAM_DIGEST_STATE_KEY },
    select: { value: true },
  });

  if (!force) {
    const scheduled = new Date(now);
    scheduled.setHours(config.dailyDigestHour ?? 9, config.dailyDigestMinute ?? 0, 0, 0);

    if (now.getTime() < scheduled.getTime()) {
      return { skipped: true as const, reason: 'scheduled-time-not-reached' };
    }

    if (lastRun?.value) {
      const lastRunAt = new Date(lastRun.value);
      if (!Number.isNaN(lastRunAt.getTime()) && isSameLocalDay(lastRunAt, now)) {
        return { skipped: true as const, reason: 'already-ran-today' };
      }
    }
  }

  const result = await sendTelegramDigestToAdmins({ now });

  if (!result.sent) {
    return { skipped: true as const, reason: result.reason };
  }

  await db.settings.upsert({
    where: { key: TELEGRAM_DIGEST_STATE_KEY },
    create: {
      key: TELEGRAM_DIGEST_STATE_KEY,
      value: now.toISOString(),
    },
    update: {
      value: now.toISOString(),
    },
  });

  return {
    skipped: false as const,
    adminChats: result.adminChats,
    lookbackHours: result.lookbackHours,
  };
}
