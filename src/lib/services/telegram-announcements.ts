import { db } from '@/lib/db';
import { withAbsoluteBasePath } from '@/lib/base-path';
import {
  getTelegramConfig,
  getTelegramSupportLink,
  sendTelegramPhotoUrl,
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

export type TelegramAnnouncementFilters = {
  tag?: string | null;
  serverId?: string | null;
  countryCode?: string | null;
};

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

function normalizeAnnouncementFilters(filters?: TelegramAnnouncementFilters) {
  const tag = filters?.tag?.trim().toLowerCase() || null;
  const serverId = filters?.serverId?.trim() || null;
  const countryCode = filters?.countryCode?.trim().toUpperCase() || null;
  return { tag, serverId, countryCode };
}

function matchesAnnouncementFilters(
  input: {
    tags?: string | null;
    serverId?: string | null;
    countryCode?: string | null;
  },
  filters: ReturnType<typeof normalizeAnnouncementFilters>,
) {
  if (filters.tag && !parseCsvTags(input.tags).has(filters.tag)) {
    return false;
  }
  if (filters.serverId && input.serverId !== filters.serverId) {
    return false;
  }
  if (filters.countryCode && (input.countryCode || '').toUpperCase() !== filters.countryCode) {
    return false;
  }
  return true;
}

export async function getTelegramAnnouncementAudienceMap(filters?: TelegramAnnouncementFilters) {
  const normalizedFilters = normalizeAnnouncementFilters(filters);
  const [accessKeys, dynamicKeys, servers] = await Promise.all([
    db.accessKey.findMany({
      where: {
        status: { in: ['ACTIVE', 'PENDING'] },
      },
      select: {
        telegramId: true,
        tags: true,
        serverId: true,
        server: {
          select: {
            countryCode: true,
          },
        },
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
        tags: true,
        lastResolvedServerId: true,
        user: {
          select: {
            telegramChatId: true,
          },
        },
      },
    }),
    db.server.findMany({
      select: {
        id: true,
        name: true,
        countryCode: true,
      },
    }),
  ]);
  const serverMap = new Map(servers.map((server) => [server.id, server]));

  const standardChats = uniqueStrings(
    accessKeys
      .filter((key) => !parseCsvTags(key.tags).has('trial'))
      .filter((key) =>
        matchesAnnouncementFilters(
          {
            tags: key.tags,
            serverId: key.serverId,
            countryCode: key.server?.countryCode || null,
          },
          normalizedFilters,
        ),
      )
      .flatMap((key) => [key.telegramId, key.user?.telegramChatId]),
  );
  const trialChats = uniqueStrings(
    accessKeys
      .filter((key) => parseCsvTags(key.tags).has('trial'))
      .filter((key) =>
        matchesAnnouncementFilters(
          {
            tags: key.tags,
            serverId: key.serverId,
            countryCode: key.server?.countryCode || null,
          },
          normalizedFilters,
        ),
      )
      .flatMap((key) => [key.telegramId, key.user?.telegramChatId]),
  );
  const premiumChats = uniqueStrings(
    dynamicKeys
      .filter((key) => {
        const resolvedServer = key.lastResolvedServerId ? serverMap.get(key.lastResolvedServerId) : null;
        return matchesAnnouncementFilters(
          {
            tags: key.tags,
            serverId: key.lastResolvedServerId || null,
            countryCode: resolvedServer?.countryCode || null,
          },
          normalizedFilters,
        );
      })
      .flatMap((key) => [key.telegramId, key.user?.telegramChatId]),
  );
  const activeChats = uniqueStrings([...standardChats, ...trialChats, ...premiumChats]);

  return {
    ACTIVE_USERS: activeChats,
    STANDARD_USERS: standardChats,
    PREMIUM_USERS: premiumChats,
    TRIAL_USERS: trialChats,
  } satisfies Record<TelegramAnnouncementAudience, string[]>;
}

export async function listTelegramAnnouncementTargetOptions() {
  const [accessKeys, dynamicKeys, servers] = await Promise.all([
    db.accessKey.findMany({
      where: {
        status: { in: ['ACTIVE', 'PENDING'] },
      },
      select: {
        tags: true,
        serverId: true,
        server: {
          select: {
            name: true,
            countryCode: true,
          },
        },
      },
    }),
    db.dynamicAccessKey.findMany({
      where: {
        status: 'ACTIVE',
      },
      select: {
        tags: true,
        lastResolvedServerId: true,
      },
    }),
    db.server.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        countryCode: true,
      },
      orderBy: [{ name: 'asc' }],
    }),
  ]);

  const serverMap = new Map(servers.map((server) => [server.id, server]));
  const tagCounts = new Map<string, number>();
  const serverCounts = new Map<string, number>();
  const regionCounts = new Map<string, number>();

  for (const key of accessKeys) {
    for (const tag of Array.from(parseCsvTags(key.tags))) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
    if (key.serverId) {
      serverCounts.set(key.serverId, (serverCounts.get(key.serverId) || 0) + 1);
    }
    if (key.server?.countryCode) {
      const countryCode = key.server.countryCode.toUpperCase();
      regionCounts.set(countryCode, (regionCounts.get(countryCode) || 0) + 1);
    }
  }

  for (const key of dynamicKeys) {
    for (const tag of Array.from(parseCsvTags(key.tags))) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
    if (key.lastResolvedServerId) {
      serverCounts.set(key.lastResolvedServerId, (serverCounts.get(key.lastResolvedServerId) || 0) + 1);
      const resolvedServer = serverMap.get(key.lastResolvedServerId);
      if (resolvedServer?.countryCode) {
        const countryCode = resolvedServer.countryCode.toUpperCase();
        regionCounts.set(countryCode, (regionCounts.get(countryCode) || 0) + 1);
      }
    }
  }

  return {
    tags: Array.from(tagCounts.entries())
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([value, count]) => ({ value, count })),
    servers: servers.map((server) => ({
      value: server.id,
      label: server.name,
      countryCode: server.countryCode || null,
      count: serverCounts.get(server.id) || 0,
    })),
    regions: Array.from(regionCounts.entries())
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([value, count]) => ({ value, count })),
  };
}

