import { db } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit';
import { type SupportedLocale } from '@/lib/i18n/config';
import { withAbsoluteBasePath } from '@/lib/base-path';
import {
  buildTelegramMenuCallbackData,
  buildTelegramSupportThreadCallbackData,
} from '@/lib/services/telegram-callbacks';
import {
  getTelegramConfig,
  getTelegramSupportLink,
  sendTelegramMessage,
} from '@/lib/services/telegram-runtime';
import {
  buildTelegramLatestReplyPreviewLines,
  escapeHtml,
  formatTelegramDateTime,
  getTelegramUi,
} from '@/lib/services/telegram-ui';
import { generateRandomString } from '@/lib/utils';

export type TelegramSupportIssueCategory =
  | 'ORDER'
  | 'KEY'
  | 'SERVER'
  | 'BILLING'
  | 'GENERAL';

export type TelegramSupportThreadRecord = Awaited<
  ReturnType<typeof db.telegramSupportThread.findMany>
>[number];

export function resolveTelegramSupportIssueCategory(
  value?: string | null,
): TelegramSupportIssueCategory | null {
  switch ((value || '').trim().toUpperCase()) {
    case 'ORDER':
    case 'PAYMENT':
      return 'ORDER';
    case 'KEY':
    case 'USAGE':
      return 'KEY';
    case 'SERVER':
    case 'OUTAGE':
      return 'SERVER';
    case 'BILLING':
    case 'REFUND':
      return 'BILLING';
    case 'GENERAL':
    case 'OTHER':
      return 'GENERAL';
    default:
      return null;
  }
}

export function resolveTelegramSupportIssueLabel(
  category: string,
  locale: SupportedLocale,
) {
  const isMyanmar = locale === 'my';
  switch (resolveTelegramSupportIssueCategory(category)) {
    case 'ORDER':
      return isMyanmar ? 'Order / payment' : 'Order / payment';
    case 'KEY':
      return isMyanmar ? 'Key / usage' : 'Key / usage';
    case 'SERVER':
      return isMyanmar ? 'Server / route issue' : 'Server / route issue';
    case 'BILLING':
      return isMyanmar ? 'Billing / refund' : 'Billing / refund';
    case 'GENERAL':
    default:
      return isMyanmar ? 'General help' : 'General help';
  }
}

function buildTelegramSupportReplyMediaUrl(input: {
  threadId: string;
  replyId: string;
}) {
  return withAbsoluteBasePath(
    `/api/telegram/support-threads/${encodeURIComponent(input.threadId)}/replies/${encodeURIComponent(input.replyId)}/media`,
  );
}

function resolveTelegramSupportIssuePrompt(
  category: TelegramSupportIssueCategory,
  locale: SupportedLocale,
) {
  const isMyanmar = locale === 'my';
  switch (category) {
    case 'ORDER':
      return isMyanmar
        ? 'Payment, screenshot, order status, review delay စသည့်ပြဿနာကို တစ်ကြောင်းနှစ်ကြောင်းဖြင့် ပို့ပါ။ Order code ရှိပါက ထည့်ပါ။'
        : 'Send a short message about the payment, screenshot, order status, or review delay. Include the order code if you have it.';
    case 'KEY':
      return isMyanmar
        ? 'Key name, usage, connection, renew, share page ပြဿနာကို ပို့ပါ။ Key name ရှိပါက ထည့်ပါ။'
        : 'Tell us about the key, usage, connection, renew, or share-page issue. Include the key name if you have it.';
    case 'SERVER':
      return isMyanmar
        ? 'Server name, route issue, slow connection, region problem ကို ပို့ပါ။'
        : 'Tell us the server name, route issue, slow connection, or region problem.';
    case 'BILLING':
      return isMyanmar
        ? 'Refund, receipt, billing, discount, coupon သို့ payment follow-up ပြဿနာကို ပို့ပါ။'
        : 'Tell us about the refund, receipt, billing, discount, coupon, or payment follow-up issue.';
    case 'GENERAL':
    default:
      return isMyanmar
        ? 'ဘာအကူအညီလိုသည်ကို ပို့ပါ။ လိုအပ်ပါက key name, order code, screenshot detail များကို နောက် message တွင် ထပ်ပို့နိုင်ပါသည်။'
        : 'Tell us what you need help with. You can follow up with a key name, order code, or more details in the next message.';
  }
}

