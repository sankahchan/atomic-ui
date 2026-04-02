import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import si from 'systeminformation';
import { createOutlineClient } from '@/lib/outline-api';
import { decorateOutlineAccessUrl } from '@/lib/outline-access-url';
import { writeAuditLog } from '@/lib/audit';
import { db } from '@/lib/db';
import { hasFinanceManageScope } from '@/lib/admin-scope';
import { type SupportedLocale } from '@/lib/i18n/config';
import { canAssignKeysToServer } from '@/lib/services/server-lifecycle';
import { getFinanceControls, runTelegramFinanceDigestCycle } from '@/lib/services/telegram-finance';
import {
  dispatchTelegramAnnouncement,
  getTelegramAnnouncementAudienceMap,
  type TelegramAnnouncementAudience,
  type TelegramAnnouncementType,
} from '@/lib/services/telegram-announcements';
import {
  getCommandKeyboard,
} from '@/lib/services/telegram-callbacks';
import {
  getTelegramConfig,
  sendServerIssueNoticeToTelegram,
  sendTelegramDocument,
  sendTelegramMessage,
  type TelegramConfig,
} from '@/lib/services/telegram-runtime';
import {
  escapeHtml,
  formatTelegramDateTime,
  getTelegramUi,
} from '@/lib/services/telegram-ui';
import { formatBytes } from '@/lib/utils';

export type TelegramAdminActor = {
  isAdmin: boolean;
  userId: string | null;
  email: string | null;
  scope: string | null;
};

export async function resolveTelegramAdminActor(input: {
  telegramUserId: number;
  chatId: number;
  config: TelegramConfig;
}): Promise<TelegramAdminActor> {
  const adminChatMatch =
    input.config.adminChatIds.includes(String(input.telegramUserId)) ||
    input.config.adminChatIds.includes(String(input.chatId));

  const linkedAdmin = await db.user.findFirst({
    where: {
      role: 'ADMIN',
      OR: [
        { telegramChatId: String(input.chatId) },
        { telegramChatId: String(input.telegramUserId) },
      ],
    },
    select: {
      id: true,
      email: true,
      adminScope: true,
    },
  });

  if (linkedAdmin) {
    return {
      isAdmin: true,
      userId: linkedAdmin.id,
      email: linkedAdmin.email,
      scope: linkedAdmin.adminScope || null,
    };
  }

  if (adminChatMatch) {
    return {
      isAdmin: true,
      userId: null,
      email: null,
      scope: 'OWNER',
    };
  }

  return {
    isAdmin: false,
    userId: null,
    email: null,
    scope: null,
  };
}

export function telegramAdminScopeDeniedMessage(input: {
  locale: SupportedLocale;
  area: 'announcement' | 'finance' | 'outage' | 'review';
}) {
  const isMyanmar = input.locale === 'my';
  switch (input.area) {
    case 'announcement':
      return isMyanmar
        ? 'Announcement နှင့် broadcast command များကို အသုံးပြုရန် Owner/Admin scope လိုအပ်သည်။'
        : 'Owner or Admin scope is required for Telegram announcement commands.';
    case 'finance':
      return isMyanmar
        ? 'Finance command များကို အသုံးပြုရန် Owner/Finance scope လိုအပ်သည်။'
        : 'Owner or Finance scope is required for Telegram finance commands.';
    case 'outage':
      return isMyanmar
        ? 'Outage command များကို အသုံးပြုရန် Owner/Admin scope လိုအပ်သည်။'
        : 'Owner or Admin scope is required for outage commands.';
    case 'review':
      return isMyanmar
        ? 'Review command များကို အသုံးပြုရန် Owner/Admin/Support scope လိုအပ်သည်။'
        : 'Owner, Admin, or Support scope is required for review commands.';
    default:
      return isMyanmar ? 'ဤ command ကို အသုံးပြုခွင့်မရှိပါ။' : 'You do not have permission to use this command.';
  }
}

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

async function listTelegramRecipientChatIdsForServer(serverId: string) {
  const [accessKeys, dynamicKeys] = await Promise.all([
    db.accessKey.findMany({
      where: {
        serverId,
        status: { in: ['ACTIVE', 'PENDING', 'DISABLED'] },
      },
      select: {
        telegramId: true,
        user: {
          select: {
            telegramChatId: true,
          },
        },
      },
    }),
    db.dynamicAccessKey.findMany({
      where: {
        status: 'ACTIVE',
        accessKeys: {
          some: {
            serverId,
          },
        },
      },
      select: {
        telegramId: true,
        user: {
          select: {
            telegramChatId: true,
          },
        },
      },
    }),
  ]);

  return Array.from(
    new Set(
      [...accessKeys, ...dynamicKeys]
        .flatMap((record) => [record.telegramId, record.user?.telegramChatId])
        .filter((value): value is string => Boolean(value && value.trim())),
    ),
  );
}

async function resolveTelegramAdminServerTarget(
  argsText: string,
  locale: SupportedLocale,
  allowTrailingMessage = false,
) {
  const input = argsText.trim();
  if (!input) {
    return {
      server: null as null,
      remainder: '',
      error:
        locale === 'my'
          ? 'အသုံးပြုပုံ: /serverdown SERVER, /maintenance SERVER, /serverupdate SERVER MESSAGE, /serverrecovered SERVER [MESSAGE]'
          : 'Usage: /serverdown SERVER, /maintenance SERVER, /serverupdate SERVER MESSAGE, /serverrecovered SERVER [MESSAGE]',
    };
  }

  const servers = await db.server.findMany({
    select: {
      id: true,
      name: true,
      lifecycleMode: true,
    },
    orderBy: [{ name: 'asc' }],
  });

  const normalizedInput = input.toLowerCase();
  const exact = servers.find(
    (server) =>
      server.id.toLowerCase() === normalizedInput || server.name.trim().toLowerCase() === normalizedInput,
  );
  if (exact && !allowTrailingMessage) {
    return { server: exact, remainder: '', error: null };
  }

  if (allowTrailingMessage) {
    const byId = servers.find((server) => normalizedInput.startsWith(`${server.id.toLowerCase()} `) || server.id.toLowerCase() === normalizedInput);
    if (byId) {
      return {
        server: byId,
        remainder: input.slice(byId.id.length).trim(),
        error: null,
      };
    }

    const nameMatches = servers
      .filter((server) => {
        const name = server.name.trim().toLowerCase();
        return normalizedInput === name || normalizedInput.startsWith(`${name} `);
      })
      .sort((left, right) => right.name.length - left.name.length);

    if (nameMatches.length === 1) {
      const server = nameMatches[0];
      return {
        server,
        remainder: input.slice(server.name.length).trim(),
        error: null,
      };
    }
  }

  const containsMatches = servers.filter((server) => {
    const name = server.name.trim().toLowerCase();
    return name.includes(normalizedInput) || normalizedInput.includes(name);
  });

  if (containsMatches.length === 1) {
    return {
      server: containsMatches[0],
      remainder: allowTrailingMessage ? input.slice(containsMatches[0].name.length).trim() : '',
      error: null,
    };
  }

  const serverList = servers.map((server) => `• ${server.name} (${server.id})`).join('\n');
  return {
    server: null as null,
    remainder: '',
    error:
      locale === 'my'
        ? `Server ကို မသိရှိပါ။ အောက်ပါ list မှ တစ်ခုကို အသုံးပြုပါ:\n\n${serverList}`
        : `Server not found. Use one of these:\n\n${serverList}`,
  };
}

