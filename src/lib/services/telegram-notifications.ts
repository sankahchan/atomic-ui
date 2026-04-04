import type { SupportedLocale } from '@/lib/i18n/config';
import { db } from '@/lib/db';
import { resolveRefundReasonPresetLabel } from '@/lib/finance';
import { buildTelegramNotificationPreferenceCallbackData } from '@/lib/services/telegram-callbacks';
import {
  getTelegramNotificationPreferenceLabel,
  getTelegramNotificationPreferences,
  sendTelegramMessage,
} from '@/lib/services/telegram-runtime';
import {
  escapeHtml,
  formatTelegramDateTime,
  formatTelegramPremiumFollowUpState,
  formatTelegramPremiumSupportTypeLabel,
  formatTelegramRefundRequestStatusLabel,
  getTelegramUi,
} from '@/lib/services/telegram-ui';

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
}): Promise<string> {
  const chatIdValue = String(input.chatId);
  const telegramUserIdValue = String(input.telegramUserId);
  const mode = (() => {
    const normalized = input.argsText.trim().toLowerCase();
    if (normalized === 'unread') {
      return 'UNREAD' as const;
    }
    if (normalized === 'pinned' || normalized === 'important') {
      return 'PINNED' as const;
    }
    return 'ALL' as const;
  })();
  const [announcements, accessKeys] = await Promise.all([
    db.telegramAnnouncementDelivery.findMany({
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
    }),
    db.accessKey.findMany({
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
    }),
  ]);
  const ui = getTelegramUi(input.locale);

  const keyLogs = accessKeys.length
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
  const [refundUpdates, premiumSupportUpdates] = mode === 'ALL'
    ? await Promise.all([
        db.telegramOrder.findMany({
          where: {
            OR: [{ telegramChatId: chatIdValue }, { telegramUserId: telegramUserIdValue }],
            refundRequestStatus: { in: ['PENDING', 'APPROVED', 'REJECTED'] },
          },
          orderBy: [{ refundRequestedAt: 'desc' }, { updatedAt: 'desc' }],
          take: 4,
        }),
        db.telegramPremiumSupportRequest.findMany({
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
        }),
      ])
    : [[], []];

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
    (mode === 'ALL' && (refundUpdates.length > 0 || premiumSupportUpdates.length > 0));

  if (!hasAnyUpdate) {
    return input.locale === 'my'
      ? '📭 မကြာသေးမီက notice သို့မဟုတ် announcement မရှိသေးပါ။'
      : '📭 No recent notices or announcements yet.';
  }

  const lines = [
    mode === 'UNREAD'
      ? input.locale === 'my'
        ? '📬 <b>မဖတ်ရသေးသော Inbox</b>'
        : '📬 <b>Your unread inbox</b>'
      : mode === 'PINNED'
        ? input.locale === 'my'
          ? '📌 <b>Pin လုပ်ထားသော Inbox</b>'
          : '📌 <b>Your pinned inbox</b>'
        : input.locale === 'my'
          ? '📬 <b>သင်၏ Notice Inbox</b>'
          : '📬 <b>Your Notice Inbox</b>',
    '',
    mode === 'ALL'
      ? input.locale === 'my'
        ? `Announcement ${announcements.length} ခု • Support ${premiumSupportUpdates.length} ခု • Finance ${refundUpdates.length} ခု`
        : `${announcements.length} announcement(s) • ${premiumSupportUpdates.length} support update(s) • ${refundUpdates.length} finance update(s)`
      : input.locale === 'my'
        ? `${announcements.length} announcement(s)`
        : `${announcements.length} announcement(s)`,
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

  if (premiumSupportUpdates.length && mode === 'ALL') {
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

  if (refundUpdates.length && mode === 'ALL') {
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

  if (keyLogs.length && mode === 'ALL') {
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
    input.locale === 'my'
      ? 'Tip: /inbox unread, /inbox pinned, /orders, /supportstatus ကို လိုအပ်သလို ဆက်အသုံးပြုနိုင်သည်။'
      : 'Tip: use /inbox unread, /inbox pinned, /orders, or /supportstatus when you need a narrower view.',
  );

  return lines.join('\n');
}
