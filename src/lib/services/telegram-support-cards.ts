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
      return isMyanmar ? 'Order / ငွေပေးချေမှု' : 'Order / payment';
    case 'KEY':
      return isMyanmar ? 'Key / အသုံးပြုမှု' : 'Key / usage';
    case 'SERVER':
      return isMyanmar ? 'Server / လမ်းကြောင်း' : 'Server / route issue';
    case 'BILLING':
      return isMyanmar ? 'ငွေပေးချေမှု / coupon' : 'Billing / coupon';
    case 'GENERAL':
    default:
      return isMyanmar ? 'အထွေထွေ အကူအညီ' : 'General help';
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
        ? 'Payment, screenshot, order status, review delay ပြဿနာကို ပို့ပါ။ Order code ရှိပါက ထည့်ပါ။'
        : 'Tell us the payment, screenshot, order-status, or review issue. Include the order code if you have it.';
    case 'KEY':
      return isMyanmar
        ? 'Key, usage, connection, renew, share page ပြဿနာကို ပို့ပါ။ Key name ရှိပါက ထည့်ပါ။'
        : 'Tell us the key, usage, connection, renew, or share-page issue. Include the key name if you have it.';
    case 'SERVER':
      return isMyanmar
        ? 'Server name, route issue, slow connection, region problem ကို ပို့ပါ။'
        : 'Tell us the server name, route issue, slow connection, or region problem.';
    case 'BILLING':
      return isMyanmar
        ? 'Receipt, billing, discount, coupon, payment follow-up ပြဿနာကို ပို့ပါ။'
        : 'Tell us the receipt, billing, discount, coupon, or payment follow-up issue.';
    case 'GENERAL':
    default:
      return isMyanmar
        ? 'ဘာအကူအညီလိုသည်ကို ပို့ပါ။ Key name သို့ order code ရှိပါက ထည့်ပါ။'
        : 'Tell us what you need help with. Add a key name or order code if you have one.';
  }
}

export function buildTelegramSupportThreadStartMessage(input: {
  threadCode: string;
  issueCategory: string;
  locale: SupportedLocale;
}) {
  const prompt = resolveTelegramSupportIssuePrompt(
    resolveTelegramSupportIssueCategory(input.issueCategory) || 'GENERAL',
    input.locale,
  );

  return buildTelegramCommerceMessage({
    title:
      input.locale === 'my'
        ? '🛟 <b>Support request စတင်ပြီးပါပြီ</b>'
        : '🛟 <b>Support request started</b>',
    statsLine: `🧵 <b>${escapeHtml(input.threadCode)}</b> • ${escapeHtml(
      resolveTelegramSupportIssueLabel(input.issueCategory, input.locale),
    )}`,
    cards: [
      buildTelegramCommerceCard(
        input.locale === 'my' ? '✍️ <b>နောက်တစ်ဆင့်</b>' : '✍️ <b>Next step</b>',
        [
          escapeHtml(prompt),
          input.locale === 'my'
            ? 'လိုအပ်ပါက screenshot သို့ file ကို နောက်တစ်ချက် ပို့နိုင်ပါသည်။'
            : 'You can send a screenshot or file next if needed.',
        ],
      ),
    ],
    footerLines: [
      input.locale === 'my'
        ? 'Admin အဖြေကို ဒီ chat မှာ ရပါမည်။'
        : 'Admin will reply in this chat.',
    ],
  });
}

export function buildTelegramSupportReplyClosedMessage(locale: SupportedLocale) {
  return locale === 'my'
    ? '🧵 ဤ thread ပိတ်ထားပါသည်။ အသစ်စရန် /support ကို သုံးပါ။'
    : '🧵 This thread is closed. Use /support to start a new one.';
}

export function buildTelegramSupportReplySubmittedMessage(input: {
  threadCode: string;
  locale: SupportedLocale;
}) {
  return [
    input.locale === 'my'
      ? `✅ <b>${escapeHtml(input.threadCode)}</b> ကို ပို့ပြီးပါပြီ။`
      : `✅ <b>${escapeHtml(input.threadCode)}</b> sent.`,
    input.locale === 'my'
      ? 'Admin အဖြေကို ဒီ chat မှာ စောင့်ပါ။'
      : 'Admin will reply here.',
  ].join('\n');
}

