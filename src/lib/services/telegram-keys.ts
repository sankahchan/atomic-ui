import { db } from '@/lib/db';
import { type SupportedLocale } from '@/lib/i18n/config';
import { resolveLocalizedTemplate } from '@/lib/localized-templates';
import {
  buildSharePageUrl,
  buildShortShareUrl,
} from '@/lib/subscription-links';
import { formatBytes } from '@/lib/utils';
import {
  buildTelegramCommerceViewCallbackData,
  buildTelegramDynamicSupportActionCallbackData,
  buildTelegramOrderActionCallbackData,
  buildTelegramServerChangeActionCallbackData,
} from '@/lib/services/telegram-callbacks';
import {
  TELEGRAM_COMMERCE_PAGE_SIZE,
  buildTelegramCommerceCard,
  buildTelegramCommerceMessage,
  buildTelegramCommercePagerRow,
  paginateTelegramCommerce,
  truncateTelegramCommerceButtonLabel,
} from '@/lib/services/telegram-commerce-ui';
import {
  ensureAccessKeySubscriptionToken,
  getDynamicKeyMessagingUrls,
} from '@/lib/services/telegram-links';
import {
  getTelegramConfig,
  getTelegramSupportLink,
  sendTelegramMessage,
} from '@/lib/services/telegram-runtime';
import { listTelegramPremiumSupportRequestsForUser } from '@/lib/services/telegram-premium';
import {
  buildTelegramSupportHubKeyboard,
  getTelegramSupportThreadState,
  listTelegramSupportThreadsForUser,
  resolveTelegramSupportIssueLabel,
} from '@/lib/services/telegram-support';
import {
  buildTelegramLatestReplyPreviewLines,
  escapeHtml,
  formatExpirationSummary,
  formatTelegramDynamicPoolSummary,
  formatTelegramPremiumFollowUpState,
  formatTelegramQuotaSummary,
  formatTelegramReplyStateLabel,
  formatTelegramServerChoiceLabel,
  formatTelegramDateTime,
  getDynamicKeyRegionChoices,
  getFlagEmoji,
  getTelegramAccessKeyCategory,
  getTelegramUi,
} from '@/lib/services/telegram-ui';

type SendAccessKeySharePageToTelegram = (input: {
  accessKeyId: string;
  chatId?: string | number | null;
  reason?: 'CREATED' | 'KEY_ENABLED' | 'LINKED' | 'USAGE_REQUEST' | 'SUBSCRIPTION_REQUEST' | 'RESENT';
  source?: string | null;
  includeQr?: boolean;
  locale?: SupportedLocale;
}) => Promise<unknown>;

type SendDynamicKeySharePageToTelegram = (input: {
  dynamicAccessKeyId: string;
  chatId?: string | number | null;
  planName?: string | null;
  reason?: 'CREATED' | 'KEY_ENABLED' | 'LINKED' | 'USAGE_REQUEST' | 'SUBSCRIPTION_REQUEST' | 'RESENT';
  source?: string | null;
  includeQr?: boolean;
  locale?: SupportedLocale;
}) => Promise<unknown>;