function formatTelegramAdminMoneyMap(entries: Map<string, number>) {
  if (entries.size === 0) {
    return '0';
  }

  return Array.from(entries.entries())
    .map(([currency, amount]) => `${amount.toLocaleString()} ${currency}`)
    .join(' • ');
}

export async function handleStatusCommand(locale: SupportedLocale) {
  const ui = getTelegramUi(locale);
  const servers = await db.server.findMany({
    where: { isActive: true },
    include: { healthCheck: true, _count: { select: { accessKeys: true } } },
  });

  if (servers.length === 0) return ui.statusNoServers;

  let response = ui.statusTitle;

  for (const server of servers) {
    const status = server.healthCheck?.lastStatus || 'UNKNOWN';
    const statusEmoji =
      status === 'UP' ? '🟢' : status === 'DOWN' ? '🔴' : status === 'SLOW' ? '🟡' : '⚪';
    const latency = server.healthCheck?.lastLatencyMs;
    const uptime = server.healthCheck?.uptimePercent?.toFixed(1) || '-';

    response += `${statusEmoji} <b>${escapeHtml(server.name)}</b>\n`;
    response += `   • ${ui.statusLabel}: ${status}\n`;
    response += `   • ${ui.latencyLabel}: ${latency ? `${latency}ms` : '-'}\n`;
    response += `   • ${ui.uptimeLabel}: ${uptime}%\n`;
    response += `   • ${ui.keysLabel}: ${server._count.accessKeys}\n\n`;
  }

  return response;
}

export async function handleExpiringCommand(argsText: string, locale: SupportedLocale) {
  const ui = getTelegramUi(locale);
  const requestedDays = Number.parseInt(argsText.trim(), 10);
  const days = Number.isFinite(requestedDays) && requestedDays > 0 ? Math.min(requestedDays, 30) : 7;
  const now = new Date();
  const end = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const keys = await db.accessKey.findMany({
    where: {
      status: { in: ['ACTIVE', 'PENDING'] },
      expiresAt: {
        gte: now,
        lte: end,
      },
    },
    include: {
      server: true,
    },
    orderBy: {
      expiresAt: 'asc',
    },
    take: 10,
  });

  if (keys.length === 0) {
    return ui.expiringNone(days);
  }

  const lines = [ui.expiringTitle(days), ''];
  for (const key of keys) {
    lines.push(
      `• <b>${escapeHtml(key.name)}</b>`,
      `  ID: <code>${key.id}</code>`,
      `  Server: ${escapeHtml(key.server.name)}`,
      `  Expires: ${key.expiresAt?.toLocaleString() || 'Unknown'}`,
      '',
    );
  }

  return lines.join('\n');
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

export async function handleSysInfoCommand(
  chatId: number,
  botToken: string,
  locale: SupportedLocale,
) {
  const ui = getTelegramUi(locale);
  await sendTelegramMessage(botToken, chatId, ui.sysinfoGathering);

  try {
    const [cpu, mem, disk, osInfo] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.osInfo(),
    ]);

    const totalDisk = disk.reduce((acc, item) => acc + item.size, 0);
    const usedDisk = disk.reduce((acc, item) => acc + item.used, 0);
    const usedDiskPercent = totalDisk > 0 ? (usedDisk / totalDisk) * 100 : 0;

    return [
      ui.sysinfoTitle,
      '',
      `<b>${ui.sysinfoOs}:</b> ${escapeHtml(`${osInfo.distro} ${osInfo.release}`)}`,
      `<b>${ui.sysinfoCpu}:</b> ${cpu.currentLoad.toFixed(1)}%`,
      `<b>${ui.sysinfoMemory}:</b> ${formatBytes(BigInt(mem.active))} / ${formatBytes(BigInt(mem.total))} (${((mem.active / mem.total) * 100).toFixed(1)}%)`,
      `<b>${ui.sysinfoDisk}:</b> ${formatBytes(BigInt(usedDisk))} / ${formatBytes(BigInt(totalDisk))} (${usedDiskPercent.toFixed(1)}%)`,
    ].join('\n');
  } catch (error) {
    console.error('Sysinfo error:', error);
    return ui.sysinfoFailed;
  }
}