export function getTelegramSupportThreadState(input: {
  status: string;
  waitingOn: string;
  locale: SupportedLocale;
}) {
  const isMyanmar = input.locale === 'my';

  if (input.status === 'HANDLED') {
    return {
      code: 'handled' as const,
      label: isMyanmar ? 'Handled' : 'Handled',
    };
  }

  if (input.status === 'ESCALATED') {
    return {
      code: 'escalated' as const,
      label: isMyanmar ? 'Escalated to panel' : 'Escalated to panel',
    };
  }

  if ((input.waitingOn || '').toUpperCase() === 'USER') {
    return {
      code: 'user' as const,
      label: isMyanmar ? 'Waiting for you' : 'Waiting for you',
    };
  }

  return {
    code: 'admin' as const,
    label: isMyanmar ? 'Waiting for admin' : 'Waiting for admin',
  };
}

function formatTelegramSupportRelativeAge(date: Date, locale: SupportedLocale) {
  const diffMs = Date.now() - date.getTime();
  const totalMinutes = Math.max(1, Math.floor(diffMs / (60 * 1000)));
  if (totalMinutes >= 24 * 60) {
    const days = Math.floor(totalMinutes / (24 * 60));
    return locale === 'my' ? `${days} ရက်` : `${days}d`;
  }
  if (totalMinutes >= 60) {
    const hours = Math.floor(totalMinutes / 60);
    return locale === 'my' ? `${hours} နာရီ` : `${hours}h`;
  }
  return locale === 'my' ? `${totalMinutes} မိနစ်` : `${totalMinutes}m`;
}

function getTelegramSupportThreadSlaLabel(input: {
  thread: {
    firstResponseDueAt?: Date | null;
    firstAdminReplyAt?: Date | null;
    status: string;
  };
  locale: SupportedLocale;
}) {
  const isMyanmar = input.locale === 'my';
  if (input.thread.status === 'HANDLED') {
    return isMyanmar ? 'Resolved' : 'Resolved';
  }
  if (input.thread.firstAdminReplyAt) {
    return isMyanmar ? 'Responded' : 'Responded';
  }
  if (input.thread.firstResponseDueAt && input.thread.firstResponseDueAt.getTime() <= Date.now()) {
    return isMyanmar ? 'First reply overdue' : 'First reply overdue';
  }
  if (input.thread.firstResponseDueAt) {
    return isMyanmar
      ? `First reply due ${formatTelegramDateTime(input.thread.firstResponseDueAt, input.locale)}`
      : `First reply due ${formatTelegramDateTime(input.thread.firstResponseDueAt, input.locale)}`;
  }
  return isMyanmar ? 'Open' : 'Open';
}

async function resolveTelegramSupportUser(input: {
  telegramChatId: string;
  telegramUserId: string;
}) {
  return db.user.findFirst({
    where: {
      OR: [
        { telegramChatId: input.telegramChatId },
        { accessKeys: { some: { telegramId: { in: [input.telegramChatId, input.telegramUserId] } } } },
        { dynamicAccessKeys: { some: { telegramId: { in: [input.telegramChatId, input.telegramUserId] } } } },
      ],
    },
    select: {
      id: true,
      email: true,
    },
  });
}

async function generateTelegramSupportThreadCode() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = `SUP-${generateRandomString(8).toUpperCase()}`;
    const existing = await db.telegramSupportThread.findUnique({
      where: { threadCode: candidate },
      select: { id: true },
    });
    if (!existing) {
      return candidate;
    }
  }

  return `SUP-${Date.now().toString(36).toUpperCase()}`;
}

