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
  formatTelegramDateTime,
} from '@/lib/services/telegram-ui';
import {
  getTelegramSupportThreadState,
  resolveTelegramSupportIssueLabel,
} from '@/lib/services/telegram-support-cards';
import { db } from '@/lib/db';

const SUPPORT_SLA_ALERT_REPEAT_MS = 6 * 60 * 60 * 1000;

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
      ? '🛟 <b>Customer support thread ကို အရေးယူရန် လိုအပ်ပါသည်</b>'
      : '🛟 <b>Customer support thread needs attention</b>',
    '',
    `🧵 <b>${escapeHtml(thread.threadCode)}</b>`,
    `${input.locale === 'my' ? 'အမျိုးအစား' : 'Category'}: <b>${escapeHtml(resolveTelegramSupportIssueLabel(thread.issueCategory, input.locale))}</b>`,
    `${input.locale === 'my' ? 'အခြေအနေ' : 'State'}: <b>${escapeHtml(state.label)}</b>`,
    `${input.locale === 'my' ? 'အသုံးပြုသူ' : 'User'}: <b>${escapeHtml(thread.telegramUsername || thread.telegramUserId)}</b>`,
    ...buildTelegramLatestReplyPreviewLines({
      reply: latestReply,
      locale: input.locale,
      maxLength: 140,
    }).map((line) => escapeHtml(line)),
    '',
    input.locale === 'my'
      ? 'Reply ပို့ရန် /supportqueue ကို ဖွင့်ပါ။'
      : 'Open /supportqueue to reply.',
  ]
    .filter(Boolean)
    .join('\n');

  for (const adminChatId of config.adminChatIds) {
    await sendTelegramMessage(config.botToken, adminChatId, message, {
      replyMarkup: {
        inline_keyboard: [
          [
            {
              text: input.locale === 'my' ? '🛟 Support စာရင်း' : '🛟 Support queue',
              callback_data: buildTelegramMenuCallbackData('admin', 'supportqueue'),
            },
            supportLink
              ? {
                  text: input.locale === 'my' ? '🔗 အကူအညီ လင့်ခ်' : '🔗 Support link',
                  url: supportLink,
                }
              : {
                  text: input.locale === 'my' ? '📋 စစ်ဆေးရန်စာရင်း' : '📋 Review queue',
                  callback_data: buildTelegramMenuCallbackData('admin', 'reviewqueue'),
                },
          ],
          ...(latestReply?.mediaUrl
            ? [[{
                text: input.locale === 'my' ? '🖼 တွဲဖိုင်ဖွင့်မည်' : '🖼 Open attachment',
                url: latestReply.mediaUrl,
              }]]
            : []),
        ],
      },
    });
  }
}