export async function handleBackupCommand(
  chatId: number,
  botToken: string,
  locale: SupportedLocale,
) {
  const ui = getTelegramUi(locale);
  await sendTelegramMessage(botToken, chatId, ui.backupCreating);

  try {
    const backupDir = path.join(process.cwd(), 'storage', 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup-${timestamp}.zip`;
    const filePath = path.join(backupDir, filename);
    const output = fs.createWriteStream(filePath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    await new Promise<void>((resolve, reject) => {
      output.on('close', () => resolve());
      archive.on('error', reject);
      archive.pipe(output);

      const dbUrl = process.env.DATABASE_URL;
      if (dbUrl && dbUrl.includes('file:')) {
        const relativePath = dbUrl.replace('file:', '');
        const dbPath = path.isAbsolute(relativePath)
          ? relativePath
          : path.resolve(process.cwd(), 'prisma', relativePath.replace(/^\.\//, ''));

        if (fs.existsSync(dbPath)) {
          archive.file(dbPath, { name: 'atomic-ui.db' });
        }
      }

      archive.finalize();
    });

    const fileBuffer = fs.readFileSync(filePath);
    await sendTelegramDocument(
      botToken,
      chatId,
      fileBuffer,
      filename,
      ui.backupCaption(new Date().toLocaleString()),
    );

    return null;
  } catch (error) {
    console.error('Backup error:', error);
    return ui.backupFailed(escapeHtml((error as Error).message));
  }
}

export async function handleServerDownCommand(argsText: string, locale: SupportedLocale) {
  const resolved = await resolveTelegramAdminServerTarget(argsText, locale);
  if (!resolved.server) {
    return resolved.error;
  }

  const chatIds = await listTelegramRecipientChatIdsForServer(resolved.server.id);
  if (chatIds.length === 0) {
    return locale === 'my'
      ? `ℹ️ <b>${escapeHtml(resolved.server.name)}</b> အတွက် Telegram ချိတ်ထားသော user မရှိပါ။`
      : `ℹ️ There are no Telegram-linked users for <b>${escapeHtml(resolved.server.name)}</b>.`;
  }

  const { markServerOutageDetected } = await import('@/lib/services/server-outage');
  await markServerOutageDetected({
    serverId: resolved.server.id,
    cause: 'MANUAL_OUTAGE',
    gracePeriodHours: 3,
  });

  const result = await sendServerIssueNoticeToTelegram({
    chatIds,
    serverName: resolved.server.name,
    noticeType: 'DOWNTIME',
    message:
      locale === 'my'
        ? 'ဤ server တွင် ပြဿနာရှိနေပါသည်။ အစားထိုး server သို့ ပြောင်းပေးရန် သို့မဟုတ် recovery update ပို့ရန် ၂ မှ ၃ နာရီခန့် စောင့်ပေးပါ။'
        : 'This server is currently having an issue. Please wait about 2 to 3 hours while we prepare a replacement or recovery update.',
  });
  await (db as any).serverOutageState.updateMany({
    where: {
      serverId: resolved.server.id,
      recoveredAt: null,
    },
    data: {
      userAlertSentAt: new Date(),
    },
  });

  await writeAuditLog({
    action: 'TELEGRAM_SERVER_DOWN_NOTICE_SENT',
    entity: 'SERVER',
    entityId: resolved.server.id,
    details: {
      serverName: resolved.server.name,
      sentToTelegramUsers: result.sentCount,
      via: 'telegram_bot',
    },
  });

  return locale === 'my'
    ? `🚨 <b>${escapeHtml(resolved.server.name)}</b> အတွက် downtime notice ကို user ${result.sentCount} ယောက်ထံ ပို့ပြီးပါပြီ။`
    : `🚨 Sent a downtime notice for <b>${escapeHtml(resolved.server.name)}</b> to ${result.sentCount} Telegram user(s).`;
}

export async function handleMaintenanceCommand(argsText: string, locale: SupportedLocale) {
  const resolved = await resolveTelegramAdminServerTarget(argsText, locale);
  if (!resolved.server) {
    return resolved.error;
  }

  const chatIds = await listTelegramRecipientChatIdsForServer(resolved.server.id);
  if (chatIds.length === 0) {
    return locale === 'my'
      ? `ℹ️ <b>${escapeHtml(resolved.server.name)}</b> အတွက် Telegram ချိတ်ထားသော user မရှိပါ။`
      : `ℹ️ There are no Telegram-linked users for <b>${escapeHtml(resolved.server.name)}</b>.`;
  }

  await db.server.update({
    where: { id: resolved.server.id },
    data: {
      lifecycleMode: 'MAINTENANCE',
      lifecycleChangedAt: new Date(),
    },
  });

  const { markServerOutageDetected } = await import('@/lib/services/server-outage');
  await markServerOutageDetected({
    serverId: resolved.server.id,
    cause: 'MANUAL_OUTAGE',
    gracePeriodHours: 3,
  });

  const result = await sendServerIssueNoticeToTelegram({
    chatIds,
    serverName: resolved.server.name,
    noticeType: 'MAINTENANCE',
    message:
      locale === 'my'
        ? 'ဤ server အတွက် planned maintenance စတင်ထားပါသည်။ အစားထိုး server သို့ ပြောင်းပေးရန် သို့မဟုတ် maintenance ပြီးဆုံးရန် ၂ မှ ၃ နာရီခန့် စောင့်ပေးပါ။'
        : 'Planned maintenance has started for this server. Please wait about 2 to 3 hours while we complete maintenance or prepare a replacement.',
  });
  await (db as any).serverOutageState.updateMany({
    where: {
      serverId: resolved.server.id,
      recoveredAt: null,
    },
    data: {
      userAlertSentAt: new Date(),
    },
  });

  await writeAuditLog({
    action: 'TELEGRAM_SERVER_MAINTENANCE_NOTICE_SENT',
    entity: 'SERVER',
    entityId: resolved.server.id,
    details: {
      serverName: resolved.server.name,
      sentToTelegramUsers: result.sentCount,
      via: 'telegram_bot',
    },
  });

  return locale === 'my'
    ? `🛠️ <b>${escapeHtml(resolved.server.name)}</b> အတွက် maintenance notice ကို user ${result.sentCount} ယောက်ထံ ပို့ပြီးပါပြီ။`
    : `🛠️ Sent a maintenance notice for <b>${escapeHtml(resolved.server.name)}</b> to ${result.sentCount} Telegram user(s).`;
}

export async function handleServerUpdateCommand(argsText: string, locale: SupportedLocale) {
  const resolved = await resolveTelegramAdminServerTarget(argsText, locale, true);
  if (!resolved.server) {
    return resolved.error;
  }
  if (!resolved.remainder || resolved.remainder.trim().length < 6) {
    return locale === 'my'
      ? 'အသုံးပြုပုံ: /serverupdate SERVER MESSAGE'
      : 'Usage: /serverupdate SERVER MESSAGE';
  }

  const { sendServerOutageFollowUp } = await import('@/lib/services/server-outage');
  const result = await sendServerOutageFollowUp({
    serverId: resolved.server.id,
    message: resolved.remainder,
    markRecovered: false,
    createdByName: 'telegram-admin',
  });

  await writeAuditLog({
    action: 'TELEGRAM_SERVER_OUTAGE_FOLLOW_UP',
    entity: 'SERVER',
    entityId: resolved.server.id,
    details: {
      serverName: resolved.server.name,
      message: resolved.remainder,
      sentToTelegramUsers: result.sentToTelegramUsers,
      via: 'telegram_bot',
    },
  });

  return locale === 'my'
    ? `📣 <b>${escapeHtml(resolved.server.name)}</b> အတွက် follow-up update ကို user ${result.sentToTelegramUsers} ယောက်ထံ ပို့ပြီးပါပြီ။`
    : `📣 Sent an outage follow-up for <b>${escapeHtml(resolved.server.name)}</b> to ${result.sentToTelegramUsers} Telegram user(s).`;
}

export async function handleServerRecoveredCommand(argsText: string, locale: SupportedLocale) {
  const resolved = await resolveTelegramAdminServerTarget(argsText, locale, true);
  if (!resolved.server) {
    return resolved.error;
  }

  if ((resolved.server.lifecycleMode || '') === 'MAINTENANCE') {
    await db.server.update({
      where: { id: resolved.server.id },
      data: {
        lifecycleMode: 'ACTIVE',
        lifecycleChangedAt: new Date(),
      },
    });
  }

  const recoveryMessage =
    resolved.remainder?.trim() ||
    (locale === 'my'
      ? 'Server ပြဿနာကို ဖြေရှင်းပြီးပါပြီ။ ယခု VPN key ကို ထပ်မံအသုံးပြုနိုင်ပါသည်။'
      : 'The server issue has been resolved. You can try using your VPN key again now.');

  const { sendServerOutageFollowUp } = await import('@/lib/services/server-outage');
  const result = await sendServerOutageFollowUp({
    serverId: resolved.server.id,
    message: recoveryMessage,
    markRecovered: true,
    createdByName: 'telegram-admin',
  });

  await writeAuditLog({
    action: 'TELEGRAM_SERVER_OUTAGE_RECOVERED',
    entity: 'SERVER',
    entityId: resolved.server.id,
    details: {
      serverName: resolved.server.name,
      message: recoveryMessage,
      sentToTelegramUsers: result.sentToTelegramUsers,
      via: 'telegram_bot',
    },
  });

  return locale === 'my'
    ? `✅ <b>${escapeHtml(resolved.server.name)}</b> အတွက် recovery update ကို user ${result.sentToTelegramUsers} ယောက်ထံ ပို့ပြီးပါပြီ။`
    : `✅ Sent a recovery update for <b>${escapeHtml(resolved.server.name)}</b> to ${result.sentToTelegramUsers} Telegram user(s).`;
}

function resolveTelegramAnnouncementAudienceToken(value?: string | null): TelegramAnnouncementAudience | null {
  switch ((value || '').trim().toLowerCase()) {
    case 'active':
    case 'active_users':
      return 'ACTIVE_USERS';
    case 'standard':
    case 'std':
    case 'standard_users':
      return 'STANDARD_USERS';
    case 'premium':
    case 'premium_users':
      return 'PREMIUM_USERS';
    case 'trial':
    case 'trial_users':
      return 'TRIAL_USERS';
    default:
      return null;
  }
}

function resolveTelegramAnnouncementTypeToken(value?: string | null): TelegramAnnouncementType | null {
  switch ((value || '').trim().toLowerCase()) {
    case '':
    case 'announcement':
      return 'ANNOUNCEMENT';
    case 'info':
      return 'INFO';
    case 'promo':
    case 'discount':
      return 'PROMO';
    case 'new_server':
    case 'server':
      return 'NEW_SERVER';
    case 'maintenance':
      return 'MAINTENANCE';
    default:
      return null;
  }
}

type TelegramAdminAnnouncementParseError = { error: string };
type TelegramAdminAnnouncementParseSuccess = {
  error: null;
  audience: TelegramAnnouncementAudience;
  type: TelegramAnnouncementType;
  title: string;
  message: string;
  includeSupportButton: boolean;
  filters: {
    tag: string | null;
    serverId: string | null;
    countryCode: string | null;
  };
  serverName: string | null;
};

type TelegramAdminAnnouncementParseResult =
  | TelegramAdminAnnouncementParseError
  | TelegramAdminAnnouncementParseSuccess;

function isTelegramAdminAnnouncementParseSuccess(
  value: TelegramAdminAnnouncementParseResult,
): value is TelegramAdminAnnouncementParseSuccess {
  return value.error === null;
}

function formatTelegramAnnouncementTargetSummary(input: {
  tag?: string | null;
  serverName?: string | null;
  countryCode?: string | null;
}) {
  const parts = [
    input.tag ? `tag=${input.tag}` : null,
    input.serverName ? `server=${input.serverName}` : null,
    input.countryCode ? `region=${input.countryCode}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' • ') : 'all matching users';
}

async function parseTelegramAdminAnnouncementArgs(
  argsText: string,
  locale: SupportedLocale,
): Promise<TelegramAdminAnnouncementParseResult> {
  const usage =
    locale === 'my'
      ? 'အသုံးပြုပုံ: /announce AUDIENCE [type=info|announcement|promo|new_server|maintenance] [tag=TAG] [server=SERVER-ID] [region=CC] [support=yes|no] :: TITLE :: MESSAGE'
      : 'Usage: /announce AUDIENCE [type=info|announcement|promo|new_server|maintenance] [tag=TAG] [server=SERVER-ID] [region=CC] [support=yes|no] :: TITLE :: MESSAGE';
  const parts = argsText
    .split('::')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 3) {
    return { error: usage } satisfies TelegramAdminAnnouncementParseResult;
  }

  const [targetPart, title, ...messageParts] = parts;
  const message = messageParts.join(' :: ').trim();
  const tokens = targetPart.split(/\s+/).filter(Boolean);
  const audience = resolveTelegramAnnouncementAudienceToken(tokens.shift());
  if (!audience || title.length < 3 || message.length < 10) {
    return { error: usage } satisfies TelegramAdminAnnouncementParseResult;
  }

  let type: TelegramAnnouncementType = 'ANNOUNCEMENT';
  let includeSupportButton = true;
  let tag: string | null = null;
  let serverId: string | null = null;
  let countryCode: string | null = null;
  let serverName: string | null = null;

  for (const token of tokens) {
    const [rawKey, ...rawValueParts] = token.split('=');
    const key = rawKey?.trim().toLowerCase();
    const rawValue = rawValueParts.join('=').trim();
    if (!key || !rawValue) {
      continue;
    }

    if (key === 'type') {
      const resolvedType = resolveTelegramAnnouncementTypeToken(rawValue);
      if (!resolvedType) {
        return { error: usage } satisfies TelegramAdminAnnouncementParseResult;
      }
      type = resolvedType;
      continue;
    }

    if (key === 'tag') {
      tag = rawValue.toLowerCase();
      continue;
    }

    if (key === 'region' || key === 'country') {
      countryCode = rawValue.toUpperCase();
      continue;
    }

    if (key === 'support') {
      includeSupportButton = !['no', 'false', '0'].includes(rawValue.toLowerCase());
      continue;
    }

    if (key === 'server') {
      const serverQuery = rawValue.replace(/_/g, ' ');
      const candidates = await db.server.findMany({
        where: {
          OR: [
            { id: serverQuery },
            { name: { contains: serverQuery } },
          ],
        },
        select: {
          id: true,
          name: true,
        },
        orderBy: [{ name: 'asc' }],
        take: 5,
      });

      if (candidates.length !== 1) {
        return { error: usage } satisfies TelegramAdminAnnouncementParseResult;
      }

      serverId = candidates[0].id;
      serverName = candidates[0].name;
    }
  }

  return {
    error: null,
    audience,
    type,
    title,
    message,
    includeSupportButton,
    filters: {
      tag,
      serverId,
      countryCode,
    },
    serverName,
  };
}

