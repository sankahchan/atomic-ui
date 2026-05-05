import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getTelegramUi, escapeHtml } from '@/lib/services/telegram-ui';
import { sendTelegramMessage } from '@/lib/services/telegram-bot-core';
import { formatBytes } from '@/lib/utils';

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
        const ui = getTelegramUi(locale);

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

          let alerted = false;

          // 95% Alert
          if (percent >= 95 && !profile.bandwidthAlert95At) {
            await sendBandwidthAlert(profile.telegramChatId!, key, 95, ui, locale);
            await db.telegramUserProfile.update({
              where: { telegramUserId: profile.telegramUserId },
              data: { bandwidthAlert95At: new Date() },
            });
            result.alerted95++;
            alerted = true;
          } 
          // 80% Alert (only if 95% hasn't been sent yet in this cycle)
          else if (percent >= 80 && !profile.bandwidthAlert80At && !profile.bandwidthAlert95At) {
            await sendBandwidthAlert(profile.telegramChatId!, key, 80, ui, locale);
            await db.telegramUserProfile.update({
              where: { telegramUserId: profile.telegramUserId },
              data: { bandwidthAlert80At: new Date() },
            });
            result.alerted80++;
            alerted = true;
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
  threshold: 80 | 95,
  ui: any,
  locale: string
) {
  const isMyanmar = locale === 'my';
  const used = formatBytes(Number(key.usedBytes));
  const limit = formatBytes(Number(key.dataLimitBytes));
  
  const title = threshold === 95
    ? (isMyanmar ? '⚠️ <b>Bandwidth အသုံးပြုမှု အလွန်များနေပါသည်</b>' : '⚠️ <b>Critical Bandwidth Usage</b>')
    : (isMyanmar ? '📊 <b>Bandwidth အသုံးပြုမှု သတိပေးချက်</b>' : '📊 <b>Bandwidth Usage Alert</b>');

  const body = isMyanmar
    ? `သင့် ${key.type === 'premium' ? 'premium ' : ''}key <b>${escapeHtml(key.name)}</b> သည် သတ်မှတ်ထားသော quota ၏ <b>${threshold}%</b> အထိ အသုံးပြုပြီး ဖြစ်ပါသည်။\n\nအသုံးပြုပြီး: ${used}\nစုစုပေါင်း quota: ${limit}`
    : `Your ${key.type === 'premium' ? 'premium ' : ''}key <b>${escapeHtml(key.name)}</b> has reached <b>${threshold}%</b> of its data quota.\n\nUsed: ${used}\nTotal quota: ${limit}`;

  const hint = isMyanmar
    ? 'Quota ကုန်သွားပါက traffic ကို အသုံးပြုနိုင်တော့မည် မဟုတ်ပါ။ ဆက်လက်အသုံးပြုလိုပါက /renew ဖြင့် သက်တမ်းတိုးနိုင်ပါသည်။'
    : 'Once the quota is exhausted, traffic will be blocked. Use /renew to top up or renew your key.';

  const message = [title, body, hint].join('\n\n');

  try {
    const { getTelegramConfig } = await import('@/lib/services/telegram-runtime');
    const config = await getTelegramConfig();
    if (config) {
      await sendTelegramMessage(config.botToken, chatId, message, {
        parseMode: 'HTML',
        replyMarkup: {
          inline_keyboard: [
            [
              {
                text: isMyanmar ? '🔄 သက်တမ်းတိုးရန်' : '🔄 Renew Now',
                callback_data: `tg_order_ky_${key.id}${key.type === 'premium' ? '_dynamic' : ''}`,
              },
            ],
            [
              {
                text: isMyanmar ? '🛟 အကူအညီ ရယူရန်' : '🛟 Get Support',
                callback_data: `tg_support_new_${key.type === 'premium' ? 'server' : 'key'}`,
              },
            ],
          ],
        },
      });
    }
  } catch (error) {
    logger.error(`Failed to send bandwidth alert message to ${chatId}`, error);
  }
}
