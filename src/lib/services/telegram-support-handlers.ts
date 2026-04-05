import { writeAuditLog } from '@/lib/audit';
import { type SupportedLocale } from '@/lib/i18n/config';
import {
  buildTelegramSupportHubKeyboard,
  buildTelegramSupportThreadKeyboard,
  buildTelegramSupportThreadStatusMessage,
  resolveTelegramSupportIssuePrompt,
  resolveTelegramSupportIssueLabel,
  getTelegramSupportThreadState,
} from '@/lib/services/telegram-support-cards';
import {
  addTelegramSupportReply,
  createTelegramSupportThread,
  findTelegramSupportThreadByIdForUser,
  listTelegramSupportThreadsForUser,
} from '@/lib/services/telegram-support-data';
import { sendTelegramSupportThreadAlertToAdmins } from '@/lib/services/telegram-support-notifications';
import { type TelegramSupportIssueCategory } from '@/lib/services/telegram-support-types';
import {
  getTelegramSupportLink,
  sendTelegramMessage,
} from '@/lib/services/telegram-runtime';
import {
  escapeHtml,
  formatTelegramDateTime,
} from '@/lib/services/telegram-ui';

export async function handleTelegramSupportThreadStart(input: {
  chatId: number;
  telegramUserId: number;
  username?: string | null;
  locale: SupportedLocale;
  botToken: string;
  category: TelegramSupportIssueCategory;
  setPendingSupportReply: (input: {
    telegramUserId: string;
    telegramChatId?: string | null;
    threadId?: string | null;
  }) => Promise<unknown>;
}) {
  const supportLink = await getTelegramSupportLink();
  const thread = await createTelegramSupportThread({
    chatId: input.chatId,
    telegramUserId: input.telegramUserId,
    username: input.username || null,
    locale: input.locale,
    category: input.category,
  });

  await input.setPendingSupportReply({
    telegramUserId: String(input.telegramUserId),
    telegramChatId: String(input.chatId),
    threadId: thread.id,
  });

  const message = [
    buildTelegramSupportThreadStatusMessage({
      thread,
      locale: input.locale,
    }),
    '',
    input.locale === 'my'
      ? '<b>Next step</b>'
      : '<b>Next step</b>',
    escapeHtml(resolveTelegramSupportIssuePrompt(input.category, input.locale)),
  ].join('\n');

  await sendTelegramMessage(input.botToken, input.chatId, message, {
    replyMarkup: buildTelegramSupportThreadKeyboard({
      locale: input.locale,
      threadId: thread.id,
      supportLink,
      attachmentUrl: thread.replies[thread.replies.length - 1]?.mediaUrl || null,
    }),
  });

  return null;
}

export async function handleTelegramSupportReplyText(input: {
  chatId: number;
  telegramUserId: number;
  username: string;
  locale: SupportedLocale;
  botToken: string;
  text: string;
  getPendingSupportReply: (input: {
    telegramUserId: string;
    telegramChatId?: string | null;
  }) => Promise<{ threadId: string; startedAt: Date | null } | null>;
  setPendingSupportReply: (input: {
    telegramUserId: string;
    telegramChatId?: string | null;
    threadId?: string | null;
  }) => Promise<unknown>;
}) {
  const pending = await input.getPendingSupportReply({
    telegramUserId: String(input.telegramUserId),
    telegramChatId: String(input.chatId),
  });
  if (!pending) {
    return null;
  }

  const supportLink = await getTelegramSupportLink();
  const thread = await findTelegramSupportThreadByIdForUser({
    threadId: pending.threadId,
    chatId: input.chatId,
    telegramUserId: input.telegramUserId,
  });

  if (!thread || thread.status === 'HANDLED') {
    await input.setPendingSupportReply({
      telegramUserId: String(input.telegramUserId),
      telegramChatId: String(input.chatId),
      threadId: null,
    });
    return input.locale === 'my'
      ? 'ဤ support thread ကို ဆက်မရေးနိုင်တော့ပါ။ /support ကို ပြန်ဖွင့်ပြီး အသစ်စတင်နိုင်ပါသည်။'
      : 'This support thread can no longer accept replies. Use /support to start again.';
  }

  await addTelegramSupportReply({
    threadId: thread.id,
    senderType: 'CUSTOMER',
    telegramUserId: String(input.telegramUserId),
    telegramUsername: input.username || null,
    senderName: input.username || null,
    message: input.text,
    waitingOn: 'ADMIN',
  });

  await input.setPendingSupportReply({
    telegramUserId: String(input.telegramUserId),
    telegramChatId: String(input.chatId),
    threadId: null,
  });

  await writeAuditLog({
    action: 'TELEGRAM_SUPPORT_REPLY_SUBMITTED',
    entity: 'TELEGRAM_SUPPORT_THREAD',
    entityId: thread.id,
    details: {
      threadCode: thread.threadCode,
      issueCategory: thread.issueCategory,
      telegramChatId: thread.telegramChatId,
      telegramUserId: thread.telegramUserId,
    },
  });

  await sendTelegramSupportThreadAlertToAdmins({
    threadId: thread.id,
    locale: input.locale,
  });

  await sendTelegramMessage(
    input.botToken,
    input.chatId,
    [
      input.locale === 'my'
        ? `✅ <b>${escapeHtml(thread.threadCode)}</b> ကို support queue သို့ ပို့ပြီးပါပြီ။`
        : `✅ <b>${escapeHtml(thread.threadCode)}</b> was sent to the support queue.`,
      '',
      input.locale === 'my'
        ? 'Admin reply ရလာသည်နှင့် ဤ chat ထဲတွင် update ပြန်ပို့ပါမည်။'
        : 'You will get the admin reply here in this chat as soon as it is available.',
    ].join('\n'),
    {
      replyMarkup: buildTelegramSupportThreadKeyboard({
        locale: input.locale,
        threadId: thread.id,
        supportLink,
        attachmentUrl: null,
      }),
    },
  );

  return null;
}

