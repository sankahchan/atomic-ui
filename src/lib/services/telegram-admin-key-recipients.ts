import { db } from '@/lib/db';
import { type SupportedLocale } from '@/lib/i18n/config';
import { escapeHtml } from '@/lib/services/telegram-ui';

export type RecipientTarget = {
  mode:
    | 'NONE'
    | 'KNOWN'
    | 'EXACT_REPLY'
    | 'EMAIL_ONLY'
    | 'USERNAME_ONLY'
    | 'AMBIGUOUS_USERNAME'
    | 'CHAT_ID_ONLY';
  label: string;
  chatId: string | null;
  telegramId: string | null;
  userId: string | null;
  email: string | null;
  username: string | null;
};

function parseReplyRecipientSeed(query: string) {
  const match = query.trim().match(/^reply-user:(\d+)$/i);
  return match?.[1] || null;
}

export function formatRecipientSummary(
  recipient: RecipientTarget | null,
  locale: SupportedLocale,
) {
  if (!recipient || recipient.mode === 'NONE') {
    return locale === 'my' ? 'No recipient linked' : 'No recipient linked';
  }

  const parts = [`<b>${escapeHtml(recipient.label)}</b>`];
  if ((recipient.mode === 'KNOWN' || recipient.mode === 'EXACT_REPLY') && recipient.chatId) {
    parts.push(locale === 'my' ? 'linked chat • direct send ready' : 'linked chat • direct send ready');
  } else if (recipient.mode === 'AMBIGUOUS_USERNAME') {
    parts.push(locale === 'my' ? 'username ambiguous • create only' : 'username ambiguous • create only');
  } else if (recipient.mode === 'EMAIL_ONLY') {
    parts.push(locale === 'my' ? 'email only • connect link fallback' : 'email only • connect link fallback');
  } else if (recipient.mode === 'USERNAME_ONLY') {
    parts.push(locale === 'my' ? 'username hint only • create only' : 'username hint only • create only');
  } else if (recipient.mode === 'CHAT_ID_ONLY' && recipient.chatId) {
    parts.push(locale === 'my' ? 'manual chat id • create only' : 'manual chat id • create only');
  } else {
    parts.push(locale === 'my' ? 'create only' : 'create only');
  }
  return parts.join(' • ');
}

export function buildRecipientGuidanceLines(
  recipient: RecipientTarget | null,
  locale: SupportedLocale,
) {
  if (!recipient || recipient.mode === 'NONE') {
    return [
      locale === 'my'
        ? 'No recipient linked yet. Create only will return a connect link.'
        : 'No recipient linked yet. Create only will return a connect link.',
    ];
  }

  if ((recipient.mode === 'KNOWN' || recipient.mode === 'EXACT_REPLY') && recipient.chatId) {
    return [
      locale === 'my'
        ? 'This recipient has a linked Telegram chat. Create & send can deliver directly.'
        : 'This recipient has a linked Telegram chat. Create & send can deliver directly.',
    ];
  }

  if (recipient.mode === 'AMBIGUOUS_USERNAME') {
    return [
      locale === 'my'
        ? 'This @username matches more than one Telegram profile. Use email, a linked chat, or reply to the user message for direct delivery.'
        : 'This @username matches more than one Telegram profile. Use email, a linked chat, or reply to the user message for direct delivery.',
    ];
  }

  if (recipient.mode === 'EMAIL_ONLY') {
    return [
      locale === 'my'
        ? 'Only email ownership is known. Create only will return a connect link.'
        : 'Only email ownership is known. Create only will return a connect link.',
    ];
  }

  if (recipient.mode === 'USERNAME_ONLY') {
    return [
      locale === 'my'
        ? 'Telegram username is stored as a hint only. The bot still needs a linked chat before direct delivery works.'
        : 'Telegram username is stored as a hint only. The bot still needs a linked chat before direct delivery works.',
    ];
  }

  return [
    locale === 'my'
      ? 'A manual Telegram chat ID was provided, but it is not treated as verified delivery identity. Create only will return a connect link.'
      : 'A manual Telegram chat ID was provided, but it is not treated as verified delivery identity. Create only will return a connect link.',
  ];
}

export function canDirectSendToRecipient(
  recipient: RecipientTarget | null,
): recipient is RecipientTarget & { chatId: string } {
  return Boolean(
    recipient
      && recipient.chatId
      && (recipient.mode === 'KNOWN' || recipient.mode === 'EXACT_REPLY'),
  );
}

export function getPersistedRecipientTelegramId(recipient: RecipientTarget | null) {
  if (!recipient) {
    return null;
  }

  if (recipient.mode === 'KNOWN' || recipient.mode === 'EXACT_REPLY') {
    return recipient.telegramId || recipient.chatId;
  }

  return null;
}

