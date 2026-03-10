import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, adminProcedure } from '../trpc';
import {
  acknowledgeIncident,
  addIncidentNote,
  assignIncident,
  getIncidentCenterOverview,
  getIncidentDetail,
  incidentSeveritySchemaValues,
  listIncidentAssignees,
  resolveIncident,
  updateIncidentSeverity,
} from '@/lib/services/incidents';
import { writeAuditLog } from '@/lib/audit';

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

  assignees: adminProcedure.query(async () => listIncidentAssignees()),

  detail: adminProcedure
    .input(
      z.object({
        incidentId: z.string(),
        lookbackDays: z.number().int().min(1).max(90).default(30),
      }),
    )
    .query(async ({ input }) => {
      const detail = await getIncidentDetail(input.incidentId, input.lookbackDays);
      if (!detail) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Incident not found',
        });
      }
      return detail;
    }),

  acknowledge: adminProcedure
    .input(
      z.object({
        incidentId: z.string(),
        note: z.string().trim().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const incident = await acknowledgeIncident({
        incidentId: input.incidentId,
        note: input.note,
        userId: ctx.user.id,
        userEmail: ctx.user.email,
      });

      await writeAuditLog({
        userId: ctx.user.id,
        ip: ctx.clientIp,
        action: 'INCIDENT_ACKNOWLEDGE',
        entity: 'INCIDENT',
        entityId: incident.id,
        details: {
          status: incident.status,
          note: input.note ?? null,
        },
      });

      return { success: true };
    }),

  assign: adminProcedure
    .input(
      z.object({
        incidentId: z.string(),
        assigneeUserId: z.string().nullable().optional(),
        note: z.string().trim().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const incident = await assignIncident({
        incidentId: input.incidentId,
        assigneeUserId: input.assigneeUserId,
        note: input.note,
        actorUserId: ctx.user.id,
        actorEmail: ctx.user.email,
      });

      await writeAuditLog({
        userId: ctx.user.id,
        ip: ctx.clientIp,
        action: 'INCIDENT_ASSIGN',
        entity: 'INCIDENT',
        entityId: incident.id,
        details: {
          assigneeUserId: input.assigneeUserId ?? null,
          assigneeEmail: incident.assignedUserEmail,
          note: input.note ?? null,
        },
      });

      return { success: true };
    }),

  addNote: adminProcedure
    .input(
      z.object({
        incidentId: z.string(),
        note: z.string().trim().min(1).max(2000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const incident = await addIncidentNote({
        incidentId: input.incidentId,
        note: input.note,
        userId: ctx.user.id,
        userEmail: ctx.user.email,
      });

      await writeAuditLog({
        userId: ctx.user.id,
        ip: ctx.clientIp,
        action: 'INCIDENT_NOTE',
        entity: 'INCIDENT',
        entityId: incident.id,
        details: {
          note: input.note,
        },
      });

      return { success: true };
    }),

  resolve: adminProcedure
    .input(
      z.object({
        incidentId: z.string(),
        note: z.string().trim().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const incident = await resolveIncident({
        incidentId: input.incidentId,
        note: input.note,
        userId: ctx.user.id,
        userEmail: ctx.user.email,
      });

      await writeAuditLog({
        userId: ctx.user.id,
        ip: ctx.clientIp,
        action: 'INCIDENT_RESOLVE',
        entity: 'INCIDENT',
        entityId: incident.id,
        details: {
          note: input.note ?? null,
        },
      });

      return { success: true };
    }),

  updateSeverity: adminProcedure
    .input(
      z.object({
        incidentId: z.string(),
        severity: z.enum(incidentSeveritySchemaValues),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const incident = await updateIncidentSeverity({
        incidentId: input.incidentId,
        severity: input.severity,
        userId: ctx.user.id,
        userEmail: ctx.user.email,
      });

      await writeAuditLog({
        userId: ctx.user.id,
        ip: ctx.clientIp,
        action: 'INCIDENT_SEVERITY_UPDATE',
        entity: 'INCIDENT',
        entityId: incident.id,
        details: {
          severity: input.severity,
        },
      });

      return { success: true };
    }),
});
