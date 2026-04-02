import { db } from '@/lib/db';
import {
  getTelegramConfig,
  getTelegramSupportLink,
  sendTelegramMessage,
} from '@/lib/services/telegram-runtime';
import { escapeHtml } from '@/lib/services/telegram-ui';

export type TelegramAnnouncementAudience =
  | 'ACTIVE_USERS'
  | 'STANDARD_USERS'
  | 'PREMIUM_USERS'
  | 'TRIAL_USERS';

export type TelegramAnnouncementType =
  | 'INFO'
  | 'ANNOUNCEMENT'
  | 'PROMO'
  | 'NEW_SERVER'
  | 'MAINTENANCE';

function parseCsvTags(value?: string | null) {
  return new Set(
    (value || '')
      .split(',')
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean),
  );
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

export async function getTelegramAnnouncementAudienceMap() {
  const [accessKeys, dynamicKeys] = await Promise.all([
    db.accessKey.findMany({
      where: {
        status: { in: ['ACTIVE', 'PENDING'] },
      },
      select: {
        telegramId: true,
        tags: true,
        user: {
          select: {
            telegramChatId: true,
          },
        },
      },
    }),
    db.dynamicAccessKey.findMany({
      where: {
        status: 'ACTIVE',
      },
      select: {
        telegramId: true,
        user: {
          select: {
            telegramChatId: true,
          },
        },
      },
    }),
  ]);

  const standardChats = uniqueStrings(
    accessKeys
      .filter((key) => !parseCsvTags(key.tags).has('trial'))
      .flatMap((key) => [key.telegramId, key.user?.telegramChatId]),
  );
  const trialChats = uniqueStrings(
    accessKeys
      .filter((key) => parseCsvTags(key.tags).has('trial'))
      .flatMap((key) => [key.telegramId, key.user?.telegramChatId]),
  );
  const premiumChats = uniqueStrings(
    dynamicKeys.flatMap((key) => [key.telegramId, key.user?.telegramChatId]),
  );
  const activeChats = uniqueStrings([...standardChats, ...trialChats, ...premiumChats]);

  return {
    ACTIVE_USERS: activeChats,
    STANDARD_USERS: standardChats,
    PREMIUM_USERS: premiumChats,
    TRIAL_USERS: trialChats,
  } satisfies Record<TelegramAnnouncementAudience, string[]>;
}

export function buildTelegramAnnouncementMessage(input: {
  type: TelegramAnnouncementType;
  title: string;
  message: string;
}) {
  const heading =
    input.type === 'PROMO'
      ? '🎁 <b>Special offer</b>'
      : input.type === 'NEW_SERVER'
        ? '🛰️ <b>New server update</b>'
        : input.type === 'MAINTENANCE'
          ? '🛠 <b>Service update</b>'
          : input.type === 'INFO'
            ? 'ℹ️ <b>Information</b>'
            : '📣 <b>Announcement</b>';

  return [
    heading,
    '',
    `<b>${escapeHtml(input.title.trim())}</b>`,
    escapeHtml(input.message.trim()),
  ].join('\n');
}

function getAnnouncementStatusFromCounts(sentCount: number, failedCount: number) {
  if (sentCount > 0 && failedCount === 0) {
    return 'SENT';
  }
  if (sentCount > 0 && failedCount > 0) {
    return 'PARTIAL';
  }
  if (sentCount === 0 && failedCount > 0) {
    return 'FAILED';
  }
  return 'SCHEDULED';
}

