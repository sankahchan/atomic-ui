import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { sendTelegramMessage } from '@/lib/services/telegram-bot-core';
import { formatBytes } from '@/lib/utils';
import {
  buildTelegramStoreDataWarningView,
  findTelegramStorePlanByCode,
  loadTelegramStoreLatestOrderForKey,
  progressBar as buildTelegramStoreProgressBar,
  resolveTelegramStorePlans,
} from '@/lib/services/telegram-storefront';

export async function runTelegramBandwidthAlertCycle() {
  const result = {
    processed: 0,
    alerted80: 0,
    alerted95: 0,
    errors: [] as string[],
  };

  try {
    // Fetch all profiles that have linked Telegram accounts
    const profiles = await db.telegramUserProfile.findMany({
      where: {
        telegramChatId: { not: null },
      },
    });

    for (const profile of profiles) {
      try {
        const locale = (profile.locale as any) || 'en';

        // Fetch access keys and dynamic keys for this user
        // We assume keys are linked to the telegram profile via some logic
        // In this system, keys are linked to the TelegramUserProfile via the trialKeyId or by matching email/ID
        // However, the standard way is to find keys linked to this Telegram account
        
        const accessKeys = await db.accessKey.findMany({
          where: { telegramId: profile.telegramUserId, status: 'ENABLED' },
        });

        const dynamicKeys = await db.dynamicAccessKey.findMany({
          where: { telegramId: profile.telegramUserId, status: 'ENABLED' },
        });

        const allKeys = [
          ...accessKeys.map(k => ({ ...k, type: 'standard' as const })),
          ...dynamicKeys.map(k => ({ ...k, type: 'premium' as const })),
        ];

        for (const key of allKeys) {
          result.processed++;

          if (!key.dataLimitBytes || Number(key.dataLimitBytes) === 0) continue;

          const usedBytes = Number(key.usedBytes);
          const limitBytes = Number(key.dataLimitBytes);
          const percent = (usedBytes / limitBytes) * 100;

          if (percent >= 80 && !profile.bandwidthAlert80At) {
            await sendBandwidthAlert(profile.telegramChatId!, key, locale);
            await db.telegramUserProfile.update({
              where: { telegramUserId: profile.telegramUserId },
              data: {
                bandwidthAlert80At: new Date(),
                bandwidthAlert95At: null,
              },
            });
            result.alerted80++;
          }

          // Reset alerts if usage is low (e.g. after renewal/reset)
          if (percent < 50 && (profile.bandwidthAlert80At || profile.bandwidthAlert95At)) {
            await db.telegramUserProfile.update({
              where: { telegramUserId: profile.telegramUserId },
              data: { 
                bandwidthAlert80At: null,
                bandwidthAlert95At: null,
              },
            });
          }
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        result.errors.push(`Profile ${profile.telegramUserId}: ${msg}`);
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    result.errors.push(`Cycle failed: ${msg}`);
  }

  return result;
}

async function sendBandwidthAlert(
  chatId: string,
  key: { id: string; name: string; usedBytes: bigint; dataLimitBytes: bigint | null; type: 'standard' | 'premium' },
  locale: string
) {
  const used = formatBytes(Number(key.usedBytes));
  const limit = formatBytes(Number(key.dataLimitBytes));
  const [{ plans }, latestOrder] = await Promise.all([
    resolveTelegramStorePlans(),
    loadTelegramStoreLatestOrderForKey({
      kind: key.type === 'premium' ? 'dynamic' : 'access',
      keyId: key.id,
    }),
  ]);
  const plan = findTelegramStorePlanByCode(plans, latestOrder?.planCode || null);
  const view = buildTelegramStoreDataWarningView({
    planName: plan?.detailName || key.name,
    usedLabel: used,
    totalLabel: limit,
    priceLabel: plan?.priceLabel || 'See plans',
    progressBar: buildTelegramStoreProgressBar(Number(key.usedBytes), Number(key.dataLimitBytes || BigInt(0))),
    plan,
    renewTarget: {
      kind: key.type === 'premium' ? 'dynamic' : 'access',
      keyId: key.id,
    },
    locale: locale === 'my' ? 'my' : 'en',
  });

  try {
    const { getTelegramConfig } = await import('@/lib/services/telegram-runtime');
    const config = await getTelegramConfig();
    if (config) {
      await sendTelegramMessage(config.botToken, chatId, view.text, {
        parseMode: 'MarkdownV2',
        replyMarkup: view.replyMarkup,
      });
    }
  } catch (error) {
    logger.error(`Failed to send bandwidth alert message to ${chatId}`, error);
  }
}