export function buildTelegramSupportHubMessage(input: {
  locale: SupportedLocale;
  openThreadCount: number;
  recentThreadCount: number;
  premiumRequestCount: number;
  latestThread?: {
    threadCode: string;
    issueLabel: string;
    stateLabel: string;
    updatedAtLabel: string;
  } | null;
  latestPremiumRequest?: {
    requestCode: string;
    keyName?: string | null;
    requestTypeLabel: string;
    stateLabel: string;
    replyStateLabel: string;
    updatedAtLabel: string;
  } | null;
  supportLinkConfigured?: boolean;
}) {
  const isMyanmar = input.locale === 'my';
  const quickRouteLines = isMyanmar
    ? [
        '🧾 Order • proof, review, ငွေပေးချေမှု',
        '🔑 Key • connect, renew, usage',
        '🛠 Server • route, slow, region issue',
      ]
    : [
        '🧾 Order • proof, review, payment',
        '🔑 Key • connect, renew, usage',
        '🛠 Server • route, slow, region issue',
      ];
  const stats = [
    isMyanmar ? `${input.openThreadCount} ခု ဖွင့်ထား` : `${input.openThreadCount} open`,
    isMyanmar ? `${input.recentThreadCount} ခု recent` : `${input.recentThreadCount} recent`,
    input.premiumRequestCount > 0
      ? isMyanmar
        ? `${input.premiumRequestCount} ခု premium`
        : `${input.premiumRequestCount} premium`
      : null,
  ]
    .filter(Boolean)
    .join(' • ');

  const cards: string[] = [];

  if (input.latestThread) {
    cards.push(
      buildTelegramCommerceCard(
        isMyanmar ? '🧵 <b>ဖွင့်ထားသော thread</b>' : '🧵 <b>Open thread</b>',
        [
          `<b>${escapeHtml(input.latestThread.threadCode)}</b> • ${escapeHtml(input.latestThread.issueLabel)}`,
          `${escapeHtml(input.latestThread.stateLabel)} • ${escapeHtml(input.latestThread.updatedAtLabel)}`,
        ],
      ),
    );
  } else {
    cards.push(
      buildTelegramCommerceCard(
        isMyanmar ? '🧵 <b>ဖွင့်ထားသော thread</b>' : '🧵 <b>Open thread</b>',
        [
          isMyanmar
            ? 'ယခုအချိန်တွင် ဖွင့်ထားသော thread မရှိသေးပါ။'
            : 'You do not have an open thread right now.',
          isMyanmar
            ? 'အောက်က category တစ်ခုကို ရွေးပြီး စတင်နိုင်ပါသည်။'
            : 'Pick a category below to start one.',
        ],
      ),
    );
  }

  if (input.latestPremiumRequest) {
    cards.push(
      buildTelegramCommerceCard(
        isMyanmar ? '💎 <b>နောက်ဆုံး premium request</b>' : '💎 <b>Latest premium request</b>',
        [
          [`<b>${escapeHtml(input.latestPremiumRequest.requestCode)}</b>`, input.latestPremiumRequest.keyName ? escapeHtml(input.latestPremiumRequest.keyName) : null]
            .filter(Boolean)
            .join(' • '),
          `${escapeHtml(input.latestPremiumRequest.requestTypeLabel)} • ${escapeHtml(input.latestPremiumRequest.stateLabel)}`,
          `${escapeHtml(input.latestPremiumRequest.replyStateLabel)} • ${escapeHtml(input.latestPremiumRequest.updatedAtLabel)}`,
        ],
      ),
    );
  }

  cards.push(
    buildTelegramCommerceCard(
      isMyanmar ? '🧭 <b>အမြန်ရွေးချယ်ရန်</b>' : '🧭 <b>Fast lanes</b>',
      quickRouteLines,
    ),
  );

  return buildTelegramCommerceMessage({
    title: isMyanmar ? '🛟 <b>အကူအညီ စင်တာ</b>' : '🛟 <b>Support center</b>',
    statsLine: stats,
    cards,
    footerLines: input.supportLinkConfigured ? undefined : [getTelegramUi(input.locale).noSupportLink],
  });
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
      label: isMyanmar ? 'ဖြေရှင်းပြီး' : 'Handled',
    };
  }

  if (input.status === 'ESCALATED') {
    return {
      code: 'escalated' as const,
      label: isMyanmar ? 'Panel သို့ တင်ထားသည်' : 'Escalated to panel',
    };
  }

  if ((input.waitingOn || '').toUpperCase() === 'USER') {
    return {
      code: 'user' as const,
      label: isMyanmar ? 'သင့်အဖြေ စောင့်နေ' : 'Waiting for you',
    };
  }

  return {
    code: 'admin' as const,
    label: isMyanmar ? 'Admin အဖြေ စောင့်နေ' : 'Waiting for admin',
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
    return isMyanmar ? 'ဖြေရှင်းပြီး' : 'Resolved';
  }
  if (input.thread.firstAdminReplyAt) {
    return isMyanmar ? 'အဖြေပြန်ပြီး' : 'Responded';
  }
  if (input.thread.firstResponseDueAt && input.thread.firstResponseDueAt.getTime() <= Date.now()) {
    return isMyanmar ? 'ပထမအဖြေ နောက်ကျနေ' : 'First reply overdue';
  }
  if (input.thread.firstResponseDueAt) {
    return isMyanmar
      ? `ပထမအဖြေ deadline ${formatTelegramDateTime(input.thread.firstResponseDueAt, input.locale)}`
      : `First reply due ${formatTelegramDateTime(input.thread.firstResponseDueAt, input.locale)}`;
  }
  return isMyanmar ? 'ဖွင့်ထား' : 'Open';
}

