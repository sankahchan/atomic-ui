import { writeAuditLog } from '@/lib/audit';
import { db } from '@/lib/db';
import { type SupportedLocale } from '@/lib/i18n/config';
import {
  dispatchTelegramAnnouncement,
  resolveTelegramAnnouncementRecipients,
  type TelegramAnnouncementCardStyle,
  type TelegramAnnouncementRecurrenceType,
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

function resolveTelegramAnnouncementCardStyleToken(
  value?: string | null,
): TelegramAnnouncementCardStyle | null {
  switch ((value || '').trim().toLowerCase()) {
    case '':
    case 'default':
      return 'DEFAULT';
    case 'promo':
      return 'PROMO';
    case 'premium':
      return 'PREMIUM';
    case 'ops':
    case 'operations':
      return 'OPERATIONS';
    default:
      return null;
  }
}

function resolveTelegramAnnouncementRecurrenceToken(
  value?: string | null,
): TelegramAnnouncementRecurrenceType | null {
  switch ((value || '').trim().toLowerCase()) {
    case '':
    case 'none':
      return 'NONE';
    case 'daily':
      return 'DAILY';
    case 'weekly':
      return 'WEEKLY';
    default:
      return null;
  }
}

type TelegramAdminAnnouncementParseError = { error: string };
type TelegramAdminAnnouncementParseSuccess = {
  error: null;
  audience: TelegramAnnouncementAudience;
  type: TelegramAnnouncementType;
  cardStyle: TelegramAnnouncementCardStyle;
  title: string;
  message: string;
  includeSupportButton: boolean;
  pinToInbox: boolean;
  filters: {
    tag: string | null;
    segment: string | null;
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
  segment?: string | null;
  serverName?: string | null;
  countryCode?: string | null;
  directUserLabel?: string | null;
  locale?: SupportedLocale;
}) {
  const isMyanmar = input.locale === 'my';
  const parts = [
    input.directUserLabel ? `${isMyanmar ? 'user' : 'user'}=${input.directUserLabel}` : null,
    input.tag ? `tag=${input.tag}` : null,
    input.segment ? `${isMyanmar ? 'segment' : 'segment'}=${input.segment}` : null,
    input.serverName ? `${isMyanmar ? 'server' : 'server'}=${input.serverName}` : null,
    input.countryCode ? `${isMyanmar ? 'region' : 'region'}=${input.countryCode}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' • ') : isMyanmar ? 'ကိုက်ညီသော user အားလုံး' : 'all matching users';
}

async function resolveSingleTelegramAnnouncementRecipient(query: string) {
  const trimmed = query.trim();
  if (!trimmed) {
    return null;
  }

  const normalizedUsername = trimmed.replace(/^@/, '').toLowerCase();
  const directNumeric = /^\d+$/.test(trimmed) ? trimmed : null;

  const [profile, user, accessKey, dynamicKey] = await Promise.all([
    db.telegramUserProfile.findFirst({
      where: {
        OR: [
          directNumeric
            ? { telegramChatId: directNumeric }
            : undefined,
          directNumeric
            ? { telegramUserId: directNumeric }
            : undefined,
          { username: normalizedUsername },
        ].filter(Boolean) as any,
      },
      select: {
        telegramChatId: true,
        telegramUserId: true,
        username: true,
      },
    }),
    db.user.findFirst({
      where: {
        OR: [
          { email: trimmed.toLowerCase() },
          directNumeric ? { telegramChatId: directNumeric } : undefined,
        ].filter(Boolean) as any,
      },
      select: {
        email: true,
        telegramChatId: true,
      },
    }),
    db.accessKey.findFirst({
      where: {
        OR: [
          { email: { equals: trimmed.toLowerCase() } },
          directNumeric ? { telegramId: directNumeric } : undefined,
        ].filter(Boolean) as any,
      },
      select: {
        email: true,
        telegramId: true,
      },
    }),
    db.dynamicAccessKey.findFirst({
      where: {
        OR: [
          { email: { equals: trimmed.toLowerCase() } },
          directNumeric ? { telegramId: directNumeric } : undefined,
        ].filter(Boolean) as any,
      },
      select: {
        email: true,
        telegramId: true,
      },
    }),
  ]);

  const chatId =
    profile?.telegramChatId ||
    user?.telegramChatId ||
    accessKey?.telegramId ||
    dynamicKey?.telegramId ||
    directNumeric;

  if (!chatId) {
    return null;
  }

  const label =
    profile?.username
      ? `@${profile.username}`
      : user?.email || accessKey?.email || dynamicKey?.email || chatId;

  return {
    chatId,
    label,
  };
}

async function parseTelegramAdminAnnouncementArgs(
  argsText: string,
  locale: SupportedLocale,
): Promise<TelegramAdminAnnouncementParseResult> {
  const usage =
    locale === 'my'
      ? 'အသုံးပြုပုံ: /announce AUDIENCE [type=info|announcement|promo|new_server|maintenance] [style=default|promo|premium|ops] [tag=TAG] [segment=TRIAL_TO_PAID|PREMIUM_UPSELL|RENEWAL_SOON|HIGH_VALUE] [server=SERVER-ID] [region=CC] [support=yes|no] [pin=yes|no] :: TITLE :: MESSAGE'
      : 'Usage: /announce AUDIENCE [type=info|announcement|promo|new_server|maintenance] [style=default|promo|premium|ops] [tag=TAG] [segment=TRIAL_TO_PAID|PREMIUM_UPSELL|RENEWAL_SOON|HIGH_VALUE] [server=SERVER-ID] [region=CC] [support=yes|no] [pin=yes|no] :: TITLE :: MESSAGE';
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
  let cardStyle: TelegramAnnouncementCardStyle = 'DEFAULT';
  let includeSupportButton = true;
  let pinToInbox = false;
  let tag: string | null = null;
  let segment: string | null = null;
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

    if (key === 'style' || key === 'card') {
      const resolvedStyle = resolveTelegramAnnouncementCardStyleToken(rawValue);
      if (!resolvedStyle) {
        return { error: usage } satisfies TelegramAdminAnnouncementParseResult;
      }
      cardStyle = resolvedStyle;
      continue;
    }

    if (key === 'tag') {
      tag = rawValue.toLowerCase();
      continue;
    }

    if (key === 'segment') {
      const normalizedSegment = rawValue.trim().toUpperCase();
      if (!['TRIAL_TO_PAID', 'PREMIUM_UPSELL', 'RENEWAL_SOON', 'HIGH_VALUE'].includes(normalizedSegment)) {
        return { error: usage } satisfies TelegramAdminAnnouncementParseResult;
      }
      segment = normalizedSegment;
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

    if (key === 'pin') {
      pinToInbox = ['yes', 'true', '1'].includes(rawValue.toLowerCase());
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
    cardStyle,
    title,
    message,
    includeSupportButton,
    pinToInbox,
    filters: {
      tag,
      segment,
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
    locale === 'my' ? '📣 <b>မကြာသေးမီက announcement များ</b>' : '📣 <b>Recent announcements</b>',
    '',
  ];

  for (const announcement of announcements) {
    lines.push(
      `• <b>${escapeHtml(announcement.title)}</b>`,
      `  ${escapeHtml(announcement.type)} • ${escapeHtml(announcement.status)} • ${announcement.sentCount}/${announcement.totalRecipients}`,
      `  ${formatTelegramAnnouncementTargetSummary({
        directUserLabel: announcement.targetDirectUserLabel,
        tag: announcement.targetTag,
        segment: announcement.targetSegment,
        serverName: announcement.targetServerName,
        countryCode: announcement.targetCountryCode,
        locale,
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
      ? 'အသုံးပြုပုံ: /scheduleannouncement YYYY-MM-DDThh:mm [repeat=daily|weekly] AUDIENCE [filters] :: TITLE :: MESSAGE'
      : 'Usage: /scheduleannouncement YYYY-MM-DDThh:mm [repeat=daily|weekly] AUDIENCE [filters] :: TITLE :: MESSAGE';
  }

  const scheduledFor = new Date(rawSchedule);
  if (Number.isNaN(scheduledFor.getTime()) || scheduledFor.getTime() <= Date.now() + 60_000) {
    return locale === 'my'
      ? 'အနည်းဆုံး ၁ မိနစ်အနာဂတ်အချိန်ကို သတ်မှတ်ပါ။'
      : 'Choose a valid future time at least one minute from now.';
  }

  let recurrenceType: TelegramAnnouncementRecurrenceType = 'NONE';
  if (restTokens[0]?.startsWith('repeat=')) {
    const rawRepeat = restTokens.shift()?.split('=').slice(1).join('=');
    const resolvedRecurrence = resolveTelegramAnnouncementRecurrenceToken(rawRepeat);
    if (!resolvedRecurrence || resolvedRecurrence === 'NONE') {
      return locale === 'my'
        ? 'repeat=daily သို့မဟုတ် repeat=weekly ကို အသုံးပြုပါ။'
        : 'Use repeat=daily or repeat=weekly.';
    }
    recurrenceType = resolvedRecurrence;
  }

  const parsed = await parseTelegramAdminAnnouncementArgs(restTokens.join(' '), locale);
  if (!isTelegramAdminAnnouncementParseSuccess(parsed)) {
    return parsed.error;
  }

  const totalRecipients = (
    await resolveTelegramAnnouncementRecipients({
      audience: parsed.audience,
      type: parsed.type,
      filters: parsed.filters,
    })
  ).length;
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
      cardStyle: parsed.cardStyle,
      includeSupportButton: parsed.includeSupportButton,
      pinToInbox: parsed.pinToInbox,
      status: 'SCHEDULED',
      scheduledFor,
      recurrenceType: recurrenceType === 'NONE' ? null : recurrenceType,
      createdByEmail: 'telegram-admin',
      targetTag: parsed.filters.tag,
      targetSegment: parsed.filters.segment,
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
      cardStyle: parsed.cardStyle,
      filters: parsed.filters,
      scheduledFor: scheduledFor.toISOString(),
      recurrenceType,
      via: 'telegram_bot',
    },
  });

  return locale === 'my'
    ? `🗓️ Announcement ကို ${formatTelegramDateTime(scheduledFor, locale)} တွင်${recurrenceType === 'DAILY' ? ' နေ့စဉ်' : recurrenceType === 'WEEKLY' ? ' အပတ်စဉ်' : ''} ပို့ရန် schedule လုပ်ပြီးပါပြီ။`
    : `🗓️ Scheduled the announcement for ${formatTelegramDateTime(scheduledFor, locale)}${recurrenceType === 'DAILY' ? ' and repeat it daily' : recurrenceType === 'WEEKLY' ? ' and repeat it weekly' : ''}.`;
}

export async function handleAnnounceCommand(argsText: string, locale: SupportedLocale) {
  const parsed = await parseTelegramAdminAnnouncementArgs(argsText, locale);
  if (!isTelegramAdminAnnouncementParseSuccess(parsed)) {
    return parsed.error;
  }

  const totalRecipients = (
    await resolveTelegramAnnouncementRecipients({
      audience: parsed.audience,
      type: parsed.type,
      filters: parsed.filters,
    })
  ).length;
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
      cardStyle: parsed.cardStyle,
      includeSupportButton: parsed.includeSupportButton,
      pinToInbox: parsed.pinToInbox,
      status: 'SCHEDULED',
      scheduledFor: new Date(),
      createdByEmail: 'telegram-admin',
      targetTag: parsed.filters.tag,
      targetSegment: parsed.filters.segment,
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
      cardStyle: parsed.cardStyle,
      filters: parsed.filters,
      sentCount: result.sentCount,
      failedCount: result.failedCount,
      via: 'telegram_bot',
    },
  });

  return locale === 'my'
    ? `📣 Announcement ကို user ${result.sentCount} ယောက်ထံ ပို့ပြီးပါပြီ။${result.failedCount > 0 ? ` • failed ${result.failedCount}` : ''}`
    : `📣 Sent the announcement to ${result.sentCount} user(s).${result.failedCount > 0 ? ` Failed: ${result.failedCount}.` : ''}`;
}

