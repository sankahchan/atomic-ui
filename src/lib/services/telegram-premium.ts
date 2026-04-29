import { db } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit';
import { type SupportedLocale } from '@/lib/i18n/config';
import {
  DYNAMIC_ROUTING_EVENT_TYPES,
  recordDynamicRoutingEvent,
} from '@/lib/services/dynamic-routing-events';
import {
  resolveDynamicPinState,
} from '@/lib/services/dynamic-subscription-routing';
import {
  buildTelegramCommerceViewCallbackData,
  buildTelegramDynamicSupportActionCallbackData,
} from '@/lib/services/telegram-callbacks';
import {
  buildTelegramCommerceCard,
  buildTelegramCommerceMessage,
  buildTelegramCommercePagerRow,
  paginateTelegramCommerce,
  truncateTelegramCommerceButtonLabel,
} from '@/lib/services/telegram-commerce-ui';
import {
  buildPremiumIncidentKey,
  getPremiumHealthyPreferredRegions,
  getPremiumIncidentRegionCode,
  type PremiumFallbackTarget,
  type PremiumRegionAnalysis,
  type PremiumRegionHealthCheck,
  type PremiumRegionSummary,
  selectPremiumFallbackTarget,
  shouldAlertForPremiumRegionDegradation,
  summarizePremiumRegions,
} from '@/lib/services/premium-region-routing';
import {
  getTelegramConfig,
  getTelegramNotificationPreferences,
  getTelegramSupportLink,
  resolveTelegramChatIdForDynamicKey,
  resolveTelegramLocaleForRecipient,
  sendTelegramMessage,
  sendTelegramPhotoUrl,
} from '@/lib/services/telegram-runtime';
import { getTelegramBrandMediaUrl } from '@/lib/services/telegram-branding';
import {
  escapeHtml,
  formatTelegramDateTime,
  formatTelegramDynamicPoolSummary,
  formatTelegramPremiumFollowUpState,
  formatTelegramReplyStateLabel,
  formatTelegramPremiumSupportStatusLabel,
  formatTelegramPremiumSupportTypeLabel,
  getDynamicKeyRegionChoices,
  getFlagEmoji,
  getTelegramUi,
  normalizeTelegramPremiumSupportLookupCodes,
} from '@/lib/services/telegram-ui';
import { generateRandomString } from '@/lib/utils';

export function buildTelegramDynamicPremiumSupportKeyboard(
  dynamicAccessKeyId: string,
  locale: SupportedLocale,
  supportLink?: string | null,
  requestId?: string | null,
) {
  const ui = getTelegramUi(locale);
  const rows: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [
    [
      {
        text: ui.premiumChangeRegion,
        callback_data: buildTelegramDynamicSupportActionCallbackData('rg', dynamicAccessKeyId),
      },
    ],
    [
      {
        text: ui.premiumReportRouteIssue,
        callback_data: buildTelegramDynamicSupportActionCallbackData('is', dynamicAccessKeyId),
      },
    ],
  ];

  if (requestId) {
    rows.push([
      {
        text: ui.premiumReplyToRequest,
        callback_data: buildTelegramDynamicSupportActionCallbackData('rp', requestId),
      },
    ]);
  }

  if (supportLink) {
    rows.push([{ text: ui.getSupport, url: supportLink }]);
  }

  rows.push([
    {
      text: ui.orderActionCancel,
      callback_data: buildTelegramDynamicSupportActionCallbackData('ca', dynamicAccessKeyId),
    },
  ]);

  return {
    inline_keyboard: rows,
  };
}

export function buildTelegramDynamicPremiumPendingKeyboard(input: {
  dynamicAccessKeyId: string;
  requestId: string;
  locale: SupportedLocale;
  supportLink?: string | null;
}) {
  const ui = getTelegramUi(input.locale);
  const rows: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [[
    {
      text: ui.orderActionCheckStatus,
      callback_data: buildTelegramDynamicSupportActionCallbackData('st', input.requestId),
    },
  ]];

  rows.push([
    {
      text: ui.premiumChangeRegion,
      callback_data: buildTelegramDynamicSupportActionCallbackData('rg', input.dynamicAccessKeyId),
    },
    {
      text: ui.premiumReportRouteIssue,
      callback_data: buildTelegramDynamicSupportActionCallbackData('is', input.dynamicAccessKeyId),
    },
  ]);

  rows.push([
    {
      text: ui.premiumReplyToRequest,
      callback_data: buildTelegramDynamicSupportActionCallbackData('rp', input.requestId),
    },
  ]);

  if (input.supportLink) {
    rows.push([{ text: ui.getSupport, url: input.supportLink }]);
  }

  return {
    inline_keyboard: rows,
  };
}

export function buildTelegramDynamicPremiumRegionKeyboard(input: {
  dynamicAccessKeyId: string;
  locale: SupportedLocale;
  regionCodes: string[];
  supportLink?: string | null;
}) {
  const ui = getTelegramUi(input.locale);
  const rows: Array<Array<{ text: string; callback_data?: string; url?: string }>> = input.regionCodes
    .slice(0, 8)
    .map((countryCode) => [
      {
        text: truncateTelegramCommerceButtonLabel(`${getFlagEmoji(countryCode)} ${countryCode}`, 38),
        callback_data: buildTelegramDynamicSupportActionCallbackData(
          'rv',
          input.dynamicAccessKeyId,
          countryCode,
        ),
      },
    ]);

  if (input.supportLink) {
    rows.push([{ text: ui.getSupport, url: input.supportLink }]);
  }

  rows.push([
    {
      text: ui.orderActionCancel,
      callback_data: buildTelegramDynamicSupportActionCallbackData('ca', input.dynamicAccessKeyId),
    },
  ]);

  return {
    inline_keyboard: rows,
  };
}

async function generateTelegramPremiumSupportRequestCode(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = `PRM-${generateRandomString(8).toUpperCase()}`;
    const existing = await db.telegramPremiumSupportRequest.findUnique({
      where: { requestCode: candidate },
      select: { id: true },
    });
    if (!existing) {
      return candidate;
    }
  }

  return `PRM-${Date.now().toString(36).toUpperCase()}`;
}

type PremiumMessagingKey = {
  id: string;
  name: string;
  status?: string;
  telegramId?: string | null;
  user?: { telegramChatId?: string | null } | null;
  publicSlug?: string | null;
  dynamicUrl?: string | null;
  sharePageEnabled?: boolean | null;
  type?: string | null;
  preferredServerIdsJson?: string | null;
  preferredCountryCodesJson?: string | null;
  lastResolvedServerId?: string | null;
  pinnedAccessKeyId?: string | null;
  pinnedServerId?: string | null;
  pinnedAt?: Date | null;
  pinExpiresAt?: Date | null;
  accessKeys: Array<{
    id: string;
    name: string;
    server?: { id?: string; name: string; countryCode?: string | null } | null;
  }>;
}

function formatPremiumRegionHealthLabel(status: string | null | undefined, ui: ReturnType<typeof getTelegramUi>) {
  switch (status) {
    case 'UP':
      return ui.premiumRegionUp;
    case 'SLOW':
      return ui.premiumRegionSlow;
    case 'DOWN':
      return ui.premiumRegionDown;
    default:
      return ui.premiumRegionUnknownStatus;
  }
}

function formatPremiumRegionSummaryLine(
  summary: PremiumRegionSummary,
  ui: ReturnType<typeof getTelegramUi>,
) {
  const parts = [
    `${getFlagEmoji(summary.regionCode)} ${summary.regionCode}`,
    formatPremiumRegionHealthLabel(summary.status, ui),
  ];

  if (typeof summary.latencyMs === 'number') {
    parts.push(
      typeof summary.latencyThresholdMs === 'number'
        ? `${summary.latencyMs}ms / ${summary.latencyThresholdMs}ms`
        : `${summary.latencyMs}ms`,
    );
  }

  return parts.join(' • ');
}

function getPremiumCurrentFallbackRegion(analysis: PremiumRegionAnalysis) {
  const currentRegion =
    analysis.currentSummary?.regionCode ||
    analysis.currentServer?.countryCode?.trim().toUpperCase() ||
    null;

  if (!currentRegion || analysis.preferredRegions.length === 0) {
    return null;
  }

  return analysis.preferredRegions.includes(currentRegion) ? null : currentRegion;
}

function formatPremiumOverallStatusLine(
  analysis: PremiumRegionAnalysis,
  locale: SupportedLocale,
) {
  const preferredSummaries = analysis.regionSummaries.filter((entry) =>
    analysis.preferredRegions.includes(entry.regionCode),
  );

  if (analysis.currentSummary?.status === 'DOWN') {
    return locale === 'my' ? 'Overall: Current route is down' : 'Overall: Current route is down';
  }

  if (analysis.currentSummary?.status === 'SLOW') {
    return locale === 'my'
      ? 'Overall: Current route is slow'
      : 'Overall: Current route is slow';
  }

  if (
    preferredSummaries.length > 0 &&
    preferredSummaries.some((entry) => entry.status === 'DOWN') &&
    preferredSummaries.every((entry) => entry.status !== 'UP')
  ) {
    return locale === 'my'
      ? 'Overall: Preferred region is degraded'
      : 'Overall: Preferred region is degraded';
  }

  if (preferredSummaries.some((entry) => entry.status === 'SLOW')) {
    return locale === 'my'
      ? 'Overall: Some preferred routes are slow'
      : 'Overall: Some preferred routes are slow';
  }

  if (analysis.regionSummaries.length === 0) {
    return locale === 'my'
      ? 'Overall: Region health is not ready yet'
      : 'Overall: Region health is not ready yet';
  }

  return locale === 'my' ? 'Overall: Healthy' : 'Overall: Healthy';
}

function buildPremiumRecommendedNextStepText(
  analysis: PremiumRegionAnalysis,
  locale: SupportedLocale,
) {
  const suggestedFallback = analysis.suggestedFallbacks[0] || null;
  const currentFallback = getPremiumCurrentFallbackRegion(analysis);

  if (analysis.currentSummary?.status === 'DOWN' && suggestedFallback) {
    return locale === 'my'
      ? `${suggestedFallback.regionCode} ကို fallback အဖြစ် တောင်းဆိုပါ သို့မဟုတ် route issue report တင်ပါ။`
      : `Request ${suggestedFallback.regionCode} as fallback or report a route issue.`;
  }

  if (analysis.currentSummary?.status === 'SLOW' && suggestedFallback) {
    return locale === 'my'
      ? `${suggestedFallback.regionCode} သို့ ပြောင်းရန် စဉ်းစားနိုင်ပါသည်၊ သို့မဟုတ် လက်ရှိ route issue ကို report တင်ပါ။`
      : `Consider switching to ${suggestedFallback.regionCode}, or report the current route issue.`;
  }

  if (currentFallback && analysis.preferredRegions.length > 0) {
    return locale === 'my'
      ? `${analysis.preferredRegions.join(', ')} သို့ ပြန်လိုပါက region change request တင်နိုင်ပါသည်။`
      : `Request a move back to ${analysis.preferredRegions.join(', ')} if you want to return to your preferred region.`;
  }

  return locale === 'my'
    ? 'လက်ရှိ route ကို ဆက်အသုံးပြုနိုင်ပါသည်။ ပြောင်းလိုပါက region change request ကို အသုံးပြုပါ။'
    : 'You can keep using the current route. Use region change only if you want a different preference.';
}