export async function handleAnnouncementsCommand(locale: SupportedLocale) {
  const announcements = await db.telegramAnnouncement.findMany({
    orderBy: [{ createdAt: 'desc' }],
    take: 5,
  });

  if (!announcements.length) {
    return locale === 'my'
      ? '📭 Announcement history မရှိသေးပါ။'
      : '📭 No announcement history yet.';
  }

  const lines = [
    locale === 'my' ? '📣 <b>မကြာသေးမီက Announcement များ</b>' : '📣 <b>Recent announcements</b>',
    '',
  ];

  for (const announcement of announcements) {
    lines.push(
      `• <b>${escapeHtml(announcement.title)}</b>`,
      `  ${escapeHtml(announcement.type)} • ${escapeHtml(announcement.status)} • ${announcement.sentCount}/${announcement.totalRecipients}`,
      `  ${formatTelegramAnnouncementTargetSummary({
        tag: announcement.targetTag,
        serverName: announcement.targetServerName,
        countryCode: announcement.targetCountryCode,
      })}`,
      `  ${formatTelegramDateTime(announcement.scheduledFor || announcement.sentAt || announcement.createdAt, locale)}`,
      '',
    );
  }

  return lines.join('\n');
}

export async function handleScheduleAnnouncementCommand(
  argsText: string,
  locale: SupportedLocale,
) {
  const [rawSchedule, ...restTokens] = argsText.trim().split(/\s+/);
  if (!rawSchedule || restTokens.length === 0) {
    return locale === 'my'
      ? 'အသုံးပြုပုံ: /scheduleannouncement YYYY-MM-DDThh:mm AUDIENCE [filters] :: TITLE :: MESSAGE'
      : 'Usage: /scheduleannouncement YYYY-MM-DDThh:mm AUDIENCE [filters] :: TITLE :: MESSAGE';
  }

  const scheduledFor = new Date(rawSchedule);
  if (Number.isNaN(scheduledFor.getTime()) || scheduledFor.getTime() <= Date.now() + 60_000) {
    return locale === 'my'
      ? 'အနည်းဆုံး ၁ မိနစ်အနာဂတ်အချိန်ကို သတ်မှတ်ပါ။'
      : 'Choose a valid future time at least one minute from now.';
  }

  const parsed = await parseTelegramAdminAnnouncementArgs(restTokens.join(' '), locale);
  if (!isTelegramAdminAnnouncementParseSuccess(parsed)) {
    return parsed.error;
  }

  const audienceMap = await getTelegramAnnouncementAudienceMap(parsed.filters);
  const totalRecipients = audienceMap[parsed.audience]?.length || 0;
  if (totalRecipients === 0) {
    return locale === 'my'
      ? 'ဤ target အတွက် ပို့ရန် Telegram user မတွေ့ပါ။'
      : 'No Telegram recipients match that audience/filter.';
  }

  const announcement = await db.telegramAnnouncement.create({
    data: {
      audience: parsed.audience,
      type: parsed.type,
      title: parsed.title,
      message: parsed.message,
      includeSupportButton: parsed.includeSupportButton,
      status: 'SCHEDULED',
      scheduledFor,
      createdByEmail: 'telegram-admin',
      targetTag: parsed.filters.tag,
      targetServerId: parsed.filters.serverId,
      targetServerName: parsed.serverName,
      targetCountryCode: parsed.filters.countryCode,
      totalRecipients,
    },
  });

  await writeAuditLog({
    action: 'TELEGRAM_ADMIN_ANNOUNCEMENT_SCHEDULED',
    entity: 'TELEGRAM_ANNOUNCEMENT',
    entityId: announcement.id,
    details: {
      audience: parsed.audience,
      type: parsed.type,
      filters: parsed.filters,
      scheduledFor: scheduledFor.toISOString(),
      via: 'telegram_bot',
    },
  });

  return locale === 'my'
    ? `🗓️ Announcement ကို ${formatTelegramDateTime(scheduledFor, locale)} တွင် ပို့ရန် schedule လုပ်ပြီးပါပြီ။`
    : `🗓️ Scheduled the announcement for ${formatTelegramDateTime(scheduledFor, locale)}.`;
}

