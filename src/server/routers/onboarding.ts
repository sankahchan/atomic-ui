import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, adminProcedure } from '../trpc';
import {
  applyOnboardingImport,
  createOnboardingServer,
  getOnboardingReadiness,
  previewOnboardingImport,
  runOnboardingPostInstallChecks,
} from '@/lib/services/onboarding';
import { writeAuditLog } from '@/lib/audit';

export const onboardingRouter = router({
  status: adminProcedure.query(async () => getOnboardingReadiness()),

  postInstallChecks: adminProcedure.query(async () => runOnboardingPostInstallChecks()),

  createFirstServer: adminProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(100),
        configText: z.string().trim().optional().nullable(),
        apiUrl: z.string().trim().optional().nullable(),
        apiCertSha256: z.string().trim().optional().nullable(),
        location: z.string().trim().max(100).optional().nullable(),
        countryCode: z.string().trim().length(2).optional().nullable(),
        isDefault: z.boolean().default(true),
        enableHealthCheck: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const server = await createOnboardingServer(input);

        await writeAuditLog({
          userId: ctx.user.id,
          ip: ctx.clientIp,
          action: 'ONBOARDING_SERVER_CREATE',
          entity: 'SERVER',
          entityId: server.id,
          details: {
            name: server.name,
            countryCode: server.countryCode,
            onboarding: true,
          },
        });

        return server;
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error instanceof Error ? error.message : 'Failed to create server',
        });
      }
    }),

  previewImport: adminProcedure
    .input(
      z.object({
        content: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        return await previewOnboardingImport(input.content);
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error instanceof Error ? error.message : 'Failed to preview import',
        });
      }
    }),

  applyImport: adminProcedure
    .input(
      z.object({
        content: z.string().min(1),
        defaultPassword: z.string().trim().min(6).max(128).optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await applyOnboardingImport(input);

        await writeAuditLog({
          userId: ctx.user.id,
          ip: ctx.clientIp,
          action: 'ONBOARDING_IMPORT_APPLY',
          entity: 'USER',
          details: {
            usersCreated: result.usersCreated,
            keysUpdated: result.keysUpdated,
            warningCount: result.warnings.length,
            errorCount: result.errors.length,
          },
        });

        return result;
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error instanceof Error ? error.message : 'Failed to apply import',
        });
      }
    }),
});