export async function createTelegramPremiumSupportRequestRecord(input: {
  chatId: number;
  telegramUserId: number;
  telegramUsername?: string;
  locale: SupportedLocale;
  dynamicAccessKey: PremiumMessagingKey;
  requestType: 'REGION_CHANGE' | 'ROUTE_ISSUE';
  requestedRegionCode?: string | null;
}) {
  const requestCode = await generateTelegramPremiumSupportRequestCode();
  const ui = getTelegramUi(input.locale);
  const resolvedServer = input.dynamicAccessKey.accessKeys.find(
    (accessKey) => accessKey.server?.id === input.dynamicAccessKey.lastResolvedServerId,
  )?.server;
  const candidateOutageServerIds = Array.from(
    new Set(
      [
        input.dynamicAccessKey.lastResolvedServerId,
        ...input.dynamicAccessKey.accessKeys.map((accessKey) => accessKey.server?.id || null),
      ].filter((value): value is string => Boolean(value)),
    ),
  );
  const linkedOutage = candidateOutageServerIds.length
    ? await (db as any).serverOutageState.findFirst({
        where: {
          serverId: { in: candidateOutageServerIds },
          recoveredAt: null,
        },
        include: {
          server: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: [{ startedAt: 'desc' }],
      })
    : null;

  return db.telegramPremiumSupportRequest.create({
    data: {
      requestCode,
      status: 'PENDING_REVIEW',
      requestType: input.requestType,
      locale: input.locale,
      telegramChatId: String(input.chatId),
      telegramUserId: String(input.telegramUserId),
      telegramUsername: input.telegramUsername || null,
      dynamicAccessKeyId: input.dynamicAccessKey.id,
      requestedRegionCode: input.requestedRegionCode?.toUpperCase() || null,
      currentPoolSummary: formatTelegramDynamicPoolSummary(input.dynamicAccessKey, ui),
      currentResolvedServerId: resolvedServer?.id || input.dynamicAccessKey.lastResolvedServerId || null,
      currentResolvedServerName: resolvedServer?.name || null,
      currentResolvedServerCountryCode: resolvedServer?.countryCode || null,
      linkedOutageIncidentId: linkedOutage?.incidentId || null,
      linkedOutageServerId: linkedOutage?.server?.id || null,
      linkedOutageServerName: linkedOutage?.server?.name || null,
    },
  });
}

export async function listTelegramPremiumSupportRequestsForUser(
  chatId: number,
  telegramUserId: number,
  limit = 5,
) {
  return db.telegramPremiumSupportRequest.findMany({
    where: {
      telegramChatId: String(chatId),
      telegramUserId: String(telegramUserId),
    },
    include: {
      dynamicAccessKey: {
        include: {
          accessKeys: {
            include: {
              server: true,
            },
          },
        },
      },
      replies: {
        orderBy: [{ createdAt: 'asc' }],
        take: 8,
      },
    },
    orderBy: [{ updatedAt: 'desc' }],
    take: limit,
  });
}

export async function findTelegramPremiumSupportRequestByIdForUser(input: {
  requestId: string;
  chatId: number;
  telegramUserId: number;
}) {
  return db.telegramPremiumSupportRequest.findFirst({
    where: {
      id: input.requestId,
      telegramChatId: String(input.chatId),
      telegramUserId: String(input.telegramUserId),
    },
    include: {
      dynamicAccessKey: {
        include: {
          accessKeys: {
            include: {
              server: true,
            },
          },
        },
      },
      replies: {
        orderBy: [{ createdAt: 'asc' }],
        take: 12,
      },
    },
  });
}

export type TelegramPremiumSupportRequestForUser = Awaited<
  ReturnType<typeof findTelegramPremiumSupportRequestByIdForUser>
> extends infer T
  ? NonNullable<T>
  : never;

export async function addTelegramPremiumSupportReply(input: {
  requestId: string;
  senderType: 'CUSTOMER' | 'ADMIN';
  message: string;
  telegramUserId?: string | null;
  telegramUsername?: string | null;
  adminUserId?: string | null;
  senderName?: string | null;
  markPending?: boolean;
}) {
  const message = input.message.trim();
  if (!message) {
    throw new Error('Reply message is required.');
  }

  const now = new Date();

  const [reply] = await db.$transaction([
    db.telegramPremiumSupportReply.create({
      data: {
        requestId: input.requestId,
        senderType: input.senderType,
        telegramUserId: input.telegramUserId || null,
        telegramUsername: input.telegramUsername || null,
        adminUserId: input.adminUserId || null,
        senderName: input.senderName || null,
        message,
      },
    }),
    db.telegramPremiumSupportRequest.update({
      where: { id: input.requestId },
      data:
        input.senderType === 'CUSTOMER'
          ? {
              followUpPending: input.markPending ?? true,
              lastFollowUpAt: now,
              updatedAt: now,
            }
          : {
              followUpPending: false,
              lastAdminReplyAt: now,
              updatedAt: now,
            },
    }),
  ]);

  return reply;
}

export function buildTelegramPremiumSupportStatusMessage(input: {
  locale: SupportedLocale;
  request: TelegramPremiumSupportRequestForUser;
}) {
  const ui = getTelegramUi(input.locale);
  const isMyanmar = input.locale === 'my';
  const { request } = input;
  const poolSummary = formatTelegramDynamicPoolSummary(request.dynamicAccessKey, ui);
  const latestReply = request.replies?.[request.replies.length - 1] || null;
  const currentState = formatTelegramPremiumFollowUpState(request, ui);
  const followUpIndicator = formatTelegramReplyStateLabel({
    status: request.status,
    latestReplySenderType: latestReply?.senderType || null,
    followUpPending: request.followUpPending,
    locale: input.locale,
  });
  const routeSnapshotLines = [
    `${ui.premiumCurrentPoolLabel}: <b>${escapeHtml(poolSummary)}</b>`,
    request.requestedRegionCode || request.currentResolvedServerName || request.currentResolvedServerCountryCode
      ? [
          request.requestedRegionCode
            ? `${ui.premiumRequestedRegionLabel}: <b>${escapeHtml(request.requestedRegionCode)}</b>`
            : null,
          request.currentResolvedServerName || request.currentResolvedServerCountryCode
            ? `${ui.premiumResolvedServer}: <b>${escapeHtml(
                request.currentResolvedServerName ||
                  request.currentResolvedServerCountryCode ||
                  ui.premiumNoRequestedRegion,
              )}</b>`
            : null,
        ].filter(Boolean).join(' • ')
      : null,
  ].filter(Boolean) as string[];

  const threadMetaLines = [
    `<b>${escapeHtml(formatTelegramPremiumSupportTypeLabel(request.requestType, ui))}</b> • <b>${escapeHtml(
      formatTelegramPremiumSupportStatusLabel(request.status, ui),
    )}</b>`,
    `${escapeHtml(currentState)} • ${escapeHtml(followUpIndicator)}`,
  ];

  if (request.appliedPinServerName) {
    const pinSummary = request.appliedPinExpiresAt
      ? `${request.appliedPinServerName} (${formatTelegramDateTime(
          request.appliedPinExpiresAt,
          input.locale,
        )})`
      : request.appliedPinServerName;
    routeSnapshotLines.push(`${ui.premiumCurrentPin}: <b>${escapeHtml(pinSummary)}</b>`);
  }

  const cards = [
    buildTelegramCommerceCard(
      isMyanmar ? '🧾 <b>Request အနှစ်ချုပ်</b>' : '🧾 <b>Request snapshot</b>',
      threadMetaLines,
    ),
    buildTelegramCommerceCard(
      isMyanmar ? '🌍 <b>Route အနှစ်ချုပ်</b>' : '🌍 <b>Route snapshot</b>',
      routeSnapshotLines,
    ),
  ];

  if (request.customerMessage?.trim()) {
    cards.push(
      buildTelegramCommerceCard(
        isMyanmar ? '✍️ <b>သင့်မှတ်စု</b>' : '✍️ <b>Your note</b>',
        [escapeHtml(request.customerMessage.trim())],
      ),
    );
  }

  if (latestReply) {
    const replySenderLabel =
      latestReply.senderType === 'ADMIN' ? ui.premiumFollowUpFromAdmin : ui.premiumFollowUpFromYou;
    const replyMessage = latestReply.message.trim();
    const replyPreview = replyMessage.length > 120 ? `${replyMessage.slice(0, 117)}...` : replyMessage;
    cards.push(
      buildTelegramCommerceCard(
        isMyanmar ? '💬 <b>နောက်ဆုံး reply</b>' : '💬 <b>Last reply</b>',
        [
          `${escapeHtml(replySenderLabel)} • ${escapeHtml(
            formatTelegramDateTime(latestReply.createdAt, input.locale),
          )}`,
          escapeHtml(replyPreview),
        ],
      ),
    );
  }

  const nextStepText =
    request.status === 'PENDING_REVIEW'
      ? input.locale === 'my'
        ? 'Admin review ကို စောင့်ပါ။ လိုအပ်ပါက extra detail တောင်းနိုင်ပါသည်။'
        : 'Wait for admin review. More detail may be requested.'
      : currentState === ui.premiumAwaitingYourReply
        ? input.locale === 'my'
          ? 'Admin အဖြေ ရှိပါသည်။ Thread ကို ဆက်ရန် Reply ကို နှိပ်ပါ။'
          : 'The admin replied. Tap Reply to continue.'
        : currentState === ui.premiumAwaitingAdminReply
          ? input.locale === 'my'
            ? 'သင့်နောက်ဆုံး reply ကို Admin စစ်နေပါသည်။'
            : 'Admin is reviewing your latest reply.'
          : ui.premiumStatusReplyHint;

  return buildTelegramCommerceMessage({
    title: ui.premiumStatusTitle,
    statsLine: `<b>${escapeHtml(request.requestCode)}</b> • <b>${escapeHtml(request.dynamicAccessKey.name)}</b>`,
    cards,
    footerLines: [`${ui.orderNextStepLabel}: ${escapeHtml(nextStepText)}`],
  });
}

type TelegramPremiumHubItem = {
  id: string;
  name: string;
  sharePageUrl: string | null;
  poolSummary: string;
  currentRouteLabel: string;
  preferredRegions: string[];
  summaryLine: string;
  latestRequestId: string | null;
  latestRequestCode: string | null;
  latestRequestState: string | null;
};

type TelegramPremiumSupportListItem = {
  id: string;
  requestCode: string;
  keyName: string;
  requestTypeLabel: string;
  statusLabel: string;
  threadStateLabel: string;
  replyStateLabel: string;
  createdAtLabel: string;
};

function formatTelegramCountLabel(
  count: number,
  locale: SupportedLocale,
  singular: string,
  plural?: string,
  myanmarLabel?: string,
) {
  if (locale === 'my') {
    return `${count} ခု ${myanmarLabel || plural || singular}`;
  }

  const pluralLabel = plural || `${singular}s`;
  return `${count} ${count === 1 ? singular : pluralLabel}`;
}

function buildTelegramPremiumHeroCaption(input: {
  locale: SupportedLocale;
  keyCount: number;
  requestCount: number;
}) {
  const statsLine = `${formatTelegramCountLabel(input.keyCount, input.locale, 'key')} • ${formatTelegramCountLabel(
    input.requestCount,
    input.locale,
    'recent request',
    'recent requests',
    'recent request',
  )}`;

  return [
    getTelegramUi(input.locale).premiumHubTitle,
    '',
    statsLine,
    input.locale === 'my'
      ? 'Atomic-UI Premium • stable route • region-aware support'
      : 'Atomic-UI Premium • stable route • region-aware support',
  ].join('\n');
}

function resolveTelegramPremiumDetailButtonLabel(locale: SupportedLocale) {
  return locale === 'my' ? 'အသေးစိတ်' : 'Details';
}

function selectPremiumRegionSnapshotSummaries(analysis: PremiumRegionAnalysis) {
  const selected: PremiumRegionSummary[] = [];
  const seen = new Set<string>();
  const push = (summary: PremiumRegionSummary | null | undefined) => {
    if (!summary || seen.has(summary.regionCode)) {
      return;
    }
    selected.push(summary);
    seen.add(summary.regionCode);
  };

  push(analysis.currentSummary);

  for (const summary of analysis.regionSummaries) {
    if (analysis.preferredRegions.includes(summary.regionCode) && summary.status !== 'UP') {
      push(summary);
    }
  }

  for (const summary of analysis.regionSummaries) {
    if (analysis.preferredRegions.includes(summary.regionCode)) {
      push(summary);
    }
  }

  for (const fallback of analysis.suggestedFallbacks) {
    push(analysis.regionSummaries.find((summary) => summary.regionCode === fallback.regionCode) || null);
  }

  return selected.slice(0, 3);
}

export function buildTelegramPremiumHubMessage(input: {
  locale: SupportedLocale;
  items: TelegramPremiumHubItem[];
  requestCount: number;
  page: number;
}) {
  const ui = getTelegramUi(input.locale);
  const pagination = paginateTelegramCommerce(input.items, input.page);
  const cards = pagination.pageItems.map((item) =>
    buildTelegramCommerceCard(
      `💎 <b>${escapeHtml(item.name)}</b>`,
      [
        escapeHtml(item.summaryLine),
        `${ui.premiumRegionCurrentRouteLabel}: ${escapeHtml(item.currentRouteLabel)}`,
        `${ui.premiumCurrentPoolLabel}: ${escapeHtml(item.poolSummary)}`,
        item.latestRequestCode && item.latestRequestState
          ? `${ui.premiumThreadStatusLabel}: ${escapeHtml(`${item.latestRequestCode} • ${item.latestRequestState}`)}`
          : null,
      ],
    ),
  );

  return buildTelegramCommerceMessage({
    title: ui.premiumHubTitle,
    statsLine: `${formatTelegramCountLabel(input.items.length, input.locale, 'key')} • ${formatTelegramCountLabel(
      input.requestCount,
      input.locale,
      'recent request',
      'recent requests',
      'recent request',
    )}`,
    intro:
      input.locale === 'my'
        ? 'အောက်က key တစ်ခုကိုရွေးပြီး region, issue, status ကို ဆက်လုပ်နိုင်သည်။'
        : 'Choose a key below, then use the buttons for region, issue, or status.',
    cards,
  });
}

export function buildTelegramPremiumDetailMessage(input: {
  locale: SupportedLocale;
  item: TelegramPremiumHubItem;
}) {
  const ui = getTelegramUi(input.locale);
  const isMyanmar = input.locale === 'my';
  const detailLines = [
    `${ui.statusLineLabel}: ${escapeHtml(input.item.summaryLine)}`,
    `${ui.premiumRegionCurrentRouteLabel}: ${escapeHtml(input.item.currentRouteLabel)}`,
    `${ui.premiumCurrentPoolLabel}: ${escapeHtml(input.item.poolSummary)}`,
    input.item.preferredRegions.length > 0
      ? `${ui.premiumRequestedRegionLabel}: ${escapeHtml(input.item.preferredRegions.join(', '))}`
      : null,
    input.item.latestRequestCode && input.item.latestRequestState
      ? `${ui.premiumThreadStatusLabel}: ${escapeHtml(`${input.item.latestRequestCode} • ${input.item.latestRequestState}`)}`
      : null,
  ].filter(Boolean) as string[];

  return buildTelegramCommerceMessage({
    title: isMyanmar ? '💎 <b>Premium key အသေးစိတ်</b>' : '💎 <b>Premium key detail</b>',
    statsLine: `<b>${escapeHtml(input.item.name)}</b>`,
    intro:
      isMyanmar
        ? 'Open, region, issue, status ကို အောက်က button များဖြင့် ဆက်လုပ်ပါ။'
        : 'Use the buttons below for open, region, issue, or status.',
    cards: [
      buildTelegramCommerceCard(
        isMyanmar ? '💎 <b>Premium အနှစ်ချုပ်</b>' : '💎 <b>Premium summary</b>',
        detailLines,
      ),
    ],
  });
}

export function buildTelegramPremiumSupportListMessage(input: {
  locale: SupportedLocale;
  items: TelegramPremiumSupportListItem[];
  page: number;
}) {
  const ui = getTelegramUi(input.locale);
  const pagination = paginateTelegramCommerce(input.items, input.page);
  const cards = pagination.pageItems.map((item) =>
    buildTelegramCommerceCard(
      `🧾 <b>${escapeHtml(item.requestCode)}</b>`,
      [
        `${escapeHtml(item.keyName)} • ${escapeHtml(item.requestTypeLabel)}`,
        `${ui.statusLineLabel}: ${escapeHtml(item.statusLabel)} • ${escapeHtml(item.threadStateLabel)}`,
        `${escapeHtml(item.replyStateLabel)} • ${ui.createdAtLabel}: ${escapeHtml(item.createdAtLabel)}`,
      ],
    ),
  );

  return buildTelegramCommerceMessage({
    title: ui.premiumStatusTitle,
    statsLine: formatTelegramCountLabel(
      input.items.length,
      input.locale,
      'recent request',
      'recent requests',
      'recent request',
    ),
    intro:
      input.locale === 'my'
        ? 'Open thread ကို နှိပ်ပြီး request တစ်ခုချင်းစီကို ကြည့်နိုင်သည်။'
        : 'Open a request below for the compact thread card.',
    cards,
  });
}

export function buildTelegramPremiumRegionDetailMessage(input: {
  locale: SupportedLocale;
  key: PremiumMessagingKey & { status: string };
  analysis: PremiumRegionAnalysis;
  latestRoutingEvent: Awaited<ReturnType<typeof getLatestPremiumRoutingEventsByKeyIds>> extends Map<string, infer TValue>
    ? TValue | null
    : unknown;
  index: number;
  total: number;
}) {
  const ui = getTelegramUi(input.locale);
  const isMyanmar = input.locale === 'my';
  const currentFallback = getPremiumCurrentFallbackRegion(input.analysis);
  const currentRouteLabel = input.analysis.currentServer
    ? `${input.analysis.currentServer.name}${input.analysis.currentServer.countryCode ? ` ${getFlagEmoji(input.analysis.currentServer.countryCode)}` : ''}`
    : ui.premiumRegionUnknownStatus;
  const preferredRegionsLabel = input.analysis.preferredRegions.join(', ') || ui.premiumRegionNoAttached;
  const regionSnapshotSummaries = selectPremiumRegionSnapshotSummaries(input.analysis);
  const regionLines =
    regionSnapshotSummaries.length === 0
      ? [ui.premiumRegionNoAttached]
      : regionSnapshotSummaries.map((summary) => {
          const markers: string[] = [];
          if (summary.isCurrent) {
            markers.push(ui.premiumRegionCurrentRouteLabel);
          }
          if (input.analysis.preferredRegions.includes(summary.regionCode) && !summary.isCurrent) {
            markers.push(ui.premiumRegionPreferredLabel);
          }
          if (summary.serverCount > 0) {
            markers.push(`${summary.serverCount} server${summary.serverCount === 1 ? '' : 's'}`);
          }
          return [formatPremiumRegionSummaryLine(summary, ui), markers.join(' • ')].filter(Boolean).join(' • ');
        });

  return buildTelegramCommerceMessage({
    title: isMyanmar
      ? `🌍 <b>Region အခြေအနေ ${input.index}/${input.total}</b>`
      : `🌍 <b>Region status ${input.index}/${input.total}</b>`,
    statsLine: `<b>${escapeHtml(input.key.name)}</b> • ${escapeHtml(formatPremiumOverallStatusLine(input.analysis, input.locale))}`,
    cards: [
      buildTelegramCommerceCard(
        isMyanmar ? '🌍 <b>Route အနှစ်ချုပ်</b>' : '🌍 <b>Routing snapshot</b>',
        [
          `${ui.premiumRegionPreferredLabel}: ${escapeHtml(preferredRegionsLabel)}`,
          `${ui.premiumRegionCurrentRouteLabel}: ${escapeHtml(currentRouteLabel)}${currentFallback ? ` • ${ui.premiumRegionCurrentFallbackLabel}: ${escapeHtml(currentFallback)}` : ''}`,
          `Event: ${escapeHtml(formatTelegramPremiumRoutingEventSummary(input.latestRoutingEvent, input.locale))}`,
        ],
      ),
      buildTelegramCommerceCard(
        isMyanmar ? '🩺 <b>Health အနှစ်ချုပ်</b>' : '🩺 <b>Health snapshot</b>',
        regionLines.map((line) => escapeHtml(line)),
      ),
    ],
    footerLines: [
      escapeHtml(buildPremiumRecommendedNextStepText(input.analysis, input.locale)),
    ],
  });
}

function buildTelegramPremiumHubKeyboard(input: {
  locale: SupportedLocale;
  items: TelegramPremiumHubItem[];
  page: number;
  supportLink?: string | null;
}) {
  const pagination = paginateTelegramCommerce(input.items, input.page);
  const rows: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [];

  for (const item of pagination.pageItems) {
    rows.push([
      {
        text: getTelegramUi(input.locale).premiumChangeRegion,
        callback_data: buildTelegramDynamicSupportActionCallbackData('rg', item.id),
      },
      {
        text: getTelegramUi(input.locale).premiumReportRouteIssue,
        callback_data: buildTelegramDynamicSupportActionCallbackData('is', item.id),
      },
    ]);
    rows.push([
      {
        text: getTelegramUi(input.locale).myKeysPremiumStatus,
        callback_data: item.latestRequestId
          ? buildTelegramDynamicSupportActionCallbackData('st', item.latestRequestId)
          : buildTelegramDynamicSupportActionCallbackData('is', item.id),
      },
      {
        text: resolveTelegramPremiumDetailButtonLabel(input.locale),
        callback_data: buildTelegramCommerceViewCallbackData(
          'premium',
          'detail',
          item.id,
          String(pagination.page),
        ),
      },
    ]);
  }

  const pager = buildTelegramCommercePagerRow({
    locale: input.locale,
    section: 'premium',
    page: pagination.page,
    totalItems: input.items.length,
  });
  if (pager) {
    rows.push(pager);
  }

  if (input.supportLink) {
    rows.push([{ text: getTelegramUi(input.locale).getSupport, url: input.supportLink }]);
  }

  return { inline_keyboard: rows };
}

function buildTelegramPremiumDetailKeyboard(input: {
  locale: SupportedLocale;
  item: TelegramPremiumHubItem;
  page: number;
  supportLink?: string | null;
}) {
  const rows: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [];

  if (input.item.sharePageUrl) {
    rows.push([{ text: getTelegramUi(input.locale).openSharePage, url: input.item.sharePageUrl }]);
  }
  rows.push([
    {
      text: getTelegramUi(input.locale).premiumChangeRegion,
      callback_data: buildTelegramDynamicSupportActionCallbackData('rg', input.item.id),
    },
    {
      text: getTelegramUi(input.locale).premiumReportRouteIssue,
      callback_data: buildTelegramDynamicSupportActionCallbackData('is', input.item.id),
    },
  ]);
  rows.push([
    {
      text: getTelegramUi(input.locale).myKeysPremiumStatus,
      callback_data: input.item.latestRequestId
        ? buildTelegramDynamicSupportActionCallbackData('st', input.item.latestRequestId)
        : buildTelegramDynamicSupportActionCallbackData('is', input.item.id),
    },
    ...(input.supportLink ? [{ text: getTelegramUi(input.locale).getSupport, url: input.supportLink }] : []),
  ]);
  rows.push([{
    text: input.locale === 'my' ? '← Back to premium' : '← Back to premium',
    callback_data: buildTelegramCommerceViewCallbackData('premium', 'home', String(input.page)),
  }]);

  return { inline_keyboard: rows };
}

function buildTelegramPremiumSupportListKeyboard(input: {
  locale: SupportedLocale;
  items: TelegramPremiumSupportListItem[];
  page: number;
  supportLink?: string | null;
}) {
  const pagination = paginateTelegramCommerce(input.items, input.page);
  const rows: Array<Array<{ text: string; callback_data?: string; url?: string }>> = pagination.pageItems.map((item) => [{
    text: truncateTelegramCommerceButtonLabel(
      `${getTelegramUi(input.locale).orderActionCheckStatus}: ${item.requestCode}`,
      36,
    ),
    callback_data: buildTelegramCommerceViewCallbackData(
      'supportstatus',
      'detail',
      item.id,
      String(pagination.page),
    ),
  }]);

  const pager = buildTelegramCommercePagerRow({
    locale: input.locale,
    section: 'supportstatus',
    page: pagination.page,
    totalItems: input.items.length,
  });
  if (pager) {
    rows.push(pager);
  }

  if (input.supportLink) {
    rows.push([{ text: getTelegramUi(input.locale).getSupport, url: input.supportLink }]);
  }

  rows.push([{
    text: input.locale === 'my' ? '← Premium သို့' : '← Premium center',
    callback_data: buildTelegramCommerceViewCallbackData('premium', 'home', '1'),
  }]);

  return { inline_keyboard: rows };
}

function buildTelegramPremiumStatusDetailKeyboard(input: {
  locale: SupportedLocale;
  request: TelegramPremiumSupportRequestForUser;
  supportLink?: string | null;
  page: number;
}) {
  const requestKeyboard =
    input.request.status === 'PENDING_REVIEW'
      ? buildTelegramDynamicPremiumPendingKeyboard({
          dynamicAccessKeyId: input.request.dynamicAccessKeyId,
          requestId: input.request.id,
          locale: input.locale,
          supportLink: input.supportLink,
        }).inline_keyboard
      : buildTelegramDynamicPremiumSupportKeyboard(
          input.request.dynamicAccessKeyId,
          input.locale,
          input.supportLink,
          input.request.id,
        ).inline_keyboard;

  requestKeyboard.push([{
    text: input.locale === 'my' ? '← Back to requests' : '← Back to requests',
    callback_data: buildTelegramCommerceViewCallbackData('supportstatus', 'home', String(input.page)),
  }]);

  return { inline_keyboard: requestKeyboard };
}

function buildTelegramPremiumRegionKeyboard(input: {
  locale: SupportedLocale;
  keyId: string;
  page: number;
  totalItems: number;
  supportLink?: string | null;
}) {
  const rows: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [
    [
      {
        text: getTelegramUi(input.locale).premiumChangeRegion,
        callback_data: buildTelegramDynamicSupportActionCallbackData('rg', input.keyId),
      },
      {
        text: getTelegramUi(input.locale).premiumReportRouteIssue,
        callback_data: buildTelegramDynamicSupportActionCallbackData('is', input.keyId),
      },
    ],
  ];

  const pager = buildTelegramCommercePagerRow({
    locale: input.locale,
    section: 'premiumregion',
    page: input.page,
    totalItems: input.totalItems,
  });
  if (pager) {
    rows.push(pager);
  }

  if (input.supportLink) {
    rows.push([{ text: getTelegramUi(input.locale).getSupport, url: input.supportLink }]);
  }

  return { inline_keyboard: rows };
}

export async function handlePremiumCommand(input: {
  chatId: number;
  telegramUserId: number;
  locale: SupportedLocale;
  botToken: string;
  getTelegramSupportLink: () => Promise<string | null>;
  findLinkedDynamicAccessKeys: (
    chatId: number,
    telegramUserId: number,
    includeDisabled?: boolean,
  ) => Promise<
    Array<
      PremiumMessagingKey & {
        status: string;
      }
    >
  >;
  getDynamicKeyMessagingUrls: (
    dynamicKey: PremiumMessagingKey,
    source: string,
    locale: SupportedLocale,
  ) => {
    sharePageUrl: string | null;
    subscriptionUrl: string | null;
    outlineClientUrl: string | null;
  };
  sendTelegramMessage: (
    botToken: string,
    chatId: number | string,
    text: string,
    options?: {
      parseMode?: 'HTML' | 'Markdown';
      replyMarkup?: Record<string, unknown>;
      disableWebPagePreview?: boolean;
    },
  ) => Promise<boolean>;
}) {
  const ui = getTelegramUi(input.locale);
  const supportLink = await input.getTelegramSupportLink();
  const dynamicKeys = (await input.findLinkedDynamicAccessKeys(
    input.chatId,
    input.telegramUserId,
    true,
  )).filter((key) => ['ACTIVE', 'PENDING', 'DISABLED'].includes(key.status));

  if (dynamicKeys.length === 0) {
    return ui.premiumHubEmpty;
  }

  const allServerIds = Array.from(
    new Set(
      dynamicKeys.flatMap((key) =>
        key.accessKeys
          .map((accessKey) => accessKey.server?.id || null)
          .filter((serverId): serverId is string => Boolean(serverId)),
      ),
    ),
  );
  const healthChecks = allServerIds.length
    ? await db.healthCheck.findMany({
        where: {
          serverId: { in: allServerIds },
        },
        select: {
          serverId: true,
          lastStatus: true,
          lastLatencyMs: true,
          lastCheckedAt: true,
          latencyThresholdMs: true,
          server: {
            select: {
              id: true,
              name: true,
              countryCode: true,
            },
          },
        },
      })
    : [];
  const healthByServerId = new Map(healthChecks.map((entry) => [entry.serverId, entry]));
  const latestRoutingEvents = await getLatestPremiumRoutingEventsByKeyIds(dynamicKeys.map((key) => key.id));

  const recentRequests = await listTelegramPremiumSupportRequestsForUser(
    input.chatId,
    input.telegramUserId,
    3,
  );
  const items: TelegramPremiumHubItem[] = dynamicKeys.map((key) => {
    const poolSummary = formatTelegramDynamicPoolSummary(key, ui);
    const { sharePageUrl } = input.getDynamicKeyMessagingUrls(key, 'telegram_premium', input.locale);
    const latestRequest = recentRequests.find((request) => request.dynamicAccessKeyId === key.id) || null;
    const analysis = summarizePremiumRegions(key, healthByServerId);
    const currentRouteLabel = analysis.currentServer
      ? `${analysis.currentServer.name}${analysis.currentServer.countryCode ? ` ${getFlagEmoji(analysis.currentServer.countryCode)}` : ''}`
      : ui.premiumRegionUnknownStatus;

    return {
      id: key.id,
      name: key.name,
      sharePageUrl,
      poolSummary,
      currentRouteLabel,
      preferredRegions: analysis.preferredRegions,
      summaryLine: formatPremiumOverallStatusLine(analysis, input.locale),
      latestRequestId: latestRequest?.id || null,
      latestRequestCode: latestRequest?.requestCode || null,
      latestRequestState: latestRequest ? formatTelegramPremiumFollowUpState(latestRequest, ui) : null,
    };
  });

  await sendTelegramPhotoUrl(
    input.botToken,
    input.chatId,
    getTelegramBrandMediaUrl('premiumShowcase'),
    buildTelegramPremiumHeroCaption({
      locale: input.locale,
      keyCount: dynamicKeys.length,
      requestCount: recentRequests.length,
    }),
  );

  const message = buildTelegramPremiumHubMessage({
    locale: input.locale,
    items,
    requestCount: recentRequests.length,
    page: 1,
  });
  const sent = await input.sendTelegramMessage(input.botToken, input.chatId, message, {
    replyMarkup: buildTelegramPremiumHubKeyboard({
      locale: input.locale,
      items,
      page: 1,
      supportLink,
    }),
  });

  return sent ? null : message;
}

export async function handlePremiumSupportStatusCommand(input: {
  chatId: number;
  telegramUserId: number;
  locale: SupportedLocale;
  botToken: string;
  argsText: string;
  getTelegramSupportLink: () => Promise<string | null>;
  sendTelegramMessage: (
    botToken: string,
    chatId: number | string,
    text: string,
    options?: {
      parseMode?: 'HTML' | 'Markdown';
      replyMarkup?: Record<string, unknown>;
      disableWebPagePreview?: boolean;
    },
  ) => Promise<boolean>;
}) {
  const ui = getTelegramUi(input.locale);
  const supportLink = await input.getTelegramSupportLink();
  const trimmedArgs = input.argsText.trim();

  if (trimmedArgs) {
    const requestCodes = normalizeTelegramPremiumSupportLookupCodes(trimmedArgs);
    const request = requestCodes.length
      ? await db.telegramPremiumSupportRequest.findFirst({
          where: {
            telegramChatId: String(input.chatId),
            telegramUserId: String(input.telegramUserId),
            requestCode: { in: requestCodes },
          },
          include: {
            dynamicAccessKey: {
              include: {
                accessKeys: {
                  include: {
                    server: true,
                  },
                },
              },
            },
            replies: {
              orderBy: [{ createdAt: 'asc' }],
              take: 12,
            },
          },
        })
      : null;

    if (!request) {
      return ui.premiumStatusEmpty;
    }

    const message = buildTelegramPremiumSupportStatusMessage({
      locale: input.locale,
      request,
    });
    const sent = await input.sendTelegramMessage(input.botToken, input.chatId, message, {
      replyMarkup:
        request.status === 'PENDING_REVIEW'
          ? buildTelegramDynamicPremiumPendingKeyboard({
              dynamicAccessKeyId: request.dynamicAccessKeyId,
              requestId: request.id,
              locale: input.locale,
              supportLink,
            })
          : buildTelegramDynamicPremiumSupportKeyboard(
              request.dynamicAccessKeyId,
              input.locale,
              supportLink,
              request.id,
            ),
    });

    return sent ? null : message;
  }

  const requests = await listTelegramPremiumSupportRequestsForUser(
    input.chatId,
    input.telegramUserId,
    12,
  );
  if (requests.length === 0) {
    return ui.premiumStatusEmpty;
  }
  const summaryItems: TelegramPremiumSupportListItem[] = requests.map((request) => {
    const latestReply = request.replies?.[request.replies.length - 1] || null;
    return {
      id: request.id,
      requestCode: request.requestCode,
      keyName: request.dynamicAccessKey.name,
      requestTypeLabel: formatTelegramPremiumSupportTypeLabel(request.requestType, ui),
      statusLabel: formatTelegramPremiumSupportStatusLabel(request.status, ui),
      threadStateLabel: formatTelegramPremiumFollowUpState(request, ui),
      replyStateLabel: formatTelegramReplyStateLabel({
        status: request.status,
        latestReplySenderType: latestReply?.senderType || null,
        followUpPending: request.followUpPending,
        locale: input.locale,
      }),
      createdAtLabel: formatTelegramDateTime(request.createdAt, input.locale),
    };
  });
  const message = buildTelegramPremiumSupportListMessage({
    locale: input.locale,
    items: summaryItems,
    page: 1,
  });
  const sent = await input.sendTelegramMessage(input.botToken, input.chatId, message, {
    replyMarkup: buildTelegramPremiumSupportListKeyboard({
      locale: input.locale,
      items: summaryItems,
      page: 1,
      supportLink,
    }),
  });

  return sent ? null : message;
}

export async function handlePremiumRegionStatusCommand(input: {
  chatId: number;
  telegramUserId: number;
  locale: SupportedLocale;
  botToken: string;
  argsText: string;
  getTelegramSupportLink: () => Promise<string | null>;
  findLinkedDynamicAccessKeys: (
    chatId: number,
    telegramUserId: number,
    includeDisabled?: boolean,
  ) => Promise<
    Array<
      PremiumMessagingKey & {
        status: string;
      }
    >
  >;
  sendTelegramMessage: (
    botToken: string,
    chatId: number | string,
    text: string,
    options?: {
      parseMode?: 'HTML' | 'Markdown';
      replyMarkup?: Record<string, unknown>;
      disableWebPagePreview?: boolean;
    },
  ) => Promise<boolean>;
}) {
  const ui = getTelegramUi(input.locale);
  const supportLink = await input.getTelegramSupportLink();
  const query = input.argsText.trim().toLowerCase();
  const linkedKeys = (await input.findLinkedDynamicAccessKeys(
    input.chatId,
    input.telegramUserId,
    true,
  )).filter((key) => ['ACTIVE', 'PENDING', 'DISABLED'].includes(key.status));

  const dynamicKeys = query
    ? linkedKeys.filter((key) =>
        [key.id, key.name, key.publicSlug || '']
          .join(' ')
          .toLowerCase()
          .includes(query),
      )
    : linkedKeys;

  if (dynamicKeys.length === 0) {
    return ui.premiumRegionStatusEmpty;
  }

  const allServerIds = Array.from(
    new Set(
      dynamicKeys.flatMap((key) =>
        key.accessKeys
          .map((accessKey) => accessKey.server?.id || null)
          .filter((serverId): serverId is string => Boolean(serverId)),
      ),
    ),
  );

  const healthChecks = allServerIds.length
    ? await db.healthCheck.findMany({
        where: {
          serverId: { in: allServerIds },
        },
        select: {
          serverId: true,
          lastStatus: true,
          lastLatencyMs: true,
          lastCheckedAt: true,
          latencyThresholdMs: true,
          server: {
            select: {
              id: true,
              name: true,
              countryCode: true,
            },
          },
        },
      })
    : [];
  const healthByServerId = new Map(healthChecks.map((entry) => [entry.serverId, entry]));
  const latestRoutingEvents = await getLatestPremiumRoutingEventsByKeyIds(dynamicKeys.map((key) => key.id));
  const selectedKey = dynamicKeys[0];
  const selectedAnalysis = summarizePremiumRegions(selectedKey, healthByServerId);
  const latestRoutingEvent = latestRoutingEvents.get(selectedKey.id) || null;
  const message = buildTelegramPremiumRegionDetailMessage({
    locale: input.locale,
    key: selectedKey,
    analysis: selectedAnalysis,
    latestRoutingEvent,
    index: 1,
    total: dynamicKeys.length,
  });
  const sent = await input.sendTelegramMessage(input.botToken, input.chatId, message, {
    replyMarkup: buildTelegramPremiumRegionKeyboard({
      locale: input.locale,
      keyId: selectedKey.id,
      page: 1,
      totalItems: dynamicKeys.length,
      supportLink,
    }),
  });

  return sent ? null : message;
}

export async function handleTelegramPremiumCommerceView(input: {
  chatId: number;
  telegramUserId: number;
  locale: SupportedLocale;
  botToken: string;
  action: 'home' | 'page' | 'detail';
  primary?: string | null;
  secondary?: string | null;
  getTelegramSupportLink: () => Promise<string | null>;
  findLinkedDynamicAccessKeys: (
    chatId: number,
    telegramUserId: number,
    includeDisabled?: boolean,
  ) => Promise<Array<PremiumMessagingKey & { status: string }>>;
  getDynamicKeyMessagingUrls: (
    dynamicKey: PremiumMessagingKey,
    source: string,
    locale: SupportedLocale,
  ) => {
    sharePageUrl: string | null;
    subscriptionUrl: string | null;
    outlineClientUrl: string | null;
  };
  sendTelegramMessage: (
    botToken: string,
    chatId: number | string,
    text: string,
    options?: {
      parseMode?: 'HTML' | 'Markdown';
      replyMarkup?: Record<string, unknown>;
      disableWebPagePreview?: boolean;
    },
  ) => Promise<boolean>;
}) {
  const ui = getTelegramUi(input.locale);
  const supportLink = await input.getTelegramSupportLink();
  const dynamicKeys = (await input.findLinkedDynamicAccessKeys(
    input.chatId,
    input.telegramUserId,
    true,
  )).filter((key) => ['ACTIVE', 'PENDING', 'DISABLED'].includes(key.status));
  if (dynamicKeys.length === 0) {
    return ui.premiumHubEmpty;
  }

  const allServerIds = Array.from(
    new Set(
      dynamicKeys.flatMap((key) =>
        key.accessKeys
          .map((accessKey) => accessKey.server?.id || null)
          .filter((serverId): serverId is string => Boolean(serverId)),
      ),
    ),
  );
  const healthChecks = allServerIds.length
    ? await db.healthCheck.findMany({
        where: { serverId: { in: allServerIds } },
        select: {
          serverId: true,
          lastStatus: true,
          lastLatencyMs: true,
          lastCheckedAt: true,
          latencyThresholdMs: true,
          server: { select: { id: true, name: true, countryCode: true } },
        },
      })
    : [];
  const healthByServerId = new Map(healthChecks.map((entry) => [entry.serverId, entry]));
  const requests = await listTelegramPremiumSupportRequestsForUser(
    input.chatId,
    input.telegramUserId,
    12,
  );
  const items: TelegramPremiumHubItem[] = dynamicKeys.map((key) => {
    const analysis = summarizePremiumRegions(key, healthByServerId);
    const latestRequest = requests.find((request) => request.dynamicAccessKeyId === key.id) || null;
    const currentRouteLabel = analysis.currentServer
      ? `${analysis.currentServer.name}${analysis.currentServer.countryCode ? ` ${getFlagEmoji(analysis.currentServer.countryCode)}` : ''}`
      : ui.premiumRegionUnknownStatus;
    return {
      id: key.id,
      name: key.name,
      sharePageUrl: input.getDynamicKeyMessagingUrls(key, 'telegram_premium', input.locale).sharePageUrl,
      poolSummary: formatTelegramDynamicPoolSummary(key, ui),
      currentRouteLabel,
      preferredRegions: analysis.preferredRegions,
      summaryLine: formatPremiumOverallStatusLine(analysis, input.locale),
      latestRequestId: latestRequest?.id || null,
      latestRequestCode: latestRequest?.requestCode || null,
      latestRequestState: latestRequest ? formatTelegramPremiumFollowUpState(latestRequest, ui) : null,
    };
  });

  if (input.action === 'detail') {
    const item = items.find((candidate) => candidate.id === input.primary);
    if (!item) {
      return ui.premiumHubEmpty;
    }
    const page = Number.parseInt(input.secondary || '1', 10) || 1;
    const message = buildTelegramPremiumDetailMessage({
      locale: input.locale,
      item,
    });
    const sent = await input.sendTelegramMessage(input.botToken, input.chatId, message, {
      replyMarkup: buildTelegramPremiumDetailKeyboard({
        locale: input.locale,
        item,
        page,
        supportLink,
      }),
    });
    return sent ? null : message;
  }

  const page = Number.parseInt(input.primary || '1', 10) || 1;
  const message = buildTelegramPremiumHubMessage({
    locale: input.locale,
    items,
    requestCount: requests.length,
    page,
  });
  const sent = await input.sendTelegramMessage(input.botToken, input.chatId, message, {
    replyMarkup: buildTelegramPremiumHubKeyboard({
      locale: input.locale,
      items,
      page,
      supportLink,
    }),
  });
  return sent ? null : message;
}

export async function handleTelegramPremiumSupportStatusCommerceView(input: {
  chatId: number;
  telegramUserId: number;
  locale: SupportedLocale;
  botToken: string;
  action: 'home' | 'page' | 'detail';
  primary?: string | null;
  secondary?: string | null;
  getTelegramSupportLink: () => Promise<string | null>;
  sendTelegramMessage: (
    botToken: string,
    chatId: number | string,
    text: string,
    options?: {
      parseMode?: 'HTML' | 'Markdown';
      replyMarkup?: Record<string, unknown>;
      disableWebPagePreview?: boolean;
    },
  ) => Promise<boolean>;
}) {
  const ui = getTelegramUi(input.locale);
  const supportLink = await input.getTelegramSupportLink();
  const requests = await listTelegramPremiumSupportRequestsForUser(
    input.chatId,
    input.telegramUserId,
    12,
  );
  if (requests.length === 0) {
    return ui.premiumStatusEmpty;
  }

  if (input.action === 'detail') {
    const request = requests.find((candidate) => candidate.id === input.primary);
    if (!request) {
      return ui.premiumStatusEmpty;
    }
    const page = Number.parseInt(input.secondary || '1', 10) || 1;
    const message = buildTelegramPremiumSupportStatusMessage({
      locale: input.locale,
      request,
    });
    const sent = await input.sendTelegramMessage(input.botToken, input.chatId, message, {
      replyMarkup: buildTelegramPremiumStatusDetailKeyboard({
        locale: input.locale,
        request,
        supportLink,
        page,
      }),
    });
    return sent ? null : message;
  }

  const items: TelegramPremiumSupportListItem[] = requests.map((request) => {
    const latestReply = request.replies?.[request.replies.length - 1] || null;
    return {
      id: request.id,
      requestCode: request.requestCode,
      keyName: request.dynamicAccessKey.name,
      requestTypeLabel: formatTelegramPremiumSupportTypeLabel(request.requestType, ui),
      statusLabel: formatTelegramPremiumSupportStatusLabel(request.status, ui),
      threadStateLabel: formatTelegramPremiumFollowUpState(request, ui),
      replyStateLabel: formatTelegramReplyStateLabel({
        status: request.status,
        latestReplySenderType: latestReply?.senderType || null,
        followUpPending: request.followUpPending,
        locale: input.locale,
      }),
      createdAtLabel: formatTelegramDateTime(request.createdAt, input.locale),
    };
  });
  const page = Number.parseInt(input.primary || '1', 10) || 1;
  const message = buildTelegramPremiumSupportListMessage({
    locale: input.locale,
    items,
    page,
  });
  const sent = await input.sendTelegramMessage(input.botToken, input.chatId, message, {
    replyMarkup: buildTelegramPremiumSupportListKeyboard({
      locale: input.locale,
      items,
      page,
      supportLink,
    }),
  });
  return sent ? null : message;
}

export async function handleTelegramPremiumRegionCommerceView(input: {
  chatId: number;
  telegramUserId: number;
  locale: SupportedLocale;
  botToken: string;
  action: 'home' | 'page';
  primary?: string | null;
  getTelegramSupportLink: () => Promise<string | null>;
  findLinkedDynamicAccessKeys: (
    chatId: number,
    telegramUserId: number,
    includeDisabled?: boolean,
  ) => Promise<Array<PremiumMessagingKey & { status: string }>>;
  sendTelegramMessage: (
    botToken: string,
    chatId: number | string,
    text: string,
    options?: {
      parseMode?: 'HTML' | 'Markdown';
      replyMarkup?: Record<string, unknown>;
      disableWebPagePreview?: boolean;
    },
  ) => Promise<boolean>;
}) {
  const ui = getTelegramUi(input.locale);
  const supportLink = await input.getTelegramSupportLink();
  const dynamicKeys = (await input.findLinkedDynamicAccessKeys(
    input.chatId,
    input.telegramUserId,
    true,
  )).filter((key) => ['ACTIVE', 'PENDING', 'DISABLED'].includes(key.status));
  if (dynamicKeys.length === 0) {
    return ui.premiumRegionStatusEmpty;
  }

  const allServerIds = Array.from(
    new Set(
      dynamicKeys.flatMap((key) =>
        key.accessKeys
          .map((accessKey) => accessKey.server?.id || null)
          .filter((serverId): serverId is string => Boolean(serverId)),
      ),
    ),
  );
  const healthChecks = allServerIds.length
    ? await db.healthCheck.findMany({
        where: { serverId: { in: allServerIds } },
        select: {
          serverId: true,
          lastStatus: true,
          lastLatencyMs: true,
          lastCheckedAt: true,
          latencyThresholdMs: true,
          server: { select: { id: true, name: true, countryCode: true } },
        },
      })
    : [];
  const healthByServerId = new Map(healthChecks.map((entry) => [entry.serverId, entry]));
  const latestRoutingEvents = await getLatestPremiumRoutingEventsByKeyIds(dynamicKeys.map((key) => key.id));
  const page = Math.min(Math.max(Number.parseInt(input.primary || '1', 10) || 1, 1), dynamicKeys.length);
  const key = dynamicKeys[page - 1];
  const analysis = summarizePremiumRegions(key, healthByServerId);
  const latestRoutingEvent = latestRoutingEvents.get(key.id) || null;
  const message = buildTelegramPremiumRegionDetailMessage({
    locale: input.locale,
    key,
    analysis,
    latestRoutingEvent,
    index: page,
    total: dynamicKeys.length,
  });
  const sent = await input.sendTelegramMessage(input.botToken, input.chatId, message, {
    replyMarkup: buildTelegramPremiumRegionKeyboard({
      locale: input.locale,
      keyId: key.id,
      page,
      totalItems: dynamicKeys.length,
      supportLink,
    }),
  });

  return sent ? null : message;
}

const PREMIUM_REGION_LOOKBACK_MS = 48 * 60 * 60_000;
const PREMIUM_REGION_DEGRADE_CONFIRM_MS = 30 * 60_000;
const PREMIUM_REGION_AUTO_FALLBACK_MINUTES = 8 * 60;

type PremiumRegionCycleEvent = {
  id: string;
  dynamicAccessKeyId: string;
  eventType: string;
  createdAt: Date;
  reason: string;
  metadata: Record<string, unknown> | null;
};

function parsePremiumRegionEventMetadata(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function getPremiumCycleEventsForKey(
  eventsByKeyId: Map<string, PremiumRegionCycleEvent[]>,
  dynamicAccessKeyId: string,
) {
  return eventsByKeyId.get(dynamicAccessKeyId) ?? [];
}

function getLatestPremiumCycleEvent(
  events: PremiumRegionCycleEvent[],
  eventType: string,
) {
  return events.find((event) => event.eventType === eventType) ?? null;
}

function getActiveAutoFallbackEvent(input: {
  events: PremiumRegionCycleEvent[];
  pinnedAccessKeyId: string | null;
  pinnedServerId: string | null;
}) {
  return input.events.find((event) => {
    if (event.eventType !== DYNAMIC_ROUTING_EVENT_TYPES.AUTO_FALLBACK_PIN_APPLIED) {
      return false;
    }
    const metadata = event.metadata || {};
    const metadataServerId =
      typeof metadata.pinnedServerId === 'string' ? metadata.pinnedServerId : null;
    const metadataAccessKeyId =
      typeof metadata.pinnedAccessKeyId === 'string' ? metadata.pinnedAccessKeyId : null;

    return (
      (!!input.pinnedServerId && metadataServerId === input.pinnedServerId) ||
      (!!input.pinnedAccessKeyId && metadataAccessKeyId === input.pinnedAccessKeyId)
    );
  }) ?? null;
}

async function applyTelegramPremiumFallbackPin(input: {
  key: PremiumMessagingKey;
  target: PremiumFallbackTarget;
  analysis: PremiumRegionAnalysis;
  incidentKey: string;
  locale: SupportedLocale;
}) {
  const pinnedAt = new Date();
  const pinExpiresAt = new Date(pinnedAt.getTime() + PREMIUM_REGION_AUTO_FALLBACK_MINUTES * 60_000);
  await db.dynamicAccessKey.update({
    where: { id: input.key.id },
    data: {
      pinnedAccessKeyId: input.target.accessKeyId,
      pinnedServerId: input.target.serverId,
      pinnedAt,
      pinExpiresAt,
    },
  });

  await recordDynamicRoutingEvent({
    dynamicAccessKeyId: input.key.id,
    eventType: DYNAMIC_ROUTING_EVENT_TYPES.AUTO_FALLBACK_PIN_APPLIED,
    severity: input.analysis.currentSummary?.status === 'DOWN' ? 'CRITICAL' : 'WARNING',
    reason: `Pinned premium routing to fallback ${input.target.serverName} (${input.target.regionCode}) while ${input.analysis.currentSummary?.regionCode || 'preferred'} routing remains degraded.`,
    fromServerId: input.analysis.currentServer?.id || null,
    fromServerName: input.analysis.currentServer?.name || null,
    toKeyId: input.target.accessKeyId,
    toKeyName: input.target.accessKeyName,
    toServerId: input.target.serverId,
    toServerName: input.target.serverName,
    metadata: {
      incidentKey: input.incidentKey,
      preferredRegions: input.analysis.preferredRegions,
      impactedRegionCode: getPremiumIncidentRegionCode(input.analysis),
      fallbackRegionCode: input.target.regionCode,
      pinnedServerId: input.target.serverId,
      pinnedAccessKeyId: input.target.accessKeyId,
      serverName: input.target.serverName,
      accessKeyName: input.target.accessKeyName,
      pinExpiresAt: pinExpiresAt.toISOString(),
      automatic: true,
      locale: input.locale,
    },
  });

  return {
    pinnedAt,
    pinExpiresAt,
  };
}

function buildTelegramPremiumRegionAlertMessage(input: {
  locale: SupportedLocale;
  keyName: string;
  analysis: PremiumRegionAnalysis;
}) {
  const ui = getTelegramUi(input.locale);
  const lines = [ui.premiumRegionAlertTitle, ''];

  lines.push(`• <b>${escapeHtml(input.keyName)}</b>`);
  lines.push(
    `${ui.premiumRegionPreferredLabel}: ${
      input.analysis.preferredRegions.length
        ? escapeHtml(input.analysis.preferredRegions.join(', '))
        : escapeHtml(ui.premiumRegionNoAttached)
    }`,
  );
  lines.push(
    `${ui.premiumRegionAlertCurrentLabel}: ${
      input.analysis.currentSummary
        ? escapeHtml(formatPremiumRegionSummaryLine(input.analysis.currentSummary, ui))
        : escapeHtml(ui.premiumRegionUnknownStatus)
    }`,
  );

  if (input.analysis.suggestedFallbacks.length > 0) {
    lines.push(
      `${ui.premiumRegionAlertSuggestedLabel}: ${escapeHtml(
        input.analysis.suggestedFallbacks
          .map((entry) => formatPremiumRegionSummaryLine(entry, ui))
          .join(' | '),
      )}`,
      '',
      ui.premiumRegionAlertHint,
    );
  } else {
    lines.push('', ui.premiumRegionAlertNoFallback, ui.premiumRegionAlertHealthyHint);
  }

  return lines.join('\n');
}

function buildTelegramPremiumFallbackMessage(input: {
  locale: SupportedLocale;
  keyName: string;
  analysis: PremiumRegionAnalysis;
  target: PremiumFallbackTarget;
  pinExpiresAt: Date;
}) {
  const ui = getTelegramUi(input.locale);
  const preferredLabel = input.analysis.preferredRegions.length
    ? input.analysis.preferredRegions.join(', ')
    : (input.analysis.currentSummary?.regionCode || ui.premiumRegionUnknownStatus);

  return [
    ui.premiumRegionFallbackTitle,
    '',
    `• <b>${escapeHtml(input.keyName)}</b>`,
    `${ui.premiumRegionPreferredLabel}: ${escapeHtml(preferredLabel)}`,
    `${ui.premiumRegionAlertCurrentLabel}: ${
      input.analysis.currentSummary
        ? escapeHtml(formatPremiumRegionSummaryLine(input.analysis.currentSummary, ui))
        : escapeHtml(ui.premiumRegionUnknownStatus)
    }`,
    `${ui.premiumRegionFallbackAppliedLabel}: <b>${escapeHtml(
      `${getFlagEmoji(input.target.regionCode)} ${input.target.regionCode} • ${input.target.serverName}`,
    )}</b>`,
    `${ui.premiumRegionFallbackUntilLabel}: ${escapeHtml(
      formatTelegramDateTime(input.pinExpiresAt, input.locale),
    )}`,
    '',
    ui.premiumRegionFallbackHint,
  ].join('\n');
}

function buildTelegramPremiumRecoveryMessage(input: {
  locale: SupportedLocale;
  keyName: string;
  analysis: PremiumRegionAnalysis;
  currentPinnedRegionCode?: string | null;
  currentPinnedServerName?: string | null;
  recoveryMinutes?: number | null;
}) {
  const ui = getTelegramUi(input.locale);
  const healthyPreferred = getPremiumHealthyPreferredRegions(input.analysis);
  const preferredLabel = healthyPreferred.length > 0
    ? healthyPreferred.join(', ')
    : (input.analysis.preferredRegions.join(', ') || ui.premiumRegionUnknownStatus);

  const lines = [
    ui.premiumRegionRecoveredTitle,
    '',
    `• <b>${escapeHtml(input.keyName)}</b>`,
    `${ui.premiumRegionRecoveredLabel}: <b>${escapeHtml(preferredLabel)}</b>`,
  ];

  if (input.currentPinnedRegionCode || input.currentPinnedServerName) {
    lines.push(
      `${ui.premiumRegionCurrentFallbackLabel}: <b>${escapeHtml(
        [
          input.currentPinnedRegionCode ? `${getFlagEmoji(input.currentPinnedRegionCode)} ${input.currentPinnedRegionCode}` : null,
          input.currentPinnedServerName || null,
        ]
          .filter(Boolean)
          .join(' • '),
      )}</b>`,
    );
  }

  if (typeof input.recoveryMinutes === 'number' && Number.isFinite(input.recoveryMinutes)) {
    lines.push(`${ui.premiumRegionRecoveryTimeLabel}: ${escapeHtml(`${Math.max(1, Math.round(input.recoveryMinutes))} min`)}`);
  }

  lines.push('', ui.premiumRegionRecoveredHint);

  return lines.join('\n');
}

export async function runTelegramPremiumRegionAlertCycle() {
  const config = await getTelegramConfig();
  if (!config?.botToken) {
    return {
      skipped: true,
      scanned: 0,
      alerted: 0,
      deduped: 0,
      fallbackPinned: 0,
      recovered: 0,
      skippedNoDestination: 0,
      skippedPreferences: 0,
      skippedHealthy: 0,
      errors: [] as string[],
    };
  }

  const supportLink = await getTelegramSupportLink();
  const now = new Date();
  const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60_000);
  const lookbackCutoff = new Date(now.getTime() - PREMIUM_REGION_LOOKBACK_MS);
  const premiumKeys = await db.dynamicAccessKey.findMany({
    where: {
      status: 'ACTIVE',
      OR: [{ telegramId: { not: null } }, { user: { telegramChatId: { not: null } } }],
      accessKeys: {
        some: {},
      },
    },
    include: {
      user: {
        select: {
          id: true,
          telegramChatId: true,
        },
      },
      accessKeys: {
        include: {
          server: true,
        },
      },
    },
  });
  const premiumKeyIds = premiumKeys.map((key) => key.id);

  const allServerIds = Array.from(
    new Set(
      premiumKeys.flatMap((key) =>
        key.accessKeys
          .map((accessKey) => accessKey.server?.id || null)
          .filter((serverId): serverId is string => Boolean(serverId)),
      ),
    ),
  );
  const healthChecks = allServerIds.length
    ? await db.healthCheck.findMany({
        where: {
          serverId: { in: allServerIds },
        },
        select: {
          serverId: true,
          lastStatus: true,
          lastLatencyMs: true,
          lastCheckedAt: true,
          latencyThresholdMs: true,
          server: {
            select: {
              id: true,
              name: true,
              countryCode: true,
            },
          },
        },
      })
    : [];
  const healthByServerId = new Map(healthChecks.map((entry) => [entry.serverId, entry]));
  const recentEvents = premiumKeyIds.length
    ? await db.dynamicRoutingEvent.findMany({
        where: {
          dynamicAccessKeyId: { in: premiumKeyIds },
          eventType: {
            in: [
              DYNAMIC_ROUTING_EVENT_TYPES.PREFERRED_REGION_DEGRADED,
              DYNAMIC_ROUTING_EVENT_TYPES.PREFERRED_REGION_RECOVERED,
              DYNAMIC_ROUTING_EVENT_TYPES.AUTO_FALLBACK_PIN_APPLIED,
              DYNAMIC_ROUTING_EVENT_TYPES.PIN_CLEARED,
            ],
          },
          createdAt: { gte: lookbackCutoff },
        },
        orderBy: [{ createdAt: 'desc' }],
        select: {
          id: true,
          dynamicAccessKeyId: true,
          eventType: true,
          createdAt: true,
          reason: true,
          metadata: true,
        },
      })
    : [];
  const eventsByKeyId = new Map<string, PremiumRegionCycleEvent[]>();
  for (const event of recentEvents) {
    const mapped: PremiumRegionCycleEvent = {
      id: event.id,
      dynamicAccessKeyId: event.dynamicAccessKeyId,
      eventType: event.eventType,
      createdAt: event.createdAt,
      reason: event.reason,
      metadata: parsePremiumRegionEventMetadata(event.metadata),
    };
    const list = eventsByKeyId.get(event.dynamicAccessKeyId);
    if (list) {
      list.push(mapped);
    } else {
      eventsByKeyId.set(event.dynamicAccessKeyId, [mapped]);
    }
  }

  const result = {
    skipped: false,
    scanned: premiumKeys.length,
    alerted: 0,
    deduped: 0,
    fallbackPinned: 0,
    recovered: 0,
    skippedNoDestination: 0,
    skippedPreferences: 0,
    skippedHealthy: 0,
    errors: [] as string[],
  };

  for (const key of premiumKeys) {
    try {
      const destinationChatId = resolveTelegramChatIdForDynamicKey(key);
      if (!destinationChatId) {
        result.skippedNoDestination += 1;
        continue;
      }

      const locale = await resolveTelegramLocaleForRecipient({
        telegramUserId: key.telegramId || String(destinationChatId),
        telegramChatId: String(destinationChatId),
        fallbackLocale: 'en',
      });
      const ui = getTelegramUi(locale);
      const preferences = await getTelegramNotificationPreferences({
        telegramUserId: key.telegramId || String(destinationChatId),
        telegramChatId: String(destinationChatId),
      });
      const canSendOperationalNotice = preferences.maintenance || preferences.support;
      if (!canSendOperationalNotice) {
        result.skippedPreferences += 1;
      }

      const analysis = summarizePremiumRegions(key, healthByServerId);
      const pinState = await resolveDynamicPinState({
        dynamicAccessKeyId: key.id,
        pinnedAccessKeyId: key.pinnedAccessKeyId,
        pinnedServerId: key.pinnedServerId,
        pinnedAt: key.pinnedAt,
        pinExpiresAt: key.pinExpiresAt,
      });
      const keyEvents = getPremiumCycleEventsForKey(eventsByKeyId, key.id);
      const latestDegraded = getLatestPremiumCycleEvent(
        keyEvents,
        DYNAMIC_ROUTING_EVENT_TYPES.PREFERRED_REGION_DEGRADED,
      );
      const latestRecovered = getLatestPremiumCycleEvent(
        keyEvents,
        DYNAMIC_ROUTING_EVENT_TYPES.PREFERRED_REGION_RECOVERED,
      );
      const activeAutoFallback = getActiveAutoFallbackEvent({
        events: keyEvents,
        pinnedAccessKeyId: pinState.pinnedAccessKeyId,
        pinnedServerId: pinState.pinnedServerId,
      });

      if (!shouldAlertForPremiumRegionDegradation(analysis)) {
        const healthyPreferredRegions = getPremiumHealthyPreferredRegions(analysis);
        const degradationStillOpen =
          latestDegraded &&
          (!latestRecovered || latestRecovered.createdAt < latestDegraded.createdAt);

        if (!degradationStillOpen || healthyPreferredRegions.length === 0) {
          result.skippedHealthy += 1;
          continue;
        }

        const preferredRegionCode = healthyPreferredRegions[0];
        const recoveryMinutes = Math.max(
          1,
          Math.round((now.getTime() - latestDegraded.createdAt.getTime()) / 60_000),
        );
        const autoFallbackMetadata = activeAutoFallback?.metadata || {};
        const currentPinnedRegionCode =
          typeof autoFallbackMetadata.fallbackRegionCode === 'string'
            ? autoFallbackMetadata.fallbackRegionCode
            : null;
        const currentPinnedServerName =
          typeof autoFallbackMetadata.toServerName === 'string'
            ? autoFallbackMetadata.toServerName
            : (typeof autoFallbackMetadata.serverName === 'string' ? autoFallbackMetadata.serverName : null);

        const incidentKey =
          typeof latestDegraded.metadata?.incidentKey === 'string'
            ? latestDegraded.metadata.incidentKey
            : buildPremiumIncidentKey(preferredRegionCode, latestDegraded.createdAt);
        let alertedViaTelegram = false;
        if (canSendOperationalNotice) {
          const recoveryMessage = buildTelegramPremiumRecoveryMessage({
            locale,
            keyName: key.name,
            analysis,
            currentPinnedRegionCode,
            currentPinnedServerName,
            recoveryMinutes,
          });
          const recoveryKeyboard =
            healthyPreferredRegions.length > 0 || supportLink
              ? buildTelegramDynamicPremiumRegionKeyboard({
                  dynamicAccessKeyId: key.id,
                  locale,
                  regionCodes: healthyPreferredRegions.length > 0 ? healthyPreferredRegions : analysis.preferredRegions,
                  supportLink,
                })
              : undefined;
          const sent = await sendTelegramMessage(config.botToken, destinationChatId, recoveryMessage, {
            replyMarkup: recoveryKeyboard,
            disableWebPagePreview: true,
          });
          if (!sent) {
            result.errors.push(`Failed to send premium recovery notice for ${key.id}`);
          } else {
            alertedViaTelegram = true;
          }
        }

        await recordDynamicRoutingEvent({
          dynamicAccessKeyId: key.id,
          eventType: DYNAMIC_ROUTING_EVENT_TYPES.PREFERRED_REGION_RECOVERED,
          severity: 'INFO',
          reason: `Preferred premium region ${preferredRegionCode} is healthy again after ${recoveryMinutes} minutes.`,
          fromServerId: pinState.pinnedServerId,
          toServerId: pinState.pinnedServerId,
          toServerName: currentPinnedServerName,
          metadata: {
            incidentKey,
            preferredRegionCode,
            healthyPreferredRegions,
            currentPinnedRegionCode,
            currentPinnedServerName,
            recoveryMinutes,
            suggestedMoveBackRegions: healthyPreferredRegions,
            alertedViaTelegram,
          },
        });
        result.recovered += 1;
        continue;
      }

      if (!latestDegraded || latestDegraded.createdAt < sixHoursAgo) {
        const incidentKey = buildPremiumIncidentKey(getPremiumIncidentRegionCode(analysis), now);
        let alertedViaTelegram = false;
        if (canSendOperationalNotice) {
          const alertText = buildTelegramPremiumRegionAlertMessage({
            locale,
            keyName: key.name,
            analysis,
          });
          const alertKeyboard =
            analysis.suggestedFallbacks.length > 0 || analysis.preferredRegions.length > 0
              ? buildTelegramDynamicPremiumRegionKeyboard({
                  dynamicAccessKeyId: key.id,
                  locale,
                  regionCodes:
                    (analysis.suggestedFallbacks.length > 0
                      ? analysis.suggestedFallbacks.map((entry) => entry.regionCode)
                      : analysis.preferredRegions
                    ).slice(0, 6),
                  supportLink,
                })
              : supportLink
                ? { inline_keyboard: [[{ text: ui.getSupport, url: supportLink }]] }
                : undefined;

          const sent = await sendTelegramMessage(config.botToken, destinationChatId, alertText, {
            replyMarkup: alertKeyboard,
            disableWebPagePreview: true,
          });
          if (!sent) {
            result.errors.push(`Failed to send premium region alert for ${key.id}`);
          } else {
            alertedViaTelegram = true;
            result.alerted += 1;
          }
        }

        await recordDynamicRoutingEvent({
          dynamicAccessKeyId: key.id,
          eventType: DYNAMIC_ROUTING_EVENT_TYPES.PREFERRED_REGION_DEGRADED,
          severity: analysis.currentSummary?.status === 'DOWN' ? 'CRITICAL' : 'WARNING',
          reason: analysis.currentSummary
            ? `Preferred/current premium region degraded: ${formatPremiumRegionSummaryLine(analysis.currentSummary, ui)}`
            : 'Preferred premium routing region degraded.',
          metadata: {
            incidentKey,
            destinationChatId: String(destinationChatId),
            currentRegionCode: analysis.currentSummary?.regionCode || null,
            currentStatus: analysis.currentSummary?.status || null,
            currentLatencyMs: analysis.currentSummary?.latencyMs ?? null,
            preferredRegions: analysis.preferredRegions,
            suggestedFallbackRegions: analysis.suggestedFallbacks.map((entry) => entry.regionCode),
            alertedViaTelegram,
          },
        });
        await db.dynamicAccessKey.update({
          where: { id: key.id },
          data: { lastRoutingAlertAt: now },
        });
        continue;
      }

      result.deduped += 1;
      const degradationStillOpen =
        !latestRecovered || latestRecovered.createdAt < latestDegraded.createdAt;
      const degradedLongEnough =
        degradationStillOpen &&
        now.getTime() - latestDegraded.createdAt.getTime() >= PREMIUM_REGION_DEGRADE_CONFIRM_MS;
      const hasPinnedBackend = Boolean(pinState.pinnedAccessKeyId || pinState.pinnedServerId);
      const hasManualPin = hasPinnedBackend && !activeAutoFallback;
      const fallbackTarget = selectPremiumFallbackTarget(key, healthByServerId, analysis);

      if (!degradedLongEnough || !fallbackTarget || hasManualPin || activeAutoFallback) {
        continue;
      }

      const incidentKey =
        typeof latestDegraded.metadata?.incidentKey === 'string'
          ? latestDegraded.metadata.incidentKey
          : buildPremiumIncidentKey(getPremiumIncidentRegionCode(analysis), latestDegraded.createdAt);
      const { pinExpiresAt } = await applyTelegramPremiumFallbackPin({
        key,
        target: fallbackTarget,
        analysis,
        incidentKey,
        locale,
      });

      if (canSendOperationalNotice) {
        const fallbackMessage = buildTelegramPremiumFallbackMessage({
          locale,
          keyName: key.name,
          analysis,
          target: fallbackTarget,
          pinExpiresAt,
        });
        const fallbackKeyboard = buildTelegramDynamicPremiumSupportKeyboard(
          key.id,
          locale,
          supportLink,
        );
        const sent = await sendTelegramMessage(config.botToken, destinationChatId, fallbackMessage, {
          replyMarkup: fallbackKeyboard,
          disableWebPagePreview: true,
        });
        if (!sent) {
          result.errors.push(`Failed to send premium fallback notice for ${key.id}`);
        }
      }

      await db.dynamicAccessKey.update({
        where: { id: key.id },
        data: { lastRoutingAlertAt: now },
      });
      result.fallbackPinned += 1;
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : 'Unknown premium region alert error');
    }
  }

  return result;
}

