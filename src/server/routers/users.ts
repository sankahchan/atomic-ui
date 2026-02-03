
import { z } from 'zod';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { hashPassword } from '@/lib/auth';
import { db } from '@/lib/db';

export const usersRouter = router({
    // List all users (Admin only)
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

    // Create a new Client user (Admin only)
    createClient: adminProcedure
        .input(
            z.object({
                email: z.string().email(),
                password: z.string().min(6),
            })
        )
        .mutation(async ({ input }) => {
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
                    role: 'CLIENT', // Force role to CLIENT
                },
                select: {
                    id: true,
                    email: true,
                    role: true,
                },
            });

            return user;
        }),

    // Delete a user (Admin only)
    delete: adminProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            // Prevent deleting self
            if (input.id === ctx.user.id) {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message: 'Cannot delete your own account',
                });
            }

            await db.user.delete({
                where: { id: input.id },
            });

            return { success: true };
        }),

    // Reset password (Admin only)
    resetPassword: adminProcedure
        .input(
            z.object({
                id: z.string(),
                newPassword: z.string().min(6),
            })
        )
        .mutation(async ({ input }) => {
            const passwordHash = await hashPassword(input.newPassword);

            await db.user.update({
                where: { id: input.id },
                data: { passwordHash },
            });

            // Invalidate sessions for the user
            await db.session.deleteMany({
                where: { userId: input.id },
            });

            return { success: true };
        }),
});
