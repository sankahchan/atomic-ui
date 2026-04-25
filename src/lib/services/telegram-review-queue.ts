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
        option('all', isMyanmar ? 'အားလုံး' : 'All'),
        option('mine', isMyanmar ? 'ကိုယ်ပိုင်' : 'Mine'),
        option('unclaimed', isMyanmar ? 'မယူရသေး' : 'Unclaimed'),
      ],
      [
        {
          text: isMyanmar ? '⚡ နောက်ထပ်စစ်ရန်' : '⚡ Next needing action',
          callback_data: buildTelegramMenuCallbackData('admin', 'reviewqueue_unclaimed'),
        },
        {
          text: isMyanmar ? '🛟 Support queue' : '🛟 Support queue',
          callback_data: buildTelegramMenuCallbackData('admin', 'supportqueue'),
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

export function buildTelegramReviewQueueSummaryMessage(input: {
  locale: SupportedLocale;
  mode: TelegramReviewQueueMode;
  totalPending: number;
  unclaimed: number;
  mine: number;
  duplicateWarnings: number;
  hasItems: boolean;
}) {
  const isMyanmar = input.locale === 'my';
  const modeLabel =
    input.mode === 'mine'
      ? isMyanmar
        ? 'ကိုယ်ပိုင် queue'
        : 'Assigned to me'
      : input.mode === 'unclaimed'
        ? isMyanmar
          ? 'မယူရသေးသော item များ'
          : 'Unclaimed only'
        : isMyanmar
          ? 'Pending item အားလုံး'
          : 'All pending';
  const duplicateLabel =
    input.duplicateWarnings > 0
      ? isMyanmar
        ? `${input.duplicateWarnings} ခု duplicate-proof သတိပေးချက်`
        : `${input.duplicateWarnings} duplicate-proof warning${input.duplicateWarnings === 1 ? '' : 's'}`
      : '';
  const nextHint = input.hasItems
    ? isMyanmar
      ? 'နောက် item ကို အောက်တွင် ဖွင့်ထားပါသည်။ Filter သို့မဟုတ် Prev/Next ဖြင့် ဆက်ကြည့်နိုင်ပါသည်။'
      : 'Opening the next item below. Use filters or Prev/Next to move.'
    : '';

  return [
    '📋 <b>Review queue</b>',
    '',
    modeLabel,
    isMyanmar
      ? `${input.totalPending} ခု pending • ${input.unclaimed} ခု မယူရသေး • ${input.mine} ခု ကိုယ်ပိုင်`
      : `${input.totalPending} pending • ${input.unclaimed} unclaimed • ${input.mine} mine`,
    duplicateLabel,
    '',
    nextHint,
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildTelegramOrderReviewAlertMessage(input: {
  order: TelegramAdminReviewQueueOrder;
  locale: SupportedLocale;
  mode: 'initial' | 'reminder' | 'updated';
}) {
  const { order, locale, mode } = input;
  const ui = getTelegramUi(locale);
  const isMyanmar = locale === 'my';
  const ownershipLabel = order.assignedReviewerEmail
    ? `🧷 <b>${isMyanmar ? 'ယူထားသူ' : 'Claimed by'}:</b> ${escapeHtml(order.assignedReviewerEmail)}`
    : `🧷 <b>${isMyanmar ? 'မယူရသေး' : 'Unclaimed'}</b>`;
  const proofHint = order.paymentMessageId
    ? isMyanmar
      ? '📎 Screenshot ကို ဤ card အပေါ်တွင် copy လုပ်ထားပါသည်။'
      : '📎 Screenshot copied above.'
    : isMyanmar
      ? '📎 Panel မှ screenshot ကို စစ်ပါ။'
      : '📎 Review the screenshot from the panel.';
  const requesterHandle = escapeHtml(order.telegramUsername || order.telegramUserId || '—');
  const requesterSummary = order.telegramUserId
    ? `👤 <b>${requesterHandle}</b> • <code>${escapeHtml(order.telegramUserId)}</code>`
    : `👤 <b>${requesterHandle}</b>`;
  const paymentSnapshot = [
    order.priceLabel ? `💰 <b>${escapeHtml(order.priceLabel)}</b>` : '',
    order.paymentMethodLabel ? escapeHtml(order.paymentMethodLabel) : '',
    escapeHtml(order.paymentProofType || 'photo'),
  ]
    .filter(Boolean)
    .join(' • ');
  const serverAndNameSummary = [
    order.selectedServerName ? `🖥 <b>${escapeHtml(order.selectedServerName)}</b>` : '',
    order.requestedName ? `🏷 <b>${escapeHtml(order.requestedName)}</b>` : '',
  ]
    .filter(Boolean)
    .join(' • ');
  const submittedAtSummary = order.paymentSubmittedAt
    ? `🕒 ${escapeHtml(formatTelegramDateTime(order.paymentSubmittedAt, locale))}`
    : '';
  const renewalTargetSummary = order.targetAccessKeyId
    ? isMyanmar
      ? '🔁 သက်တမ်းတိုး order'
      : '🔁 Renewal order'
    : '';

  return [
    mode === 'reminder' ? ui.orderReviewReminderTitle : ui.orderReviewAlertTitle,
    '',
    `🧾 <b>${escapeHtml(order.orderCode)}</b> • ${escapeHtml(order.planName || order.planCode || '—')}`,
    paymentSnapshot,
    requesterSummary,
    serverAndNameSummary,
    submittedAtSummary,
    renewalTargetSummary,
    ownershipLabel,
    order.duplicateProofOrderCode
      ? ui.duplicateProofWarning(escapeHtml(order.duplicateProofOrderCode))
      : '',
    proofHint,
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildTelegramOrderReviewAlertKeyboard(input: {
  orderId: string;
  locale: SupportedLocale;
  panelUrl: string;
  queueMode?: TelegramReviewQueueMode;
  claimed?: boolean;
}) {
  return {
    inline_keyboard: [
      [
        {
          text:
            input.claimed
              ? input.locale === 'my'
                ? '🧷 ယူထားပြီး'
                : '🧷 Claimed'
              : input.locale === 'my'
                ? '🧷 ယူမည်'
                : '🧷 Claim',
          callback_data: buildTelegramOrderReviewCallbackData(
            'claim',
            input.orderId,
            input.queueMode || 'all',
          ),
        },
        {
          text: input.locale === 'my' ? '✅ အတည်ပြု' : '✅ Approve',
          callback_data: buildTelegramOrderReviewCallbackData('approve', input.orderId),
        },
        {
          text: input.locale === 'my' ? '❌ ပယ်ရန်' : '❌ Reject',
          callback_data: buildTelegramOrderReviewCallbackData('reject', input.orderId),
        },
      ],
      [
        {
          text: input.locale === 'my' ? '⬅️ ယခင်' : '⬅️ Prev',
          callback_data: buildTelegramOrderReviewCallbackData(
            'prev',
            input.orderId,
            input.queueMode || 'all',
          ),
        },
        {
          text: input.locale === 'my' ? '➡️ နောက်' : '➡️ Next',
          callback_data: buildTelegramOrderReviewCallbackData(
            'next',
            input.orderId,
            input.queueMode || 'all',
          ),
        },
        {
          text: input.locale === 'my' ? '🧾 Dashboard' : '🧾 Panel',
          url: input.panelUrl,
        },
      ],
      [
        {
          text: input.locale === 'my' ? '🪞 ထပ်နေ' : '🪞 Duplicate',
          callback_data: buildTelegramOrderReviewCallbackData('reject_duplicate', input.orderId),
        },
        {
          text: input.locale === 'my' ? '🫥 မရှင်း' : '🫥 Blurry',
          callback_data: buildTelegramOrderReviewCallbackData('reject_blurry', input.orderId),
        },
        {
          text: input.locale === 'my' ? '💸 ငွေပမာဏ' : '💸 Amount',
          callback_data: buildTelegramOrderReviewCallbackData('reject_wrong_amount', input.orderId),
        },
      ],
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
    limit: 1,
  });

  if (snapshot.orders.length === 0) {
    return input.locale === 'my'
      ? '📭 Pending review order မရှိသေးပါ။'
      : '📭 There are no pending review orders right now.';
  }

  await sendTelegramMessage(
    input.botToken,
    input.chatId,
    buildTelegramReviewQueueSummaryMessage({
      locale: input.locale,
      mode,
      totalPending: snapshot.totalPending,
      unclaimed: snapshot.unclaimed,
      mine: snapshot.mine,
      duplicateWarnings: snapshot.duplicateWarnings,
      hasItems: snapshot.orders.length > 0,
    }),
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
          ? '📭 ဤ filter အတွက် ယခင် review item မရှိတော့ပါ။'
          : '📭 There is no previous pending review item in this queue filter.'
        : input.locale === 'my'
          ? '📭 ဤ filter အတွက် နောက်ထပ် pending review item မရှိတော့ပါ။'
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
