import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { hashPassword } from '@/lib/auth';
import { ADMIN_SCOPE_VALUES, isOwnerLikeAdmin, normalizeAdminScope } from '@/lib/admin-scope';
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
import { adminProcedure, router } from '../trpc';

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
          telegramChatId: true,
          createdAt: true,
          accessKeys: {
            select: {
              id: true,
              name: true,
              status: true,
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

      const financeControls = await getFinanceControls();

      const accessKeyIds = user.accessKeys.map((key) => key.id);
      const dynamicKeyIds = user.dynamicAccessKeys.map((key) => key.id);

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

      const [serverChangeRequests, premiumSupportRequests] =
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
        ]);

      const revenueByCurrency = new Map<string, number>();
      const refundedByCurrency = new Map<string, number>();
      let refundEligibleCount = 0;

      const orders = await Promise.all(telegramOrders.map(async (order) => {
        const refundEligibility = await evaluateTelegramOrderRefundEligibility(order);

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
        };
      }));

      return {
        user,
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
        telegramOrders: orders,
        serverChangeRequests,
        premiumSupportRequests,
        financePermissions: {
          canManage: canUserManageFinance(ctx.user, financeControls),
          canConfigure: canUserConfigureFinance(ctx.user, financeControls),
        },
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
      const where = assignmentWhere
        ? {
            AND: [statusWhere, assignmentWhere],
          }
        : statusWhere;
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
