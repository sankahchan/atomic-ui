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
    [
      input.locale === 'my'
        ? '💬 <b>Reply to support thread</b>'
        : '💬 <b>Reply to support thread</b>',
      '',
      `${input.locale === 'my' ? 'Recipient' : 'Recipient'}: <b>${escapeHtml(input.recipientLabel)}</b>`,
      input.locale === 'my'
        ? 'ယခု text, photo, သို့မဟုတ် document ကို ပို့နိုင်ပါသည်။'
        : 'Send the text, photo, or document reply now.',
    ].join('\n'),
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
    step: 'message',
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
    [
      input.locale === 'my'
        ? '💬 <b>Message user</b>'
        : '💬 <b>Message user</b>',
      '',
      `${input.locale === 'my' ? 'Recipient' : 'Recipient'}: <b>${escapeHtml(input.recipientLabel)}</b>`,
      input.locale === 'my'
        ? 'ယခု text, photo, သို့မဟုတ် document ကို ပို့နိုင်ပါသည်။'
        : 'Send the text, photo, or document now.',
    ].join('\n'),
    {
      replyMarkup: buildCancelKeyboard(input.locale),
    },
  );
}

export async function cancelTelegramAdminKeyFlow(input: {
  telegramUserId: number;
  chatId: number;
}) {
  await clearPendingAdminFlow(input.telegramUserId, input.chatId);
}
