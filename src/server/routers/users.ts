import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { hashPassword } from '@/lib/auth';
import { coerceSupportedLocale } from '@/lib/i18n/config';
import {
  ADMIN_SCOPE_VALUES,
  hasOutageManageScope,
  hasTelegramAnnouncementManageScope,
  hasTelegramReviewManageScope,
  hasUserManageScope,
  isOwnerLikeAdmin,
  normalizeAdminScope,
} from '@/lib/admin-scope';
import { writeAuditLog } from '@/lib/audit';
import { db } from '@/lib/db';
import { getRefundReasonPreset } from '@/lib/finance';
import {
  canUserConfigureFinance,
  canUserManageFinance,
  evaluateTelegramOrderRefundEligibility,
  FINANCE_SETTINGS_KEY,
  financeControlsSchema,
  getFinanceControls,
  normalizeFinanceControlsSettings,
  runTelegramFinanceDigestCycle,
  sendTelegramRefundDecisionMessage,
} from '@/lib/services/telegram-finance';
import {
  sendAccessKeySharePageToTelegram,
  sendDynamicKeySharePageToTelegram,
  sendTelegramOrderReceiptConfirmation,
} from '@/lib/services/telegram-bot';
import { buildTelegramPromoDeliveryCandidates, resolveTelegramPromoAttribution } from '@/lib/services/telegram-attribution';
import { dispatchTelegramAnnouncement } from '@/lib/services/telegram-announcements';
import {
  getTelegramConfig,
  getTelegramSupportLink,
  sendServerIssueNoticeToTelegram,
  sendTelegramMessage,
} from '@/lib/services/telegram-runtime';
import {
  getTelegramSalesSettings,
  type TelegramSalesSettings,
} from '@/lib/services/telegram-sales';
import { adminProcedure, router } from '../trpc';

function parseJsonRecord(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function resolveCustomerTelegramDestination(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      telegramChatId: true,
      accessKeys: {
        select: {
          id: true,
          name: true,
          telegramId: true,
          publicSlug: true,
          status: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: 'desc' }],
      },
      dynamicAccessKeys: {
        select: {
          id: true,
          name: true,
          telegramId: true,
          publicSlug: true,
          status: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: 'desc' }],
      },
    },
  });

  if (!user) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'User not found.',
    });
  }

  const destinationChatId =
    user.telegramChatId ||
    user.accessKeys.find((key) => Boolean(key.telegramId))?.telegramId ||
    user.dynamicAccessKeys.find((key) => Boolean(key.telegramId))?.telegramId ||
    null;

  return {
    user,
    destinationChatId,
  };
}

const CRM_PROMO_SUPPORT_NOTE_KINDS = new Set(['INTERNAL', 'DIRECT_MESSAGE', 'OUTAGE_UPDATE']);

type CustomerCouponEligibility = {
  campaignType: 'TRIAL_TO_PAID' | 'RENEWAL_SOON' | 'PREMIUM_UPSELL' | 'WINBACK';
  label: string;
  enabled: boolean;
  paused: boolean;
  remainingUses: number;
  activeCoupons: number;
  redeemedCoupons: number;
  expiredCoupons: number;
  revokedCoupons: number;
  maxUsesPerUser: number;
  cooldownUntil: Date | null;
  blockedReason:
    | 'DISABLED'
    | 'PAUSED'
    | 'ACTIVE_COUPON'
    | 'CONVERTED'
    | 'LIMIT_REACHED'
    | 'COOLDOWN'
    | 'RECENT_REFUND'
    | 'SUPPORT_HEAVY'
    | null;
  eligibleNow: boolean;
};

function buildCustomerCouponEligibility(input: {
  settings: TelegramSalesSettings;
  now: Date;
  accessKeyIds: string[];
  dynamicKeyIds: string[];
  couponRedemptions: Array<{
    campaignType: string;
    status: string;
    maxUsesPerUser: number;
    issuedAt: Date;
    expiresAt: Date | null;
  }>;
  telegramOrders: Array<{
    status: string;
    kind: string;
    deliveryType: string;
    priceAmount: number | null;
    targetAccessKeyId: string | null;
    targetDynamicKeyId: string | null;
    financeStatus: string;
    financeUpdatedAt: Date | null;
    refundRequestStatus: string | null;
    refundRequestedAt: Date | null;
    refundRequestReviewedAt: Date | null;
    fulfilledAt: Date | null;
    createdAt: Date;
  }>;
  supportNotes: Array<{
    kind: string;
    createdAt: Date;
  }>;
}) {
  const refundCutoff = new Date(
    input.now.getTime() -
      Math.max(1, input.settings.promoExcludeRecentRefundDays) * 24 * 60 * 60 * 1000,
  );
  const supportCutoff = new Date(
    input.now.getTime() -
      Math.max(1, input.settings.promoSupportHeavyLookbackDays) * 24 * 60 * 60 * 1000,
  );
  const cooldownHours = Math.max(0, input.settings.promoCampaignCooldownHours || 0);
  const cooldownMs = cooldownHours * 60 * 60 * 1000;
  const recentRefundBlocked =
    input.settings.promoExcludeRecentRefundUsers &&
    input.telegramOrders.some((order) => {
      if (order.financeStatus === 'REFUNDED' && order.financeUpdatedAt) {
        return order.financeUpdatedAt >= refundCutoff;
      }
      if (!order.refundRequestStatus || !['APPROVED', 'PENDING'].includes(order.refundRequestStatus)) {
        return false;
      }
      const baseline = order.refundRequestReviewedAt || order.refundRequestedAt;
      return Boolean(baseline && baseline >= refundCutoff);
    });
  const recentSupportCount = input.supportNotes.filter(
    (note) =>
      CRM_PROMO_SUPPORT_NOTE_KINDS.has(note.kind) &&
      note.createdAt >= supportCutoff,
  ).length;
  const supportHeavyBlocked =
    input.settings.promoExcludeSupportHeavyUsers &&
    recentSupportCount >= Math.max(1, input.settings.promoSupportHeavyThreshold);
  const latestPaidFulfillment = input.telegramOrders
    .filter((order) => order.status === 'FULFILLED' && (order.priceAmount || 0) > 0)
    .map((order) => order.fulfilledAt || order.createdAt)
    .sort((left, right) => right.getTime() - left.getTime())[0] || null;

  const campaigns: Array<{
    campaignType: CustomerCouponEligibility['campaignType'];
    label: string;
    enabled: boolean;
    paused: boolean;
    converted: boolean;
  }> = [
    {
      campaignType: 'TRIAL_TO_PAID',
      label: 'Trial to paid',
      enabled: input.settings.trialCouponEnabled,
      paused: input.settings.trialCouponPaused,
      converted: input.telegramOrders.some(
        (order) => order.status === 'FULFILLED' && (order.priceAmount || 0) > 0,
      ),
    },
    {
      campaignType: 'RENEWAL_SOON',
      label: 'Renewal coupon',
      enabled: input.settings.renewalCouponEnabled,
      paused: input.settings.renewalCouponPaused,
      converted: input.telegramOrders.some(
        (order) =>
          order.status === 'FULFILLED' &&
          order.kind === 'RENEW' &&
          ((order.targetAccessKeyId && input.accessKeyIds.includes(order.targetAccessKeyId)) ||
            (order.targetDynamicKeyId && input.dynamicKeyIds.includes(order.targetDynamicKeyId))),
      ),
    },
    {
      campaignType: 'PREMIUM_UPSELL',
      label: 'Premium upsell',
      enabled: input.settings.premiumUpsellCouponEnabled,
      paused: input.settings.premiumUpsellCouponPaused,
      converted: input.telegramOrders.some(
        (order) =>
          order.status === 'FULFILLED' &&
          order.deliveryType === 'DYNAMIC_KEY' &&
          (order.priceAmount || 0) > 0,
      ),
    },
    {
      campaignType: 'WINBACK',
      label: 'Win-back',
      enabled: input.settings.winbackCouponEnabled,
      paused: input.settings.winbackCouponPaused,
      converted: Boolean(
        latestPaidFulfillment &&
          input.now.getTime() - latestPaidFulfillment.getTime() < 30 * 24 * 60 * 60 * 1000,
      ),
    },
  ];

  return campaigns.map((campaign) => {
    const relatedCoupons = input.couponRedemptions.filter(
      (coupon) => coupon.campaignType === campaign.campaignType,
    );
    const activeCoupons = relatedCoupons.filter(
      (coupon) =>
        coupon.status === 'ISSUED' &&
        (!coupon.expiresAt || coupon.expiresAt.getTime() > input.now.getTime()),
    );
    const redeemedCoupons = relatedCoupons.filter((coupon) => coupon.status === 'REDEEMED');
    const expiredCoupons = relatedCoupons.filter((coupon) => coupon.status === 'EXPIRED');
    const revokedCoupons = relatedCoupons.filter((coupon) => coupon.status === 'CANCELLED');
    const maxUsesPerUser = Math.max(
      1,
      ...relatedCoupons.map((coupon) => coupon.maxUsesPerUser || 1),
    );
    const remainingUses = Math.max(0, maxUsesPerUser - redeemedCoupons.length);
    const latestIssuedAt = relatedCoupons
      .map((coupon) => coupon.issuedAt)
      .sort((left, right) => right.getTime() - left.getTime())[0] || null;
    const cooldownUntil =
      latestIssuedAt && cooldownMs > 0
        ? new Date(latestIssuedAt.getTime() + cooldownMs)
        : null;
    const cooldownBlocked = Boolean(
      cooldownUntil && cooldownUntil.getTime() > input.now.getTime(),
    );

    let blockedReason: CustomerCouponEligibility['blockedReason'] = null;
    if (!campaign.enabled) {
      blockedReason = 'DISABLED';
    } else if (campaign.paused) {
      blockedReason = 'PAUSED';
    } else if (activeCoupons.length > 0) {
      blockedReason = 'ACTIVE_COUPON';
    } else if (campaign.converted) {
      blockedReason = 'CONVERTED';
    } else if (remainingUses <= 0) {
      blockedReason = 'LIMIT_REACHED';
    } else if (cooldownBlocked) {
      blockedReason = 'COOLDOWN';
    } else if (recentRefundBlocked) {
      blockedReason = 'RECENT_REFUND';
    } else if (supportHeavyBlocked) {
      blockedReason = 'SUPPORT_HEAVY';
    }

    return {
      campaignType: campaign.campaignType,
      label: campaign.label,
      enabled: campaign.enabled,
      paused: campaign.paused,
      remainingUses,
      activeCoupons: activeCoupons.length,
      redeemedCoupons: redeemedCoupons.length,
      expiredCoupons: expiredCoupons.length,
      revokedCoupons: revokedCoupons.length,
      maxUsesPerUser,
      cooldownUntil: cooldownBlocked ? cooldownUntil : null,
      blockedReason,
      eligibleNow: blockedReason === null,
    } satisfies CustomerCouponEligibility;
  });
}

