import { type SupportedLocale } from '@/lib/i18n/config';
import { type TelegramAdminActor } from '@/lib/services/telegram-admin-core';
import { type TelegramAdminKeyDeps } from '@/lib/services/telegram-domain-types';
import {
  buildRecipientKeyboard,
  createEmptyAccessDraft,
  createEmptyDynamicDraft,
  savePendingAdminFlow,
} from '@/lib/services/telegram-admin-key-flow-state';
import {
  promptAccessCreateName,
  promptDynamicCreateName,
} from '@/lib/services/telegram-admin-key-handlers';
import { resolveRecipientTarget } from '@/lib/services/telegram-admin-key-recipients';

export async function handleAdminCreateAccessKeyCommand(input: {
  chatId: number;
  telegramUserId: number;
  locale: SupportedLocale;
  botToken: string;
  adminActor: TelegramAdminActor;
  argsText: string;
  deps: TelegramAdminKeyDeps;
}) {
  let draft = createEmptyAccessDraft();
  const query = input.argsText.trim();
  if (query) {
    const recipient = await resolveRecipientTarget(query);
    if (!recipient) {
      await savePendingAdminFlow(input.telegramUserId, input.chatId, draft);
      await input.deps.sendTelegramMessage(
        input.botToken,
        input.chatId,
        input.locale === 'my'
          ? 'Recipient ကို မတွေ့ပါ။ Email, @username, Telegram ID, သို့မဟုတ် chat ID တို့ဖြင့် ပြန်ပို့ပါ။'
          : 'Recipient not found. Send an email, @username, Telegram user ID, or chat ID.',
        {
          replyMarkup: buildRecipientKeyboard(input.locale),
        },
      );
      return null;
    }
    draft = {
      ...draft,
      recipient,
      step: 'name',
    };
    await savePendingAdminFlow(input.telegramUserId, input.chatId, draft);
    await promptAccessCreateName({
      draft,
      chatId: input.chatId,
      botToken: input.botToken,
      locale: input.locale,
      deps: input.deps,
    });
    return null;
  }

  await savePendingAdminFlow(input.telegramUserId, input.chatId, draft);
  await input.deps.sendTelegramMessage(
    input.botToken,
    input.chatId,
    [
      input.locale === 'my' ? '➕ <b>Create normal key</b>' : '➕ <b>Create normal key</b>',
      '',
      input.locale === 'my'
        ? 'Recipient အဖြစ် email, @username, Telegram user ID, သို့မဟုတ် chat ID ကို ပို့ပါ။ User မသတ်မှတ်ဘဲ ဆက်လိုပါက Skip ကိုနှိပ်ပါ။'
        : 'Send the recipient as an email, @username, Telegram user ID, or chat ID. Press Skip if you want to create without linking a recipient.',
      input.locale === 'my'
        ? 'Tip: user message ကို reply လုပ်ပြီး /createkey လို့ပို့လျှင် recipient ကို အလိုအလျောက်ယူပါမည်။'
        : 'Tip: reply to a user message with /createkey to seed the recipient automatically.',
    ].join('\n'),
    {
      replyMarkup: buildRecipientKeyboard(input.locale),
    },
  );
  return null;
}

export async function handleAdminCreateDynamicKeyCommand(input: {
  chatId: number;
  telegramUserId: number;
  locale: SupportedLocale;
  botToken: string;
  adminActor: TelegramAdminActor;
  argsText: string;
  deps: TelegramAdminKeyDeps;
}) {
  let draft = createEmptyDynamicDraft();
  const query = input.argsText.trim();
  if (query) {
    const recipient = await resolveRecipientTarget(query);
    if (!recipient) {
      await savePendingAdminFlow(input.telegramUserId, input.chatId, draft);
      await input.deps.sendTelegramMessage(
        input.botToken,
        input.chatId,
        input.locale === 'my'
          ? 'Recipient ကို မတွေ့ပါ။ Email, @username, Telegram ID, သို့မဟုတ် chat ID တို့ဖြင့် ပြန်ပို့ပါ။'
          : 'Recipient not found. Send an email, @username, Telegram user ID, or chat ID.',
        {
          replyMarkup: buildRecipientKeyboard(input.locale),
        },
      );
      return null;
    }
    draft = {
      ...draft,
      recipient,
      step: 'name',
    };
    await savePendingAdminFlow(input.telegramUserId, input.chatId, draft);
    await promptDynamicCreateName({
      draft,
      chatId: input.chatId,
      botToken: input.botToken,
      locale: input.locale,
      deps: input.deps,
    });
    return null;
  }

  await savePendingAdminFlow(input.telegramUserId, input.chatId, draft);
  await input.deps.sendTelegramMessage(
    input.botToken,
    input.chatId,
    [
      input.locale === 'my' ? '💎 <b>Create dynamic key</b>' : '💎 <b>Create dynamic key</b>',
      '',
      input.locale === 'my'
        ? 'Recipient အဖြစ် email, @username, Telegram user ID, သို့မဟုတ် chat ID ကို ပို့ပါ။ User မသတ်မှတ်ဘဲ ဆက်လိုပါက Skip ကိုနှိပ်ပါ။'
        : 'Send the recipient as an email, @username, Telegram user ID, or chat ID. Press Skip if you want to create without linking a recipient.',
      input.locale === 'my'
        ? 'Tip: user message ကို reply လုပ်ပြီး /createdynamic လို့ပို့လျှင် recipient ကို အလိုအလျောက်ယူပါမည်။'
        : 'Tip: reply to a user message with /createdynamic to seed the recipient automatically.',
    ].join('\n'),
    {
      replyMarkup: buildRecipientKeyboard(input.locale),
    },
  );
  return null;
}
