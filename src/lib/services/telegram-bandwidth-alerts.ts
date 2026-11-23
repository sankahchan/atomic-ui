import { db } from '@/lib/db';
import {
  getTelegramConfig,
  getTelegramDefaultLocale,
  resolveTelegramLocaleForRecipient,
} from '@/lib/services/telegram-runtime';
import { sendTelegramMessage } from '@/lib/services/telegram-bot-core';
import { formatBytes } from '@/lib/utils';
import {
  buildTelegramStoreDataWarningView,
  findTelegramStorePlanByCode,
  loadTelegramStoreLatestOrderForKey,
  progressBar as buildTelegramStoreProgressBar,
  resolveTelegramStorePlans,
} from '@/lib/services/telegram-storefront';
import type { SupportedLocale } from '@/lib/i18n/config';

type UsageAlertKey = {
  id: string;
  name: string;
  usedBytes: bigint;
  dataLimitBytes: bigint | null;
  bandwidthAlertAt80: boolean;
  bandwidthAlertAt90: boolean;
  telegramId: string | null;
  telegramDeliveryEnabled: boolean;
  user: { telegramChatId: string | null } | null;
};

type UsageAlertKeyKind = 'access' | 'dynamic';

export type UsageAlertDecision = {
  threshold: 80 | 90 | null;
  markAlert80: boolean;
  markAlert90: boolean;
  resetAlerts: boolean;
};

/**
 * Pure threshold decision so alert behaviour is testable without a database.
 * A single high-threshold message is sent when usage jumps past both levels;
 * the lower flag is still marked so the user is not spammed on the next cycle.
 */
export function decideUsageAlert(input: {
  percent: number;
  alert80: boolean;
  alert90: boolean;
}): UsageAlertDecision {
  const none: UsageAlertDecision = {
    threshold: null,
    markAlert80: false,
    markAlert90: false,
    resetAlerts: false,
  };

  if (!Number.isFinite(input.percent) || input.percent < 0) {
    return none;
  }

  if (input.percent < 50 && (input.alert80 || input.alert90)) {
    return { ...none, resetAlerts: true };
  }

  if (input.percent >= 90) {
    if (input.alert90) {
      return input.alert80 ? none : { ...none, markAlert80: true };
    }
    return { threshold: 90, markAlert80: true, markAlert90: true, resetAlerts: false };
  }

  if (input.percent >= 80 && !input.alert80) {
    return { threshold: 80, markAlert80: true, markAlert90: false, resetAlerts: false };
  }

  return none;
}

export async function runTelegramBandwidthAlertCycle() {
  const result = {
    processed: 0,
    alerted80: 0,
    alerted90: 0,
    reset: 0,
    skipped: false,
    errors: [] as string[],
  };

  const config = await getTelegramConfig();
  if (!config) {
    result.skipped = true;
    return result;
  }

  const linkedKeyWhere = {
    status: 'ACTIVE',
    telegramDeliveryEnabled: true,
    dataLimitBytes: { not: null },
    OR: [
      { telegramId: { not: null } },
      { user: { telegramChatId: { not: null } } },
    ],
  };

  const keySelect = {
    id: true,
    name: true,
    usedBytes: true,
    dataLimitBytes: true,
    bandwidthAlertAt80: true,
    bandwidthAlertAt90: true,
    telegramId: true,
    telegramDeliveryEnabled: true,
    user: { select: { telegramChatId: true } },
  };

  const [accessKeys, dynamicKeys, fallbackLocale] = await Promise.all([
    db.accessKey.findMany({ where: linkedKeyWhere, select: keySelect }),
    db.dynamicAccessKey.findMany({ where: linkedKeyWhere, select: keySelect }),
    getTelegramDefaultLocale(),
  ]);

  const allKeys: Array<UsageAlertKey & { kind: UsageAlertKeyKind }> = [
    ...accessKeys.map((key) => ({ ...key, kind: 'access' as const })),
    ...dynamicKeys.map((key) => ({ ...key, kind: 'dynamic' as const })),
  ];

  for (const key of allKeys) {
    result.processed++;

    const limitBytes = Number(key.dataLimitBytes);
    if (!limitBytes || limitBytes <= 0) continue;

    const chatId = key.telegramId || key.user?.telegramChatId;
    if (!chatId) continue;

    try {
      const percent = (Number(key.usedBytes) / limitBytes) * 100;
      const decision = decideUsageAlert({
        percent,
        alert80: key.bandwidthAlertAt80,
        alert90: key.bandwidthAlertAt90,
      });

      if (decision.resetAlerts) {
        await updateAlertFlags(key, { markAlert80: false, markAlert90: false });
        result.reset++;
        continue;
      }

      if (decision.threshold !== null) {
        const locale = await resolveTelegramLocaleForRecipient({
          telegramUserId: key.telegramId || null,
          telegramChatId: chatId,
          fallbackLocale,
        });
        await sendBandwidthAlert({
          botToken: config.botToken,
          chatId,
          key,
          locale,
          threshold: decision.threshold,
        });
        if (decision.threshold === 80) result.alerted80++;
        else result.alerted90++;
      } else if (decision.markAlert80 || decision.markAlert90) {
        // A previous 90% notice already covered the 80% threshold.
      } else {
        continue;
      }

      await updateAlertFlags(key, decision);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`${key.kind} key ${key.id}: ${message}`);
    }
  }

  return result;
}

async function updateAlertFlags(
  key: UsageAlertKey & { kind: UsageAlertKeyKind },
  decision: Pick<UsageAlertDecision, 'markAlert80' | 'markAlert90'>,
) {
  const data = {
    bandwidthAlertAt80: decision.markAlert80,
    bandwidthAlertAt90: decision.markAlert90,
  };

  if (key.kind === 'access') {
    await db.accessKey.update({ where: { id: key.id }, data });
  } else {
    await db.dynamicAccessKey.update({ where: { id: key.id }, data });
  }
}

async function sendBandwidthAlert(input: {
  botToken: string;
  chatId: string;
  key: UsageAlertKey & { kind: UsageAlertKeyKind };
  locale: SupportedLocale;
  threshold: 80 | 90;
}) {
  const { key, locale, threshold } = input;
  const used = formatBytes(Number(key.usedBytes));
  const limit = formatBytes(Number(key.dataLimitBytes));
  const [{ plans }, latestOrder] = await Promise.all([
    resolveTelegramStorePlans(),
    loadTelegramStoreLatestOrderForKey({ kind: key.kind, keyId: key.id }),
  ]);
  const plan = findTelegramStorePlanByCode(plans, latestOrder?.planCode || null);
  const view = buildTelegramStoreDataWarningView({
    planName: plan?.detailName || key.name,
    usedLabel: used,
    totalLabel: limit,
    priceLabel: plan?.priceLabel || 'See plans',
    progressBar: buildTelegramStoreProgressBar(
      Number(key.usedBytes),
      Number(key.dataLimitBytes || BigInt(0)),
    ),
    plan,
    renewTarget: { kind: key.kind, keyId: key.id },
    threshold,
    locale,
  });

  await sendTelegramMessage(input.botToken, input.chatId, view.text, {
    parseMode: 'MarkdownV2',
    replyMarkup: view.replyMarkup,
  });
}
