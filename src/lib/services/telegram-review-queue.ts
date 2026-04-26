import { coerceSupportedLocale, type SupportedLocale } from '@/lib/i18n/config';
import { db } from '@/lib/db';
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

function compactTelegramQueueText(value?: string | null, maxLength = 96) {
  const normalized = (value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return null;
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
}

function buildTelegramReviewCustomerSummary(order: TelegramAdminReviewQueueOrder) {
  return order.requestedEmail || order.telegramUsername || order.telegramUserId || '—';
}

function formatTelegramReviewOrderKind(order: TelegramAdminReviewQueueOrder, locale: SupportedLocale) {
  const isMyanmar = locale === 'my';
  if (order.orderMode === 'GIFT') {
    return isMyanmar ? 'Gift order' : 'Gift order';
  }
  if (order.kind === 'RENEW') {
    return isMyanmar ? 'Renewal' : 'Renewal';
  }
  return isMyanmar ? 'New order' : 'New order';
}

function formatTelegramReviewDeliveryLabel(order: TelegramAdminReviewQueueOrder, locale: SupportedLocale) {
  const typeLabel =
    order.deliveryType === 'DYNAMIC_KEY'
      ? locale === 'my'
        ? 'Premium link'
        : 'Premium link'
      : locale === 'my'
        ? 'Standard key'
        : 'Standard key';
  const planLabel = order.planName || order.planCode || null;
  return planLabel ? `${typeLabel} • ${planLabel}` : typeLabel;
}

async function resolveTelegramReviewRenewalTargetLabel(order: TelegramAdminReviewQueueOrder) {
  if (order.targetAccessKeyId) {
    const accessKey = await db.accessKey.findUnique({
      where: { id: order.targetAccessKeyId },
      select: { name: true },
    });
    if (accessKey?.name) {
      return accessKey.name;
    }
  }

  if (order.targetDynamicKeyId) {
    const dynamicKey = await db.dynamicAccessKey.findUnique({
      where: { id: order.targetDynamicKeyId },
      select: { name: true },
    });
    if (dynamicKey?.name) {
      return dynamicKey.name;
    }
  }

  return null;
}

function buildTelegramOrderReviewKeyboardRows(input: {
  orderId: string;
  locale: SupportedLocale;
  panelUrl: string;
  queueMode?: TelegramReviewQueueMode;
  claimed?: boolean;
  includeDetail?: boolean;
}) {
  const queueMode = input.queueMode || 'all';
  const includeDetail = input.includeDetail ?? true;

  return [
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
          queueMode,
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
    includeDetail
      ? [
          {
            text: input.locale === 'my' ? '⬅️ ယခင်' : '⬅️ Prev',
            callback_data: buildTelegramOrderReviewCallbackData('prev', input.orderId, queueMode),
          },
          {
            text: input.locale === 'my' ? 'ℹ️ အသေးစိတ်' : 'ℹ️ Detail',
            callback_data: buildTelegramOrderReviewCallbackData('detail', input.orderId, queueMode),
          },
          {
            text: input.locale === 'my' ? '➡️ နောက်' : '➡️ Next',
            callback_data: buildTelegramOrderReviewCallbackData('next', input.orderId, queueMode),
          },
        ]
      : [
          {
            text: input.locale === 'my' ? '⬅️ ယခင်' : '⬅️ Prev',
            callback_data: buildTelegramOrderReviewCallbackData('prev', input.orderId, queueMode),
          },
          {
            text: input.locale === 'my' ? '➡️ နောက်' : '➡️ Next',
            callback_data: buildTelegramOrderReviewCallbackData('next', input.orderId, queueMode),
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
    ...(includeDetail
      ? [[{ text: input.locale === 'my' ? '🧾 Dashboard' : '🧾 Panel', url: input.panelUrl }]]
      : []),
  ];
}

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
  includeDetail?: boolean;
}) {
  return {
    inline_keyboard: buildTelegramOrderReviewKeyboardRows(input),
  };
}

export function buildTelegramOrderReviewDetailMessage(input: {
  order: TelegramAdminReviewQueueOrder;
  locale: SupportedLocale;
  renewalTargetLabel?: string | null;
}) {
  const { order, locale } = input;
  const isMyanmar = locale === 'my';
  const customerSummary = buildTelegramReviewCustomerSummary(order);
  const customerLine = order.telegramUserId
    ? `👤 <b>${escapeHtml(customerSummary)}</b> • <code>${escapeHtml(order.telegramUserId)}</code>`
    : `👤 <b>${escapeHtml(customerSummary)}</b>`;
  const paymentParts = [
    order.priceLabel ? escapeHtml(order.priceLabel) : '',
    order.paymentMethodLabel ? escapeHtml(order.paymentMethodLabel) : '',
  ].filter(Boolean);
  const serverParts = [
    order.selectedServerName ? escapeHtml(order.selectedServerName) : '',
    order.requestedName ? `${isMyanmar ? 'အမည်' : 'Name'} ${escapeHtml(order.requestedName)}` : '',
  ].filter(Boolean);
  const note = compactTelegramQueueText(order.paymentCaption || order.customerMessage, 88);

  return [
    isMyanmar ? 'ℹ️ <b>Review အသေးစိတ်</b>' : 'ℹ️ <b>Review detail</b>',
    '',
    `🧾 <b>${escapeHtml(order.orderCode)}</b> • ${escapeHtml(formatTelegramReviewOrderKind(order, locale))}`,
    customerLine,
    `📦 ${escapeHtml(formatTelegramReviewDeliveryLabel(order, locale))}`,
    paymentParts.length > 0 ? `💳 ${paymentParts.join(' • ')}` : '',
    serverParts.length > 0 ? `🖥 ${serverParts.join(' • ')}` : '',
    input.renewalTargetLabel
      ? `${isMyanmar ? '🔁 Renew target' : '🔁 Renew target'}: <b>${escapeHtml(input.renewalTargetLabel)}</b>`
      : '',
    order.giftRecipientLabel
      ? `${isMyanmar ? '🎁 လက်ခံသူ' : '🎁 Recipient'}: <b>${escapeHtml(order.giftRecipientLabel)}</b>`
      : '',
    note ? `${isMyanmar ? '📝 မှတ်ချက်' : '📝 Note'}: ${escapeHtml(note)}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function findTelegramReviewQueueOrderById(orderId: string) {
  return db.telegramOrder.findUnique({
    where: { id: orderId },
    include: {
      reviewedBy: {
        select: {
          id: true,
          email: true,
        },
      },
    },
  });
}

export async function sendTelegramOrderReviewDetailToChat(input: {
  botToken: string;
  adminChatId: string | number;
  order: TelegramAdminReviewQueueOrder;
  locale: SupportedLocale;
  queueMode?: TelegramReviewQueueMode;
}) {
  const panelUrl = await buildTelegramOrderPanelUrl(input.order.id);
  const renewalTargetLabel = await resolveTelegramReviewRenewalTargetLabel(input.order);
  return sendTelegramMessage(
    input.botToken,
    input.adminChatId,
    buildTelegramOrderReviewDetailMessage({
      order: input.order,
      locale: input.locale,
      renewalTargetLabel,
    }),
    {
      replyMarkup: buildTelegramOrderReviewAlertKeyboard({
        orderId: input.order.id,
        locale: input.locale,
        panelUrl,
        queueMode: input.queueMode,
        claimed: Boolean(input.order.assignedReviewerUserId),
        includeDetail: false,
      }),
    },
  );
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
