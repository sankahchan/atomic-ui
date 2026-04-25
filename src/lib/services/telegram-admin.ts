import fs from 'fs';
import path from 'path';
import si from 'systeminformation';
import {
  hasFinanceManageScope,
  hasKeyManageScope,
  hasOutageManageScope,
  hasTelegramAnnouncementManageScope,
  hasTelegramReviewManageScope,
} from '@/lib/admin-scope';
import { writeAuditLog } from '@/lib/audit';
import { db } from '@/lib/db';
import { type SupportedLocale } from '@/lib/i18n/config';
import {
  buildTelegramMenuCallbackData,
  getCommandKeyboard,
} from '@/lib/services/telegram-callbacks';
import { type TelegramAdminActor } from '@/lib/services/telegram-admin-core';
import {
  sendServerIssueNoticeToTelegram,
  sendTelegramDocument,
  sendTelegramMessage,
} from '@/lib/services/telegram-runtime';
import {
  escapeHtml,
  formatTelegramDateTime,
  getTelegramUi,
} from '@/lib/services/telegram-ui';
import { ensureBackupDirectory } from '@/lib/backup-storage';
import { createRuntimeBackup } from '@/lib/services/runtime-backup';
import { formatBytes } from '@/lib/utils';

export {
  resolveTelegramAdminActor,
  telegramAdminScopeDeniedMessage,
  type TelegramAdminActor,
} from '@/lib/services/telegram-admin-core';
export {
  handleAnnounceCommand,
  handleAnnounceUserCommand,
  handleAnnouncementsCommand,
  handleScheduleAnnouncementCommand,
} from '@/lib/services/telegram-admin-announcements';
export {
  cancelTelegramAdminKeyFlow,
  handleAdminCreateAccessKeyCommand,
  handleAdminCreateDynamicKeyCommand,
  handleTelegramAdminKeyMediaInput,
  handleAdminManageAccessKeyCommand,
  handleAdminManageDynamicKeyCommand,
  startTelegramAdminSupportReplyFlow,
  handleTelegramAdminKeyCallback,
  handleTelegramAdminKeyTextInput,
} from '@/lib/services/telegram-admin-keys';
export {
  handleClaimRefundCommand,
  handleFinanceCommand,
  handleRefundsCommand,
  handleReassignRefundCommand,
  handleSendFinanceCommand,
  handleTelegramRefundQueueCallback,
} from '@/lib/services/telegram-admin-finance';
export {
  handleAdminToggleCommand,
  handleFindCommand,
  getTelegramReviewQueueSnapshot,
  handleResendCommand,
  resolveAdminKeyQuery,
  setAccessKeyEnabledState,
} from '@/lib/services/telegram-admin-review';

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
    const backupDir = ensureBackupDirectory();
    const { filename, filePath } = await createRuntimeBackup(backupDir);

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

