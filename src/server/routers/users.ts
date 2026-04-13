import { z } from 'zod';
import { type Prisma } from '@prisma/client';
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
  getPromoEligibilityOverride,
  parsePromoEligibilityOverrides,
  serializePromoEligibilityOverrides,
  setPromoEligibilityOverride,
  type PromoCampaignType,
  type PromoEligibilityOverrideMode,
} from '@/lib/promo-overrides';
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
import { buildTelegramAnnouncementMessage } from '@/lib/services/telegram-announcements';
import {
  getTelegramConfig,
  getTelegramSupportLink,
  sendTelegramDocument,
  sendTelegramPhotoUrl,
  sendServerIssueNoticeToTelegram,
  sendTelegramMessage,
} from '@/lib/services/telegram-runtime';
import {
  getTelegramSalesSettings,
  type TelegramSalesSettings,
} from '@/lib/services/telegram-sales';
import {
  findTelegramSupportThreadByIdForAdmin,
  resolveTelegramSupportIssueLabel,
} from '@/lib/services/telegram-support';
import {
  assignTelegramSupportThreadToAdmin,
  buildTelegramSupportMacroMessage,
  claimTelegramSupportThreadAsAdmin,
  escalateTelegramSupportThreadToPanel,
  handleTelegramSupportThreadAsAdmin,
  replyTelegramSupportThreadAsAdmin,
  unclaimTelegramSupportThreadAsAdmin,
} from '@/lib/services/telegram-support-admin';
import {
  listSupportReplyTemplates,
  resolveSupportReplyTemplateById,
  type SupportReplyTemplateStatusAction,
} from '@/lib/services/telegram-support-templates';
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

const supportIssueCategorySchema = z.enum(['ORDER', 'KEY', 'SERVER', 'BILLING', 'GENERAL']);
const supportReplyTemplateStatusSchema = z.enum(['WORKING', 'NEED_DETAILS', 'ESCALATE', 'HANDLED']);

async function listAssignableSupportAdmins() {
  const admins = await db.user.findMany({
    where: {
      role: 'ADMIN',
    },
    select: {
      id: true,
      email: true,
      adminScope: true,
      telegramChatId: true,
    },
    orderBy: [{ adminScope: 'asc' }, { email: 'asc' }],
  });

  return admins
    .filter((admin) => hasTelegramReviewManageScope(admin.adminScope))
    .map((admin) => ({
      id: admin.id,
      email: admin.email,
      adminScope: normalizeAdminScope(admin.adminScope),
      telegramChatId: admin.telegramChatId,
    }));
}

const CRM_PROMO_SUPPORT_NOTE_KINDS = new Set(['INTERNAL', 'DIRECT_MESSAGE', 'OUTAGE_UPDATE']);

