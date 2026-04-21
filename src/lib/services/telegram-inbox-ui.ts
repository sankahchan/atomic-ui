import type { SupportedLocale } from '@/lib/i18n/config';
import {
  buildTelegramCommerceCard,
  buildTelegramCommerceMessage,
} from '@/lib/services/telegram-commerce-ui';
import { escapeHtml } from '@/lib/services/telegram-ui';

export type TelegramInboxMode =
  | 'ALL'
  | 'UNREAD'
  | 'PINNED'
  | 'ORDERS'
  | 'SUPPORT'
  | 'REFUNDS'
  | 'ANNOUNCEMENTS'
  | 'PREMIUM';

export type TelegramInboxSummaryItem = {
  icon: string;
  title: string;
  detail?: string | null;
  meta?: string | null;
  sortAt: Date;
};

export function buildTelegramInboxTitle(mode: TelegramInboxMode, locale: SupportedLocale) {
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

export function buildTelegramInboxEmptyMessage(mode: TelegramInboxMode, locale: SupportedLocale) {
  const isMyanmar = locale === 'my';
  switch (mode) {
    case 'UNREAD':
      return isMyanmar ? '📭 No unread updates right now.' : '📭 No unread updates right now.';
    case 'PINNED':
      return isMyanmar ? '📭 No pinned updates right now.' : '📭 No pinned updates right now.';
    case 'ORDERS':
      return isMyanmar ? '📭 No recent order updates yet.' : '📭 No recent order updates yet.';
    case 'SUPPORT':
      return isMyanmar ? '📭 No recent support updates yet.' : '📭 No recent support updates yet.';
    case 'REFUNDS':
      return isMyanmar ? '📭 No recent refund updates yet.' : '📭 No recent refund updates yet.';
    case 'ANNOUNCEMENTS':
      return isMyanmar ? '📭 No recent announcements yet.' : '📭 No recent announcements yet.';
    case 'PREMIUM':
      return isMyanmar ? '📭 No recent premium updates yet.' : '📭 No recent premium updates yet.';
    default:
      return isMyanmar
        ? '📭 No recent notices or announcements yet.'
        : '📭 No recent notices or announcements yet.';
  }
}

export function buildTelegramInboxTip(mode: TelegramInboxMode, locale: SupportedLocale) {
  const isMyanmar = locale === 'my';
  if (mode === 'ALL') {
    return isMyanmar
      ? 'Tip: use the buttons below for a narrower inbox.'
      : 'Tip: use the buttons below for a narrower inbox.';
  }

  return isMyanmar
    ? 'Tip: switch back to All to see every update in one place.'
    : 'Tip: switch back to All to see every update in one place.';
}

export function buildTelegramInboxSummaryMessage(input: {
  locale: SupportedLocale;
  mode: TelegramInboxMode;
  summaryLine?: string | null;
  items: TelegramInboxSummaryItem[];
}) {
  if (input.items.length === 0) {
    return buildTelegramInboxEmptyMessage(input.mode, input.locale);
  }

  const cards = [...input.items]
    .sort((left, right) => right.sortAt.getTime() - left.sortAt.getTime())
    .slice(0, 3)
    .map((item, index) =>
      buildTelegramCommerceCard(
        `${index + 1}. ${item.icon} <b>${escapeHtml(item.title)}</b>`,
        [
          item.detail ? escapeHtml(item.detail) : null,
          item.meta ? escapeHtml(item.meta) : null,
        ],
      ),
    );

  return buildTelegramCommerceMessage({
    title: buildTelegramInboxTitle(input.mode, input.locale),
    statsLine: input.summaryLine || null,
    cards,
    footerLines: [buildTelegramInboxTip(input.mode, input.locale)],
  });
}