export async function handleAnnounceCommand(argsText: string, locale: SupportedLocale) {
  const parsed = await parseTelegramAdminAnnouncementArgs(argsText, locale);
  if (!isTelegramAdminAnnouncementParseSuccess(parsed)) {
    return parsed.error;
  }

  const audienceMap = await getTelegramAnnouncementAudienceMap(parsed.filters);
  const totalRecipients = audienceMap[parsed.audience]?.length || 0;
  if (totalRecipients === 0) {
    return locale === 'my'
      ? 'ဤ target အတွက် ပို့ရန် Telegram user မတွေ့ပါ။'
      : 'No Telegram recipients match that audience/filter.';
  }

  const announcement = await db.telegramAnnouncement.create({
    data: {
      audience: parsed.audience,
      type: parsed.type,
      title: parsed.title,
      message: parsed.message,
      includeSupportButton: parsed.includeSupportButton,
      status: 'SCHEDULED',
      scheduledFor: new Date(),
      createdByEmail: 'telegram-admin',
      targetTag: parsed.filters.tag,
      targetServerId: parsed.filters.serverId,
      targetServerName: parsed.serverName,
      targetCountryCode: parsed.filters.countryCode,
    },
  });

  const result = await dispatchTelegramAnnouncement({
    announcementId: announcement.id,
    now: new Date(),
  });

  if (result.skipped) {
    return locale === 'my'
      ? 'Announcement ကို မပို့နိုင်ပါ။ Notification settings ကို စစ်ဆေးပါ။'
      : 'The announcement could not be sent. Check the Telegram bot configuration.';
  }

  await writeAuditLog({
    action: 'TELEGRAM_ADMIN_ANNOUNCEMENT_SENT',
    entity: 'TELEGRAM_ANNOUNCEMENT',
    entityId: announcement.id,
    details: {
      audience: parsed.audience,
      type: parsed.type,
      filters: parsed.filters,
      sentCount: result.sentCount,
      failedCount: result.failedCount,
      via: 'telegram_bot',
    },
  });

  return locale === 'my'
    ? `📣 Announcement ကို user ${result.sentCount} ယောက်ထံ ပို့ပြီးပါပြီ။${result.failedCount > 0 ? ` failed: ${result.failedCount}` : ''}`
    : `📣 Sent the announcement to ${result.sentCount} user(s).${result.failedCount > 0 ? ` Failed: ${result.failedCount}.` : ''}`;
}