export async function handlePremiumSupportFollowUpText(input: {
  chatId: number;
  telegramUserId: number;
  username: string;
  locale: SupportedLocale;
  botToken: string;
  text: string;
  getTelegramPendingPremiumReply: (input: {
    telegramUserId: string;
    telegramChatId?: string | null;
  }) => Promise<{ requestId: string; startedAt: Date | null } | null>;
  setTelegramPendingPremiumReply: (input: {
    telegramUserId: string;
    telegramChatId?: string | null;
    requestId?: string | null;
  }) => Promise<unknown>;
  getTelegramSupportLink: () => Promise<string | null>;
  sendTelegramPremiumSupportFollowUpAlert: (input: {
    requestId: string;
    requestCode: string;
    dynamicAccessKeyId: string;
    telegramChatId: string;
    telegramUserId: string;
    telegramUsername?: string | null;
    locale: SupportedLocale;
    message: string;
  }) => Promise<void>;
  sendTelegramMessage: (
    botToken: string,
    chatId: number | string,
    text: string,
    options?: {
      parseMode?: 'HTML' | 'Markdown';
      replyMarkup?: Record<string, unknown>;
      disableWebPagePreview?: boolean;
    },
  ) => Promise<boolean>;
}) {
  const pending = await input.getTelegramPendingPremiumReply({
    telegramUserId: String(input.telegramUserId),
    telegramChatId: String(input.chatId),
  });
  if (!pending) {
    return null;
  }

  const ui = getTelegramUi(input.locale);
  const supportLink = await input.getTelegramSupportLink();
  const request = await findTelegramPremiumSupportRequestByIdForUser({
    requestId: pending.requestId,
    chatId: input.chatId,
    telegramUserId: input.telegramUserId,
  });

  if (!request || request.status === 'DISMISSED') {
    await input.setTelegramPendingPremiumReply({
      telegramUserId: String(input.telegramUserId),
      telegramChatId: String(input.chatId),
      requestId: null,
    });
    return ui.premiumFollowUpNotAllowed;
  }

  await addTelegramPremiumSupportReply({
    requestId: request.id,
    senderType: 'CUSTOMER',
    telegramUserId: String(input.telegramUserId),
    telegramUsername: input.username || null,
    senderName: input.username || null,
    message: input.text,
    markPending: true,
  });

  await input.setTelegramPendingPremiumReply({
    telegramUserId: String(input.telegramUserId),
    telegramChatId: String(input.chatId),
    requestId: null,
  });

  await input.sendTelegramPremiumSupportFollowUpAlert({
    requestId: request.id,
    requestCode: request.requestCode,
    dynamicAccessKeyId: request.dynamicAccessKeyId,
    telegramChatId: request.telegramChatId,
    telegramUserId: request.telegramUserId,
    telegramUsername: request.telegramUsername || input.username,
    locale: input.locale,
    message: input.text,
  });

  await input.sendTelegramMessage(
    input.botToken,
    input.chatId,
    ui.premiumFollowUpSubmitted(request.requestCode),
    {
      replyMarkup:
        request.status === 'PENDING_REVIEW'
          ? buildTelegramDynamicPremiumPendingKeyboard({
              dynamicAccessKeyId: request.dynamicAccessKeyId,
              requestId: request.id,
              locale: input.locale,
              supportLink,
            })
          : buildTelegramDynamicPremiumSupportKeyboard(
              request.dynamicAccessKeyId,
              input.locale,
              supportLink,
              request.id,
            ),
    },
  );

  await writeAuditLog({
    action: 'TELEGRAM_PREMIUM_SUPPORT_FOLLOW_UP',
    entity: 'TELEGRAM_PREMIUM_SUPPORT_REQUEST',
    entityId: request.id,
    details: {
      requestCode: request.requestCode,
      dynamicAccessKeyId: request.dynamicAccessKeyId,
      telegramChatId: request.telegramChatId,
      telegramUserId: request.telegramUserId,
    },
  });

  return null;
}

