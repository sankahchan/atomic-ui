import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getTelegramConfig, sendTelegramMessage } from '@/lib/services/telegram-bot';
import { getMigrationPreview, migrateKeys } from '@/lib/services/server-migration';
import { canAssignKeysToServer } from '@/lib/services/server-lifecycle';
import { generateRandomString } from '@/lib/utils';

const DEFAULT_OUTAGE_GRACE_HOURS = 3;
const prisma = db as any;

type ServerOutageCause = 'HEALTH_DOWN' | 'HEALTH_SLOW' | 'MANUAL_OUTAGE';

type AffectedKeySnapshot = {
  id: string;
  name: string;
  telegramChatId: string | null;
  telegramDeliveryEnabled: boolean;
};

type LinkedPremiumSupportSnapshot = {
  id: string;
  requestCode: string;
  requestType: string;
  status: string;
  telegramChatId: string;
  telegramUsername: string | null;
  dynamicAccessKeyId: string;
  dynamicAccessKeyName: string;
};

function parseJsonArray(value?: string | null): string[] {
  if (!value?.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

async function getSupportLink() {
  const [salesSetting, supportSetting] = await Promise.all([
    db.settings.findUnique({
      where: { key: 'telegram_sales' },
      select: { value: true },
    }),
    db.settings.findUnique({
      where: { key: 'supportLink' },
      select: { value: true },
    }),
  ]);

  if (salesSetting?.value) {
    try {
      const parsed = JSON.parse(salesSetting.value) as { supportLink?: string | null };
      if (parsed.supportLink?.trim()) {
        return parsed.supportLink.trim();
      }
    } catch {
      // Ignore malformed settings and fall back to the subscription support link.
    }
  }

  return supportSetting?.value?.trim() || null;
}

async function getAffectedAccessKeysForServer(serverId: string) {
  const keys = await db.accessKey.findMany({
    where: {
      serverId,
      status: { in: ['ACTIVE', 'PENDING'] },
    },
    select: {
      id: true,
      name: true,
      telegramDeliveryEnabled: true,
      telegramId: true,
      user: {
        select: {
          telegramChatId: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return keys
    .map((key) => ({
      id: key.id,
      name: key.name,
      telegramChatId: key.telegramId || key.user?.telegramChatId || null,
      telegramDeliveryEnabled: key.telegramDeliveryEnabled,
    })) satisfies AffectedKeySnapshot[];
}

async function generateServerOutageIncidentCode(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = `OUT-${generateRandomString(8).toUpperCase()}`;
    const existing = await prisma.serverOutageIncident.findUnique({
      where: { incidentCode: candidate },
      select: { id: true },
    });
    if (!existing) {
      return candidate;
    }
  }

  return `OUT-${Date.now().toString(36).toUpperCase()}`;
}

function summarizeAffectedTelegramUsers(affectedKeys: AffectedKeySnapshot[]) {
  return uniqueStrings(
    affectedKeys
      .filter((key) => key.telegramDeliveryEnabled)
      .map((key) => key.telegramChatId),
  ).length;
}

async function appendOutageIncidentUpdate(input: {
  incidentId: string;
  updateType: string;
  title: string;
  message?: string | null;
  visibleToUsers?: boolean;
  createdByUserId?: string | null;
  createdByName?: string | null;
  sentToTelegramUsers?: number;
}) {
  return prisma.serverOutageIncidentUpdate.create({
    data: {
      incidentId: input.incidentId,
      updateType: input.updateType,
      title: input.title,
      message: input.message?.trim() || null,
      visibleToUsers: input.visibleToUsers ?? false,
      createdByUserId: input.createdByUserId ?? null,
      createdByName: input.createdByName ?? null,
      sentToTelegramUsers: input.sentToTelegramUsers ?? 0,
    },
  });
}

async function getLinkedPremiumSupportRequestsForServer(serverId: string) {
  return db.telegramPremiumSupportRequest.findMany({
    where: {
      status: { in: ['PENDING_REVIEW', 'APPROVED', 'HANDLED'] },
      OR: [
        { currentResolvedServerId: serverId },
        {
          dynamicAccessKey: {
            accessKeys: {
              some: {
                serverId,
                status: { in: ['ACTIVE', 'PENDING'] },
              },
            },
          },
        },
      ],
    },
    include: {
      dynamicAccessKey: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: [{ createdAt: 'desc' }],
  }).then((requests) =>
    requests.map((request) => ({
      id: request.id,
      requestCode: request.requestCode,
      requestType: request.requestType,
      status: request.status,
      telegramChatId: request.telegramChatId,
      telegramUsername: request.telegramUsername || null,
      dynamicAccessKeyId: request.dynamicAccessKeyId,
      dynamicAccessKeyName: request.dynamicAccessKey.name,
    })) satisfies LinkedPremiumSupportSnapshot[],
  );
}

async function linkPremiumSupportRequestsToIncident(input: {
  incidentId: string;
  serverId: string;
  serverName: string;
}) {
  const requests = (await getLinkedPremiumSupportRequestsForServer(input.serverId)).filter(
    (request) => Boolean(request.id),
  );
  if (requests.length === 0) {
    return requests;
  }

  const requestsToUpdate = await prisma.telegramPremiumSupportRequest.findMany({
    where: {
      id: { in: requests.map((request) => request.id) },
      OR: [
        { linkedOutageIncidentId: null },
        { linkedOutageIncidentId: { not: input.incidentId } },
      ],
    },
    select: { id: true },
  });

  if (requestsToUpdate.length > 0) {
    await prisma.telegramPremiumSupportRequest.updateMany({
      where: {
        id: { in: requestsToUpdate.map((request: any) => request.id) },
      },
      data: {
        linkedOutageIncidentId: input.incidentId,
        linkedOutageServerId: input.serverId,
        linkedOutageServerName: input.serverName,
      },
    });

    const updatedRequestIds = new Set(requestsToUpdate.map((request: any) => request.id));
    await appendOutageIncidentUpdate({
      incidentId: input.incidentId,
      updateType: 'LINKED_PREMIUM_REQUESTS',
      title: `Linked ${updatedRequestIds.size} premium request(s)`,
      message:
        requests
          .filter((request) => updatedRequestIds.has(request.id))
          .slice(0, 3)
          .map((request) => `${request.requestCode} · ${request.dynamicAccessKeyName}`)
          .join('\n') || null,
    });
  }

  return requests;
}

async function upsertOutageState(input: {
  serverId: string;
  cause: ServerOutageCause;
  gracePeriodHours?: number;
  affectedKeys?: AffectedKeySnapshot[];
}) {
  const now = new Date();
  const gracePeriodHours = input.gracePeriodHours ?? DEFAULT_OUTAGE_GRACE_HOURS;
  const affectedKeys = input.affectedKeys ?? (await getAffectedAccessKeysForServer(input.serverId));
  const affectedAccessKeyIdsJson = JSON.stringify(affectedKeys.map((key) => key.id));
  const affectedTelegramChatIdsJson = JSON.stringify(
    uniqueStrings(
      affectedKeys
        .filter((key) => key.telegramDeliveryEnabled)
        .map((key) => key.telegramChatId),
    ),
  );

  const existing = await prisma.serverOutageState.findUnique({
    where: { serverId: input.serverId },
  });

  if (!existing || existing.recoveredAt) {
    const incident = await prisma.serverOutageIncident.create({
      data: {
        incidentCode: await generateServerOutageIncidentCode(),
        serverId: input.serverId,
        status: 'OPEN',
        cause: input.cause,
        startedAt: now,
        lastDetectedAt: now,
        gracePeriodHours,
        userAlertScheduledFor: addHours(now, gracePeriodHours),
        affectedKeyCount: affectedKeys.length,
        affectedTelegramUsers: summarizeAffectedTelegramUsers(affectedKeys),
        initialAffectedKeyCount: affectedKeys.length,
        migratedKeyCount: 0,
        failedKeyCount: 0,
        recoveryNotificationCount: 0,
        affectedAccessKeyIdsJson,
        affectedTelegramChatIdsJson,
      },
    });

    await appendOutageIncidentUpdate({
      incidentId: incident.id,
      updateType: 'DETECTED',
      title:
        input.cause === 'MANUAL_OUTAGE'
          ? 'Manual outage started'
          : input.cause === 'HEALTH_SLOW'
            ? 'Degraded performance detected'
            : 'Outage detected',
      message: `${affectedKeys.length} active or pending key(s) are affected.`,
    });

    const state = await prisma.serverOutageState.upsert({
      where: { serverId: input.serverId },
      update: {
        incidentId: incident.id,
        cause: input.cause,
        startedAt: now,
        lastDetectedAt: now,
        recoveredAt: null,
        gracePeriodHours,
        userAlertScheduledFor: addHours(now, gracePeriodHours),
        userAlertSentAt: null,
        migrationTargetServerId: null,
        migrationTargetServerName: null,
        migrationTriggeredAt: null,
        migrationCompletedAt: null,
        recoveryNotifiedAt: null,
        affectedAccessKeyIdsJson,
        affectedTelegramChatIdsJson,
        lastError: null,
      },
      create: {
        serverId: input.serverId,
        incidentId: incident.id,
        cause: input.cause,
        startedAt: now,
        lastDetectedAt: now,
        gracePeriodHours,
        userAlertScheduledFor: addHours(now, gracePeriodHours),
        initialAffectedKeyCount: affectedKeys.length,
        migratedKeyCount: 0,
        failedKeyCount: 0,
        recoveryNotificationCount: 0,
        affectedAccessKeyIdsJson,
        affectedTelegramChatIdsJson,
      },
    });

    const server = await db.server.findUnique({
      where: { id: input.serverId },
      select: { id: true, name: true },
    });
    if (server) {
      await linkPremiumSupportRequestsToIncident({
        incidentId: incident.id,
        serverId: server.id,
        serverName: server.name,
      });
    }

    return state;
  }

  let incidentId = existing.incidentId;
  if (!incidentId) {
    const incident = await prisma.serverOutageIncident.create({
      data: {
        incidentCode: await generateServerOutageIncidentCode(),
        serverId: input.serverId,
        status: 'OPEN',
        cause: input.cause,
        startedAt: existing.startedAt,
        lastDetectedAt: now,
        gracePeriodHours,
        userAlertScheduledFor: existing.userAlertScheduledFor,
        affectedKeyCount: affectedKeys.length,
        affectedTelegramUsers: summarizeAffectedTelegramUsers(affectedKeys),
        initialAffectedKeyCount: affectedKeys.length,
        migratedKeyCount: 0,
        failedKeyCount: 0,
        recoveryNotificationCount: 0,
        affectedAccessKeyIdsJson,
        affectedTelegramChatIdsJson,
      },
    });
    incidentId = incident.id;
    await appendOutageIncidentUpdate({
      incidentId,
      updateType: 'DETECTED',
      title:
        input.cause === 'MANUAL_OUTAGE'
          ? 'Manual outage started'
          : input.cause === 'HEALTH_SLOW'
            ? 'Degraded performance detected'
            : 'Outage detected',
      message: `${affectedKeys.length} active or pending key(s) are affected.`,
    });
  } else {
    await prisma.serverOutageIncident.update({
      where: { id: incidentId },
      data: {
        status: 'OPEN',
        cause: input.cause,
        lastDetectedAt: now,
        gracePeriodHours,
        userAlertScheduledFor: existing.userAlertScheduledFor,
        affectedKeyCount: affectedKeys.length,
        affectedTelegramUsers: summarizeAffectedTelegramUsers(affectedKeys),
        initialAffectedKeyCount: affectedKeys.length,
        migratedKeyCount: 0,
        failedKeyCount: 0,
        recoveryNotificationCount: 0,
        affectedAccessKeyIdsJson,
        affectedTelegramChatIdsJson,
        lastError: null,
      },
    });
  }

  const state = await prisma.serverOutageState.update({
    where: { serverId: input.serverId },
    data: {
      incidentId,
      cause: input.cause,
      lastDetectedAt: now,
      gracePeriodHours,
      affectedAccessKeyIdsJson,
      affectedTelegramChatIdsJson,
      lastError: null,
    },
  });

  const server = await db.server.findUnique({
    where: { id: input.serverId },
    select: { id: true, name: true },
  });
  if (server && incidentId) {
    await linkPremiumSupportRequestsToIncident({
      incidentId,
      serverId: server.id,
      serverName: server.name,
    });
  }

  return state;
}

export async function markServerOutageDetected(input: {
  serverId: string;
  cause?: ServerOutageCause;
  gracePeriodHours?: number;
}) {
  return upsertOutageState({
    serverId: input.serverId,
    cause: input.cause ?? 'HEALTH_DOWN',
    gracePeriodHours: input.gracePeriodHours,
  });
}

export async function markServerOutageRecovered(serverId: string) {
  const existing = await prisma.serverOutageState.findUnique({
    where: { serverId },
  });

  if (!existing || existing.recoveredAt) {
    return existing;
  }

  const recoveredAt = new Date();

  if (existing.incidentId) {
    await prisma.serverOutageIncident.update({
      where: { id: existing.incidentId },
      data: {
        status: 'RESOLVED',
        recoveredAt,
      },
    });
    await appendOutageIncidentUpdate({
      incidentId: existing.incidentId,
      updateType: 'RECOVERED',
      title: 'Outage recovered',
      message: 'The impacted server is reachable again.',
    });
  }

  return prisma.serverOutageState.update({
    where: { serverId },
    data: {
      recoveredAt,
    },
  });
}

function buildOutageAlertMessage(input: {
  cause: ServerOutageCause;
  serverName: string;
  keyNames: string[];
  gracePeriodHours: number;
  supportLink?: string | null;
}) {
  const listedKeys = input.keyNames.slice(0, 5);
  const moreCount = Math.max(0, input.keyNames.length - listedKeys.length);
  const lines = input.cause === 'MANUAL_OUTAGE'
    ? [
        '🛠️ <b>Planned maintenance notice</b>',
        '',
        `We are performing maintenance for the server currently serving your VPN access: <b>${input.serverName}</b>.`,
        `Please wait about <b>${input.gracePeriodHours} hour(s)</b> while we prepare a replacement or complete the maintenance.`,
        '',
        `Affected keys: <b>${listedKeys.join(', ')}</b>${moreCount > 0 ? ` (+${moreCount} more)` : ''}`,
        'You do not need to buy a new key right now.',
        'We will send you another message once the replacement or recovery is ready.',
      ]
    : input.cause === 'HEALTH_SLOW'
      ? [
          '⚠️ <b>Server performance issue</b>',
          '',
          `The server currently serving your VPN access is responding too slowly: <b>${input.serverName}</b>.`,
          `Please wait about <b>${input.gracePeriodHours} hour(s)</b> while we prepare a better route or replacement.`,
          '',
          `Affected keys: <b>${listedKeys.join(', ')}</b>${moreCount > 0 ? ` (+${moreCount} more)` : ''}`,
          'You do not need to buy a new key right now.',
          'We will send you another message once the replacement is ready.',
        ]
    : [
        '🚨 <b>Server issue notice</b>',
        '',
        `One of the servers currently serving your VPN access is unavailable: <b>${input.serverName}</b>.`,
        `Please wait about <b>${input.gracePeriodHours} hour(s)</b> while we prepare a replacement.`,
        '',
        `Affected keys: <b>${listedKeys.join(', ')}</b>${moreCount > 0 ? ` (+${moreCount} more)` : ''}`,
        'You do not need to buy a new key right now.',
        'We will send you another message once the replacement is ready.',
      ];

  if (input.supportLink) {
    lines.push('', `Support: ${input.supportLink}`);
  }

  return lines.join('\n');
}

function buildOutageRecoveryMessage(input: {
  targetServerName: string;
  keyNames: string[];
  supportLink?: string | null;
}) {
  const listedKeys = input.keyNames.slice(0, 5);
  const moreCount = Math.max(0, input.keyNames.length - listedKeys.length);
  const lines = [
    '✅ <b>Server replacement completed</b>',
    '',
    `We moved your VPN access to a new server: <b>${input.targetServerName}</b>.`,
    `Updated keys: <b>${listedKeys.join(', ')}</b>${moreCount > 0 ? ` (+${moreCount} more)` : ''}`,
    'Your expiry date and traffic usage stay the same as before.',
    'If you imported your key manually a long time ago, use /mykeys or /sub to refresh the setup details.',
  ];

  if (input.supportLink) {
    lines.push('', `Support: ${input.supportLink}`);
  }

  return lines.join('\n');
}

function buildOutageFollowUpMessage(input: {
  cause: ServerOutageCause;
  serverName: string;
  message: string;
  supportLink?: string | null;
  markRecovered?: boolean;
}) {
  const lines = input.markRecovered
    ? [
        '✅ <b>Server issue resolved</b>',
        '',
        `The issue affecting <b>${input.serverName}</b> has been resolved earlier than expected.`,
        input.message,
        'You can try using your key again now.',
      ]
    : input.cause === 'MANUAL_OUTAGE'
      ? [
          '🛠️ <b>Maintenance update</b>',
          '',
          `We are still working on the planned maintenance affecting <b>${input.serverName}</b>.`,
          input.message,
        ]
      : input.cause === 'HEALTH_SLOW'
        ? [
            '⚠️ <b>Performance issue update</b>',
            '',
            `We are still working on the degraded performance affecting <b>${input.serverName}</b>.`,
            input.message,
          ]
      : [
          '🛠️ <b>Maintenance update</b>',
          '',
          `We are still working on the issue affecting <b>${input.serverName}</b>.`,
          input.message,
        ];

  if (input.supportLink) {
    lines.push('', `Support: ${input.supportLink}`);
  }

  return lines.join('\n');
}

export async function runServerOutageCycle() {
  const now = new Date();
  const states = await prisma.serverOutageState.findMany({
    where: {
      recoveredAt: null,
      migrationCompletedAt: null,
      userAlertSentAt: null,
      userAlertScheduledFor: {
        lte: now,
      },
    },
    include: {
      server: {
        include: {
          healthCheck: true,
        },
      },
    },
  });

  if (states.length === 0) {
    return {
      alerted: 0,
      resolved: 0,
      skipped: 0,
    };
  }

  const config = await getTelegramConfig();
  const supportLink = await getSupportLink();
  let alerted = 0;
  let resolved = 0;
  let skipped = 0;

  for (const state of states) {
    const stillImpacted =
      state.cause === 'MANUAL_OUTAGE' ||
      state.server.lifecycleMode === 'MAINTENANCE' ||
      state.server.isActive === false ||
      state.server.healthCheck?.lastStatus === 'DOWN' ||
      (state.cause === 'HEALTH_SLOW' && state.server.healthCheck?.lastStatus === 'SLOW');

    if (!stillImpacted) {
      await prisma.serverOutageState.update({
        where: { id: state.id },
        data: { recoveredAt: now },
      });
      if (state.incidentId) {
        await prisma.serverOutageIncident.update({
          where: { id: state.incidentId },
          data: {
            status: 'RESOLVED',
            recoveredAt: now,
          },
        });
        await appendOutageIncidentUpdate({
          incidentId: state.incidentId,
          updateType: 'RECOVERED',
          title: 'Recovered before user warning',
          message: 'The server recovered during the grace period, so no user outage warning was sent.',
        });
      }
      resolved += 1;
      continue;
    }

    if (!config?.botToken) {
      skipped += 1;
      continue;
    }

    const keyIds = parseJsonArray(state.affectedAccessKeyIdsJson);
    const keys = await db.accessKey.findMany({
      where: {
        id: { in: keyIds },
      },
      select: {
        id: true,
        name: true,
        telegramDeliveryEnabled: true,
        telegramId: true,
        user: {
          select: {
            telegramChatId: true,
          },
        },
      },
    });

    const chatMap = new Map<string, string[]>();
    for (const key of keys) {
      if (!key.telegramDeliveryEnabled) {
        continue;
      }
      const chatId = key.telegramId || key.user?.telegramChatId || null;
      if (!chatId) {
        continue;
      }
      const current = chatMap.get(chatId) || [];
      current.push(key.name);
      chatMap.set(chatId, current);
    }

    for (const [chatId, keyNames] of Array.from(chatMap.entries())) {
      await sendTelegramMessage(
        config.botToken,
        chatId,
        buildOutageAlertMessage({
          cause:
            state.cause === 'MANUAL_OUTAGE'
              ? 'MANUAL_OUTAGE'
              : state.cause === 'HEALTH_SLOW'
                ? 'HEALTH_SLOW'
                : 'HEALTH_DOWN',
          serverName: state.server.name,
          keyNames,
          gracePeriodHours: state.gracePeriodHours,
          supportLink,
        }),
      );
    }

    await prisma.serverOutageState.update({
      where: { id: state.id },
      data: {
        userAlertSentAt: now,
      },
    });
    if (state.incidentId) {
      await prisma.serverOutageIncident.update({
        where: { id: state.incidentId },
        data: {
          userAlertSentAt: now,
        },
      });
      await appendOutageIncidentUpdate({
        incidentId: state.incidentId,
        updateType: 'ALERT_SENT',
        title: 'Delayed outage warning sent',
        message: `Affected users were told to wait ${state.gracePeriodHours} hour(s) while a replacement is prepared.`,
        visibleToUsers: true,
        sentToTelegramUsers: chatMap.size,
      });
    }
    alerted += chatMap.size;
  }

  return {
    alerted,
    resolved,
    skipped,
  };
}

export async function executeServerOutageReplacement(input: {
  sourceServerId: string;
  targetServerId: string;
  gracePeriodHours?: number;
  notifyUsers?: boolean;
  cause?: ServerOutageCause;
  lifecycleMode?: 'DRAINING' | 'MAINTENANCE';
}) {
  const sourceServer = await db.server.findUnique({
    where: { id: input.sourceServerId },
    include: {
      healthCheck: true,
    },
  });
  if (!sourceServer) {
    throw new Error('Source server not found');
  }

  const targetServer = await db.server.findUnique({
    where: { id: input.targetServerId },
  });
  if (!targetServer) {
    throw new Error('Target server not found');
  }

  if (sourceServer.id === targetServer.id) {
    throw new Error('Source and target servers must be different.');
  }

  const assignmentCheck = canAssignKeysToServer(targetServer);
  if (!assignmentCheck.allowed) {
    throw new Error(assignmentCheck.reason || 'Target server cannot accept assignments.');
  }

  const affectedKeys = await getAffectedAccessKeysForServer(sourceServer.id);
  const allEligibleKeyIds = affectedKeys.map((key) => key.id);

  await upsertOutageState({
    serverId: sourceServer.id,
    cause: input.cause ?? 'MANUAL_OUTAGE',
    gracePeriodHours: input.gracePeriodHours,
    affectedKeys,
  });

  await db.server.update({
    where: { id: sourceServer.id },
    data: {
      lifecycleMode: input.lifecycleMode ?? 'MAINTENANCE',
      lifecycleChangedAt: new Date(),
    },
  });

  const outageState = await prisma.serverOutageState.update({
    where: { serverId: sourceServer.id },
      data: {
        migrationTargetServerId: targetServer.id,
        migrationTargetServerName: targetServer.name,
        migrationTriggeredAt: new Date(),
        initialAffectedKeyCount: allEligibleKeyIds.length,
        migratedKeyCount: 0,
        failedKeyCount: 0,
        recoveryNotificationCount: 0,
        lastError: null,
      },
  });

  if (outageState.incidentId) {
    await prisma.serverOutageIncident.update({
      where: { id: outageState.incidentId },
      data: {
        status: 'MIGRATING',
        migrationTargetServerId: targetServer.id,
        migrationTargetServerName: targetServer.name,
        migrationTriggeredAt: new Date(),
        initialAffectedKeyCount: allEligibleKeyIds.length,
        migratedKeyCount: 0,
        failedKeyCount: 0,
        recoveryNotificationCount: 0,
        lastError: null,
      },
    });
    await appendOutageIncidentUpdate({
      incidentId: outageState.incidentId,
      updateType: 'MIGRATION_TRIGGERED',
      title: 'Bulk replacement started',
      message: `${allEligibleKeyIds.length} affected key(s) will move from ${sourceServer.name} to ${targetServer.name}.`,
    });
  }

  const result = await migrateKeys(sourceServer.id, targetServer.id, allEligibleKeyIds, true);
  const successfulKeyIds = result.results.filter((item) => item.success).map((item) => item.keyId);
  const failedKeyIds = result.results.filter((item) => !item.success).map((item) => item.keyId);

  const supportLink = await getSupportLink();
  let recoveryNotifications = 0;
  if (input.notifyUsers !== false && successfulKeyIds.length > 0) {
    const config = await getTelegramConfig();
    if (config?.botToken) {
      const updatedKeys = await db.accessKey.findMany({
        where: {
          id: { in: successfulKeyIds },
        },
        select: {
          id: true,
          name: true,
          telegramDeliveryEnabled: true,
          telegramId: true,
          user: {
            select: {
              telegramChatId: true,
            },
          },
        },
      });

      const chatMap = new Map<string, string[]>();
      for (const key of updatedKeys) {
        if (!key.telegramDeliveryEnabled) {
          continue;
        }
        const chatId = key.telegramId || key.user?.telegramChatId || null;
        if (!chatId) {
          continue;
        }
        const current = chatMap.get(chatId) || [];
        current.push(key.name);
        chatMap.set(chatId, current);
      }

      for (const [chatId, keyNames] of Array.from(chatMap.entries())) {
        await sendTelegramMessage(
          config.botToken,
          chatId,
          buildOutageRecoveryMessage({
            targetServerName: targetServer.name,
            keyNames,
            supportLink,
          }),
        );
      }

      recoveryNotifications = chatMap.size;
    }
  }

  await prisma.serverOutageState.update({
    where: { id: outageState.id },
    data: {
      affectedAccessKeyIdsJson: JSON.stringify(failedKeyIds),
      affectedTelegramChatIdsJson:
        failedKeyIds.length > 0
          ? JSON.stringify(
              uniqueStrings(
                affectedKeys
                  .filter((key) => failedKeyIds.includes(key.id) && key.telegramDeliveryEnabled)
                  .map((key) => key.telegramChatId),
              ),
            )
          : '[]',
      initialAffectedKeyCount: allEligibleKeyIds.length,
      migratedKeyCount: result.migrated,
      failedKeyCount: failedKeyIds.length,
      recoveryNotificationCount: recoveryNotifications,
      migrationCompletedAt: failedKeyIds.length === 0 ? new Date() : null,
      recoveryNotifiedAt: recoveryNotifications > 0 ? new Date() : null,
      recoveredAt: failedKeyIds.length === 0 ? new Date() : null,
      lastError:
        failedKeyIds.length > 0
          ? `Migration incomplete: ${failedKeyIds.length} key(s) still need attention.`
          : null,
    },
  });

  if (outageState.incidentId) {
    await prisma.serverOutageIncident.update({
      where: { id: outageState.incidentId },
      data: {
        status: failedKeyIds.length === 0 ? 'RESOLVED' : 'MIGRATING',
        migrationCompletedAt: failedKeyIds.length === 0 ? new Date() : null,
        recoveryNotifiedAt: recoveryNotifications > 0 ? new Date() : null,
        recoveredAt: failedKeyIds.length === 0 ? new Date() : null,
        affectedKeyCount: allEligibleKeyIds.length,
        affectedTelegramUsers: summarizeAffectedTelegramUsers(affectedKeys),
        initialAffectedKeyCount: allEligibleKeyIds.length,
        migratedKeyCount: result.migrated,
        failedKeyCount: failedKeyIds.length,
        recoveryNotificationCount: recoveryNotifications,
        affectedAccessKeyIdsJson: JSON.stringify(failedKeyIds),
        affectedTelegramChatIdsJson:
          failedKeyIds.length > 0
            ? JSON.stringify(
                uniqueStrings(
                  affectedKeys
                    .filter((key) => failedKeyIds.includes(key.id) && key.telegramDeliveryEnabled)
                    .map((key) => key.telegramChatId),
                ),
              )
            : '[]',
        lastError:
          failedKeyIds.length > 0
            ? `Migration incomplete: ${failedKeyIds.length} key(s) still need attention.`
            : null,
      },
    });
    await appendOutageIncidentUpdate({
      incidentId: outageState.incidentId,
      updateType: failedKeyIds.length === 0 ? 'MIGRATION_COMPLETED' : 'MIGRATION_PARTIAL',
      title:
        failedKeyIds.length === 0 ? 'Bulk replacement completed' : 'Bulk replacement incomplete',
      message:
        failedKeyIds.length === 0
          ? `${result.migrated} key(s) were moved to ${targetServer.name}.`
          : `${result.migrated} key(s) moved successfully, ${failedKeyIds.length} still need attention.`,
      visibleToUsers: recoveryNotifications > 0,
      sentToTelegramUsers: recoveryNotifications,
    });
  }

  logger.info(
    `Server outage replacement complete for ${sourceServer.name} -> ${targetServer.name}: ${result.migrated}/${result.total} migrated`,
  );

  return {
    ...result,
    sourceServer: {
      id: sourceServer.id,
      name: sourceServer.name,
    },
    targetServer: {
      id: targetServer.id,
      name: targetServer.name,
    },
    recoveryNotifications,
  };
}

export async function recommendFallbackTargetForServer(sourceServerId: string) {
  const [sourceServer, { getServerLoadStats }] = await Promise.all([
    db.server.findUnique({
      where: { id: sourceServerId },
      select: {
        id: true,
        name: true,
        countryCode: true,
      },
    }),
    import('@/lib/services/load-balancer'),
  ]);

  if (!sourceServer) {
    throw new Error('Source server not found.');
  }

  const [loadStats, healthRows] = await Promise.all([
    getServerLoadStats(),
    db.server.findMany({
      where: { id: { not: sourceServerId } },
      select: {
        id: true,
        countryCode: true,
        healthCheck: {
          select: {
            lastStatus: true,
            lastLatencyMs: true,
            latencyThresholdMs: true,
          },
        },
      },
    }),
  ]);

  const healthByServerId = new Map(healthRows.map((row) => [row.id, row]));
  const candidates = loadStats
    .filter((candidate) => candidate.serverId !== sourceServerId && candidate.isAssignable)
    .map((candidate) => {
      const healthRow = healthByServerId.get(candidate.serverId);
      const healthStatus = healthRow?.healthCheck?.lastStatus ?? 'UNKNOWN';
      const sameCountry =
        Boolean(sourceServer.countryCode) &&
        Boolean(healthRow?.countryCode) &&
        sourceServer.countryCode === healthRow?.countryCode;
      const healthRank =
        healthStatus === 'UP' ? 0 : healthStatus === 'UNKNOWN' ? 1 : healthStatus === 'SLOW' ? 2 : 3;
      const reasons = [
        sameCountry ? `same region as ${sourceServer.name}` : 'best healthy fallback outside the current region',
        healthStatus === 'UP'
          ? 'health status is UP'
          : healthStatus === 'SLOW'
            ? 'health status is SLOW, but still reachable'
            : healthStatus === 'DOWN'
              ? 'health status is DOWN'
              : 'health status is UNKNOWN',
        candidate.capacityPercent !== null
          ? `${candidate.capacityPercent}% capacity used`
          : 'no max-key cap configured',
        `${candidate.activeKeyCount} active keys`,
        `load score ${candidate.loadScore}`,
      ];

      return {
        ...candidate,
        healthStatus,
        healthLatencyMs: healthRow?.healthCheck?.lastLatencyMs ?? null,
        healthThresholdMs: healthRow?.healthCheck?.latencyThresholdMs ?? null,
        sameCountry,
        healthRank,
        reasons,
      };
    })
    .filter((candidate) => candidate.healthStatus !== 'DOWN')
    .sort((left, right) => {
      if (left.sameCountry !== right.sameCountry) {
        return left.sameCountry ? -1 : 1;
      }
      if (left.healthRank !== right.healthRank) {
        return left.healthRank - right.healthRank;
      }
      if (left.loadScore !== right.loadScore) {
        return left.loadScore - right.loadScore;
      }
      return left.serverName.localeCompare(right.serverName);
    });

  const selected = candidates[0] || null;
  return {
    sourceServer,
    selected,
    candidates,
  };
}

export async function getServerOutagePreview(input: {
  sourceServerId: string;
  targetServerId: string;
}) {
  const [preview, affectedKeys, linkedPremiumRequests] = await Promise.all([
    getMigrationPreview(input.sourceServerId, input.targetServerId),
    getAffectedAccessKeysForServer(input.sourceServerId),
    getLinkedPremiumSupportRequestsForServer(input.sourceServerId),
  ]);

  const telegramEligibleKeys = affectedKeys.filter((key) => key.telegramDeliveryEnabled);
  const affectedTelegramUsers = uniqueStrings(
    telegramEligibleKeys.map((key) => key.telegramChatId),
  );

  return {
    ...preview,
    totalKeys: preview.totalKeys,
    telegramEligibleKeys: telegramEligibleKeys.length,
    affectedTelegramUsers: affectedTelegramUsers.length,
    sampleKeyNames: affectedKeys.slice(0, 6).map((key) => key.name),
    linkedPremiumRequests: linkedPremiumRequests.slice(0, 5),
    linkedPremiumRequestCount: linkedPremiumRequests.length,
  };
}

export async function listServerOutageHistory(serverId: string, limit = 8) {
  return prisma.serverOutageIncident.findMany({
    where: { serverId },
    orderBy: [{ startedAt: 'desc' }],
    take: limit,
    include: {
      updates: {
        orderBy: [{ createdAt: 'asc' }],
      },
      premiumSupportRequests: {
        select: {
          id: true,
          requestCode: true,
          requestType: true,
          status: true,
          dynamicAccessKey: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });
}

export async function sendServerOutageFollowUp(input: {
  serverId: string;
  message: string;
  markRecovered?: boolean;
  createdByUserId?: string | null;
  createdByName?: string | null;
}) {
  const state = await prisma.serverOutageState.findUnique({
    where: { serverId: input.serverId },
    include: {
      server: true,
    },
  });

  if (!state || state.recoveredAt) {
    throw new Error('There is no active outage for this server.');
  }

  const config = await getTelegramConfig();
  if (!config?.botToken) {
    throw new Error('Telegram bot is not configured.');
  }

  const keyIds = parseJsonArray(state.affectedAccessKeyIdsJson);
  const keys = await db.accessKey.findMany({
    where: {
      id: { in: keyIds },
    },
    select: {
      telegramDeliveryEnabled: true,
      telegramId: true,
      user: {
        select: {
          telegramChatId: true,
        },
      },
    },
  });

  const chatIds = uniqueStrings(
    keys
      .filter((key) => key.telegramDeliveryEnabled)
      .map((key) => key.telegramId || key.user?.telegramChatId || null),
  );
  const supportLink = await getSupportLink();
  const message = buildOutageFollowUpMessage({
    cause:
      state.cause === 'MANUAL_OUTAGE'
        ? 'MANUAL_OUTAGE'
        : state.cause === 'HEALTH_SLOW'
          ? 'HEALTH_SLOW'
          : 'HEALTH_DOWN',
    serverName: state.server.name,
    message: input.message.trim(),
    supportLink,
    markRecovered: input.markRecovered,
  });

  for (const chatId of chatIds) {
    await sendTelegramMessage(config.botToken, chatId, message);
  }

  if (state.incidentId) {
    await appendOutageIncidentUpdate({
      incidentId: state.incidentId,
      updateType: input.markRecovered ? 'MANUAL_RESOLUTION' : 'FOLLOW_UP',
      title: input.markRecovered ? 'Resolved early message sent' : 'Follow-up update sent',
      message: input.message.trim(),
      visibleToUsers: true,
      createdByUserId: input.createdByUserId ?? null,
      createdByName: input.createdByName ?? null,
      sentToTelegramUsers: chatIds.length,
    });
    await prisma.serverOutageIncident.update({
      where: { id: state.incidentId },
      data: input.markRecovered
        ? {
            status: 'RESOLVED',
            recoveredAt: new Date(),
            recoveryNotifiedAt: new Date(),
          }
        : {},
    });
  }

  if (input.markRecovered) {
    await prisma.serverOutageState.update({
      where: { id: state.id },
      data: {
        recoveredAt: new Date(),
        recoveryNotifiedAt: new Date(),
      },
    });
  }

  return {
    sentToTelegramUsers: chatIds.length,
    message,
  };
}