export async function handleAnnounceUserCommand(
  argsText: string,
  locale: SupportedLocale,
) {
  const usage =
    locale === 'my'
      ? 'အသုံးပြုပုံ: /announceuser CHAT-ID|EMAIL|@USERNAME [type=info|announcement|promo|new_server|maintenance] [style=default|promo|premium|ops] [support=yes|no] :: TITLE :: MESSAGE'
      : 'Usage: /announceuser CHAT-ID|EMAIL|@USERNAME [type=info|announcement|promo|new_server|maintenance] [style=default|promo|premium|ops] [support=yes|no] :: TITLE :: MESSAGE';

  const parts = argsText
    .split('::')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 3) {
    return usage;
  }

  const [targetPart, title, ...messageParts] = parts;
  const message = messageParts.join(' :: ').trim();
  const tokens = targetPart.split(/\s+/).filter(Boolean);
  const recipientQuery = tokens.shift();
  if (!recipientQuery || title.length < 3 || message.length < 10) {
    return usage;
  }

  const recipient = await resolveSingleTelegramAnnouncementRecipient(recipientQuery);
  if (!recipient) {
    return locale === 'my'
      ? 'Telegram recipient ကို မတွေ့ပါ။ Chat ID, email, သို့မဟုတ် @username ကို အသုံးပြုပါ။'
      : 'Telegram recipient not found. Use a chat ID, email, or @username.';
  }

  let type: TelegramAnnouncementType = 'ANNOUNCEMENT';
  let cardStyle: TelegramAnnouncementCardStyle = 'DEFAULT';
  let includeSupportButton = true;
  let pinToInbox = true;

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
        return usage;
      }
      type = resolvedType;
      continue;
    }

    if (key === 'style' || key === 'card') {
      const resolvedStyle = resolveTelegramAnnouncementCardStyleToken(rawValue);
      if (!resolvedStyle) {
        return usage;
      }
      cardStyle = resolvedStyle;
      continue;
    }

    if (key === 'support') {
      includeSupportButton = !['no', 'false', '0'].includes(rawValue.toLowerCase());
      continue;
    }

    if (key === 'pin') {
      pinToInbox = ['yes', 'true', '1'].includes(rawValue.toLowerCase());
    }
  }

  const announcement = await db.telegramAnnouncement.create({
    data: {
      audience: 'DIRECT_USER',
      type,
      targetDirectChatId: recipient.chatId,
      targetDirectUserLabel: recipient.label,
      title,
      message,
      cardStyle,
      includeSupportButton,
      pinToInbox,
      status: 'SCHEDULED',
      scheduledFor: new Date(),
      createdByEmail: 'telegram-admin',
      totalRecipients: 1,
    },
  });

  const result = await dispatchTelegramAnnouncement({
    announcementId: announcement.id,
    now: new Date(),
  });

  if (result.skipped) {
    return locale === 'my'
      ? 'Message ကို မပို့နိုင်ပါ။ Telegram settings ကို စစ်ဆေးပါ။'
      : 'The direct Telegram message could not be sent. Check the Telegram configuration.';
  }

  await writeAuditLog({
    action: 'TELEGRAM_ADMIN_DIRECT_ANNOUNCEMENT_SENT',
    entity: 'TELEGRAM_ANNOUNCEMENT',
    entityId: announcement.id,
    details: {
      audience: 'DIRECT_USER',
      recipient: recipient.label,
      recipientChatId: recipient.chatId,
      type,
      cardStyle,
      via: 'telegram_bot',
    },
  });

  return locale === 'my'
    ? `📨 ${escapeHtml(recipient.label)} ထံ message ကို ပို့ပြီးပါပြီ။`
    : `📨 Sent the message to ${escapeHtml(recipient.label)}.`;
}