export function buildTelegramAdminHomeKeyboard(input: {
  locale: SupportedLocale;
  adminActor: TelegramAdminActor;
  pendingReview: number;
  supportOpen: number;
  customerSupportOpen: number;
  premiumSupportOpen: number;
  pendingRefunds: number;
  scheduledAnnouncements: number;
  failedDeliveries: number;
}) {
  const rows: Array<Array<{ text: string; callback_data: string }>> = [];
  const isMyanmar = input.locale === 'my';
  const withCount = (label: string, count: number) => (count > 0 ? `${label} (${count})` : label);

  if (hasKeyManageScope(input.adminActor.scope)) {
    rows.push([
      {
        text: isMyanmar ? '➕ ပုံမှန် key' : '➕ Normal key',
        callback_data: buildTelegramMenuCallbackData('admin', 'createkey'),
      },
      {
        text: isMyanmar ? '💎 Dynamic key' : '💎 Dynamic key',
        callback_data: buildTelegramMenuCallbackData('admin', 'createdynamic'),
      },
    ]);
    rows.push([
      {
        text: isMyanmar ? '🛠 Key စီမံရန်' : '🛠 Manage key',
        callback_data: buildTelegramMenuCallbackData('admin', 'managekey'),
      },
      {
        text: isMyanmar ? '🧭 Dynamic စီမံရန်' : '🧭 Manage dynamic',
        callback_data: buildTelegramMenuCallbackData('admin', 'managedynamic'),
      },
    ]);
  }

  if (hasTelegramReviewManageScope(input.adminActor.scope)) {
    rows.push([
      {
        text: withCount(isMyanmar ? '📋 Review queue' : '📋 Review queue', input.pendingReview),
        callback_data: buildTelegramMenuCallbackData('admin', 'reviewqueue'),
      },
      {
        text: withCount(isMyanmar ? '🛟 Support console' : '🛟 Support console', input.supportOpen),
        callback_data: buildTelegramMenuCallbackData('admin', 'supportqueue'),
      },
    ]);
    rows.push([
      {
        text: withCount(isMyanmar ? '🧵 Customer thread များ' : '🧵 Customer threads', input.customerSupportOpen),
        callback_data: buildTelegramMenuCallbackData('admin', 'supportthreads'),
      },
      {
        text: withCount(isMyanmar ? '💎 Premium queue' : '💎 Premium queue', input.premiumSupportOpen),
        callback_data: buildTelegramMenuCallbackData('admin', 'supportpremium'),
      },
    ]);
  }

  if (hasFinanceManageScope(input.adminActor.scope)) {
    rows.push([
      {
        text: withCount(isMyanmar ? '💸 Refunds' : '💸 Refunds', input.pendingRefunds),
        callback_data: buildTelegramMenuCallbackData('admin', 'refunds'),
      },
      {
        text: isMyanmar ? '💼 Finance' : '💼 Finance',
        callback_data: buildTelegramMenuCallbackData('admin', 'finance'),
      },
    ]);
  }

  if (hasTelegramAnnouncementManageScope(input.adminActor.scope)) {
    rows.push([
      {
        text: withCount(
          isMyanmar
            ? `📢 Broadcasts${input.failedDeliveries > 0 ? ' • failed' : ''}`
            : `📢 Broadcasts${input.failedDeliveries > 0 ? ' • failed' : ''}`,
          input.scheduledAnnouncements,
        ),
        callback_data: buildTelegramMenuCallbackData('admin', 'announcements'),
      },
    ]);
  }

  const lastRow: Array<{ text: string; callback_data: string }> = [];
  if (hasOutageManageScope(input.adminActor.scope)) {
    lastRow.push({
      text: isMyanmar ? '🚨 Server notice များ' : '🚨 Server notices',
      callback_data: buildTelegramMenuCallbackData('admin', 'servernotices'),
    });
  }
  lastRow.push({
    text: isMyanmar ? '📊 Status' : '📊 Status',
    callback_data: buildTelegramMenuCallbackData('admin', 'status'),
  });
  rows.push(lastRow);

  return {
    inline_keyboard: rows,
  };
}

export function buildTelegramAdminHomeMessage(input: {
  locale: SupportedLocale;
  adminActor: TelegramAdminActor;
  pendingReview: number;
  unclaimedReview: number;
  customerSupportWaitingAdmin: number;
  premiumSupportWaitingAdmin: number;
  pendingRefunds: number;
  myRefunds: number;
  scheduledAnnouncements: number;
  failedDeliveries: number;
  todayFulfilledCount: number;
  todayRevenue: number;
}) {
  const isMyanmar = input.locale === 'my';
  const needsAdmin = input.customerSupportWaitingAdmin + input.premiumSupportWaitingAdmin;
  const lines = [
    isMyanmar ? '🧭 <b>Admin စင်တာ</b>' : '🧭 <b>Admin home</b>',
    input.adminActor.email
      ? isMyanmar
        ? `<b>${escapeHtml(input.adminActor.email)}</b> ဖြင့် ဝင်ထားသည်`
        : `Signed in as <b>${escapeHtml(input.adminActor.email)}</b>`
      : isMyanmar
        ? 'Admin chat access ဖြင့် ဝင်ထားသည်'
        : 'Signed in with admin chat access',
    '',
    isMyanmar ? '<b>စစ်ရန်လိုသည်</b>' : '<b>Needs attention</b>',
  ];

  if (hasTelegramReviewManageScope(input.adminActor.scope)) {
    lines.push(
      isMyanmar
        ? `📋 Review: ${input.pendingReview} ခု စောင့်နေ • ${input.unclaimedReview} ခု မယူရသေး`
        : `📋 Review: ${input.pendingReview} pending • ${input.unclaimedReview} unclaimed`,
      isMyanmar
        ? `🛟 Support: ${needsAdmin} ခု admin စောင့်နေ • customer ${input.customerSupportWaitingAdmin} • premium ${input.premiumSupportWaitingAdmin}`
        : `🛟 Support: ${needsAdmin} need admin • ${input.customerSupportWaitingAdmin} customer • ${input.premiumSupportWaitingAdmin} premium`,
    );
  }

  if (hasFinanceManageScope(input.adminActor.scope)) {
    lines.push(
      isMyanmar
        ? `💸 Refunds: ${input.pendingRefunds} ခု စောင့်နေ${input.adminActor.userId ? ` • ${input.myRefunds} ခု ကိုယ်ပိုင်` : ''}`
        : `💸 Refunds: ${input.pendingRefunds} pending${input.adminActor.userId ? ` • ${input.myRefunds} mine` : ''}`,
    );
  }

  if (hasTelegramAnnouncementManageScope(input.adminActor.scope)) {
    lines.push(
      isMyanmar
        ? `📢 Broadcasts: ${input.scheduledAnnouncements} ခု သတ်မှတ်ထား • ${input.failedDeliveries} ခု မအောင်မြင်`
        : `📢 Broadcasts: ${input.scheduledAnnouncements} scheduled • ${input.failedDeliveries} failed`,
    );
  }

  if (hasFinanceManageScope(input.adminActor.scope)) {
    lines.push(
      '',
      isMyanmar ? '<b>ယနေ့</b>' : '<b>Today</b>',
      isMyanmar
        ? `✅ ပြီးစီး: ${input.todayFulfilledCount} • ${input.todayRevenue.toLocaleString('en-US')} Kyat`
        : `✅ Fulfilled: ${input.todayFulfilledCount} • ${input.todayRevenue.toLocaleString('en-US')} Kyat`,
    );
  }

  lines.push(
    '',
    isMyanmar
      ? 'နောက်လုပ်ဆောင်ချက်ကို အောက်က button များဖြင့် ရွေးပါ။'
      : 'Choose the next admin action from the buttons below.',
  );

  return lines.filter(Boolean).join('\n');
}

