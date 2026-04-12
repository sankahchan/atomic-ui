import { coerceSupportedLocale, type SupportedLocale } from '@/lib/i18n/config';
import { type TelegramAdminActor } from '@/lib/services/telegram-admin-core';
import { getTelegramReviewQueueSnapshot } from '@/lib/services/telegram-admin-review';
import {
  buildTelegramMenuCallbackData,
  buildTelegramOrderReviewCallbackData,
} from '@/lib/services/telegram-callbacks';
import { type TelegramReviewQueueMode } from '@/lib/services/telegram-domain-types';
import { buildTelegramOrderPanelUrl } from '@/lib/services/telegram-panel-links';
import { copyTelegramMessage, sendTelegramMessage } from '@/lib/services/telegram-runtime';
import {
  escapeHtml,
  formatTelegramDateTime,
  getTelegramUi,
} from '@/lib/services/telegram-ui';

type TelegramAdminReviewQueueOrder =
  Awaited<ReturnType<typeof getTelegramReviewQueueSnapshot>>['orders'][number];

export function resolveTelegramReviewQueueMode(argsText: string): TelegramReviewQueueMode {
  const normalized = argsText.trim().toLowerCase();
  if (normalized === 'mine' || normalized === 'my') {
    return 'mine';
  }
  if (normalized === 'unclaimed') {
    return 'unclaimed';
  }
  return 'all';
}