export async function findLinkedAccessKeys(
  chatId: number,
  telegramUserId: number,
  includeInactive = false,
) {
  return db.accessKey.findMany({
    where: {
      OR: [{ telegramId: String(telegramUserId) }, { user: { telegramChatId: String(chatId) } }],
      ...(includeInactive
        ? {}
        : {
            status: {
              in: ['ACTIVE', 'PENDING'],
            },
          }),
    },
    include: {
      server: true,
      user: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
}

export async function findLinkedDynamicAccessKeys(
  chatId: number,
  telegramUserId: number,
  includeInactive = false,
) {
  return db.dynamicAccessKey.findMany({
    where: {
      OR: [{ telegramId: String(telegramUserId) }, { user: { telegramChatId: String(chatId) } }],
      ...(includeInactive
        ? {}
        : {
            status: {
              in: ['ACTIVE', 'PENDING'],
            },
          }),
    },
    include: {
      accessKeys: {
        include: {
          server: true,
        },
      },
      user: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
}

function formatTelegramKeyStatusChip(status: string) {
  switch (status) {
    case 'ACTIVE':
      return '🟢 ACTIVE';
    case 'PENDING':
      return '🟡 PENDING';
    case 'DISABLED':
      return '🔴 DISABLED';
    default:
      return `⚪ ${status}`;
  }
}

function formatTelegramKeySectionTitle(title: string, count: number) {
  return `${title} (${count})`;
}

type TelegramCommerceKeyItem = {
  id: string;
  kind: 'standard' | 'trial' | 'premium';
  name: string;
  status: string;
  sharePageUrl: string | null;
  quotaSummary: string;
  expirationSummary: string;
  summaryLine: string;
  detailLines: string[];
  renewSecondary?: string | null;
  latestPremiumRequestId?: string | null;
};

function getTelegramDynamicCurrentRouteLabel(
  key: Awaited<ReturnType<typeof findLinkedDynamicAccessKeys>>[number],
  ui: ReturnType<typeof getTelegramUi>,
) {
  const currentServer =
    key.accessKeys.find((accessKey) => accessKey.server?.id === key.lastResolvedServerId)?.server
    || key.accessKeys[0]?.server
    || null;

  return currentServer
    ? `${currentServer.name}${currentServer.countryCode ? ` ${getFlagEmoji(currentServer.countryCode)}` : ''}`
    : ui.premiumRegionUnknownStatus;
}

async function buildTelegramCommerceKeyItems(input: {
  chatId: number;
  telegramUserId: number;
  locale: SupportedLocale;
}) {
  const ui = getTelegramUi(input.locale);
  const [keys, dynamicKeys, premiumRequests] = await Promise.all([
    findLinkedAccessKeys(input.chatId, input.telegramUserId, true),
    findLinkedDynamicAccessKeys(input.chatId, input.telegramUserId, true),
    listTelegramPremiumSupportRequestsForUser(input.chatId, input.telegramUserId, 8),
  ]);

  const trialKeys = keys.filter((key) => getTelegramAccessKeyCategory(key.tags) === 'trial');
  const standardKeys = keys.filter((key) => getTelegramAccessKeyCategory(key.tags) === 'standard');
  const latestPremiumRequestByKey = new Map<string, (typeof premiumRequests)[number]>();
  for (const request of premiumRequests) {
    if (!latestPremiumRequestByKey.has(request.dynamicAccessKeyId)) {
      latestPremiumRequestByKey.set(request.dynamicAccessKeyId, request);
    }
  }

  const accessItems = await Promise.all(
    [...standardKeys, ...trialKeys].map(async (key) => {
      const token = await ensureAccessKeySubscriptionToken(key.id, key.subscriptionToken);
      const sharePageUrl = key.publicSlug
        ? buildShortShareUrl(key.publicSlug, { source: 'telegram_mykeys', lang: input.locale })
        : buildSharePageUrl(token, { source: 'telegram_mykeys', lang: input.locale });
      const isTrial = getTelegramAccessKeyCategory(key.tags) === 'trial';
      const serverLabel = key.server
        ? `${key.server.name}${key.server.countryCode ? ` ${getFlagEmoji(key.server.countryCode)}` : ''}`
        : ui.premiumRegionUnknownStatus;
      return {
        id: key.id,
        kind: isTrial ? 'trial' : 'standard',
        name: key.name,
        status: key.status,
        sharePageUrl,
        quotaSummary: formatTelegramQuotaSummary({
          usedBytes: key.usedBytes,
          dataLimitBytes: key.dataLimitBytes,
          ui,
        }),
        expirationSummary: formatExpirationSummary(key, input.locale),
        summaryLine: `${formatTelegramKeyStatusChip(key.status)} • ${serverLabel}`,
        detailLines: [
          `${ui.quotaLabel}: ${formatTelegramQuotaSummary({
            usedBytes: key.usedBytes,
            dataLimitBytes: key.dataLimitBytes,
            ui,
          })}`,
          `${ui.expirationLabel}: ${formatExpirationSummary(key, input.locale)}`,
          `${ui.preferredServerLabel}: ${serverLabel}`,
        ],
        renewSecondary: null,
        latestPremiumRequestId: null,
      } satisfies TelegramCommerceKeyItem;
    }),
  );

  const premiumItems = dynamicKeys.map((key) => {
    const { sharePageUrl } = getDynamicKeyMessagingUrls(key, 'telegram_mykeys', input.locale);
    const latestRequest = latestPremiumRequestByKey.get(key.id) || null;
    const preferredRegions = getDynamicKeyRegionChoices(key);
    const currentRouteLabel = getTelegramDynamicCurrentRouteLabel(key, ui);
    const poolSummary = formatTelegramDynamicPoolSummary(key, ui);
    return {
      id: key.id,
      kind: 'premium' as const,
      name: key.name,
      status: key.status,
      sharePageUrl,
      quotaSummary: formatTelegramQuotaSummary({
        usedBytes: key.usedBytes,
        dataLimitBytes: key.dataLimitBytes,
        ui,
      }),
      expirationSummary: formatExpirationSummary(key, input.locale),
      summaryLine: `${formatTelegramKeyStatusChip(key.status)} • ${currentRouteLabel}`,
      detailLines: [
        `${ui.premiumCurrentPoolLabel}: ${poolSummary}`,
        `${ui.premiumRegionCurrentRouteLabel}: ${currentRouteLabel}`,
        preferredRegions.length > 0
          ? `${ui.premiumRequestedRegionLabel}: ${preferredRegions.join(', ')}`
          : null,
        `${ui.quotaLabel}: ${formatTelegramQuotaSummary({
          usedBytes: key.usedBytes,
          dataLimitBytes: key.dataLimitBytes,
          ui,
        })}`,
        `${ui.expirationLabel}: ${formatExpirationSummary(key, input.locale)}`,
        latestRequest
          ? `${ui.premiumThreadStatusLabel}: ${latestRequest.requestCode} • ${formatTelegramPremiumFollowUpState(latestRequest, ui)}`
          : null,
      ].filter(Boolean) as string[],
      renewSecondary: 'dynamic',
      latestPremiumRequestId: latestRequest?.id || null,
    } satisfies TelegramCommerceKeyItem;
  });

  return {
    items: [...accessItems, ...premiumItems],
    counts: {
      standard: standardKeys.length,
      trial: trialKeys.length,
      premium: dynamicKeys.length,
    },
  };
}

export function buildTelegramKeysSummaryMessage(input: {
  locale: SupportedLocale;
  items: TelegramCommerceKeyItem[];
  counts: {
    standard: number;
    trial: number;
    premium: number;
  };
  page: number;
}) {
  const pagination = paginateTelegramCommerce(input.items, input.page);
  const cards = pagination.pageItems.map((item) =>
    buildTelegramCommerceCard(
      `${item.kind === 'premium' ? '💎' : item.kind === 'trial' ? '🎁' : '🔑'} <b>${escapeHtml(item.name)}</b>`,
      [
        escapeHtml(item.kind === 'premium' ? 'Premium key' : item.kind === 'trial' ? 'Trial key' : 'Standard key'),
        escapeHtml(item.summaryLine),
        `${getTelegramUi(input.locale).quotaLabel}: ${escapeHtml(item.quotaSummary)}`,
        `${getTelegramUi(input.locale).expirationLabel}: ${escapeHtml(item.expirationSummary)}`,
      ],
    ),
  );

  return buildTelegramCommerceMessage({
    title: getTelegramUi(input.locale).myKeysTitle,
    statsLine: `${input.counts.standard} standard • ${input.counts.trial} trial • ${input.counts.premium} premium`,
    intro:
      input.locale === 'my'
        ? 'Key summary ကို အတိုချုံးပြထားသည်။ More / Premium ကိုနှိပ်ပြီး detail ကိုဖွင့်နိုင်သည်။'
        : 'This is the short key summary. Use More or Premium to open the detailed card.',
    cards,
    footerLines: [
      input.locale === 'my'
        ? 'Open, Renew, More / Premium buttons ကို တိုက်ရိုက်အသုံးပြုနိုင်သည်။'
        : 'Use Open, Renew, and More / Premium directly from the buttons below.',
    ],
  });
}

export function buildTelegramKeyDetailMessage(input: {
  locale: SupportedLocale;
  item: TelegramCommerceKeyItem;
}) {
  return buildTelegramCommerceMessage({
    title: input.item.kind === 'premium' ? '💎 <b>Premium key detail</b>' : '🔑 <b>Key detail</b>',
    statsLine: `<b>${escapeHtml(input.item.name)}</b>`,
    intro: escapeHtml(input.item.summaryLine),
    cards: [
      buildTelegramCommerceCard(
        input.item.kind === 'premium'
          ? '💎 <b>Premium key</b>'
          : input.item.kind === 'trial'
            ? '🎁 <b>Trial key</b>'
            : '🔑 <b>Standard key</b>',
        input.item.detailLines.map((line) => escapeHtml(line)),
      ),
    ],
    footerLines: [
      input.locale === 'my'
        ? 'Share page, renew, and support actions stay below this detail card.'
        : 'Share page, renew, and support actions stay below this detail card.',
    ],
  });
}

function buildTelegramKeysSummaryKeyboard(input: {
  locale: SupportedLocale;
  items: TelegramCommerceKeyItem[];
  page: number;
}) {
  const pagination = paginateTelegramCommerce(input.items, input.page);
  const rows: Array<Array<{ text: string; callback_data?: string; url?: string }>> = pagination.pageItems.map((item) => {
    const buttons: Array<{ text: string; callback_data?: string; url?: string }> = [];
    if (item.sharePageUrl) {
      buttons.push({
        text: input.locale === 'my' ? 'Open' : 'Open',
        url: item.sharePageUrl,
      });
    }
    buttons.push({
      text: input.locale === 'my' ? 'Renew' : 'Renew',
      callback_data: buildTelegramOrderActionCallbackData(
        'ky',
        item.id,
        item.renewSecondary || undefined,
      ),
    });
    buttons.push({
      text: item.kind === 'premium' ? 'Premium' : 'More',
      callback_data: buildTelegramCommerceViewCallbackData(
        'keys',
        'detail',
        item.id,
        String(pagination.page),
      ),
    });
    return buttons;
  });

  const pager = buildTelegramCommercePagerRow({
    locale: input.locale,
    section: 'keys',
    page: pagination.page,
    totalItems: input.items.length,
  });
  if (pager) {
    rows.push(pager);
  }

  return { inline_keyboard: rows };
}

function buildTelegramKeyDetailKeyboard(input: {
  locale: SupportedLocale;
  item: TelegramCommerceKeyItem;
  page: number;
  supportLink?: string | null;
}) {
  const rows: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [];

  const primaryRow: Array<{ text: string; callback_data?: string; url?: string }> = [];
  if (input.item.sharePageUrl) {
    primaryRow.push({
      text: getTelegramUi(input.locale).openSharePage,
      url: input.item.sharePageUrl,
    });
  }
  primaryRow.push({
    text: getTelegramUi(input.locale).orderActionRenewKey,
    callback_data: buildTelegramOrderActionCallbackData(
      'ky',
      input.item.id,
      input.item.renewSecondary || undefined,
    ),
  });
  rows.push(primaryRow);

  if (input.item.kind === 'premium') {
    rows.push([
      {
        text: getTelegramUi(input.locale).premiumChangeRegion,
        callback_data: buildTelegramDynamicSupportActionCallbackData('rg', input.item.id),
      },
      {
        text: getTelegramUi(input.locale).myKeysPremiumStatus,
        callback_data: input.item.latestPremiumRequestId
          ? buildTelegramDynamicSupportActionCallbackData('st', input.item.latestPremiumRequestId)
          : buildTelegramDynamicSupportActionCallbackData('is', input.item.id),
      },
    ]);
    rows.push([
      {
        text: getTelegramUi(input.locale).premiumReportRouteIssue,
        callback_data: input.item.latestPremiumRequestId
          ? buildTelegramDynamicSupportActionCallbackData('rp', input.item.latestPremiumRequestId)
          : buildTelegramDynamicSupportActionCallbackData('is', input.item.id),
      },
      ...(input.supportLink ? [{ text: getTelegramUi(input.locale).myKeysOpenSupport, url: input.supportLink }] : []),
    ]);
  } else {
    rows.push([
      {
        text: getTelegramUi(input.locale).myKeysServerIssue,
        callback_data: buildTelegramServerChangeActionCallbackData('ky', input.item.id),
      },
      ...(input.supportLink ? [{ text: getTelegramUi(input.locale).myKeysOpenSupport, url: input.supportLink }] : []),
    ]);
  }

  rows.push([{
    text: input.locale === 'my' ? '← Back to keys' : '← Back to keys',
    callback_data: buildTelegramCommerceViewCallbackData('keys', 'home', String(input.page)),
  }]);

  return { inline_keyboard: rows };
}

function buildTelegramServerChangeKeySelectionKeyboard(input: {
  locale: SupportedLocale;
  keys: Array<{
    id: string;
    name: string;
    currentServerName: string;
    remainingChanges: number;
    limit: number;
  }>;
}) {
  const rows = input.keys.slice(0, 8).map((key) => [
    {
      text: truncateTelegramCommerceButtonLabel(`🛠 ${key.name} • ${key.remainingChanges}/${key.limit}`, 38),
      callback_data: buildTelegramServerChangeActionCallbackData('ky', key.id),
    },
  ]);

  rows.push([
    {
      text: getTelegramUi(input.locale).orderActionCancel,
      callback_data: buildTelegramServerChangeActionCallbackData('ca', 'list'),
    },
  ]);

  return {
    inline_keyboard: rows,
  };
}

function buildTelegramServerChangeSupportKeyboard(
  locale: SupportedLocale,
  supportLink?: string | null,
) {
  const ui = getTelegramUi(locale);
  const rows: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [[
    {
      text: ui.orderActionBuyNewKey,
      callback_data: buildTelegramOrderActionCallbackData('by', 'server-change'),
    },
  ]];

  if (supportLink) {
    rows.push([
      {
        text: ui.getSupport,
        url: supportLink,
      },
    ]);
  }

  return {
    inline_keyboard: rows,
  };
}

export async function handleUsageCommand(input: {
  chatId: number;
  telegramUserId: number;
  botToken: string;
  locale: SupportedLocale;
  sendAccessKeySharePageToTelegram: SendAccessKeySharePageToTelegram;
  sendDynamicKeySharePageToTelegram: SendDynamicKeySharePageToTelegram;
}) {
  const ui = getTelegramUi(input.locale);
  const [keys, dynamicKeys] = await Promise.all([
    findLinkedAccessKeys(input.chatId, input.telegramUserId, false),
    findLinkedDynamicAccessKeys(input.chatId, input.telegramUserId, false),
  ]);

  if (keys.length === 0 && dynamicKeys.length === 0) {
    const config = await getTelegramConfig();
    return resolveLocalizedTemplate(
      config?.localizedKeyNotFoundMessages,
      input.locale,
      config?.keyNotFoundMessage || ui.keyNotFoundDefault,
    );
  }

  let response = ui.usageTitle;

  for (const key of keys) {
    const usedBytes = Number(key.usedBytes);
    const limitBytes = key.dataLimitBytes ? Number(key.dataLimitBytes) : null;
    const usageText = limitBytes
      ? `${formatBytes(key.usedBytes)} / ${formatBytes(key.dataLimitBytes!)} (${Math.round((usedBytes / limitBytes) * 100)}%)`
      : `${formatBytes(key.usedBytes)} / Unlimited`;

    response += `${key.status === 'ACTIVE' ? '🟢' : '🔵'} <b>${escapeHtml(key.name)}</b>\n`;
    response += `   📡 ${escapeHtml(key.server.name)}${key.server.countryCode ? ` ${getFlagEmoji(key.server.countryCode)}` : ''}\n`;
    response += `   📈 ${usageText}\n`;
    response += `   ⏳ ${escapeHtml(formatExpirationSummary(key, input.locale))}\n\n`;

    if (key.accessUrl) {
      setTimeout(async () => {
        try {
          await input.sendAccessKeySharePageToTelegram({
            accessKeyId: key.id,
            chatId: String(input.chatId),
            reason: 'USAGE_REQUEST',
            source: 'telegram_usage',
            includeQr: true,
          });
        } catch (error) {
          console.error('Failed to send usage share page via Telegram:', error);
        }
      }, 500);
    }
  }

  for (const key of dynamicKeys) {
    const attachedServers = Array.from(
      new Set(
        key.accessKeys
          .map((attachedKey) => attachedKey.server?.name)
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const coverageLabel = attachedServers.length > 0 ? attachedServers.join(', ') : ui.coverageAutoSelected;
    const usageText = key.dataLimitBytes
      ? `${formatBytes(key.usedBytes)} / ${formatBytes(key.dataLimitBytes)}`
      : `${formatBytes(key.usedBytes)} / Unlimited`;

    response += `${key.status === 'ACTIVE' ? '🟢' : '🔵'} <b>${escapeHtml(key.name)}</b>\n`;
    response += `   🧭 ${escapeHtml(key.type === 'SELF_MANAGED' ? ui.modeSelfManaged : ui.modeManual)}\n`;
    response += `   🌍 ${escapeHtml(coverageLabel)}\n`;
    response += `   📈 ${usageText}\n`;
    response += `   ⏳ ${escapeHtml(formatExpirationSummary(key, input.locale))}\n\n`;

    if (key.dynamicUrl || key.publicSlug) {
      setTimeout(async () => {
        try {
          await input.sendDynamicKeySharePageToTelegram({
            dynamicAccessKeyId: key.id,
            chatId: String(input.chatId),
            reason: 'USAGE_REQUEST',
            source: 'telegram_usage',
            includeQr: true,
          });
        } catch (error) {
          console.error('Failed to send dynamic usage share page via Telegram:', error);
        }
      }, 500);
    }
  }

  return response;
}

export async function handleMyKeysCommand(input: {
  chatId: number;
  telegramUserId: number;
  locale: SupportedLocale;
  botToken: string;
}) {
  const ui = getTelegramUi(input.locale);
  const { items, counts } = await buildTelegramCommerceKeyItems({
    chatId: input.chatId,
    telegramUserId: input.telegramUserId,
    locale: input.locale,
  });

  if (items.length === 0) {
    return ui.myKeysEmpty;
  }

  const message = buildTelegramKeysSummaryMessage({
    locale: input.locale,
    items,
    counts,
    page: 1,
  });
  const sent = await sendTelegramMessage(input.botToken, input.chatId, message, {
    replyMarkup: buildTelegramKeysSummaryKeyboard({
      locale: input.locale,
      items,
      page: 1,
    }),
  });

  return sent ? null : message;
}

export async function handleTelegramKeysCommerceView(input: {
  chatId: number;
  telegramUserId: number;
  locale: SupportedLocale;
  botToken: string;
  action: 'home' | 'page' | 'detail';
  primary?: string | null;
  secondary?: string | null;
}) {
  const ui = getTelegramUi(input.locale);
  const supportLink = await getTelegramSupportLink();
  const { items, counts } = await buildTelegramCommerceKeyItems({
    chatId: input.chatId,
    telegramUserId: input.telegramUserId,
    locale: input.locale,
  });

  if (items.length === 0) {
    return ui.myKeysEmpty;
  }

  if (input.action === 'detail') {
    const item = items.find((candidate) => candidate.id === input.primary);
    if (!item) {
      return ui.myKeysEmpty;
    }
    const page = Number.parseInt(input.secondary || '1', 10) || 1;
    const message = buildTelegramKeyDetailMessage({
      locale: input.locale,
      item,
    });
    const sent = await sendTelegramMessage(input.botToken, input.chatId, message, {
      replyMarkup: buildTelegramKeyDetailKeyboard({
        locale: input.locale,
        item,
        page,
        supportLink,
      }),
    });
    return sent ? null : message;
  }

  const page = Number.parseInt(input.primary || '1', 10) || 1;
  const message = buildTelegramKeysSummaryMessage({
    locale: input.locale,
    items,
    counts,
    page,
  });
  const sent = await sendTelegramMessage(input.botToken, input.chatId, message, {
    replyMarkup: buildTelegramKeysSummaryKeyboard({
      locale: input.locale,
      items,
      page,
    }),
  });

  return sent ? null : message;
}

export async function handleSubscriptionLinksCommand(input: {
  chatId: number;
  telegramUserId: number;
  locale: SupportedLocale;
  sendAccessKeySharePageToTelegram: SendAccessKeySharePageToTelegram;
  sendDynamicKeySharePageToTelegram: SendDynamicKeySharePageToTelegram;
}) {
  const ui = getTelegramUi(input.locale);
  const [keys, dynamicKeys] = await Promise.all([
    findLinkedAccessKeys(input.chatId, input.telegramUserId, false),
    findLinkedDynamicAccessKeys(input.chatId, input.telegramUserId, false),
  ]);

  if (keys.length === 0 && dynamicKeys.length === 0) {
    return ui.subEmpty;
  }

  for (const key of keys) {
    try {
      await input.sendAccessKeySharePageToTelegram({
        accessKeyId: key.id,
        chatId: String(input.chatId),
        reason: 'SUBSCRIPTION_REQUEST',
        source: 'telegram_sub',
        includeQr: true,
      });
    } catch (error) {
      console.error('Failed to send subscription link via Telegram:', error);
    }
  }

  for (const key of dynamicKeys) {
    try {
      await input.sendDynamicKeySharePageToTelegram({
        dynamicAccessKeyId: key.id,
        chatId: String(input.chatId),
        reason: 'SUBSCRIPTION_REQUEST',
        source: 'telegram_sub',
        includeQr: true,
      });
    } catch (error) {
      console.error('Failed to send dynamic subscription link via Telegram:', error);
    }
  }

  return ui.subSent(keys.length + dynamicKeys.length);
}

export async function handleSupportCommand(input: {
  chatId: number;
  telegramUserId: number;
  locale: SupportedLocale;
  botToken?: string;
}) {
  const locale = input.locale;
  const ui = getTelegramUi(locale);
  const supportLink = await getTelegramSupportLink();
  const [threads, premiumRequests] = await Promise.all([
    listTelegramSupportThreadsForUser({
      chatId: input.chatId,
      telegramUserId: input.telegramUserId,
      limit: 3,
    }),
    listTelegramPremiumSupportRequestsForUser(input.chatId, input.telegramUserId, 2),
  ]);
  const openThreads = threads.filter((thread) => thread.status !== 'HANDLED');
  const latestThread = threads[0] || null;
  const latestPremiumRequest = premiumRequests[0] || null;

  const lines = [
    ui.supportHubTitle,
    '',
    locale === 'my'
      ? `${openThreads.length} open support thread(s) • ${premiumRequests.length} premium support item(s)`
      : `${openThreads.length} open support thread(s) • ${premiumRequests.length} premium support item(s)`,
    '',
    input.locale === 'my'
      ? 'Order, key, server, billing, or general help အတွက် category ကို ရွေးပြီး support thread တစ်ခုကို စတင်နိုင်ပါသည်။'
      : 'Choose a category to start a real support thread for orders, keys, servers, billing, or general help.',
  ];

  if (latestThread) {
    const state = getTelegramSupportThreadState({
      status: latestThread.status,
      waitingOn: latestThread.waitingOn,
      locale,
    });
    const latestReply = latestThread.replies[latestThread.replies.length - 1] || null;
    lines.push(
      '',
      locale === 'my' ? '<b>Latest support thread</b>' : '<b>Latest support thread</b>',
      `🧵 <b>${escapeHtml(latestThread.threadCode)}</b>`,
      `${locale === 'my' ? 'Category' : 'Category'}: <b>${escapeHtml(resolveTelegramSupportIssueLabel(latestThread.issueCategory, locale))}</b>`,
      `${locale === 'my' ? 'State' : 'State'}: <b>${escapeHtml(state.label)}</b>`,
      `${locale === 'my' ? 'Updated' : 'Updated'}: <b>${escapeHtml(formatTelegramDateTime(latestThread.updatedAt, locale))}</b>`,
      ...buildTelegramLatestReplyPreviewLines({
        reply: latestReply,
        locale,
        maxLength: 120,
      }).map((line) => escapeHtml(line)),
    );
  }

  if (latestPremiumRequest) {
    const latestPremiumReply = latestPremiumRequest.replies?.[latestPremiumRequest.replies.length - 1] || null;
    lines.push(
      '',
      locale === 'my' ? '<b>Latest premium thread</b>' : '<b>Latest premium thread</b>',
      `💎 <b>${escapeHtml(latestPremiumRequest.requestCode)}</b>`,
      `${ui.statusLineLabel}: <b>${escapeHtml(formatTelegramPremiumFollowUpState(latestPremiumRequest, ui))}</b>`,
      `${escapeHtml(
        formatTelegramReplyStateLabel({
          latestReplySenderType: latestPremiumReply?.senderType || null,
          followUpPending: latestPremiumRequest.followUpPending,
          locale,
        }),
      )}`,
      `${locale === 'my' ? 'Updated' : 'Updated'}: <b>${escapeHtml(formatTelegramDateTime(latestPremiumRequest.updatedAt, locale))}</b>`,
    );
  }

  lines.push(
    '',
    locale === 'my' ? '<b>Quick paths</b>' : '<b>Quick paths</b>',
    locale === 'my'
      ? '• Category တစ်ခုရွေးပြီး message ပို့ပါ။ Admin reply ကို ဒီ chat ထဲမှာ thread အဖြစ် ပြန်ရပါမည်။'
      : '• Choose a category and send your message. The admin reply comes back here in the same thread flow.',
    ui.supportHubOrdersHint,
    ui.supportHubInboxHint,
    ui.supportHubServerHint,
    ui.supportHubPremiumHint,
    '',
    locale === 'my'
      ? '<b>When to use what</b>'
      : '<b>When to use what</b>',
    locale === 'my'
      ? '• Screenshot / payment / order problem များအတွက် Order / payment category ကို ရွေးပါ။'
      : '• Use Order / payment for screenshot, payment, and order-review problems.',
    locale === 'my'
      ? '• Key connection, usage, renew, share page ပြဿနာအတွက် Key / usage ကို ရွေးပါ။'
      : '• Use Key / usage for connection, usage, renew, and share-page issues.',
    locale === 'my'
      ? '• Notice, refund, support reply များကို /inbox နှင့် /supportstatus တွင် တစ်နေရာတည်းမှာ စစ်နိုင်ပါသည်။'
      : '• Use /inbox and /supportstatus to review notices, refunds, and support replies in one place.',
    locale === 'my'
      ? '• Premium route / preferred region အတွက် /premium သို့မဟုတ် /premiumregion ကို အသုံးပြုပါ။'
      : '• Use /premium or /premiumregion for preferred-region and routing issues.',
    '',
    locale === 'my'
      ? 'အောက်ပါ button များထဲမှ တစ်ခုကို နှိပ်ပြီး အလွယ်တကူ ဆက်လုပ်နိုင်ပါသည်။'
      : 'Use one of the buttons below to jump directly to the right place.',
  );

  if (supportLink) {
    lines.push('', ui.supportHubDirectLink(supportLink));
  } else {
    lines.push('', ui.noSupportLink);
  }

  const message = lines.join('\n');
  if (input.botToken) {
    const sent = await sendTelegramMessage(input.botToken, input.chatId, message, {
      replyMarkup: buildTelegramSupportHubKeyboard({
        locale,
        supportLink,
      }),
    });
    return sent ? null : message;
  }

  return message;
}

export async function handleUserServerCommand(input: {
  chatId: number;
  telegramUserId: number;
  locale: SupportedLocale;
  botToken: string;
}) {
  const ui = getTelegramUi(input.locale);
  const supportLink = await getTelegramSupportLink();
  const keys = (await findLinkedAccessKeys(input.chatId, input.telegramUserId, true))
    .filter((key) => ['ACTIVE', 'PENDING'].includes(key.status));

  if (keys.length === 0) {
    return ui.myKeysEmpty;
  }

  const eligibleKeys = keys
    .map((key) => {
      const remainingChanges = Math.max(0, key.serverChangeLimit - key.serverChangeCount);
      return {
        key,
        remainingChanges,
      };
    })
    .filter(({ remainingChanges }) => remainingChanges > 0);

  if (eligibleKeys.length === 0) {
    const message = `${ui.serverChangeNoEligible}\n\n${ui.serverChangeLimitReached(keys[0]?.name || ui.keyLabel)}`;
    const sent = await sendTelegramMessage(input.botToken, input.chatId, message, {
      replyMarkup: buildTelegramServerChangeSupportKeyboard(input.locale, supportLink),
    });
    return sent ? null : message;
  }

  const lines = [ui.serverChangeTitle, '', ui.serverChangeDesc, ''];

  for (const { key, remainingChanges } of eligibleKeys.slice(0, 8)) {
    lines.push(
      ui.serverChangeKeyLine(
        escapeHtml(key.name),
        `${escapeHtml(key.server.name)}${key.server.countryCode ? ` ${getFlagEmoji(key.server.countryCode)}` : ''}`,
        remainingChanges,
        key.serverChangeLimit,
      ),
      '',
    );
  }

  const sent = await sendTelegramMessage(input.botToken, input.chatId, lines.join('\n'), {
    replyMarkup: buildTelegramServerChangeKeySelectionKeyboard({
      locale: input.locale,
      keys: eligibleKeys.slice(0, 8).map(({ key, remainingChanges }) => ({
        id: key.id,
        name: key.name,
        currentServerName: key.server.name,
        remainingChanges,
        limit: key.serverChangeLimit,
      })),
    }),
  });

  return sent ? null : lines.join('\n');
}