export function buildTelegramSupportHubKeyboard(input: {
  locale: SupportedLocale;
  supportLink?: string | null;
}) {
  const isMyanmar = input.locale === 'my';
  const rows: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [
    [
      {
        text: isMyanmar ? '🧾 Order / payment' : '🧾 Order / payment',
        callback_data: buildTelegramSupportThreadCallbackData('new', 'order'),
      },
      {
        text: isMyanmar ? '🔑 Key / usage' : '🔑 Key / usage',
        callback_data: buildTelegramSupportThreadCallbackData('new', 'key'),
      },
    ],
    [
      {
        text: isMyanmar ? '🛠 Server / route' : '🛠 Server / route',
        callback_data: buildTelegramSupportThreadCallbackData('new', 'server'),
      },
      {
        text: isMyanmar ? '💸 Billing / refund' : '💸 Billing / refund',
        callback_data: buildTelegramSupportThreadCallbackData('new', 'billing'),
      },
    ],
    [
      {
        text: isMyanmar ? '💬 General help' : '💬 General help',
        callback_data: buildTelegramSupportThreadCallbackData('new', 'general'),
      },
      {
        text: isMyanmar ? '🧵 My threads' : '🧵 My threads',
        callback_data: buildTelegramSupportThreadCallbackData('status', 'list'),
      },
    ],
    [
      {
        text: isMyanmar ? '📬 Inbox updates' : '📬 Inbox updates',
        callback_data: buildTelegramMenuCallbackData('support', 'inbox'),
      },
      {
        text: isMyanmar ? '💎 Premium help' : '💎 Premium help',
        callback_data: buildTelegramMenuCallbackData('support', 'premium'),
      },
    ],
  ];

  if (input.supportLink) {
    rows.push([{ text: isMyanmar ? '🛟 Contact admin' : '🛟 Contact admin', url: input.supportLink }]);
  }

  return { inline_keyboard: rows };
}

export function buildTelegramSupportThreadKeyboard(input: {
  locale: SupportedLocale;
  threadId: string;
  supportLink?: string | null;
  includeEscalate?: boolean;
  attachmentUrl?: string | null;
}) {
  const isMyanmar = input.locale === 'my';
  const rows: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [
    [
      {
        text: isMyanmar ? '✍️ Reply' : '✍️ Reply',
        callback_data: buildTelegramSupportThreadCallbackData('reply', input.threadId),
      },
      {
        text: isMyanmar ? '🧵 Status' : '🧵 Status',
        callback_data: buildTelegramSupportThreadCallbackData('status', input.threadId),
      },
    ],
  ];

  if (input.includeEscalate !== false) {
    rows.push([
      {
        text: isMyanmar ? '📌 Escalate' : '📌 Escalate',
        callback_data: buildTelegramSupportThreadCallbackData('escalate', input.threadId),
      },
    ]);
  }

  rows.push([
    {
      text: isMyanmar ? '🛟 Support hub' : '🛟 Support hub',
      callback_data: buildTelegramMenuCallbackData('support', 'home'),
    },
    {
      text: isMyanmar ? '📬 Inbox' : '📬 Inbox',
      callback_data: buildTelegramMenuCallbackData('support', 'inbox'),
    },
  ]);

  if (input.attachmentUrl?.trim()) {
    rows.push([
      {
        text: isMyanmar ? '🖼 Open attachment' : '🖼 Open attachment',
        url: input.attachmentUrl.trim(),
      },
    ]);
  }

  if (input.supportLink) {
    rows.push([{ text: isMyanmar ? '🔗 Direct admin link' : '🔗 Direct admin link', url: input.supportLink }]);
  }

  return { inline_keyboard: rows };
}

export async function createTelegramSupportThread(input: {
  chatId: number;
  telegramUserId: number;
  username?: string | null;
  locale: SupportedLocale;
  category: TelegramSupportIssueCategory;
}) {
  const telegramChatId = String(input.chatId);
  const telegramUserId = String(input.telegramUserId);
  const linkedUser = await resolveTelegramSupportUser({
    telegramChatId,
    telegramUserId,
  });

  const existing = await db.telegramSupportThread.findFirst({
    where: {
      telegramChatId,
      issueCategory: input.category,
      status: {
        in: ['OPEN', 'ESCALATED'],
      },
    },
    orderBy: [{ updatedAt: 'desc' }],
    include: {
      replies: {
        orderBy: [{ createdAt: 'asc' }],
        take: 8,
      },
    },
  });

  if (existing) {
    return existing;
  }

  return db.telegramSupportThread.create({
    data: {
      threadCode: await generateTelegramSupportThreadCode(),
      status: 'OPEN',
      waitingOn: 'ADMIN',
      issueCategory: input.category,
      locale: input.locale,
      telegramChatId,
      telegramUserId,
      telegramUsername: input.username || null,
      userId: linkedUser?.id || null,
      subject: resolveTelegramSupportIssueLabel(input.category, input.locale),
      firstResponseDueAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    },
    include: {
      replies: {
        orderBy: [{ createdAt: 'asc' }],
        take: 8,
      },
    },
  });
}

