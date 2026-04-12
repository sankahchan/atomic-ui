import { db } from '@/lib/db';
import { type SupportedLocale } from '@/lib/i18n/config';
import {
  buildTelegramMenuCallbackData,
  buildTelegramSupportQueueCallbackData,
} from '@/lib/services/telegram-callbacks';
import {
  type TelegramPremiumSupportQueueSnapshot,
  type TelegramSupportQueueMode,
} from '@/lib/services/telegram-domain-types';
import { buildTelegramPremiumSupportPanelUrl } from '@/lib/services/telegram-panel-links';
import { getTelegramConfig, sendTelegramMessage } from '@/lib/services/telegram-runtime';
import {
  formatTelegramRelativeAge,
  resolveTelegramSupportQueueMode,
} from '@/lib/services/telegram-support-console';
import {
  buildTelegramLatestReplyPreviewLines,
  escapeHtml,
  formatTelegramPremiumSupportTypeLabel,
  getTelegramUi,
} from '@/lib/services/telegram-ui';

type TelegramPremiumSupportQueueRequest = Awaited<
  ReturnType<typeof db.telegramPremiumSupportRequest.findMany>
>[number] & {
  dynamicAccessKey: {
    id: string;
    name: string;
  };
  replies: Array<{
    id: string;
    senderType: string;
    message: string;
    createdAt: Date;
  }>;
};

function getTelegramPremiumSupportQueueState(input: {
  request: {
    status: string;
    followUpPending?: boolean | null;
    replies?: Array<{ senderType: string; message: string; createdAt: Date }>;
  };
  locale: SupportedLocale;
}) {
  const isMyanmar = input.locale === 'my';
  const latestReply = input.request.replies?.[input.request.replies.length - 1] || null;

  if (input.request.followUpPending) {
    return {
      code: 'admin' as const,
      label: isMyanmar ? 'Waiting for admin' : 'Waiting for admin',
    };
  }

  if (latestReply?.senderType === 'ADMIN') {
    return {
      code: 'user' as const,
      label: isMyanmar ? 'Waiting for user' : 'Waiting for user',
    };
  }

  return {
    code: 'admin' as const,
    label: isMyanmar ? 'Pending review' : 'Pending review',
  };
}

export async function getTelegramSupportQueueSnapshot(input: {
  mode: TelegramSupportQueueMode;
  limit?: number;
}): Promise<TelegramPremiumSupportQueueSnapshot<TelegramPremiumSupportQueueRequest>> {
  const requests = await db.telegramPremiumSupportRequest.findMany({
    where: {
      status: {
        not: 'DISMISSED',
      },
    },
    include: {
      dynamicAccessKey: {
        select: {
          id: true,
          name: true,
        },
      },
      replies: {
        orderBy: [{ createdAt: 'asc' }],
        take: 8,
      },
    },
    orderBy: [{ updatedAt: 'asc' }, { createdAt: 'asc' }],
    take: Math.max((input.limit ?? 4) * 4, 12),
  });

  const filtered = requests.filter((request) => {
    const state = getTelegramPremiumSupportQueueState({
      request,
      locale: 'en',
    });
    return input.mode === 'all' ? true : state.code === input.mode;
  });

  return {
    totalOpen: requests.length,
    waitingAdmin: requests.filter(
      (request) =>
        getTelegramPremiumSupportQueueState({
          request,
          locale: 'en',
        }).code === 'admin',
    ).length,
    waitingUser: requests.filter(
      (request) =>
        getTelegramPremiumSupportQueueState({
          request,
          locale: 'en',
        }).code === 'user',
    ).length,
    requests: filtered.slice(0, input.limit ?? 4),
  };
}

export function buildTelegramSupportQueueSummaryKeyboard(input: {
  locale: SupportedLocale;
  mode: TelegramSupportQueueMode;
}) {
  const isMyanmar = input.locale === 'my';
  const option = (mode: TelegramSupportQueueMode, label: string) => ({
    text: input.mode === mode ? `• ${label}` : label,
    callback_data: buildTelegramMenuCallbackData(
      'admin',
      mode === 'all' ? 'supportqueue' : `supportqueue_${mode}`,
    ),
  });

  return {
    inline_keyboard: [
      [
        option('all', isMyanmar ? 'All' : 'All'),
        option('admin', isMyanmar ? 'Need admin' : 'Need admin'),
        option('user', isMyanmar ? 'Need user' : 'Need user'),
      ],
      [
        {
          text: isMyanmar ? '⚡ Next needing action' : '⚡ Next needing action',
          callback_data: buildTelegramMenuCallbackData('admin', 'reviewqueue_unclaimed'),
        },
        {
          text: isMyanmar ? '📋 Review queue' : '📋 Review queue',
          callback_data: buildTelegramMenuCallbackData('admin', 'reviewqueue'),
        },
        {
          text: isMyanmar ? '💸 Refunds' : '💸 Refunds',
          callback_data: buildTelegramMenuCallbackData('admin', 'refunds'),
        },
      ],
      [
        {
          text: isMyanmar ? '🧭 Admin home' : '🧭 Admin home',
          callback_data: buildTelegramMenuCallbackData('admin', 'home'),
        },
      ],
    ],
  };
}

