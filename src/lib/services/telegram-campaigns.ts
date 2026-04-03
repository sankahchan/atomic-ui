import { db } from '@/lib/db';
import { coerceSupportedLocale } from '@/lib/i18n/config';
import { issueTelegramCampaignCoupon } from '@/lib/services/telegram-coupons';
import {
  getTelegramDefaultLocale,
  loadAccessKeyForMessaging,
  resolveTelegramChatIdForKey,
} from '@/lib/services/telegram-runtime';
import {
  sendAccessKeyPremiumUpsellCouponCampaign,
  sendAccessKeyRenewalCouponCampaign,
  sendAccessKeyTrialCouponCampaign,
  sendAccessKeyTrialExpiryReminder,
  sendTelegramWinbackCouponCampaign,
} from '@/lib/services/telegram-reminders';
import { getTelegramSalesSettings } from '@/lib/services/telegram-sales';
import { tagMatchesFilter } from '@/lib/tags';

export async function runTelegramCouponCampaignCycle(input: {
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const settings = await getTelegramSalesSettings();
  const trialReminderLeadMs = 6 * 60 * 60 * 1000;
  const trialCouponLeadMs = Math.max(1, settings.trialCouponLeadHours || 12) * 60 * 60 * 1000;

  let trialCouponReminded = 0;
  let renewalCouponReminded = 0;
  let premiumUpsellReminded = 0;
  let winbackCouponReminded = 0;
  let trialReminded = 0;
  const errors: string[] = [];

  const trialCandidates = await db.accessKey.findMany({
    where: {
      status: { in: ['ACTIVE', 'PENDING'] },
      telegramDeliveryEnabled: true,
      expiresAt: {
        not: null,
        gt: now,
        lte: new Date(now.getTime() + trialReminderLeadMs),
      },
      tags: {
        contains: ',trial,',
      },
    },
    select: {
      id: true,
      expiresAt: true,
      tags: true,
    },
  });

  const eligibleTrialCandidates = trialCandidates.filter((candidate) =>
    tagMatchesFilter(candidate.tags || '', 'trial'),
  );

  if (settings.trialCouponEnabled && eligibleTrialCandidates.length > 0) {
    const couponCandidates = eligibleTrialCandidates.filter(
      (candidate) =>
        Boolean(candidate.expiresAt) &&
        candidate.expiresAt!.getTime() - now.getTime() <= trialCouponLeadMs,
    );

    for (const key of couponCandidates) {
      if (!key.expiresAt) {
        continue;
      }

      const hoursLeft = Math.max(
        1,
        Math.ceil((key.expiresAt.getTime() - now.getTime()) / (60 * 60 * 1000)),
      );

      try {
        const messagingKey = await loadAccessKeyForMessaging(key.id);
        if (!messagingKey) {
          continue;
        }
        const destinationChatId = resolveTelegramChatIdForKey(messagingKey);
        if (!destinationChatId) {
          continue;
        }
        const issued = await issueTelegramCampaignCoupon({
          campaignType: 'TRIAL_TO_PAID',
          couponCode: settings.trialCouponCode,
          couponDiscountAmount: settings.trialCouponDiscountAmount,
          couponDiscountLabel: settings.trialCouponDiscountLabel,
          currency: 'MMK',
          telegramChatId: destinationChatId,
          telegramUserId: messagingKey.telegramId || destinationChatId,
          accessKeyId: key.id,
          expiresAt: key.expiresAt,
          maxUsesPerUser: 1,
          stopAfterConversion: true,
        });
        if (!issued || !issued.created) {
          continue;
        }
        const sent = await sendAccessKeyTrialCouponCampaign({
          accessKeyId: key.id,
          hoursLeft,
          couponCode: issued.coupon.couponCode,
          discountLabel: settings.trialCouponDiscountLabel,
          source: 'trial_coupon',
        });
        if (sent) {
          trialCouponReminded += 1;
        }
      } catch (error) {
        errors.push(`trial-coupon:${key.id}:${(error as Error).message}`);
      }
    }
  }

  if (eligibleTrialCandidates.length > 0) {
    const existingReminderLogs = await db.notificationLog.findMany({
      where: {
        accessKeyId: { in: eligibleTrialCandidates.map((candidate) => candidate.id) },
        event: 'TELEGRAM_TRIAL_EXPIRING',
        status: 'SUCCESS',
      },
      select: {
        accessKeyId: true,
      },
    });

    const remindedAccessKeyIds = new Set(
      existingReminderLogs
        .map((entry) => entry.accessKeyId)
        .filter((entry): entry is string => Boolean(entry)),
    );

    for (const key of eligibleTrialCandidates) {
      if (!key.expiresAt || remindedAccessKeyIds.has(key.id)) {
        continue;
      }

      try {
        const hoursLeft = Math.max(
          1,
          Math.ceil((key.expiresAt.getTime() - now.getTime()) / (60 * 60 * 1000)),
        );
        const sent = await sendAccessKeyTrialExpiryReminder({
          accessKeyId: key.id,
          hoursLeft,
          source: 'telegram_trial_expiry',
        });

        if (sent) {
          trialReminded += 1;
        }
      } catch (error) {
        errors.push(`trial:${key.id}:${(error as Error).message}`);
      }
    }
  }

  if (settings.renewalCouponEnabled) {
    const renewalLeadDays = Math.max(1, settings.renewalCouponLeadDays || 5);
    const renewalCandidates = await db.accessKey.findMany({
      where: {
        status: { in: ['ACTIVE', 'PENDING'] },
        telegramDeliveryEnabled: true,
        expiresAt: {
          not: null,
          gt: now,
          lte: new Date(now.getTime() + renewalLeadDays * 24 * 60 * 60 * 1000),
        },
      },
      select: {
        id: true,
        expiresAt: true,
        tags: true,
      },
    });

    for (const key of renewalCandidates) {
      if (!key.expiresAt || tagMatchesFilter(key.tags || '', 'trial')) {
        continue;
      }

      try {
        const messagingKey = await loadAccessKeyForMessaging(key.id);
        if (!messagingKey) {
          continue;
        }
        const destinationChatId = resolveTelegramChatIdForKey(messagingKey);
        if (!destinationChatId) {
          continue;
        }
        const issued = await issueTelegramCampaignCoupon({
          campaignType: 'RENEWAL_SOON',
          couponCode: settings.renewalCouponCode,
          couponDiscountAmount: settings.renewalCouponDiscountAmount,
          couponDiscountLabel: settings.renewalCouponDiscountLabel,
          currency: 'MMK',
          telegramChatId: destinationChatId,
          telegramUserId: messagingKey.telegramId || destinationChatId,
          accessKeyId: key.id,
          expiresAt: key.expiresAt,
          maxUsesPerUser: 1,
          stopAfterConversion: true,
        });
        if (!issued || !issued.created) {
          continue;
        }
        const daysLeft = Math.max(
          1,
          Math.ceil((key.expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
        );
        const sent = await sendAccessKeyRenewalCouponCampaign({
          accessKeyId: key.id,
          daysLeft,
          couponCode: issued.coupon.couponCode,
          discountLabel: settings.renewalCouponDiscountLabel,
        });
        if (sent) {
          renewalCouponReminded += 1;
        }
      } catch (error) {
        errors.push(`renewal-coupon:${key.id}:${(error as Error).message}`);
      }
    }
  }

  if (settings.premiumUpsellCouponEnabled) {
    const threshold = Math.max(10, Math.min(100, settings.premiumUpsellUsageThresholdPercent || 80));
    const upsellCandidates = await db.accessKey.findMany({
      where: {
        status: { in: ['ACTIVE', 'PENDING'] },
        telegramDeliveryEnabled: true,
        dataLimitBytes: {
          not: null,
        },
      },
      select: {
        id: true,
        usedBytes: true,
        dataLimitBytes: true,
        tags: true,
      },
    });

    for (const key of upsellCandidates) {
      if (!key.dataLimitBytes || tagMatchesFilter(key.tags || '', 'trial')) {
        continue;
      }
      const usagePercent = Number((key.usedBytes * BigInt(100)) / key.dataLimitBytes);
      if (usagePercent < threshold) {
        continue;
      }

      try {
        const messagingKey = await loadAccessKeyForMessaging(key.id);
        if (!messagingKey) {
          continue;
        }
        const destinationChatId = resolveTelegramChatIdForKey(messagingKey);
        if (!destinationChatId) {
          continue;
        }
        const issued = await issueTelegramCampaignCoupon({
          campaignType: 'PREMIUM_UPSELL',
          couponCode: settings.premiumUpsellCouponCode,
          couponDiscountAmount: settings.premiumUpsellCouponDiscountAmount,
          couponDiscountLabel: settings.premiumUpsellCouponDiscountLabel,
          currency: 'MMK',
          telegramChatId: destinationChatId,
          telegramUserId: messagingKey.telegramId || destinationChatId,
          accessKeyId: key.id,
          expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
          maxUsesPerUser: 1,
          stopAfterConversion: true,
        });
        if (!issued || !issued.created) {
          continue;
        }
        const sent = await sendAccessKeyPremiumUpsellCouponCampaign({
          accessKeyId: key.id,
          usagePercent,
          couponCode: issued.coupon.couponCode,
          discountLabel: settings.premiumUpsellCouponDiscountLabel,
        });
        if (sent) {
          premiumUpsellReminded += 1;
        }
      } catch (error) {
        errors.push(`premium-upsell:${key.id}:${(error as Error).message}`);
      }
    }
  }

  if (settings.winbackCouponEnabled) {
    const inactivityDays = Math.max(7, settings.winbackCouponInactivityDays || 30);
    const inactivityCutoff = new Date(now.getTime() - inactivityDays * 24 * 60 * 60 * 1000);
    const winbackOrders = await db.telegramOrder.findMany({
      where: {
        status: 'FULFILLED',
        priceAmount: {
          gt: 0,
        },
      },
      orderBy: [{ fulfilledAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        telegramChatId: true,
        telegramUserId: true,
        locale: true,
        fulfilledAt: true,
        createdAt: true,
      },
    });

    const latestByUser = new Map<string, (typeof winbackOrders)[number]>();
    for (const order of winbackOrders) {
      if (!latestByUser.has(order.telegramUserId)) {
        latestByUser.set(order.telegramUserId, order);
      }
    }

    for (const order of Array.from(latestByUser.values())) {
      const baseline = order.fulfilledAt || order.createdAt;
      if (baseline > inactivityCutoff) {
        continue;
      }

      try {
        const issued = await issueTelegramCampaignCoupon({
          campaignType: 'WINBACK',
          couponCode: settings.winbackCouponCode,
          couponDiscountAmount: settings.winbackCouponDiscountAmount,
          couponDiscountLabel: settings.winbackCouponDiscountLabel,
          currency: 'MMK',
          telegramChatId: order.telegramChatId,
          telegramUserId: order.telegramUserId,
          expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
          maxUsesPerUser: 1,
          stopAfterConversion: true,
        });
        if (!issued || !issued.created) {
          continue;
        }
        const locale = coerceSupportedLocale(order.locale) || (await getTelegramDefaultLocale());
        const sent = await sendTelegramWinbackCouponCampaign({
          telegramChatId: order.telegramChatId,
          telegramUserId: order.telegramUserId,
          locale,
          inactiveDays: inactivityDays,
          couponCode: issued.coupon.couponCode,
          discountLabel: settings.winbackCouponDiscountLabel,
        });
        if (sent) {
          winbackCouponReminded += 1;
        }
      } catch (error) {
        errors.push(`winback-coupon:${order.telegramUserId}:${(error as Error).message}`);
      }
    }
  }

  return {
    trialReminded,
    trialCouponReminded,
    renewalCouponReminded,
    premiumUpsellReminded,
    winbackCouponReminded,
    errors,
  };
}
