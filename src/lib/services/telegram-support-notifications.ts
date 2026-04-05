import { type SupportedLocale } from '@/lib/i18n/config';
import { buildTelegramMenuCallbackData } from '@/lib/services/telegram-callbacks';
import {
  getTelegramConfig,
  getTelegramSupportLink,
  sendTelegramMessage,
} from '@/lib/services/telegram-runtime';
import {
  buildTelegramLatestReplyPreviewLines,
  escapeHtml,
} from '@/lib/services/telegram-ui';
import {
  getTelegramSupportThreadState,
  resolveTelegramSupportIssueLabel,
} from '@/lib/services/telegram-support-cards';
import { db } from '@/lib/db';

export async function sendTelegramSupportThreadAlertToAdmins(input: {
  threadId: string;
  locale: SupportedLocale;
}) {
  const config = await getTelegramConfig();
  if (!config?.botToken || config.adminChatIds.length === 0) {
    return;
  }

  const thread = await db.telegramSupportThread.findUnique({
    where: { id: input.threadId },
    include: {
      replies: {
        orderBy: [{ createdAt: 'asc' }],
        take: 4,
      },
    },
  });

  if (!thread) {
    return;
  }

  const latestReply = thread.replies[thread.replies.length - 1] || null;
  const state = getTelegramSupportThreadState({
    status: thread.status,
    waitingOn: thread.waitingOn,
    locale: input.locale,
  });
  const supportLink = await getTelegramSupportLink();
  const message = [
    input.locale === 'my'
      ? '🛟 <b>Customer support thread needs attention</b>'
      : '🛟 <b>Customer support thread needs attention</b>',
    '',
    `🧵 <b>${escapeHtml(thread.threadCode)}</b>`,
    `${input.locale === 'my' ? 'Category' : 'Category'}: <b>${escapeHtml(resolveTelegramSupportIssueLabel(thread.issueCategory, input.locale))}</b>`,
    `${input.locale === 'my' ? 'State' : 'State'}: <b>${escapeHtml(state.label)}</b>`,
    `${input.locale === 'my' ? 'User' : 'User'}: <b>${escapeHtml(thread.telegramUsername || thread.telegramUserId)}</b>`,
    ...buildTelegramLatestReplyPreviewLines({
      reply: latestReply,
      locale: input.locale,
      maxLength: 140,
    }).map((line) => escapeHtml(line)),
    '',
    input.locale === 'my'
      ? 'Use /supportqueue to open the live queue.'
      : 'Use /supportqueue to open the live queue.',
  ]
    .filter(Boolean)
    .join('\n');

  for (const adminChatId of config.adminChatIds) {
    await sendTelegramMessage(config.botToken, adminChatId, message, {
      replyMarkup: {
        inline_keyboard: [
          [
            {
              text: input.locale === 'my' ? '🛟 Support queue' : '🛟 Support queue',
              callback_data: buildTelegramMenuCallbackData('admin', 'supportqueue'),
            },
            supportLink
              ? {
                  text: input.locale === 'my' ? '🔗 Support link' : '🔗 Support link',
                  url: supportLink,
                }
              : {
                  text: input.locale === 'my' ? '📋 Review queue' : '📋 Review queue',
                  callback_data: buildTelegramMenuCallbackData('admin', 'reviewqueue'),
                },
          ],
          ...(latestReply?.mediaUrl
            ? [[{
                text: input.locale === 'my' ? '🖼 Open attachment' : '🖼 Open attachment',
                url: latestReply.mediaUrl,
              }]]
            : []),
        ],
      },
    });
  }
}