export async function handleAdminHomeCommand(input: {
  locale: SupportedLocale;
  adminActor: TelegramAdminActor;
  botToken?: string;
  chatId?: string | number | null;
}) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [
    pendingReview,
    unclaimedReview,
    customerSupportOpen,
    customerSupportWaitingAdmin,
    premiumSupportOpen,
    premiumSupportWaitingAdmin,
    pendingRefunds,
    myRefunds,
    scheduledAnnouncements,
    failedDeliveries,
    todayFulfilledCount,
    todayRevenueAggregate,
  ] =
    await Promise.all([
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
      db.telegramSupportThread.count({
        where: {
          status: {
            in: ['OPEN', 'ESCALATED'],
          },
        },
      }),
      db.telegramSupportThread.count({
        where: {
          status: {
            in: ['OPEN', 'ESCALATED'],
          },
          waitingOn: 'ADMIN',
        },
      }),
      db.telegramPremiumSupportRequest.count({
        where: {
          status: {
            not: 'DISMISSED',
          },
        },
      }),
      db.telegramPremiumSupportRequest.count({
        where: {
          status: {
            not: 'DISMISSED',
          },
          OR: [
            { followUpPending: true },
            { replies: { none: {} } },
          ],
        },
      }),
      db.telegramOrder.count({
        where: {
          refundRequestStatus: 'PENDING',
        },
      }),
      input.adminActor.userId
        ? db.telegramOrder.count({
            where: {
              refundRequestStatus: 'PENDING',
              refundAssignedReviewerUserId: input.adminActor.userId,
            },
          })
        : Promise.resolve(0),
      db.telegramAnnouncement.count({
        where: {
          status: 'SCHEDULED',
        },
      }),
      db.telegramAnnouncementDelivery.count({
        where: {
          status: 'FAILED',
        },
      }),
      db.telegramOrder.count({
        where: {
          status: 'FULFILLED',
          fulfilledAt: {
            gte: todayStart,
          },
        },
      }),
      db.telegramOrder.aggregate({
        _sum: {
          priceAmount: true,
        },
        where: {
          status: 'FULFILLED',
          fulfilledAt: {
            gte: todayStart,
          },
        },
      }),
    ]);
  const supportOpen = customerSupportOpen + premiumSupportOpen;
  const todayRevenue = todayRevenueAggregate._sum.priceAmount || 0;

  const message = buildTelegramAdminHomeMessage({
    locale: input.locale,
    adminActor: input.adminActor,
    pendingReview,
    unclaimedReview,
    customerSupportWaitingAdmin,
    premiumSupportWaitingAdmin,
    pendingRefunds,
    myRefunds,
    scheduledAnnouncements,
    failedDeliveries,
    todayFulfilledCount,
    todayRevenue,
  });

  if (input.botToken && input.chatId != null) {
    await sendTelegramMessage(input.botToken, input.chatId, message, {
      replyMarkup: buildTelegramAdminHomeKeyboard({
        locale: input.locale,
        adminActor: input.adminActor,
        pendingReview,
        supportOpen,
        customerSupportOpen,
        premiumSupportOpen,
        pendingRefunds,
        scheduledAnnouncements,
        failedDeliveries,
      }),
    });
    return null;
  }

  return message;
}

