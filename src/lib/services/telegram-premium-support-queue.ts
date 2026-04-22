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
      label: isMyanmar ? 'Admin အဖြေ စောင့်နေ' : 'Waiting for admin',
    };
  }

  if (latestReply?.senderType === 'ADMIN') {
    return {
      code: 'user' as const,
      label: isMyanmar ? 'User အဖြေ စောင့်နေ' : 'Waiting for user',
    };
  }

  return {
    code: 'admin' as const,
    label: isMyanmar ? 'စစ်ဆေးရန် စောင့်နေ' : 'Pending review',
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
        option('all', isMyanmar ? 'အားလုံး' : 'All'),
        option('admin', isMyanmar ? 'Admin စောင့်နေ' : 'Need admin'),
        option('user', isMyanmar ? 'User စောင့်နေ' : 'Need user'),
      ],
      [
        {
          text: isMyanmar ? '⚡ နောက်ထပ်စစ်ရန်' : '⚡ Next needing action',
          callback_data: buildTelegramMenuCallbackData('admin', 'reviewqueue_unclaimed'),
        },
        {
          text: isMyanmar ? '📋 Review queue' : '📋 Review queue',
          callback_data: buildTelegramMenuCallbackData('admin', 'reviewqueue'),
        },
        {
          text: isMyanmar ? '💸 Refund များ' : '💸 Refunds',
          callback_data: buildTelegramMenuCallbackData('admin', 'refunds'),
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

export function buildTelegramPremiumSupportQueueCardMessage(input: {
  locale: SupportedLocale;
  request: TelegramPremiumSupportQueueRequest;
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
  const replyStateLabel =
    latestReply?.senderType === 'ADMIN'
      ? input.locale === 'my'
        ? '🟡 User စောင့်နေ'
        : '🟡 Waiting for user'
      : input.request.followUpPending
        ? input.locale === 'my'
          ? '🕒 Admin စောင့်နေ'
          : '🕒 Waiting for admin'
        : input.locale === 'my'
          ? '✅ Update ပြီး'
          : '✅ Up to date';
  const latestReplyPreview = buildTelegramLatestReplyPreviewLines({
    reply: latestReply,
    locale: input.locale,
    maxLength: 100,
  }).map((line) => escapeHtml(line));
  const statusSnapshot = [
    `${input.locale === 'my' ? 'အခြေအနေ' : 'State'}: <b>${escapeHtml(state.label)}</b>${overdue ? ` • <b>${input.locale === 'my' ? 'နောက်ကျ' : 'Overdue'}</b>` : ''}`,
    `${input.locale === 'my' ? 'တုံ့ပြန်မှု' : 'Reply'}: <b>${escapeHtml(replyStateLabel)}</b>`,
    `${input.locale === 'my' ? 'ကြာချိန်' : 'Age'}: <b>${escapeHtml(age)}</b>`,
  ].join(' • ');
  const actionHint = input.locale === 'my'
    ? 'Buttons အောက်မှ update, handled, next, သို့မဟုတ် panel ကို ဖွင့်နိုင်ပါသည်။'
    : 'Use the buttons below to update, mark handled, move next, or open the panel.';

  return [
    input.locale === 'my'
      ? '💎 <b>Premium support thread</b>'
      : '💎 <b>Premium support thread</b>',
    '',
    `${input.locale === 'my' ? 'Code' : 'Code'}: <b>${escapeHtml(input.request.requestCode)}</b>`,
    `${input.locale === 'my' ? 'Key' : 'Key'}: <b>${escapeHtml(input.request.dynamicAccessKey.name)}</b>`,
    `${input.locale === 'my' ? 'Type' : 'Type'}: <b>${escapeHtml(formatTelegramPremiumSupportTypeLabel(input.request.requestType, getTelegramUi(input.locale)))}</b>`,
    statusSnapshot,
    ...latestReplyPreview,
    '',
    actionHint,
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildTelegramSupportQueueReplyKeyboard(input: {
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
  const panelUrl = await buildTelegramPremiumSupportPanelUrl(input.request.id);

  await sendTelegramMessage(
    input.botToken,
    input.chatId,
    buildTelegramPremiumSupportQueueCardMessage({
      locale: input.locale,
      request: input.request,
    }),
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
        ? 'Admin အဖြေ စောင့်နေသော thread များ'
        : 'Need admin reply'
      : resolvedMode === 'user'
        ? input.locale === 'my'
          ? 'User အဖြေ စောင့်နေသော thread များ'
          : 'Waiting for user'
        : input.locale === 'my'
          ? 'ဖွင့်ထားသော thread အားလုံး'
          : 'All open threads';

  await sendTelegramMessage(
    input.botToken,
    input.chatId,
    [
      input.locale === 'my' ? '💎 <b>Premium support queue</b>' : '💎 <b>Premium support queue</b>',
      '',
      modeLabel,
      input.locale === 'my'
        ? `${snapshot.totalOpen} ခု ဖွင့်ထား • ${snapshot.waitingAdmin} ခု admin စောင့်နေ • ${snapshot.waitingUser} ခု user စောင့်နေ`
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
        ? 'ယခု စစ်ဆေးနေပါသည်။ မကြာမီ update ပြန်ပို့ပေးပါမည်။'
        : 'We are checking this now and will update you again shortly.';
    case 'nd':
      return isMyanmar
        ? 'ဆက်လုပ်ရန် detail နည်းနည်းပိုပို့ပါ သို့မဟုတ် ပိုရှင်းသော screenshot ကို ပြန်ပို့ပေးပါ။'
        : 'Please send a little more detail or a clearer screenshot so we can continue.';
    case 'hd':
      return isMyanmar
        ? 'ဤ issue ကို ဖြေရှင်းပြီးပါပြီ။ ထပ်မံစမ်းပြီး အကူအညီလိုသေးပါက ဤနေရာတွင် reply ပြန်ပို့ပါ။'
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
