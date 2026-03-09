import { z } from 'zod';
import { router, adminProcedure } from '../trpc';
import {
  getIncidentCenterOverview,
  getIncidentServerDetail,
} from '@/lib/services/incidents';

export const incidentsRouter = router({
  overview: adminProcedure
    .input(
      z
        .object({
          lookbackDays: z.number().int().min(1).max(90).default(14),
        })
        .optional(),
    )
    .query(async ({ input }) => getIncidentCenterOverview(input?.lookbackDays ?? 14)),

  detail: adminProcedure
    .input(
      z.object({
        serverId: z.string(),
        lookbackDays: z.number().int().min(1).max(90).default(30),
      }),
    )
    .query(async ({ input }) => getIncidentServerDetail(input.serverId, input.lookbackDays)),
});
