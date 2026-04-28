import type { SupportedLocale } from '@/lib/i18n/config';
import { db } from '@/lib/db';
import {
  buildTelegramMenuCallbackData,
  buildTelegramNotificationPreferenceCallbackData,
} from '@/lib/services/telegram-callbacks';
import {
  buildTelegramInboxEmptyMessage,
  buildTelegramInboxSummaryMessage,
  type TelegramInboxMode,
  type TelegramInboxSummaryItem,
} from '@/lib/services/telegram-inbox-ui';
import {
  getTelegramNotificationPreferenceLabel,
  getTelegramNotificationPreferences,
  sendTelegramMessage,
} from '@/lib/services/telegram-runtime';
import {
  formatTelegramDateTime,
  formatTelegramOrderStatusLabel,
  formatTelegramPremiumSupportTypeLabel,
  formatTelegramReplyStateLabel,
  formatTelegramRefundRequestStatusLabel,
  getTelegramUi,
} from '@/lib/services/telegram-ui';

function parseTelegramInboxMode(argsText: string): TelegramInboxMode {
  const normalized = argsText.trim().toLowerCase();
  switch (normalized) {
    case 'unread':
      return 'UNREAD';
    case 'pinned':
    case 'important':
      return 'PINNED';
    case 'orders':
    case 'order':
      return 'ORDERS';
    case 'support':
      return 'SUPPORT';
    case 'refund':
    case 'refunds':
    case 'finance':
      return 'REFUNDS';
    case 'announcement':
    case 'announcements':
      return 'ANNOUNCEMENTS';
    case 'premium':
      return 'PREMIUM';
    default:
      return 'ALL';
  }
}

function buildTelegramInboxKeyboard(locale: SupportedLocale, mode: TelegramInboxMode) {
  const isMyanmar = locale === 'my';
  const option = (targetMode: TelegramInboxMode, label: string) => ({
    text: mode === targetMode ? `• ${label}` : label,
    callback_data: buildTelegramMenuCallbackData('inbox', targetMode.toLowerCase()),
  });

  return {
    inline_keyboard: [
      [
        option('ALL', isMyanmar ? 'အားလုံး' : 'All'),
        option('ORDERS', isMyanmar ? 'Order' : 'Orders'),
        option('SUPPORT', isMyanmar ? 'Support' : 'Support'),
      ],
      [
        option('REFUNDS', isMyanmar ? 'Refund' : 'Refunds'),
        option('ANNOUNCEMENTS', isMyanmar ? 'Notice' : 'Announcements'),
        option('PREMIUM', isMyanmar ? 'Premium' : 'Premium'),
      ],
      [
        option('UNREAD', isMyanmar ? 'မဖတ်ရသေး' : 'Unread'),
        option('PINNED', isMyanmar ? 'Pin လုပ်ထား' : 'Pinned'),
      ],
    ],
  };
}

function formatTelegramInboxRoutingEventLabel(
  eventType: string,
  locale: SupportedLocale,
) {
  const isMyanmar = locale === 'my';
  switch (eventType) {
    case 'PREFERRED_REGION_DEGRADED':
      return isMyanmar ? 'Preferred region degraded' : 'Preferred region degraded';
    case 'AUTO_FALLBACK_PIN_APPLIED':
      return isMyanmar ? 'Fallback pinned' : 'Fallback pinned';
    case 'PREFERRED_REGION_RECOVERED':
      return isMyanmar ? 'Preferred region recovered' : 'Preferred region recovered';
    default:
      return eventType.replaceAll('_', ' ');
  }
}