export async function runTelegramSupportSlaAlertCycle() {
  const config = await getTelegramConfig();
  if (!config?.botToken || config.adminChatIds.length === 0) {
    return {
      skipped: true,
      alerted: 0,
      errors: [] as string[],
    };
  }

  const now = new Date();
  const repeatBefore = new Date(now.getTime() - SUPPORT_SLA_ALERT_REPEAT_MS);
  const overdueThreads = await db.telegramSupportThread.findMany({
    where: {
      status: {
        in: ['OPEN', 'ESCALATED'],
      },
      firstAdminReplyAt: null,
      firstResponseDueAt: {
        lte: now,
      },
      OR: [
        { firstResponseLastAlertAt: null },
        { firstResponseLastAlertAt: { lte: repeatBefore } },
      ],
    },
    include: {
      replies: {
        orderBy: [{ createdAt: 'desc' }],
        take: 1,
      },
    },
    orderBy: [{ firstResponseDueAt: 'asc' }, { createdAt: 'asc' }],
    take: 20,
  });

  if (overdueThreads.length === 0) {
    return {
      skipped: false,
      alerted: 0,
      errors: [] as string[],
    };
  }

  const errors: string[] = [];
  let alerted = 0;
  const supportLink = await getTelegramSupportLink();

  for (const thread of overdueThreads) {
    const locale = thread.locale === 'my' ? 'my' : 'en';
    const latestReply = thread.replies[0] || null;
    const state = getTelegramSupportThreadState({
      status: thread.status,
      waitingOn: thread.waitingOn,
      locale,
    });
    const overdueMinutes = thread.firstResponseDueAt
      ? Math.max(0, Math.round((now.getTime() - thread.firstResponseDueAt.getTime()) / 60000))
      : 0;
    const overdueLabel =
      overdueMinutes >= 60
        ? `${Math.floor(overdueMinutes / 60)}h ${overdueMinutes % 60}m`
        : `${overdueMinutes}m`;
    const message = [
      locale === 'my'
        ? '🚨 <b>Support SLA အချိန်ကျော်လွန်နေပါသည်</b>'
        : '🚨 <b>Support SLA breach</b>',
      '',
      `🧵 <b>${escapeHtml(thread.threadCode)}</b>`,
      `${locale === 'my' ? 'အမျိုးအစား' : 'Category'}: <b>${escapeHtml(resolveTelegramSupportIssueLabel(thread.issueCategory, locale))}</b>`,
      `${locale === 'my' ? 'အခြေအနေ' : 'State'}: <b>${escapeHtml(state.label)}</b>`,
      `${locale === 'my' ? 'တာဝန်ယူသူ' : 'Assigned'}: <b>${escapeHtml(thread.assignedAdminName || 'Unassigned')}</b>`,
      `${locale === 'my' ? 'ဖြေကြားရန် နောက်ဆုံးအချိန်' : 'Due at'}: <b>${escapeHtml(formatTelegramDateTime(thread.firstResponseDueAt || now, locale))}</b>`,
      `${locale === 'my' ? 'ကျော်လွန်နေသည့် အချိန်' : 'Overdue by'}: <b>${escapeHtml(overdueLabel)}</b>`,
      `${locale === 'my' ? 'အသုံးပြုသူ' : 'User'}: <b>${escapeHtml(thread.telegramUsername || thread.telegramUserId)}</b>`,
      ...buildTelegramLatestReplyPreviewLines({
        reply: latestReply,
        locale,
        maxLength: 140,
      }).map((line) => escapeHtml(line)),
      '',
      locale === 'my'
        ? 'အခု reply ပို့ရန် /supportqueue ကို ဖွင့်ပါ။'
        : 'Open /supportqueue now.',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      for (const adminChatId of config.adminChatIds) {
        await sendTelegramMessage(config.botToken, adminChatId, message, {
          replyMarkup: {
            inline_keyboard: [
              [
                {
                  text: locale === 'my' ? '🛟 Support စာရင်း' : '🛟 Support queue',
                  callback_data: buildTelegramMenuCallbackData('admin', 'supportqueue'),
                },
                supportLink
                  ? {
                      text: locale === 'my' ? '🔗 အကူအညီ လင့်ခ်' : '🔗 Support link',
                      url: supportLink,
                    }
                  : {
                      text: locale === 'my' ? '📋 စစ်ဆေးရန်စာရင်း' : '📋 Review queue',
                      callback_data: buildTelegramMenuCallbackData('admin', 'reviewqueue'),
                    },
              ],
              ...(latestReply?.mediaUrl
                ? [[{
                    text: locale === 'my' ? '🖼 တွဲဖိုင်ဖွင့်မည်' : '🖼 Open attachment',
                    url: latestReply.mediaUrl,
                  }]]
                : []),
            ],
          },
        });
      }

      await db.telegramSupportThread.update({
        where: { id: thread.id },
        data: {
          firstResponseAlertSentAt: thread.firstResponseAlertSentAt || now,
          firstResponseLastAlertAt: now,
        },
      });
      alerted += 1;
    } catch (error) {
      errors.push(`${thread.threadCode}:${(error as Error).message}`);
    }
  }

  return {
    skipped: false,
    alerted,
    errors,
  };
}
