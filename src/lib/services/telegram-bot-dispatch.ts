import { db } from '@/lib/db';
import { getTelegramConversationLocale, getTelegramPendingAdminFlow, getTelegramPendingPremiumReply, getTelegramPendingSupportReply, getTelegramConfig, getTelegramSupportLink, sendTelegramMessage, setTelegramPendingPremiumReply, setTelegramPendingSupportReply, upsertTelegramUserProfile } from '@/lib/services/telegram-runtime';
import { getTelegramUi } from '@/lib/services/telegram-ui';
import { normalizeTelegramReplyKeyboardCommand } from '@/lib/services/telegram-callbacks';
import { getActiveTelegramOrder } from '@/lib/services/telegram-order-state';
import { type TelegramUpdate } from '@/lib/services/telegram-domain-types';
import { handleTelegramCallbackQuery, handleTelegramUpdate as handleTelegramUpdateCore, getTelegramAdminReplyRecipientSeed, sendAccessKeySharePageToTelegram, sendDynamicKeySharePageToTelegram, createAccessKeyTelegramConnectLink, createDynamicKeyTelegramConnectLink, sendTelegramPremiumSupportFollowUpAlert } from '@/lib/services/telegram-bot-core';
import { cancelTelegramAdminKeyFlow, handleTelegramAdminKeyMediaInput, handleTelegramAdminKeyTextInput } from '@/lib/services/telegram-admin';
import { resolveTelegramAdminActor } from '@/lib/services/telegram-admin-core';
import { handlePremiumSupportFollowUpText } from '@/lib/services/telegram-premium';
import { handleTelegramSupportReplyMedia, handleTelegramSupportReplyText } from '@/lib/services/telegram-support';
import { copyTelegramMessage } from '@/lib/services/telegram-runtime';
import { handleBuyCommand, handleEmailLink, handleGiftCommand, handleLanguageCommand, handleReferralCommand, handleRenewOrderCommand, handleStartCommand, handleTelegramOrderProofMessage, handleTelegramOrderTextMessage, handleTrialCommand } from '@/lib/services/telegram-user-command-handlers';

