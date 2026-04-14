import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRouteScope } from '@/lib/admin-route-guard';
import { hasRestoreManageScope } from '@/lib/admin-scope';
import { getRequestIpFromHeaders, writeAuditLog } from '@/lib/audit';
import { isSqliteDatabaseUrl } from '@/lib/database-engine';

export async function POST(req: NextRequest) {
  try {
    const { user, response } = await requireAdminRouteScope({
      canAccess: hasRestoreManageScope,
      forbiddenMessage: 'Only owner-scoped admins can restore backups.',
    });
    if (response || !user) {
      return response!;
    }

    const restoreCommand = 'npm run restore:sqlite -- --backup /absolute/path/to/backup.zip';
    const errorMessage = isSqliteDatabaseUrl()
      ? `Backup restore is disabled from the running web app. Stop the service first, then run: ${restoreCommand}`
      : 'Backup restore is disabled from the running web app for Postgres environments. Use pg_restore or a controlled cutover/restore workflow instead.';

    await writeAuditLog({
      userId: user.id,
      ip: getRequestIpFromHeaders(req.headers),
      action: 'BACKUP_RESTORE_BLOCKED',
      entity: 'BACKUP',
      details: {
        databaseEngine: isSqliteDatabaseUrl() ? 'sqlite' : 'postgres',
        restoreCommand: isSqliteDatabaseUrl() ? restoreCommand : null,
      },
    });

    return NextResponse.json({ error: errorMessage }, { status: 409 });
  } catch (error) {
    console.error('Restore error:', error);
    return NextResponse.json({ error: 'Restore failed: ' + (error as Error).message }, { status: 500 });
  }
}
