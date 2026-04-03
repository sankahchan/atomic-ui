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
  | 'TRIAL_USERS'
  | 'DIRECT_USER';

export type TelegramAnnouncementSegment =
  | 'TRIAL_TO_PAID'
  | 'PREMIUM_UPSELL'
  | 'RENEWAL_SOON'
  | 'HIGH_VALUE';

export type TelegramAnnouncementType =
  | 'INFO'
  | 'ANNOUNCEMENT'
  | 'PROMO'
  | 'NEW_SERVER'
  | 'MAINTENANCE';

export type TelegramAnnouncementCardStyle =
  | 'DEFAULT'
  | 'PROMO'
  | 'PREMIUM'
  | 'OPERATIONS';

export type TelegramAnnouncementRecurrenceType = 'NONE' | 'DAILY' | 'WEEKLY';

export type TelegramAnnouncementFilters = {
  tag?: string | null;
  segment?: TelegramAnnouncementSegment | string | null;
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
  const segment = filters?.segment?.trim().toUpperCase() || null;
  const serverId = filters?.serverId?.trim() || null;
  const countryCode = filters?.countryCode?.trim().toUpperCase() || null;
  return { tag, segment, serverId, countryCode };
}

type AnnouncementCustomerState = {
  tags: Set<string>;
  serverIds: Set<string>;
  countryCodes: Set<string>;
  hasTrial: boolean;
  hasStandard: boolean;
  hasPremium: boolean;
  renewalSoon: boolean;
  fulfilledPaidOrders: number;
  totalPaidRevenue: number;
};

function createAnnouncementCustomerState(): AnnouncementCustomerState {
  return {
    tags: new Set(),
    serverIds: new Set(),
    countryCodes: new Set(),
    hasTrial: false,
    hasStandard: false,
    hasPremium: false,
    renewalSoon: false,
    fulfilledPaidOrders: 0,
    totalPaidRevenue: 0,
  };
}

function getAnnouncementCustomerSegments(
  state: AnnouncementCustomerState,
): TelegramAnnouncementSegment[] {
  const segments: TelegramAnnouncementSegment[] = [];

  if (state.hasTrial && state.fulfilledPaidOrders === 0) {
    segments.push('TRIAL_TO_PAID');
  }

  if (state.hasStandard && !state.hasPremium && state.fulfilledPaidOrders >= 1) {
    segments.push('PREMIUM_UPSELL');
  }

  if (state.renewalSoon) {
    segments.push('RENEWAL_SOON');
  }

  if (state.fulfilledPaidOrders >= 3 || state.totalPaidRevenue >= 20000) {
    segments.push('HIGH_VALUE');
  }

  return segments;
}

function matchesAnnouncementFilters(
  state: AnnouncementCustomerState,
  filters: ReturnType<typeof normalizeAnnouncementFilters>,
) {
  if (filters.tag && !state.tags.has(filters.tag)) {
    return false;
  }
  if (filters.segment && !getAnnouncementCustomerSegments(state).includes(filters.segment as TelegramAnnouncementSegment)) {
    return false;
  }
  if (filters.serverId && !state.serverIds.has(filters.serverId)) {
    return false;
  }
  if (filters.countryCode && !state.countryCodes.has(filters.countryCode)) {
    return false;
  }
  return true;
}