function truncateTelegramInboxLine(value: string, limit = 88) {
  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, limit - 1)}…`;
}

function formatTelegramInboxCountLabel(
  count: number,
  locale: SupportedLocale,
  singular: string,
  plural?: string,
) {
  if (locale === 'my') {
    return `${singular} ${count} ခု`;
  }

  const pluralLabel = plural || `${singular}s`;
  return `${count} ${count === 1 ? singular : pluralLabel}`;
}

function formatTelegramInboxAnnouncementTypeLabel(type: string, locale: SupportedLocale) {
  const isMyanmar = locale === 'my';
  switch ((type || '').trim().toUpperCase()) {
    case 'PROMO':
      return isMyanmar ? 'Promo' : 'Promo';
    case 'MAINTENANCE':
      return isMyanmar ? 'Maintenance' : 'Maintenance';
    case 'NEW_SERVER':
      return isMyanmar ? 'Server အသစ်' : 'New server';
    case 'ANNOUNCEMENT':
    case 'INFO':
    default:
      return isMyanmar ? 'Notice' : 'Notice';
  }
}

function formatTelegramInboxReadStateLabel(readAt: Date | null, locale: SupportedLocale) {
  if (locale === 'my') {
    return readAt ? 'ဖတ်ပြီး' : 'မဖတ်ရသေး';
  }

  return readAt ? 'Read' : 'Unread';
}

export function buildTelegramNotificationPreferencesKeyboard(
  locale: SupportedLocale,
  preferences: Awaited<ReturnType<typeof getTelegramNotificationPreferences>>,
) {
  const renderToggle = (key: 'promo' | 'maintenance' | 'receipt' | 'support') => {
    const enabled = preferences[key];
    const label = getTelegramNotificationPreferenceLabel(key, locale);
    return {
      text: `${enabled ? '✅' : '⚪️'} ${label}`,
      callback_data: buildTelegramNotificationPreferenceCallbackData(key, !enabled),
    };
  };

  return {
    inline_keyboard: [
      [renderToggle('promo')],
      [renderToggle('maintenance')],
      [renderToggle('receipt')],
      [renderToggle('support')],
    ],
  };
}

export function buildTelegramNotificationPreferencesMessage(
  locale: SupportedLocale,
  preferences: Awaited<ReturnType<typeof getTelegramNotificationPreferences>>,
  includeHint = true,
) {
  const lines = [
    locale === 'my'
      ? '🔔 <b>Notification settings</b>'
      : '🔔 <b>Notification settings</b>',
    '',
    `🏷 ${getTelegramNotificationPreferenceLabel('promo', locale)}: <b>${preferences.promo ? 'ON' : 'OFF'}</b>`,
    `🛠 ${getTelegramNotificationPreferenceLabel('maintenance', locale)}: <b>${preferences.maintenance ? 'ON' : 'OFF'}</b>`,
    `🧾 ${getTelegramNotificationPreferenceLabel('receipt', locale)}: <b>${preferences.receipt ? 'ON' : 'OFF'}</b>`,
    `🛟 ${getTelegramNotificationPreferenceLabel('support', locale)}: <b>${preferences.support ? 'ON' : 'OFF'}</b>`,
  ];

  if (includeHint) {
    lines.push(
      '',
      locale === 'my'
        ? 'အောက်ပါ button များဖြင့် ON/OFF ပြောင်းနိုင်ပါသည်။'
        : 'Use the buttons below to turn each type on or off.',
    );
  }

  return lines.join('\n');
}

export async function handleNotificationPreferencesCommand(input: {
  chatId: number;
  telegramUserId: number;
  locale: SupportedLocale;
  botToken: string;
}) {
  const preferences = await getTelegramNotificationPreferences({
    telegramUserId: String(input.telegramUserId),
    telegramChatId: String(input.chatId),
  });

  await sendTelegramMessage(
    input.botToken,
    input.chatId,
    buildTelegramNotificationPreferencesMessage(input.locale, preferences),
    {
      replyMarkup: buildTelegramNotificationPreferencesKeyboard(input.locale, preferences),
    },
  );

  return null;
}

export async function handleInboxCommand(input: {
  chatId: number;
  telegramUserId: number;
  argsText: string;
  locale: SupportedLocale;
  botToken?: string;
}): Promise<string | null> {
  const chatIdValue = String(input.chatId);
  const telegramUserIdValue = String(input.telegramUserId);
  const mode = parseTelegramInboxMode(input.argsText);
  const includeAnnouncements = ['ALL', 'UNREAD', 'PINNED', 'ANNOUNCEMENTS'].includes(mode);
  const includeOrders = ['ALL', 'ORDERS'].includes(mode);
  const includeSupport = ['ALL', 'SUPPORT', 'PREMIUM'].includes(mode);
  const includeRefunds = ['ALL', 'REFUNDS'].includes(mode);
  const includePremium = ['ALL', 'PREMIUM'].includes(mode);
  const ui = getTelegramUi(input.locale);

  const [announcements, accessKeys, dynamicKeys, orderUpdates] = await Promise.all([
    includeAnnouncements
      ? db.telegramAnnouncementDelivery.findMany({
          where: {
            chatId: chatIdValue,
            status: 'SENT',
            ...(mode === 'UNREAD'
              ? { readAt: null }
              : mode === 'PINNED'
                ? { isPinned: true }
                : {}),
          },
          include: {
            announcement: true,
          },
          orderBy: [{ isPinned: 'desc' }, { readAt: 'asc' }, { sentAt: 'desc' }, { createdAt: 'desc' }],
          take: 8,
        })
      : [],
    includeOrders
      ? db.accessKey.findMany({
          where: {
            OR: [
              { telegramId: chatIdValue },
              { telegramId: telegramUserIdValue },
              { user: { telegramChatId: chatIdValue } },
            ],
          },
          select: {
            id: true,
          },
          take: 12,
        })
      : [],
    includePremium
      ? db.dynamicAccessKey.findMany({
          where: {
            OR: [
              { telegramId: telegramUserIdValue },
              { user: { telegramChatId: chatIdValue } },
            ],
          },
          select: {
            id: true,
            name: true,
          },
          take: 8,
        })
      : [],
    includeOrders
      ? db.telegramOrder.findMany({
          where: {
            OR: [{ telegramChatId: chatIdValue }, { telegramUserId: telegramUserIdValue }],
          },
          select: {
            id: true,
            orderCode: true,
            status: true,
            planName: true,
            planCode: true,
            kind: true,
            paymentSubmittedAt: true,
            reviewedAt: true,
            fulfilledAt: true,
            rejectedAt: true,
            updatedAt: true,
          },
          orderBy: [{ updatedAt: 'desc' }],
          take: 5,
        })
      : [],
  ]);

  const keyLogs = includeOrders && accessKeys.length
    ? await db.notificationLog.findMany({
        where: {
          accessKeyId: {
            in: accessKeys.map((key) => key.id),
          },
        },
        include: {
          accessKey: {
            select: {
              name: true,
            },
          },
        },
        orderBy: [{ sentAt: 'desc' }],
        take: 5,
      })
    : [];
  const [refundUpdates, premiumSupportUpdates, premiumRoutingEvents] = includeRefunds || includeSupport || includePremium
    ? await Promise.all([
        includeRefunds
          ? db.telegramOrder.findMany({
              where: {
                OR: [{ telegramChatId: chatIdValue }, { telegramUserId: telegramUserIdValue }],
                refundRequestStatus: { in: ['PENDING', 'APPROVED', 'REJECTED'] },
              },
              orderBy: [{ refundRequestedAt: 'desc' }, { updatedAt: 'desc' }],
              take: 4,
            })
          : [],
        includeSupport
          ? db.telegramPremiumSupportRequest.findMany({
              where: {
                OR: [{ telegramChatId: chatIdValue }, { telegramUserId: telegramUserIdValue }],
              },
              include: {
                dynamicAccessKey: {
                  select: {
                    name: true,
                  },
                },
                replies: {
                  orderBy: { createdAt: 'asc' },
                  take: 6,
                },
              },
              orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
              take: 4,
            })
          : [],
        includePremium && dynamicKeys.length
          ? db.dynamicRoutingEvent.findMany({
              where: {
                dynamicAccessKeyId: { in: dynamicKeys.map((key) => key.id) },
                eventType: {
                  in: [
                    'PREFERRED_REGION_DEGRADED',
                    'AUTO_FALLBACK_PIN_APPLIED',
                    'PREFERRED_REGION_RECOVERED',
                  ],
                },
              },
              select: {
                id: true,
                dynamicAccessKeyId: true,
                eventType: true,
                reason: true,
                createdAt: true,
                toServerName: true,
              },
              orderBy: [{ createdAt: 'desc' }],
              take: 4,
            })
          : [],
      ])
    : [[], [], []];

  const unreadAnnouncementIds = announcements
    .filter((delivery) => delivery.readAt == null)
    .map((delivery) => delivery.id);
  if (unreadAnnouncementIds.length > 0) {
    await db.telegramAnnouncementDelivery.updateMany({
      where: {
        id: {
          in: unreadAnnouncementIds,
        },
      },
      data: {
        readAt: new Date(),
      },
    });
  }

  const hasAnyUpdate =
    announcements.length > 0 ||
    keyLogs.length > 0 ||
    orderUpdates.length > 0 ||
    refundUpdates.length > 0 ||
    premiumSupportUpdates.length > 0 ||
    premiumRoutingEvents.length > 0;

  if (!hasAnyUpdate) {
    const emptyMessage = buildTelegramInboxEmptyMessage(mode, input.locale);
    if (input.botToken) {
      await sendTelegramMessage(input.botToken, input.chatId, emptyMessage, {
        replyMarkup: buildTelegramInboxKeyboard(input.locale, mode),
      });
      return null;
    }
    return emptyMessage;
  }

  const dynamicKeyNameById = new Map(dynamicKeys.map((key) => [key.id, key.name]));
  const inboxItems: TelegramInboxSummaryItem[] = [];
  const summaryParts: string[] = [];
  if (announcements.length) {
    summaryParts.push(
      formatTelegramInboxCountLabel(announcements.length, input.locale, 'notice', 'notices'),
    );
    inboxItems.push(
      ...announcements.map((delivery) => ({
        icon: delivery.isPinned ? '📌' : '📣',
        title: delivery.announcement.title,
        detail: `${formatTelegramInboxAnnouncementTypeLabel(delivery.announcement.type, input.locale)} • ${formatTelegramInboxReadStateLabel(delivery.readAt, input.locale)}`,
        meta: formatTelegramDateTime(delivery.sentAt || delivery.createdAt, input.locale),
        sortAt: delivery.sentAt || delivery.createdAt,
      })),
    );
  }
  if (orderUpdates.length) {
    summaryParts.push(
      formatTelegramInboxCountLabel(orderUpdates.length, input.locale, 'order'),
    );
    inboxItems.push(
      ...orderUpdates.map((order) => {
        const lastActivity =
          order.fulfilledAt ||
          order.rejectedAt ||
          order.reviewedAt ||
          order.paymentSubmittedAt ||
          order.updatedAt;

        return {
          icon: '🧾',
          title: order.orderCode,
          detail: `${formatTelegramOrderStatusLabel(order.status, ui)} • ${truncateTelegramInboxLine(order.planName || order.planCode || order.kind, 44)}`,
          meta: formatTelegramDateTime(lastActivity, input.locale),
          sortAt: lastActivity,
        };
      }),
    );
  }
  if (keyLogs.length) {
    summaryParts.push(
      formatTelegramInboxCountLabel(keyLogs.length, input.locale, 'key notice'),
    );
    inboxItems.push(
      ...keyLogs.map((log) => ({
        icon: '🔑',
        title: log.event,
        detail: log.accessKey?.name || 'Key',
        meta: formatTelegramDateTime(log.sentAt, input.locale),
        sortAt: log.sentAt,
      })),
    );
  }
  if (premiumSupportUpdates.length) {
    summaryParts.push(
      formatTelegramInboxCountLabel(premiumSupportUpdates.length, input.locale, 'support'),
    );
    inboxItems.push(
      ...premiumSupportUpdates.map((request) => {
        const latestReply = request.replies?.[request.replies.length - 1] || null;
        const replyStateLabel = formatTelegramReplyStateLabel({
          latestReplySenderType: latestReply?.senderType || null,
          followUpPending: request.followUpPending,
          locale: input.locale,
        });
        return {
          icon: '💎',
          title: request.requestCode,
          detail: `${formatTelegramPremiumSupportTypeLabel(request.requestType, ui)} • ${replyStateLabel}`,
          meta: formatTelegramDateTime(request.updatedAt || request.createdAt, input.locale),
          sortAt: request.updatedAt || request.createdAt,
        };
      }),
    );
  }
  if (refundUpdates.length) {
    summaryParts.push(
      formatTelegramInboxCountLabel(refundUpdates.length, input.locale, 'refund'),
    );
    inboxItems.push(
      ...refundUpdates.map((order) => ({
        icon: '💸',
        title: order.orderCode,
        detail: `${formatTelegramRefundRequestStatusLabel(order.refundRequestStatus || 'PENDING', ui)} • ${truncateTelegramInboxLine(order.planName || order.kind, 44)}`,
        meta: formatTelegramDateTime(order.refundRequestReviewedAt || order.refundRequestedAt || order.updatedAt, input.locale),
        sortAt: order.refundRequestReviewedAt || order.refundRequestedAt || order.updatedAt,
      })),
    );
  }
  if (premiumRoutingEvents.length) {
    summaryParts.push(
      formatTelegramInboxCountLabel(premiumRoutingEvents.length, input.locale, 'routing'),
    );
    inboxItems.push(
      ...premiumRoutingEvents.map((event) => ({
        icon: '🧭',
        title: dynamicKeyNameById.get(event.dynamicAccessKeyId) || 'Premium key',
        detail: `${formatTelegramInboxRoutingEventLabel(event.eventType, input.locale)} • ${truncateTelegramInboxLine(event.reason || event.toServerName || 'Routing update', 52)}`,
        meta: formatTelegramDateTime(event.createdAt, input.locale),
        sortAt: event.createdAt,
      })),
    );
  }
  const message = buildTelegramInboxSummaryMessage({
    locale: input.locale,
    mode,
    summaryLine: summaryParts.join(' • '),
    items: inboxItems,
  });
  if (input.botToken) {
    await sendTelegramMessage(input.botToken, input.chatId, message, {
      replyMarkup: buildTelegramInboxKeyboard(input.locale, mode),
    });
    return null;
  }

  return message;
}