export async function handleFinanceCommand(locale: SupportedLocale) {
  const now = new Date();
  const lookbackStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [orders, financeActions, pendingRefundRequests, financeControls] = await Promise.all([
    db.telegramOrder.findMany({
      where: {
        OR: [
          { createdAt: { gte: lookbackStart } },
          { fulfilledAt: { gte: lookbackStart } },
          { refundRequestedAt: { gte: lookbackStart } },
        ],
      },
      select: {
        status: true,
        kind: true,
        priceAmount: true,
        priceCurrency: true,
        retentionSource: true,
      },
    }),
    db.telegramOrderFinanceAction.findMany({
      where: {
        createdAt: { gte: lookbackStart },
      },
      select: {
        actionType: true,
        amount: true,
        currency: true,
      },
    }),
    db.telegramOrder.count({
      where: {
        refundRequestStatus: 'PENDING',
      },
    }),
    getFinanceControls(),
  ]);

  const fulfilledOrders = orders.filter((order) => order.status === 'FULFILLED' && (order.priceAmount || 0) > 0);
  const renewals = fulfilledOrders.filter((order) => order.kind === 'RENEW').length;
  const revenueByCurrency = new Map<string, number>();
  for (const order of fulfilledOrders) {
    const currency = (order.priceCurrency || 'MMK').trim().toUpperCase();
    revenueByCurrency.set(currency, (revenueByCurrency.get(currency) || 0) + (order.priceAmount || 0));
  }

  const refundsByCurrency = new Map<string, number>();
  const creditsByCurrency = new Map<string, number>();
  let verifiedCount = 0;
  for (const action of financeActions) {
    const currency = (action.currency || 'MMK').trim().toUpperCase();
    if (action.actionType === 'REFUND') {
      refundsByCurrency.set(currency, (refundsByCurrency.get(currency) || 0) + (action.amount || 0));
    } else if (action.actionType === 'CREDIT') {
      creditsByCurrency.set(currency, (creditsByCurrency.get(currency) || 0) + (action.amount || 0));
    } else if (action.actionType === 'VERIFY') {
      verifiedCount += 1;
    }
  }

  const trialConversions = fulfilledOrders.filter((order) => order.retentionSource === 'trial_expiry').length;
  return [
    locale === 'my' ? '💸 <b>Finance အနှစ်ချုပ်</b>' : '💸 <b>Finance summary</b>',
    '',
    'Window: last 24 hour(s)',
    `Paid orders: ${fulfilledOrders.length}`,
    `Revenue: ${formatTelegramAdminMoneyMap(revenueByCurrency)}`,
    `Renewals: ${renewals}`,
    `Verified payments: ${verifiedCount}`,
    `Refunded: ${formatTelegramAdminMoneyMap(refundsByCurrency)}`,
    `Credited: ${formatTelegramAdminMoneyMap(creditsByCurrency)}`,
    `Pending refund requests: ${pendingRefundRequests}`,
    `Trial → paid conversions: ${trialConversions}`,
    '',
    locale === 'my'
      ? `Daily digest: ${financeControls.dailyFinanceDigestEnabled ? 'ON' : 'OFF'}`
      : `Daily digest: ${financeControls.dailyFinanceDigestEnabled ? 'ON' : 'OFF'}`,
  ].join('\n');
}

export async function handleSendFinanceCommand(locale: SupportedLocale) {
  const result = await runTelegramFinanceDigestCycle({ now: new Date(), force: true });
  if (result.skipped) {
    return locale === 'my'
      ? `Finance digest ကို မပို့နိုင်ပါ။ reason=${result.reason}`
      : `Finance digest was skipped. reason=${result.reason}`;
  }

  return locale === 'my'
    ? `💸 Finance digest ကို admin chat ${result.adminChats} ခုသို့ ပို့ပြီးပါပြီ။`
    : `💸 Sent the finance digest to ${result.adminChats} admin chat(s).`;
}

export async function handleRefundsCommand(locale: SupportedLocale) {
  const pendingRefunds = await db.telegramOrder.findMany({
    where: {
      refundRequestStatus: 'PENDING',
    },
    select: {
      orderCode: true,
      requestedEmail: true,
      priceAmount: true,
      priceCurrency: true,
      refundRequestedAt: true,
      refundAssignedReviewerEmail: true,
    },
    orderBy: [{ refundRequestedAt: 'asc' }, { createdAt: 'asc' }],
    take: 5,
  });

  if (!pendingRefunds.length) {
    return locale === 'my'
      ? '✅ Pending refund request မရှိပါ။'
      : '✅ There are no pending refund requests.';
  }

  const lines = [
    locale === 'my' ? '🧾 <b>Pending Refund Requests</b>' : '🧾 <b>Pending refund requests</b>',
    '',
  ];

  for (const order of pendingRefunds) {
    lines.push(
      `• <b>${escapeHtml(order.orderCode)}</b>`,
      `  ${order.priceAmount ? `${order.priceAmount.toLocaleString()} ${(order.priceCurrency || 'MMK').toUpperCase()}` : '0'}`,
      `  ${escapeHtml(order.requestedEmail || 'Unknown customer')}`,
      `  ${formatTelegramDateTime(order.refundRequestedAt || new Date(), locale)}`,
      `  ${locale === 'my' ? 'Reviewer' : 'Reviewer'}: ${escapeHtml(order.refundAssignedReviewerEmail || 'Unclaimed')}`,
      '',
    );
  }

  return lines.join('\n');
}