export async function dispatchTelegramAnnouncement(input: {
  announcementId: string;
  resendFailedOnly?: boolean;
  now?: Date;
}) {
  const resendFailedOnly = input.resendFailedOnly ?? false;
  const now = input.now ?? new Date();

  const [config, announcement] = await Promise.all([
    getTelegramConfig(),
    db.telegramAnnouncement.findUnique({
      where: { id: input.announcementId },
    }),
  ]);

  if (!announcement) {
    return { skipped: true as const, reason: 'not-found' };
  }

  if (!config?.botToken) {
    return { skipped: true as const, reason: 'not-configured' };
  }

  const audienceMap = await getTelegramAnnouncementAudienceMap();
  const audience = announcement.audience as TelegramAnnouncementAudience;
  const chatIds = audienceMap[audience] || [];

  if (chatIds.length === 0) {
    await db.telegramAnnouncement.update({
      where: { id: announcement.id },
      data: {
        status: 'FAILED',
        lastAttemptedAt: now,
        sentAt: announcement.sentAt ?? now,
        totalRecipients: 0,
        sentCount: 0,
        failedCount: 0,
      },
    });
    return { skipped: true as const, reason: 'no-matching-users' };
  }

  const existingDeliveries = await db.telegramAnnouncementDelivery.findMany({
    where: { announcementId: announcement.id },
    select: {
      id: true,
      chatId: true,
      status: true,
    },
  });

  const existingByChatId = new Map(existingDeliveries.map((delivery) => [delivery.chatId, delivery]));
  const missingChatIds = chatIds.filter((chatId) => !existingByChatId.has(chatId));

  if (missingChatIds.length > 0) {
    await db.telegramAnnouncementDelivery.createMany({
      data: missingChatIds.map((chatId) => ({
        announcementId: announcement.id,
        chatId,
        status: 'PENDING',
      })),
    });
  }

  await db.telegramAnnouncement.update({
    where: { id: announcement.id },
    data: {
      status: 'PROCESSING',
      lastAttemptedAt: now,
      totalRecipients: chatIds.length,
    },
  });

  const deliveries = await db.telegramAnnouncementDelivery.findMany({
    where: {
      announcementId: announcement.id,
      status: resendFailedOnly ? 'FAILED' : { in: ['PENDING', 'FAILED'] },
    },
    orderBy: { createdAt: 'asc' },
  });

  if (deliveries.length === 0) {
    const sentCount = await db.telegramAnnouncementDelivery.count({
      where: { announcementId: announcement.id, status: 'SENT' },
    });
    const failedCount = await db.telegramAnnouncementDelivery.count({
      where: { announcementId: announcement.id, status: 'FAILED' },
    });
    const status = getAnnouncementStatusFromCounts(sentCount, failedCount);
    await db.telegramAnnouncement.update({
      where: { id: announcement.id },
      data: {
        status,
        sentAt: status === 'SENT' || status === 'PARTIAL' ? announcement.sentAt ?? now : announcement.sentAt,
        totalRecipients: chatIds.length,
        sentCount,
        failedCount,
      },
    });
    return {
      skipped: true as const,
      reason: resendFailedOnly ? 'no-failed-deliveries' : 'already-sent',
    };
  }

  const supportLink = announcement.includeSupportButton ? await getTelegramSupportLink() : null;
  const message = buildTelegramAnnouncementMessage({
    type: announcement.type as TelegramAnnouncementType,
    title: announcement.title,
    message: announcement.message,
  });

  let sentDelta = 0;
  let failedDelta = 0;

  for (const delivery of deliveries) {
    const sent = await sendTelegramMessage(config.botToken, delivery.chatId, message, {
      replyMarkup: supportLink
        ? {
            inline_keyboard: [[{ text: 'Support', url: supportLink }]],
          }
        : undefined,
    });

    await db.telegramAnnouncementDelivery.update({
      where: { id: delivery.id },
      data: sent
        ? {
            status: 'SENT',
            error: null,
            sentAt: now,
          }
        : {
            status: 'FAILED',
            error: 'send-failed',
          },
    });

    if (sent) {
      sentDelta += 1;
    } else {
      failedDelta += 1;
    }
  }

  const [sentCount, failedCount] = await Promise.all([
    db.telegramAnnouncementDelivery.count({
      where: { announcementId: announcement.id, status: 'SENT' },
    }),
    db.telegramAnnouncementDelivery.count({
      where: { announcementId: announcement.id, status: 'FAILED' },
    }),
  ]);

  const status = getAnnouncementStatusFromCounts(sentCount, failedCount);
  await db.telegramAnnouncement.update({
    where: { id: announcement.id },
    data: {
      status,
      sentAt: sentCount > 0 ? announcement.sentAt ?? now : announcement.sentAt,
      lastAttemptedAt: now,
      totalRecipients: chatIds.length,
      sentCount,
      failedCount,
    },
  });

  return {
    skipped: false as const,
    announcementId: announcement.id,
    sentCount,
    failedCount,
    sentDelta,
    failedDelta,
    totalRecipients: chatIds.length,
    status,
  };
}

export async function runTelegramAnnouncementCycle(input?: {
  now?: Date;
}) {
  const now = input?.now ?? new Date();
  const dueAnnouncements = await db.telegramAnnouncement.findMany({
    where: {
      status: 'SCHEDULED',
      scheduledFor: {
        lte: now,
      },
    },
    orderBy: {
      scheduledFor: 'asc',
    },
    take: 10,
  });

  let processed = 0;
  let sent = 0;
  let failed = 0;

  for (const announcement of dueAnnouncements) {
    const result = await dispatchTelegramAnnouncement({
      announcementId: announcement.id,
      now,
    });
    processed += 1;
    if (!result.skipped) {
      sent += result.sentDelta;
      failed += result.failedDelta;
    }
  }

  return {
    skipped: processed === 0,
    processed,
    sent,
    failed,
  };
}
