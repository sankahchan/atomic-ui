import { db } from '@/lib/db';
import { coerceSupportedLocale, type SupportedLocale } from '@/lib/i18n/config';
import { getTelegramDefaultLocale, getTelegramConfig, sendTelegramMessage, loadAccessKeyForMessaging } from '@/lib/services/telegram-runtime';
import { getTelegramUi, escapeHtml } from '@/lib/services/telegram-ui';
import { buildTelegramMenuCallbackData } from '@/lib/services/telegram-callbacks';

export async function runTelegramTrialLifecycleCycle(input: { now?: Date } = {}) {
  const now = input.now ?? new Date();
  const config = await getTelegramConfig();
  if (!config) {
    return { skipped: true, midpointSent: 0, expiringSent: 0, expiredSent: 0, winbackSent: 0 };
  }

  const profiles = await db.telegramUserProfile.findMany({
    where: {
      trialUsed: true,
      trialKeyId: { not: null },
      trialStartedAt: { not: null },
      trialExpiresAt: { not: null },
      OR: [
        { trialMidpointReminderSentAt: null },
        { trialExpiringReminderSentAt: null },
        { trialExpiredNoticeSentAt: null },
        { trialWinbackNudgeSentAt: null },
      ],
    },
    select: {
      telegramUserId: true,
      telegramChatId: true,
      trialKeyId: true,
      trialStartedAt: true,
      trialExpiresAt: true,
      trialMidpointReminderSentAt: true,
      trialExpiringReminderSentAt: true,
      trialExpiredNoticeSentAt: true,
      trialWinbackNudgeSentAt: true,
      locale: true,
    },
  });

  let midpointSent = 0;
  let expiringSent = 0;
  let expiredSent = 0;
  let winbackSent = 0;

  for (const profile of profiles) {
    const locale = coerceSupportedLocale(profile.locale) || await getTelegramDefaultLocale();
    const ui = getTelegramUi(locale);
    const chatId = Number(profile.telegramChatId);
    if (!chatId) continue;

    // Check if user has converted (has a fulfilled order or active non-trial keys)
    const [fulfilledOrders, otherKeys] = await Promise.all([
      db.telegramOrder.count({
        where: {
          telegramUserId: profile.telegramUserId,
          status: 'FULFILLED',
        },
      }),
      db.accessKey.count({
        where: {
          telegramId: profile.telegramUserId,
          id: { not: profile.trialKeyId! },
          status: { in: ['ACTIVE', 'PENDING'] },
        },
      }),
    ]);

    const hasConverted = fulfilledOrders > 0 || otherKeys > 0;

    const startedAt = profile.trialStartedAt!;
    const expiresAt = profile.trialExpiresAt!;
    const midpointTime = new Date(startedAt.getTime() + (expiresAt.getTime() - startedAt.getTime()) / 2);
    const expiringTime = new Date(expiresAt.getTime() - 6 * 60 * 60 * 1000);
    const winbackTime = new Date(expiresAt.getTime() + 24 * 60 * 60 * 1000);

    // 1. Midpoint Reminder (24 hours after activation)
    if (!profile.trialMidpointReminderSentAt && now >= midpointTime && now < expiresAt) {
      const key = await loadAccessKeyForMessaging(profile.trialKeyId!);
      if (key) {
        const usedGb = key.usedBytes ? (Number(key.usedBytes) / (1024 * 1024 * 1024)).toFixed(2) : '0.00';
        const limitGb = key.dataLimitBytes ? Number(key.dataLimitBytes) / (1024 * 1024 * 1024) : 5;
        const progress = Math.min(100, (Number(usedGb) / limitGb) * 100);
        const bars = Math.round(progress / 10);
        const progressBar = '▓'.repeat(bars) + '░'.repeat(10 - bars);
        const isMyanmar = locale === 'my';
        
        const text = [
          '⏳ <b>Trial Reminder</b>',
          '━━━━━━━━━━━━━━━━━━',
          "You're halfway through your free trial!",
          '',
          `📶 Used     :  ${usedGb} GB / ${limitGb} GB`,
          `<code>[${progressBar}] ${Math.round(progress)}%</code>`,
          '',
          'Like what you see? Upgrade to a paid plan.',
        ].join('\n');

        await sendTelegramMessage(config.botToken, chatId, text, {
          replyMarkup: {
            inline_keyboard: [
              [
                {
                  text: isMyanmar ? '⚡ See Flash Plans' : '⚡ See Flash Plans',
                  callback_data: buildTelegramMenuCallbackData('trial', 'show_monthly'),
                },
                {
                  text: isMyanmar ? '🌙 See Season Plans' : '🌙 See Season Plans',
                  callback_data: buildTelegramMenuCallbackData('trial', 'show_quarterly'),
                },
              ],
            ],
          },
        });

        await db.telegramUserProfile.update({
          where: { telegramUserId: profile.telegramUserId },
          data: { trialMidpointReminderSentAt: now },
        });
        midpointSent++;
      }
    }

    // 2. Pre-expiry Warning (6 hours before expiry)
    if (!profile.trialExpiringReminderSentAt && now >= expiringTime && now < expiresAt) {
      const isMyanmar = locale === 'my';
      const text = [
        '⚠️ <b>Trial Expiring Soon</b>',
        '━━━━━━━━━━━━━━━━━━',
        'Your free trial expires in <b>6 hours</b>.',
        "Don't lose your connection!",
      ].join('\n');

      await sendTelegramMessage(config.botToken, chatId, text, {
        replyMarkup: {
          inline_keyboard: [
            [
              {
                text: isMyanmar ? '🛒 Upgrade Now' : '🛒 Upgrade Now',
                callback_data: buildTelegramMenuCallbackData('trial', 'back_main'),
              },
              {
                text: isMyanmar ? '💬 Support' : '💬 Support',
                callback_data: buildTelegramMenuCallbackData('support', 'start'),
              },
            ],
          ],
        },
      });

      await db.telegramUserProfile.update({
        where: { telegramUserId: profile.telegramUserId },
        data: { trialExpiringReminderSentAt: now },
      });
      expiringSent++;
    }

    // 3. Expiry Notice (On expiry)
    if (!profile.trialExpiredNoticeSentAt && now >= expiresAt) {
      const isMyanmar = locale === 'my';
      const text = [
        '❌ <b>Trial Expired</b>',
        '━━━━━━━━━━━━━━━━━━',
        'Your free trial has ended.',
        'We hope you enjoyed the service!',
        '',
        'To stay connected, please purchase a plan.',
      ].join('\n');

      await sendTelegramMessage(config.botToken, chatId, text, {
        replyMarkup: {
          inline_keyboard: [
            [
              {
                text: isMyanmar ? '🛒 View Paid Plans' : '🛒 View Paid Plans',
                callback_data: buildTelegramMenuCallbackData('trial', 'back_main'),
              },
            ],
          ],
        },
      });

      await db.telegramUserProfile.update({
        where: { telegramUserId: profile.telegramUserId },
        data: { trialExpiredNoticeSentAt: now },
      });
      expiredSent++;
    }

    // 4. Winback Nudge (24 hours after expiry)
    if (!profile.trialWinbackNudgeSentAt && now >= winbackTime && !hasConverted) {
      const isMyanmar = locale === 'my';
      const text = [
        '👋 <b>Still there?</b>',
        '━━━━━━━━━━━━━━━━━━',
        "Your trial expired yesterday, but we'd love to have you back!",
        '',
        'Get <b>10% off</b> your first purchase with code: <b>COMEBACK10</b>',
      ].join('\n');

      await sendTelegramMessage(config.botToken, chatId, text, {
        replyMarkup: {
          inline_keyboard: [
            [
              {
                text: isMyanmar ? '🎁 Claim 10% Off' : '🎁 Claim 10% Off',
                callback_data: buildTelegramMenuCallbackData('trial', 'claim_discount'),
              },
              {
                text: isMyanmar ? '🛒 Shop Plans' : '🛒 Shop Plans',
                callback_data: buildTelegramMenuCallbackData('trial', 'back_main'),
              },
            ],
          ],
        },
      });

      await db.telegramUserProfile.update({
        where: { telegramUserId: profile.telegramUserId },
        data: { trialWinbackNudgeSentAt: now },
      });
      winbackSent++;
    }
  }

  return { skipped: false, midpointSent, expiringSent, expiredSent, winbackSent };
}
