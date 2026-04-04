import type { SupportedLocale } from '@/lib/i18n/config';
import { db } from '@/lib/db';
import { resolveRefundReasonPresetLabel } from '@/lib/finance';
import {
  buildTelegramMenuCallbackData,
  buildTelegramNotificationPreferenceCallbackData,
} from '@/lib/services/telegram-callbacks';
import {
  getTelegramNotificationPreferenceLabel,
  getTelegramNotificationPreferences,
  sendTelegramMessage,
} from '@/lib/services/telegram-runtime';
import {
  escapeHtml,
  formatTelegramDateTime,
  formatTelegramOrderStatusLabel,
  formatTelegramPremiumFollowUpState,
  formatTelegramPremiumSupportTypeLabel,
  formatTelegramRefundRequestStatusLabel,
  getTelegramUi,
} from '@/lib/services/telegram-ui';

type TelegramInboxMode =
  | 'ALL'
  | 'UNREAD'
  | 'PINNED'
  | 'ORDERS'
  | 'SUPPORT'
  | 'REFUNDS'
  | 'ANNOUNCEMENTS'
  | 'PREMIUM';

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

function buildTelegramInboxTitle(mode: TelegramInboxMode, locale: SupportedLocale) {
  const isMyanmar = locale === 'my';
  switch (mode) {
    case 'UNREAD':
      return isMyanmar ? '📬 <b>မဖတ်ရသေးသော Inbox</b>' : '📬 <b>Your unread inbox</b>';
    case 'PINNED':
      return isMyanmar ? '📌 <b>Pin လုပ်ထားသော Inbox</b>' : '📌 <b>Your pinned inbox</b>';
    case 'ORDERS':
      return isMyanmar ? '🧾 <b>Order inbox</b>' : '🧾 <b>Your order inbox</b>';
    case 'SUPPORT':
      return isMyanmar ? '🛟 <b>Support inbox</b>' : '🛟 <b>Your support inbox</b>';
    case 'REFUNDS':
      return isMyanmar ? '💸 <b>Refund inbox</b>' : '💸 <b>Your refund inbox</b>';
    case 'ANNOUNCEMENTS':
      return isMyanmar ? '📣 <b>Announcement inbox</b>' : '📣 <b>Your announcement inbox</b>';
    case 'PREMIUM':
      return isMyanmar ? '💎 <b>Premium inbox</b>' : '💎 <b>Your premium inbox</b>';
    default:
      return isMyanmar ? '📬 <b>သင်၏ Notice Inbox</b>' : '📬 <b>Your Notice Inbox</b>';
  }
}

function buildTelegramInboxEmptyMessage(mode: TelegramInboxMode, locale: SupportedLocale) {
  const isMyanmar = locale === 'my';
  switch (mode) {
    case 'UNREAD':
      return isMyanmar ? '📭 မဖတ်ရသေးသော update မရှိသေးပါ။' : '📭 No unread updates right now.';
    case 'PINNED':
      return isMyanmar ? '📭 Pin လုပ်ထားသော update မရှိသေးပါ။' : '📭 No pinned updates right now.';
    case 'ORDERS':
      return isMyanmar ? '📭 မကြာသေးမီက order update မရှိသေးပါ။' : '📭 No recent order updates yet.';
    case 'SUPPORT':
      return isMyanmar ? '📭 မကြာသေးမီက support update မရှိသေးပါ။' : '📭 No recent support updates yet.';
    case 'REFUNDS':
      return isMyanmar ? '📭 မကြာသေးမီက refund update မရှိသေးပါ။' : '📭 No recent refund updates yet.';
    case 'ANNOUNCEMENTS':
      return isMyanmar ? '📭 မကြာသေးမီက announcement မရှိသေးပါ။' : '📭 No recent announcements yet.';
    case 'PREMIUM':
      return isMyanmar ? '📭 မကြာသေးမီက premium routing update မရှိသေးပါ။' : '📭 No recent premium updates yet.';
    default:
      return isMyanmar
        ? '📭 မကြာသေးမီက notice သို့မဟုတ် announcement မရှိသေးပါ။'
        : '📭 No recent notices or announcements yet.';
  }
}