export async function findTelegramSupportThreadByIdForUser(input: {
  threadId: string;
  chatId: number;
  telegramUserId: number;
}) {
  return db.telegramSupportThread.findFirst({
    where: {
      id: input.threadId,
      telegramChatId: String(input.chatId),
      telegramUserId: String(input.telegramUserId),
    },
    include: {
      replies: {
        orderBy: [{ createdAt: 'asc' }],
        take: 12,
      },
    },
  });
}

export async function listTelegramSupportThreadsForUser(input: {
  chatId: number;
  telegramUserId: number;
  limit?: number;
}) {
  return db.telegramSupportThread.findMany({
    where: {
      telegramChatId: String(input.chatId),
      telegramUserId: String(input.telegramUserId),
    },
    include: {
      replies: {
        orderBy: [{ createdAt: 'asc' }],
        take: 8,
      },
    },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    take: input.limit ?? 8,
  });
}

export async function addTelegramSupportReply(input: {
  threadId: string;
  senderType: 'CUSTOMER' | 'ADMIN';
  telegramUserId?: string | null;
  telegramUsername?: string | null;
  adminUserId?: string | null;
  senderName?: string | null;
  message?: string | null;
  mediaKind?: 'IMAGE' | 'FILE' | null;
  mediaTelegramFileId?: string | null;
  mediaFilename?: string | null;
  mediaContentType?: string | null;
  waitingOn?: 'ADMIN' | 'USER' | 'NONE';
  markHandled?: boolean;
  escalate?: boolean;
  escalationReason?: string | null;
}) {
  const now = new Date();
  const existingThread = await db.telegramSupportThread.findUnique({
    where: { id: input.threadId },
    select: {
      firstAdminReplyAt: true,
    },
  });
  const nextStatus = input.markHandled
    ? 'HANDLED'
    : input.escalate
      ? 'ESCALATED'
      : 'OPEN';
  const nextWaitingOn =
    input.markHandled ? 'NONE' : input.waitingOn || (input.senderType === 'CUSTOMER' ? 'ADMIN' : 'USER');
  const trimmedMessage = input.message?.trim() || '';
  const fallbackMessage =
    input.mediaKind === 'IMAGE'
      ? 'Image attachment'
      : input.mediaKind === 'FILE'
        ? 'File attachment'
        : '';
  const storedMessage = trimmedMessage || fallbackMessage;

  if (!storedMessage) {
    throw new Error('Support reply message is required.');
  }

  return db.$transaction(async (tx) => {
    const createdReply = await tx.telegramSupportReply.create({
      data: {
        threadId: input.threadId,
        senderType: input.senderType,
        telegramUserId: input.telegramUserId || null,
        telegramUsername: input.telegramUsername || null,
        adminUserId: input.adminUserId || null,
        senderName: input.senderName || null,
        message: storedMessage,
        mediaKind: input.mediaKind || null,
        mediaTelegramFileId: input.mediaTelegramFileId || null,
        mediaFilename: input.mediaFilename || null,
        mediaContentType: input.mediaContentType || null,
      },
    });

    const mediaUrl = input.mediaTelegramFileId
      ? buildTelegramSupportReplyMediaUrl({
          threadId: input.threadId,
          replyId: createdReply.id,
        })
      : null;

    const reply = mediaUrl
      ? await tx.telegramSupportReply.update({
          where: { id: createdReply.id },
          data: {
            mediaUrl,
          },
        })
      : createdReply;

    await tx.telegramSupportThread.update({
      where: { id: input.threadId },
      data: {
        status: nextStatus,
        waitingOn: nextWaitingOn,
        lastCustomerReplyAt: input.senderType === 'CUSTOMER' ? now : undefined,
        lastAdminReplyAt: input.senderType === 'ADMIN' ? now : undefined,
        firstAdminReplyAt:
          input.senderType === 'ADMIN'
            ? existingThread?.firstAdminReplyAt || now
            : undefined,
        handledAt: input.markHandled ? now : undefined,
        escalatedAt: input.escalate ? now : undefined,
        escalatedReason: input.escalate ? input.escalationReason?.trim() || null : undefined,
        assignedAdminUserId: input.senderType === 'ADMIN' ? input.adminUserId || null : undefined,
        assignedAdminName: input.senderType === 'ADMIN' ? input.senderName || null : undefined,
      },
    });

    return reply;
  });
}