async function buildTelegramAnnouncementCustomerStateMap() {
  const now = new Date();
  const renewalSoonCutoff = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const [accessKeys, dynamicKeys, fulfilledOrders, servers] = await Promise.all([
    db.accessKey.findMany({
      where: {
        status: { in: ['ACTIVE', 'PENDING'] },
      },
      select: {
        telegramId: true,
        tags: true,
        status: true,
        expiresAt: true,
        serverId: true,
        server: {
          select: {
            countryCode: true,
          },
        },
        user: {
          select: {
            telegramChatId: true,
            marketingTags: true,
          },
        },
      },
    }),
    db.dynamicAccessKey.findMany({
      where: {
        status: { in: ['ACTIVE', 'PENDING'] },
      },
      select: {
        telegramId: true,
        tags: true,
        status: true,
        expiresAt: true,
        lastResolvedServerId: true,
        user: {
          select: {
            telegramChatId: true,
            marketingTags: true,
          },
        },
      },
    }),
    db.telegramOrder.findMany({
      where: {
        status: 'FULFILLED',
      },
      select: {
        telegramChatId: true,
        kind: true,
        deliveryType: true,
        priceAmount: true,
      },
    }),
    db.server.findMany({
      select: {
        id: true,
        countryCode: true,
      },
    }),
  ]);

  const serverMap = new Map(servers.map((server) => [server.id, server]));
  const stateByChatId = new Map<string, AnnouncementCustomerState>();

  const ensureState = (chatId: string) => {
    const trimmed = chatId.trim();
    if (!trimmed) {
      return null;
    }

    let state = stateByChatId.get(trimmed);
    if (!state) {
      state = createAnnouncementCustomerState();
      stateByChatId.set(trimmed, state);
    }
    return state;
  };

  for (const key of accessKeys) {
    const chatIds = uniqueStrings([key.telegramId, key.user?.telegramChatId]);
    if (chatIds.length === 0) {
      continue;
    }

    const keyTags = parseCsvTags(key.tags);
    const customerTags = parseCsvTags(key.user?.marketingTags);
    const isTrial = keyTags.has('trial');

    for (const chatId of chatIds) {
      const state = ensureState(chatId);
      if (!state) continue;

      for (const tag of Array.from(keyTags)) state.tags.add(tag);
      for (const tag of Array.from(customerTags)) state.tags.add(tag);
      if (key.serverId) {
        state.serverIds.add(key.serverId);
      }
      if (key.server?.countryCode) {
        state.countryCodes.add(key.server.countryCode.toUpperCase());
      }
      if (isTrial) {
        state.hasTrial = true;
      } else {
        state.hasStandard = true;
      }
      if (key.expiresAt && key.expiresAt > now && key.expiresAt <= renewalSoonCutoff) {
        state.renewalSoon = true;
      }
    }
  }

  for (const key of dynamicKeys) {
    const chatIds = uniqueStrings([key.telegramId, key.user?.telegramChatId]);
    if (chatIds.length === 0) {
      continue;
    }

    const keyTags = parseCsvTags(key.tags);
    const customerTags = parseCsvTags(key.user?.marketingTags);
    const resolvedServer = key.lastResolvedServerId ? serverMap.get(key.lastResolvedServerId) : null;

    for (const chatId of chatIds) {
      const state = ensureState(chatId);
      if (!state) continue;

      for (const tag of Array.from(keyTags)) state.tags.add(tag);
      for (const tag of Array.from(customerTags)) state.tags.add(tag);
      state.hasPremium = true;
      if (key.lastResolvedServerId) {
        state.serverIds.add(key.lastResolvedServerId);
      }
      if (resolvedServer?.countryCode) {
        state.countryCodes.add(resolvedServer.countryCode.toUpperCase());
      }
      if (key.expiresAt && key.expiresAt > now && key.expiresAt <= renewalSoonCutoff) {
        state.renewalSoon = true;
      }
    }
  }

  for (const order of fulfilledOrders) {
    const state = order.telegramChatId ? ensureState(order.telegramChatId) : null;
    if (!state) {
      continue;
    }

    if (order.kind === 'TRIAL') {
      state.hasTrial = true;
    } else if (order.deliveryType === 'DYNAMIC_KEY') {
      state.hasPremium = true;
    } else {
      state.hasStandard = true;
    }

    if ((order.priceAmount || 0) > 0) {
      state.fulfilledPaidOrders += 1;
      state.totalPaidRevenue += order.priceAmount || 0;
    }
  }

  return stateByChatId;
}

function normalizeAnnouncementCardStyle(
  value?: string | null,
): TelegramAnnouncementCardStyle {
  switch ((value || '').trim().toUpperCase()) {
    case 'PROMO':
      return 'PROMO';
    case 'PREMIUM':
      return 'PREMIUM';
    case 'OPERATIONS':
    case 'OPS':
      return 'OPERATIONS';
    default:
      return 'DEFAULT';
  }
}

function normalizeAnnouncementRecurrenceType(
  value?: string | null,
): TelegramAnnouncementRecurrenceType {
  switch ((value || '').trim().toUpperCase()) {
    case 'DAILY':
      return 'DAILY';
    case 'WEEKLY':
      return 'WEEKLY';
    default:
      return 'NONE';
  }
}

function shouldRespectAnnouncementPreference(type: TelegramAnnouncementType) {
  return type === 'PROMO' || type === 'MAINTENANCE' || type === 'NEW_SERVER';
}

function isAnnouncementAllowedForProfile(
  profile: {
    allowPromoAnnouncements: boolean;
    allowMaintenanceNotices: boolean;
  } | null | undefined,
  type: TelegramAnnouncementType,
) {
  if (!profile || !shouldRespectAnnouncementPreference(type)) {
    return true;
  }

  if (type === 'PROMO') {
    return profile.allowPromoAnnouncements;
  }

  return profile.allowMaintenanceNotices;
}

