import { withAbsoluteBasePath } from '@/lib/base-path';
import { type SupportedLocale } from '@/lib/i18n/config';
import { type TelegramAdminActor } from '@/lib/services/telegram-admin-core';
import {
  buildTelegramMenuCallbackData,
  buildTelegramSupportQueueCallbackData,
} from '@/lib/services/telegram-callbacks';
import {
  type TelegramSupportQueueMode,
  type TelegramSupportThreadQueueSnapshot,
} from '@/lib/services/telegram-domain-types';
import { listTelegramSupportThreadsForAdminQueue } from '@/lib/services/telegram-support-admin';
import {
  getTelegramSupportThreadState,
  resolveTelegramSupportIssueLabel,
} from '@/lib/services/telegram-support';
import { sendTelegramMessage } from '@/lib/services/telegram-runtime';
import {
  buildTelegramLatestReplyPreviewLines,
  escapeHtml,
  formatTelegramDateTime,
} from '@/lib/services/telegram-ui';

type PremiumSupportSnapshot = {
  totalOpen: number;
  waitingAdmin: number;
  waitingUser: number;
};

export type { TelegramSupportQueueMode };

export function resolveTelegramSupportQueueMode(argsText: string) {
  const normalized = argsText.trim().toLowerCase();
  if (
    normalized === 'admin'
    || normalized === 'waiting-admin'
    || normalized === 'pending'
    || normalized === 'open'
  ) {
    return 'admin' as const;
  }
  if (normalized === 'user' || normalized === 'waiting-user') {
    return 'user' as const;
  }
  return 'all' as const;
}

type TelegramSupportThreadQueueRecord = Awaited<
  ReturnType<typeof listTelegramSupportThreadsForAdminQueue>
>['threads'][number];