export function buildTelegramHelpMessage(input: {
  isAdmin: boolean;
  locale: SupportedLocale;
}) {
  const isMyanmar = input.locale === 'my';
  let message = isMyanmar
    ? `📚 <b>အမြန် command guide</b>

<b>စတင်ရန်</b>
/buy - order အသစ် စတင်မည်
/mykeys - key နှင့် renew ကို စစ်မည်
/orders - မကြာသေးသော order များကို ကြည့်မည်
/support - အကူအညီ စင်တာကို ဖွင့်မည်

<b>Update များ</b>
/inbox - notice, refund, reply များကို ကြည့်မည်
/notifications - alert preference များကို ပြောင်းမည်
/premium - premium စင်တာကို ဖွင့်မည်
/supportstatus - support thread summary ကို ကြည့်မည်

<b>နောက်ထပ် tool များ</b>
/renew - renew ကို တိုက်ရိုက် စတင်မည်
<code>/order ORDER-CODE</code> - order တစ်ခုကို အသေးစိတ်ကြည့်မည်
/usage - usage နှင့် setup info ရယူမည်
/sub - share page နှင့် sub link များ ရယူမည်
/offers - active promo များကို ကြည့်မည်
/trial - free trial ရယူမည်
/server - server change request စတင်မည်
/refund - refund လုပ်နိုင်သော order များကို ကြည့်မည်
/language - ဘာသာစကား ပြောင်းမည်
/cancel - လက်ရှိ flow ကို ပယ်ဖျက်မည်
/start - start menu ကို ပြန်ဖွင့်မည်

Tip: <code>/inbox orders|support|refunds|announcements|premium</code> ဖြင့် category တစ်ခုချင်း ကြည့်နိုင်ပါသည်။`
    : `📚 <b>Quick command guide</b>

<b>Start here</b>
/buy - Start a new order
/mykeys - See your keys and renew buttons
/orders - Show your recent orders
/support - Open the help center

<b>Updates</b>
/inbox - Notices, refunds, and replies
/notifications - Manage alert preferences
/premium - Open the premium center
/supportstatus - Show your support thread summary

<b>More tools</b>
/renew - Start a renewal directly
<code>/order ORDER-CODE</code> - Show one order in detail
/usage - Fetch usage and setup info
/sub - Receive your share pages and sub links
/offers - Show active promos
/trial - Claim the free trial
/server - Start a server-change request
/refund - Show refund-eligible orders
/language - Change the bot language
/cancel - Cancel the current flow
/start - Re-open the start menu

Tip: <code>/inbox orders|support|refunds|announcements|premium</code> narrows the inbox to one category.`;

  if (input.isAdmin) {
    message += isMyanmar
      ? `\n\n<b>Admin command များ</b>
/admin - admin hub
/reviewqueue - pending review queue
/createkey, /createdynamic - key ဖန်တီးရန်
/managekey, /managedynamic - key စီမံရန်
/announcements, /announce, /announceuser - announcement tools
/supportqueue, /supportthreads - support queue များ
/finance, /refunds, /claimrefund, /reassignrefund - finance နှင့် refund
/status, /expiring, /find, /sysinfo, /backup - ops shortcut များ`
      : `\n\n<b>Admin commands</b>
/admin - Admin hub
/reviewqueue - Pending review queue
/createkey, /createdynamic - Key creation
/managekey, /managedynamic - Key management
/announcements, /announce, /announceuser - Broadcast tools
/supportqueue, /supportthreads - Support queues
/finance, /refunds, /claimrefund, /reassignrefund - Finance and refunds
/status, /expiring, /find, /sysinfo, /backup - Ops shortcuts`;
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
    replyMarkup: getCommandKeyboard(isAdmin, locale),
  });

  return null;
}
