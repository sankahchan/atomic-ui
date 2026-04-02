import { db } from '@/lib/db';
import { type SupportedLocale } from '@/lib/i18n/config';
import { type TelegramConfig } from '@/lib/services/telegram-runtime';

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
