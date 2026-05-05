import { type SupportedLocale } from '@/lib/i18n/config';
import {
  buildTelegramCommerceCard,
  buildTelegramCommerceMessage,
} from '@/lib/services/telegram-commerce-ui';
import {
  buildTelegramMenuCallbackData,
} from '@/lib/services/telegram-callbacks';
import { escapeHtml } from '@/lib/services/telegram-ui';
import { formatBytes } from '@/lib/utils';

export function buildTelegramReferralMessage(input: {
  referralCode: string;
  fulfilledOrders: number;
  revenue: number;
  locale: SupportedLocale;
}) {
  const isMyanmar = input.locale === 'my';
  const referralLink = `https://t.me/your_bot_username?start=ref_${input.referralCode}`;

  return buildTelegramCommerceMessage({
    title: isMyanmar ? '👥 <b>သင့် Referral အစီအစဉ်</b>' : '👥 <b>Your Referral Program</b>',
    statsLine: `🎫 <b>${input.referralCode}</b> • ${isMyanmar ? 'အဆင့်အတန်း' : 'Status'}: <b>${isMyanmar ? 'Active' : 'Active'}</b>`,
    cards: [
      buildTelegramCommerceCard(
        isMyanmar ? '📊 <b>သင့်စွမ်းဆောင်ရည်</b>' : '📊 <b>Your Performance</b>',
        [
          `${isMyanmar ? 'စုစုပေါင်း order' : 'Total orders'}: <b>${input.fulfilledOrders}</b>`,
          `${isMyanmar ? 'ရရှိသောဝင်ငွေ' : 'Revenue earned'}: <b>${input.revenue.toLocaleString()} MMK</b>`,
        ],
      ),
      buildTelegramCommerceCard(
        isMyanmar ? '🔗 <b>သင့် referral link</b>' : '🔗 <b>Your referral link</b>',
        [
          `<code>${referralLink}</code>`,
          '',
          isMyanmar 
            ? 'ဤ link ကို သူငယ်ချင်းများထံ ပို့ပေးပါ။ သူတို့ order တိုင်းအတွက် သင် reward ရရှိပါမည်။' 
            : 'Share this link with your friends. You earn rewards for every order they complete.',
        ],
      ),
    ],
    footerLines: [
      isMyanmar ? 'Reward များကို key သက်တမ်းတိုးရန် သုံးနိုင်ပါသည်။' : 'Rewards can be used to extend your keys.',
    ],
  });
}

export function buildTelegramReferralKeyboard(input: {
  referralCode: string;
  locale: SupportedLocale;
}) {
  const isMyanmar = input.locale === 'my';
  const referralLink = `https://t.me/your_bot_username?start=ref_${input.referralCode}`;

  return {
    inline_keyboard: [
      [
        {
          text: isMyanmar ? '📤 Link ကို Share မည်' : '📤 Share Link',
          url: `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(
            isMyanmar 
              ? 'ဒီ VPN bot က အရမ်းမြန်တယ်နော်၊ စမ်းသုံးကြည့်ဖို့ တိုက်တွန်းပါတယ်!' 
              : 'This VPN bot is super fast! Check it out and get a premium plan.'
          )}`,
        },
      ],
      [
        {
          text: isMyanmar ? '🎁 ဆုလာဘ်များ ကြည့်မည်' : '🎁 View Rewards',
          callback_data: buildTelegramMenuCallbackData('offers', 'all'),
        },
      ],
    ],
  };
}
