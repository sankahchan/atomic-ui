import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getTelegramConfig, sendTelegramMessage } from '@/lib/services/telegram-bot';
import { migrateKeys } from '@/lib/services/server-migration';
import { canAssignKeysToServer } from '@/lib/services/server-lifecycle';

const DEFAULT_OUTAGE_GRACE_HOURS = 3;

type AffectedKeySnapshot = {
  id: string;
  name: string;
  telegramChatId: string | null;
  telegramDeliveryEnabled: boolean;
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
    .filter((key) => key.telegramDeliveryEnabled)
    .map((key) => ({
      id: key.id,
      name: key.name,
      telegramChatId: key.telegramId || key.user?.telegramChatId || null,
      telegramDeliveryEnabled: key.telegramDeliveryEnabled,
    })) satisfies AffectedKeySnapshot[];
}

async function upsertOutageState(input: {
  serverId: string;
  cause: 'HEALTH_DOWN' | 'MANUAL_OUTAGE';
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

  const existing = await db.serverOutageState.findUnique({
    where: { serverId: input.serverId },
  });

  if (!existing || existing.recoveredAt) {
    return db.serverOutageState.upsert({
      where: { serverId: input.serverId },
      update: {
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
        cause: input.cause,
        startedAt: now,
        lastDetectedAt: now,
        gracePeriodHours,
        userAlertScheduledFor: addHours(now, gracePeriodHours),
        affectedAccessKeyIdsJson,
        affectedTelegramChatIdsJson,
      },
    });
  }

  return db.serverOutageState.update({
    where: { serverId: input.serverId },
    data: {
      cause: input.cause,
      lastDetectedAt: now,
      gracePeriodHours,
      affectedAccessKeyIdsJson,
      affectedTelegramChatIdsJson,
      lastError: null,
    },
  });
}

export async function markServerOutageDetected(input: {
  serverId: string;
  cause?: 'HEALTH_DOWN' | 'MANUAL_OUTAGE';
  gracePeriodHours?: number;
}) {
  return upsertOutageState({
    serverId: input.serverId,
    cause: input.cause ?? 'HEALTH_DOWN',
    gracePeriodHours: input.gracePeriodHours,
  });
}

export async function markServerOutageRecovered(serverId: string) {
  const existing = await db.serverOutageState.findUnique({
    where: { serverId },
  });

  if (!existing || existing.recoveredAt) {
    return existing;
  }

  return db.serverOutageState.update({
    where: { serverId },
    data: {
      recoveredAt: new Date(),
    },
  });
}

function buildOutageAlertMessage(input: {
  serverName: string;
  keyNames: string[];
  gracePeriodHours: number;
  supportLink?: string | null;
}) {
  const listedKeys = input.keyNames.slice(0, 5);
  const moreCount = Math.max(0, input.keyNames.length - listedKeys.length);
  const lines = [
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

export async function runServerOutageCycle() {
  const now = new Date();
  const states = await db.serverOutageState.findMany({
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
      state.server.lifecycleMode === 'MAINTENANCE' ||
      state.server.isActive === false ||
      state.server.healthCheck?.lastStatus === 'DOWN';

    if (!stillImpacted) {
      await db.serverOutageState.update({
        where: { id: state.id },
        data: { recoveredAt: now },
      });
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
          serverName: state.server.name,
          keyNames,
          gracePeriodHours: state.gracePeriodHours,
          supportLink,
        }),
      );
    }

    await db.serverOutageState.update({
      where: { id: state.id },
      data: {
        userAlertSentAt: now,
      },
    });
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
    cause: 'MANUAL_OUTAGE',
    gracePeriodHours: input.gracePeriodHours,
    affectedKeys,
  });

  await db.server.update({
    where: { id: sourceServer.id },
    data: {
      lifecycleMode: 'MAINTENANCE',
      lifecycleChangedAt: new Date(),
    },
  });

  const outageState = await db.serverOutageState.update({
    where: { serverId: sourceServer.id },
    data: {
      migrationTargetServerId: targetServer.id,
      migrationTargetServerName: targetServer.name,
      migrationTriggeredAt: new Date(),
      lastError: null,
    },
  });

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

  await db.serverOutageState.update({
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
      migrationCompletedAt: failedKeyIds.length === 0 ? new Date() : null,
      recoveryNotifiedAt: recoveryNotifications > 0 ? new Date() : null,
      recoveredAt: failedKeyIds.length === 0 ? new Date() : null,
      lastError:
        failedKeyIds.length > 0
          ? `Migration incomplete: ${failedKeyIds.length} key(s) still need attention.`
          : null,
    },
  });

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