export async function handleClaimRefundCommand(
  argsText: string,
  locale: SupportedLocale,
  actor: TelegramAdminActor,
) {
  const query = argsText.trim();
  if (!query) {
    return locale === 'my'
      ? 'အသုံးပြုပုံ: /claimrefund ORDER-CODE'
      : 'Usage: /claimrefund ORDER-CODE';
  }

  const order = await db.telegramOrder.findFirst({
    where: {
      OR: [{ orderCode: query.toUpperCase() }, { id: query }],
    },
    select: {
      id: true,
      orderCode: true,
      refundRequestStatus: true,
      refundAssignedReviewerUserId: true,
      refundAssignedReviewerEmail: true,
    },
  });

  if (!order) {
    return locale === 'my' ? 'Refund order မတွေ့ပါ။' : 'Refund order not found.';
  }
  if (order.refundRequestStatus !== 'PENDING') {
    return locale === 'my'
      ? 'Pending refund request မဟုတ်ပါ။'
      : 'That order is not waiting for refund review.';
  }
  if (order.refundAssignedReviewerUserId && order.refundAssignedReviewerUserId !== actor.userId) {
    return locale === 'my'
      ? `ဤ refund request ကို ${order.refundAssignedReviewerEmail || 'အခြား admin'} က claim လုပ်ထားသည်။`
      : `This refund request is already claimed by ${order.refundAssignedReviewerEmail || 'another admin'}.`;
  }

  await db.telegramOrder.update({
    where: { id: order.id },
    data: {
      refundAssignedReviewerUserId: actor.userId,
      refundAssignedReviewerEmail: actor.email || 'telegram-admin',
      refundAssignedAt: new Date(),
    },
  });

  await writeAuditLog({
    userId: actor.userId || undefined,
    action: 'TELEGRAM_ORDER_REFUND_CLAIMED',
    entity: 'TELEGRAM_ORDER',
    entityId: order.id,
    details: {
      orderCode: order.orderCode,
      refundAssignedReviewerEmail: actor.email || 'telegram-admin',
      via: 'telegram_bot',
    },
  });

  return locale === 'my'
    ? `🧾 ${order.orderCode} ကို claim လုပ်ပြီးပါပြီ။`
    : `🧾 Claimed refund request ${order.orderCode}.`;
}

export async function handleReassignRefundCommand(
  argsText: string,
  locale: SupportedLocale,
  actor: TelegramAdminActor,
) {
  const [orderQuery, ...reviewerTokens] = argsText.trim().split(/\s+/);
  const reviewerQuery = reviewerTokens.join(' ').trim();
  if (!orderQuery || !reviewerQuery) {
    return locale === 'my'
      ? 'အသုံးပြုပုံ: /reassignrefund ORDER-CODE ADMIN-EMAIL-OR-QUERY'
      : 'Usage: /reassignrefund ORDER-CODE ADMIN-EMAIL-OR-QUERY';
  }

  const order = await db.telegramOrder.findFirst({
    where: {
      OR: [{ orderCode: orderQuery.toUpperCase() }, { id: orderQuery }],
    },
    select: {
      id: true,
      orderCode: true,
      refundRequestStatus: true,
      refundAssignedReviewerEmail: true,
    },
  });
  if (!order) {
    return locale === 'my' ? 'Refund order မတွေ့ပါ။' : 'Refund order not found.';
  }
  if (order.refundRequestStatus !== 'PENDING') {
    return locale === 'my'
      ? 'Pending refund request မဟုတ်ပါ။'
      : 'That order is not waiting for refund review.';
  }

  const reviewerQueryNormalized = reviewerQuery.toLowerCase();
  const candidateAdmins = (await db.user.findMany({
    where: {
      role: 'ADMIN',
    },
    select: {
      id: true,
      email: true,
    },
    orderBy: [{ email: 'asc' }],
  })).filter((candidate) => candidate.email.toLowerCase().includes(reviewerQueryNormalized));

  if (candidateAdmins.length !== 1) {
    if (candidateAdmins.length === 0) {
      return locale === 'my'
        ? 'သတ်မှတ်ထားသော admin reviewer မတွေ့ပါ။'
        : 'No matching admin reviewer was found.';
    }
    return [
      locale === 'my'
        ? 'တစ်ဦးတည်းသာ သတ်မှတ်နိုင်ရန် ပိုတိကျသော reviewer query သုံးပါ။'
        : 'Use a more specific reviewer query; multiple admins matched.',
      '',
      ...candidateAdmins.map((candidate) => `• ${candidate.email}`),
    ].join('\n');
  }

  const reviewer = candidateAdmins[0];
  await db.telegramOrder.update({
    where: { id: order.id },
    data: {
      refundAssignedReviewerUserId: reviewer.id,
      refundAssignedReviewerEmail: reviewer.email,
      refundAssignedAt: new Date(),
    },
  });

  await writeAuditLog({
    userId: actor.userId || undefined,
    action: 'TELEGRAM_ORDER_REFUND_REASSIGNED',
    entity: 'TELEGRAM_ORDER',
    entityId: order.id,
    details: {
      orderCode: order.orderCode,
      previousRefundAssignedReviewerEmail: order.refundAssignedReviewerEmail || null,
      refundAssignedReviewerEmail: reviewer.email,
      via: 'telegram_bot',
    },
  });

  return locale === 'my'
    ? `🧾 ${order.orderCode} ကို ${reviewer.email} သို့ reassign လုပ်ပြီးပါပြီ။`
    : `🧾 Reassigned ${order.orderCode} to ${reviewer.email}.`;
}

