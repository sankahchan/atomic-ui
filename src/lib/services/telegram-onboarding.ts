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
import { acceptTelegramReferralCode, parseReferralStartArg } from '@/lib/services/telegram-referrals';
import { escapeHtml, getTelegramUi } from '@/lib/services/telegram-ui';

async function sendTelegramOfferNudgeIfAny(input: {
  botToken: string;
  chatId: number;
  telegramUserId: number;
  locale: SupportedLocale;
}) {
  const activeOffers = await db.telegramCouponRedemption.count({
    where: {
      AND: [
        {
          OR: [
            { telegramChatId: String(input.chatId) },
            { telegramUserId: String(input.telegramUserId) },
          ],
        },
        { status: 'ISSUED' },
        {
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } },
          ],
        },
      ],
    },
  });

  if (activeOffers <= 0) {
    return;
  }

  await sendTelegramMessage(
    input.botToken,
    input.chatId,
    input.locale === 'my'
      ? `🎟 You have <b>${activeOffers}</b> active offer${activeOffers === 1 ? '' : 's'}.\nUse /offers to compare them before you buy or renew.`
      : `🎟 You have <b>${activeOffers}</b> active offer${activeOffers === 1 ? '' : 's'}.\nUse /offers to compare them before you buy or renew.`,
  );
}

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
    const referralCode = parseReferralStartArg(trimmedArgs);
    if (referralCode) {
      const referralResult = await acceptTelegramReferralCode({
        telegramUserId: String(input.telegramUserId),
        telegramChatId: String(input.chatId),
        referralCode,
      });

      const referralMessage =
        referralResult.status === 'accepted'
          ? locale === 'my'
            ? `🎁 Referral code <b>${escapeHtml(referralResult.referralCode)}</b> ကို သိမ်းထားပြီးပါပြီ။ /buy ဖြင့် order စတင်သောအခါ apply လုပ်ပေးပါမည်။`
            : `🎁 Saved referral code <b>${escapeHtml(referralResult.referralCode)}</b>. It will be applied the next time you start an order with /buy.`
          : referralResult.status === 'already-applied'
            ? locale === 'my'
              ? `ℹ️ Referral code <b>${escapeHtml(referralResult.referralCode || referralCode)}</b> ကို မကြာသေးမီက သိမ်းထားပြီးဖြစ်ပါသည်။ /buy ဖြင့် ဆက်လုပ်နိုင်ပါသည်။`
              : `ℹ️ Referral code <b>${escapeHtml(referralResult.referralCode || referralCode)}</b> is already saved. Continue with /buy when you are ready.`
            : referralResult.status === 'self'
              ? locale === 'my'
                ? '❌ ကိုယ်ပိုင် referral code ကို မသုံးနိုင်ပါ။'
                : '❌ You cannot use your own referral code.'
              : locale === 'my'
                ? '❌ Referral code ကို မတွေ့ပါ။'
                : '❌ Referral code was not found.';

      await sendTelegramMessage(input.botToken, input.chatId, referralMessage, {
        replyMarkup: getCommandKeyboard(input.isAdmin, locale),
      });
      if (referralResult.status === 'accepted' || referralResult.status === 'already-applied') {
        await sendTelegramOfferNudgeIfAny({
          botToken: input.botToken,
          chatId: input.chatId,
          telegramUserId: input.telegramUserId,
          locale,
        });
      }
      return null;
    }

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
          replyMarkup: getCommandKeyboard(input.isAdmin, locale),
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
      replyMarkup: getCommandKeyboard(input.isAdmin, locale),
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
        replyMarkup: getCommandKeyboard(input.isAdmin, locale),
      },
    );
    await sendTelegramOfferNudgeIfAny({
      botToken: input.botToken,
      chatId: input.chatId,
      telegramUserId: input.telegramUserId,
      locale,
    });
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
        replyMarkup: getCommandKeyboard(input.isAdmin, locale),
      },
    );
    await sendTelegramOfferNudgeIfAny({
      botToken: input.botToken,
      chatId: input.chatId,
      telegramUserId: input.telegramUserId,
      locale,
    });
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
      replyMarkup: getCommandKeyboard(input.isAdmin, locale),
    },
  );
  await sendTelegramOfferNudgeIfAny({
    botToken: input.botToken,
    chatId: input.chatId,
    telegramUserId: input.telegramUserId,
    locale,
  });
  return null;
}
