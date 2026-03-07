import { db } from './db';
import { processAuditAlertForLog } from './services/audit-alerts';

interface WriteAuditLogInput {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  details?: Record<string, unknown> | null;
  ip?: string | null;
}

export function getRequestIpFromHeaders(headers: Headers): string | null {
  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() || null;
  }

  return headers.get('x-real-ip');
}

export async function writeAuditLog(input: WriteAuditLogInput): Promise<void> {
  try {
    const log = await db.auditLog.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        details: input.details ? JSON.stringify(input.details) : null,
        ip: input.ip ?? null,
      },
    });

    void processAuditAlertForLog(log).catch((error) => {
      console.error('Failed to process audit alert:', error);
    });
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
}