type CustomerCouponEligibility = {
  campaignType: PromoCampaignType;
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
    | 'MANUAL_BLOCK'
    | null;
  eligibleNow: boolean;
  overrideMode: PromoEligibilityOverrideMode | null;
  overrideNote: string | null;
  overrideUpdatedAt: Date | null;
  overrideUpdatedByEmail: string | null;
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
  overrides: ReturnType<typeof parsePromoEligibilityOverrides>;
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
    const manualOverride = getPromoEligibilityOverride(input.overrides, campaign.campaignType);
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
    } else if (manualOverride?.mode === 'FORCE_BLOCK') {
      blockedReason = 'MANUAL_BLOCK';
    } else if (activeCoupons.length > 0) {
      blockedReason = 'ACTIVE_COUPON';
    } else if (manualOverride?.mode === 'FORCE_ALLOW') {
      blockedReason = null;
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

    const overrideUpdatedAt = manualOverride?.updatedAt
      ? new Date(manualOverride.updatedAt)
      : null;

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
      overrideMode: manualOverride?.mode || null,
      overrideNote: manualOverride?.note || null,
      overrideUpdatedAt:
        overrideUpdatedAt && !Number.isNaN(overrideUpdatedAt.getTime())
          ? overrideUpdatedAt
          : null,
      overrideUpdatedByEmail: manualOverride?.updatedByEmail || null,
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
          promoEligibilityOverrides: true,
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
      const promoEligibilityOverrides = parsePromoEligibilityOverrides(user.promoEligibilityOverrides);

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
      const supportThreadWhere: Prisma.TelegramSupportThreadWhereInput[] = [{ userId: user.id }];
      if (telegramIdentifiers.length > 0) {
        supportThreadWhere.push(
          { telegramChatId: { in: telegramIdentifiers } },
          { telegramUserId: { in: telegramIdentifiers } },
        );
      }
      const supportThreads =
        telegramIdentifiers.length > 0 || Boolean(user.id)
          ? await db.telegramSupportThread.findMany({
              where: {
                OR: supportThreadWhere,
              },
              include: {
                replies: {
                  orderBy: [{ createdAt: 'desc' }],
                  take: 6,
                },
              },
              orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
              take: 24,
            })
          : [];
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
      type SupportThreadItem = (typeof supportThreads)[number];

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
          overrides: promoEligibilityOverrides,
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
          telegramMessageTitle: note.telegramMessageTitle,
          telegramCardStyle: note.telegramCardStyle,
          telegramMediaKind: note.telegramMediaKind,
          telegramMediaUrl: note.telegramMediaUrl,
          createdAt: note.createdAt,
          updatedAt: note.updatedAt,
          createdBy: note.createdBy,
        })),
        supportThreads: supportThreads.map((thread: SupportThreadItem) => ({
          id: thread.id,
          threadCode: thread.threadCode,
          status: thread.status,
          waitingOn: thread.waitingOn,
          issueCategory: thread.issueCategory,
          locale: thread.locale,
          subject: thread.subject,
          relatedOrderCode: thread.relatedOrderCode,
          relatedKeyName: thread.relatedKeyName,
          relatedKeyType: thread.relatedKeyType,
          relatedServerName: thread.relatedServerName,
          firstResponseDueAt: thread.firstResponseDueAt,
          firstAdminReplyAt: thread.firstAdminReplyAt,
          lastCustomerReplyAt: thread.lastCustomerReplyAt,
          lastAdminReplyAt: thread.lastAdminReplyAt,
          handledAt: thread.handledAt,
          escalatedAt: thread.escalatedAt,
          escalatedReason: thread.escalatedReason,
          assignedAdminUserId: thread.assignedAdminUserId,
          assignedAdminName: thread.assignedAdminName,
          createdAt: thread.createdAt,
          updatedAt: thread.updatedAt,
          replies: thread.replies
            .slice()
            .reverse()
            .map((reply) => ({
              id: reply.id,
              senderType: reply.senderType,
              senderName: reply.senderName,
              message: reply.message,
              mediaKind: reply.mediaKind,
              mediaUrl: reply.mediaUrl,
              createdAt: reply.createdAt,
            })),
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
          canManagePromoOverrides: hasTelegramAnnouncementManageScope(ctx.user.adminScope),
          canResendAnnouncements: hasTelegramAnnouncementManageScope(ctx.user.adminScope),
        },
      };
    }),

  getSupportThreadDetail: adminProcedure
    .input(
      z.object({
        threadId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (!hasTelegramReviewManageScope(ctx.user.adminScope)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to view support threads.',
        });
      }

      const thread = await db.telegramSupportThread.findUnique({
        where: { id: input.threadId },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              telegramChatId: true,
            },
          },
          replies: {
            orderBy: [{ createdAt: 'asc' }],
          },
        },
      });

      if (!thread) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Support thread not found.',
        });
      }

      const assignableAdmins = await listAssignableSupportAdmins();

      return {
        thread: {
          id: thread.id,
          threadCode: thread.threadCode,
          status: thread.status,
          waitingOn: thread.waitingOn,
          issueCategory: thread.issueCategory,
          issueLabel: resolveTelegramSupportIssueLabel(thread.issueCategory, coerceSupportedLocale(thread.locale) || 'en'),
          locale: coerceSupportedLocale(thread.locale) || 'en',
          telegramChatId: thread.telegramChatId,
          telegramUserId: thread.telegramUserId,
          telegramUsername: thread.telegramUsername,
          userId: thread.userId,
          subject: thread.subject,
          relatedOrderCode: thread.relatedOrderCode,
          relatedKeyName: thread.relatedKeyName,
          relatedKeyType: thread.relatedKeyType,
          relatedServerName: thread.relatedServerName,
          firstResponseDueAt: thread.firstResponseDueAt,
          firstAdminReplyAt: thread.firstAdminReplyAt,
          lastCustomerReplyAt: thread.lastCustomerReplyAt,
          lastAdminReplyAt: thread.lastAdminReplyAt,
          handledAt: thread.handledAt,
          escalatedAt: thread.escalatedAt,
          escalatedReason: thread.escalatedReason,
          assignedAdminUserId: thread.assignedAdminUserId,
          assignedAdminName: thread.assignedAdminName,
          createdAt: thread.createdAt,
          updatedAt: thread.updatedAt,
          isOverdue:
            !thread.firstAdminReplyAt
            && Boolean(thread.firstResponseDueAt)
            && (thread.firstResponseDueAt?.getTime() || 0) <= Date.now(),
          customer: thread.user
            ? {
                id: thread.user.id,
                email: thread.user.email,
                telegramChatId: thread.user.telegramChatId,
              }
            : null,
          replies: thread.replies.map((reply) => ({
            id: reply.id,
            senderType: reply.senderType,
            telegramUserId: reply.telegramUserId,
            telegramUsername: reply.telegramUsername,
            adminUserId: reply.adminUserId,
            senderName: reply.senderName,
            message: reply.message,
            mediaKind: reply.mediaKind,
            mediaUrl: reply.mediaUrl,
            mediaFilename: reply.mediaFilename,
            mediaContentType: reply.mediaContentType,
            createdAt: reply.createdAt,
          })),
        },
        assignableAdmins,
        permissions: {
          canManage: hasTelegramReviewManageScope(ctx.user.adminScope),
          canAssign: hasTelegramReviewManageScope(ctx.user.adminScope),
          canReply: hasTelegramReviewManageScope(ctx.user.adminScope),
        },
      };
    }),

  listSupportThreads: adminProcedure
    .input(
      z.object({
        status: z.enum(['ALL', 'ACTIVE', 'WAITING_ADMIN', 'WAITING_USER', 'ESCALATED', 'HANDLED', 'OVERDUE']).optional(),
        assignment: z.enum(['ALL', 'UNASSIGNED', 'MINE', 'ASSIGNED']).optional(),
        issueCategory: z.enum(['ALL', 'ORDER', 'KEY', 'SERVER', 'BILLING', 'GENERAL']).optional(),
        query: z.string().trim().max(100).optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (!hasTelegramReviewManageScope(ctx.user.adminScope)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to view support threads.',
        });
      }

      const now = new Date();
      const statusFilter = input.status || 'ACTIVE';
      const assignmentFilter = input.assignment || 'ALL';
      const issueCategoryFilter = input.issueCategory || 'ALL';
      const limit = input.limit ?? 40;
      const query = input.query?.trim();

      const where: Prisma.TelegramSupportThreadWhereInput = {};

      if (statusFilter === 'ACTIVE') {
        where.status = { in: ['OPEN', 'ESCALATED'] };
      } else if (statusFilter === 'WAITING_ADMIN') {
        where.status = { in: ['OPEN', 'ESCALATED'] };
        where.waitingOn = 'ADMIN';
      } else if (statusFilter === 'WAITING_USER') {
        where.status = { in: ['OPEN', 'ESCALATED'] };
        where.waitingOn = 'USER';
      } else if (statusFilter === 'ESCALATED') {
        where.status = 'ESCALATED';
      } else if (statusFilter === 'HANDLED') {
        where.status = 'HANDLED';
      } else if (statusFilter === 'OVERDUE') {
        where.status = { in: ['OPEN', 'ESCALATED'] };
        where.firstAdminReplyAt = null;
        where.firstResponseDueAt = { lte: now };
      }

      if (assignmentFilter === 'UNASSIGNED') {
        where.assignedAdminUserId = null;
      } else if (assignmentFilter === 'MINE') {
        where.assignedAdminUserId = ctx.user.id;
      } else if (assignmentFilter === 'ASSIGNED') {
        where.assignedAdminUserId = { not: null };
      }

      if (issueCategoryFilter !== 'ALL') {
        where.issueCategory = issueCategoryFilter;
      }

      if (query) {
        where.OR = [
          { threadCode: { contains: query } },
          { subject: { contains: query } },
          { telegramUsername: { contains: query } },
          { relatedOrderCode: { contains: query } },
          { relatedKeyName: { contains: query } },
          { relatedServerName: { contains: query } },
          { user: { is: { email: { contains: query } } } },
        ];
      }

      const [threads, activeSummaryRows] =
        await Promise.all([
          db.telegramSupportThread.findMany({
            where,
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  telegramChatId: true,
                },
              },
              replies: {
                orderBy: [{ createdAt: 'desc' }],
                take: 1,
              },
            },
            orderBy: [{ updatedAt: 'asc' }, { createdAt: 'asc' }],
            take: limit,
          }),
          db.telegramSupportThread.findMany({
            where: {
              status: { in: ['OPEN', 'ESCALATED'] },
            },
            select: {
              status: true,
              waitingOn: true,
              firstAdminReplyAt: true,
              firstResponseDueAt: true,
              assignedAdminUserId: true,
            },
          }),
        ]);

      const summary = activeSummaryRows.reduce(
        (acc, thread) => {
          acc.open += 1;
          if (thread.waitingOn === 'USER') {
            acc.waitingUser += 1;
          } else {
            acc.waitingAdmin += 1;
          }
          if (!thread.firstAdminReplyAt && thread.firstResponseDueAt && thread.firstResponseDueAt <= now) {
            acc.overdue += 1;
          }
          if (!thread.assignedAdminUserId) {
            acc.unassigned += 1;
          }
          if (thread.assignedAdminUserId === ctx.user.id) {
            acc.mine += 1;
          }
          if (thread.status === 'ESCALATED') {
            acc.escalated += 1;
          }
          return acc;
        },
        {
          open: 0,
          waitingAdmin: 0,
          waitingUser: 0,
          overdue: 0,
          unassigned: 0,
          mine: 0,
          escalated: 0,
        },
      );

      return {
        summary,
        threads: threads.map((thread) => {
          const latestReply = thread.replies[0] || null;
          return {
            id: thread.id,
            threadCode: thread.threadCode,
            status: thread.status,
            waitingOn: thread.waitingOn,
            issueCategory: thread.issueCategory,
            issueLabel: resolveTelegramSupportIssueLabel(thread.issueCategory, coerceSupportedLocale(thread.locale) || 'en'),
            locale: coerceSupportedLocale(thread.locale) || 'en',
            telegramUsername: thread.telegramUsername,
            userId: thread.userId,
            subject: thread.subject,
            relatedOrderCode: thread.relatedOrderCode,
            relatedKeyName: thread.relatedKeyName,
            relatedServerName: thread.relatedServerName,
            firstResponseDueAt: thread.firstResponseDueAt,
            firstAdminReplyAt: thread.firstAdminReplyAt,
            lastCustomerReplyAt: thread.lastCustomerReplyAt,
            lastAdminReplyAt: thread.lastAdminReplyAt,
            handledAt: thread.handledAt,
            escalatedAt: thread.escalatedAt,
            escalatedReason: thread.escalatedReason,
            assignedAdminUserId: thread.assignedAdminUserId,
            assignedAdminName: thread.assignedAdminName,
            createdAt: thread.createdAt,
            updatedAt: thread.updatedAt,
            isOverdue:
              !thread.firstAdminReplyAt
              && Boolean(thread.firstResponseDueAt)
              && (thread.firstResponseDueAt?.getTime() || 0) <= Date.now(),
            customer: thread.user
              ? {
                  id: thread.user.id,
                  email: thread.user.email,
                  telegramChatId: thread.user.telegramChatId,
                }
              : null,
            latestReply: latestReply
              ? {
                  id: latestReply.id,
                  senderType: latestReply.senderType,
                  senderName: latestReply.senderName,
                  message: latestReply.message,
                  mediaKind: latestReply.mediaKind,
                  mediaUrl: latestReply.mediaUrl,
                  mediaFilename: latestReply.mediaFilename,
                  createdAt: latestReply.createdAt,
                }
              : null,
          };
        }),
      };
    }),

  supportThreadAnalytics: adminProcedure
    .input(
      z.object({
        days: z.number().int().min(1).max(365).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (!hasTelegramReviewManageScope(ctx.user.adminScope)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to view support analytics.',
        });
      }

      const days = input.days ?? 30;
      const now = new Date();
      const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      const rows = await db.telegramSupportThread.findMany({
        where: {
          createdAt: {
            gte: since,
          },
        },
        select: {
          id: true,
          status: true,
          waitingOn: true,
          issueCategory: true,
          assignedAdminUserId: true,
          assignedAdminName: true,
          createdAt: true,
          firstResponseDueAt: true,
          firstAdminReplyAt: true,
          handledAt: true,
        },
      });

      type AnalyticsBucket = {
        key: string;
        label: string;
        total: number;
        open: number;
        handled: number;
        overdue: number;
        firstResponseTotalMinutes: number;
        firstResponseCount: number;
        handledTotalMinutes: number;
        handledCount: number;
      };

      const createBucket = (key: string, label: string): AnalyticsBucket => ({
        key,
        label,
        total: 0,
        open: 0,
        handled: 0,
        overdue: 0,
        firstResponseTotalMinutes: 0,
        firstResponseCount: 0,
        handledTotalMinutes: 0,
        handledCount: 0,
      });

      const byAdmin = new Map<string, AnalyticsBucket>();
      const byCategory = new Map<string, AnalyticsBucket>();
      let total = 0;
      let open = 0;
      let handled = 0;
      let overdue = 0;
      let firstResponseTotalMinutes = 0;
      let firstResponseCount = 0;
      let handledTotalMinutes = 0;
      let handledCount = 0;

      for (const row of rows) {
        total += 1;
        if (row.status === 'HANDLED') {
          handled += 1;
        } else {
          open += 1;
        }

        const adminKey = row.assignedAdminUserId || 'unassigned';
        const adminLabel = row.assignedAdminName || 'Unassigned';
        const adminBucket = byAdmin.get(adminKey) || createBucket(adminKey, adminLabel);
        const categoryKey = row.issueCategory || 'GENERAL';
        const categoryLabel = resolveTelegramSupportIssueLabel(
          row.issueCategory || 'GENERAL',
          'en',
        );
        const categoryBucket = byCategory.get(categoryKey) || createBucket(categoryKey, categoryLabel);

        adminBucket.total += 1;
        categoryBucket.total += 1;

        if (row.status === 'HANDLED') {
          adminBucket.handled += 1;
          categoryBucket.handled += 1;
        } else {
          adminBucket.open += 1;
          categoryBucket.open += 1;
        }

        const firstResponseMinutes = row.firstAdminReplyAt
          ? Math.max(0, Math.round((row.firstAdminReplyAt.getTime() - row.createdAt.getTime()) / 60000))
          : null;
        if (firstResponseMinutes != null) {
          firstResponseTotalMinutes += firstResponseMinutes;
          firstResponseCount += 1;
          adminBucket.firstResponseTotalMinutes += firstResponseMinutes;
          adminBucket.firstResponseCount += 1;
          categoryBucket.firstResponseTotalMinutes += firstResponseMinutes;
          categoryBucket.firstResponseCount += 1;
        }

        const handledMinutes = row.handledAt
          ? Math.max(0, Math.round((row.handledAt.getTime() - row.createdAt.getTime()) / 60000))
          : null;
        if (handledMinutes != null) {
          handledTotalMinutes += handledMinutes;
          handledCount += 1;
          adminBucket.handledTotalMinutes += handledMinutes;
          adminBucket.handledCount += 1;
          categoryBucket.handledTotalMinutes += handledMinutes;
          categoryBucket.handledCount += 1;
        }

        const isOverdue = Boolean(
          row.firstResponseDueAt
          && (
            (!row.firstAdminReplyAt && row.firstResponseDueAt <= now)
            || (row.firstAdminReplyAt && row.firstAdminReplyAt > row.firstResponseDueAt)
          ),
        );
        if (isOverdue) {
          overdue += 1;
          adminBucket.overdue += 1;
          categoryBucket.overdue += 1;
        }

        byAdmin.set(adminKey, adminBucket);
        byCategory.set(categoryKey, categoryBucket);
      }

      const serializeBucket = (bucket: AnalyticsBucket) => ({
        key: bucket.key,
        label: bucket.label,
        total: bucket.total,
        open: bucket.open,
        handled: bucket.handled,
        overdue: bucket.overdue,
        overdueRate: bucket.total > 0 ? Math.round((bucket.overdue / bucket.total) * 100) : 0,
        firstResponseMinutes:
          bucket.firstResponseCount > 0
            ? Math.round(bucket.firstResponseTotalMinutes / bucket.firstResponseCount)
            : null,
        handledMinutes:
          bucket.handledCount > 0
            ? Math.round(bucket.handledTotalMinutes / bucket.handledCount)
            : null,
      });

      return {
        timeframeDays: days,
        summary: {
          total,
          open,
          handled,
          overdue,
          overdueRate: total > 0 ? Math.round((overdue / total) * 100) : 0,
          firstResponseMinutes:
            firstResponseCount > 0 ? Math.round(firstResponseTotalMinutes / firstResponseCount) : null,
          handledMinutes:
            handledCount > 0 ? Math.round(handledTotalMinutes / handledCount) : null,
        },
        byAdmin: Array.from(byAdmin.values())
          .map(serializeBucket)
          .sort((left, right) => right.total - left.total || left.label.localeCompare(right.label)),
        byCategory: Array.from(byCategory.values())
          .map(serializeBucket)
          .sort((left, right) => right.total - left.total || left.label.localeCompare(right.label)),
      };
    }),

  listSupportReplyTemplates: adminProcedure
    .input(
      z.object({
        category: supportIssueCategorySchema.optional(),
        locale: z.enum(['en', 'my']).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (!hasTelegramReviewManageScope(ctx.user.adminScope)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to view support reply templates.',
        });
      }

      return listSupportReplyTemplates({
        category: input.category,
        locale: input.locale || 'en',
      });
    }),

  saveSupportReplyTemplate: adminProcedure
    .input(
      z.object({
        templateId: z.string().optional(),
        title: z.string().trim().min(2).max(80),
        category: supportIssueCategorySchema,
        locale: z.enum(['en', 'my']).default('en'),
        message: z.string().trim().min(5).max(2000),
        statusAction: supportReplyTemplateStatusSchema.nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!hasTelegramReviewManageScope(ctx.user.adminScope)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to manage support reply templates.',
        });
      }

      if (input.templateId?.startsWith('default:')) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Default templates cannot be edited.',
        });
      }

      if (input.templateId) {
        const existing = await db.supportReplyTemplate.findUnique({
          where: { id: input.templateId },
          select: { id: true },
        });
        if (!existing) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Support reply template not found.',
          });
        }
      }

      const payload = {
        title: input.title,
        category: input.category,
        locale: input.locale,
        message: input.message,
        statusAction: (input.statusAction ?? null) as SupportReplyTemplateStatusAction | null,
        isDefault: false,
        createdByUserId: ctx.user.id,
      };

      return input.templateId
        ? db.supportReplyTemplate.update({
            where: { id: input.templateId },
            data: payload,
          })
        : db.supportReplyTemplate.create({
            data: payload,
          });
    }),

  deleteSupportReplyTemplate: adminProcedure
    .input(
      z.object({
        templateId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!hasTelegramReviewManageScope(ctx.user.adminScope)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to delete support reply templates.',
        });
      }

      if (input.templateId.startsWith('default:')) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Default templates cannot be deleted.',
        });
      }

      await db.supportReplyTemplate.delete({
        where: { id: input.templateId },
      });

      return { deleted: true };
    }),

  applySupportReplyTemplate: adminProcedure
    .input(
      z.object({
        threadId: z.string(),
        templateId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!hasTelegramReviewManageScope(ctx.user.adminScope)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to reply to support threads.',
        });
      }

      const thread = await findTelegramSupportThreadByIdForAdmin({
        threadId: input.threadId,
      });

      if (!thread) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Support thread not found.',
        });
      }

      const template = await resolveSupportReplyTemplateById({
        templateId: input.templateId,
        locale: thread.locale,
      });

      if (!template) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Support reply template not found.',
        });
      }

      if (template.statusAction === 'HANDLED') {
        return handleTelegramSupportThreadAsAdmin({
          threadId: input.threadId,
          adminUserId: ctx.user.id,
          reviewerName: ctx.user.email || null,
          adminNote: `Panel support template: ${template.title}`,
          customerMessage: template.message,
        });
      }

      if (template.statusAction === 'ESCALATE') {
        return escalateTelegramSupportThreadToPanel({
          threadId: input.threadId,
          adminUserId: ctx.user.id,
          reviewerName: ctx.user.email || null,
          escalationReason: `template:${template.title}`,
          customerMessage: template.message,
        });
      }

      return replyTelegramSupportThreadAsAdmin({
        threadId: input.threadId,
        adminUserId: ctx.user.id,
        reviewerName: ctx.user.email || null,
        adminNote: `Panel support template: ${template.title}`,
        customerMessage: template.message,
      });
    }),

  claimSupportThread: adminProcedure
    .input(
      z.object({
        threadId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!hasTelegramReviewManageScope(ctx.user.adminScope)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to claim support threads.',
        });
      }

      return claimTelegramSupportThreadAsAdmin({
        threadId: input.threadId,
        adminUserId: ctx.user.id,
        reviewerName: ctx.user.email || null,
      });
    }),

  unclaimSupportThread: adminProcedure
    .input(
      z.object({
        threadId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!hasTelegramReviewManageScope(ctx.user.adminScope)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to unclaim support threads.',
        });
      }

      return unclaimTelegramSupportThreadAsAdmin({
        threadId: input.threadId,
        adminUserId: ctx.user.id,
        reviewerName: ctx.user.email || null,
        force: isOwnerLikeAdmin(ctx.user.adminScope),
      });
    }),

  assignSupportThread: adminProcedure
    .input(
      z.object({
        threadId: z.string(),
        assignedAdminUserId: z.string().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!hasTelegramReviewManageScope(ctx.user.adminScope)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to assign support threads.',
        });
      }

      let assignedAdminName: string | null = null;
      let assignedAdminUserId: string | null = input.assignedAdminUserId;

      if (input.assignedAdminUserId) {
        const target = await db.user.findUnique({
          where: { id: input.assignedAdminUserId },
          select: {
            id: true,
            email: true,
            role: true,
            adminScope: true,
          },
        });

        if (!target || target.role !== 'ADMIN' || !hasTelegramReviewManageScope(target.adminScope)) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'That admin cannot be assigned to support threads.',
          });
        }

        assignedAdminUserId = target.id;
        assignedAdminName = target.email;
      }

      return assignTelegramSupportThreadToAdmin({
        threadId: input.threadId,
        changedByUserId: ctx.user.id,
        changedByName: ctx.user.email || null,
        assignedAdminUserId,
        assignedAdminName,
      });
    }),

  replyToSupportThread: adminProcedure
    .input(
      z.object({
        threadId: z.string(),
        message: z.string().trim().min(1).max(2000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!hasTelegramReviewManageScope(ctx.user.adminScope)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to reply to support threads.',
        });
      }

      return replyTelegramSupportThreadAsAdmin({
        threadId: input.threadId,
        adminUserId: ctx.user.id,
        reviewerName: ctx.user.email || null,
        adminNote: 'Panel support reply',
        customerMessage: input.message,
      });
    }),

  applySupportThreadMacro: adminProcedure
    .input(
      z.object({
        threadId: z.string(),
        macro: z.enum(['WORKING', 'NEED_DETAILS', 'ESCALATE', 'HANDLED']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!hasTelegramReviewManageScope(ctx.user.adminScope)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to update support threads.',
        });
      }

      const thread = await findTelegramSupportThreadByIdForAdmin({
        threadId: input.threadId,
      });

      if (!thread) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Support thread not found.',
        });
      }

      const locale = coerceSupportedLocale(thread.locale) || 'en';
      const macroMessage = buildTelegramSupportMacroMessage({
        action: input.macro,
        category: thread.issueCategory,
        locale,
      });

      if (input.macro === 'HANDLED') {
        return handleTelegramSupportThreadAsAdmin({
          threadId: input.threadId,
          adminUserId: ctx.user.id,
          reviewerName: ctx.user.email || null,
          adminNote: 'Panel support macro: handled',
          customerMessage: macroMessage,
        });
      }

      if (input.macro === 'ESCALATE') {
        return escalateTelegramSupportThreadToPanel({
          threadId: input.threadId,
          adminUserId: ctx.user.id,
          reviewerName: ctx.user.email || null,
          escalationReason: 'panel_macro',
          customerMessage: macroMessage,
        });
      }

      return replyTelegramSupportThreadAsAdmin({
        threadId: input.threadId,
        adminUserId: ctx.user.id,
        reviewerName: ctx.user.email || null,
        adminNote:
          input.macro === 'WORKING'
            ? 'Panel support macro: working on it'
            : 'Panel support macro: need details',
        customerMessage: macroMessage,
      });
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

  updatePromoEligibilityOverride: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        campaignType: z.enum(['TRIAL_TO_PAID', 'RENEWAL_SOON', 'PREMIUM_UPSELL', 'WINBACK']),
        mode: z.enum(['DEFAULT', 'FORCE_ALLOW', 'FORCE_BLOCK']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!hasTelegramAnnouncementManageScope(ctx.user.adminScope)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to manage promo eligibility overrides.',
        });
      }

      const user = await db.user.findUnique({
        where: { id: input.userId },
        select: {
          id: true,
          promoEligibilityOverrides: true,
        },
      });

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found.',
        });
      }

      const existingOverrides = parsePromoEligibilityOverrides(user.promoEligibilityOverrides);
      const nextOverrides = setPromoEligibilityOverride(
        existingOverrides,
        input.campaignType,
        input.mode === 'DEFAULT'
          ? null
          : {
              mode: input.mode,
              updatedAt: new Date().toISOString(),
              updatedByUserId: ctx.user.id,
              updatedByEmail: ctx.user.email,
            },
      );
      const serializedOverrides = serializePromoEligibilityOverrides(nextOverrides);

      await db.user.update({
        where: { id: input.userId },
        data: {
          promoEligibilityOverrides: serializedOverrides,
        },
      });

      await writeAuditLog({
        userId: ctx.user.id,
        ip: ctx.clientIp,
        action: 'CUSTOMER_PROMO_OVERRIDE_UPDATED',
        entity: 'USER',
        entityId: input.userId,
        details: {
          campaignType: input.campaignType,
          mode: input.mode,
        },
      });

      return {
        overrides: nextOverrides,
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
        title: z.string().trim().max(120).optional().nullable(),
        message: z.string().trim().min(1).max(2000),
        includeSupportButton: z.boolean().default(true),
        cardStyle: z.enum(['DEFAULT', 'PROMO', 'PREMIUM', 'OPERATIONS']).default('DEFAULT'),
        mediaKind: z.enum(['NONE', 'IMAGE', 'FILE']).default('NONE'),
        mediaUrl: z.string().trim().url().max(1000).optional().nullable(),
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
      const replyMarkup = supportLink
        ? {
            inline_keyboard: [[{ text: 'Support', url: supportLink }]],
          }
        : undefined;
      const messageTitle = input.title?.trim() || 'Message from admin';
      const formattedMessage = buildTelegramAnnouncementMessage({
        type: 'ANNOUNCEMENT',
        title: messageTitle,
        message: input.message.trim(),
        cardStyle: input.cardStyle,
      });

      let sent = false;
      const trimmedMediaUrl = input.mediaUrl?.trim() || null;

      if (input.mediaKind === 'IMAGE' && trimmedMediaUrl) {
        sent = await sendTelegramPhotoUrl(
          config.botToken,
          destinationChatId,
          trimmedMediaUrl,
          formattedMessage,
          replyMarkup ? { replyMarkup } : undefined,
        );
      } else if (input.mediaKind === 'FILE' && trimmedMediaUrl) {
        let response: Response;
        try {
          response = await fetch(trimmedMediaUrl);
        } catch {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'The file URL could not be fetched.',
          });
        }

        if (!response.ok) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'The file URL returned an invalid response.',
          });
        }

        const fileBytes = Buffer.from(await response.arrayBuffer());
        const filename =
          trimmedMediaUrl.split('/').pop()?.split('?')[0]?.trim() || 'attachment.bin';
        sent = await sendTelegramDocument(
          config.botToken,
          destinationChatId,
          fileBytes,
          filename,
          formattedMessage,
          replyMarkup ? { replyMarkup } : undefined,
        );
      } else {
        sent = await sendTelegramMessage(
          config.botToken,
          destinationChatId,
          formattedMessage,
          replyMarkup ? { replyMarkup } : undefined,
        );
      }

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
          telegramMessageTitle: messageTitle,
          telegramCardStyle: input.cardStyle,
          telegramMediaKind: input.mediaKind === 'NONE' ? null : input.mediaKind,
          telegramMediaUrl: trimmedMediaUrl,
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
          cardStyle: input.cardStyle,
          mediaKind: input.mediaKind,
          mediaUrl: trimmedMediaUrl,
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
            adminScope: 'OWNER',
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
          previousScope: normalizeAdminScope(target.adminScope) || 'UNASSIGNED',
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
