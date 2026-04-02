import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import si from 'systeminformation';
import { writeAuditLog } from '@/lib/audit';
import { db } from '@/lib/db';
import { type SupportedLocale } from '@/lib/i18n/config';
import { getCommandKeyboard } from '@/lib/services/telegram-callbacks';
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
  handleClaimRefundCommand,
  handleFinanceCommand,
  handleRefundsCommand,
  handleReassignRefundCommand,
  handleSendFinanceCommand,
} from '@/lib/services/telegram-admin-finance';
export {
  handleAdminToggleCommand,
  handleFindCommand,
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
/notifications - notice preference များကို ပြောင်းမည်
/premium - premium key support shortcut များကို ကြည့်မည်
/premiumregion - premium region အခြေအနေကို ကြည့်မည်
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
/notifications - Manage your notice preferences
/premium - Open premium support shortcuts
/premiumregion - View premium region health
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
/announceuser &lt;user&gt; [filters] :: &lt;title&gt; :: &lt;message&gt; - User တစ်ယောက်ထံသာ message ပို့မည်
/announcements - မကြာသေးမီ announcement များကို ကြည့်မည်
/announcehistory - announcement history ကို ကြည့်မည်
/scheduleannouncement &lt;yyyy-mm-ddThh:mm&gt; [repeat=daily|weekly] &lt;audience&gt; [filters] :: &lt;title&gt; :: &lt;message&gt; - အချိန်ဇယားဖြင့် announcement သိမ်းမည်
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
/announceuser &lt;user&gt; [filters] :: &lt;title&gt; :: &lt;message&gt; - Send to one Telegram user
/announcements - Show recent announcements
/announcehistory - Show recent announcement history
/scheduleannouncement &lt;yyyy-mm-ddThh:mm&gt; [repeat=daily|weekly] &lt;audience&gt; [filters] :: &lt;title&gt; :: &lt;message&gt; - Schedule an announcement
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