export function buildTelegramAnnouncementMessage(input: {
  type: TelegramAnnouncementType;
  title: string;
  message: string;
  preview?: boolean;
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

  const bodyLines = [
    ...(input.preview ? ['🧪 <b>Preview</b>', ''] : []),
    heading,
    '',
    `<b>${escapeHtml(input.title.trim())}</b>`,
    escapeHtml(input.message.trim()),
  ];

  if (input.type === 'PROMO') {
    bodyLines.push(
      '',
      '<i>Tap the notice card below to keep the offer or announcement details handy.</i>',
    );
  }

  return bodyLines.join('\n');
}

export async function sendTelegramAnnouncementPreview(input: {
  chatId: string | number;
  type: TelegramAnnouncementType;
  title: string;
  message: string;
  heroImageUrl?: string | null;
  includeSupportButton?: boolean;
  pinToInbox?: boolean;
}) {
  const config = await getTelegramConfig();
  if (!config?.botToken) {
    return { sent: false as const, reason: 'not-configured' as const };
  }

  const supportLink = input.includeSupportButton ? await getTelegramSupportLink() : null;
  const message = buildTelegramAnnouncementMessage({
    type: input.type,
    title: input.title,
    message: input.pinToInbox
      ? `${input.message.trim()}\n\nThis notice will be pinned in the customer inbox.`
      : input.message,
    preview: true,
  });
  const keyboardRows = [];
  if (supportLink) {
    keyboardRows.push([{ text: 'Support', url: supportLink }]);
  }
  const replyMarkup = keyboardRows.length > 0 ? { inline_keyboard: keyboardRows } : undefined;

  const sent = input.heroImageUrl?.trim()
    ? await sendTelegramPhotoUrl(
        config.botToken,
        input.chatId,
        input.heroImageUrl.trim(),
        message,
        replyMarkup ? { replyMarkup } : undefined,
      )
    : await sendTelegramMessage(
        config.botToken,
        input.chatId,
        message,
        replyMarkup ? { replyMarkup } : undefined,
      );

  return sent
    ? { sent: true as const }
    : { sent: false as const, reason: 'send-failed' as const };
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

  const audience = announcement.audience as TelegramAnnouncementAudience;
  const chatIds = (
    await getTelegramAnnouncementAudienceMap({
      tag: announcement.targetTag,
      serverId: announcement.targetServerId,
      countryCode: announcement.targetCountryCode,
    })
  )[audience] || [];

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
        isPinned: announcement.pinToInbox,
      })),
    });
  }

  await db.telegramAnnouncementDelivery.updateMany({
    where: {
      announcementId: announcement.id,
    },
    data: {
      isPinned: announcement.pinToInbox,
    },
  });

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
    const openUrl = withAbsoluteBasePath(`/api/telegram/announcements/${delivery.id}/open`);
    const supportUrl = supportLink
      ? withAbsoluteBasePath(`/api/telegram/announcements/${delivery.id}/click?target=support`)
      : null;
    const inlineKeyboard = [
      [{ text: 'Open notice', url: openUrl }],
      ...(supportUrl ? [[{ text: 'Support', url: supportUrl }]] : []),
    ];
    const replyMarkup = { inline_keyboard: inlineKeyboard };
    const sent = announcement.heroImageUrl?.trim()
      ? await sendTelegramPhotoUrl(
          config.botToken,
          delivery.chatId,
          announcement.heroImageUrl.trim(),
          message,
          { replyMarkup },
        )
      : await sendTelegramMessage(config.botToken, delivery.chatId, message, {
          replyMarkup,
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
      resendAttemptCount: resendFailedOnly ? { increment: 1 } : undefined,
      resendRecoveredCount: resendFailedOnly && sentDelta > 0 ? { increment: sentDelta } : undefined,
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
