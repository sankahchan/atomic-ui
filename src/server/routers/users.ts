import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { hashPassword } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import { db } from '@/lib/db';
import { adminProcedure, protectedProcedure, router } from '../trpc';

const REFUND_USAGE_LIMIT_BYTES = BigInt(5 * 1024 * 1024 * 1024);

function resolveOrderLinkedUsageBytes(input: {
  order: {
    approvedAccessKeyId?: string | null;
    targetAccessKeyId?: string | null;
    approvedDynamicKeyId?: string | null;
    targetDynamicKeyId?: string | null;
  };
  accessKeyUsageById: Map<string, bigint>;
  dynamicKeyUsageById: Map<string, bigint>;
}) {
  const accessKeyId = input.order.approvedAccessKeyId || input.order.targetAccessKeyId;
  if (accessKeyId && input.accessKeyUsageById.has(accessKeyId)) {
    return input.accessKeyUsageById.get(accessKeyId) || BigInt(0);
  }

  const dynamicKeyId = input.order.approvedDynamicKeyId || input.order.targetDynamicKeyId;
  if (dynamicKeyId && input.dynamicKeyUsageById.has(dynamicKeyId)) {
    return input.dynamicKeyUsageById.get(dynamicKeyId) || BigInt(0);
  }

  return BigInt(0);
}

function evaluateRefundEligibility(input: {
  order: {
    status: string;
    financeStatus: string;
    priceAmount?: number | null;
    telegramUserId: string;
  };
  fulfilledPaidPurchaseCount: number;
  usedBytes: bigint;
}) {
  if (input.order.status !== 'FULFILLED') {
    return {
      eligible: false,
      reason: 'Only fulfilled orders can be refunded.',
    };
  }

  if (!input.order.priceAmount || input.order.priceAmount <= 0) {
    return {
      eligible: false,
      reason: 'Only paid orders can be refunded.',
    };
  }

  if (input.order.financeStatus === 'REFUNDED') {
    return {
      eligible: false,
      reason: 'This order was already refunded.',
    };
  }

  if (input.fulfilledPaidPurchaseCount <= 3) {
    return {
      eligible: false,
      reason: 'Refunds are only available after more than 3 paid purchases.',
    };
  }

  if (input.usedBytes > REFUND_USAGE_LIMIT_BYTES) {
    return {
      eligible: false,
      reason: 'Refunds close automatically once usage goes above 5 GB.',
    };
  }

  return {
    eligible: true,
    reason: null,
  };
}

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
    .query(async ({ input }) => {
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

      const orderAccessKeyIds = Array.from(
        new Set(
          telegramOrders
            .flatMap((order) => [order.approvedAccessKeyId, order.targetAccessKeyId])
            .filter((value): value is string => Boolean(value)),
        ),
      );
      const orderDynamicKeyIds = Array.from(
        new Set(
          telegramOrders
            .flatMap((order) => [order.approvedDynamicKeyId, order.targetDynamicKeyId])
            .filter((value): value is string => Boolean(value)),
        ),
      );

      const [relatedAccessKeys, relatedDynamicKeys, serverChangeRequests, premiumSupportRequests] =
        await Promise.all([
          orderAccessKeyIds.length > 0
            ? db.accessKey.findMany({
                where: { id: { in: orderAccessKeyIds } },
                select: {
                  id: true,
                  usedBytes: true,
                },
              })
            : Promise.resolve([]),
          orderDynamicKeyIds.length > 0
            ? db.dynamicAccessKey.findMany({
                where: { id: { in: orderDynamicKeyIds } },
                select: {
                  id: true,
                  usedBytes: true,
                },
              })
            : Promise.resolve([]),
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

      const accessKeyUsageById = new Map(relatedAccessKeys.map((key) => [key.id, key.usedBytes]));
      const dynamicKeyUsageById = new Map(relatedDynamicKeys.map((key) => [key.id, key.usedBytes]));

      const fulfilledCounts = await db.telegramOrder.groupBy({
        by: ['telegramUserId'],
        where: {
          telegramUserId: {
            in: Array.from(
              new Set(
                telegramOrders
                  .map((order) => order.telegramUserId)
                  .filter((value): value is string => value.trim().length > 0),
              ),
            ),
          },
          status: 'FULFILLED',
          priceAmount: { gt: 0 },
        },
        _count: {
          _all: true,
        },
      });

      const fulfilledPurchaseCountByTelegramUserId = new Map(
        fulfilledCounts.map((entry) => [entry.telegramUserId, entry._count._all]),
      );

      const revenueByCurrency = new Map<string, number>();
      const refundedByCurrency = new Map<string, number>();
      let refundEligibleCount = 0;

      const orders = telegramOrders.map((order) => {
        const usedBytes = resolveOrderLinkedUsageBytes({
          order,
          accessKeyUsageById,
          dynamicKeyUsageById,
        });
        const fulfilledPaidPurchaseCount =
          fulfilledPurchaseCountByTelegramUserId.get(order.telegramUserId) || 0;
        const refundEligibility = evaluateRefundEligibility({
          order,
          fulfilledPaidPurchaseCount,
          usedBytes,
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
          usedBytes: usedBytes.toString(),
          fulfilledPaidPurchaseCount,
          refundEligible: refundEligibility.eligible,
          refundBlockedReason: refundEligibility.reason,
        };
      });

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
      };
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
          approvedAccessKeyId: true,
          targetAccessKeyId: true,
          approvedDynamicKeyId: true,
          targetDynamicKeyId: true,
        },
      });

      if (!order) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Telegram order not found',
        });
      }

      const [accessKey, dynamicKey, fulfilledPurchaseCount] = await Promise.all([
        order.approvedAccessKeyId || order.targetAccessKeyId
          ? db.accessKey.findUnique({
              where: { id: order.approvedAccessKeyId || order.targetAccessKeyId || '' },
              select: { usedBytes: true },
            })
          : Promise.resolve(null),
        order.approvedDynamicKeyId || order.targetDynamicKeyId
          ? db.dynamicAccessKey.findUnique({
              where: { id: order.approvedDynamicKeyId || order.targetDynamicKeyId || '' },
              select: { usedBytes: true },
            })
          : Promise.resolve(null),
        db.telegramOrder.count({
          where: {
            telegramUserId: order.telegramUserId,
            status: 'FULFILLED',
            priceAmount: { gt: 0 },
          },
        }),
      ]);

      const usedBytes = accessKey?.usedBytes || dynamicKey?.usedBytes || BigInt(0);
      if (input.action === 'REFUND') {
        const refundEligibility = evaluateRefundEligibility({
          order,
          fulfilledPaidPurchaseCount: fulfilledPurchaseCount,
          usedBytes,
        });

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

      return {
        success: true,
        financeStatus,
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
