import { createOutlineClient } from '@/lib/outline-api';
import { decorateOutlineAccessUrl } from '@/lib/outline-access-url';
import { writeAuditLog } from '@/lib/audit';
import { db } from '@/lib/db';
import { type SupportedLocale } from '@/lib/i18n/config';
import { canAssignKeysToServer } from '@/lib/services/server-lifecycle';
import { escapeHtml, getTelegramUi } from '@/lib/services/telegram-ui';

export async function resolveAdminKeyQuery(query: string) {
  const trimmed = query.trim();
  if (!trimmed) {
    return { kind: 'empty' as const };
  }

  const byId = await db.accessKey.findUnique({
    where: { id: trimmed },
    include: {
      server: true,
      user: true,
    },
  });

  if (byId) {
    return { kind: 'single' as const, key: byId };
  }

  const byOutlineId = await db.accessKey.findFirst({
    where: { outlineKeyId: trimmed },
    include: {
      server: true,
      user: true,
    },
  });

  if (byOutlineId) {
    return { kind: 'single' as const, key: byOutlineId };
  }

  const matches = await db.accessKey.findMany({
    where: {
      OR: [
        { name: { contains: trimmed } },
        { email: { contains: trimmed } },
        { telegramId: { contains: trimmed } },
        { user: { email: { contains: trimmed } } },
      ],
    },
    include: {
      server: true,
      user: true,
    },
    take: 5,
    orderBy: { updatedAt: 'desc' },
  });

  if (matches.length === 1) {
    return { kind: 'single' as const, key: matches[0] };
  }

  return {
    kind: 'many' as const,
    matches,
  };
}

export async function getTelegramReviewQueueSnapshot(input: {
  reviewerUserId?: string | null;
  mode?: 'all' | 'mine' | 'unclaimed';
  limit?: number;
}) {
  const mode = input.mode || 'all';
  const listWhere =
    mode === 'mine'
      ? input.reviewerUserId
        ? {
            status: 'PENDING_REVIEW' as const,
            assignedReviewerUserId: input.reviewerUserId,
          }
        : {
            status: 'PENDING_REVIEW' as const,
            id: '__no_review_queue_match__',
          }
      : mode === 'unclaimed'
        ? {
            status: 'PENDING_REVIEW' as const,
            assignedReviewerUserId: null,
          }
        : {
            status: 'PENDING_REVIEW' as const,
          };

  const [summary, orders] = await Promise.all([
    Promise.all([
      db.telegramOrder.count({
        where: {
          status: 'PENDING_REVIEW',
        },
      }),
      db.telegramOrder.count({
        where: {
          status: 'PENDING_REVIEW',
          assignedReviewerUserId: null,
        },
      }),
      input.reviewerUserId
        ? db.telegramOrder.count({
            where: {
              status: 'PENDING_REVIEW',
              assignedReviewerUserId: input.reviewerUserId,
            },
          })
        : Promise.resolve(0),
      db.telegramOrder.count({
        where: {
          status: 'PENDING_REVIEW',
          duplicateProofDetectedAt: {
            not: null,
          },
        },
      }),
    ]),
    db.telegramOrder.findMany({
      where: listWhere,
      include: {
        reviewedBy: {
          select: {
            id: true,
            email: true,
          },
        },
      },
      orderBy: [
        { duplicateProofDetectedAt: 'desc' },
        { assignedAt: 'asc' },
        { paymentSubmittedAt: 'asc' },
        { createdAt: 'asc' },
      ],
      take: input.limit ?? 4,
    }),
  ]);

  return {
    totalPending: summary[0],
    unclaimed: summary[1],
    mine: summary[2],
    duplicateWarnings: summary[3],
    orders,
  };
}

export async function setAccessKeyEnabledState(accessKeyId: string, enable: boolean) {
  const key = await db.accessKey.findUnique({
    where: { id: accessKeyId },
    include: {
      server: true,
      user: true,
    },
  });

  if (!key) {
    throw new Error('Access key not found.');
  }

  const client = createOutlineClient(key.server.apiUrl, key.server.apiCertSha256);
  const isCurrentlyDisabled = key.status === 'DISABLED';

  if (enable) {
    if (!isCurrentlyDisabled) {
      return key;
    }

    const assignmentCheck = canAssignKeysToServer(key.server);
    if (!assignmentCheck.allowed) {
      throw new Error(assignmentCheck.reason);
    }

    const recreated = await client.createAccessKey({
      name: key.name,
      method: key.method || undefined,
    });

    if (key.dataLimitBytes) {
      await client.setAccessKeyDataLimit(recreated.id, Number(key.dataLimitBytes));
    }

    return db.accessKey.update({
      where: { id: key.id },
      data: {
        status: 'ACTIVE',
        outlineKeyId: recreated.id,
        accessUrl: decorateOutlineAccessUrl(recreated.accessUrl, key.name),
        password: recreated.password,
        port: recreated.port,
        method: recreated.method,
        disabledAt: null,
        disabledOutlineKeyId: null,
        usageOffset: -key.usedBytes,
      },
      include: {
        server: true,
        user: true,
      },
    });
  }

  if (isCurrentlyDisabled) {
    return key;
  }

  try {
    await client.deleteAccessKey(key.outlineKeyId);
  } catch (error) {
    console.warn(`Failed to delete key ${key.outlineKeyId} from Outline:`, error);
  }

  await db.connectionSession.updateMany({
    where: {
      accessKeyId: key.id,
      isActive: true,
    },
    data: {
      isActive: false,
      endedAt: new Date(),
      endedReason: 'KEY_DISABLED',
    },
  });

  return db.accessKey.update({
    where: { id: key.id },
    data: {
      status: 'DISABLED',
      disabledAt: new Date(),
      disabledOutlineKeyId: key.outlineKeyId,
      estimatedDevices: 0,
    },
    include: {
      server: true,
      user: true,
    },
  });
}