function buildTelegramInboxTip(mode: TelegramInboxMode, locale: SupportedLocale) {
  const isMyanmar = locale === 'my';
  if (mode === 'ALL') {
    return isMyanmar
      ? 'Tip: /inbox orders, /inbox support, /inbox refunds, /inbox announcements, /inbox premium, /inbox unread ကို သီးသန့်သုံးနိုင်သည်။'
      : 'Tip: use /inbox orders, /inbox support, /inbox refunds, /inbox announcements, /inbox premium, or /inbox unread for a narrower view.';
  }

  return isMyanmar
    ? 'Tip: /inbox ကို သုံးပြီး update အားလုံးကို တစ်နေရာတည်းမှာ ပြန်ကြည့်နိုင်သည်။'
    : 'Tip: use /inbox to switch back to the combined view.';
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
  const summaryParts: string[] = [];
  if (announcements.length) {
    summaryParts.push(
      input.locale === 'my'
        ? `Announcement ${announcements.length} ခု`
        : `${announcements.length} announcement(s)`,
    );
  }
  if (orderUpdates.length) {
    summaryParts.push(
      input.locale === 'my'
        ? `Order ${orderUpdates.length} ခု`
        : `${orderUpdates.length} order update(s)`,
    );
  }
  if (keyLogs.length) {
    summaryParts.push(
      input.locale === 'my'
        ? `Key notice ${keyLogs.length} ခု`
        : `${keyLogs.length} key notice(s)`,
    );
  }
  if (premiumSupportUpdates.length) {
    summaryParts.push(
      input.locale === 'my'
        ? `Support ${premiumSupportUpdates.length} ခု`
        : `${premiumSupportUpdates.length} support update(s)`,
    );
  }
  if (refundUpdates.length) {
    summaryParts.push(
      input.locale === 'my'
        ? `Refund ${refundUpdates.length} ခု`
        : `${refundUpdates.length} refund update(s)`,
    );
  }
  if (premiumRoutingEvents.length) {
    summaryParts.push(
      input.locale === 'my'
        ? `Premium routing ${premiumRoutingEvents.length} ခု`
        : `${premiumRoutingEvents.length} premium routing update(s)`,
    );
  }

  const lines = [
    buildTelegramInboxTitle(mode, input.locale),
    '',
    summaryParts.join(' • '),
    '',
  ];

  if (announcements.length) {
    lines.push(
      mode === 'PINNED'
        ? input.locale === 'my'
          ? '<b>Pin လုပ်ထားသော announcement များ</b>'
          : '<b>Pinned announcements</b>'
        : mode === 'UNREAD'
          ? input.locale === 'my'
            ? '<b>မဖတ်ရသေးသော announcement များ</b>'
            : '<b>Unread announcements</b>'
          : input.locale === 'my'
            ? '<b>Announcement များ</b>'
            : '<b>Announcements</b>',
    );
    for (const delivery of announcements) {
      lines.push(
        `• ${delivery.isPinned ? '📌 ' : '📣 '}<b>${escapeHtml(delivery.announcement.title)}</b>`,
        `  ${escapeHtml(delivery.announcement.type)} • ${formatTelegramDateTime(delivery.sentAt || delivery.createdAt, input.locale)}`,
        `  ${delivery.readAt ? '✅' : '🆕'} ${delivery.readAt ? (input.locale === 'my' ? 'Read' : 'Read') : (input.locale === 'my' ? 'Unread' : 'Unread')}`,
      );
    }
    lines.push('');
  }

  if (orderUpdates.length) {
    lines.push(input.locale === 'my' ? '<b>Order updates</b>' : '<b>Order updates</b>');
    for (const order of orderUpdates) {
      const lastActivity =
        order.fulfilledAt ||
        order.rejectedAt ||
        order.reviewedAt ||
        order.paymentSubmittedAt ||
        order.updatedAt;
      lines.push(
        `• 🧾 <b>${escapeHtml(order.orderCode)}</b> • ${escapeHtml(
          formatTelegramOrderStatusLabel(order.status, ui),
        )}`,
        `  ${escapeHtml(order.planName || order.planCode || order.kind)}`,
        `  ${formatTelegramDateTime(lastActivity, input.locale)}`,
      );
    }
    lines.push('');
  }

  if (premiumSupportUpdates.length) {
    lines.push(input.locale === 'my' ? '<b>Support updates</b>' : '<b>Support updates</b>');
    for (const request of premiumSupportUpdates) {
      const latestReply = request.replies?.[request.replies.length - 1] || null;
      const latestReplyPrefix = latestReply
        ? latestReply.senderType === 'ADMIN'
          ? input.locale === 'my'
            ? 'Admin'
            : 'Admin'
          : input.locale === 'my'
            ? 'You'
            : 'You'
        : null;
      lines.push(
        `• 💎 <b>${escapeHtml(request.requestCode)}</b> • ${escapeHtml(formatTelegramPremiumSupportTypeLabel(request.requestType, ui))}`,
        `  ${escapeHtml(request.dynamicAccessKey.name)} • ${escapeHtml(formatTelegramPremiumFollowUpState(request, ui))}`,
        latestReply?.senderType === 'ADMIN'
          ? `  ${escapeHtml(input.locale === 'my' ? 'Reply needed' : 'Reply needed')}`
          : request.followUpPending
            ? `  ${escapeHtml(input.locale === 'my' ? 'Waiting for admin' : 'Waiting for admin')}`
            : '',
        latestReply
          ? `  ${escapeHtml(latestReplyPrefix || '')}: ${escapeHtml(latestReply.message.slice(0, 80))}${latestReply.message.length > 80 ? '…' : ''}`
          : '',
        `  ${formatTelegramDateTime(request.updatedAt || request.createdAt, input.locale)}`,
      );
    }
    lines.push('');
  }

  if (refundUpdates.length) {
    lines.push(input.locale === 'my' ? '<b>Refund & finance updates</b>' : '<b>Refund & finance updates</b>');
    for (const order of refundUpdates) {
      lines.push(
        `• 💸 <b>${escapeHtml(order.orderCode)}</b> • ${escapeHtml(
          formatTelegramRefundRequestStatusLabel(order.refundRequestStatus || 'PENDING', ui),
        )}`,
        `  ${order.planName ? escapeHtml(order.planName) : escapeHtml(order.kind)}`,
        order.refundReviewReasonCode
          ? `  ${escapeHtml(
              resolveRefundReasonPresetLabel(order.refundReviewReasonCode) ||
                order.refundReviewReasonCode,
            )}`
          : '',
        `  ${formatTelegramDateTime(order.refundRequestReviewedAt || order.refundRequestedAt || order.updatedAt, input.locale)}`,
      );
    }
    lines.push('');
  }

  if (premiumRoutingEvents.length) {
    lines.push(input.locale === 'my' ? '<b>Premium routing updates</b>' : '<b>Premium routing updates</b>');
    for (const event of premiumRoutingEvents) {
      lines.push(
        `• 💎 <b>${escapeHtml(dynamicKeyNameById.get(event.dynamicAccessKeyId) || 'Premium key')}</b> • ${escapeHtml(
          formatTelegramInboxRoutingEventLabel(event.eventType, input.locale),
        )}`,
        `  ${escapeHtml(truncateTelegramInboxLine(event.reason || event.toServerName || 'Routing update', 96))}`,
        `  ${formatTelegramDateTime(event.createdAt, input.locale)}`,
      );
    }
    lines.push('');
  }

  if (keyLogs.length) {
    lines.push(input.locale === 'my' ? '<b>Key Notice များ</b>' : '<b>Key notices</b>');
    for (const log of keyLogs) {
      lines.push(
        `• <b>${escapeHtml(log.event)}</b>`,
        `  ${escapeHtml(log.accessKey?.name || 'Key')} • ${formatTelegramDateTime(log.sentAt, input.locale)}`,
      );
    }
  }

  lines.push(
    '',
    buildTelegramInboxTip(mode, input.locale),
  );

  const message = lines.join('\n');
  if (input.botToken) {
    await sendTelegramMessage(input.botToken, input.chatId, message, {
      replyMarkup: buildTelegramInboxKeyboard(input.locale, mode),
    });
    return null;
  }

  return message;
}