function buildTelegramSupportQueueReplyKeyboard(input: {
  requestId: string;
  locale: SupportedLocale;
  panelUrl: string;
  mode: TelegramSupportQueueMode;
}) {
  const isMyanmar = input.locale === 'my';
  return {
    inline_keyboard: [
      [
        {
          text: isMyanmar ? '👀 Working on it' : '👀 Working on it',
          callback_data: buildTelegramSupportQueueCallbackData('wk', input.requestId, input.mode),
        },
        {
          text: isMyanmar ? '❓ Need details' : '❓ Need details',
          callback_data: buildTelegramSupportQueueCallbackData('nd', input.requestId, input.mode),
        },
      ],
      [
        {
          text: isMyanmar ? '⬅️ Queue' : '⬅️ Queue',
          callback_data: buildTelegramMenuCallbackData(
            'admin',
            input.mode === 'admin'
              ? 'supportqueue_admin'
              : input.mode === 'user'
                ? 'supportqueue_user'
                : 'supportqueue',
          ),
        },
        {
          text: isMyanmar ? '✅ Handled' : '✅ Handled',
          callback_data: buildTelegramSupportQueueCallbackData('hd', input.requestId, input.mode),
        },
        {
          text: isMyanmar ? '➡️ Next' : '➡️ Next',
          callback_data: buildTelegramSupportQueueCallbackData('nx', input.requestId, input.mode),
        },
      ],
      [{ text: isMyanmar ? 'Open panel' : 'Open panel', url: input.panelUrl }],
    ],
  };
}

export async function sendTelegramSupportQueueCardToChat(input: {
  botToken: string;
  chatId: string | number;
  locale: SupportedLocale;
  request: TelegramPremiumSupportQueueRequest;
  mode: TelegramSupportQueueMode;
}) {
  const latestReply = input.request.replies?.[input.request.replies.length - 1] || null;
  const state = getTelegramPremiumSupportQueueState({
    request: input.request,
    locale: input.locale,
  });
  const age = formatTelegramRelativeAge(
    input.request.updatedAt || input.request.createdAt,
    input.locale,
  );
  const overdue =
    state.code === 'admin'
    && Date.now() - (input.request.updatedAt || input.request.createdAt).getTime() > 6 * 60 * 60 * 1000;
  const panelUrl = await buildTelegramPremiumSupportPanelUrl(input.request.id);
  const replyStateLabel =
    latestReply?.senderType === 'ADMIN'
      ? input.locale === 'my'
        ? '🟡 Waiting for user'
        : '🟡 Waiting for user'
      : input.request.followUpPending
        ? input.locale === 'my'
          ? '🕒 Waiting for admin'
          : '🕒 Waiting for admin'
        : input.locale === 'my'
          ? '✅ Up to date'
          : '✅ Up to date';

  await sendTelegramMessage(
    input.botToken,
    input.chatId,
    [
      input.locale === 'my'
        ? '💎 <b>Premium support thread</b>'
        : '💎 <b>Premium support thread</b>',
      '',
      `${input.locale === 'my' ? 'Code' : 'Code'}: <b>${escapeHtml(input.request.requestCode)}</b>`,
      `${input.locale === 'my' ? 'Key' : 'Key'}: <b>${escapeHtml(input.request.dynamicAccessKey.name)}</b>`,
      `${input.locale === 'my' ? 'Type' : 'Type'}: <b>${escapeHtml(formatTelegramPremiumSupportTypeLabel(input.request.requestType, getTelegramUi(input.locale)))}</b>`,
      `${input.locale === 'my' ? 'State' : 'State'}: <b>${escapeHtml(state.label)}</b>${overdue ? ` • <b>${input.locale === 'my' ? 'Overdue' : 'Overdue'}</b>` : ''}`,
      `${input.locale === 'my' ? 'Reply state' : 'Reply state'}: <b>${escapeHtml(replyStateLabel)}</b>`,
      `${input.locale === 'my' ? 'Age' : 'Age'}: <b>${escapeHtml(age)}</b>`,
      ...buildTelegramLatestReplyPreviewLines({
        reply: latestReply,
        locale: input.locale,
        maxLength: 120,
      }).map((line) => escapeHtml(line)),
      `${input.locale === 'my' ? 'Panel' : 'Panel'}: ${panelUrl}`,
    ]
      .filter(Boolean)
      .join('\n'),
    {
      replyMarkup: buildTelegramSupportQueueReplyKeyboard({
        requestId: input.request.id,
        locale: input.locale,
        panelUrl,
        mode: input.mode,
      }),
    },
  );
}

