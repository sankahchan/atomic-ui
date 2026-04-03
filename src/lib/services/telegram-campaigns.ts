import { db } from '@/lib/db';
import { coerceSupportedLocale } from '@/lib/i18n/config';
import {
  getPromoEligibilityOverride,
  parsePromoEligibilityOverrides,
  type PromoEligibilityOverrideMode,
} from '@/lib/promo-overrides';
import {
  issueTelegramCampaignCoupon,
  type TelegramCampaignCouponType,
} from '@/lib/services/telegram-coupons';
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
import {
  getTelegramSalesSettings,
  type TelegramSalesSettings,
} from '@/lib/services/telegram-sales';
import { tagMatchesFilter } from '@/lib/tags';

const PROMO_SUPPORT_NOTE_KINDS = ['INTERNAL', 'DIRECT_MESSAGE', 'OUTAGE_UPDATE'] as const;

type PromoGuardrailInput = {
  telegramChatId: string;
  telegramUserId: string;
  linkedUserId?: string | null;
};

type PromoGuardrailCaches = {
  linkedUserIds: Map<string, string | null>;
  promoOverrides: Map<string, ReturnType<typeof parsePromoEligibilityOverrides>>;
  recentRefunds: Map<string, boolean>;
  supportHeavy: Map<string, boolean>;
  cooldown: Map<string, boolean>;
};

function resolveCampaignControl(
  settings: TelegramSalesSettings,
  campaignType: TelegramCampaignCouponType,
) {
  switch (campaignType) {
    case 'TRIAL_TO_PAID':
      return {
        enabled: settings.trialCouponEnabled,
        paused: settings.trialCouponPaused,
        maxRecipientsPerRun: settings.trialCouponMaxRecipientsPerRun,
      };
    case 'RENEWAL_SOON':
      return {
        enabled: settings.renewalCouponEnabled,
        paused: settings.renewalCouponPaused,
        maxRecipientsPerRun: settings.renewalCouponMaxRecipientsPerRun,
      };
    case 'PREMIUM_UPSELL':
      return {
        enabled: settings.premiumUpsellCouponEnabled,
        paused: settings.premiumUpsellCouponPaused,
        maxRecipientsPerRun: settings.premiumUpsellCouponMaxRecipientsPerRun,
      };
    case 'WINBACK':
      return {
        enabled: settings.winbackCouponEnabled,
        paused: settings.winbackCouponPaused,
        maxRecipientsPerRun: settings.winbackCouponMaxRecipientsPerRun,
      };
  }
}

function hasReachedCampaignCap(sentCount: number, maxRecipientsPerRun: number) {
  return maxRecipientsPerRun > 0 && sentCount >= maxRecipientsPerRun;
}

async function resolveLinkedUserIdForPromo(
  input: PromoGuardrailInput,
  caches: PromoGuardrailCaches,
) {
  if (input.linkedUserId) {
    return input.linkedUserId;
  }

  const cacheKey = `${input.telegramChatId}:${input.telegramUserId}`;
  if (caches.linkedUserIds.has(cacheKey)) {
    return caches.linkedUserIds.get(cacheKey) || null;
  }

  const matchedUser = await db.user.findFirst({
    where: {
      OR: [
        { telegramChatId: input.telegramChatId },
        { accessKeys: { some: { telegramId: input.telegramChatId } } },
        { accessKeys: { some: { telegramId: input.telegramUserId } } },
        { dynamicAccessKeys: { some: { telegramId: input.telegramChatId } } },
        { dynamicAccessKeys: { some: { telegramId: input.telegramUserId } } },
      ],
    },
    select: { id: true },
  });

  const userId = matchedUser?.id || null;
  caches.linkedUserIds.set(cacheKey, userId);
  return userId;
}

async function hasRecentRefundBlock(
  input: PromoGuardrailInput,
  settings: TelegramSalesSettings,
  now: Date,
  caches: PromoGuardrailCaches,
) {
  if (!settings.promoExcludeRecentRefundUsers) {
    return false;
  }

  const cacheKey = input.telegramUserId;
  if (caches.recentRefunds.has(cacheKey)) {
    return caches.recentRefunds.get(cacheKey) || false;
  }

  const cutoff = new Date(
    now.getTime() - Math.max(1, settings.promoExcludeRecentRefundDays) * 24 * 60 * 60 * 1000,
  );

  const matches = await db.telegramOrder.count({
    where: {
      telegramUserId: input.telegramUserId,
      OR: [
        {
          financeStatus: 'REFUNDED',
          financeUpdatedAt: { gte: cutoff },
        },
        {
          refundRequestStatus: { in: ['APPROVED', 'PENDING'] },
          OR: [
            { refundRequestReviewedAt: { gte: cutoff } },
            { refundRequestedAt: { gte: cutoff } },
          ],
        },
      ],
    },
  });

  const blocked = matches > 0;
  caches.recentRefunds.set(cacheKey, blocked);
  return blocked;
}

