import { z } from 'zod';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { db } from '@/lib/db';
import { TRPCError } from '@trpc/server';

export const securityRouter = router({
    /**
     * List all security rules.
     */
    listRules: protectedProcedure.query(async () => {
        return db.securityRule.findMany({
            orderBy: { createdAt: 'desc' },
        });
    }),

    /**
     * Create a new security rule.
     */
    createRule: adminProcedure
        .input(z.object({
            type: z.enum(['ALLOW', 'BLOCK']),
            targetType: z.enum(['IP', 'CIDR', 'COUNTRY']),
            targetValue: z.string().min(1),
            description: z.string().optional(),
        }))
        .mutation(async ({ input }) => {
            // Basic validation
            if (input.targetType === 'IP') {
                const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
                if (!ipRegex.test(input.targetValue)) {
                    throw new TRPCError({
                        code: 'BAD_REQUEST',
                        message: 'Invalid IP address format',
                    });
                }
            }

            if (input.targetType === 'COUNTRY') {
                if (!/^[A-Z]{2}$/.test(input.targetValue)) {
                    throw new TRPCError({
                        code: 'BAD_REQUEST',
                        message: 'Country code must be 2 uppercase letters (ISO 3166-1 alpha-2)',
                    });
                }
            }

            return db.securityRule.create({
                data: {
                    type: input.type,
                    targetType: input.targetType,
                    targetValue: input.targetValue,
                    description: input.description,
                },
            });
        }),

    /**
     * Toggle rule active status.
     */
    toggleRule: adminProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ input }) => {
            const rule = await db.securityRule.findUnique({
                where: { id: input.id },
            });

            if (!rule) {
                throw new TRPCError({ code: 'NOT_FOUND' });
            }

            return db.securityRule.update({
                where: { id: input.id },
                data: { isActive: !rule.isActive },
            });
        }),

    /**
     * Delete a rule.
     */
    deleteRule: adminProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ input }) => {
            return db.securityRule.delete({
                where: { id: input.id },
            });
        }),
});
