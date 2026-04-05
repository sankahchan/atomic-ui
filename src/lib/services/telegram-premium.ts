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
  buildTelegramDynamicSupportActionCallbackData,
} from '@/lib/services/telegram-callbacks';
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
  buildTelegramLatestReplyPreviewLines,
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

function truncateTelegramButtonLabel(value: string, maxLength = 28) {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength - 1)}…`;
}

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
        text: truncateTelegramButtonLabel(`${getFlagEmoji(countryCode)} ${countryCode}`, 38),
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
  const { request } = input;
  const poolSummary = formatTelegramDynamicPoolSummary(request.dynamicAccessKey, ui);
  const latestReply = request.replies?.[request.replies.length - 1] || null;
  const currentState = formatTelegramPremiumFollowUpState(request, ui);
  const followUpIndicator = formatTelegramReplyStateLabel({
    latestReplySenderType: latestReply?.senderType || null,
    followUpPending: request.followUpPending,
    locale: input.locale,
  });
  const lines = [
    ui.premiumStatusTitle,
    '',
    `${request.requestCode} • ${formatTelegramPremiumSupportStatusLabel(request.status, ui)}`,
    '',
    `${ui.premiumRequestCodeLabel}: <b>${escapeHtml(request.requestCode)}</b>`,
    `${ui.keyLabel}: <b>${escapeHtml(request.dynamicAccessKey.name)}</b>`,
    `${ui.premiumRequestType}: <b>${escapeHtml(
      formatTelegramPremiumSupportTypeLabel(request.requestType, ui),
    )}</b>`,
    `${ui.statusLineLabel}: <b>${escapeHtml(
      formatTelegramPremiumSupportStatusLabel(request.status, ui),
    )}</b>`,
    `${ui.premiumThreadStatusLabel}: <b>${escapeHtml(currentState)}</b>`,
    `${escapeHtml(followUpIndicator)}`,
    `${ui.createdAtLabel}: ${escapeHtml(formatTelegramDateTime(request.createdAt, input.locale))}`,
    `${ui.premiumCurrentPoolLabel}: <b>${escapeHtml(poolSummary)}</b>`,
  ];

  if (request.requestedRegionCode) {
    lines.push(`${ui.premiumRequestedRegionLabel}: <b>${escapeHtml(request.requestedRegionCode)}</b>`);
  }

  if (request.currentResolvedServerName || request.currentResolvedServerCountryCode) {
    lines.push(
      `${ui.premiumResolvedServer}: <b>${escapeHtml(
        request.currentResolvedServerName ||
          request.currentResolvedServerCountryCode ||
          ui.premiumNoRequestedRegion,
      )}</b>`,
    );
  }

  const updatedAt =
    request.dismissedAt || request.handledAt || request.reviewedAt || request.updatedAt || null;
  if (updatedAt) {
    lines.push(
      `${ui.premiumStatusUpdatedLabel}: ${escapeHtml(
        formatTelegramDateTime(updatedAt, input.locale),
      )}`,
    );
  }

  if (request.appliedPinServerName) {
    const pinSummary = request.appliedPinExpiresAt
      ? `${request.appliedPinServerName} (${formatTelegramDateTime(
          request.appliedPinExpiresAt,
          input.locale,
        )})`
      : request.appliedPinServerName;
    lines.push(`${ui.premiumCurrentPin}: <b>${escapeHtml(pinSummary)}</b>`);
  }

  if (request.customerMessage?.trim()) {
    lines.push('', `${ui.customerMessage}:`, escapeHtml(request.customerMessage.trim()));
  }

  if (latestReply) {
    lines.push('', '<b>💬 Latest reply</b>');
    lines.push(
      ...buildTelegramLatestReplyPreviewLines({
        reply: latestReply,
        locale: input.locale,
        maxLength: 280,
      }).map((line) => escapeHtml(line)),
    );
  }

  lines.push(
    '',
    `<b>${input.locale === 'my' ? 'What happens next' : 'What happens next'}</b>`,
    escapeHtml(
      request.status === 'PENDING_REVIEW'
        ? input.locale === 'my'
          ? 'Admin review စောင့်ပါ။ လိုအပ်ပါက screenshot သို့မဟုတ် extra detail တောင်းနိုင်ပါသည်။'
          : 'Wait for admin review. If needed, the admin may ask for more detail.'
        : currentState === ui.premiumAwaitingYourReply
          ? input.locale === 'my'
            ? 'Admin က reply ပို့ထားပါသည်။ Reply to request ဖြင့် ဆက်ပြောနိုင်ပါသည်။'
            : 'The admin replied. Use Reply to request if you want to continue the same thread.'
          : currentState === ui.premiumAwaitingAdminReply
            ? input.locale === 'my'
              ? 'သင့်နောက်ဆုံး message ကို admin စစ်နေပါသည်။'
              : 'The admin is reviewing your latest message.'
            : input.locale === 'my'
              ? 'လက်ရှိ request ကို status နှင့် history အဖြစ် အောက်တွင် ဆက်လက်ကြည့်နိုင်ပါသည်။'
              : 'You can continue to track the current request status and history below.',
    ),
  );

  lines.push('', `${ui.orderTimelineTitle}:`);
  lines.push(
    `• ${ui.premiumHistorySubmitted} · ${escapeHtml(
      formatTelegramDateTime(request.createdAt, input.locale),
    )}`,
  );
  if (request.reviewedAt) {
    lines.push(
      `• ${ui.premiumHistoryReviewed} · ${escapeHtml(
        formatTelegramDateTime(request.reviewedAt, input.locale),
      )}`,
    );
  }
  if (request.status === 'APPROVED' && request.reviewedAt) {
    lines.push(
      `• ${ui.premiumHistoryApproved} · ${escapeHtml(
        formatTelegramDateTime(request.reviewedAt, input.locale),
      )}`,
    );
  }
  if (request.handledAt) {
    lines.push(
      `• ${ui.premiumHistoryHandled} · ${escapeHtml(
        formatTelegramDateTime(request.handledAt, input.locale),
      )}`,
    );
  }
  if (request.dismissedAt) {
    lines.push(
      `• ${ui.premiumHistoryDismissed} · ${escapeHtml(
        formatTelegramDateTime(request.dismissedAt, input.locale),
      )}`,
    );
  }
  if (request.appliedPinServerName) {
    lines.push(`• ${ui.premiumHistoryPinApplied} · ${escapeHtml(request.appliedPinServerName)}`);
  }

  if (request.replies?.length) {
    lines.push('', `${ui.premiumFollowUpHistoryTitle}:`);
    for (const reply of request.replies.slice(-3)) {
      const senderLabel =
        reply.senderType === 'ADMIN' ? ui.premiumFollowUpFromAdmin : ui.premiumFollowUpFromYou;
      lines.push(
        `• <b>${escapeHtml(senderLabel)}</b> · ${escapeHtml(
          formatTelegramDateTime(reply.createdAt, input.locale),
        )}`,
        `  ${escapeHtml(reply.message)}`,
      );
    }
  }

  lines.push('', `${ui.orderNextStepLabel}: ${escapeHtml(ui.premiumStatusReplyHint)}`);

  return lines.join('\n');
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
  const lines = [
    ui.premiumHubTitle,
    '',
    `${dynamicKeys.length} key(s) • ${recentRequests.length} recent request(s)`,
    '',
    ui.premiumHubHint,
    '',
  ];
  const inlineKeyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [];

  for (const key of dynamicKeys.slice(0, 4)) {
    const poolSummary = formatTelegramDynamicPoolSummary(key, ui);
    const { sharePageUrl } = input.getDynamicKeyMessagingUrls(key, 'telegram_premium', input.locale);
    const latestRequest = recentRequests.find((request) => request.dynamicAccessKeyId === key.id) || null;
    const latestReply = latestRequest?.replies?.[latestRequest.replies.length - 1] || null;
    const analysis = summarizePremiumRegions(key, healthByServerId);
    const latestRoutingEvent = latestRoutingEvents.get(key.id) || null;
    const currentFallback = getPremiumCurrentFallbackRegion(analysis);
    const currentRouteLabel = analysis.currentServer
      ? `${analysis.currentServer.name}${analysis.currentServer.countryCode ? ` ${getFlagEmoji(analysis.currentServer.countryCode)}` : ''}`
      : ui.premiumRegionUnknownStatus;
    const nextStepSummary = latestRequest
      ? latestReply?.senderType === 'ADMIN'
        ? ui.premiumReplyToRequest
        : latestRequest.followUpPending
          ? (input.locale === 'my' ? 'Wait for admin reply' : 'Wait for admin reply')
          : ui.orderActionCheckStatus
      : buildPremiumRecommendedNextStepText(analysis, input.locale);
    lines.push(
      `💎 <b>${escapeHtml(key.name)}</b>`,
      `  ${escapeHtml(formatPremiumOverallStatusLine(analysis, input.locale))}`,
      `  ${ui.statusLineLabel}: ${escapeHtml(key.status)}`,
      `  ${ui.premiumRegionPreferredLabel}: ${escapeHtml(
        analysis.preferredRegions.length ? analysis.preferredRegions.join(', ') : ui.premiumRegionNoAttached,
      )}`,
      `  ${ui.premiumRegionCurrentRouteLabel}: ${escapeHtml(currentRouteLabel)}`,
      currentFallback
        ? `  ${ui.premiumRegionCurrentFallbackLabel}: ${escapeHtml(currentFallback)}`
        : '',
      `  ${ui.premiumCurrentPoolLabel}: ${escapeHtml(poolSummary)}`,
      latestRequest
        ? `  ${ui.premiumThreadStatusLabel}: ${escapeHtml(
            `${latestRequest.requestCode} • ${formatTelegramPremiumFollowUpState(latestRequest, ui)}`,
          )}`
        : '',
      latestReply
        ? `  ${ui.premiumLatestReplyLabel}: ${escapeHtml(
            `${latestReply.senderType === 'ADMIN' ? ui.premiumFollowUpFromAdmin : ui.premiumFollowUpFromYou} • ${formatTelegramDateTime(latestReply.createdAt, input.locale)}`,
          )}`
        : '',
      latestReply
        ? `  ${escapeHtml(latestReply.message.slice(0, 100))}${latestReply.message.length > 100 ? '…' : ''}`
        : '',
      `  ${input.locale === 'my' ? 'Last routing event' : 'Last routing event'}: ${escapeHtml(
        formatTelegramPremiumRoutingEventSummary(latestRoutingEvent, input.locale),
      )}`,
      `  ${ui.orderNextStepLabel}: ${escapeHtml(nextStepSummary)}`,
      `  ${escapeHtml(
        input.locale === 'my'
          ? 'Quick actions: region • route issue • status'
          : 'Quick actions: region • route issue • status',
      )}`,
      sharePageUrl ? `  ${ui.sharePageLabel}: ${sharePageUrl}` : '',
      '',
    );

    inlineKeyboard.push([
      {
        text: truncateTelegramButtonLabel(`${ui.premiumChangeRegion}: ${key.name}`, 36),
        callback_data: buildTelegramDynamicSupportActionCallbackData('rg', key.id),
      },
      {
        text: truncateTelegramButtonLabel(`${ui.premiumReportRouteIssue}: ${key.name}`, 36),
        callback_data: buildTelegramDynamicSupportActionCallbackData('is', key.id),
      },
    ]);

    if (latestRequest) {
      inlineKeyboard.push([
        {
          text: truncateTelegramButtonLabel(
            `${ui.orderActionCheckStatus}: ${latestRequest.requestCode}`,
            36,
          ),
          callback_data: buildTelegramDynamicSupportActionCallbackData('st', latestRequest.id),
        },
        {
          text: truncateTelegramButtonLabel(ui.premiumReplyToRequest, 30),
          callback_data: buildTelegramDynamicSupportActionCallbackData('rp', latestRequest.id),
        },
      ]);
    }
  }

  if (recentRequests.length > 0) {
    lines.push(ui.premiumStatusTitle, '');
    for (const request of recentRequests) {
      lines.push(
        `• 🧾 <b>${escapeHtml(request.requestCode)}</b> · ${escapeHtml(
          formatTelegramPremiumSupportStatusLabel(request.status, ui),
        )}`,
        `  ${escapeHtml(request.dynamicAccessKey.name)} · ${escapeHtml(
          formatTelegramPremiumSupportTypeLabel(request.requestType, ui),
        )}`,
        '',
      );
    }
  }

  if (recentRequests[0]) {
    inlineKeyboard.push([
      {
        text: ui.orderActionCheckStatus,
        callback_data: buildTelegramDynamicSupportActionCallbackData('st', recentRequests[0].id),
      },
      {
        text: ui.premiumReplyToRequest,
        callback_data: buildTelegramDynamicSupportActionCallbackData('rp', recentRequests[0].id),
      },
    ]);
  }

  if (supportLink) {
    inlineKeyboard.push([{ text: ui.getSupport, url: supportLink }]);
  }

  await sendTelegramPhotoUrl(
    input.botToken,
    input.chatId,
    getTelegramBrandMediaUrl('premiumShowcase'),
    [
      ui.premiumHubTitle,
      '',
      input.locale === 'my'
        ? `${dynamicKeys.length} key(s) • ${recentRequests.length} recent request(s)`
        : `${dynamicKeys.length} key(s) • ${recentRequests.length} recent request(s)`,
      ui.premiumStableLink,
      ui.premiumAutoFailover,
      input.locale === 'my'
        ? 'Atomic-UI Premium • stable route • region-aware support'
        : 'Atomic-UI Premium • stable route • region-aware support',
    ].join('\n'),
  );

  const message = lines.join('\n');
  const sent = await input.sendTelegramMessage(input.botToken, input.chatId, message, {
    replyMarkup: { inline_keyboard: inlineKeyboard.slice(0, 10) },
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
    5,
  );
  if (requests.length === 0) {
    return ui.premiumStatusEmpty;
  }

  if (requests.length === 1) {
    const request = requests[0];
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

  const waitingForAdmin = requests.filter((request) => request.followUpPending).length;
  const replyNeeded = requests.filter((request) => {
    const latestReply = request.replies?.[request.replies.length - 1] || null;
    return latestReply?.senderType === 'ADMIN';
  }).length;
  const lines = [
    ui.premiumStatusTitle,
    '',
    `${requests.length} request(s) • ${waitingForAdmin} waiting for admin • ${replyNeeded} reply needed`,
    '',
  ];
  const inlineKeyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [];
  const latestRequest = requests[0] || null;

  for (const request of requests) {
    const latestReply = request.replies?.[request.replies.length - 1] || null;
    const replyStateLabel = formatTelegramReplyStateLabel({
      latestReplySenderType: latestReply?.senderType || null,
      followUpPending: request.followUpPending,
      locale: input.locale,
    });
    lines.push(
      `• 🧾 <b>${escapeHtml(request.requestCode)}</b> · ${escapeHtml(
        formatTelegramPremiumSupportStatusLabel(request.status, ui),
      )}`,
      `  ${escapeHtml(request.dynamicAccessKey.name)} · ${escapeHtml(
        formatTelegramPremiumSupportTypeLabel(request.requestType, ui),
      )}`,
      `  ${ui.premiumThreadStatusLabel}: ${escapeHtml(
        formatTelegramPremiumFollowUpState(request, ui),
      )}`,
      `  ${escapeHtml(replyStateLabel)}`,
      `  ${ui.createdAtLabel}: ${escapeHtml(
        formatTelegramDateTime(request.createdAt, input.locale),
      )}`,
      ...buildTelegramLatestReplyPreviewLines({
        reply: latestReply,
        locale: input.locale,
        maxLength: 100,
      }).map((line) => `  ${escapeHtml(line)}`),
      '',
    );
    inlineKeyboard.push([
      {
        text: truncateTelegramButtonLabel(
          `${ui.orderActionCheckStatus}: ${request.requestCode}`,
          36,
        ),
        callback_data: buildTelegramDynamicSupportActionCallbackData('st', request.id),
      },
    ]);
  }

  if (supportLink) {
    inlineKeyboard.push([{ text: ui.getSupport, url: supportLink }]);
  }

  const message = lines.join('\n');
  const sent = await input.sendTelegramMessage(input.botToken, input.chatId, message, {
    replyMarkup: { inline_keyboard: inlineKeyboard.slice(0, 8) },
  });

  if (sent && latestRequest) {
    await input.sendTelegramMessage(
      input.botToken,
      input.chatId,
      buildTelegramPremiumSupportStatusMessage({
        locale: input.locale,
        request: latestRequest,
      }),
      {
        replyMarkup:
          latestRequest.status === 'PENDING_REVIEW'
            ? buildTelegramDynamicPremiumPendingKeyboard({
                dynamicAccessKeyId: latestRequest.dynamicAccessKeyId,
                requestId: latestRequest.id,
                locale: input.locale,
                supportLink,
              })
            : buildTelegramDynamicPremiumSupportKeyboard(
                latestRequest.dynamicAccessKeyId,
                input.locale,
                supportLink,
                latestRequest.id,
              ),
      },
    );
  }

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

  const lines = [
    ui.premiumRegionStatusTitle,
    '',
    `${dynamicKeys.length} premium key(s)`,
    '',
    ui.premiumRegionStatusHint,
    '',
  ];
  const inlineKeyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [];

  for (const key of dynamicKeys.slice(0, 4)) {
    const analysis = summarizePremiumRegions(key, healthByServerId);
    const latestRoutingEvent = latestRoutingEvents.get(key.id) || null;
    const currentFallback = getPremiumCurrentFallbackRegion(analysis);
    const currentRouteLabel = analysis.currentServer
      ? `${analysis.currentServer.name}${analysis.currentServer.countryCode ? ` ${getFlagEmoji(analysis.currentServer.countryCode)}` : ''}`
      : ui.premiumRegionUnknownStatus;
    const suggestedFallback = analysis.suggestedFallbacks[0] || null;

    lines.push(`• 💎 <b>${escapeHtml(key.name)}</b>`);
    lines.push(
      `  ${escapeHtml(formatPremiumOverallStatusLine(analysis, input.locale))}`,
    );
    lines.push(
      `  ${ui.premiumRegionPreferredLabel}: ${
        analysis.preferredRegions.length
          ? escapeHtml(analysis.preferredRegions.join(', '))
          : escapeHtml(ui.premiumRegionNoAttached)
      }`,
    );
    lines.push(
      `  ${ui.premiumRegionCurrentRouteLabel}: ${escapeHtml(currentRouteLabel)}`,
    );
    if (currentFallback) {
      lines.push(`  ${ui.premiumRegionCurrentFallbackLabel}: ${escapeHtml(currentFallback)}`);
    }
    if (suggestedFallback) {
      lines.push(
        `  ${ui.premiumRegionAlertSuggestedLabel}: ${escapeHtml(
          `${suggestedFallback.regionCode}${suggestedFallback.latencyMs ? ` • ${suggestedFallback.latencyMs}ms` : ''}`,
        )}`,
      );
    }
    lines.push(
      `  ${input.locale === 'my' ? 'Last routing event' : 'Last routing event'}: ${escapeHtml(
        formatTelegramPremiumRoutingEventSummary(latestRoutingEvent, input.locale),
      )}`,
    );
    lines.push(`  ${ui.orderNextStepLabel}: ${escapeHtml(buildPremiumRecommendedNextStepText(analysis, input.locale))}`);
    lines.push(`  ${ui.premiumRegionAttachedLabel}: ${analysis.attachedServers.length}`);
    lines.push(`  <b>${input.locale === 'my' ? 'Region health' : 'Region health'}</b>`);

    if (analysis.preferredRegions.length === 0) {
      lines.push(`  ${escapeHtml(ui.premiumRegionNoAttached)}`, '');
      inlineKeyboard.push([
        {
          text: truncateTelegramButtonLabel(`${ui.premiumReportRouteIssue}: ${key.name}`, 36),
          callback_data: buildTelegramDynamicSupportActionCallbackData('is', key.id),
        },
      ]);
      continue;
    }

    for (const regionSummary of analysis.regionSummaries.slice(0, 6)) {
      const markers: string[] = [];
      if (regionSummary.isCurrent) {
        markers.push(ui.premiumRegionCurrentRouteLabel);
      }
      if (regionSummary.serverCount > 0) {
        markers.push(`${regionSummary.serverCount} server${regionSummary.serverCount === 1 ? '' : 's'}`);
      }

      lines.push(
        `  • ${escapeHtml(formatPremiumRegionSummaryLine(regionSummary, ui))}`,
      );
      if (markers.length > 0) {
        lines.push(`    ${escapeHtml(markers.join(' • '))}`);
      }
      if (regionSummary.serverName) {
        lines.push(`    ${escapeHtml(regionSummary.serverName)}`);
      }
      if (regionSummary.lastCheckedAt) {
        lines.push(
          `    ${escapeHtml(formatTelegramDateTime(regionSummary.lastCheckedAt, input.locale))}`,
        );
      }
    }

    lines.push(
      `  ${escapeHtml(
        input.locale === 'my'
          ? 'Need a change? Use the buttons below to request a region change or report a route issue.'
          : 'Need a change? Use the buttons below to request a region change or report a route issue.',
      )}`,
    );

    lines.push('');
    inlineKeyboard.push([
      {
        text: truncateTelegramButtonLabel(`${ui.premiumChangeRegion}: ${key.name}`, 34),
        callback_data: buildTelegramDynamicSupportActionCallbackData('rg', key.id),
      },
      {
        text: truncateTelegramButtonLabel(`${ui.premiumReportRouteIssue}: ${key.name}`, 34),
        callback_data: buildTelegramDynamicSupportActionCallbackData('is', key.id),
      },
    ]);
  }

  lines.push(ui.premiumRegionStatusFootnote);

  if (supportLink) {
    inlineKeyboard.push([{ text: ui.getSupport, url: supportLink }]);
  }

  await sendTelegramPhotoUrl(
    input.botToken,
    input.chatId,
    getTelegramBrandMediaUrl('premiumShowcase'),
    [
      ui.premiumRegionStatusTitle,
      '',
      input.locale === 'my'
        ? `${dynamicKeys.length} key(s) • live route health`
        : `${dynamicKeys.length} key(s) • live route health`,
      ui.premiumRegionStatusHint,
    ].join('\n'),
  );

  const message = lines.join('\n');
  const sent = await input.sendTelegramMessage(input.botToken, input.chatId, message, {
    replyMarkup: inlineKeyboard.length ? { inline_keyboard: inlineKeyboard } : undefined,
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