export function buildTelegramHelpMessage(input: {
  isAdmin: boolean;
  locale: SupportedLocale;
}) {
  const isMyanmar = input.locale === 'my';
  let message = isMyanmar
    ? `📚 <b>အသုံးပြုနိုင်သော Command များ</b>

/start - Telegram account ကို ချိတ်ဆက်မည်
/language - ဘာသာစကား ပြောင်းမည်
/buy - Plan ရွေးပြီး key အသစ် မှာယူမည်
/trial - ၁ ရက် 3 GB free trial ရယူမည်
/orders - မိမိ order များကို ကြည့်မည်
/order [code] - order အခြေအနေ အသေးစိတ်ကြည့်မည်
/refund - refund တောင်းဆိုနိုင်သော order များကို ကြည့်မည်
/usage - အသုံးပြုမှုနှင့် QR/setup အချက်အလက်ကို ရယူမည်
/mykeys - ချိတ်ထားသော key များနှင့် ID များကို ကြည့်မည်
/inbox - announcement နှင့် key notice များကို ကြည့်မည်
/premium - premium key support shortcut များကို ကြည့်မည်
/supportstatus - premium support request အခြေအနေကို ကြည့်မည်
/sub - Share page များကို လက်ခံမည်
/support - သတ်မှတ်ထားသော support link ကို ကြည့်မည်
/server - normal key အတွက် server ပြောင်းရန် တောင်းဆိုမည်
/renew - ရှိပြီးသော key ကို plan အလိုက် သက်တမ်းတိုးမည်
/cancel - လက်ရှိ order ကို ပယ်ဖျက်မည်
/help - ဤ help စာမျက်နှာကို ပြမည်`
    : `📚 <b>Available Commands</b>

/start - Link your Telegram account
/language - Change the bot language
/buy - Start a new key order
/trial - Claim the 1-day 3 GB free trial
/orders - Show your recent orders
/order [code] - Show one order status
/refund - Show refund-eligible orders
/usage - Fetch your usage and QR/setup info
/mykeys - List linked keys and IDs
/inbox - Show your recent notices and announcements
/premium - Open premium support shortcuts
/supportstatus - Check your premium support request status
/sub - Receive your share pages
/support - Show the configured support link
/server - Request a server change for a normal key
/renew - Renew one of your existing keys
/cancel - Cancel the current order
/help - Show this help message`;

  if (input.isAdmin) {
    message += isMyanmar
      ? `\n\n<b>Admin Commands</b>
/status - Server အခြေအနေအနှစ်ချုပ်
/expiring [days] - မကြာမီ သက်တမ်းကုန်မည့် key များ
/find &lt;query&gt; - Key ကို ရှာမည်
/disable &lt;key-id&gt; - Key ကို ပိတ်မည်
/enable &lt;key-id&gt; - Key ကို ပြန်ဖွင့်မည်
/resend &lt;key-id&gt; - Share page ကို ပြန်ပို့မည်
/announce &lt;audience&gt; [filters] :: &lt;title&gt; :: &lt;message&gt; - Announcement ပို့မည်
/announcements - မကြာသေးမီ announcement များကို ကြည့်မည်
/announcehistory - announcement history ကို ကြည့်မည်
/scheduleannouncement &lt;yyyy-mm-ddThh:mm&gt; &lt;audience&gt; [filters] :: &lt;title&gt; :: &lt;message&gt; - အချိန်ဇယားဖြင့် announcement သိမ်းမည်
/finance - Finance အနှစ်ချုပ်ကို ကြည့်မည်
/sendfinance - Finance digest ကို ယခုချက်ချင်း ပို့မည်
/refunds - pending refund request များကို ကြည့်မည်
/claimrefund &lt;order&gt; - refund request ကို ကိုယ်တိုင် claim လုပ်မည်
/reassignrefund &lt;order&gt; &lt;admin&gt; - refund reviewer ကို ပြန်သတ်မှတ်မည်
/serverdown &lt;server&gt; - Server downtime notice ပို့မည်
/maintenance &lt;server&gt; - Maintenance notice ပို့မည်
/serverupdate &lt;server&gt; &lt;message&gt; - Follow-up update ပို့မည်
/serverrecovered &lt;server&gt; [message] - Recovery update ပို့မည်
/sysinfo - System resource usage
/backup - Backup ဖန်တီးပြီး ဒေါင်းလုဒ်ဆွဲမည်`
      : `\n\n<b>Admin Commands</b>
/status - Server status summary
/expiring [days] - Keys expiring soon
/find &lt;query&gt; - Search for a key
/disable &lt;key-id&gt; - Disable a key
/enable &lt;key-id&gt; - Re-enable a key
/resend &lt;key-id&gt; - Resend the share page
/announce &lt;audience&gt; [filters] :: &lt;title&gt; :: &lt;message&gt; - Send an announcement
/announcements - Show recent announcements
/announcehistory - Show recent announcement history
/scheduleannouncement &lt;yyyy-mm-ddThh:mm&gt; &lt;audience&gt; [filters] :: &lt;title&gt; :: &lt;message&gt; - Schedule an announcement
/finance - Show the finance summary
/sendfinance - Send the finance digest now
/refunds - Show pending refund requests
/claimrefund &lt;order&gt; - Claim a pending refund request
/reassignrefund &lt;order&gt; &lt;admin&gt; - Reassign a refund reviewer
/serverdown &lt;server&gt; - Send a downtime notice
/maintenance &lt;server&gt; - Send a maintenance notice
/serverupdate &lt;server&gt; &lt;message&gt; - Send a follow-up update
/serverrecovered &lt;server&gt; [message] - Send a recovery update
/sysinfo - System resource usage
/backup - Create and download a backup`;
  }

  message += isMyanmar
    ? `\n\nဤ Telegram account ကို ချိတ်ရန် သင့် email ကိုလည်း တိုက်ရိုက် ပို့နိုင်ပါသည်။`
    : `\n\nYou can also send your email address directly to link this Telegram account.`;

  return message;
}

export async function handleHelpCommand(
  chatId: number,
  botToken: string,
  isAdmin: boolean,
  locale: SupportedLocale,
) {
  const message = buildTelegramHelpMessage({ isAdmin, locale });
  await sendTelegramMessage(botToken, chatId, message, {
    replyMarkup: getCommandKeyboard(isAdmin),
  });

  return null;
}