export async function findTelegramSupportThreadByIdForAdmin(input: {
  threadId: string;
}) {
  return db.telegramSupportThread.findUnique({
    where: { id: input.threadId },
    include: {
      replies: {
        orderBy: [{ createdAt: 'asc' }],
        take: 12,
      },
    },
  });
}

export function buildTelegramSupportThreadStatusMessage(input: {
  thread: TelegramSupportThreadRecord & {
    replies: Array<{
      id: string;
      senderType: string;
      message: string;
      createdAt: Date;
      senderName?: string | null;
      mediaKind?: string | null;
      mediaUrl?: string | null;
      mediaFilename?: string | null;
    }>;
  };
  locale: SupportedLocale;
}) {
  const ui = getTelegramUi(input.locale);
  const state = getTelegramSupportThreadState({
    status: input.thread.status,
    waitingOn: input.thread.waitingOn,
    locale: input.locale,
  });
  const latestReply = input.thread.replies[input.thread.replies.length - 1] || null;

  return [
    input.locale === 'my'
      ? '🛟 <b>Support thread</b>'
      : '🛟 <b>Support thread</b>',
    '',
    `🧵 <b>${escapeHtml(input.thread.threadCode)}</b>`,
    `${input.locale === 'my' ? 'Category' : 'Category'}: <b>${escapeHtml(resolveTelegramSupportIssueLabel(input.thread.issueCategory, input.locale))}</b>`,
    `${input.locale === 'my' ? 'Status' : 'Status'}: <b>${escapeHtml(state.label)}</b>`,
    `${input.locale === 'my' ? 'SLA' : 'SLA'}: <b>${escapeHtml(getTelegramSupportThreadSlaLabel({ thread: input.thread, locale: input.locale }))}</b>`,
    `${input.locale === 'my' ? 'Age' : 'Age'}: <b>${escapeHtml(formatTelegramSupportRelativeAge(input.thread.updatedAt || input.thread.createdAt, input.locale))}</b>`,
    input.thread.assignedAdminName
      ? `${input.locale === 'my' ? 'Assigned' : 'Assigned'}: <b>${escapeHtml(input.thread.assignedAdminName)}</b>`
      : '',
    input.thread.escalatedAt
      ? `${input.locale === 'my' ? 'Escalated' : 'Escalated'}: ${escapeHtml(formatTelegramDateTime(input.thread.escalatedAt, input.locale))}`
      : '',
    input.thread.relatedOrderCode
      ? `${ui.orderCodeLabel}: <b>${escapeHtml(input.thread.relatedOrderCode)}</b>`
      : '',
    input.thread.relatedKeyName
      ? `${input.locale === 'my' ? 'Key' : 'Key'}: <b>${escapeHtml(input.thread.relatedKeyName)}</b>`
      : '',
    latestReply?.mediaKind
      ? `${input.locale === 'my' ? 'Attachment' : 'Attachment'}: <b>${escapeHtml(
          latestReply.mediaKind === 'IMAGE'
            ? input.locale === 'my'
              ? 'Image'
              : 'Image'
            : latestReply.mediaKind === 'FILE'
              ? latestReply.mediaFilename || (input.locale === 'my' ? 'File' : 'File')
              : latestReply.mediaKind,
        )}</b>`
      : '',
    latestReply?.mediaUrl
      ? input.locale === 'my'
        ? 'Attachment is ready below.'
        : 'Attachment is ready below.'
      : '',
    ...buildTelegramLatestReplyPreviewLines({
      reply: latestReply,
      locale: input.locale,
      maxLength: 140,
    }).map((line) => escapeHtml(line)),
    '',
    input.locale === 'my'
      ? state.code === 'user'
        ? 'လိုအပ်သော အချက်အလက်ကို reply လုပ်ပေးပါ။'
        : state.code === 'handled'
          ? 'Thread ကို ပြန်ဖွင့်လိုပါက Reply ကို နှိပ်ပြီး message ပို့နိုင်ပါသည်။'
          : 'Admin reply ကို ဤ chat ထဲမှာ စောင့်နိုင်ပါသည်။'
      : state.code === 'user'
        ? 'Reply here with the extra detail we need.'
        : state.code === 'handled'
          ? 'Use Reply if you want to reopen this thread.'
          : 'Wait here for the admin reply in this chat.',
  ]
    .filter(Boolean)
    .join('\n');
}

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
