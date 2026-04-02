import { writeAuditLog } from '@/lib/audit';
import { db } from '@/lib/db';
import { type SupportedLocale } from '@/lib/i18n/config';
import {
  dispatchTelegramAnnouncement,
  getTelegramAnnouncementAudienceMap,
  type TelegramAnnouncementAudience,
  type TelegramAnnouncementType,
} from '@/lib/services/telegram-announcements';
import { escapeHtml, formatTelegramDateTime } from '@/lib/services/telegram-ui';

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
