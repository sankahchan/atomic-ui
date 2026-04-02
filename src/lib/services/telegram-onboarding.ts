import { db } from '@/lib/db';
import { coerceSupportedLocale, type SupportedLocale } from '@/lib/i18n/config';
import { getCommandKeyboard } from '@/lib/services/telegram-callbacks';
import {
  buildTelegramLocaleSelectorKeyboard,
  buildTelegramLocaleSelectorMessage,
} from '@/lib/services/telegram-callbacks';
import {
  getTelegramDefaultLocale,
  getTelegramUserProfile,
  sendTelegramMessage,
  type TelegramConfig,
} from '@/lib/services/telegram-runtime';
import { escapeHtml, getTelegramUi } from '@/lib/services/telegram-ui';

export async function handleTelegramStartCommand(input: {
  chatId: number;
  telegramUserId: number;
  username: string;
  isAdmin: boolean;
  botToken: string;
  argsText: string;
  localeOverride?: SupportedLocale;
  deps: {
    getTelegramConfig: () => Promise<TelegramConfig | null>;
    markTelegramLinkTokenConsumed: (input: {
      token: string;
      chatId: string;
      telegramUserId: string;
    }) => Promise<{
      status:
        | 'linked'
        | 'already-linked'
        | 'expired'
        | 'invalid'
        | 'missing'
        | 'missing-key';
      accessKeyId: string | null;
      dynamicAccessKeyId: string | null;
    }>;
    resolveTelegramTemplate: (
      templates: Record<string, string> | undefined,
      locale: SupportedLocale,
      fallback?: string,
    ) => string;
    sendAccessKeySharePageToTelegram: (input: {
      accessKeyId: string;
      chatId?: string | number | null;
      reason?: 'CREATED' | 'RESENT' | 'LINKED' | 'KEY_ENABLED' | 'USAGE_REQUEST' | 'SUBSCRIPTION_REQUEST';
      source?: string | null;
      includeQr?: boolean;
      locale?: SupportedLocale;
    }) => Promise<unknown>;
    sendDynamicKeySharePageToTelegram: (input: {
      dynamicAccessKeyId: string;
      chatId?: string | number | null;
      planName?: string | null;
      reason?: 'CREATED' | 'RESENT' | 'LINKED' | 'KEY_ENABLED' | 'USAGE_REQUEST' | 'SUBSCRIPTION_REQUEST';
      source?: string | null;
      includeQr?: boolean;
      locale?: SupportedLocale;
    }) => Promise<unknown>;
  };
}): Promise<string | null> {
  const trimmedArgs = input.argsText.trim();
  const config = await input.deps.getTelegramConfig();
  const profile = await getTelegramUserProfile(String(input.telegramUserId), String(input.chatId));

  if (
    config?.showLanguageSelectorOnStart !== false &&
    !input.localeOverride &&
    !coerceSupportedLocale(profile?.locale)
  ) {
    await sendTelegramMessage(
      input.botToken,
      input.chatId,
      buildTelegramLocaleSelectorMessage('start'),
      {
        replyMarkup: buildTelegramLocaleSelectorKeyboard('start', trimmedArgs || undefined),
      },
    );
    return null;
  }

  const locale =
    input.localeOverride ||
    coerceSupportedLocale(profile?.locale) ||
    config?.defaultLanguage ||
    (await getTelegramDefaultLocale());
  const ui = getTelegramUi(locale);

  if (trimmedArgs) {
    const linkResult = await input.deps.markTelegramLinkTokenConsumed({
      token: trimmedArgs,
      chatId: String(input.chatId),
      telegramUserId: String(input.telegramUserId),
    });

    if (linkResult.status === 'linked' || linkResult.status === 'already-linked') {
      await sendTelegramMessage(
        input.botToken,
        input.chatId,
        ui.startLinked(escapeHtml(input.username)),
        {
          replyMarkup: getCommandKeyboard(input.isAdmin),
        },
      );

      if (linkResult.accessKeyId) {
        try {
          await input.deps.sendAccessKeySharePageToTelegram({
            accessKeyId: linkResult.accessKeyId,
            chatId: String(input.chatId),
            reason: 'LINKED',
            source: 'telegram_start',
          });
        } catch (error) {
          console.error('Failed to send share page after Telegram link:', error);
        }
      }

      if (linkResult.dynamicAccessKeyId) {
        try {
          await input.deps.sendDynamicKeySharePageToTelegram({
            dynamicAccessKeyId: linkResult.dynamicAccessKeyId,
            chatId: String(input.chatId),
            reason: 'LINKED',
            source: 'telegram_start',
          });
        } catch (error) {
          console.error('Failed to send dynamic share page after Telegram link:', error);
        }
      }

      return null;
    }

    const errorMessage =
      linkResult.status === 'expired'
        ? ui.linkExpired
        : ui.linkInvalid;

    await sendTelegramMessage(input.botToken, input.chatId, errorMessage, {
      replyMarkup: getCommandKeyboard(input.isAdmin),
    });
    return null;
  }

  const existingUser = await db.user.findFirst({
    where: { telegramChatId: String(input.chatId) },
  });

  if (existingUser) {
    await sendTelegramMessage(
      input.botToken,
      input.chatId,
      ui.welcomeBack(escapeHtml(input.username)),
      {
        replyMarkup: getCommandKeyboard(input.isAdmin),
      },
    );
    return null;
  }

  const key = await db.accessKey.findFirst({
    where: { telegramId: String(input.telegramUserId) },
    include: { user: true },
  });

  if (key?.user) {
    await db.user.update({
      where: { id: key.user.id },
      data: { telegramChatId: String(input.chatId) },
    });

    await sendTelegramMessage(
      input.botToken,
      input.chatId,
      ui.accountLinked(escapeHtml(input.username)),
      {
        replyMarkup: getCommandKeyboard(input.isAdmin),
      },
    );
    return null;
  }

  const adminMsg = input.isAdmin ? ui.adminRecognized : '';
  const welcomeMessage = input.deps.resolveTelegramTemplate(
    config?.localizedWelcomeMessages,
    locale,
    config?.welcomeMessage || ui.defaultWelcome,
  );

  await sendTelegramMessage(
    input.botToken,
    input.chatId,
    ui.hello(escapeHtml(input.username), escapeHtml(welcomeMessage), input.telegramUserId, adminMsg),
    {
      replyMarkup: getCommandKeyboard(input.isAdmin),
    },
  );
  return null;
}