export function buildTelegramReviewQueueSummaryKeyboard(input: {
  locale: SupportedLocale;
  mode: TelegramReviewQueueMode;
}) {
  const isMyanmar = input.locale === 'my';
  const option = (mode: TelegramReviewQueueMode, label: string) => ({
    text: input.mode === mode ? `• ${label}` : label,
    callback_data: buildTelegramMenuCallbackData(
      'admin',
      mode === 'all' ? 'reviewqueue' : `reviewqueue_${mode}`,
    ),
  });

  return {
    inline_keyboard: [
      [
        option('all', isMyanmar ? 'All' : 'All'),
        option('mine', isMyanmar ? 'Mine' : 'Mine'),
        option('unclaimed', isMyanmar ? 'Unclaimed' : 'Unclaimed'),
      ],
      [
        {
          text: isMyanmar ? '⚡ Next needing action' : '⚡ Next needing action',
          callback_data: buildTelegramMenuCallbackData('admin', 'reviewqueue_unclaimed'),
        },
        {
          text: isMyanmar ? '🛟 Support queue' : '🛟 Support queue',
          callback_data: buildTelegramMenuCallbackData('admin', 'supportqueue'),
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

function buildTelegramOrderReviewAlertMessage(input: {
  order: TelegramAdminReviewQueueOrder;
  locale: SupportedLocale;
  mode: 'initial' | 'reminder' | 'updated';
  panelUrl: string;
}) {
  const { order, locale, mode, panelUrl } = input;
  const ui = getTelegramUi(locale);
  const isMyanmar = locale === 'my';
  const reviewFocusLines = isMyanmar
    ? [
        '<b>Review checklist</b>',
        '• screenshot ရှင်းလင်းမှု',
        '• amount / method / plan ကိုက်ညီမှု',
        '• duplicate proof warning ရှိ/မရှိ',
        '• quick reject preset သုံးရန် လို/မလို',
      ]
    : [
        '<b>Review checklist</b>',
        '• screenshot clarity',
        '• amount / method / plan match',
        '• duplicate-proof warning',
        '• whether a quick reject preset is enough',
      ];
  const ownershipLabel = order.assignedReviewerEmail
    ? `🧷 ${isMyanmar ? 'Claimed by' : 'Claimed by'}: <b>${escapeHtml(order.assignedReviewerEmail)}</b>`
    : `🧷 ${isMyanmar ? 'Queue ownership' : 'Queue ownership'}: <b>${isMyanmar ? 'Unclaimed' : 'Unclaimed'}</b>`;
  const queueHint =
    mode === 'reminder'
      ? isMyanmar
        ? 'Reminder'
        : 'Reminder'
      : mode === 'updated'
        ? isMyanmar
          ? 'Live queue card'
          : 'Live queue card'
        : isMyanmar
          ? 'New review item'
          : 'New review item';

  return [
    mode === 'reminder' ? ui.orderReviewReminderTitle : ui.orderReviewAlertTitle,
    '',
    `🧾 <b>${escapeHtml(order.orderCode)}</b> • ${escapeHtml(order.planName || order.planCode || '—')}`,
    `${isMyanmar ? 'Queue' : 'Queue'}: <b>${queueHint}</b>`,
    '',
    '<b>📎 Proof summary</b>',
    order.priceLabel ? `💰 ${ui.priceLabel}: <b>${escapeHtml(order.priceLabel)}</b>` : '',
    `${ui.requesterLabel}: <b>${escapeHtml(order.telegramUsername || order.telegramUserId)}</b>`,
    `${ui.telegramIdLabel}: <code>${escapeHtml(order.telegramUserId)}</code>`,
    order.paymentSubmittedAt
      ? `${ui.paymentSubmittedLabel}: ${escapeHtml(formatTelegramDateTime(order.paymentSubmittedAt, locale))}`
      : '',
    `${ui.paymentProofLabel}: ${escapeHtml(order.paymentProofType || 'photo')}`,
    '',
    '<b>🧭 Queue ownership</b>',
    order.paymentMethodLabel ? `${ui.paymentMethodLabel}: <b>${escapeHtml(order.paymentMethodLabel)}</b>` : '',
    order.selectedServerName ? `${ui.preferredServerLabel}: <b>${escapeHtml(order.selectedServerName)}</b>` : '',
    ownershipLabel,
    order.paymentMessageId
      ? isMyanmar
        ? '📎 မူရင်း screenshot ကို ဤ summary မတိုင်မီ copy လုပ်ပေးထားပါသည်။'
        : '📎 The original screenshot is copied just above this review summary.'
      : isMyanmar
        ? 'မူရင်း screenshot copy မရရှိသဖြင့် panel တွင် proof ကို စစ်ဆေးပေးပါ။'
        : 'The original screenshot could not be copied here, so review it in the panel.',
    order.duplicateProofOrderCode
      ? ui.duplicateProofWarning(escapeHtml(order.duplicateProofOrderCode))
      : '',
    order.requestedName ? `${ui.requestedNameLabel}: <b>${escapeHtml(order.requestedName)}</b>` : '',
    order.targetAccessKeyId ? `${ui.renewalTargetLabel}: <code>${escapeHtml(order.targetAccessKeyId)}</code>` : '',
    '',
    ...reviewFocusLines,
    '',
    `${ui.orderReviewPanelLabel}: ${panelUrl}`,
  ]
    .filter(Boolean)
    .join('\n');
}

function buildTelegramOrderReviewAlertKeyboard(input: {
  orderId: string;
  locale: SupportedLocale;
  panelUrl: string;
  queueMode?: TelegramReviewQueueMode;
  claimed?: boolean;
}) {
  const ui = getTelegramUi(input.locale);
  return {
    inline_keyboard: [
      [
        {
          text:
            input.claimed
              ? input.locale === 'my'
                ? '🧷 Claimed'
                : '🧷 Claimed'
              : input.locale === 'my'
                ? '🧷 Claim'
                : '🧷 Claim',
          callback_data: buildTelegramOrderReviewCallbackData(
            'claim',
            input.orderId,
            input.queueMode || 'all',
          ),
        },
        {
          text: input.locale === 'my' ? '⬅️ Prev' : '⬅️ Prev',
          callback_data: buildTelegramOrderReviewCallbackData(
            'prev',
            input.orderId,
            input.queueMode || 'all',
          ),
        },
        {
          text: input.locale === 'my' ? '➡️ Next' : '➡️ Next',
          callback_data: buildTelegramOrderReviewCallbackData(
            'next',
            input.orderId,
            input.queueMode || 'all',
          ),
        },
      ],
      [
        {
          text: ui.orderApproveActionLabel,
          callback_data: buildTelegramOrderReviewCallbackData('approve', input.orderId),
        },
        {
          text: ui.orderRejectActionLabel,
          callback_data: buildTelegramOrderReviewCallbackData('reject', input.orderId),
        },
      ],
      [
        {
          text: ui.orderRejectDuplicateActionLabel,
          callback_data: buildTelegramOrderReviewCallbackData('reject_duplicate', input.orderId),
        },
        {
          text: ui.orderRejectBlurryActionLabel,
          callback_data: buildTelegramOrderReviewCallbackData('reject_blurry', input.orderId),
        },
      ],
      [
        {
          text: ui.orderRejectWrongAmountActionLabel,
          callback_data: buildTelegramOrderReviewCallbackData('reject_wrong_amount', input.orderId),
        },
      ],
      [{ text: ui.orderManualReviewActionLabel, url: input.panelUrl }],
    ],
  };
}

export async function sendTelegramOrderReviewCardToChat(input: {
  botToken: string;
  adminChatId: string | number;
  order: TelegramAdminReviewQueueOrder;
  locale: SupportedLocale;
  mode: 'initial' | 'reminder' | 'updated';
  queueMode?: TelegramReviewQueueMode;
}) {
  if (input.order.paymentMessageId) {
    await copyTelegramMessage(
      input.botToken,
      input.order.telegramChatId,
      input.order.paymentMessageId,
      input.adminChatId,
    );
  }

  const panelUrl = await buildTelegramOrderPanelUrl(input.order.id);
  return sendTelegramMessage(
    input.botToken,
    input.adminChatId,
    buildTelegramOrderReviewAlertMessage({
      order: input.order,
      locale: input.locale,
      mode: input.mode,
      panelUrl,
    }),
    {
      replyMarkup: buildTelegramOrderReviewAlertKeyboard({
        orderId: input.order.id,
        locale: input.locale,
        panelUrl,
        queueMode: input.queueMode,
        claimed: Boolean(input.order.assignedReviewerUserId),
      }),
    },
  );
}

export async function handleTelegramReviewQueueCommand(input: {
  chatId: number;
  locale: SupportedLocale;
  botToken: string;
  argsText: string;
  adminActor: TelegramAdminActor;
}) {
  const mode = resolveTelegramReviewQueueMode(input.argsText);
  if (mode === 'mine' && !input.adminActor.userId) {
    return input.locale === 'my'
      ? 'Mine filter ကို သုံးရန် Telegram admin account ကို dashboard admin user နှင့် link လုပ်ထားရန် လိုအပ်သည်။'
      : 'The `mine` filter needs your Telegram admin chat linked to a dashboard admin user.';
  }

  const snapshot = await getTelegramReviewQueueSnapshot({
    reviewerUserId: input.adminActor.userId,
    mode,
    limit: 3,
  });

  if (snapshot.orders.length === 0) {
    return input.locale === 'my'
      ? '📭 Pending review order မရှိသေးပါ။'
      : '📭 There are no pending review orders right now.';
  }

  const modeLabel =
    mode === 'mine'
      ? input.locale === 'my'
        ? 'Assigned to me'
        : 'Assigned to me'
      : mode === 'unclaimed'
        ? input.locale === 'my'
          ? 'Unclaimed only'
          : 'Unclaimed only'
        : input.locale === 'my'
          ? 'All pending'
          : 'All pending';

  await sendTelegramMessage(
    input.botToken,
    input.chatId,
    [
      input.locale === 'my' ? '📋 <b>Review queue</b>' : '📋 <b>Review queue</b>',
      '',
      `${modeLabel}`,
      input.locale === 'my'
        ? `${snapshot.totalPending} pending • ${snapshot.unclaimed} unclaimed • ${snapshot.mine} mine`
        : `${snapshot.totalPending} pending • ${snapshot.unclaimed} unclaimed • ${snapshot.mine} mine`,
      input.locale === 'my'
        ? `${snapshot.duplicateWarnings} duplicate-proof warning`
        : `${snapshot.duplicateWarnings} duplicate-proof warning`,
      '',
      input.locale === 'my'
        ? `Showing ${snapshot.orders.length} item(s). Use /reviewqueue mine or /reviewqueue unclaimed when needed.`
        : `Showing ${snapshot.orders.length} item(s). Use /reviewqueue mine or /reviewqueue unclaimed when needed.`,
    ].join('\n'),
    {
      replyMarkup: buildTelegramReviewQueueSummaryKeyboard({
        locale: input.locale,
        mode,
      }),
    },
  );

  for (const order of snapshot.orders) {
    const locale = coerceSupportedLocale(order.locale) || input.locale;
    await sendTelegramOrderReviewCardToChat({
      botToken: input.botToken,
      adminChatId: input.chatId,
      order,
      locale,
      mode: 'updated',
      queueMode: mode,
    });
  }

  return null;
}

export async function sendTelegramNextReviewQueueCard(input: {
  chatId: number;
  locale: SupportedLocale;
  botToken: string;
  adminActor: TelegramAdminActor;
  mode: TelegramReviewQueueMode;
  excludeOrderId?: string | null;
  direction?: 'next' | 'prev';
}) {
  const snapshot = await getTelegramReviewQueueSnapshot({
    reviewerUserId: input.adminActor.userId,
    mode: input.mode,
    limit: 20,
  });
  const currentIndex = snapshot.orders.findIndex((order) => order.id === (input.excludeOrderId || null));
  const nextOrder =
    currentIndex >= 0
      ? input.direction === 'prev'
        ? snapshot.orders[currentIndex - 1] || null
        : snapshot.orders[currentIndex + 1] || null
      : snapshot.orders.find((order) => order.id !== (input.excludeOrderId || null)) || null;
  if (!nextOrder) {
    await sendTelegramMessage(
      input.botToken,
      input.chatId,
      input.direction === 'prev'
        ? input.locale === 'my'
          ? '📭 ဤ queue filter အတွက် ယခင် review item မရှိတော့ပါ။'
          : '📭 There is no previous pending review item in this queue filter.'
        : input.locale === 'my'
          ? '📭 ဤ queue filter အတွက် နောက်ထပ် pending review item မရှိတော့ပါ။'
          : '📭 There are no more pending review items in this queue filter.',
      {
        replyMarkup: buildTelegramReviewQueueSummaryKeyboard({
          locale: input.locale,
          mode: input.mode,
        }),
      },
    );
    return null;
  }

  await sendTelegramOrderReviewCardToChat({
    botToken: input.botToken,
    adminChatId: input.chatId,
    order: nextOrder,
    locale: coerceSupportedLocale(nextOrder.locale) || input.locale,
    mode: 'updated',
    queueMode: input.mode,
  });
  return nextOrder;
}

export function buildTelegramServerNoticeShortcutMessage(locale: SupportedLocale) {
  return locale === 'my'
    ? [
        '🚨 <b>Server notice shortcuts</b>',
        '',
        '/serverdown SERVER',
        '/maintenance SERVER',
        '/serverupdate SERVER MESSAGE',
        '/serverrecovered SERVER [MESSAGE]',
        '',
        'ဥပမာ:',
        '/maintenance US',
        '/serverupdate US Recovery work is ongoing',
      ].join('\n')
    : [
        '🚨 <b>Server notice shortcuts</b>',
        '',
        '/serverdown SERVER',
        '/maintenance SERVER',
        '/serverupdate SERVER MESSAGE',
        '/serverrecovered SERVER [MESSAGE]',
        '',
        'Examples:',
        '/maintenance US',
        '/serverupdate US Recovery work is ongoing',
      ].join('\n');
}