export function buildTelegramSupportHubKeyboard(input: {
  locale: SupportedLocale;
  supportLink?: string | null;
  showPremiumShortcut?: boolean;
}) {
  const isMyanmar = input.locale === 'my';
  const rows: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [
    [
      {
        text: isMyanmar ? '🧾 Order / ငွေပေးချေမှု' : '🧾 Order / payment',
        callback_data: buildTelegramSupportThreadCallbackData('new', 'order'),
      },
      {
        text: isMyanmar ? '🔑 Key / အသုံးပြုမှု' : '🔑 Key / usage',
        callback_data: buildTelegramSupportThreadCallbackData('new', 'key'),
      },
    ],
    [
      {
        text: isMyanmar ? '🛠 Server / လမ်းကြောင်း' : '🛠 Server / route',
        callback_data: buildTelegramSupportThreadCallbackData('new', 'server'),
      },
      {
        text: isMyanmar ? '💳 ငွေပေးချေမှု / coupon' : '💳 Billing / coupon',
        callback_data: buildTelegramSupportThreadCallbackData('new', 'billing'),
      },
    ],
    [
      {
        text: isMyanmar ? '💬 အထွေထွေ အကူအညီ' : '💬 General help',
        callback_data: buildTelegramSupportThreadCallbackData('new', 'general'),
      },
      {
        text: isMyanmar ? '🧵 ကျွန်ုပ်၏ thread များ' : '🧵 My threads',
        callback_data: buildTelegramSupportThreadCallbackData('status', 'list'),
      },
    ],
  ];

  rows.push(
    input.showPremiumShortcut
      ? [
          {
            text: isMyanmar ? '🗂 ကျွန်ုပ်၏ key များ' : '🗂 My keys',
            callback_data: buildTelegramMenuCallbackData('support', 'keys'),
          },
          {
            text: isMyanmar ? '💎 Premium အကူအညီ' : '💎 Premium help',
            callback_data: buildTelegramMenuCallbackData('support', 'premium'),
          },
        ]
      : [
          {
            text: isMyanmar ? '🗂 ကျွန်ုပ်၏ key များ' : '🗂 My keys',
            callback_data: buildTelegramMenuCallbackData('support', 'keys'),
          },
          {
            text: isMyanmar ? '📬 Inbox' : '📬 Inbox',
            callback_data: buildTelegramMenuCallbackData('support', 'inbox'),
          },
        ],
  );

  if (input.supportLink) {
    rows.push([{ text: isMyanmar ? '🛟 Admin ကို ဆက်သွယ်ရန်' : '🛟 Contact admin', url: input.supportLink }]);
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
        text: isMyanmar ? '🧵 Thread ဖွင့်ရန်' : '🧵 Open thread',
        callback_data: buildTelegramSupportThreadCallbackData('status', input.threadId),
      },
      {
        text: isMyanmar ? '✍️ အကြောင်းပြန်မည်' : '✍️ Reply',
        callback_data: buildTelegramSupportThreadCallbackData('reply', input.threadId),
      },
    ],
  ];

  if (input.includeEscalate !== false) {
    rows.push([
      {
        text: isMyanmar ? '📌 Panel သို့ တင်မည်' : '📌 Escalate',
        callback_data: buildTelegramSupportThreadCallbackData('escalate', input.threadId),
      },
    ]);
  }

  rows.push([
    {
      text: isMyanmar ? '🛟 အကူအညီ စင်တာ' : '🛟 Support hub',
      callback_data: buildTelegramMenuCallbackData('support', 'home'),
    },
    {
      text: isMyanmar ? '🗂 ကျွန်ုပ်၏ key များ' : '🗂 My keys',
      callback_data: buildTelegramMenuCallbackData('support', 'keys'),
    },
  ]);

  if (input.attachmentUrl?.trim()) {
    rows.push([
      {
        text: isMyanmar ? '🖼 Attachment ဖွင့်ရန်' : '🖼 Open attachment',
        url: input.attachmentUrl.trim(),
      },
    ]);
  }

  if (input.supportLink) {
    rows.push([{ text: isMyanmar ? '🔗 Admin link' : '🔗 Direct admin link', url: input.supportLink }]);
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
    input.locale === 'my' ? `${openThreads.length} ခု ဖွင့်ထား` : `${openThreads.length} open`,
    input.locale === 'my' ? `${input.threads.length} ခု recent` : `${input.threads.length} recent`,
    requestCount > 0 ? input.locale === 'my' ? `${requestCount} ခု premium` : `${requestCount} premium` : null,
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
              ? 'Admin အဖြေ စောင့်နေ'
              : 'Waiting for admin'
            : request.status,
        )}`,
        request.dynamicKeyName ? escapeHtml(request.dynamicKeyName) : null,
      ],
    ),
  );

  if (threadCards.length === 0 && premiumCards.length === 0) {
    return input.locale === 'my'
      ? '🧵 <b>သင့် thread များ</b>\n\nSupport thread မရှိသေးပါ။ /support ဖြင့် စတင်နိုင်ပါသည်။'
      : '🧵 <b>Your threads</b>\n\nNo support threads yet. Use /support to start one.';
  }

  return buildTelegramCommerceMessage({
    title: input.locale === 'my' ? '🧵 <b>သင့် thread များ</b>' : '🧵 <b>Your threads</b>',
    statsLine: stats,
    cards: [...threadCards, ...premiumCards].slice(0, 4),
    footerLines: [
      input.locale === 'my'
        ? 'Thread ကို ဖွင့်ရန် အောက်က button ကိုနှိပ်ပါ သို့မဟုတ် /support ဖြင့် အသစ်စတင်ပါ။'
        : 'Tap a thread below to open it, or use /support to start a new one.',
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
        text: `${isMyanmar ? 'ဖွင့်ရန်' : 'Open'} ${thread.threadCode}`,
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
      text: isMyanmar ? '🆕 Thread အသစ်' : '🆕 New thread',
      callback_data: buildTelegramMenuCallbackData('support', 'home'),
    },
    {
      text: isMyanmar ? '🗂 ကျွန်ုပ်၏ key များ' : '🗂 My keys',
      callback_data: buildTelegramMenuCallbackData('support', 'keys'),
    },
  ]);

  if (input.supportLink) {
    rows.push([{ text: isMyanmar ? '🛟 Admin ကို ဆက်သွယ်ရန်' : '🛟 Contact admin', url: input.supportLink }]);
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
  const state = getTelegramSupportThreadState({
    status: input.thread.status,
    waitingOn: input.thread.waitingOn,
    locale: input.locale,
  });
  const latestReply = input.thread.replies[input.thread.replies.length - 1] || null;
  const snapshotLines = [
    `${escapeHtml(resolveTelegramSupportIssueLabel(input.thread.issueCategory, input.locale))} • ${escapeHtml(state.label)}`,
    `${input.locale === 'my' ? 'SLA' : 'SLA'} <b>${escapeHtml(
      getTelegramSupportThreadSlaLabel({ thread: input.thread, locale: input.locale }),
    )}</b> • ${input.locale === 'my' ? 'ကြာချိန်' : 'Age'} <b>${escapeHtml(
      formatTelegramSupportRelativeAge(input.thread.updatedAt || input.thread.createdAt, input.locale),
    )}</b>`,
    input.thread.assignedAdminName
      ? `${input.locale === 'my' ? 'တာဝန်ယူသူ' : 'Assigned'}: <b>${escapeHtml(input.thread.assignedAdminName)}</b>`
      : null,
    input.thread.escalatedAt
      ? `${input.locale === 'my' ? 'တင်ပို့ချိန်' : 'Escalated'}: ${escapeHtml(
          formatTelegramDateTime(input.thread.escalatedAt, input.locale),
        )}`
      : null,
    [input.thread.relatedOrderCode ? `Order: <b>${escapeHtml(input.thread.relatedOrderCode)}</b>` : null, input.thread.relatedKeyName ? `Key: <b>${escapeHtml(input.thread.relatedKeyName)}</b>` : null]
      .filter(Boolean)
      .join(' • ') || null,
  ];

  const cards = [
    buildTelegramCommerceCard(
      input.locale === 'my' ? '🧵 <b>Thread အနှစ်ချုပ်</b>' : '🧵 <b>Thread snapshot</b>',
      snapshotLines,
    ),
  ];

  if (latestReply) {
    const latestReplyPreview = latestReply.message.trim();
    const latestReplyLines = [
      `${latestReply.senderType === 'ADMIN' ? 'Admin' : input.locale === 'my' ? 'You' : 'You'} • ${escapeHtml(
        formatTelegramDateTime(latestReply.createdAt, input.locale),
      )}`,
      latestReply.mediaKind
        ? `${input.locale === 'my' ? 'Attachment' : 'Attachment'}: <b>${escapeHtml(
            latestReply.mediaKind === 'IMAGE'
              ? input.locale === 'my'
                ? 'ပုံ'
                : 'Image'
              : latestReply.mediaKind === 'FILE'
                ? latestReply.mediaFilename || (input.locale === 'my' ? 'ဖိုင်' : 'File')
                : latestReply.mediaKind,
          )}</b>${latestReply.mediaUrl ? ` • ${input.locale === 'my' ? 'button below' : 'button below'}` : ''}`
        : null,
      latestReplyPreview
        ? escapeHtml(`${latestReplyPreview.slice(0, 100)}${latestReplyPreview.length > 100 ? '…' : ''}`)
        : null,
    ];

    cards.push(
      buildTelegramCommerceCard(
        input.locale === 'my' ? '💬 <b>နောက်ဆုံး reply</b>' : '💬 <b>Last reply</b>',
        latestReplyLines,
      ),
    );
  }

  return buildTelegramCommerceMessage({
    title:
      input.locale === 'my'
        ? `🛟 <b>${escapeHtml(input.thread.threadCode)}</b>`
        : `🛟 <b>${escapeHtml(input.thread.threadCode)}</b>`,
    cards,
    footerLines: [
      input.locale === 'my'
        ? state.code === 'user'
          ? 'လိုအပ်သည့် အချက်အလက်ကို reply လုပ်ပေးပါ။'
          : state.code === 'handled'
            ? 'Reply ကို နှိပ်ပြီး thread ကို ပြန်ဖွင့်နိုင်ပါသည်။'
            : 'Admin အဖြေကို ဒီ chat မှာ စောင့်ပါ။'
        : state.code === 'user'
          ? 'Reply here with the extra detail.'
          : state.code === 'handled'
            ? 'Tap Reply to reopen this thread.'
            : 'Admin will reply in this chat.',
    ],
  });
}

export function buildTelegramSupportTriageMessage(input: { locale: SupportedLocale }) {
  const isMyanmar = input.locale === 'my';
  return buildTelegramCommerceMessage({
    title: isMyanmar ? '🛟 <b>အကူအညီ စင်တာ</b>' : '🛟 <b>Support center</b>',
    statsLine: isMyanmar ? 'ကူညီပေးရန် အဆင်သင့်ရှိပါသည်' : 'Fast help for payments, keys, and server issues',
    cards: [
      buildTelegramCommerceCard(
        isMyanmar ? '🧭 <b>စတင်ရန်</b>' : '🧭 <b>Start here</b>',
        [
          isMyanmar
            ? 'အောက်က category ကို ရွေးပြီး thread တစ်ခု စတင်ပါ။'
            : 'Pick a category below to start a support thread.',
          isMyanmar
            ? 'Screenshot သို့ file ကို နောက် message အဖြစ် ပို့နိုင်ပါသည်။'
            : 'You can send a screenshot or file in the next message.',
        ],
      ),
    ],
    footerLines: [
      isMyanmar
        ? 'Admin အဖြေကို ဒီ chat ထဲမှာပဲ လက်ခံရရှိပါမည်။'
        : 'Admin replies will arrive in this chat.',
    ],
  });
}

export function buildTelegramSupportTriageKeyboard(input: { locale: SupportedLocale }) {
  const isMyanmar = input.locale === 'my';
  const rows = [
    [
      {
        text: isMyanmar ? '🖥 Server Issue' : '🖥 Server Issue',
        callback_data: buildTelegramSupportThreadCallbackData('new', 'server'),
      },
    ],
    [
      {
        text: isMyanmar ? '💳 Payment Help' : '💳 Payment Help',
        callback_data: buildTelegramSupportThreadCallbackData('new', 'order'),
      },
    ],
    [
      {
        text: isMyanmar ? '❓ Other General Support' : '❓ Other General Support',
        callback_data: buildTelegramSupportThreadCallbackData('new', 'general'),
      },
    ],
    [
      {
        text: isMyanmar ? '🧵 My Threads' : '🧵 My Threads',
        callback_data: buildTelegramMenuCallbackData('support', 'home'),
      },
    ],
  ];

  return { inline_keyboard: rows };
}
