import type { SupportedLocale } from '@/lib/i18n/config';
import { getTelegramReferralSummary } from '@/lib/services/telegram-referrals';

export function buildTelegramGiftUsageMessage(locale: SupportedLocale) {
  return locale === 'my'
    ? '🎁 အသုံးပြုပုံ: /gift @recipient_username [COUPON]\n\nဥပမာ: /gift @friend TRIAL500'
    : '🎁 Usage: /gift @recipient_username [COUPON]\n\nExample: /gift @friend TRIAL500';
}

export async function buildTelegramReferralCenterMessage(input: {
  locale: SupportedLocale;
  telegramUserId: number;
  chatId: number;
  username?: string | null;
  botUsername?: string | null;
}) {
  const summary = await getTelegramReferralSummary({
    telegramUserId: String(input.telegramUserId),
    telegramChatId: String(input.chatId),
    username: input.username,
    displayName: input.username,
  });
  const botUsername = input.botUsername?.trim().replace(/^@+/, '') || 'atomicui_bot';
  const inviteLink = `https://t.me/${botUsername}?start=ref_${summary.referralCode}`;
  const revenueLabel = new Intl.NumberFormat('en-US').format(summary.revenue);

  return [
    '🔗 <b>Referral center</b>',
    '',
    `Code: <b>${summary.referralCode}</b>`,
    `Invite link: ${inviteLink}`,
    `Converted orders: <b>${summary.fulfilledOrders}</b>`,
    `Revenue: <b>${revenueLabel} MMK</b>`,
  ].join('\n');
}