export async function handleTelegramSupportReplyMedia(input: {
  chatId: number;
  telegramUserId: number;
  username: string;
  locale: SupportedLocale;
  botToken: string;
  caption?: string | null;
  mediaKind: 'IMAGE' | 'FILE';
  mediaTelegramFileId: string;
  mediaFilename?: string | null;
  mediaContentType?: string | null;
  getPendingSupportReply: (input: {
    telegramUserId: string;
    telegramChatId?: string | null;
  }) => Promise<{ threadId: string; startedAt: Date | null } | null>;
  setPendingSupportReply: (input: {
    telegramUserId: string;
    telegramChatId?: string | null;
    threadId?: string | null;
  }) => Promise<unknown>;
}) {
  const pending = await input.getPendingSupportReply({
    telegramUserId: String(input.telegramUserId),
    telegramChatId: String(input.chatId),
  });
  if (!pending) {
    return null;
  }

  const supportLink = await getTelegramSupportLink();
  const thread = await findTelegramSupportThreadByIdForUser({
    threadId: pending.threadId,
    chatId: input.chatId,
    telegramUserId: input.telegramUserId,
  });

  if (!thread || thread.status === 'HANDLED') {
    await input.setPendingSupportReply({
      telegramUserId: String(input.telegramUserId),
      telegramChatId: String(input.chatId),
      threadId: null,
    });
    return input.locale === 'my'
      ? 'ဤ support thread ကို ဆက်မရေးနိုင်တော့ပါ။ /support ကို ပြန်ဖွင့်ပြီး အသစ်စတင်နိုင်ပါသည်။'
      : 'This support thread can no longer accept replies. Use /support to start again.';
  }

  await addTelegramSupportReply({
    threadId: thread.id,
    senderType: 'CUSTOMER',
    telegramUserId: String(input.telegramUserId),
    telegramUsername: input.username || null,
    senderName: input.username || null,
    message:
      input.caption?.trim()
      || (input.mediaKind === 'IMAGE'
        ? 'Customer sent an image attachment.'
        : 'Customer sent a file attachment.'),
    mediaKind: input.mediaKind,
    mediaTelegramFileId: input.mediaTelegramFileId,
    mediaFilename: input.mediaFilename || null,
    mediaContentType: input.mediaContentType || null,
    waitingOn: 'ADMIN',
  });

  await input.setPendingSupportReply({
    telegramUserId: String(input.telegramUserId),
    telegramChatId: String(input.chatId),
    threadId: null,
  });

  await writeAuditLog({
    action: 'TELEGRAM_SUPPORT_REPLY_SUBMITTED',
    entity: 'TELEGRAM_SUPPORT_THREAD',
    entityId: thread.id,
    details: {
      threadCode: thread.threadCode,
      issueCategory: thread.issueCategory,
      telegramChatId: thread.telegramChatId,
      telegramUserId: thread.telegramUserId,
      mediaKind: input.mediaKind,
      mediaFilename: input.mediaFilename || null,
    },
  });

  await sendTelegramSupportThreadAlertToAdmins({
    threadId: thread.id,
    locale: input.locale,
  });

  await sendTelegramMessage(
    input.botToken,
    input.chatId,
    [
      input.locale === 'my'
        ? `✅ <b>${escapeHtml(thread.threadCode)}</b> ကို support queue သို့ ပို့ပြီးပါပြီ။`
        : `✅ <b>${escapeHtml(thread.threadCode)}</b> was sent to the support queue.`,
      '',
      input.locale === 'my'
        ? 'Admin reply ရလာသည်နှင့် ဤ chat ထဲတွင် update ပြန်ပို့ပါမည်။'
        : 'You will get the admin reply here in this chat as soon as it is available.',
    ].join('\n'),
    {
      replyMarkup: buildTelegramSupportThreadKeyboard({
        locale: input.locale,
        threadId: thread.id,
        supportLink,
        attachmentUrl: null,
      }),
    },
  );

  return null;
}