export async function handleFindCommand(argsText: string, locale: SupportedLocale) {
  const ui = getTelegramUi(locale);
  const query = argsText.trim();
  if (!query) {
    return ui.findUsage;
  }

  const result = await resolveAdminKeyQuery(query);

  if (result.kind === 'single') {
    const key = result.key;
    return [
      ui.findKeyFound,
      '',
      `Name: <b>${escapeHtml(key.name)}</b>`,
      `${ui.idLabel}: <code>${key.id}</code>`,
      `Outline ID: <code>${escapeHtml(key.outlineKeyId)}</code>`,
      `${ui.statusLineLabel}: ${escapeHtml(key.status)}`,
      `${ui.serverLabel}: ${escapeHtml(key.server.name)}`,
      key.email ? `${ui.emailLabel}: ${escapeHtml(key.email)}` : '',
      key.telegramId ? `Telegram: <code>${escapeHtml(key.telegramId)}</code>` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (result.kind === 'many') {
    if (result.matches.length === 0) {
      return ui.findNoMatches(escapeHtml(query));
    }

    return [
      ui.findMatches(escapeHtml(query)),
      '',
      ...result.matches.flatMap((key) => [
        `• <b>${escapeHtml(key.name)}</b>`,
        `  ${ui.idLabel}: <code>${key.id}</code>`,
        `  ${ui.statusLineLabel}: ${escapeHtml(key.status)} • ${escapeHtml(key.server.name)}`,
        '',
      ]),
    ].join('\n');
  }

  return ui.findProvideQuery;
}

export async function handleAdminToggleCommand(input: {
  argsText: string;
  enable: boolean;
  locale: SupportedLocale;
  sendAccessKeyLifecycleTelegramNotification: (input: {
    accessKeyId: string;
    type: 'ENABLED' | 'DISABLED';
  }) => Promise<unknown>;
}) {
  const ui = getTelegramUi(input.locale);
  const query = input.argsText.trim();
  if (!query) {
    return input.enable ? ui.enableUsage : ui.disableUsage;
  }

  const result = await resolveAdminKeyQuery(query);
  if (result.kind !== 'single') {
    if (result.kind === 'many' && result.matches.length > 0) {
      return [
        ui.multiMatchUseIds,
        '',
        ...result.matches.map((key) => `• <code>${key.id}</code> — ${escapeHtml(key.name)}`),
      ].join('\n');
    }

    return ui.keyNotFound;
  }

  const updatedKey = await setAccessKeyEnabledState(result.key.id, input.enable);
  await input.sendAccessKeyLifecycleTelegramNotification({
    accessKeyId: updatedKey.id,
    type: input.enable ? 'ENABLED' : 'DISABLED',
  });

  await writeAuditLog({
    action: input.enable ? 'TELEGRAM_ADMIN_KEY_ENABLED' : 'TELEGRAM_ADMIN_KEY_DISABLED',
    entity: 'ACCESS_KEY',
    entityId: updatedKey.id,
    details: {
      via: 'telegram_bot',
    },
  });

  return input.enable
    ? ui.keyEnabled(escapeHtml(updatedKey.name))
    : ui.keyDisabled(escapeHtml(updatedKey.name));
}

export async function handleResendCommand(input: {
  argsText: string;
  locale: SupportedLocale;
  sendAccessKeySharePageToTelegram: (input: {
    accessKeyId: string;
    chatId?: string | number | null;
    reason?: 'CREATED' | 'KEY_ENABLED' | 'LINKED' | 'USAGE_REQUEST' | 'SUBSCRIPTION_REQUEST' | 'RESENT';
    source?: string | null;
    includeQr?: boolean;
    locale?: SupportedLocale;
  }) => Promise<unknown>;
}) {
  const ui = getTelegramUi(input.locale);
  const query = input.argsText.trim();
  if (!query) {
    return ui.resendUsage;
  }

  const result = await resolveAdminKeyQuery(query);
  if (result.kind !== 'single') {
    if (result.kind === 'many' && result.matches.length > 0) {
      return [
        ui.resendMulti,
        '',
        ...result.matches.map((key) => `• <code>${key.id}</code> — ${escapeHtml(key.name)}`),
      ].join('\n');
    }

    return ui.keyNotFound;
  }

  try {
    await input.sendAccessKeySharePageToTelegram({
      accessKeyId: result.key.id,
      reason: 'RESENT',
      source: 'telegram_admin_resend',
      includeQr: true,
    });
  } catch (error) {
    return ui.resendFailed(escapeHtml((error as Error).message));
  }

  return ui.resendSuccess(escapeHtml(result.key.name));
}
