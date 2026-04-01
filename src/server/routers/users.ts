import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { hashPassword } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import { db } from '@/lib/db';
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
        },
      });

      if (!order) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Telegram order not found',
        });
      }
      if (input.action === 'REFUND') {
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

      const note = input.note?.trim() || null;
      const customerMessage = input.customerMessage?.trim() || null;

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
              refundRequestReviewedAt: new Date(),
              refundRequestReviewedByUserId: ctx.user.id,
              refundRequestReviewerEmail: ctx.user.email || null,
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
            refundRequestReviewedAt: new Date(),
            refundRequestReviewedByUserId: ctx.user.id,
            refundRequestReviewerEmail: ctx.user.email || null,
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
          note,
          customerMessage,
        },
      });

      await sendTelegramRefundDecisionMessage({
        chatId: order.telegramChatId || order.telegramUserId,
        orderCode: order.orderCode,
        approved: input.action === 'APPROVE',
        customerMessage,
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