export async function handleTelegramUpdate(update: TelegramUpdate): Promise<string | null> {
  const callbackQuery = update.callback_query;
  if (callbackQuery) {
    const config = await getTelegramConfig();
    if (!config) {
      return null;
    }

    return handleTelegramCallbackQuery(callbackQuery, config);
  }

  const message = update.message;
  if (!message) return null;

  const chatId = message.chat.id;
  const telegramUserId = message.from.id;
  const username = message.from.username || message.from.first_name;
  const text = message.text?.trim() || '';

  const config = await getTelegramConfig();
  if (!config) return null;
  await upsertTelegramUserProfile({
    telegramUserId: String(telegramUserId),
    telegramChatId: String(chatId),
    username: message.from.username || null,
    displayName: message.from.first_name || null,
  });
  const locale = await getTelegramConversationLocale({
    telegramUserId,
    telegramChatId: chatId,
  });
  const ui = getTelegramUi(locale);
  const adminActor = await resolveTelegramAdminActor({
    telegramUserId,
    chatId,
    config,
  });
  const isAdmin = adminActor.isAdmin;

  const activeOrderForMedia =
    message.photo?.length || message.document
      ? await getActiveTelegramOrder(chatId, telegramUserId)
      : null;
  const pendingPremiumReplyForMedia = activeOrderForMedia
    ? null
    : (message.photo?.length || message.document)
      ? await getTelegramPendingPremiumReply({
          telegramUserId: String(telegramUserId),
          telegramChatId: String(chatId),
        })
      : null;
  const pendingSupportReplyForMedia =
    activeOrderForMedia || pendingPremiumReplyForMedia
      ? null
      : (message.photo?.length || message.document)
        ? await getTelegramPendingSupportReply({
            telegramUserId: String(telegramUserId),
            telegramChatId: String(chatId),
          })
        : null;
  const pendingAdminFlowForMedia =
    activeOrderForMedia || pendingPremiumReplyForMedia || pendingSupportReplyForMedia || !isAdmin
      ? null
      : (message.photo?.length || message.document)
        ? await getTelegramPendingAdminFlow({
            telegramUserId: String(telegramUserId),
            telegramChatId: String(chatId),
          })
        : null;

  if (message.photo?.length || message.document) {
    const largestPhoto = message.photo?.[message.photo.length - 1];
    const mediaKind = largestPhoto ? 'IMAGE' : 'FILE';
    const mediaTelegramFileId = largestPhoto?.file_id || message.document?.file_id || '';
    const mediaFilename =
      message.document?.file_name
      || (largestPhoto ? `telegram-photo-${message.message_id}.jpg` : null);
    const mediaContentType = message.document?.mime_type || (largestPhoto ? 'image/jpeg' : null);

    if (!activeOrderForMedia && pendingSupportReplyForMedia && mediaTelegramFileId) {
      return handleTelegramSupportReplyMedia({
        chatId,
        telegramUserId,
        username,
        locale,
        botToken: config.botToken,
        mediaKind,
        mediaTelegramFileId,
        mediaFilename,
        mediaContentType,
        caption: message.caption,
        getPendingSupportReply: getTelegramPendingSupportReply,
        setPendingSupportReply: setTelegramPendingSupportReply,
      });
    }
    if (!activeOrderForMedia && pendingPremiumReplyForMedia) {
      return locale === 'my'
        ? 'Premium support follow-up သည် ယခု text-only ဖြစ်ပါသည်။ Message ကို စာသားဖြင့် ပြန်ပို့ပေးပါ။'
        : 'Premium support follow-ups are text-only right now. Please send your reply as text.';
    }
    if (!activeOrderForMedia && pendingAdminFlowForMedia && mediaTelegramFileId) {
      const handled = await handleTelegramAdminKeyMediaInput({
        chatId,
        telegramUserId,
        locale,
        botToken: config.botToken,
        adminActor,
        caption: message.caption,
        messageId: message.message_id,
        mediaKind,
        mediaTelegramFileId,
        mediaFilename,
        mediaContentType,
        deps: {
          sendTelegramMessage,
          sendAccessKeySharePageToTelegram,
          sendDynamicKeySharePageToTelegram,
          createAccessKeyTelegramConnectLink,
          createDynamicKeyTelegramConnectLink,
          copyTelegramMessage,
        },
      });
      if (handled) {
        return null;
      }
    }

    return handleTelegramOrderProofMessage({
      botToken: config.botToken,
      chatId,
      telegramUserId,
      caption: message.caption,
      photo: message.photo,
      document: message.document,
      messageId: message.message_id,
    });
  }

  if (!text) {
    return null;
  }

  const activeOrder = await getActiveTelegramOrder(chatId, telegramUserId);
  const pendingPremiumReply = activeOrder
    ? null
    : await getTelegramPendingPremiumReply({
        telegramUserId: String(telegramUserId),
        telegramChatId: String(chatId),
      });
  const pendingSupportReply =
    activeOrder || pendingPremiumReply
      ? null
      : await getTelegramPendingSupportReply({
          telegramUserId: String(telegramUserId),
          telegramChatId: String(chatId),
        });
  if (!activeOrder && !pendingPremiumReply && !pendingSupportReply && isAdmin) {
    const handledAdminKeyText = await handleTelegramAdminKeyTextInput({
      chatId,
      telegramUserId,
      locale,
      botToken: config.botToken,
      adminActor,
      text,
      deps: {
        sendTelegramMessage,
        sendAccessKeySharePageToTelegram,
        sendDynamicKeySharePageToTelegram,
        createAccessKeyTelegramConnectLink,
        createDynamicKeyTelegramConnectLink,
        copyTelegramMessage,
      },
    });
    if (handledAdminKeyText) {
      return null;
    }
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!activeOrder && !pendingPremiumReply && !pendingSupportReply && emailRegex.test(text)) {
    return handleEmailLink(chatId, telegramUserId, text, locale);
  }

  const normalizedShortcutCommand = normalizeTelegramReplyKeyboardCommand(text, isAdmin);
  const commandText = normalizedShortcutCommand || text;
  const commandMatch = commandText.match(/^\/(\w+)(?:@\w+)?(?:\s+(.*))?$/);
  if (!commandMatch) {
    if (activeOrder) {
      return handleTelegramOrderTextMessage({
        chatId,
        telegramUserId,
        text,
        botToken: config.botToken,
      });
    }

    if (pendingPremiumReply) {
      return handlePremiumSupportFollowUpText({
        chatId,
        telegramUserId,
        username,
        locale,
        botToken: config.botToken,
        text,
        getTelegramPendingPremiumReply,
        setTelegramPendingPremiumReply,
        getTelegramSupportLink,
        sendTelegramPremiumSupportFollowUpAlert,
        sendTelegramMessage,
      });
    }

    if (pendingSupportReply) {
      return handleTelegramSupportReplyText({
        chatId,
        telegramUserId,
        username,
        locale,
        botToken: config.botToken,
        text,
        getPendingSupportReply: getTelegramPendingSupportReply,
        setPendingSupportReply: setTelegramPendingSupportReply,
      });
    }

    return null;
  }

  const command = commandMatch[1].toLowerCase();
  const argsText = commandMatch[2] || '';
  const adminReplyRecipientSeed = !argsText.trim()
    ? getTelegramAdminReplyRecipientSeed(message)
    : '';

  switch (command) {
    case 'start':
      return handleStartCommand(
        chatId,
        telegramUserId,
        username,
        isAdmin,
        config.botToken,
        argsText,
      );
    case 'language':
      return handleLanguageCommand(chatId, config.botToken);
    case 'buy':
      return handleBuyCommand(chatId, telegramUserId, username, locale, config.botToken, null, argsText);
    case 'gift':
      return handleGiftCommand(chatId, telegramUserId, username, locale, config.botToken, argsText);
    case 'referral':
      return handleReferralCommand(chatId, telegramUserId, username, locale);
    case 'trial':
      return handleTrialCommand(chatId, telegramUserId, username, locale, config.botToken);
    case 'renew':
      return handleRenewOrderCommand(chatId, telegramUserId, username, locale, config.botToken, argsText);
    case 'cancel': {
      const currentOrder = activeOrder ?? (await getActiveTelegramOrder(chatId, telegramUserId));
      if (!currentOrder && pendingPremiumReply) {
        await setTelegramPendingPremiumReply({
          telegramUserId: String(telegramUserId),
          telegramChatId: String(chatId),
          requestId: null,
        });
        return ui.premiumFollowUpCancelled;
      }
      if (!currentOrder && pendingSupportReply) {
        await setTelegramPendingSupportReply({
          telegramUserId: String(telegramUserId),
          telegramChatId: String(chatId),
          threadId: null,
        });
        return locale === 'my'
          ? 'Support reply draft ကို ဖျက်ပြီးပါပြီ။'
          : 'Cancelled the support reply draft.';
      }
      const pendingAdminFlow = !currentOrder && isAdmin
        ? await getTelegramPendingAdminFlow({
            telegramUserId: String(telegramUserId),
            telegramChatId: String(chatId),
          })
        : null;
      if (!currentOrder && pendingAdminFlow) {
        await cancelTelegramAdminKeyFlow({
          telegramUserId,
          chatId,
        });
        return locale === 'my'
          ? 'Telegram admin key wizard ကို ပယ်ဖျက်ပြီးပါပြီ။'
          : 'Cancelled the Telegram admin key wizard.';
      }

      if (!currentOrder) {
        return ui.noOrderToCancel;
      }

      await db.telegramOrder.update({
        where: { id: currentOrder.id },
        data: {
          status: 'CANCELLED',
          paymentStageEnteredAt: null,
          paymentReminderSentAt: null,
          reviewReminderSentAt: null,
          expiredAt: null,
        },
      });

      return ui.orderCancelled(currentOrder.orderCode);
    }
    default:
      return handleTelegramUpdateCore(update);
  }
}
