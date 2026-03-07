import type { Prisma } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { router, adminProcedure } from '../trpc';
import { db } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit';
import {
  auditAlertRuleSchema,
  getAuditAlertRules,
  testAuditAlertRule,
  upsertAuditAlertRule,
  upsertAuditAlertRuleSchema,
  deleteAuditAlertRule,
} from '@/lib/services/audit-alerts';
import {
  MAX_AUDIT_LOG_RETENTION_DAYS,
  cleanupOldAuditLogs,
  getAuditLogRetentionStatus,
  setAuditLogRetentionDays,
} from '@/lib/services/audit-log';

const auditLogFiltersSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  action: z.string().optional(),
  entity: z.string().optional(),
  userId: z.string().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

const listAuditLogsSchema = auditLogFiltersSchema.refine(
  (input) => !input.dateFrom || !input.dateTo || input.dateFrom <= input.dateTo,
  {
    message: 'dateFrom must be before or equal to dateTo',
    path: ['dateTo'],
  },
);

const exportAuditLogsSchema = auditLogFiltersSchema
  .omit({
    page: true,
    pageSize: true,
  })
  .refine(
    (input) => !input.dateFrom || !input.dateTo || input.dateFrom <= input.dateTo,
    {
      message: 'dateFrom must be before or equal to dateTo',
      path: ['dateTo'],
    },
  );

function buildAuditLogWhere(
  input?: z.infer<typeof listAuditLogsSchema> | z.infer<typeof exportAuditLogsSchema>,
): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {};

  if (input?.action) {
    where.action = input.action;
  }

  if (input?.entity) {
    where.entity = input.entity;
  }

  if (input?.userId) {
    where.userId = input.userId;
  }

  if (input?.dateFrom || input?.dateTo) {
    where.createdAt = {
      ...(input.dateFrom ? { gte: input.dateFrom } : {}),
      ...(input.dateTo ? { lte: input.dateTo } : {}),
    };
  }

  return where;
}

function parseDetails(details: string | null) {
  if (!details) return null;

  try {
    return JSON.parse(details) as Record<string, unknown>;
  } catch {
    return { raw: details };
  }
}

function stringifyDetailsForCsv(details: string | null) {
  if (!details) return '';

  try {
    return JSON.stringify(JSON.parse(details));
  } catch {
    return details;
  }
}

function escapeCsvValue(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

async function getUserEmailById(userIds: string[]) {
  if (userIds.length === 0) {
    return new Map<string, string>();
  }

  const users = await db.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      email: true,
    },
  });

  return new Map(users.map((user) => [user.id, user.email]));
}

export const auditRouter = router({
  retentionStatus: adminProcedure.query(async () => getAuditLogRetentionStatus()),
  listAlertRules: adminProcedure.query(async () => getAuditAlertRules()),
  list: adminProcedure
    .input(listAuditLogsSchema.optional())
    .query(async ({ input }) => {
      const page = input?.page ?? 1;
      const pageSize = input?.pageSize ?? 20;

      const where = buildAuditLogWhere(input);

      const [logs, total] = await Promise.all([
        db.auditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        db.auditLog.count({ where }),
      ]);

      const userIds = Array.from(
        new Set(logs.map((log) => log.userId).filter((userId): userId is string => Boolean(userId))),
      );
      const userEmailById = await getUserEmailById(userIds);

      return {
        items: logs.map((log) => ({
          ...log,
          details: parseDetails(log.details),
          userEmail: log.userId ? (userEmailById.get(log.userId) ?? null) : null,
        })),
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };
    }),
  exportCsv: adminProcedure
    .input(exportAuditLogsSchema.optional())
    .query(async ({ input }) => {
      const where = buildAuditLogWhere(input);
      const logs = await db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });

      const userIds = Array.from(
        new Set(logs.map((log) => log.userId).filter((userId): userId is string => Boolean(userId))),
      );
      const userEmailById = await getUserEmailById(userIds);

      const headers = [
        'Timestamp',
        'Action',
        'Entity',
        'Entity ID',
        'Actor',
        'Actor Email',
        'Actor User ID',
        'IP',
        'Details',
      ];

      const rows = logs.map((log) => {
        const userEmail = log.userId ? (userEmailById.get(log.userId) ?? '') : '';
        const actor = userEmail || log.userId || 'System';

        return [
          log.createdAt.toISOString(),
          log.action,
          log.entity,
          log.entityId ?? '',
          actor,
          userEmail,
          log.userId ?? '',
          log.ip ?? '',
          stringifyDetailsForCsv(log.details),
        ].map((value) => escapeCsvValue(value));
      });

      const csv = [
        headers.map((header) => escapeCsvValue(header)).join(','),
        ...rows.map((row) => row.join(',')),
      ].join('\n');

      return {
        data: csv,
        filename: `audit-log-export-${new Date().toISOString().split('T')[0]}.csv`,
      };
    }),
  updateRetention: adminProcedure
    .input(
      z.object({
        retentionDays: z.number().int().min(0).max(MAX_AUDIT_LOG_RETENTION_DAYS),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const retentionDays = await setAuditLogRetentionDays({
        retentionDays: input.retentionDays,
        userId: ctx.user.id,
        ip: ctx.clientIp,
      });

      return {
        retentionDays,
        cleanupEnabled: retentionDays > 0,
      };
    }),
  upsertAlertRule: adminProcedure
    .input(upsertAuditAlertRuleSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await upsertAuditAlertRule(input);

      await writeAuditLog({
        userId: ctx.user.id,
        ip: ctx.clientIp,
        action: result.created ? 'AUDIT_ALERT_RULE_CREATE' : 'AUDIT_ALERT_RULE_UPDATE',
        entity: 'AUDIT_LOG',
        entityId: result.rule.id,
        details: {
          ruleName: result.rule.name,
          isActive: result.rule.isActive,
          actions: result.rule.actions,
          entities: result.rule.entities,
          actorIds: result.rule.actorIds,
          keywords: result.rule.keywords,
          throttleMinutes: result.rule.throttleMinutes,
          matchWindowMinutes: result.rule.matchWindowMinutes,
          minMatches: result.rule.minMatches,
          previousRule: result.previousRule,
        },
      });

      return result.rule;
    }),
  deleteAlertRule: adminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const deletedRule = await deleteAuditAlertRule(input.id);

      if (!deletedRule) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Audit alert rule not found',
        });
      }

      await writeAuditLog({
        userId: ctx.user.id,
        ip: ctx.clientIp,
        action: 'AUDIT_ALERT_RULE_DELETE',
        entity: 'AUDIT_LOG',
        entityId: deletedRule.id,
        details: {
          rule: deletedRule,
        },
      });

      return { success: true };
    }),
  testAlertRule: adminProcedure
    .input(z.object({ id: auditAlertRuleSchema.shape.id }))
    .mutation(async ({ input }) => {
      const result = await testAuditAlertRule(input.id);

      if (result.recipients === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No audit alert recipients are configured. Add Telegram admin chat IDs or webhook channels first.',
        });
      }

      return result;
    }),
  cleanupOld: adminProcedure.mutation(async ({ ctx }) => {
    return cleanupOldAuditLogs({
      userId: ctx.user.id,
      ip: ctx.clientIp,
      triggeredBy: 'admin',
    });
  }),
});
