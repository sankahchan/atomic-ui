import { z } from 'zod';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { db } from '@/lib/db';
import { TRPCError } from '@trpc/server';

// Helper function to convert GB to bytes
const gbToBytes = (gb: number): bigint => BigInt(Math.floor(gb * 1024 * 1024 * 1024));
const bytesToGb = (bytes: bigint): number | undefined => {
    if (!bytes) return undefined;
    return Number(bytes) / (1024 * 1024 * 1024);
};

const createTemplateSchema = z.object({
    name: z.string().min(1, 'Name is required').max(100),
    description: z.string().max(200).optional(),
    namePrefix: z.string().max(16).optional().nullable(),
    dataLimitGB: z.number().positive().optional().nullable(),
    dataLimitResetStrategy: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'NEVER']).default('NEVER'),
    expirationType: z.enum(['NEVER', 'FIXED_DATE', 'DURATION_FROM_CREATION', 'START_ON_FIRST_USE']).default('NEVER'),
    durationDays: z.number().int().positive().optional().nullable(),
    method: z.string().default('chacha20-ietf-poly1305'),
    notes: z.string().max(500).optional().nullable(),
    serverId: z.string().optional().nullable(),
});

const updateTemplateSchema = createTemplateSchema.extend({
    id: z.string(),
});

export const templatesRouter = router({
    /**
     * List all templates.
     */
    list: protectedProcedure.query(async () => {
        return db.keyTemplate.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                server: {
                    select: {
                        id: true,
                        name: true,
                        countryCode: true,
                    },
                },
            },
        });
    }),

    /**
     * Create a new template.
     */
    create: adminProcedure
        .input(createTemplateSchema)
        .mutation(async ({ input }) => {
            const { dataLimitGB, ...rest } = input;

            return db.keyTemplate.create({
                data: {
                    ...rest,
                    dataLimitBytes: dataLimitGB ? gbToBytes(dataLimitGB) : null,
                },
            });
        }),

    /**
     * Update a template.
     */
    update: adminProcedure
        .input(updateTemplateSchema)
        .mutation(async ({ input }) => {
            const { id, dataLimitGB, ...data } = input;

            return db.keyTemplate.update({
                where: { id },
                data: {
                    ...data,
                    dataLimitBytes: dataLimitGB ? gbToBytes(dataLimitGB) : null,
                },
            });
        }),

    /**
     * Delete a template.
     */
    delete: adminProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ input }) => {
            return db.keyTemplate.delete({
                where: { id: input.id },
            });
        }),

    /**
     * Get a template by ID.
     */
    getById: protectedProcedure
        .input(z.object({ id: z.string() }))
        .query(async ({ input }) => {
            const template = await db.keyTemplate.findUnique({
                where: { id: input.id },
                include: { server: true },
            });

            if (!template) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Template not found',
                });
            }

            return {
                ...template,
                dataLimitGB: template.dataLimitBytes ? bytesToGb(template.dataLimitBytes) : undefined,
            };
        }),
});