async function resolvePromoEligibilityOverrideMode(
  input: PromoGuardrailInput & { campaignType: TelegramCampaignCouponType },
  caches: PromoGuardrailCaches,
): Promise<PromoEligibilityOverrideMode | null> {
  const linkedUserId = await resolveLinkedUserIdForPromo(input, caches);
  if (!linkedUserId) {
    return null;
  }

  if (!caches.promoOverrides.has(linkedUserId)) {
    const linkedUser = await db.user.findUnique({
      where: { id: linkedUserId },
      select: {
        promoEligibilityOverrides: true,
      },
    });

    caches.promoOverrides.set(
      linkedUserId,
      parsePromoEligibilityOverrides(linkedUser?.promoEligibilityOverrides),
    );
  }

  return getPromoEligibilityOverride(
    caches.promoOverrides.get(linkedUserId),
    input.campaignType,
  )?.mode || null;
}

async function hasSupportHeavyBlock(
  input: PromoGuardrailInput,
  settings: TelegramSalesSettings,
  now: Date,
  caches: PromoGuardrailCaches,
) {
  if (!settings.promoExcludeSupportHeavyUsers) {
    return false;
  }

  const linkedUserId = await resolveLinkedUserIdForPromo(input, caches);
  if (!linkedUserId) {
    return false;
  }

  if (caches.supportHeavy.has(linkedUserId)) {
    return caches.supportHeavy.get(linkedUserId) || false;
  }

  const cutoff = new Date(
    now.getTime() - Math.max(1, settings.promoSupportHeavyLookbackDays) * 24 * 60 * 60 * 1000,
  );

  const noteCount = await db.customerSupportNote.count({
    where: {
      userId: linkedUserId,
      kind: {
        in: [...PROMO_SUPPORT_NOTE_KINDS],
      },
      createdAt: {
        gte: cutoff,
      },
    },
  });

  const blocked = noteCount >= Math.max(1, settings.promoSupportHeavyThreshold);
  caches.supportHeavy.set(linkedUserId, blocked);
  return blocked;
}

async function hasCooldownBlock(
  input: PromoGuardrailInput,
  settings: TelegramSalesSettings,
  now: Date,
  caches: PromoGuardrailCaches,
) {
  if ((settings.promoCampaignCooldownHours || 0) <= 0) {
    return false;
  }

  const cacheKey = `${input.telegramChatId}:${input.telegramUserId}`;
  if (caches.cooldown.has(cacheKey)) {
    return caches.cooldown.get(cacheKey) || false;
  }

  const cutoff = new Date(
    now.getTime() - Math.max(0, settings.promoCampaignCooldownHours) * 60 * 60 * 1000,
  );

  const issuedRecently = await db.telegramCouponRedemption.count({
    where: {
      telegramChatId: input.telegramChatId,
      telegramUserId: input.telegramUserId,
      createdAt: {
        gte: cutoff,
      },
    },
  });

  const blocked = issuedRecently > 0;
  caches.cooldown.set(cacheKey, blocked);
  return blocked;
}

async function resolvePromoSendDecision(
  input: PromoGuardrailInput & {
    campaignType: TelegramCampaignCouponType;
  },
  settings: TelegramSalesSettings,
  now: Date,
  caches: PromoGuardrailCaches,
) {
  const overrideMode = await resolvePromoEligibilityOverrideMode(input, caches);
  if (overrideMode === 'FORCE_ALLOW') {
    return {
      blocked: false,
      forceAllow: true,
    };
  }

  if (overrideMode === 'FORCE_BLOCK') {
    return {
      blocked: true,
      forceAllow: false,
    };
  }

  if (await hasRecentRefundBlock(input, settings, now, caches)) {
    return {
      blocked: true,
      forceAllow: false,
    };
  }

  if (await hasSupportHeavyBlock(input, settings, now, caches)) {
    return {
      blocked: true,
      forceAllow: false,
    };
  }

  if (await hasCooldownBlock(input, settings, now, caches)) {
    return {
      blocked: true,
      forceAllow: false,
    };
  }

  return {
    blocked: false,
    forceAllow: false,
  };
}

