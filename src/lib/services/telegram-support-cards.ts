import { withAbsoluteBasePath } from '@/lib/base-path';
import { type SupportedLocale } from '@/lib/i18n/config';
import {
  buildTelegramCommerceCard,
  buildTelegramCommerceMessage,
} from '@/lib/services/telegram-commerce-ui';
import {
  buildTelegramCommerceViewCallbackData,
  buildTelegramMenuCallbackData,
  buildTelegramSupportThreadCallbackData,
} from '@/lib/services/telegram-callbacks';
import {
  buildTelegramLatestReplyPreviewLines,
  escapeHtml,
  formatTelegramDateTime,
  formatTelegramPremiumSupportTypeLabel,
  getTelegramUi,
} from '@/lib/services/telegram-ui';
import {
  type TelegramSupportIssueCategory,
  type TelegramSupportThreadRecord,
} from '@/lib/services/telegram-support-types';

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

export function buildTelegramSupportReplyMediaUrl(input: {
  threadId: string;
  replyId: string;
}) {
  return withAbsoluteBasePath(
    `/api/telegram/support-threads/${encodeURIComponent(input.threadId)}/replies/${encodeURIComponent(input.replyId)}/media`,
  );
}

export function resolveTelegramSupportIssuePrompt(
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

export function formatTelegramSupportRelativeAge(date: Date, locale: SupportedLocale) {
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

export function getTelegramSupportThreadSlaLabel(input: {
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

export function buildTelegramSupportStatusSummaryMessage(input: {
  locale: SupportedLocale;
  threads: Array<{
    id: string;
    threadCode: string;
    issueCategory: string;
    status: string;
    waitingOn: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
  premiumRequests?: Array<{
    id: string;
    requestCode: string;
    requestType: string;
    status: string;
    followUpPending?: boolean | null;
    createdAt: Date;
    updatedAt?: Date | null;
    dynamicKeyName?: string | null;
  }>;
}) {
  const openThreads = input.threads.filter((thread) => thread.status !== 'HANDLED');
  const requestCount = input.premiumRequests?.length || 0;
  const stats = [
    `${openThreads.length} open`,
    `${input.threads.length} recent`,
    requestCount > 0 ? `${requestCount} premium` : null,
  ]
    .filter(Boolean)
    .join(' • ');

  const threadCards = input.threads.slice(0, 3).map((thread, index) => {
    const state = getTelegramSupportThreadState({
      status: thread.status,
      waitingOn: thread.waitingOn,
      locale: input.locale,
    });
    return buildTelegramCommerceCard(
      `${index + 1}. 🧵 <b>${escapeHtml(thread.threadCode)}</b>`,
      [
        `${escapeHtml(resolveTelegramSupportIssueLabel(thread.issueCategory, input.locale))} • ${escapeHtml(state.label)}`,
        escapeHtml(formatTelegramDateTime(thread.updatedAt || thread.createdAt, input.locale)),
      ],
    );
  });

  const premiumCards = (input.premiumRequests || []).slice(0, 2).map((request) =>
    buildTelegramCommerceCard(
      `💎 <b>${escapeHtml(request.requestCode)}</b>`,
      [
        `${escapeHtml(formatTelegramPremiumSupportTypeLabel(request.requestType, getTelegramUi(input.locale)))} • ${escapeHtml(
          request.followUpPending
            ? input.locale === 'my'
              ? 'Waiting for admin'
              : 'Waiting for admin'
            : request.status,
        )}`,
        request.dynamicKeyName ? escapeHtml(request.dynamicKeyName) : null,
      ],
    ),
  );

  if (threadCards.length === 0 && premiumCards.length === 0) {
    return input.locale === 'my'
      ? '🧵 <b>Your support center</b>\n\nNo support threads yet. Use /support to start one.'
      : '🧵 <b>Your support center</b>\n\nNo support threads yet. Use /support to start one.';
  }

  return buildTelegramCommerceMessage({
    title: input.locale === 'my' ? '🧵 <b>Your support center</b>' : '🧵 <b>Your support center</b>',
    statsLine: stats,
    cards: [...threadCards, ...premiumCards].slice(0, 4),
    footerLines: [
      input.locale === 'my'
        ? 'Use /support to start a new thread.'
        : 'Use /support to start a new thread.',
    ],
  });
}

export function buildTelegramSupportStatusSummaryKeyboard(input: {
  locale: SupportedLocale;
  threads: Array<{
    id: string;
    threadCode: string;
  }>;
  premiumRequests?: Array<{
    id: string;
    requestCode: string;
  }>;
  supportLink?: string | null;
}) {
  const isMyanmar = input.locale === 'my';
  const rows: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [];

  for (const thread of input.threads.slice(0, 3)) {
    rows.push([
      {
        text: `${isMyanmar ? 'Open' : 'Open'} ${thread.threadCode}`,
        callback_data: buildTelegramSupportThreadCallbackData('status', thread.id),
      },
    ]);
  }

  for (const request of (input.premiumRequests || []).slice(0, 2)) {
    rows.push([
      {
        text: `${isMyanmar ? 'Premium' : 'Premium'} ${truncateTelegramSupportButtonLabel(request.requestCode)}`,
        callback_data: buildTelegramCommerceViewCallbackData('supportstatus', 'detail', request.id, '1'),
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

  if (input.supportLink) {
    rows.push([{ text: isMyanmar ? '🛟 Contact admin' : '🛟 Contact admin', url: input.supportLink }]);
  }

  return { inline_keyboard: rows };
}

function truncateTelegramSupportButtonLabel(value: string, maxLength = 18) {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength - 1)}…`;
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