export async function resolveRecipientTarget(query: string): Promise<RecipientTarget | null> {
  const trimmed = query.trim();
  if (!trimmed) {
    return null;
  }

  const replyRecipientTelegramId = parseReplyRecipientSeed(trimmed);
  const normalizedUsername = trimmed.replace(/^@/, '').trim().toLowerCase();
  const usernameQuery = trimmed.startsWith('@') ? normalizedUsername : null;
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
  const directNumeric = replyRecipientTelegramId || (/^\d+$/.test(trimmed) ? trimmed : null);

  const profileWhere = [
    directNumeric ? { telegramChatId: directNumeric } : undefined,
    directNumeric ? { telegramUserId: directNumeric } : undefined,
    usernameQuery ? { username: usernameQuery } : undefined,
  ].filter(Boolean);

  const [profiles, user, accessKey, dynamicKey] = await Promise.all([
    profileWhere.length > 0
      ? db.telegramUserProfile.findMany({
          where: {
            OR: profileWhere as any,
          },
          select: {
            telegramChatId: true,
            telegramUserId: true,
            username: true,
          },
          take: 3,
        })
      : Promise.resolve([]),
    db.user.findFirst({
      where: {
        OR: [
          isEmail ? { email: trimmed.toLowerCase() } : undefined,
          directNumeric ? { telegramChatId: directNumeric } : undefined,
        ].filter(Boolean) as any,
      },
      select: {
        id: true,
        email: true,
        telegramChatId: true,
      },
    }),
    db.accessKey.findFirst({
      where: {
        OR: [
          isEmail ? { email: trimmed.toLowerCase() } : undefined,
          directNumeric ? { telegramId: directNumeric } : undefined,
        ].filter(Boolean) as any,
      },
      select: {
        userId: true,
        email: true,
        telegramId: true,
      },
    }),
    db.dynamicAccessKey.findFirst({
      where: {
        OR: [
          isEmail ? { email: trimmed.toLowerCase() } : undefined,
          directNumeric ? { telegramId: directNumeric } : undefined,
        ].filter(Boolean) as any,
      },
      select: {
        userId: true,
        email: true,
        telegramId: true,
      },
    }),
  ]);

  const directProfile = directNumeric
    ? profiles.find(
        (profile) => profile.telegramChatId === directNumeric || profile.telegramUserId === directNumeric,
      ) || null
    : null;
  const usernameProfiles = usernameQuery
    ? profiles.filter((profile) => (profile.username || '').toLowerCase() === usernameQuery)
    : [];
  const uniqueUsernameProfile = usernameProfiles.length === 1 ? usernameProfiles[0] : null;
  const profile = directProfile || uniqueUsernameProfile || null;
  const chatId =
    profile?.telegramChatId
    || user?.telegramChatId
    || accessKey?.telegramId
    || dynamicKey?.telegramId
    || null;
  const telegramId =
    profile?.telegramUserId
    || accessKey?.telegramId
    || dynamicKey?.telegramId
    || null;
  const userId = user?.id || accessKey?.userId || dynamicKey?.userId || null;
  const email = user?.email || accessKey?.email || dynamicKey?.email || (isEmail ? trimmed.toLowerCase() : null);
  const username = profile?.username || (usernameQuery ? usernameQuery : null);

  if (replyRecipientTelegramId) {
    return {
      mode: 'EXACT_REPLY',
      label: username ? `@${username}` : email || replyRecipientTelegramId,
      chatId: chatId || replyRecipientTelegramId,
      telegramId: telegramId || replyRecipientTelegramId,
      userId,
      email,
      username,
    };
  }

  if (directNumeric && (profile || user || accessKey || dynamicKey)) {
    return {
      mode: 'KNOWN',
      label: username ? `@${username}` : email || chatId || directNumeric,
      chatId: chatId || directNumeric,
      telegramId: telegramId || directNumeric,
      userId,
      email,
      username,
    };
  }

  if (usernameQuery && usernameProfiles.length > 1) {
    return {
      mode: 'AMBIGUOUS_USERNAME',
      label: `@${usernameQuery}`,
      chatId: null,
      telegramId: null,
      userId: null,
      email: null,
      username: usernameQuery,
    };
  }

  if (usernameQuery && uniqueUsernameProfile) {
    return {
      mode: uniqueUsernameProfile.telegramChatId ? 'KNOWN' : 'USERNAME_ONLY',
      label: `@${usernameQuery}`,
      chatId: uniqueUsernameProfile.telegramChatId || null,
      telegramId: uniqueUsernameProfile.telegramUserId || null,
      userId,
      email,
      username: usernameQuery,
    };
  }

  if (email) {
    return {
      mode: 'EMAIL_ONLY',
      label: email,
      chatId: null,
      telegramId: null,
      userId,
      email,
      username,
    };
  }

  if (usernameQuery) {
    return {
      mode: 'USERNAME_ONLY',
      label: `@${usernameQuery}`,
      chatId: null,
      telegramId: null,
      userId: null,
      email: null,
      username: usernameQuery,
    };
  }

  if (directNumeric) {
    return {
      mode: 'CHAT_ID_ONLY',
      label: directNumeric,
      chatId: directNumeric,
      telegramId: null,
      userId: null,
      email: null,
      username: null,
    };
  }

  return null;
}
