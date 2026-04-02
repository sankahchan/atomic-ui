import { type SupportedLocale } from '@/lib/i18n/config';
import {
  buildTelegramLocaleSelectorKeyboard,
  buildTelegramLocaleSelectorMessage,
  buildTelegramNotificationPreferenceCallbackData,
  getCommandKeyboard,
  parseTelegramLocaleCallbackData,
  parseTelegramNotificationPreferenceCallbackData,
} from '@/lib/services/telegram-callbacks';
import {
  answerTelegramCallbackQuery,
  getTelegramNotificationPreferenceLabel,
  getTelegramNotificationPreferences,
  sendTelegramMessage,
  setTelegramUserLocale,
  updateTelegramNotificationPreference,
  type TelegramConfig,
} from '@/lib/services/telegram-runtime';
import { escapeHtml, getTelegramUi } from '@/lib/services/telegram-ui';

export function buildTelegramNotificationPreferencesKeyboard(
  locale: SupportedLocale,
  preferences: Awaited<ReturnType<typeof getTelegramNotificationPreferences>>,
) {
  const renderToggle = (key: 'promo' | 'maintenance' | 'receipt' | 'support') => {
    const enabled = preferences[key];
    const label = getTelegramNotificationPreferenceLabel(key, locale);
    return {
      text: `${enabled ? '✅' : '⚪️'} ${label}`,
      callback_data: buildTelegramNotificationPreferenceCallbackData(key, !enabled),
    };
  };

  return {
    inline_keyboard: [
      [renderToggle('promo')],
      [renderToggle('maintenance')],
      [renderToggle('receipt')],
      [renderToggle('support')],
    ],
  };
}

export async function handleNotificationPreferencesCommand(input: {
  chatId: number;
  telegramUserId: number;
  locale: SupportedLocale;
  botToken: string;
}) {
  const preferences = await getTelegramNotificationPreferences({
    telegramUserId: String(input.telegramUserId),
    telegramChatId: String(input.chatId),
  });

  const lines = [
    input.locale === 'my'
      ? '🔔 <b>Notification preferences</b>'
      : '🔔 <b>Notification preferences</b>',
    '',
    `• ${getTelegramNotificationPreferenceLabel('promo', input.locale)}: <b>${preferences.promo ? 'ON' : 'OFF'}</b>`,
    `• ${getTelegramNotificationPreferenceLabel('maintenance', input.locale)}: <b>${preferences.maintenance ? 'ON' : 'OFF'}</b>`,
    `• ${getTelegramNotificationPreferenceLabel('receipt', input.locale)}: <b>${preferences.receipt ? 'ON' : 'OFF'}</b>`,
    `• ${getTelegramNotificationPreferenceLabel('support', input.locale)}: <b>${preferences.support ? 'ON' : 'OFF'}</b>`,
    '',
    input.locale === 'my'
      ? 'အောက်ပါ button များဖြင့် ON/OFF ပြောင်းနိုင်ပါသည်။'
      : 'Use the buttons below to turn each type on or off.',
  ];

  await sendTelegramMessage(input.botToken, input.chatId, lines.join('\n'), {
    replyMarkup: buildTelegramNotificationPreferencesKeyboard(input.locale, preferences),
  });

  return null;
}

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
      [
        locale === 'my'
          ? '🔔 <b>Notification preferences</b>'
          : '🔔 <b>Notification preferences</b>',
        '',
        `• ${getTelegramNotificationPreferenceLabel('promo', locale)}: <b>${preferences.promo ? 'ON' : 'OFF'}</b>`,
        `• ${getTelegramNotificationPreferenceLabel('maintenance', locale)}: <b>${preferences.maintenance ? 'ON' : 'OFF'}</b>`,
        `• ${getTelegramNotificationPreferenceLabel('receipt', locale)}: <b>${preferences.receipt ? 'ON' : 'OFF'}</b>`,
        `• ${getTelegramNotificationPreferenceLabel('support', locale)}: <b>${preferences.support ? 'ON' : 'OFF'}</b>`,
      ].join('\n'),
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
        replyMarkup: getCommandKeyboard(input.isAdmin),
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