type LatestPremiumRoutingEvent = {
  dynamicAccessKeyId: string;
  eventType: string;
  reason: string;
  createdAt: Date;
};

async function getLatestPremiumRoutingEventsByKeyIds(dynamicAccessKeyIds: string[]) {
  if (dynamicAccessKeyIds.length === 0) {
    return new Map<string, LatestPremiumRoutingEvent>();
  }

  const events = await db.dynamicRoutingEvent.findMany({
    where: {
      dynamicAccessKeyId: { in: dynamicAccessKeyIds },
    },
    orderBy: [{ createdAt: 'desc' }],
    select: {
      dynamicAccessKeyId: true,
      eventType: true,
      reason: true,
      createdAt: true,
    },
  });

  const map = new Map<string, LatestPremiumRoutingEvent>();
  for (const event of events) {
    if (!map.has(event.dynamicAccessKeyId)) {
      map.set(event.dynamicAccessKeyId, event);
    }
  }

  return map;
}

function formatTelegramPremiumRoutingEventTypeLabel(eventType: string, locale: SupportedLocale) {
  switch (eventType) {
    case DYNAMIC_ROUTING_EVENT_TYPES.PREFERRED_REGION_DEGRADED:
      return locale === 'my' ? 'Preferred region degraded' : 'Preferred region degraded';
    case DYNAMIC_ROUTING_EVENT_TYPES.PREFERRED_REGION_RECOVERED:
      return locale === 'my' ? 'Preferred region recovered' : 'Preferred region recovered';
    case DYNAMIC_ROUTING_EVENT_TYPES.AUTO_FALLBACK_PIN_APPLIED:
      return locale === 'my' ? 'Auto fallback pinned' : 'Auto fallback pinned';
    case DYNAMIC_ROUTING_EVENT_TYPES.PIN_APPLIED:
      return locale === 'my' ? 'Manual pin applied' : 'Manual pin applied';
    case DYNAMIC_ROUTING_EVENT_TYPES.PIN_CLEARED:
      return locale === 'my' ? 'Pin cleared' : 'Pin cleared';
    case DYNAMIC_ROUTING_EVENT_TYPES.BACKEND_SWITCH:
      return locale === 'my' ? 'Route switched' : 'Route switched';
    case DYNAMIC_ROUTING_EVENT_TYPES.AUTO_RECOVERY:
      return locale === 'my' ? 'Auto recovery' : 'Auto recovery';
    default:
      return locale === 'my' ? 'Routing update' : 'Routing update';
  }
}

function formatTelegramPremiumRoutingEventSummary(
  event: LatestPremiumRoutingEvent | null | undefined,
  locale: SupportedLocale,
) {
  if (!event) {
    return locale === 'my' ? 'No recent routing event' : 'No recent routing event';
  }

  const reason = event.reason.trim();
  const summary = reason.length > 96 ? `${reason.slice(0, 93)}...` : reason;
  return `${formatTelegramPremiumRoutingEventTypeLabel(event.eventType, locale)} • ${formatTelegramDateTime(event.createdAt, locale)}${summary ? ` • ${summary}` : ''}`;
}