export async function resolveTelegramAnnouncementRecipients(input: {
  audience: TelegramAnnouncementAudience;
  type: TelegramAnnouncementType;
  filters?: TelegramAnnouncementFilters;
  directChatId?: string | null;
  bypassPreferences?: boolean;
}) {
  if (input.directChatId?.trim()) {
    return [input.directChatId.trim()];
  }

  const audienceMap = await getTelegramAnnouncementAudienceMap(input.filters);
  const chatIds =
    input.audience === 'DIRECT_USER' ? [] : audienceMap[input.audience] || [];

  if (input.bypassPreferences || chatIds.length === 0 || !shouldRespectAnnouncementPreference(input.type)) {
    return chatIds;
  }

  const profiles = await db.telegramUserProfile.findMany({
    where: {
      telegramChatId: {
        in: chatIds,
      },
    },
    select: {
      telegramChatId: true,
      allowPromoAnnouncements: true,
      allowMaintenanceNotices: true,
    },
  });

  const profileMap = new Map(
    profiles
      .filter((profile) => Boolean(profile.telegramChatId))
      .map((profile) => [profile.telegramChatId as string, profile]),
  );

  return chatIds.filter((chatId) =>
    isAnnouncementAllowedForProfile(profileMap.get(chatId), input.type),
  );
}

export function computeNextTelegramAnnouncementRun(input: {
  recurrenceType?: string | null;
  scheduledFor?: Date | null;
  now?: Date;
}) {
  const recurrenceType = normalizeAnnouncementRecurrenceType(input.recurrenceType);
  if (recurrenceType === 'NONE') {
    return null;
  }

  const now = input.now ? new Date(input.now) : new Date();
  const anchor = input.scheduledFor ? new Date(input.scheduledFor) : new Date(now);
  const intervalMs =
    recurrenceType === 'DAILY'
      ? 24 * 60 * 60 * 1000
      : 7 * 24 * 60 * 60 * 1000;

  let nextRun = new Date(anchor.getTime() + intervalMs);
  while (nextRun.getTime() <= now.getTime()) {
    nextRun = new Date(nextRun.getTime() + intervalMs);
  }

  return nextRun;
}

export async function getTelegramAnnouncementAudienceMap(filters?: TelegramAnnouncementFilters) {
  const normalizedFilters = normalizeAnnouncementFilters(filters);
  const stateByChatId = await buildTelegramAnnouncementCustomerStateMap();
  const activeChats: string[] = [];
  const standardChats: string[] = [];
  const premiumChats: string[] = [];
  const trialChats: string[] = [];

  for (const [chatId, state] of Array.from(stateByChatId.entries())) {
    if (!matchesAnnouncementFilters(state, normalizedFilters)) {
      continue;
    }

    if (state.hasStandard || state.hasTrial || state.hasPremium) {
      activeChats.push(chatId);
    }
    if (state.hasStandard) {
      standardChats.push(chatId);
    }
    if (state.hasPremium) {
      premiumChats.push(chatId);
    }
    if (state.hasTrial) {
      trialChats.push(chatId);
    }
  }

  return {
    ACTIVE_USERS: activeChats,
    STANDARD_USERS: standardChats,
    PREMIUM_USERS: premiumChats,
    TRIAL_USERS: trialChats,
    DIRECT_USER: [],
  } satisfies Record<TelegramAnnouncementAudience, string[]>;
}

