import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { writeAuditLog } from '@/lib/audit';

export const AUDIT_LOG_RETENTION_KEY = 'audit_log_retention_days';
export const DEFAULT_AUDIT_LOG_RETENTION_DAYS = 180;
export const MAX_AUDIT_LOG_RETENTION_DAYS = 3650;

interface AuditLogActorContext {
  userId?: string | null;
  ip?: string | null;
}

interface CleanupAuditLogsOptions extends AuditLogActorContext {
  retentionDays?: number;
  triggeredBy?: 'admin' | 'scheduler';
}

function normalizeAuditLogRetentionDays(value: unknown): number {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_AUDIT_LOG_RETENTION_DAYS) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed >= 0 && parsed <= MAX_AUDIT_LOG_RETENTION_DAYS) {
      return parsed;
    }
  }

  return DEFAULT_AUDIT_LOG_RETENTION_DAYS;
}

function getCutoffDate(retentionDays: number): Date | null {
  if (retentionDays === 0) {
    return null;
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  return cutoffDate;
}

export async function getAuditLogRetentionDays(): Promise<number> {
  const setting = await db.settings.findUnique({
    where: { key: AUDIT_LOG_RETENTION_KEY },
    select: { value: true },
  });

  if (!setting) {
    return DEFAULT_AUDIT_LOG_RETENTION_DAYS;
  }

  try {
    return normalizeAuditLogRetentionDays(JSON.parse(setting.value));
  } catch {
    return normalizeAuditLogRetentionDays(setting.value);
  }
}

export async function setAuditLogRetentionDays({
  retentionDays,
  userId,
  ip,
}: AuditLogActorContext & {
  retentionDays: number;
}): Promise<number> {
  const normalizedRetentionDays = normalizeAuditLogRetentionDays(retentionDays);

  await db.settings.upsert({
    where: { key: AUDIT_LOG_RETENTION_KEY },
    create: {
      key: AUDIT_LOG_RETENTION_KEY,
      value: JSON.stringify(normalizedRetentionDays),
    },
    update: {
      value: JSON.stringify(normalizedRetentionDays),
    },
  });

  await writeAuditLog({
    userId,
    ip,
    action: 'AUDIT_LOG_RETENTION_UPDATE',
    entity: 'AUDIT_LOG',
    details: {
      retentionDays: normalizedRetentionDays,
      cleanupEnabled: normalizedRetentionDays > 0,
    },
  });

  return normalizedRetentionDays;
}

export async function getAuditLogRetentionStatus() {
  const retentionDays = await getAuditLogRetentionDays();
  const cutoffDate = getCutoffDate(retentionDays);

  const [totalEntries, oldestEntry, deletableEntries] = await Promise.all([
    db.auditLog.count(),
    db.auditLog.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
    cutoffDate
      ? db.auditLog.count({
          where: {
            createdAt: { lt: cutoffDate },
          },
        })
      : Promise.resolve(0),
  ]);

  return {
    retentionDays,
    cleanupEnabled: retentionDays > 0,
    cutoffDate,
    totalEntries,
    deletableEntries,
    oldestEntryAt: oldestEntry?.createdAt ?? null,
  };
}

export async function cleanupOldAuditLogs({
  retentionDays,
  userId,
  ip,
  triggeredBy = 'scheduler',
}: CleanupAuditLogsOptions = {}) {
  const resolvedRetentionDays =
    retentionDays !== undefined
      ? normalizeAuditLogRetentionDays(retentionDays)
      : await getAuditLogRetentionDays();
  const cutoffDate = getCutoffDate(resolvedRetentionDays);

  if (!cutoffDate) {
    return {
      retentionDays: resolvedRetentionDays,
      cleanupEnabled: false,
      cutoffDate: null,
      deletedCount: 0,
    };
  }

  const result = await db.auditLog.deleteMany({
    where: {
      createdAt: { lt: cutoffDate },
    },
  });

  if (result.count > 0) {
    logger.info(`Cleaned up ${result.count} audit log entries older than ${resolvedRetentionDays} days`);
    await writeAuditLog({
      userId,
      ip,
      action: 'AUDIT_LOG_CLEANUP',
      entity: 'AUDIT_LOG',
      details: {
        retentionDays: resolvedRetentionDays,
        deletedCount: result.count,
        cutoffDate: cutoffDate.toISOString(),
        triggeredBy,
      },
    });
  }

  return {
    retentionDays: resolvedRetentionDays,
    cleanupEnabled: true,
    cutoffDate,
    deletedCount: result.count,
  };
}