export async function handleTelegramSupportQueueCommand(input: {
  chatId: number;
  locale: SupportedLocale;
  botToken: string;
  argsText: string;
}) {
  const resolvedMode = resolveTelegramSupportQueueMode(input.argsText);

  const snapshot = await getTelegramSupportQueueSnapshot({
    mode: resolvedMode,
    limit: 3,
  });

  if (snapshot.requests.length === 0) {
    await sendTelegramMessage(
      input.botToken,
      input.chatId,
      input.locale === 'my'
        ? '📭 Open support thread မရှိသေးပါ။'
        : '📭 There are no open support threads right now.',
      {
        replyMarkup: buildTelegramSupportQueueSummaryKeyboard({
          locale: input.locale,
          mode: resolvedMode,
        }),
      },
    );
    return null;
  }

  const modeLabel =
    resolvedMode === 'admin'
      ? input.locale === 'my'
        ? 'Need admin reply'
        : 'Need admin reply'
      : resolvedMode === 'user'
        ? input.locale === 'my'
          ? 'Waiting for user'
          : 'Waiting for user'
        : input.locale === 'my'
          ? 'All open threads'
          : 'All open threads';

  await sendTelegramMessage(
    input.botToken,
    input.chatId,
    [
      input.locale === 'my' ? '💎 <b>Premium support queue</b>' : '💎 <b>Premium support queue</b>',
      '',
      modeLabel,
      input.locale === 'my'
        ? `${snapshot.totalOpen} open • ${snapshot.waitingAdmin} need admin • ${snapshot.waitingUser} waiting for user`
        : `${snapshot.totalOpen} open • ${snapshot.waitingAdmin} need admin • ${snapshot.waitingUser} waiting for user`,
    ].join('\n'),
    {
      replyMarkup: buildTelegramSupportQueueSummaryKeyboard({
        locale: input.locale,
        mode: resolvedMode,
      }),
    },
  );

  for (const request of snapshot.requests) {
    await sendTelegramSupportQueueCardToChat({
      botToken: input.botToken,
      chatId: input.chatId,
      locale: input.locale,
      request,
      mode: resolvedMode,
    });
  }

  return null;
}

export async function sendTelegramNextSupportQueueCard(input: {
  chatId: number;
  locale: SupportedLocale;
  botToken: string;
  mode: TelegramSupportQueueMode;
  excludeRequestId?: string | null;
}) {
  const snapshot = await getTelegramSupportQueueSnapshot({
    mode: input.mode,
    limit: 8,
  });
  const nextRequest = snapshot.requests.find((request) => request.id !== (input.excludeRequestId || null)) || null;
  if (!nextRequest) {
    await sendTelegramMessage(
      input.botToken,
      input.chatId,
      input.locale === 'my'
        ? '📭 ဤ support queue filter အတွက် နောက်ထပ် thread မရှိတော့ပါ။'
        : '📭 There are no more support threads in this queue filter.',
      {
        replyMarkup: buildTelegramSupportQueueSummaryKeyboard({
          locale: input.locale,
          mode: input.mode,
        }),
      },
    );
    return null;
  }

  await sendTelegramSupportQueueCardToChat({
    botToken: input.botToken,
    chatId: input.chatId,
    locale: input.locale,
    request: nextRequest,
    mode: input.mode,
  });
  return nextRequest;
}

export function buildTelegramSupportQueueShortcutMessage(
  action: 'wk' | 'nd' | 'hd',
  locale: SupportedLocale,
) {
  const isMyanmar = locale === 'my';
  switch (action) {
    case 'wk':
      return isMyanmar
        ? 'We are checking this now and will update you again shortly.'
        : 'We are checking this now and will update you again shortly.';
    case 'nd':
      return isMyanmar
        ? 'Please send a little more detail or a clearer screenshot so we can continue.'
        : 'Please send a little more detail or a clearer screenshot so we can continue.';
    case 'hd':
      return isMyanmar
        ? 'This issue has been handled. Please try again and reply here if you still need help.'
        : 'This issue has been handled. Please try again and reply here if you still need help.';
    default:
      return '';
  }
}

export async function sendTelegramSupportQueueAlertsToAdmins(input: {
  requestId: string;
  locale: SupportedLocale;
}) {
  const config = await getTelegramConfig();
  if (!config?.botToken || config.adminChatIds.length === 0) {
    return;
  }

  const snapshot = await getTelegramSupportQueueSnapshot({
    mode: 'all',
    limit: 20,
  });
  const request = snapshot.requests.find((item) => item.id === input.requestId);
  if (!request) {
    return;
  }

  for (const adminChatId of config.adminChatIds) {
    await sendTelegramSupportQueueCardToChat({
      botToken: config.botToken,
      chatId: adminChatId,
      locale: input.locale,
      request,
      mode: 'all',
    });
  }
}