export async function listTelegramAnnouncementTargetOptions() {
  const [stateByChatId, servers] = await Promise.all([
    buildTelegramAnnouncementCustomerStateMap(),
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

  const tagCounts = new Map<string, number>();
  const serverCounts = new Map<string, number>();
  const regionCounts = new Map<string, number>();
  const segmentCounts = new Map<TelegramAnnouncementSegment, number>();

  for (const state of Array.from(stateByChatId.values())) {
    for (const tag of Array.from(state.tags)) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
    for (const serverId of Array.from(state.serverIds)) {
      serverCounts.set(serverId, (serverCounts.get(serverId) || 0) + 1);
    }
    for (const countryCode of Array.from(state.countryCodes)) {
      regionCounts.set(countryCode, (regionCounts.get(countryCode) || 0) + 1);
    }
    for (const segment of getAnnouncementCustomerSegments(state)) {
      segmentCounts.set(segment, (segmentCounts.get(segment) || 0) + 1);
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
    segments: Array.from(segmentCounts.entries())
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([value, count]) => ({ value, count })),
  };
}

export function buildTelegramAnnouncementMessage(input: {
  type: TelegramAnnouncementType;
  title: string;
  message: string;
  cardStyle?: TelegramAnnouncementCardStyle | string | null;
  preview?: boolean;
}) {
  const cardStyle = normalizeAnnouncementCardStyle(input.cardStyle);
  const heading =
    cardStyle === 'PREMIUM'
      ? '💠 <b>Premium update</b>'
      : cardStyle === 'PROMO'
        ? '🎁 <b>Special offer</b>'
        : cardStyle === 'OPERATIONS'
          ? '🛠 <b>Service update</b>'
          : input.type === 'PROMO'
            ? '🎁 <b>Special offer</b>'
            : input.type === 'NEW_SERVER'
              ? '🛰️ <b>New server update</b>'
              : input.type === 'MAINTENANCE'
                ? '🛠 <b>Service update</b>'
                : input.type === 'INFO'
                  ? 'ℹ️ <b>Information</b>'
                  : '📣 <b>Announcement</b>';

  const accentLine =
    cardStyle === 'PREMIUM'
      ? '━━━━━━━━━━━━ PREMIUM ━━━━━━━━━━━━'
      : cardStyle === 'PROMO'
        ? '━━━━━━━━━━━━ OFFER ━━━━━━━━━━━━━━'
        : cardStyle === 'OPERATIONS'
          ? '━━━━━━━━━━━━ STATUS ━━━━━━━━━━━━━'
          : null;

  const bodyLines = [
    ...(input.preview ? ['🧪 <b>Preview</b>', ''] : []),
    heading,
    ...(accentLine ? [accentLine] : []),
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
  cardStyle?: TelegramAnnouncementCardStyle | string | null;
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
    cardStyle: input.cardStyle,
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
  const chatIds = await resolveTelegramAnnouncementRecipients({
    audience,
    type: announcement.type as TelegramAnnouncementType,
    filters: {
      tag: announcement.targetTag,
      segment: announcement.targetSegment,
      serverId: announcement.targetServerId,
      countryCode: announcement.targetCountryCode,
    },
    directChatId: announcement.targetDirectChatId,
    bypassPreferences: Boolean(announcement.targetDirectChatId),
  });

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
    cardStyle: announcement.cardStyle,
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

export async function dispatchTelegramAnnouncementSchedule(input: {
  announcementId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const announcement = await db.telegramAnnouncement.findUnique({
    where: { id: input.announcementId },
  });

  if (!announcement) {
    return { skipped: true as const, reason: 'not-found' as const };
  }

  const recurrenceType = normalizeAnnouncementRecurrenceType(announcement.recurrenceType);
  const isRecurringParent = recurrenceType !== 'NONE' && !announcement.recurrenceParentId;

  if (!isRecurringParent) {
    return dispatchTelegramAnnouncement({
      announcementId: input.announcementId,
      now,
    });
  }

  const occurrence = await db.telegramAnnouncement.create({
    data: {
      audience: announcement.audience,
      type: announcement.type,
      templateId: announcement.templateId,
      templateName: announcement.templateName,
      targetTag: announcement.targetTag,
      targetSegment: announcement.targetSegment,
      targetServerId: announcement.targetServerId,
      targetServerName: announcement.targetServerName,
      targetCountryCode: announcement.targetCountryCode,
      targetDirectChatId: announcement.targetDirectChatId,
      targetDirectUserLabel: announcement.targetDirectUserLabel,
      title: announcement.title,
      message: announcement.message,
      heroImageUrl: announcement.heroImageUrl,
      cardStyle: announcement.cardStyle,
      includeSupportButton: announcement.includeSupportButton,
      pinToInbox: announcement.pinToInbox,
      status: 'PROCESSING',
      scheduledFor: now,
      recurrenceParentId: announcement.id,
      createdByUserId: announcement.createdByUserId,
      createdByEmail: announcement.createdByEmail,
    },
  });

  const result = await dispatchTelegramAnnouncement({
    announcementId: occurrence.id,
    now,
  });

  await db.telegramAnnouncement.update({
    where: { id: announcement.id },
    data: {
      status: 'SCHEDULED',
      scheduledFor: computeNextTelegramAnnouncementRun({
        recurrenceType,
        scheduledFor: announcement.scheduledFor || now,
        now,
      }),
      lastAttemptedAt: now,
      sentAt: result.skipped ? announcement.sentAt : now,
    },
  });

  return result;
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
    const result = await dispatchTelegramAnnouncementSchedule({
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
