import { db } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit';
import { type SupportedLocale } from '@/lib/i18n/config';
import {
  DYNAMIC_ROUTING_EVENT_TYPES,
  recordDynamicRoutingEvent,
} from '@/lib/services/dynamic-routing-events';
import {
  buildTelegramDynamicSupportActionCallbackData,
} from '@/lib/services/telegram-callbacks';
import {
  getTelegramConfig,
  getTelegramNotificationPreferences,
  getTelegramSupportLink,
  resolveTelegramChatIdForDynamicKey,
  resolveTelegramLocaleForRecipient,
  sendTelegramMessage,
} from '@/lib/services/telegram-runtime';
import {
  escapeHtml,
  formatTelegramDateTime,
  formatTelegramDynamicPoolSummary,
  formatTelegramPremiumFollowUpState,
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
  accessKeys: Array<{ server?: { id?: string; name: string; countryCode?: string | null } | null }>;
};

type PremiumRegionHealthCheck = {
  serverId: string;
  lastStatus: string | null;
  lastLatencyMs: number | null;
  lastCheckedAt: Date | null;
  latencyThresholdMs: number | null;
  server: {
    id: string;
    name: string;
    countryCode: string | null;
  } | null;
};

type PremiumRegionSummary = {
  regionCode: string;
  status: string | null;
  latencyMs: number | null;
  latencyThresholdMs: number | null;
  lastCheckedAt: Date | null;
  serverCount: number;
  serverName: string | null;
  isCurrent: boolean;
};

type PremiumRegionAnalysis = {
  preferredRegions: string[];
  attachedServers: Array<{ id?: string; name: string; countryCode?: string | null }>;
  currentServer: { id?: string; name: string; countryCode?: string | null } | null;
  currentSummary: PremiumRegionSummary | null;
  regionSummaries: PremiumRegionSummary[];
  suggestedFallbacks: PremiumRegionSummary[];
};