export const usersRouter = router({
  list: adminProcedure.query(async () => {
    return db.user.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        adminScope: true,
        createdAt: true,
        _count: {
          select: { accessKeys: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }),

  getLedger: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const user = await db.user.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          email: true,
          role: true,
          adminScope: true,
          marketingTags: true,
          telegramChatId: true,
          createdAt: true,
          accessKeys: {
            select: {
              id: true,
              name: true,
              status: true,
              telegramId: true,
              tags: true,
              usedBytes: true,
              dataLimitBytes: true,
              expiresAt: true,
              lastTrafficAt: true,
              createdAt: true,
              server: {
                select: {
                  id: true,
                  name: true,
                  countryCode: true,
                },
              },
            },
            orderBy: { createdAt: 'desc' },
          },
          dynamicAccessKeys: {
            select: {
              id: true,
              name: true,
              status: true,
              telegramId: true,
              tags: true,
              usedBytes: true,
              dataLimitBytes: true,
              expiresAt: true,
              lastTrafficAt: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      const [financeControls, telegramSalesSettings] = await Promise.all([
        getFinanceControls(),
        getTelegramSalesSettings(),
      ]);

      const accessKeyIds = user.accessKeys.map((key) => key.id);
      const dynamicKeyIds = user.dynamicAccessKeys.map((key) => key.id);
      const customerChatIds = Array.from(
        new Set(
          [
            user.telegramChatId,
            ...user.accessKeys.map((key) => key.telegramId),
            ...user.dynamicAccessKeys.map((key) => key.telegramId),
          ].filter((value): value is string => Boolean(value && value.trim())),
        ),
      );

      const telegramOrders = await db.telegramOrder.findMany({
        where: {
          OR: [
            { requestedEmail: user.email },
            accessKeyIds.length > 0 ? { approvedAccessKeyId: { in: accessKeyIds } } : undefined,
            accessKeyIds.length > 0 ? { targetAccessKeyId: { in: accessKeyIds } } : undefined,
            dynamicKeyIds.length > 0 ? { approvedDynamicKeyId: { in: dynamicKeyIds } } : undefined,
            dynamicKeyIds.length > 0 ? { targetDynamicKeyId: { in: dynamicKeyIds } } : undefined,
          ].filter(Boolean) as any,
        },
        include: {
          reviewedBy: {
            select: {
              id: true,
              email: true,
            },
          },
          financeUpdatedBy: {
            select: {
              id: true,
              email: true,
            },
          },
          financeActions: {
            include: {
              createdBy: {
                select: {
                  id: true,
                  email: true,
                },
              },
            },
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      const [serverChangeRequests, premiumSupportRequests, premiumRoutingAlerts, announcementDeliveries, keyNotificationLog, telegramProfile, supportNotes] =
        await Promise.all([
          accessKeyIds.length > 0
            ? db.telegramServerChangeRequest.findMany({
                where: { accessKeyId: { in: accessKeyIds } },
                orderBy: { createdAt: 'desc' },
                take: 12,
              })
            : Promise.resolve([]),
          dynamicKeyIds.length > 0
            ? db.telegramPremiumSupportRequest.findMany({
                where: { dynamicAccessKeyId: { in: dynamicKeyIds } },
                orderBy: { createdAt: 'desc' },
                take: 12,
                select: {
                  id: true,
                  requestCode: true,
                  status: true,
                  requestType: true,
                  dynamicAccessKeyId: true,
                  createdAt: true,
                  handledAt: true,
                  dismissedAt: true,
                  followUpPending: true,
                },
              })
            : Promise.resolve([]),
          dynamicKeyIds.length > 0
            ? db.dynamicRoutingEvent.findMany({
                where: {
                  dynamicAccessKeyId: { in: dynamicKeyIds },
                  eventType: {
                    in: [
                      'PREFERRED_REGION_DEGRADED',
                      'AUTO_FALLBACK_PIN_APPLIED',
                      'PREFERRED_REGION_RECOVERED',
                    ],
                  },
                },
                include: {
                  dynamicAccessKey: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
                orderBy: { createdAt: 'desc' },
                take: 12,
              })
            : Promise.resolve([]),
          customerChatIds.length > 0
            ? db.telegramAnnouncementDelivery.findMany({
                where: {
                  chatId: { in: customerChatIds },
                },
                include: {
                  announcement: true,
                },
                orderBy: [{ createdAt: 'desc' }],
              })
            : Promise.resolve([]),
          accessKeyIds.length > 0
            ? db.notificationLog.findMany({
                where: {
                  accessKeyId: { in: accessKeyIds },
                },
                include: {
                  accessKey: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
                orderBy: [{ sentAt: 'desc' }],
                take: 12,
              })
            : Promise.resolve([]),
          customerChatIds.length > 0
            ? db.telegramUserProfile.findFirst({
                where: {
                  OR: [
                    { telegramChatId: { in: customerChatIds } },
                    { telegramUserId: { in: customerChatIds } },
                  ],
                },
              })
            : Promise.resolve(null),
          db.customerSupportNote.findMany({
            where: { userId: user.id },
            include: {
              createdBy: {
                select: {
                  id: true,
                  email: true,
                },
              },
            },
            orderBy: [{ createdAt: 'desc' }],
            take: 24,
          }),
        ]);
      const telegramIdentifiers = Array.from(
        new Set(
          [
            ...customerChatIds,
            telegramProfile?.telegramChatId,
            telegramProfile?.telegramUserId,
          ].filter((value): value is string => Boolean(value && value.trim())),
        ),
      );
      const couponRedemptions =
        telegramIdentifiers.length > 0 || accessKeyIds.length > 0 || dynamicKeyIds.length > 0
          ? await db.telegramCouponRedemption.findMany({
              where: {
                OR: [
                  telegramIdentifiers.length > 0
                    ? { telegramChatId: { in: telegramIdentifiers } }
                    : undefined,
                  telegramIdentifiers.length > 0
                    ? { telegramUserId: { in: telegramIdentifiers } }
                    : undefined,
                  accessKeyIds.length > 0 ? { accessKeyId: { in: accessKeyIds } } : undefined,
                  dynamicKeyIds.length > 0
                    ? { dynamicAccessKeyId: { in: dynamicKeyIds } }
                    : undefined,
                ].filter(Boolean) as any,
              },
              orderBy: [{ issuedAt: 'desc' }],
            })
          : [];
      type AnnouncementDeliveryItem = (typeof announcementDeliveries)[number];
      type KeyNotificationLogItem = (typeof keyNotificationLog)[number];
      type SupportNoteItem = (typeof supportNotes)[number];

      const revenueByCurrency = new Map<string, number>();
      const refundedByCurrency = new Map<string, number>();
      let refundEligibleCount = 0;

      const promoDeliveryCandidates = buildTelegramPromoDeliveryCandidates(
        announcementDeliveries.map((delivery) => ({
          ...delivery.announcement,
          deliveries: [
            {
              id: delivery.id,
              chatId: delivery.chatId,
              status: delivery.status,
              sentAt: delivery.sentAt,
            },
          ],
        })),
      );

      const orders = await Promise.all(telegramOrders.map(async (order) => {
        const refundEligibility = await evaluateTelegramOrderRefundEligibility(order);
        const promotionAttribution = resolveTelegramPromoAttribution({
          chatId: order.telegramChatId || order.telegramUserId,
          createdAt: order.createdAt,
          deliveries: promoDeliveryCandidates,
        });

        if (refundEligibility.eligible) {
          refundEligibleCount += 1;
        }

        if (order.status === 'FULFILLED' && order.priceAmount && order.priceAmount > 0) {
          const currency = (order.priceCurrency || 'MMK').trim().toUpperCase();
          revenueByCurrency.set(currency, (revenueByCurrency.get(currency) || 0) + order.priceAmount);
          if (order.financeStatus === 'REFUNDED') {
            refundedByCurrency.set(currency, (refundedByCurrency.get(currency) || 0) + order.priceAmount);
          }
        }

        return {
          ...order,
          usedBytes: refundEligibility.usedBytes.toString(),
          fulfilledPaidPurchaseCount: refundEligibility.fulfilledPaidPurchaseCount,
          refundEligible: refundEligibility.eligible,
          refundBlockedReason: refundEligibility.reason,
          promotionAttribution,
        };
      }));

      const announcementReadCount = announcementDeliveries.filter((delivery: AnnouncementDeliveryItem) => Boolean(delivery.readAt)).length;
      const announcementPinnedCount = announcementDeliveries.filter((delivery: AnnouncementDeliveryItem) => delivery.isPinned).length;
      const announcementOpenCount = announcementDeliveries.reduce(
        (sum: number, delivery: AnnouncementDeliveryItem) => sum + delivery.openCount,
        0,
      );
      const announcementClickCount = announcementDeliveries.reduce(
        (sum: number, delivery: AnnouncementDeliveryItem) => sum + delivery.clickCount,
        0,
      );

      return {
        user,
        telegramProfile: telegramProfile
          ? {
              telegramUserId: telegramProfile.telegramUserId,
              telegramChatId: telegramProfile.telegramChatId,
              username: telegramProfile.username,
              locale: telegramProfile.locale,
              allowPromoAnnouncements: telegramProfile.allowPromoAnnouncements,
              allowMaintenanceNotices: telegramProfile.allowMaintenanceNotices,
              allowReceiptNotifications: telegramProfile.allowReceiptNotifications,
              allowSupportUpdates: telegramProfile.allowSupportUpdates,
            }
          : null,
        summary: {
          activeAccessKeys: user.accessKeys.filter((key) => key.status === 'ACTIVE').length,
          activeDynamicKeys: user.dynamicAccessKeys.filter((key) => key.status === 'ACTIVE').length,
          fulfilledPaidOrders: orders.filter(
            (order) => order.status === 'FULFILLED' && (order.priceAmount || 0) > 0,
          ).length,
          refundEligibleCount,
          revenueByCurrency: Array.from(revenueByCurrency.entries()).map(([currency, amount]) => ({
            currency,
            amount,
          })),
          refundedByCurrency: Array.from(refundedByCurrency.entries()).map(([currency, amount]) => ({
            currency,
            amount,
          })),
        },
        accessKeys: user.accessKeys,
        dynamicKeys: user.dynamicAccessKeys,
        marketingTags: user.marketingTags || '',
        telegramOrders: orders,
        couponHistory: couponRedemptions.map((coupon) => ({
          id: coupon.id,
          campaignType: coupon.campaignType,
          couponCode: coupon.couponCode,
          couponDiscountAmount: coupon.couponDiscountAmount,
          couponDiscountLabel: coupon.couponDiscountLabel,
          currency: coupon.currency,
          status: coupon.status,
          maxUsesPerUser: coupon.maxUsesPerUser,
          stopAfterConversion: coupon.stopAfterConversion,
          redeemedOrderId: coupon.redeemedOrderId,
          redeemedOrderCode: coupon.redeemedOrderCode,
          issuedAt: coupon.issuedAt,
          expiresAt: coupon.expiresAt,
          redeemedAt: coupon.redeemedAt,
          cancelledAt: coupon.cancelledAt,
          statusUpdatedByUserId: coupon.statusUpdatedByUserId,
          statusUpdatedReason: coupon.statusUpdatedReason,
        })),
        couponEligibility: buildCustomerCouponEligibility({
          settings: telegramSalesSettings,
          now: new Date(),
          accessKeyIds,
          dynamicKeyIds,
          couponRedemptions: couponRedemptions.map((coupon) => ({
            campaignType: coupon.campaignType as CustomerCouponEligibility['campaignType'],
            status: coupon.status,
            maxUsesPerUser: coupon.maxUsesPerUser,
            issuedAt: coupon.issuedAt,
            expiresAt: coupon.expiresAt,
          })),
          telegramOrders: telegramOrders.map((order) => ({
            status: order.status,
            kind: order.kind,
            deliveryType: order.deliveryType,
            priceAmount: order.priceAmount ?? null,
            targetAccessKeyId: order.targetAccessKeyId,
            targetDynamicKeyId: order.targetDynamicKeyId,
            financeStatus: order.financeStatus,
            financeUpdatedAt: order.financeUpdatedAt,
            refundRequestStatus: order.refundRequestStatus,
            refundRequestedAt: order.refundRequestedAt,
            refundRequestReviewedAt: order.refundRequestReviewedAt,
            fulfilledAt: order.fulfilledAt,
            createdAt: order.createdAt,
          })),
          supportNotes: supportNotes.map((note) => ({
            kind: note.kind,
            createdAt: note.createdAt,
          })),
        }),
        serverChangeRequests,
        premiumSupportRequests,
        premiumRoutingAlerts: premiumRoutingAlerts.map((event) => ({
          id: event.id,
          dynamicAccessKeyId: event.dynamicAccessKeyId,
          dynamicAccessKeyName: event.dynamicAccessKey.name,
          eventType: event.eventType,
          severity: event.severity,
          reason: event.reason,
          metadata: parseJsonRecord(event.metadata),
          createdAt: event.createdAt,
        })),
        customerNotifications: {
          summary: {
            totalAnnouncements: announcementDeliveries.length,
            readCount: announcementReadCount,
            unreadCount: Math.max(0, announcementDeliveries.length - announcementReadCount),
            pinnedCount: announcementPinnedCount,
            openCount: announcementOpenCount,
            clickCount: announcementClickCount,
            readRate: announcementDeliveries.length > 0 ? announcementReadCount / announcementDeliveries.length : 0,
            clickRate: announcementDeliveries.length > 0 ? announcementClickCount / announcementDeliveries.length : 0,
          },
          announcements: announcementDeliveries
            .slice(0, 24)
            .map((delivery: AnnouncementDeliveryItem) => ({
              id: delivery.id,
              chatId: delivery.chatId,
              status: delivery.status,
              isPinned: delivery.isPinned,
              error: delivery.error,
              readAt: delivery.readAt,
              openCount: delivery.openCount,
              clickCount: delivery.clickCount,
              lastOpenedAt: delivery.lastOpenedAt,
              lastClickedAt: delivery.lastClickedAt,
              sentAt: delivery.sentAt,
              createdAt: delivery.createdAt,
              announcement: delivery.announcement,
            })),
          keyNotices: keyNotificationLog.map((log: KeyNotificationLogItem) => ({
            id: log.id,
            event: log.event,
            message: log.message,
            status: log.status,
            error: log.error,
            sentAt: log.sentAt,
            accessKeyId: log.accessKeyId,
            accessKeyName: log.accessKey?.name || null,
          })),
        },
        supportNotes: supportNotes.map((note: SupportNoteItem) => ({
          id: note.id,
          kind: note.kind,
          note: note.note,
          createdAt: note.createdAt,
          updatedAt: note.updatedAt,
          createdBy: note.createdBy,
        })),
        financePermissions: {
          canManage: canUserManageFinance(ctx.user, financeControls),
          canConfigure: canUserConfigureFinance(ctx.user, financeControls),
        },
        crmPermissions: {
          canMessageCustomer: hasTelegramReviewManageScope(ctx.user.adminScope),
          canSendOutageUpdate: hasOutageManageScope(ctx.user.adminScope),
          canAddSupportNote: hasTelegramReviewManageScope(ctx.user.adminScope),
          canManageCustomerTags: hasUserManageScope(ctx.user.adminScope),
          canManageCoupons: hasTelegramAnnouncementManageScope(ctx.user.adminScope),
          canResendAnnouncements: hasTelegramAnnouncementManageScope(ctx.user.adminScope),
        },
      };
    }),

  updateMarketingTags: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        marketingTags: z.string().max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!hasUserManageScope(ctx.user.adminScope)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to update customer tags.',
        });
      }

      const user = await db.user.findUnique({
        where: { id: input.userId },
        select: { id: true },
      });

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found.',
        });
      }

      const normalizedTags = input.marketingTags
        .split(',')
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean)
        .filter((tag, index, values) => values.indexOf(tag) === index)
        .join(',');

      await db.user.update({
        where: { id: input.userId },
        data: {
          marketingTags: normalizedTags,
        },
      });

      await writeAuditLog({
        userId: ctx.user.id,
        ip: ctx.clientIp,
        action: 'CUSTOMER_MARKETING_TAGS_UPDATED',
        entity: 'USER',
        entityId: input.userId,
        details: {
          marketingTags: normalizedTags,
        },
      });

      return {
        marketingTags: normalizedTags,
      };
    }),

  updateNotificationPreferences: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        allowPromoAnnouncements: z.boolean(),
        allowMaintenanceNotices: z.boolean(),
        allowReceiptNotifications: z.boolean(),
        allowSupportUpdates: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!hasTelegramReviewManageScope(ctx.user.adminScope)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to update customer notification preferences.',
        });
      }

      const user = await db.user.findUnique({
        where: { id: input.userId },
        select: {
          id: true,
          telegramChatId: true,
          accessKeys: {
            select: { telegramId: true },
            take: 1,
          },
          dynamicAccessKeys: {
            select: { telegramId: true },
            take: 1,
          },
        },
      });

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found.',
        });
      }

      const telegramIdentifier =
        user.telegramChatId ||
        user.accessKeys[0]?.telegramId ||
        user.dynamicAccessKeys[0]?.telegramId;

      if (!telegramIdentifier) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This customer does not have a linked Telegram profile yet.',
        });
      }

      const existingProfile = await db.telegramUserProfile.findFirst({
        where: {
          OR: [
            { telegramChatId: telegramIdentifier },
            { telegramUserId: telegramIdentifier },
          ],
        },
        select: {
          telegramUserId: true,
          telegramChatId: true,
        },
      });

      if (!existingProfile) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Telegram notification preferences are not available until the user starts the bot.',
        });
      }

      await db.telegramUserProfile.update({
        where: { telegramUserId: existingProfile.telegramUserId },
        data: {
          telegramChatId: existingProfile.telegramChatId || telegramIdentifier,
          allowPromoAnnouncements: input.allowPromoAnnouncements,
          allowMaintenanceNotices: input.allowMaintenanceNotices,
          allowReceiptNotifications: input.allowReceiptNotifications,
          allowSupportUpdates: input.allowSupportUpdates,
        },
      });

      await writeAuditLog({
        userId: ctx.user.id,
        ip: ctx.clientIp,
        action: 'USER_NOTIFICATION_PREFERENCES_UPDATE',
        entity: 'USER',
        entityId: input.userId,
        details: {
          allowPromoAnnouncements: input.allowPromoAnnouncements,
          allowMaintenanceNotices: input.allowMaintenanceNotices,
          allowReceiptNotifications: input.allowReceiptNotifications,
          allowSupportUpdates: input.allowSupportUpdates,
        },
      });

      return { success: true };
    }),

  sendDirectTelegramMessage: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        message: z.string().trim().min(3).max(2000),
        includeSupportButton: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!hasTelegramReviewManageScope(ctx.user.adminScope)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to send customer Telegram messages.',
        });
      }

      const config = await getTelegramConfig();
      if (!config?.botToken) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Telegram bot is not configured.',
        });
      }

      const { user, destinationChatId } = await resolveCustomerTelegramDestination(input.userId);
      if (!destinationChatId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This customer does not have a linked Telegram chat yet.',
        });
      }

      const supportLink = input.includeSupportButton ? await getTelegramSupportLink() : null;
      const sent = await sendTelegramMessage(
        config.botToken,
        destinationChatId,
        [`💬 <b>Message from admin</b>`, '', input.message.trim()].join('\n'),
        supportLink
          ? {
              replyMarkup: {
                inline_keyboard: [[{ text: 'Support', url: supportLink }]],
              },
            }
          : undefined,
      );

      if (!sent) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Telegram message could not be delivered.',
        });
      }

      await db.customerSupportNote.create({
        data: {
          userId: user.id,
          createdByUserId: ctx.user.id,
          kind: 'DIRECT_MESSAGE',
          note: input.message.trim(),
        },
      });

      await writeAuditLog({
        userId: ctx.user.id,
        ip: ctx.clientIp,
        action: 'CUSTOMER_TELEGRAM_MESSAGE_SENT',
        entity: 'USER',
        entityId: user.id,
        details: {
          destinationChatId,
          includeSupportButton: input.includeSupportButton,
        },
      });

      return { success: true };
    }),

  resendTelegramOrderReceipt: adminProcedure
    .input(
      z.object({
        orderId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!hasTelegramReviewManageScope(ctx.user.adminScope)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to resend Telegram receipts.',
        });
      }

      const order = await db.telegramOrder.findUnique({
        where: { id: input.orderId },
        select: {
          id: true,
          orderCode: true,
          kind: true,
          status: true,
          locale: true,
          telegramChatId: true,
          telegramUserId: true,
          requestedEmail: true,
          planName: true,
          planCode: true,
          priceLabel: true,
          priceAmount: true,
          priceCurrency: true,
          paymentMethodLabel: true,
          durationMonths: true,
          durationDays: true,
          requestedName: true,
          selectedServerName: true,
          selectedServerCountryCode: true,
          deliveryType: true,
          targetAccessKeyId: true,
          targetDynamicKeyId: true,
          approvedAccessKeyId: true,
          approvedDynamicKeyId: true,
        },
      });

      if (!order) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Telegram order not found.',
        });
      }

      if (order.status !== 'FULFILLED') {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Only fulfilled orders can resend a receipt.',
        });
      }

      const [accessKey, dynamicKey] = await Promise.all([
        order.approvedAccessKeyId
          ? db.accessKey.findUnique({
              where: { id: order.approvedAccessKeyId },
              select: { name: true },
            })
          : Promise.resolve(null),
        order.approvedDynamicKeyId
          ? db.dynamicAccessKey.findUnique({
              where: { id: order.approvedDynamicKeyId },
              select: { name: true },
            })
          : Promise.resolve(null),
      ]);

      const destinationChatId = order.telegramChatId || order.telegramUserId;
      if (!destinationChatId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This order is not linked to a Telegram chat.',
        });
      }

      const deliveredKeyName = accessKey?.name || dynamicKey?.name;
      if (!deliveredKeyName) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'The delivered key could not be resolved for this receipt.',
        });
      }

      const sent = await sendTelegramOrderReceiptConfirmation({
        chatId: destinationChatId,
        locale: coerceSupportedLocale(order.locale) || 'en',
        order,
        deliveredKeyName,
        isTrial: order.kind === 'TRIAL',
      });

      if (!sent) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Receipt resend failed.',
        });
      }

      const receiptUserFilters = [
        order.requestedEmail ? { email: order.requestedEmail } : undefined,
        order.approvedAccessKeyId ? { accessKeys: { some: { id: order.approvedAccessKeyId } } } : undefined,
        order.targetAccessKeyId ? { accessKeys: { some: { id: order.targetAccessKeyId } } } : undefined,
        order.approvedDynamicKeyId ? { dynamicAccessKeys: { some: { id: order.approvedDynamicKeyId } } } : undefined,
        order.targetDynamicKeyId ? { dynamicAccessKeys: { some: { id: order.targetDynamicKeyId } } } : undefined,
      ].filter(Boolean) as any;

      const receiptUser = receiptUserFilters.length
        ? await db.user.findFirst({
            where: {
              OR: receiptUserFilters,
            },
            select: { id: true },
          })
        : null;

      if (receiptUser) {
        await db.customerSupportNote.create({
          data: {
            userId: receiptUser.id,
            createdByUserId: ctx.user.id,
            kind: 'RECEIPT_RESENT',
            note: `${order.orderCode} • ${order.planName || order.planCode || 'Receipt'}`,
          },
        });
      }

      await writeAuditLog({
        userId: ctx.user.id,
        ip: ctx.clientIp,
        action: 'CUSTOMER_RECEIPT_RESENT',
        entity: 'TELEGRAM_ORDER',
        entityId: order.id,
        details: {
          orderCode: order.orderCode,
          destinationChatId,
        },
      });

      return { success: true };
    }),

  resendCustomerSharePage: adminProcedure
    .input(
      z.object({
        keyType: z.enum(['ACCESS_KEY', 'DYNAMIC_KEY']),
        keyId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!hasTelegramReviewManageScope(ctx.user.adminScope)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to resend customer share pages.',
        });
      }

      if (input.keyType === 'ACCESS_KEY') {
        await sendAccessKeySharePageToTelegram({
          accessKeyId: input.keyId,
          reason: 'RESENT',
          source: 'crm_action_center',
        });
      } else {
        await sendDynamicKeySharePageToTelegram({
          dynamicAccessKeyId: input.keyId,
          reason: 'RESENT',
          source: 'crm_action_center',
        });
      }

      const shareUser = await db.user.findFirst({
        where:
          input.keyType === 'ACCESS_KEY'
            ? { accessKeys: { some: { id: input.keyId } } }
            : { dynamicAccessKeys: { some: { id: input.keyId } } },
        select: { id: true },
      });

      if (shareUser) {
        await db.customerSupportNote.create({
          data: {
            userId: shareUser.id,
            createdByUserId: ctx.user.id,
            kind: 'SHARE_PAGE_RESENT',
            note: `${input.keyType === 'ACCESS_KEY' ? 'Standard key' : 'Premium key'} • ${input.keyId}`,
          },
        });
      }

      await writeAuditLog({
        userId: ctx.user.id,
        ip: ctx.clientIp,
        action: 'CUSTOMER_SHARE_PAGE_RESENT',
        entity: input.keyType,
        entityId: input.keyId,
        details: {
          via: 'crm_action_center',
        },
      });

      return { success: true };
    }),

  sendCustomerOutageUpdate: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        noticeType: z.enum(['ISSUE', 'DOWNTIME', 'MAINTENANCE']).default('ISSUE'),
        serverName: z.string().trim().min(1).max(120),
        message: z.string().trim().min(5).max(1000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!hasOutageManageScope(ctx.user.adminScope)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to send outage updates.',
        });
      }

      const { user, destinationChatId } = await resolveCustomerTelegramDestination(input.userId);
      if (!destinationChatId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This customer does not have a linked Telegram chat yet.',
        });
      }

      const result = await sendServerIssueNoticeToTelegram({
        chatIds: [destinationChatId],
        serverName: input.serverName.trim(),
        noticeType: input.noticeType,
        message: input.message.trim(),
      });

      if (result.sentCount === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Outage update could not be delivered.',
        });
      }

      await db.customerSupportNote.create({
        data: {
          userId: user.id,
          createdByUserId: ctx.user.id,
          kind: 'OUTAGE_UPDATE',
          note: `${input.serverName.trim()} • ${input.message.trim()}`,
        },
      });

      await writeAuditLog({
        userId: ctx.user.id,
        ip: ctx.clientIp,
        action: 'CUSTOMER_OUTAGE_UPDATE_SENT',
        entity: 'USER',
        entityId: user.id,
        details: {
          destinationChatId,
          noticeType: input.noticeType,
          serverName: input.serverName.trim(),
        },
      });

      return { success: true };
    }),

  addSupportNote: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        note: z.string().trim().min(3).max(2000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!hasTelegramReviewManageScope(ctx.user.adminScope)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to add support notes.',
        });
      }

      const note = await db.customerSupportNote.create({
        data: {
          userId: input.userId,
          createdByUserId: ctx.user.id,
          kind: 'INTERNAL',
          note: input.note.trim(),
        },
        include: {
          createdBy: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      });

      await writeAuditLog({
        userId: ctx.user.id,
        ip: ctx.clientIp,
        action: 'CUSTOMER_SUPPORT_NOTE_CREATED',
        entity: 'USER',
        entityId: input.userId,
        details: {
          noteId: note.id,
        },
      });

      return note;
    }),

  updateCouponStatus: adminProcedure
    .input(
      z.object({
        couponId: z.string(),
        action: z.enum(['REVOKE', 'EXPIRE']),
        reason: z.string().trim().max(300).optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!hasTelegramAnnouncementManageScope(ctx.user.adminScope)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to manage customer coupons.',
        });
      }

      const coupon = await db.telegramCouponRedemption.findUnique({
        where: { id: input.couponId },
        select: {
          id: true,
          status: true,
          couponCode: true,
          campaignType: true,
        },
      });

      if (!coupon) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Coupon not found.',
        });
      }

      if (coupon.status !== 'ISSUED') {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Only active issued coupons can be revoked or expired from CRM.',
        });
      }

      const status = input.action === 'REVOKE' ? 'CANCELLED' : 'EXPIRED';
      const now = new Date();
      const updated = await db.telegramCouponRedemption.update({
        where: { id: coupon.id },
        data: {
          status,
          cancelledAt: input.action === 'REVOKE' ? now : null,
          expiresAt: input.action === 'EXPIRE' ? now : undefined,
          statusUpdatedByUserId: ctx.user.id,
          statusUpdatedReason: input.reason?.trim() || null,
        },
        select: {
          id: true,
          status: true,
          couponCode: true,
          campaignType: true,
          statusUpdatedReason: true,
          expiresAt: true,
          cancelledAt: true,
        },
      });

      await writeAuditLog({
        userId: ctx.user.id,
        ip: ctx.clientIp,
        action:
          input.action === 'REVOKE'
            ? 'TELEGRAM_COUPON_REVOKED'
            : 'TELEGRAM_COUPON_EXPIRED',
        entity: 'TELEGRAM_COUPON',
        entityId: coupon.id,
        details: {
          couponCode: coupon.couponCode,
          campaignType: coupon.campaignType,
          reason: input.reason?.trim() || null,
        },
      });

      return updated;
    }),

  resendAnnouncementToCustomer: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        announcementId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!hasTelegramAnnouncementManageScope(ctx.user.adminScope)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to resend customer announcements.',
        });
      }

      const { user, destinationChatId } = await resolveCustomerTelegramDestination(input.userId);
      if (!destinationChatId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This customer does not have a linked Telegram chat yet.',
        });
      }

      const source = await db.telegramAnnouncement.findUnique({
        where: { id: input.announcementId },
        select: {
          id: true,
          type: true,
          templateId: true,
          templateName: true,
          title: true,
          message: true,
          heroImageUrl: true,
          cardStyle: true,
          includeSupportButton: true,
          pinToInbox: true,
        },
      });

      if (!source) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Announcement not found.',
        });
      }

      const resend = await db.telegramAnnouncement.create({
        data: {
          audience: 'DIRECT_USER',
          type: source.type,
          templateId: source.templateId,
          templateName: source.templateName,
          targetDirectChatId: destinationChatId,
          targetDirectUserLabel: user.email,
          title: source.title,
          message: source.message,
          heroImageUrl: source.heroImageUrl,
          cardStyle: source.cardStyle,
          includeSupportButton: source.includeSupportButton,
          pinToInbox: source.pinToInbox,
          status: 'SCHEDULED',
          scheduledFor: new Date(),
          createdByUserId: ctx.user.id,
          createdByEmail: ctx.user.email || null,
        },
      });

      const result = await dispatchTelegramAnnouncement({
        announcementId: resend.id,
        now: new Date(),
      });

      if (result.skipped) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Announcement resend could not be delivered to this customer.',
        });
      }

      await db.customerSupportNote.create({
        data: {
          userId: user.id,
          createdByUserId: ctx.user.id,
          kind: 'ANNOUNCEMENT_RESEND',
          note: `${source.title}${source.templateName ? ` • ${source.templateName}` : ''}`,
        },
      });

      await writeAuditLog({
        userId: ctx.user.id,
        ip: ctx.clientIp,
        action: 'CUSTOMER_ANNOUNCEMENT_RESENT',
        entity: 'USER',
        entityId: user.id,
        details: {
          sourceAnnouncementId: source.id,
          resendAnnouncementId: resend.id,
          destinationChatId,
        },
      });

      return {
        success: true,
        announcementId: resend.id,
      };
    }),

  updateAdminScope: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        adminScope: z.enum(ADMIN_SCOPE_VALUES),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!isOwnerLikeAdmin(ctx.user.adminScope)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only owner-level admins can update admin scopes.',
        });
      }

      const target = await db.user.findUnique({
        where: { id: input.userId },
        select: {
          id: true,
          email: true,
          role: true,
          adminScope: true,
        },
      });

      if (!target) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      if (target.role !== 'ADMIN') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Only admin accounts can have an admin scope.',
        });
      }

      const nextScope = normalizeAdminScope(input.adminScope);
      if (!nextScope) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invalid admin scope.',
        });
      }

      const currentIsOwnerLike = isOwnerLikeAdmin(target.adminScope);
      if (currentIsOwnerLike && nextScope !== 'OWNER') {
        const ownerCount = await db.user.count({
          where: {
            role: 'ADMIN',
            OR: [{ adminScope: 'OWNER' }, { adminScope: null }],
          },
        });
        if (ownerCount <= 1) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'At least one owner-level admin must remain.',
          });
        }
      }

      const updated = await db.user.update({
        where: { id: target.id },
        data: {
          adminScope: nextScope,
        },
        select: {
          id: true,
          email: true,
          role: true,
          adminScope: true,
        },
      });

      await writeAuditLog({
        userId: ctx.user.id,
        ip: ctx.clientIp,
        action: 'USER_ADMIN_SCOPE_UPDATE',
        entity: 'USER',
        entityId: target.id,
        details: {
          email: target.email,
          previousScope: normalizeAdminScope(target.adminScope) || 'OWNER',
          nextScope,
        },
      });

      return updated;
    }),

  getFinanceControls: adminProcedure.query(async ({ ctx }) => {
    const controls = await getFinanceControls();
    return {
      ...controls,
      permissions: {
        canManage: canUserManageFinance(ctx.user, controls),
        canConfigure: canUserConfigureFinance(ctx.user, controls),
      },
    };
  }),

  updateFinanceControls: adminProcedure
    .input(financeControlsSchema)
    .mutation(async ({ ctx, input }) => {
      const current = await getFinanceControls();
      if (!canUserConfigureFinance(ctx.user, current)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only finance owners can update finance controls.',
        });
      }

      const normalized = normalizeFinanceControlsSettings(input);
      await db.settings.upsert({
        where: { key: FINANCE_SETTINGS_KEY },
        create: {
          key: FINANCE_SETTINGS_KEY,
          value: JSON.stringify(normalized),
        },
        update: {
          value: JSON.stringify(normalized),
        },
      });

      await writeAuditLog({
        userId: ctx.user.id,
        ip: ctx.clientIp,
        action: 'FINANCE_CONTROLS_UPDATE',
        entity: 'SETTINGS',
        entityId: FINANCE_SETTINGS_KEY,
        details: normalized,
      });

      return {
        ...normalized,
        permissions: {
          canManage: canUserManageFinance(ctx.user, normalized),
          canConfigure: canUserConfigureFinance(ctx.user, normalized),
      },
    };
  }),

  getRefundQueue: adminProcedure
    .input(
      z.object({
        status: z.enum(['ALL', 'PENDING', 'APPROVED', 'REJECTED']).default('PENDING'),
        assignment: z.enum(['ALL', 'UNCLAIMED', 'MINE', 'CLAIMED']).default('ALL'),
        sort: z.enum(['REQUESTED_DESC', 'REQUESTED_ASC', 'AMOUNT_DESC']).default('REQUESTED_DESC'),
        query: z.string().trim().max(120).optional(),
        limit: z.number().int().min(1).max(100).default(25),
      }),
    )
    .query(async ({ ctx, input }) => {
      const financeControls = await getFinanceControls();
      const statusWhere =
        input.status === 'ALL'
          ? { refundRequestStatus: { in: ['PENDING', 'APPROVED', 'REJECTED'] } }
          : { refundRequestStatus: input.status };
      const assignmentWhere =
        input.assignment === 'UNCLAIMED'
          ? { refundAssignedReviewerUserId: null }
          : input.assignment === 'MINE'
            ? { refundAssignedReviewerUserId: ctx.user.id }
            : input.assignment === 'CLAIMED'
              ? { refundAssignedReviewerUserId: { not: null } }
              : undefined;
      const query = input.query?.trim();
      const filters: Array<Record<string, unknown>> = [statusWhere];
      if (assignmentWhere) {
        filters.push(assignmentWhere);
      }
      if (query) {
        filters.push({
          OR: [
            { orderCode: { contains: query, mode: 'insensitive' as const } },
            { requestedEmail: { contains: query, mode: 'insensitive' as const } },
            { telegramUsername: { contains: query, mode: 'insensitive' as const } },
            { telegramUserId: { contains: query } },
            { requestedName: { contains: query, mode: 'insensitive' as const } },
            { planName: { contains: query, mode: 'insensitive' as const } },
            { planCode: { contains: query, mode: 'insensitive' as const } },
          ],
        });
      }
      const where = filters.length === 1 ? filters[0] : { AND: filters };
      const orderBy =
        input.sort === 'REQUESTED_ASC'
          ? [{ refundRequestedAt: 'asc' as const }, { createdAt: 'asc' as const }]
          : input.sort === 'AMOUNT_DESC'
            ? [{ priceAmount: 'desc' as const }, { refundRequestedAt: 'asc' as const }, { createdAt: 'asc' as const }]
            : [{ refundAssignedAt: 'asc' as const }, { refundRequestedAt: 'desc' as const }, { createdAt: 'desc' as const }];

      const [orders, pendingCount, approvedCount, rejectedCount] = await Promise.all([
        db.telegramOrder.findMany({
          where,
          include: {
            reviewedBy: {
              select: {
                id: true,
                email: true,
              },
            },
            financeUpdatedBy: {
              select: {
                id: true,
                email: true,
              },
            },
          },
          orderBy,
          take: input.limit,
        }),
        db.telegramOrder.count({ where: { refundRequestStatus: 'PENDING' } }),
        db.telegramOrder.count({ where: { refundRequestStatus: 'APPROVED' } }),
        db.telegramOrder.count({ where: { refundRequestStatus: 'REJECTED' } }),
      ]);

      const emailMatches = Array.from(
        new Set(
          orders
            .map((order) => order.requestedEmail?.trim().toLowerCase())
            .filter((value): value is string => Boolean(value)),
        ),
      );
      const matchedUsers = emailMatches.length
        ? await db.user.findMany({
            where: { email: { in: emailMatches } },
            select: { id: true, email: true },
          })
        : [];
      const usersByEmail = new Map(
        matchedUsers.map((user) => [user.email.trim().toLowerCase(), user.id]),
      );

      const enrichedOrders = await Promise.all(
        orders.map(async (order) => {
          const refundEligibility = await evaluateTelegramOrderRefundEligibility(order);
          const customerLedgerId = order.requestedEmail
            ? usersByEmail.get(order.requestedEmail.trim().toLowerCase()) || null
            : null;

          return {
            ...order,
            customerLedgerId,
            refundAssignedReviewerUserId: order.refundAssignedReviewerUserId,
            refundAssignedReviewerEmail: order.refundAssignedReviewerEmail,
            refundAssignedAt: order.refundAssignedAt,
            usedBytes: refundEligibility.usedBytes.toString(),
            fulfilledPaidPurchaseCount: refundEligibility.fulfilledPaidPurchaseCount,
            refundEligible: refundEligibility.eligible,
            refundBlockedReason: refundEligibility.reason,
          };
        }),
      );

      return {
        orders: enrichedOrders,
        summary: {
          pending: pendingCount,
          approved: approvedCount,
          rejected: rejectedCount,
        },
        permissions: {
          canManage: canUserManageFinance(ctx.user, financeControls),
        },
      };
    }),

  claimRefundRequest: adminProcedure
    .input(
      z.object({
        orderId: z.string(),
        claimed: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const controls = await getFinanceControls();
      if (!canUserManageFinance(ctx.user, controls)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to manage refund review assignments.',
        });
      }

      const order = await db.telegramOrder.findUnique({
        where: { id: input.orderId },
        select: {
          id: true,
          orderCode: true,
          refundRequestStatus: true,
          refundAssignedReviewerUserId: true,
          refundAssignedReviewerEmail: true,
          refundAssignedAt: true,
        },
      });

      if (!order) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Telegram order not found.',
        });
      }

      if (order.refundRequestStatus !== 'PENDING') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Only pending refund requests can be claimed.',
        });
      }

      if (input.claimed) {
        if (
          order.refundAssignedReviewerUserId &&
          order.refundAssignedReviewerUserId !== ctx.user.id
        ) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `This refund request is already claimed by ${order.refundAssignedReviewerEmail || 'another admin'}.`,
          });
        }

        const claimedOrder = await db.telegramOrder.update({
          where: { id: order.id },
          data: {
            refundAssignedReviewerUserId: ctx.user.id,
            refundAssignedReviewerEmail: ctx.user.email || null,
            refundAssignedAt: new Date(),
          },
          select: {
            id: true,
            orderCode: true,
            refundAssignedReviewerUserId: true,
            refundAssignedReviewerEmail: true,
            refundAssignedAt: true,
          },
        });

        await writeAuditLog({
          userId: ctx.user.id,
          ip: ctx.clientIp,
          action: 'TELEGRAM_ORDER_REFUND_CLAIMED',
          entity: 'TELEGRAM_ORDER',
          entityId: order.id,
          details: {
            orderCode: order.orderCode,
            refundAssignedReviewerEmail: ctx.user.email || null,
          },
        });

        return claimedOrder;
      }

      if (
        order.refundAssignedReviewerUserId &&
        order.refundAssignedReviewerUserId !== ctx.user.id
      ) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `This refund request is claimed by ${order.refundAssignedReviewerEmail || 'another admin'}.`,
        });
      }

      const releasedOrder = await db.telegramOrder.update({
        where: { id: order.id },
        data: {
          refundAssignedReviewerUserId: null,
          refundAssignedReviewerEmail: null,
          refundAssignedAt: null,
        },
        select: {
          id: true,
          orderCode: true,
          refundAssignedReviewerUserId: true,
          refundAssignedReviewerEmail: true,
          refundAssignedAt: true,
        },
      });

      await writeAuditLog({
        userId: ctx.user.id,
        ip: ctx.clientIp,
        action: 'TELEGRAM_ORDER_REFUND_RELEASED',
        entity: 'TELEGRAM_ORDER',
        entityId: order.id,
        details: {
          orderCode: order.orderCode,
          previousRefundAssignedReviewerEmail: order.refundAssignedReviewerEmail || null,
        },
      });

      return releasedOrder;
    }),

  assignRefundReviewer: adminProcedure
    .input(
      z.object({
        orderId: z.string(),
        reviewerUserId: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const controls = await getFinanceControls();
      if (!canUserManageFinance(ctx.user, controls)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to manage refund review assignments.',
        });
      }

      const order = await db.telegramOrder.findUnique({
        where: { id: input.orderId },
        select: {
          id: true,
          orderCode: true,
          refundRequestStatus: true,
          refundAssignedReviewerUserId: true,
          refundAssignedReviewerEmail: true,
          refundAssignedAt: true,
        },
      });

      if (!order) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Telegram order not found.',
        });
      }

      if (order.refundRequestStatus !== 'PENDING') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Only pending refund requests can be reassigned.',
        });
      }

      let nextReviewer: { id: string; email: string; role: string } | null = null;
      if (input.reviewerUserId) {
        nextReviewer = await db.user.findUnique({
          where: { id: input.reviewerUserId },
          select: {
            id: true,
            email: true,
            role: true,
          },
        });

        if (!nextReviewer || nextReviewer.role !== 'ADMIN') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Selected reviewer is not a valid admin.',
          });
        }
      }

      const isUnchanged =
        (nextReviewer?.id || null) === (order.refundAssignedReviewerUserId || null) &&
        (nextReviewer?.email || null) === (order.refundAssignedReviewerEmail || null);

      if (isUnchanged) {
        return {
          id: order.id,
          orderCode: order.orderCode,
          refundAssignedReviewerUserId: order.refundAssignedReviewerUserId,
          refundAssignedReviewerEmail: order.refundAssignedReviewerEmail,
          refundAssignedAt: order.refundAssignedAt,
        };
      }

      const updatedOrder = await db.telegramOrder.update({
        where: { id: order.id },
        data: {
          refundAssignedReviewerUserId: nextReviewer?.id || null,
          refundAssignedReviewerEmail: nextReviewer?.email || null,
          refundAssignedAt: nextReviewer ? new Date() : null,
        },
        select: {
          id: true,
          orderCode: true,
          refundAssignedReviewerUserId: true,
          refundAssignedReviewerEmail: true,
          refundAssignedAt: true,
        },
      });

      await writeAuditLog({
        userId: ctx.user.id,
        ip: ctx.clientIp,
        action: nextReviewer ? 'TELEGRAM_ORDER_REFUND_REASSIGNED' : 'TELEGRAM_ORDER_REFUND_UNASSIGNED',
        entity: 'TELEGRAM_ORDER',
        entityId: order.id,
        details: {
          orderCode: order.orderCode,
          previousRefundAssignedReviewerEmail: order.refundAssignedReviewerEmail || null,
          refundAssignedReviewerEmail: nextReviewer?.email || null,
        },
      });

      return updatedOrder;
    }),

  runFinanceDigestNow: adminProcedure.mutation(async ({ ctx }) => {
    const controls = await getFinanceControls();
    if (!canUserManageFinance(ctx.user, controls)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'You do not have permission to send the finance digest.',
      });
    }

    return runTelegramFinanceDigestCycle({ now: new Date(), force: true });
  }),

  reconcileTelegramOrder: adminProcedure
    .input(
      z.object({
        orderId: z.string(),
        action: z.enum(['VERIFY', 'REFUND', 'CREDIT']),
        note: z.string().trim().max(500).optional().nullable(),
        amount: z.number().int().min(0).optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const controls = await getFinanceControls();
      if (!canUserManageFinance(ctx.user, controls)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to manage finance actions.',
        });
      }

      const order = await db.telegramOrder.findUnique({
        where: { id: input.orderId },
        select: {
          id: true,
          orderCode: true,
          status: true,
          financeStatus: true,
          priceAmount: true,
          priceCurrency: true,
          telegramUserId: true,
          telegramChatId: true,
          approvedAccessKeyId: true,
          targetAccessKeyId: true,
          approvedDynamicKeyId: true,
          targetDynamicKeyId: true,
          refundRequestStatus: true,
          refundAssignedReviewerUserId: true,
          refundAssignedReviewerEmail: true,
          locale: true,
        },
      });

      if (!order) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Telegram order not found',
        });
      }
      if (input.action === 'REFUND') {
        if (
          order.refundRequestStatus === 'PENDING' &&
          order.refundAssignedReviewerUserId &&
          order.refundAssignedReviewerUserId !== ctx.user.id
        ) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `This refund request is claimed by ${order.refundAssignedReviewerEmail || 'another admin'}.`,
          });
        }

        const refundEligibility = await evaluateTelegramOrderRefundEligibility(order);

        if (!refundEligibility.eligible) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: refundEligibility.reason || 'This order is not eligible for refund.',
          });
        }
      }

      const financeStatus =
        input.action === 'VERIFY'
          ? 'VERIFIED'
          : input.action === 'REFUND'
            ? 'REFUNDED'
            : 'CREDITED';
      const note = input.note?.trim() || null;
      const amount =
        typeof input.amount === 'number' && Number.isFinite(input.amount)
          ? input.amount
          : order.priceAmount ?? null;
      const currency = (order.priceCurrency || 'MMK').trim().toUpperCase();

      await db.$transaction([
        db.telegramOrder.update({
          where: { id: order.id },
          data: {
            financeStatus,
            financeNote: note,
            financeUpdatedAt: new Date(),
            financeUpdatedByUserId: ctx.user.id,
            refundRequestStatus:
              input.action === 'REFUND' && order.refundRequestStatus === 'PENDING'
                ? 'APPROVED'
                : order.refundRequestStatus,
            refundReviewReasonCode:
              input.action === 'REFUND' && order.refundRequestStatus === 'PENDING'
                ? 'approved_manual_exception'
                : undefined,
            refundRequestReviewedAt:
              input.action === 'REFUND' && order.refundRequestStatus === 'PENDING'
                ? new Date()
                : undefined,
            refundRequestReviewedByUserId:
              input.action === 'REFUND' && order.refundRequestStatus === 'PENDING'
                ? ctx.user.id
                : undefined,
            refundRequestReviewerEmail:
              input.action === 'REFUND' && order.refundRequestStatus === 'PENDING'
                ? ctx.user.email || null
                : undefined,
            refundAssignedReviewerUserId:
              input.action === 'REFUND' && order.refundRequestStatus === 'PENDING'
                ? null
                : undefined,
            refundAssignedReviewerEmail:
              input.action === 'REFUND' && order.refundRequestStatus === 'PENDING'
                ? null
                : undefined,
            refundAssignedAt:
              input.action === 'REFUND' && order.refundRequestStatus === 'PENDING'
                ? null
                : undefined,
          },
        }),
        db.telegramOrderFinanceAction.create({
          data: {
            orderId: order.id,
            actionType: input.action,
            amount,
            currency,
            note,
            createdByUserId: ctx.user.id,
          },
        }),
      ]);

      await writeAuditLog({
        userId: ctx.user.id,
        ip: ctx.clientIp,
        action: `TELEGRAM_ORDER_${input.action}`,
        entity: 'TELEGRAM_ORDER',
        entityId: order.id,
        details: {
          orderCode: order.orderCode,
          financeStatus,
          amount,
          currency,
          note,
        },
      });

      if (input.action === 'REFUND' && order.refundRequestStatus === 'PENDING') {
        await sendTelegramRefundDecisionMessage({
          chatId: order.telegramChatId || order.telegramUserId,
          orderCode: order.orderCode,
          approved: true,
          amount,
          currency,
          locale: order.locale,
        });
      }

      return {
        success: true,
        financeStatus,
      };
    }),

  reviewRefundRequest: adminProcedure
    .input(
      z.object({
        orderId: z.string(),
        action: z.enum(['APPROVE', 'REJECT']),
        reasonPresetCode: z.string().trim().max(120).optional().nullable(),
        note: z.string().trim().max(500).optional().nullable(),
        customerMessage: z.string().trim().max(500).optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const controls = await getFinanceControls();
      if (!canUserManageFinance(ctx.user, controls)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to review refund requests.',
        });
      }

      const order = await db.telegramOrder.findUnique({
        where: { id: input.orderId },
        select: {
          id: true,
          orderCode: true,
          status: true,
          financeStatus: true,
          priceAmount: true,
          priceCurrency: true,
          telegramUserId: true,
          telegramChatId: true,
          refundRequestStatus: true,
          refundAssignedReviewerUserId: true,
          refundAssignedReviewerEmail: true,
          locale: true,
        },
      });

      if (!order) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Telegram order not found',
        });
      }

      if (order.refundRequestStatus !== 'PENDING') {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'There is no pending refund request for this order.',
        });
      }

      if (
        order.refundAssignedReviewerUserId &&
        order.refundAssignedReviewerUserId !== ctx.user.id
      ) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `This refund request is claimed by ${order.refundAssignedReviewerEmail || 'another admin'}.`,
        });
      }

      const preset = getRefundReasonPreset(input.reasonPresetCode?.trim() || null);
      if (preset && preset.action !== input.action) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Refund reason preset does not match the chosen action.',
        });
      }

      const note = input.note?.trim() || preset?.adminNote || null;
      const customerMessage = input.customerMessage?.trim() || preset?.customerMessage || null;
      const reasonPresetCode = preset?.code || null;

      if (input.action === 'APPROVE') {
        const refundEligibility = await evaluateTelegramOrderRefundEligibility(order);
        if (!refundEligibility.eligible) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: refundEligibility.reason || 'This order is not eligible for refund.',
          });
        }

        const currency = (order.priceCurrency || 'MMK').trim().toUpperCase();
        await db.$transaction([
          db.telegramOrder.update({
            where: { id: order.id },
            data: {
              financeStatus: 'REFUNDED',
              financeNote: note,
              financeUpdatedAt: new Date(),
              financeUpdatedByUserId: ctx.user.id,
              refundRequestStatus: 'APPROVED',
              refundRequestMessage: note,
              refundRequestCustomerMessage: customerMessage,
              refundReviewReasonCode: reasonPresetCode,
              refundRequestReviewedAt: new Date(),
              refundRequestReviewedByUserId: ctx.user.id,
              refundRequestReviewerEmail: ctx.user.email || null,
              refundAssignedReviewerUserId: null,
              refundAssignedReviewerEmail: null,
              refundAssignedAt: null,
            },
          }),
          db.telegramOrderFinanceAction.create({
            data: {
              orderId: order.id,
              actionType: 'REFUND',
              amount: order.priceAmount ?? null,
              currency,
              note,
              createdByUserId: ctx.user.id,
            },
          }),
        ]);
      } else {
        await db.telegramOrder.update({
          where: { id: order.id },
          data: {
            refundRequestStatus: 'REJECTED',
            refundRequestMessage: note,
            refundRequestCustomerMessage: customerMessage,
            refundReviewReasonCode: reasonPresetCode,
            refundRequestReviewedAt: new Date(),
            refundRequestReviewedByUserId: ctx.user.id,
            refundRequestReviewerEmail: ctx.user.email || null,
            refundAssignedReviewerUserId: null,
            refundAssignedReviewerEmail: null,
            refundAssignedAt: null,
          },
        });
      }

      await writeAuditLog({
        userId: ctx.user.id,
        ip: ctx.clientIp,
        action:
          input.action === 'APPROVE'
            ? 'TELEGRAM_ORDER_REFUND_REQUEST_APPROVE'
            : 'TELEGRAM_ORDER_REFUND_REQUEST_REJECT',
        entity: 'TELEGRAM_ORDER',
        entityId: order.id,
        details: {
          orderCode: order.orderCode,
          reasonPresetCode,
          note,
          customerMessage,
        },
      });

      await sendTelegramRefundDecisionMessage({
        chatId: order.telegramChatId || order.telegramUserId,
        orderCode: order.orderCode,
        approved: input.action === 'APPROVE',
        customerMessage,
        amount: order.priceAmount,
        currency: order.priceCurrency,
        locale: order.locale,
      });

      return {
        success: true,
        status: input.action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
      };
    }),

  createClient: adminProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().min(6),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!hasUserManageScope(ctx.user.adminScope)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only owner-level admins can create users.',
        });
      }
      const existingUser = await db.user.findUnique({
        where: { email: input.email },
      });

      if (existingUser) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'User with this email already exists',
        });
      }

      const passwordHash = await hashPassword(input.password);

      const user = await db.user.create({
        data: {
          email: input.email,
          passwordHash,
          role: 'CLIENT',
        },
        select: {
          id: true,
          email: true,
          role: true,
        },
      });

      await writeAuditLog({
        userId: ctx.user.id,
        ip: ctx.clientIp,
        action: 'USER_CREATE',
        entity: 'USER',
        entityId: user.id,
        details: {
          email: user.email,
          role: user.role,
        },
      });

      return user;
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!hasUserManageScope(ctx.user.adminScope)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only owner-level admins can delete users.',
        });
      }
      if (input.id === ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Cannot delete your own account',
        });
      }

      await db.user.delete({
        where: { id: input.id },
      });

      await writeAuditLog({
        userId: ctx.user.id,
        ip: ctx.clientIp,
        action: 'USER_DELETE',
        entity: 'USER',
        entityId: input.id,
        details: {
          deletedUserId: input.id,
        },
      });

      return { success: true };
    }),

  resetPassword: adminProcedure
    .input(
      z.object({
        id: z.string(),
        newPassword: z.string().min(6),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!hasUserManageScope(ctx.user.adminScope)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only owner-level admins can reset passwords.',
        });
      }
      const passwordHash = await hashPassword(input.newPassword);

      await db.user.update({
        where: { id: input.id },
        data: { passwordHash },
      });

      await db.session.deleteMany({
        where: { userId: input.id },
      });

      await writeAuditLog({
        userId: ctx.user.id,
        ip: ctx.clientIp,
        action: 'USER_PASSWORD_RESET',
        entity: 'USER',
        entityId: input.id,
        details: {
          resetUserId: input.id,
        },
      });

      return { success: true };
    }),
});
