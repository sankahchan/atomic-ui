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
      return isMyanmar ? '📬 <b>မဖတ်ရသေးသော update များ</b>' : '📬 <b>Unread updates</b>';
    case 'PINNED':
      return isMyanmar ? '📌 <b>Pin လုပ်ထားသော update များ</b>' : '📌 <b>Pinned updates</b>';
    case 'ORDERS':
      return isMyanmar ? '🧾 <b>Order update များ</b>' : '🧾 <b>Order updates</b>';
    case 'SUPPORT':
      return isMyanmar ? '🛟 <b>အကူအညီ အဖြေများ</b>' : '🛟 <b>Support replies</b>';
    case 'REFUNDS':
      return isMyanmar ? '💸 <b>Refund update များ</b>' : '💸 <b>Refund updates</b>';
    case 'ANNOUNCEMENTS':
      return isMyanmar ? '📣 <b>Notice များ</b>' : '📣 <b>Notices</b>';
    case 'PREMIUM':
      return isMyanmar ? '💎 <b>Premium update များ</b>' : '💎 <b>Premium updates</b>';
    default:
      return isMyanmar ? '📬 <b>သင့် inbox update များ</b>' : '📬 <b>Inbox updates</b>';
  }
}

export function buildTelegramInboxEmptyMessage(mode: TelegramInboxMode, locale: SupportedLocale) {
  const isMyanmar = locale === 'my';
  switch (mode) {
    case 'UNREAD':
      return isMyanmar ? '📭 မဖတ်ရသေးသော update မရှိသေးပါ။' : '📭 No unread updates right now.';
    case 'PINNED':
      return isMyanmar ? '📭 Pin လုပ်ထားသော update မရှိသေးပါ။' : '📭 No pinned updates right now.';
    case 'ORDERS':
      return isMyanmar ? '📭 မကြာသေးသော order update မရှိသေးပါ။' : '📭 No recent order updates yet.';
    case 'SUPPORT':
      return isMyanmar ? '📭 မကြာသေးသော support update မရှိသေးပါ။' : '📭 No recent support updates yet.';
    case 'REFUNDS':
      return isMyanmar ? '📭 မကြာသေးသော refund update မရှိသေးပါ။' : '📭 No recent refund updates yet.';
    case 'ANNOUNCEMENTS':
      return isMyanmar ? '📭 မကြာသေးသော announcement မရှိသေးပါ။' : '📭 No recent announcements yet.';
    case 'PREMIUM':
      return isMyanmar ? '📭 မကြာသေးသော premium update မရှိသေးပါ။' : '📭 No recent premium updates yet.';
    default:
      return isMyanmar
        ? '📭 မကြာသေးသော notice သို့မဟုတ် announcement မရှိသေးပါ။'
        : '📭 No recent notices or announcements yet.';
  }
}

export function buildTelegramInboxTip(mode: TelegramInboxMode, locale: SupportedLocale) {
  const isMyanmar = locale === 'my';
  if (mode === 'ALL') {
    return isMyanmar
      ? 'အောက်က button များဖြင့် category တစ်ခုချင်းစီ သီးသန့်ကြည့်နိုင်ပါသည်။'
      : 'Use the filters below to open one category at a time.';
  }

  return isMyanmar
    ? 'Update အားလုံးကို တစ်နေရာတည်းမှာ ကြည့်ရန် အားလုံး သို့ ပြန်ပြောင်းပါ။'
    : 'Switch back to All to see every update in one place.';
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
