import { db } from '@/lib/db';
import { type SupportedLocale } from '@/lib/i18n/config';
import { resolveLocalizedTemplate } from '@/lib/localized-templates';
import {
  buildSharePageUrl,
  buildShortShareUrl,
} from '@/lib/subscription-links';
import { formatBytes } from '@/lib/utils';
import {
  buildTelegramDynamicSupportActionCallbackData,
  buildTelegramOrderActionCallbackData,
  buildTelegramServerChangeActionCallbackData,
} from '@/lib/services/telegram-callbacks';
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
  escapeHtml,
  formatExpirationSummary,
  formatTelegramDynamicPoolSummary,
  formatTelegramPremiumFollowUpState,
  formatTelegramQuotaSummary,
  formatTelegramServerChoiceLabel,
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

function truncateTelegramButtonLabel(value: string, maxLength = 28) {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength - 1)}…`;
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
      text: truncateTelegramButtonLabel(`🛠 ${key.name} • ${key.remainingChanges}/${key.limit}`, 38),
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
  const supportLink = await getTelegramSupportLink();
  const [keys, dynamicKeys, premiumRequests] = await Promise.all([
    findLinkedAccessKeys(input.chatId, input.telegramUserId, true),
    findLinkedDynamicAccessKeys(input.chatId, input.telegramUserId, true),
    listTelegramPremiumSupportRequestsForUser(input.chatId, input.telegramUserId, 8),
  ]);

  if (keys.length === 0 && dynamicKeys.length === 0) {
    return ui.myKeysEmpty;
  }

  const lines = [
    ui.myKeysTitle,
    '',
    input.locale === 'my'
      ? 'လိုအပ်သော key ကို ရွေးပြီး share page ဖွင့်ခြင်း၊ renew လုပ်ခြင်း၊ support request တင်ခြင်းတို့ကို အောက်ပါ button များဖြင့် တိုက်ရိုက် လုပ်နိုင်ပါသည်။'
      : 'Choose the key you need below. Use the buttons to open the share page, renew, or contact support directly.',
    '',
  ];
  const inlineKeyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [];
  const trialKeys = keys.filter((key) => getTelegramAccessKeyCategory(key.tags) === 'trial');
  const standardKeys = keys.filter((key) => getTelegramAccessKeyCategory(key.tags) === 'standard');
  const latestPremiumRequestByKey = new Map<string, (typeof premiumRequests)[number]>();
  for (const request of premiumRequests) {
    if (!latestPremiumRequestByKey.has(request.dynamicAccessKeyId)) {
      latestPremiumRequestByKey.set(request.dynamicAccessKeyId, request);
    }
  }

  if (standardKeys.length > 0) {
    lines.push(formatTelegramKeySectionTitle(ui.myKeysSectionStandard, standardKeys.length), '');
  }

  for (const key of standardKeys) {
    const token = await ensureAccessKeySubscriptionToken(key.id, key.subscriptionToken);
    const sharePageUrl = key.publicSlug
      ? buildShortShareUrl(key.publicSlug, { source: 'telegram_mykeys', lang: input.locale })
      : buildSharePageUrl(token, { source: 'telegram_mykeys', lang: input.locale });
    lines.push(
      `• <b>${escapeHtml(key.name)}</b> • ${escapeHtml(ui.myKeysTypeStandard)}`,
      `  ${formatTelegramKeyStatusChip(key.status)} • ${escapeHtml(key.server.name)}${key.server.countryCode ? ` ${getFlagEmoji(key.server.countryCode)}` : ''}`,
      `  📊 ${formatTelegramQuotaSummary({
        usedBytes: key.usedBytes,
        dataLimitBytes: key.dataLimitBytes,
        ui,
      })}`,
      `  ⏳ ${escapeHtml(formatExpirationSummary(key, input.locale))}`,
      `  🔗 ${ui.openSharePage}`,
      '',
    );
    inlineKeyboard.push([
      {
        text: truncateTelegramButtonLabel(`${ui.openSharePage}: ${key.name}`, 38),
        url: sharePageUrl,
      },
      {
        text: truncateTelegramButtonLabel(`${ui.orderActionRenewKey}: ${key.name}`, 38),
        callback_data: buildTelegramOrderActionCallbackData('ky', key.id),
      },
    ]);
    inlineKeyboard.push([
      {
        text: truncateTelegramButtonLabel(`${ui.myKeysServerIssue}: ${key.name}`, 38),
        callback_data: buildTelegramServerChangeActionCallbackData('ky', key.id),
      },
      ...(supportLink
        ? [
            {
              text: truncateTelegramButtonLabel(ui.myKeysOpenSupport, 24),
              url: supportLink,
            },
          ]
        : []),
    ]);
  }

  if (trialKeys.length > 0) {
    lines.push(formatTelegramKeySectionTitle(ui.myKeysSectionTrial, trialKeys.length), '');
  }

  for (const key of trialKeys) {
    const token = await ensureAccessKeySubscriptionToken(key.id, key.subscriptionToken);
    const sharePageUrl = key.publicSlug
      ? buildShortShareUrl(key.publicSlug, { source: 'telegram_mykeys', lang: input.locale })
      : buildSharePageUrl(token, { source: 'telegram_mykeys', lang: input.locale });
    lines.push(
      `• <b>${escapeHtml(key.name)}</b> • ${escapeHtml(ui.myKeysTypeTrial)}`,
      `  ${formatTelegramKeyStatusChip(key.status)}`,
      `  📊 ${formatTelegramQuotaSummary({
        usedBytes: key.usedBytes,
        dataLimitBytes: key.dataLimitBytes,
        ui,
      })}`,
      `  ⏳ ${escapeHtml(formatExpirationSummary(key, input.locale))}`,
      `  🔗 ${ui.openSharePage}`,
      '',
    );
    inlineKeyboard.push([
      {
        text: truncateTelegramButtonLabel(`${ui.openSharePage}: ${key.name}`, 38),
        url: sharePageUrl,
      },
      {
        text: truncateTelegramButtonLabel(`${ui.orderActionRenewKey}: ${key.name}`, 38),
        callback_data: buildTelegramOrderActionCallbackData('ky', key.id),
      },
    ]);
  }

  if (dynamicKeys.length > 0) {
    lines.push(formatTelegramKeySectionTitle(ui.myKeysSectionPremium, dynamicKeys.length), '');
  }

  for (const key of dynamicKeys) {
    const { sharePageUrl } = getDynamicKeyMessagingUrls(key, 'telegram_mykeys', input.locale);
    const poolSummary = formatTelegramDynamicPoolSummary(key, ui);
    const latestRequest = latestPremiumRequestByKey.get(key.id);
    const preferredRegions = getDynamicKeyRegionChoices(key);
    lines.push(
      `• <b>${escapeHtml(key.name)}</b> • ${escapeHtml(ui.myKeysTypePremium)}`,
      `  ${formatTelegramKeyStatusChip(key.status)} • ${escapeHtml(key.type === 'SELF_MANAGED' ? ui.modeSelfManaged : ui.modeManual)}`,
      `  🌐 ${ui.myKeysCurrentPoolLabel}: ${escapeHtml(poolSummary)}`,
      `  📊 ${formatTelegramQuotaSummary({
        usedBytes: key.usedBytes,
        dataLimitBytes: key.dataLimitBytes,
        ui,
      })}`,
      `  ⏳ ${escapeHtml(formatExpirationSummary(key, input.locale))}`,
      preferredRegions.length > 0
        ? `  🎯 ${ui.premiumRequestedRegionLabel}: ${escapeHtml(preferredRegions.join(', '))}`
        : '',
      latestRequest
        ? `  🛟 ${ui.premiumOpenRequestLabel}: ${escapeHtml(
            `${latestRequest.requestCode} • ${formatTelegramPremiumFollowUpState(latestRequest, ui)}`,
          )}`
        : '',
      sharePageUrl ? `  🔗 ${ui.openSharePage}` : '',
      '',
    );
    inlineKeyboard.push([
      ...(sharePageUrl
        ? [
            {
              text: truncateTelegramButtonLabel(`${ui.openSharePage}: ${key.name}`, 38),
              url: sharePageUrl,
            },
          ]
        : []),
      {
        text: truncateTelegramButtonLabel(`${ui.orderActionRenewKey}: ${key.name}`, 38),
        callback_data: buildTelegramOrderActionCallbackData('ky', key.id, 'dynamic'),
      },
    ]);
    inlineKeyboard.push([
      {
        text: truncateTelegramButtonLabel(`${ui.premiumChangeRegion}: ${key.name}`, 38),
        callback_data: buildTelegramDynamicSupportActionCallbackData('rg', key.id),
      },
      {
        text: truncateTelegramButtonLabel(
          `${latestRequest ? ui.premiumReplyToRequest : ui.premiumReportRouteIssue}: ${key.name}`,
          38,
        ),
        callback_data: latestRequest
          ? buildTelegramDynamicSupportActionCallbackData('rp', latestRequest.id)
          : buildTelegramDynamicSupportActionCallbackData('is', key.id),
      },
    ]);
    inlineKeyboard.push([
      {
        text: truncateTelegramButtonLabel(`${ui.myKeysPremiumStatus}: ${key.name}`, 38),
        callback_data: latestRequest
          ? buildTelegramDynamicSupportActionCallbackData('st', latestRequest.id)
          : buildTelegramDynamicSupportActionCallbackData('is', key.id),
      },
      ...(supportLink
        ? [
            {
              text: truncateTelegramButtonLabel(ui.myKeysOpenSupport, 24),
              url: supportLink,
            },
          ]
        : []),
    ]);
  }

  lines.push(ui.myKeysRenewHint);
  const message = lines.join('\n');
  const sent = await sendTelegramMessage(input.botToken, input.chatId, message, {
    replyMarkup: inlineKeyboard.length ? { inline_keyboard: inlineKeyboard.slice(0, 12) } : undefined,
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

export async function handleSupportCommand(locale: SupportedLocale) {
  const ui = getTelegramUi(locale);
  const supportLink = await getTelegramSupportLink();

  if (!supportLink) {
    return ui.noSupportLink;
  }

  return `${ui.supportLabel}: ${supportLink}`;
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