export async function handleTelegramSupportStatusCommand(input: {
  chatId: number;
  telegramUserId: number;
  locale: SupportedLocale;
  botToken: string;
  premiumRequests?: Array<{
    requestCode: string;
    status: string;
    requestType: string;
    createdAt: Date;
    handledAt?: Date | null;
    dismissedAt?: Date | null;
    followUpPending?: boolean | null;
  }>;
}) {
  const supportLink = await getTelegramSupportLink();
  const threads = await listTelegramSupportThreadsForUser({
    chatId: input.chatId,
    telegramUserId: input.telegramUserId,
    limit: 5,
  });
  const openThreads = threads.filter((thread) => thread.status !== 'HANDLED');
  const latestThread = threads[0] || null;

  const lines = [
    input.locale === 'my'
      ? '🧵 <b>Your support center</b>'
      : '🧵 <b>Your support center</b>',
    '',
    input.locale === 'my'
      ? `${openThreads.length} open • ${threads.length} recent`
      : `${openThreads.length} open • ${threads.length} recent`,
  ];

  if (latestThread) {
    const state = getTelegramSupportThreadState({
      status: latestThread.status,
      waitingOn: latestThread.waitingOn,
      locale: input.locale,
    });
    lines.push(
      '',
      `${input.locale === 'my' ? 'Latest thread' : 'Latest thread'}: <b>${escapeHtml(latestThread.threadCode)}</b>`,
      `${input.locale === 'my' ? 'Category' : 'Category'}: <b>${escapeHtml(resolveTelegramSupportIssueLabel(latestThread.issueCategory, input.locale))}</b>`,
      `${input.locale === 'my' ? 'State' : 'State'}: <b>${escapeHtml(state.label)}</b>`,
      `${input.locale === 'my' ? 'Updated' : 'Updated'}: <b>${escapeHtml(formatTelegramDateTime(latestThread.updatedAt, input.locale))}</b>`,
    );
  }

  if (input.premiumRequests && input.premiumRequests.length > 0) {
    lines.push(
      '',
      input.locale === 'my'
        ? '<b>Premium support</b>'
        : '<b>Premium support</b>',
      ...input.premiumRequests.slice(0, 2).map((request) => {
        const statusLabel =
          request.followUpPending
            ? input.locale === 'my'
              ? 'Waiting for admin'
              : 'Waiting for admin'
            : request.status;
        return `• <b>${escapeHtml(request.requestCode)}</b> • ${escapeHtml(statusLabel)}`;
      }),
    );
  }

  if (threads.length === 0 && (!input.premiumRequests || input.premiumRequests.length === 0)) {
    lines.push(
      '',
      input.locale === 'my'
        ? 'Support thread မရှိသေးပါ။ /support ကို ဖွင့်ပြီး category တစ်ခုကို ရွေးနိုင်ပါသည်။'
        : 'There are no support threads yet. Open /support and choose a category to start.',
    );
  }

  await sendTelegramMessage(input.botToken, input.chatId, lines.join('\n'), {
    replyMarkup:
      latestThread
        ? buildTelegramSupportThreadKeyboard({
            locale: input.locale,
            threadId: latestThread.id,
            supportLink,
            attachmentUrl: latestThread.replies[latestThread.replies.length - 1]?.mediaUrl || null,
          })
        : buildTelegramSupportHubKeyboard({
            locale: input.locale,
            supportLink,
          }),
  });

  return null;
}