export async function runTelegramCouponCampaignCycle(input: {
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const settings = await getTelegramSalesSettings();
  const trialReminderLeadMs = 6 * 60 * 60 * 1000;
  const trialCouponLeadMs = Math.max(1, settings.trialCouponLeadHours || 12) * 60 * 60 * 1000;
  const guardrailCaches: PromoGuardrailCaches = {
    linkedUserIds: new Map(),
    promoOverrides: new Map(),
    recentRefunds: new Map(),
    supportHeavy: new Map(),
    cooldown: new Map(),
  };

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

  const trialCampaignControl = resolveCampaignControl(settings, 'TRIAL_TO_PAID');
  if (
    trialCampaignControl.enabled &&
    !trialCampaignControl.paused &&
    eligibleTrialCandidates.length > 0
  ) {
    const couponCandidates = eligibleTrialCandidates.filter(
      (candidate) =>
        Boolean(candidate.expiresAt) &&
        candidate.expiresAt!.getTime() - now.getTime() <= trialCouponLeadMs,
    );

    for (const key of couponCandidates) {
      if (
        hasReachedCampaignCap(
          trialCouponReminded,
          trialCampaignControl.maxRecipientsPerRun,
        )
      ) {
        break;
      }
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
        const promoDecision = await resolvePromoSendDecision(
          {
            telegramChatId: destinationChatId,
            telegramUserId: messagingKey.telegramId || destinationChatId,
            linkedUserId: messagingKey.user?.id || null,
            campaignType: 'TRIAL_TO_PAID',
          },
          settings,
          now,
          guardrailCaches,
        );
        if (promoDecision.blocked) {
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
          forceAllow: promoDecision.forceAllow,
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

  const renewalCampaignControl = resolveCampaignControl(settings, 'RENEWAL_SOON');
  if (renewalCampaignControl.enabled && !renewalCampaignControl.paused) {
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
      if (
        hasReachedCampaignCap(
          renewalCouponReminded,
          renewalCampaignControl.maxRecipientsPerRun,
        )
      ) {
        break;
      }
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
        const promoDecision = await resolvePromoSendDecision(
          {
            telegramChatId: destinationChatId,
            telegramUserId: messagingKey.telegramId || destinationChatId,
            linkedUserId: messagingKey.user?.id || null,
            campaignType: 'RENEWAL_SOON',
          },
          settings,
          now,
          guardrailCaches,
        );
        if (promoDecision.blocked) {
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
          forceAllow: promoDecision.forceAllow,
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

  const premiumUpsellCampaignControl = resolveCampaignControl(settings, 'PREMIUM_UPSELL');
  if (premiumUpsellCampaignControl.enabled && !premiumUpsellCampaignControl.paused) {
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
      if (
        hasReachedCampaignCap(
          premiumUpsellReminded,
          premiumUpsellCampaignControl.maxRecipientsPerRun,
        )
      ) {
        break;
      }
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
        const promoDecision = await resolvePromoSendDecision(
          {
            telegramChatId: destinationChatId,
            telegramUserId: messagingKey.telegramId || destinationChatId,
            linkedUserId: messagingKey.user?.id || null,
            campaignType: 'PREMIUM_UPSELL',
          },
          settings,
          now,
          guardrailCaches,
        );
        if (promoDecision.blocked) {
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
          forceAllow: promoDecision.forceAllow,
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

  const winbackCampaignControl = resolveCampaignControl(settings, 'WINBACK');
  if (winbackCampaignControl.enabled && !winbackCampaignControl.paused) {
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
      if (
        hasReachedCampaignCap(
          winbackCouponReminded,
          winbackCampaignControl.maxRecipientsPerRun,
        )
      ) {
        break;
      }
      const baseline = order.fulfilledAt || order.createdAt;
      if (baseline > inactivityCutoff) {
        continue;
      }

      try {
        const promoDecision = await resolvePromoSendDecision(
          {
            telegramChatId: order.telegramChatId,
            telegramUserId: order.telegramUserId,
            campaignType: 'WINBACK',
          },
          settings,
          now,
          guardrailCaches,
        );
        if (promoDecision.blocked) {
          continue;
        }
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
          forceAllow: promoDecision.forceAllow,
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