function getPremiumRegionHealthRank(status?: string | null) {
  switch (status) {
    case 'UP':
      return 0;
    case 'SLOW':
      return 1;
    case 'DOWN':
      return 2;
    default:
      return 3;
  }
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

function summarizeTelegramPremiumRegions(
  key: PremiumMessagingKey,
  healthByServerId: Map<string, PremiumRegionHealthCheck>,
): PremiumRegionAnalysis {
  const preferredRegions = getDynamicKeyRegionChoices(key).map((code) => code.toUpperCase());
  const preferredRegionSet = new Set(preferredRegions);
  const attachedServers = key.accessKeys
    .map((accessKey) => accessKey.server)
    .filter((server): server is NonNullable<typeof server> => Boolean(server));
  const currentServer = attachedServers.find((server) => server.id === key.lastResolvedServerId) || null;
  const regionCodes = Array.from(
    new Set(
      [
        ...preferredRegions,
        ...attachedServers
          .map((server) => server.countryCode?.toUpperCase() || null)
          .filter((value): value is string => Boolean(value)),
      ],
    ),
  );

  const regionSummaries = regionCodes
    .map((regionCode) => {
      const regionServers = attachedServers.filter(
        (server) => server.countryCode?.toUpperCase() === regionCode,
      );
      const regionChecks = regionServers
        .map((server) => (server.id ? healthByServerId.get(server.id) : null))
        .filter((entry): entry is PremiumRegionHealthCheck => Boolean(entry))
        .sort((left, right) => {
          const rankDelta = getPremiumRegionHealthRank(left.lastStatus) - getPremiumRegionHealthRank(right.lastStatus);
          if (rankDelta !== 0) {
            return rankDelta;
          }
          return (left.lastLatencyMs ?? Number.MAX_SAFE_INTEGER) - (right.lastLatencyMs ?? Number.MAX_SAFE_INTEGER);
        });
      const primary = regionChecks[0] || null;

      return {
        regionCode,
        status: primary?.lastStatus || null,
        latencyMs: primary?.lastLatencyMs ?? null,
        latencyThresholdMs: primary?.latencyThresholdMs ?? null,
        lastCheckedAt: primary?.lastCheckedAt ?? null,
        serverCount: regionServers.length,
        serverName: primary?.server?.name || regionServers[0]?.name || null,
        isCurrent: currentServer?.countryCode?.toUpperCase() === regionCode,
      };
    })
    .sort((left, right) => {
      const preferredDelta = Number(preferredRegionSet.has(left.regionCode)) - Number(preferredRegionSet.has(right.regionCode));
      if (preferredDelta !== 0) {
        return preferredDelta * -1;
      }
      const currentDelta = Number(right.isCurrent) - Number(left.isCurrent);
      if (currentDelta !== 0) {
        return currentDelta;
      }
      const rankDelta = getPremiumRegionHealthRank(left.status) - getPremiumRegionHealthRank(right.status);
      if (rankDelta !== 0) {
        return rankDelta;
      }
      return (left.latencyMs ?? Number.MAX_SAFE_INTEGER) - (right.latencyMs ?? Number.MAX_SAFE_INTEGER);
    });

  const currentSummary =
    regionSummaries.find((entry) => entry.isCurrent) ||
    (currentServer?.countryCode
      ? regionSummaries.find((entry) => entry.regionCode === currentServer.countryCode?.toUpperCase()) || null
      : null);

  const suggestedFallbacks = regionSummaries
    .filter((entry) => !entry.isCurrent)
    .filter((entry) => entry.status !== 'DOWN')
    .sort((left, right) => {
      const leftPreferred = preferredRegionSet.has(left.regionCode) ? 0 : 1;
      const rightPreferred = preferredRegionSet.has(right.regionCode) ? 0 : 1;
      if (leftPreferred !== rightPreferred) {
        return leftPreferred - rightPreferred;
      }
      const rankDelta = getPremiumRegionHealthRank(left.status) - getPremiumRegionHealthRank(right.status);
      if (rankDelta !== 0) {
        return rankDelta;
      }
      return (left.latencyMs ?? Number.MAX_SAFE_INTEGER) - (right.latencyMs ?? Number.MAX_SAFE_INTEGER);
    })
    .slice(0, 3);

  return {
    preferredRegions,
    attachedServers,
    currentServer,
    currentSummary,
    regionSummaries,
    suggestedFallbacks,
  };
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

function shouldAlertForPremiumRegionDegradation(analysis: PremiumRegionAnalysis) {
  if (analysis.currentSummary && ['SLOW', 'DOWN'].includes(analysis.currentSummary.status || '')) {
    return true;
  }

  const preferredSummaries = analysis.regionSummaries.filter((entry) =>
    analysis.preferredRegions.includes(entry.regionCode),
  );

  return (
    preferredSummaries.length > 0 &&
    preferredSummaries.some((entry) => ['SLOW', 'DOWN'].includes(entry.status || '')) &&
    preferredSummaries.every((entry) => entry.status !== 'UP')
  );
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
  const lines = [
    ui.premiumStatusTitle,
    '',
    `${ui.premiumRequestCodeLabel}: <b>${escapeHtml(request.requestCode)}</b>`,
    `${ui.keyLabel}: <b>${escapeHtml(request.dynamicAccessKey.name)}</b>`,
    `${ui.premiumRequestType}: <b>${escapeHtml(
      formatTelegramPremiumSupportTypeLabel(request.requestType, ui),
    )}</b>`,
    `${ui.statusLineLabel}: <b>${escapeHtml(
      formatTelegramPremiumSupportStatusLabel(request.status, ui),
    )}</b>`,
    `${ui.premiumOpenRequestLabel}: <b>${escapeHtml(currentState)}</b>`,
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
    const senderLabel =
      latestReply.senderType === 'ADMIN' ? ui.premiumFollowUpFromAdmin : ui.premiumFollowUpFromYou;
    lines.push(
      '',
      `${ui.premiumLatestReplyLabel}: <b>${escapeHtml(senderLabel)}</b> · ${escapeHtml(
        formatTelegramDateTime(latestReply.createdAt, input.locale),
      )}`,
      escapeHtml(latestReply.message),
    );
  }

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

  const recentRequests = await listTelegramPremiumSupportRequestsForUser(
    input.chatId,
    input.telegramUserId,
    3,
  );
  const lines = [ui.premiumHubTitle, '', ui.premiumHubHint, ''];
  const inlineKeyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [];

  for (const key of dynamicKeys.slice(0, 4)) {
    const poolSummary = formatTelegramDynamicPoolSummary(key, ui);
    const { sharePageUrl } = input.getDynamicKeyMessagingUrls(key, 'telegram_premium', input.locale);
    const latestRequest = recentRequests.find((request) => request.dynamicAccessKeyId === key.id) || null;
    lines.push(
      `• <b>${escapeHtml(key.name)}</b>`,
      `  ${ui.statusLineLabel}: ${escapeHtml(key.status)}`,
      `  ${ui.premiumCurrentPoolLabel}: ${escapeHtml(poolSummary)}`,
      latestRequest
        ? `  ${ui.premiumOpenRequestLabel}: ${escapeHtml(
            `${latestRequest.requestCode} • ${formatTelegramPremiumFollowUpState(latestRequest, ui)}`,
          )}`
        : '',
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
        `• <b>${escapeHtml(request.requestCode)}</b> · ${escapeHtml(
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

  const lines = [ui.premiumStatusTitle, ''];
  const inlineKeyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [];

  for (const request of requests) {
    const latestReply = request.replies?.[request.replies.length - 1] || null;
    lines.push(
      `• <b>${escapeHtml(request.requestCode)}</b> · ${escapeHtml(
        formatTelegramPremiumSupportStatusLabel(request.status, ui),
      )}`,
      `  ${escapeHtml(request.dynamicAccessKey.name)} · ${escapeHtml(
        formatTelegramPremiumSupportTypeLabel(request.requestType, ui),
      )}`,
      `  ${ui.premiumOpenRequestLabel}: ${escapeHtml(
        formatTelegramPremiumFollowUpState(request, ui),
      )}`,
      `  ${ui.createdAtLabel}: ${escapeHtml(
        formatTelegramDateTime(request.createdAt, input.locale),
      )}`,
      latestReply
        ? `  ${ui.premiumLatestReplyLabel}: ${escapeHtml(
            `${latestReply.senderType === 'ADMIN' ? ui.premiumFollowUpFromAdmin : ui.premiumFollowUpFromYou} • ${formatTelegramDateTime(latestReply.createdAt, input.locale)}`,
          )}`
        : '',
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

  const lines = [ui.premiumRegionStatusTitle, '', ui.premiumRegionStatusHint, ''];

  for (const key of dynamicKeys.slice(0, 4)) {
    const analysis = summarizeTelegramPremiumRegions(key, healthByServerId);

    lines.push(`• <b>${escapeHtml(key.name)}</b>`);
    lines.push(
      `  ${ui.premiumRegionPreferredLabel}: ${
        analysis.preferredRegions.length
          ? escapeHtml(analysis.preferredRegions.join(', '))
          : escapeHtml(ui.premiumRegionNoAttached)
      }`,
    );
    lines.push(
      `  ${ui.premiumRegionCurrentRouteLabel}: ${
        analysis.currentServer
          ? `${escapeHtml(analysis.currentServer.name)} ${getFlagEmoji(analysis.currentServer.countryCode || '')}`
          : escapeHtml(ui.premiumRegionUnknownStatus)
      }`,
    );
    lines.push(`  ${ui.premiumRegionAttachedLabel}: ${analysis.attachedServers.length}`);

    if (analysis.preferredRegions.length === 0) {
      lines.push(`  ${escapeHtml(ui.premiumRegionNoAttached)}`, '');
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
        `  ${getFlagEmoji(regionSummary.regionCode)} <b>${escapeHtml(regionSummary.regionCode)}</b> · ${escapeHtml(
          formatPremiumRegionHealthLabel(regionSummary.status, ui),
        )}${
          typeof regionSummary.latencyMs === 'number'
            ? ` · ${regionSummary.latencyMs}ms / ${regionSummary.latencyThresholdMs}ms`
            : ''
        }`,
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

    lines.push('');
  }

  lines.push(ui.premiumRegionStatusFootnote);

  const inlineKeyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [];
  if (supportLink) {
    inlineKeyboard.push([{ text: ui.getSupport, url: supportLink }]);
  }

  const message = lines.join('\n');
  const sent = await input.sendTelegramMessage(input.botToken, input.chatId, message, {
    replyMarkup: inlineKeyboard.length ? { inline_keyboard: inlineKeyboard } : undefined,
  });

  return sent ? null : message;
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

export async function runTelegramPremiumRegionAlertCycle() {
  const config = await getTelegramConfig();
  if (!config?.botToken) {
    return {
      skipped: true,
      scanned: 0,
      alerted: 0,
      deduped: 0,
      skippedNoDestination: 0,
      skippedPreferences: 0,
      skippedHealthy: 0,
      errors: [] as string[],
    };
  }

  const supportLink = await getTelegramSupportLink();
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60_000);
  const premiumKeys = await db.dynamicAccessKey.findMany({
    where: {
      status: 'ACTIVE',
      OR: [{ telegramId: { not: null } }, { user: { telegramChatId: { not: null } } }],
      accessKeys: {
        some: {
          serverId: { not: null },
        },
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

  const result = {
    skipped: false,
    scanned: premiumKeys.length,
    alerted: 0,
    deduped: 0,
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

      const preferences = await getTelegramNotificationPreferences({
        telegramUserId: key.telegramId || String(destinationChatId),
        telegramChatId: String(destinationChatId),
      });
      if (!preferences.maintenance && !preferences.support) {
        result.skippedPreferences += 1;
        continue;
      }

      const analysis = summarizeTelegramPremiumRegions(key, healthByServerId);
      if (!shouldAlertForPremiumRegionDegradation(analysis)) {
        result.skippedHealthy += 1;
        continue;
      }

      const existing = await db.dynamicRoutingEvent.findFirst({
        where: {
          dynamicAccessKeyId: key.id,
          eventType: DYNAMIC_ROUTING_EVENT_TYPES.PREFERRED_REGION_DEGRADED,
          createdAt: { gte: sixHoursAgo },
        },
        select: { id: true },
      });
      if (existing) {
        result.deduped += 1;
        continue;
      }

      const locale = await resolveTelegramLocaleForRecipient({
        telegramUserId: key.telegramId || String(destinationChatId),
        telegramChatId: String(destinationChatId),
        fallbackLocale: 'en',
      });
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
            ? { inline_keyboard: [[{ text: getTelegramUi(locale).getSupport, url: supportLink }]] }
            : undefined;

      const sent = await sendTelegramMessage(config.botToken, destinationChatId, alertText, {
        replyMarkup: alertKeyboard,
        disableWebPagePreview: true,
      });
      if (!sent) {
        result.errors.push(`Failed to send premium region alert for ${key.id}`);
        continue;
      }

      await recordDynamicRoutingEvent({
        dynamicAccessKeyId: key.id,
        eventType: DYNAMIC_ROUTING_EVENT_TYPES.PREFERRED_REGION_DEGRADED,
        severity: analysis.currentSummary?.status === 'DOWN' ? 'CRITICAL' : 'WARNING',
        reason: analysis.currentSummary
          ? `Preferred/current premium region degraded: ${formatPremiumRegionSummaryLine(analysis.currentSummary, getTelegramUi(locale))}`
          : 'Preferred premium routing region degraded.',
        metadata: {
          destinationChatId: String(destinationChatId),
          currentRegionCode: analysis.currentSummary?.regionCode || null,
          currentStatus: analysis.currentSummary?.status || null,
          currentLatencyMs: analysis.currentSummary?.latencyMs ?? null,
          preferredRegions: analysis.preferredRegions,
          suggestedFallbackRegions: analysis.suggestedFallbacks.map((entry) => entry.regionCode),
          alertedViaTelegram: true,
        },
      });
      await db.dynamicAccessKey.update({
        where: { id: key.id },
        data: { lastRoutingAlertAt: new Date() },
      });
      result.alerted += 1;
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
