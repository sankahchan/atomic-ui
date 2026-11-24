import { type SupportedLocale } from '@/lib/i18n/config';
import { type TelegramAdminKeyDeps } from '@/lib/services/telegram-domain-types';
import {
  type DirectMessageDraft,
  type SupportReplyDraft,
} from '@/lib/services/telegram-admin-key-types';
import {
  buildCancelKeyboard,
  clearPendingAdminFlow,
  savePendingAdminFlow,
} from '@/lib/services/telegram-admin-key-flow-state';
import { escapeHtml } from '@/lib/services/telegram-ui';
import { buildTelegramAdminKeyCallbackData } from '@/lib/services/telegram-callbacks';
import { type TelegramAnnouncementCardStyle } from '@/lib/services/telegram-announcements';

export function buildTelegramAdminSupportReplyPromptMessage(input: {
  locale: SupportedLocale;
  recipientLabel: string;
}) {
  return [
    input.locale === 'my'
      ? '💬 <b>အကူအညီ အကြောင်းပြန်</b>'
      : '💬 <b>Support reply</b>',
    `${input.locale === 'my' ? 'သို့' : 'To'}: <b>${escapeHtml(input.recipientLabel)}</b>`,
    input.locale === 'my'
      ? 'Text, photo, document ပို့နိုင်ပါသည်။ /cancel ဖြင့် ရပ်နိုင်ပါသည်။'
      : 'Send text, photo, or document. Use /cancel to stop.',
  ].join('\n');
}

const CARD_STYLE_OPTIONS = ['DEFAULT', 'PROMO', 'PREMIUM', 'OPERATIONS'] as const;

const CARD_STYLE_LABELS: Record<TelegramAnnouncementCardStyle, { en: string; my: string }> = {
  DEFAULT: { en: 'Plain', my: 'ပုံမှန်' },
  PROMO: { en: 'Offer', my: 'ပရိုမိုးရှင်း' },
  PREMIUM: { en: 'Premium', my: 'ပရီမီယမ်' },
  OPERATIONS: { en: 'Service', my: 'ဝန်ဆောင်မှု' },
};

export function formatTelegramAdminCardStyleLabel(
  style: TelegramAnnouncementCardStyle,
  locale: SupportedLocale,
) {
  return CARD_STYLE_LABELS[style][locale];
}

export function buildTelegramAdminCardStyleKeyboard(locale: SupportedLocale) {
  const rows = [];
  for (let index = 0; index < CARD_STYLE_OPTIONS.length; index += 2) {
    rows.push(
      CARD_STYLE_OPTIONS.slice(index, index + 2).map((style) => ({
        text: `${style === 'DEFAULT' ? '📝' : style === 'PROMO' ? '🎁' : style === 'PREMIUM' ? '💠' : '🛠'} ${formatTelegramAdminCardStyleLabel(style, locale)}`,
        callback_data: buildTelegramAdminKeyCallbackData('card_style', style),
      })),
    );
  }
  rows.push(buildCancelKeyboard(locale).inline_keyboard[0]);
  return { inline_keyboard: rows };
}

export function buildTelegramAdminCardStylePromptMessage(input: {
  locale: SupportedLocale;
  recipientLabel: string;
}) {
  return [
    input.locale === 'my'
      ? '🎨 <b>ကတ်ပုံစံ ရွေးပါ</b>'
      : '🎨 <b>Choose a card style</b>',
    `${input.locale === 'my' ? 'သို့' : 'To'}: <b>${escapeHtml(input.recipientLabel)}</b>`,
    input.locale === 'my'
      ? 'စာမပို့မီ ကတ်ပုံစံကို ရွေးပါ။'
      : 'Pick a card style before sending the message.',
  ].join('\n');
}

export function buildTelegramAdminDirectMessagePromptMessage(input: {
  locale: SupportedLocale;
  recipientLabel: string;
  cardStyle?: TelegramAnnouncementCardStyle | null;
}) {
  return [
    input.locale === 'my'
      ? '💬 <b>တိုက်ရိုက် မက်ဆေ့ချ်</b>'
      : '💬 <b>Direct message</b>',
    `${input.locale === 'my' ? 'သို့' : 'To'}: <b>${escapeHtml(input.recipientLabel)}</b>`,
    input.cardStyle
      ? `${input.locale === 'my' ? 'ကတ်ပုံစံ' : 'Card'}: <b>${formatTelegramAdminCardStyleLabel(input.cardStyle, input.locale)}</b>`
      : null,
    input.locale === 'my'
      ? 'Text, photo, document ပို့နိုင်ပါသည်။ /cancel ဖြင့် ရပ်နိုင်ပါသည်။'
      : 'Send text, photo, or document. Use /cancel to stop.',
  ].join('\n');
}

export async function startTelegramAdminSupportReplyFlow(input: {
  telegramUserId: number;
  chatId: number;
  locale: SupportedLocale;
  botToken: string;
  threadId: string;
  customerChatId: string;
  recipientLabel: string;
  deps: TelegramAdminKeyDeps;
}) {
  const flow: SupportReplyDraft = {
    kind: 'support_reply',
    step: 'message',
    threadId: input.threadId,
    customerChatId: input.customerChatId,
    recipientLabel: input.recipientLabel,
  };

  await savePendingAdminFlow(input.telegramUserId, input.chatId, flow);
  await input.deps.sendTelegramMessage(
    input.botToken,
    input.chatId,
    buildTelegramAdminSupportReplyPromptMessage({
      locale: input.locale,
      recipientLabel: input.recipientLabel,
    }),
    {
      replyMarkup: buildCancelKeyboard(input.locale),
    },
  );
}

export async function startTelegramAdminDirectMessageFlow(input: {
  telegramUserId: number;
  chatId: number;
  locale: SupportedLocale;
  botToken: string;
  recipientChatId: string;
  recipientLabel: string;
  userId?: string | null;
  accessKeyId?: string | null;
  dynamicKeyId?: string | null;
  deps: TelegramAdminKeyDeps;
}) {
  const flow: DirectMessageDraft = {
    kind: 'direct_message',
    step: 'style',
    recipientChatId: input.recipientChatId,
    recipientLabel: input.recipientLabel,
    userId: input.userId || null,
    accessKeyId: input.accessKeyId || null,
    dynamicKeyId: input.dynamicKeyId || null,
  };

  await savePendingAdminFlow(input.telegramUserId, input.chatId, flow);
  await input.deps.sendTelegramMessage(
    input.botToken,
    input.chatId,
    buildTelegramAdminCardStylePromptMessage({
      locale: input.locale,
      recipientLabel: input.recipientLabel,
    }),
    {
      replyMarkup: buildTelegramAdminCardStyleKeyboard(input.locale),
    },
  );
}

export async function cancelTelegramAdminKeyFlow(input: {
  telegramUserId: number;
  chatId: number;
}) {
  await clearPendingAdminFlow(input.telegramUserId, input.chatId);
}
