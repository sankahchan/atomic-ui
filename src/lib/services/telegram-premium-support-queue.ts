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

function compactTelegramSupportQueueText(value?: string | null, maxLength = 100) {
  const normalized = (value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return null;
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
}

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
          callback_data: buildTelegramMenuCallbackData('admin', 'supportqueue_admin'),
        },
        {
          text: isMyanmar ? '📋 Review များ' : '📋 Review queue',
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

export function buildTelegramPremiumSupportQueueSummaryMessage(input: {
  locale: SupportedLocale;
  mode: TelegramSupportQueueMode;
  totalOpen: number;
  waitingAdmin: number;
  waitingUser: number;
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
          ? 'ဖွင့်ထားသော thread အားလုံး'
          : 'All open threads';
  const stats = isMyanmar
    ? `${input.totalOpen} ခု ဖွင့်ထား • ${input.waitingAdmin} ခု admin စောင့်နေ • ${input.waitingUser} ခု user စောင့်နေ`
    : `${input.totalOpen} open • ${input.waitingAdmin} need admin • ${input.waitingUser} waiting for user`;
  const nextHint = input.hasItems
    ? isMyanmar
      ? 'နောက် request ကို အောက်တွင် ဖွင့်ထားပါသည်။'
      : 'Opening the next request below.'
    : '';

  return [
    isMyanmar ? '💎 <b>Premium support စစ်ရန်</b>' : '💎 <b>Premium support queue</b>',
    '',
    modeLabel,
    stats,
    '',
    nextHint,
  ]
    .filter(Boolean)
    .join('\n');
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
  const statusSnapshot = `🕒 <b>${escapeHtml(state.label)}</b> • ${escapeHtml(age)}${overdue ? ` • <b>${input.locale === 'my' ? 'နောက်ကျ' : 'Overdue'}</b>` : ''}`;
  const replyLine = `💬 <b>${escapeHtml(replyStateLabel)}</b>`;

  return [
    input.locale === 'my'
      ? '💎 <b>Premium support</b>'
      : '💎 <b>Premium support thread</b>',
    '',
    `<b>${escapeHtml(input.request.requestCode)}</b> • ${escapeHtml(formatTelegramPremiumSupportTypeLabel(input.request.requestType, getTelegramUi(input.locale)))}`,
    `🔑 <b>${escapeHtml(input.request.dynamicAccessKey.name)}</b>`,
    statusSnapshot,
    replyLine,
    ...latestReplyPreview,
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildTelegramSupportQueueReplyKeyboard(input: {
  requestId: string;
  locale: SupportedLocale;
  panelUrl: string;
  mode: TelegramSupportQueueMode;
  includeDetail?: boolean;
}) {
  const isMyanmar = input.locale === 'my';
  const includeDetail = input.includeDetail ?? true;
  return {
    inline_keyboard: [
      [
        {
          text: isMyanmar ? '👀 စစ်နေ' : '👀 Working on it',
          callback_data: buildTelegramSupportQueueCallbackData('wk', input.requestId, input.mode),
        },
        {
          text: isMyanmar ? '❓ Detail လို' : '❓ Need details',
          callback_data: buildTelegramSupportQueueCallbackData('nd', input.requestId, input.mode),
        },
        {
          text: isMyanmar ? '✅ ပြီးပြီ' : '✅ Handled',
          callback_data: buildTelegramSupportQueueCallbackData('hd', input.requestId, input.mode),
        },
      ],
      includeDetail
        ? [
            {
              text: isMyanmar ? '⬅️ စာရင်း' : '⬅️ Queue',
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
              text: isMyanmar ? 'ℹ️ အသေးစိတ်' : 'ℹ️ Detail',
              callback_data: buildTelegramSupportQueueCallbackData('dt', input.requestId, input.mode),
            },
            {
              text: isMyanmar ? '➡️ နောက်' : '➡️ Next',
              callback_data: buildTelegramSupportQueueCallbackData('nx', input.requestId, input.mode),
            },
          ]
        : [
            {
              text: isMyanmar ? '⬅️ စာရင်း' : '⬅️ Queue',
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
              text: isMyanmar ? '➡️ နောက်' : '➡️ Next',
              callback_data: buildTelegramSupportQueueCallbackData('nx', input.requestId, input.mode),
            },
            {
              text: isMyanmar ? '🧾 Dashboard' : '🧾 Panel',
              url: input.panelUrl,
            },
          ],
      ...(includeDetail
        ? [[{ text: isMyanmar ? '🧾 Dashboard' : '🧾 Panel', url: input.panelUrl }]]
        : []),
    ],
  };
}

export function buildTelegramPremiumSupportQueueDetailMessage(input: {
  locale: SupportedLocale;
  request: TelegramPremiumSupportQueueRequest;
}) {
  const latestReply = input.request.replies?.[input.request.replies.length - 1] || null;
  const state = getTelegramPremiumSupportQueueState({
    request: input.request,
    locale: input.locale,
  });
  const latestReplyPreview = buildTelegramLatestReplyPreviewLines({
    reply: latestReply,
    locale: input.locale,
    maxLength: 84,
  }).map((line) => escapeHtml(line));
  const routingParts = [
    input.request.requestedRegionCode
      ? `${input.locale === 'my' ? 'Region' : 'Region'} ${escapeHtml(input.request.requestedRegionCode)}`
      : '',
    input.request.currentResolvedServerName
      ? `${input.locale === 'my' ? 'Route' : 'Route'} ${escapeHtml(input.request.currentResolvedServerName)}`
      : '',
    input.request.appliedPinServerName
      ? `${input.locale === 'my' ? 'Pin' : 'Pin'} ${escapeHtml(input.request.appliedPinServerName)}`
      : '',
  ].filter(Boolean);
  const poolLabel = compactTelegramSupportQueueText(input.request.currentPoolSummary, 72);
  const contextParts = [
    poolLabel ? `${input.locale === 'my' ? 'Pool' : 'Pool'} ${escapeHtml(poolLabel)}` : '',
    input.request.linkedOutageServerName
      ? `${input.locale === 'my' ? 'Incident' : 'Incident'} ${escapeHtml(input.request.linkedOutageServerName)}`
      : '',
  ].filter(Boolean);
  const note = compactTelegramSupportQueueText(
    input.request.adminNote || input.request.customerMessage,
    84,
  );

  return [
    input.locale === 'my'
      ? 'ℹ️ <b>Premium support အသေးစိတ်</b>'
      : 'ℹ️ <b>Premium support detail</b>',
    '',
    `<b>${escapeHtml(input.request.requestCode)}</b> • ${escapeHtml(formatTelegramPremiumSupportTypeLabel(input.request.requestType, getTelegramUi(input.locale)))}`,
    `🔑 <b>${escapeHtml(input.request.dynamicAccessKey.name)}</b> • ${escapeHtml(state.label)}`,
    routingParts.length > 0 ? `🛰 ${routingParts.join(' • ')}` : '',
    contextParts.length > 0 ? `🌐 ${contextParts.join(' • ')}` : '',
    note ? `${input.locale === 'my' ? '📝 မှတ်ချက်' : '📝 Note'}: ${escapeHtml(note)}` : '',
    ...latestReplyPreview,
  ]
    .filter(Boolean)
    .join('\n');
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

async function findTelegramSupportQueueRequestById(requestId: string) {
  return db.telegramPremiumSupportRequest.findUnique({
    where: { id: requestId },
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
  });
}

export async function sendTelegramSupportQueueDetailToChat(input: {
  botToken: string;
  chatId: string | number;
  locale: SupportedLocale;
  request: TelegramPremiumSupportQueueRequest;
  mode: TelegramSupportQueueMode;
}) {
  const panelUrl = await buildTelegramPremiumSupportPanelUrl(input.request.id);

  await sendTelegramMessage(
    input.botToken,
    input.chatId,
    buildTelegramPremiumSupportQueueDetailMessage({
      locale: input.locale,
      request: input.request,
    }),
    {
      replyMarkup: buildTelegramSupportQueueReplyKeyboard({
        requestId: input.request.id,
        locale: input.locale,
        panelUrl,
        mode: input.mode,
        includeDetail: false,
      }),
    },
  );
}

export async function sendTelegramSupportQueueDetailById(input: {
  botToken: string;
  chatId: string | number;
  locale: SupportedLocale;
  requestId: string;
  mode: TelegramSupportQueueMode;
}) {
  const request = await findTelegramSupportQueueRequestById(input.requestId);
  if (!request) {
    throw new Error('Support request not found.');
  }

  await sendTelegramSupportQueueDetailToChat({
    botToken: input.botToken,
    chatId: input.chatId,
    locale: input.locale,
    request,
    mode: input.mode,
  });
  return request;
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
    limit: 1,
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

  await sendTelegramMessage(
    input.botToken,
    input.chatId,
    buildTelegramPremiumSupportQueueSummaryMessage({
      locale: input.locale,
      mode: resolvedMode,
      totalOpen: snapshot.totalOpen,
      waitingAdmin: snapshot.waitingAdmin,
      waitingUser: snapshot.waitingUser,
      hasItems: snapshot.requests.length > 0,
    }),
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