function compactTelegramSupportThreadText(value?: string | null, maxLength = 100) {
  const normalized = (value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return null;
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
}

export function formatTelegramRelativeAge(date: Date, locale: SupportedLocale) {
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

async function buildTelegramSupportThreadPanelUrl(thread: {
  id: string;
}) {
  return withAbsoluteBasePath(`/dashboard/support/threads/${encodeURIComponent(thread.id)}`);
}

export function buildTelegramSupportThreadsSummaryKeyboard(input: {
  locale: SupportedLocale;
  mode: TelegramSupportQueueMode;
}) {
  const isMyanmar = input.locale === 'my';
  const option = (mode: TelegramSupportQueueMode, label: string) => ({
    text: input.mode === mode ? `• ${label}` : label,
    callback_data: buildTelegramMenuCallbackData(
      'admin',
      mode === 'all' ? 'supportthreads' : `supportthreads_${mode}`,
    ),
  });

  return {
    inline_keyboard: [
      [
        option('all', isMyanmar ? 'Thread အားလုံး' : 'All threads'),
        option('admin', isMyanmar ? 'Admin စောင့်နေ' : 'Need admin'),
        option('user', isMyanmar ? 'User စောင့်နေ' : 'Need user'),
      ],
      [
        {
          text: isMyanmar ? '💎 Premium queue' : '💎 Premium queue',
          callback_data: buildTelegramMenuCallbackData('admin', 'supportpremium'),
        },
        {
          text: isMyanmar ? '📋 Review queue' : '📋 Review queue',
          callback_data: buildTelegramMenuCallbackData('admin', 'reviewqueue'),
        },
      ],
      [
        {
          text: isMyanmar ? '🧭 Admin စင်တာ' : '🧭 Admin home',
          callback_data: buildTelegramMenuCallbackData('admin', 'home'),
        },
      ],
    ],
  };
}

export function buildTelegramSupportThreadsSummaryMessage(input: {
  locale: SupportedLocale;
  mode: TelegramSupportQueueMode;
  totalOpen: number;
  waitingAdmin: number;
  waitingUser: number;
  overdue: number;
  hasItems: boolean;
}) {
  const isMyanmar = input.locale === 'my';
  const modeLabel =
    input.mode === 'admin'
      ? isMyanmar
        ? 'Admin အဖြေ စောင့်နေ'
        : 'Need admin reply'
      : input.mode === 'user'
        ? isMyanmar
          ? 'User အဖြေ စောင့်နေ'
          : 'Waiting for user'
        : isMyanmar
          ? 'Customer thread အားလုံး'
          : 'All customer threads';
  const stats = isMyanmar
    ? `${input.totalOpen} ခု ဖွင့်ထား • ${input.waitingAdmin} ခု admin စောင့်နေ • ${input.waitingUser} ခု user စောင့်နေ`
    : `${input.totalOpen} open • ${input.waitingAdmin} need admin • ${input.waitingUser} waiting for user`;
  const overdueLine =
    input.overdue > 0
      ? isMyanmar
        ? `${input.overdue} ခု နောက်ကျ`
        : `${input.overdue} overdue`
      : '';
  const nextHint = input.hasItems
    ? isMyanmar
      ? 'နောက် thread ကို အောက်တွင် ဖွင့်ထားပါသည်။'
      : 'Opening the next thread below.'
    : '';

  return [
    isMyanmar ? '🧵 <b>Customer support thread များ</b>' : '🧵 <b>Customer support threads</b>',
    '',
    modeLabel,
    stats,
    overdueLine,
    '',
    nextHint,
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildTelegramSupportThreadQueueMessage(input: {
  locale: SupportedLocale;
  thread: TelegramSupportThreadQueueRecord;
}) {
  const latestReply = input.thread.replies?.[input.thread.replies.length - 1] || null;
  const state = getTelegramSupportThreadState({
    status: input.thread.status,
    waitingOn: input.thread.waitingOn,
    locale: input.locale,
  });
  const age = formatTelegramRelativeAge(
    input.thread.updatedAt || input.thread.createdAt,
    input.locale,
  );
  const overdue =
    !input.thread.firstAdminReplyAt
    && Boolean(input.thread.firstResponseDueAt)
    && (input.thread.firstResponseDueAt?.getTime() || 0) <= Date.now();
  const latestReplyPreview = buildTelegramLatestReplyPreviewLines({
    reply: latestReply,
    locale: input.locale,
    maxLength: 100,
  }).map((line) => escapeHtml(line));
  const statusSnapshot = `🕒 <b>${escapeHtml(state.label)}</b> • ${escapeHtml(age)}${overdue ? ` • <b>${input.locale === 'my' ? 'နောက်ကျ' : 'Overdue'}</b>` : ''}`;
  const ownershipLine = input.thread.assignedAdminName
    ? `🧷 <b>${input.locale === 'my' ? 'ယူထားသူ' : 'Claimed by'}:</b> ${escapeHtml(input.thread.assignedAdminName)}`
    : `🧷 <b>${input.locale === 'my' ? 'မယူရသေး' : 'Unclaimed'}</b>`;
  const userHandle = escapeHtml(input.thread.telegramUsername || input.thread.telegramUserId || '—');
  const userLine = input.thread.telegramUserId
    ? `👤 <b>${userHandle}</b> • <code>${escapeHtml(input.thread.telegramUserId)}</code>`
    : `👤 <b>${userHandle}</b>`;
  const dueLine =
    !input.thread.firstAdminReplyAt && input.thread.firstResponseDueAt
      ? `⏱ ${input.locale === 'my' ? 'Due' : 'Due'} ${escapeHtml(formatTelegramDateTime(input.thread.firstResponseDueAt, input.locale))}`
      : '';

  return [
    input.locale === 'my'
      ? '🧵 <b>Customer support thread</b>'
      : '🧵 <b>Customer support thread</b>',
    '',
    `<b>${escapeHtml(input.thread.threadCode)}</b> • ${escapeHtml(resolveTelegramSupportIssueLabel(input.thread.issueCategory, input.locale))}`,
    userLine,
    statusSnapshot,
    ownershipLine,
    dueLine,
    ...latestReplyPreview,
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildTelegramSupportThreadQueueReplyKeyboard(input: {
  threadId: string;
  locale: SupportedLocale;
  panelUrl: string;
  mode: TelegramSupportQueueMode;
  claimedByMe: boolean;
  isClaimed: boolean;
  attachmentUrl?: string | null;
  includeDetail?: boolean;
}) {
  const isMyanmar = input.locale === 'my';
  const includeDetail = input.includeDetail ?? true;
  return {
    inline_keyboard: [
      [
        {
          text:
            input.claimedByMe
              ? (isMyanmar ? '↩️ လွှတ်မည်' : '↩️ Unclaim')
              : input.isClaimed
                ? (isMyanmar ? '🔒 ယူထားပြီး' : '🔒 Claimed')
                : (isMyanmar ? '🙋 ယူမည်' : '🙋 Claim'),
          callback_data: buildTelegramSupportQueueCallbackData(
            input.claimedByMe ? 'uc' : 'cl',
            `thr_${input.threadId}`,
            input.mode,
          ),
        },
        {
          text: isMyanmar ? '✍️ အကြောင်းပြန်မည်' : '✍️ Reply',
          callback_data: buildTelegramSupportQueueCallbackData('rp', `thr_${input.threadId}`, input.mode),
        },
        {
          text: isMyanmar ? '✅ ဖြေရှင်းပြီး' : '✅ Handled',
          callback_data: buildTelegramSupportQueueCallbackData('hd', `thr_${input.threadId}`, input.mode),
        },
      ],
      [
        {
          text: isMyanmar ? '👀 စစ်နေသည်' : '👀 Working on it',
          callback_data: buildTelegramSupportQueueCallbackData('wk', `thr_${input.threadId}`, input.mode),
        },
        {
          text: isMyanmar ? '❓ အသေးစိတ်လို' : '❓ Need details',
          callback_data: buildTelegramSupportQueueCallbackData('nd', `thr_${input.threadId}`, input.mode),
        },
      ],
      [
        ...(includeDetail
          ? [
              {
                text: isMyanmar ? 'ℹ️ အသေးစိတ်' : 'ℹ️ Detail',
                callback_data: buildTelegramSupportQueueCallbackData('dt', `thr_${input.threadId}`, input.mode),
              },
            ]
          : []),
        {
          text: isMyanmar ? '📌 Panel သို့ တင်မည်' : '📌 Escalate',
          callback_data: buildTelegramSupportQueueCallbackData('es', `thr_${input.threadId}`, input.mode),
        },
      ],
      [
        {
          text: isMyanmar ? '⬅️ Thread များ' : '⬅️ Threads',
          callback_data: buildTelegramMenuCallbackData(
            'admin',
            input.mode === 'admin'
              ? 'supportthreads_admin'
              : input.mode === 'user'
                ? 'supportthreads_user'
                : 'supportthreads',
          ),
        },
        {
          text: isMyanmar ? '➡️ နောက်တစ်ခု' : '➡️ Next',
          callback_data: buildTelegramSupportQueueCallbackData('nx', `thr_${input.threadId}`, input.mode),
        },
        {
          text: isMyanmar ? '🧾 Panel' : '🧾 Panel',
          url: input.panelUrl,
        },
      ],
      ...(input.attachmentUrl?.trim()
        ? [[{ text: isMyanmar ? '🖼 Attachment ဖွင့်ရန်' : '🖼 Open attachment', url: input.attachmentUrl.trim() }]]
        : []),
    ],
  };
}

export function buildTelegramSupportThreadQueueDetailMessage(input: {
  locale: SupportedLocale;
  thread: TelegramSupportThreadQueueRecord;
}) {
  const latestReply = input.thread.replies?.[input.thread.replies.length - 1] || null;
  const state = getTelegramSupportThreadState({
    status: input.thread.status,
    waitingOn: input.thread.waitingOn,
    locale: input.locale,
  });
  const contextParts = [
    input.thread.relatedOrderCode
      ? `${input.locale === 'my' ? 'Order' : 'Order'} ${escapeHtml(input.thread.relatedOrderCode)}`
      : '',
    input.thread.relatedKeyName
      ? `${input.locale === 'my' ? 'Key' : 'Key'} ${escapeHtml(input.thread.relatedKeyName)}`
      : '',
    input.thread.relatedServerName
      ? `${input.locale === 'my' ? 'Server' : 'Server'} ${escapeHtml(input.thread.relatedServerName)}`
      : '',
  ].filter(Boolean);
  const subject = compactTelegramSupportThreadText(input.thread.subject, 84);
  const latestReplyPreview = buildTelegramLatestReplyPreviewLines({
    reply: latestReply,
    locale: input.locale,
    maxLength: 84,
  }).map((line) => escapeHtml(line));

  return [
    input.locale === 'my'
      ? 'ℹ️ <b>Support thread အသေးစိတ်</b>'
      : 'ℹ️ <b>Support thread detail</b>',
    '',
    `<b>${escapeHtml(input.thread.threadCode)}</b> • ${escapeHtml(resolveTelegramSupportIssueLabel(input.thread.issueCategory, input.locale))}`,
    `👤 <b>${escapeHtml(input.thread.telegramUsername || input.thread.telegramUserId || '—')}</b> • ${escapeHtml(state.label)}`,
    input.thread.firstResponseDueAt
      ? `⏱ ${escapeHtml(formatTelegramDateTime(input.thread.firstResponseDueAt, input.locale))}`
      : '',
    contextParts.length > 0 ? `🧩 ${contextParts.join(' • ')}` : '',
    subject ? `${input.locale === 'my' ? '📝 အကြောင်းအရာ' : '📝 Subject'}: ${escapeHtml(subject)}` : '',
    ...latestReplyPreview,
  ]
    .filter(Boolean)
    .join('\n');
}

async function sendTelegramSupportThreadQueueCardToChat(input: {
  botToken: string;
  chatId: string | number;
  locale: SupportedLocale;
  thread: TelegramSupportThreadQueueRecord;
  mode: TelegramSupportQueueMode;
  adminActor: TelegramAdminActor;
}) {
  const latestReply = input.thread.replies?.[input.thread.replies.length - 1] || null;
  const panelUrl = await buildTelegramSupportThreadPanelUrl(input.thread);

  await sendTelegramMessage(
    input.botToken,
    input.chatId,
    buildTelegramSupportThreadQueueMessage({
      locale: input.locale,
      thread: input.thread,
    }),
    {
      replyMarkup: buildTelegramSupportThreadQueueReplyKeyboard({
        threadId: input.thread.id,
        locale: input.locale,
        panelUrl,
        mode: input.mode,
        claimedByMe: Boolean(
          input.thread.assignedAdminUserId
          && input.adminActor.userId
          && input.thread.assignedAdminUserId === input.adminActor.userId,
        ),
        isClaimed: Boolean(input.thread.assignedAdminUserId),
        attachmentUrl: latestReply?.mediaUrl || null,
      }),
    },
  );
}

export async function sendTelegramSupportThreadQueueDetailToChat(input: {
  botToken: string;
  chatId: string | number;
  locale: SupportedLocale;
  thread: TelegramSupportThreadQueueRecord;
  mode: TelegramSupportQueueMode;
  adminActor: TelegramAdminActor;
}) {
  const latestReply = input.thread.replies?.[input.thread.replies.length - 1] || null;
  const panelUrl = await buildTelegramSupportThreadPanelUrl(input.thread);

  await sendTelegramMessage(
    input.botToken,
    input.chatId,
    buildTelegramSupportThreadQueueDetailMessage({
      locale: input.locale,
      thread: input.thread,
    }),
    {
      replyMarkup: buildTelegramSupportThreadQueueReplyKeyboard({
        threadId: input.thread.id,
        locale: input.locale,
        panelUrl,
        mode: input.mode,
        claimedByMe: Boolean(
          input.thread.assignedAdminUserId
          && input.adminActor.userId
          && input.thread.assignedAdminUserId === input.adminActor.userId,
        ),
        isClaimed: Boolean(input.thread.assignedAdminUserId),
        attachmentUrl: latestReply?.mediaUrl || null,
        includeDetail: false,
      }),
    },
  );
}

export async function handleTelegramSupportThreadsQueueCommand(input: {
  chatId: number;
  locale: SupportedLocale;
  botToken: string;
  argsText: string;
  adminActor: TelegramAdminActor;
}) {
  const mode = resolveTelegramSupportQueueMode(input.argsText);
  const snapshot = await listTelegramSupportThreadsForAdminQueue({
    mode,
    limit: 1,
  });

  if (snapshot.threads.length === 0) {
    await sendTelegramMessage(
      input.botToken,
      input.chatId,
      input.locale === 'my'
        ? '📭 Customer support thread မရှိသေးပါ။'
        : '📭 There are no customer support threads right now.',
      {
        replyMarkup: buildTelegramSupportThreadsSummaryKeyboard({
          locale: input.locale,
          mode,
        }),
      },
    );
    return null;
  }

  await sendTelegramMessage(
    input.botToken,
    input.chatId,
    buildTelegramSupportThreadsSummaryMessage({
      locale: input.locale,
      mode,
      totalOpen: snapshot.totalOpen,
      waitingAdmin: snapshot.waitingAdmin,
      waitingUser: snapshot.waitingUser,
      overdue: snapshot.overdue,
      hasItems: snapshot.threads.length > 0,
    }),
    {
      replyMarkup: buildTelegramSupportThreadsSummaryKeyboard({
        locale: input.locale,
        mode,
      }),
    },
  );

  for (const thread of snapshot.threads) {
    await sendTelegramSupportThreadQueueCardToChat({
      botToken: input.botToken,
      chatId: input.chatId,
      locale: input.locale,
      thread,
      mode,
      adminActor: input.adminActor,
    });
  }

  return null;
}

export async function sendTelegramNextSupportThreadQueueCard(input: {
  chatId: number;
  locale: SupportedLocale;
  botToken: string;
  mode: TelegramSupportQueueMode;
  excludeThreadId?: string | null;
  adminActor: TelegramAdminActor;
}) {
  const snapshot: TelegramSupportThreadQueueSnapshot<TelegramSupportThreadQueueRecord> =
    await listTelegramSupportThreadsForAdminQueue({
      mode: input.mode,
      limit: 8,
    });
  const nextThread = snapshot.threads.find((thread) => thread.id !== (input.excludeThreadId || null)) || null;
  if (!nextThread) {
    await sendTelegramMessage(
      input.botToken,
      input.chatId,
      input.locale === 'my'
        ? '📭 ဤ customer support filter အတွက် နောက်ထပ် thread မရှိတော့ပါ။'
        : '📭 There are no more customer support threads in this filter.',
      {
        replyMarkup: buildTelegramSupportThreadsSummaryKeyboard({
          locale: input.locale,
          mode: input.mode,
        }),
      },
    );
    return null;
  }

  await sendTelegramSupportThreadQueueCardToChat({
    botToken: input.botToken,
    chatId: input.chatId,
    locale: input.locale,
    thread: nextThread,
    mode: input.mode,
    adminActor: input.adminActor,
  });
  return nextThread;
}

export async function handleTelegramSupportConsoleCommand(input: {
  chatId: number;
  locale: SupportedLocale;
  botToken: string;
  getPremiumSupportQueueSnapshot: (input: {
    mode: TelegramSupportQueueMode;
    limit?: number;
  }) => Promise<PremiumSupportSnapshot>;
}) {
  const [customerSnapshot, premiumSnapshot] = await Promise.all([
    listTelegramSupportThreadsForAdminQueue({
      mode: 'all',
      limit: 1,
    }),
    input.getPremiumSupportQueueSnapshot({
      mode: 'all',
      limit: 1,
    }),
  ]);

  await sendTelegramMessage(
    input.botToken,
    input.chatId,
    [
      input.locale === 'my'
        ? '🛟 <b>Support console</b>'
        : '🛟 <b>Support console</b>',
      '',
      input.locale === 'my'
        ? '<b>Customer thread များ</b>'
        : '<b>Customer threads</b>',
      input.locale === 'my'
        ? `${customerSnapshot.totalOpen} ခု ဖွင့်ထား • ${customerSnapshot.waitingAdmin} ခု admin စောင့်နေ • ${customerSnapshot.waitingUser} ခု user စောင့်နေ • ${customerSnapshot.overdue} ခု နောက်ကျ`
        : `${customerSnapshot.totalOpen} open • ${customerSnapshot.waitingAdmin} need admin • ${customerSnapshot.waitingUser} waiting for user • ${customerSnapshot.overdue} overdue`,
      '',
      input.locale === 'my'
        ? '<b>Premium support</b>'
        : '<b>Premium support</b>',
      input.locale === 'my'
        ? `${premiumSnapshot.totalOpen} ခု ဖွင့်ထား • ${premiumSnapshot.waitingAdmin} ခု admin စောင့်နေ • ${premiumSnapshot.waitingUser} ခု user စောင့်နေ`
        : `${premiumSnapshot.totalOpen} open • ${premiumSnapshot.waitingAdmin} need admin • ${premiumSnapshot.waitingUser} waiting for user`,
      '',
      input.locale === 'my'
        ? 'ကြည့်လိုသော queue ကို အောက်က button များဖြင့် ဖွင့်နိုင်ပါသည်။'
        : 'Use the buttons below to open the queue you want.',
    ].join('\n'),
    {
      replyMarkup: {
        inline_keyboard: [
          [
            {
              text: input.locale === 'my' ? '🧵 Customer threads' : '🧵 Customer threads',
              callback_data: buildTelegramMenuCallbackData('admin', 'supportthreads'),
            },
            {
              text: input.locale === 'my' ? '💎 Premium queue' : '💎 Premium queue',
              callback_data: buildTelegramMenuCallbackData('admin', 'supportpremium'),
            },
          ],
          [
            {
              text: input.locale === 'my' ? '⏱ Admin စောင့်နေ' : '⏱ Need admin',
              callback_data: buildTelegramMenuCallbackData('admin', 'supportthreads_admin'),
            },
            {
              text: input.locale === 'my' ? '💬 User စောင့်နေ' : '💬 Need user',
              callback_data: buildTelegramMenuCallbackData('admin', 'supportthreads_user'),
            },
          ],
          [
            {
              text: input.locale === 'my' ? '💎 Premium admin စောင့်နေ' : '💎 Premium need admin',
              callback_data: buildTelegramMenuCallbackData('admin', 'supportqueue_admin'),
            },
            {
              text: input.locale === 'my' ? '💎 Premium user စောင့်နေ' : '💎 Premium need user',
              callback_data: buildTelegramMenuCallbackData('admin', 'supportqueue_user'),
            },
          ],
          [
            {
              text: input.locale === 'my' ? '🧭 Admin home' : '🧭 Admin home',
              callback_data: buildTelegramMenuCallbackData('admin', 'home'),
            },
          ],
        ],
      },
    },
  );

  return null;
}
