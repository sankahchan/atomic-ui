import { type SupportedLocale } from '@/lib/i18n/config';
import {
  buildTelegramLocaleSelectorKeyboard,
  buildTelegramLocaleSelectorMessage,
  getCommandKeyboard,
  parseTelegramLocaleCallbackData,
  parseTelegramNotificationPreferenceCallbackData,
} from '@/lib/services/telegram-callbacks';
import {
  buildTelegramNotificationPreferencesKeyboard,
  buildTelegramNotificationPreferencesMessage,
} from '@/lib/services/telegram-notifications';
import {
  answerTelegramCallbackQuery,
  getTelegramNotificationPreferences,
  sendTelegramMessage,
  setTelegramUserLocale,
  updateTelegramNotificationPreference,
  type TelegramConfig,
} from '@/lib/services/telegram-runtime';
import { escapeHtml, getTelegramUi } from '@/lib/services/telegram-ui';

export async function handleTelegramLocaleOrPreferenceCallback(input: {
  callbackQuery: any;
  config: TelegramConfig;
  isAdmin: boolean;
  deps: {
    getTelegramConversationLocale: (input: {
      telegramUserId: number;
      telegramChatId: number;
    }) => Promise<SupportedLocale>;
    handleStartCommand: (
      chatId: number,
      telegramUserId: number,
      username: string,
      isAdmin: boolean,
      botToken: string,
      argsText: string,
      localeOverride?: SupportedLocale,
    ) => Promise<string | null>;
  };
}) {
  const parsed = parseTelegramLocaleCallbackData(input.callbackQuery.data);
  const chatId = input.callbackQuery.message?.chat.id;
  if (!chatId) {
    await answerTelegramCallbackQuery(
      input.config.botToken,
      input.callbackQuery.id,
      'Unsupported action',
    );
    return { handled: true as const, result: null };
  }

  if (!parsed) {
    const notificationPreferenceAction = parseTelegramNotificationPreferenceCallbackData(input.callbackQuery.data);
    if (!notificationPreferenceAction) {
      return { handled: false as const, result: null };
    }

    const locale = await input.deps.getTelegramConversationLocale({
      telegramUserId: input.callbackQuery.from.id,
      telegramChatId: chatId,
    });

    await updateTelegramNotificationPreference({
      telegramUserId: String(input.callbackQuery.from.id),
      telegramChatId: String(chatId),
      preference: notificationPreferenceAction.preference,
      enabled: notificationPreferenceAction.enabled,
    });

    const preferences = await getTelegramNotificationPreferences({
      telegramUserId: String(input.callbackQuery.from.id),
      telegramChatId: String(chatId),
    });

    await answerTelegramCallbackQuery(
      input.config.botToken,
      input.callbackQuery.id,
      notificationPreferenceAction.enabled
        ? locale === 'my'
          ? 'Notification ကို ဖွင့်ပြီးပါပြီ'
          : 'Notification enabled'
        : locale === 'my'
          ? 'Notification ကို ပိတ်ပြီးပါပြီ'
          : 'Notification disabled',
    );

    await sendTelegramMessage(
      input.config.botToken,
      chatId,
      buildTelegramNotificationPreferencesMessage(locale, preferences, false),
      {
        replyMarkup: buildTelegramNotificationPreferencesKeyboard(locale, preferences),
      },
    );
    return { handled: true as const, result: null };
  }

  await setTelegramUserLocale({
    telegramUserId: String(input.callbackQuery.from.id),
    telegramChatId: String(chatId),
    username: input.callbackQuery.from.username || null,
    displayName: input.callbackQuery.from.first_name || null,
    locale: parsed.locale,
  });

  const ui = getTelegramUi(parsed.locale);
  const languageName = parsed.locale === 'my' ? 'မြန်မာ' : 'English';
  await answerTelegramCallbackQuery(
    input.config.botToken,
    input.callbackQuery.id,
    parsed.context === 'switch'
      ? parsed.locale === 'my'
        ? 'ဘာသာစကား ပြောင်းပြီးပါပြီ'
        : 'Language updated'
      : undefined,
  );

  if (parsed.context === 'switch') {
    await sendTelegramMessage(
      input.config.botToken,
      chatId,
      [
        ui.languageChanged(escapeHtml(languageName)),
        '',
        ui.languagePromptDesc,
      ].join('\n'),
      {
        replyMarkup: getCommandKeyboard(input.isAdmin, parsed.locale),
      },
    );
    return { handled: true as const, result: null };
  }

  return {
    handled: true as const,
    result: await input.deps.handleStartCommand(
      chatId,
      input.callbackQuery.from.id,
      input.callbackQuery.from.username || input.callbackQuery.from.first_name,
      input.isAdmin,
      input.config.botToken,
      parsed.startArgs || '',
      parsed.locale,
    ),
  };
}
