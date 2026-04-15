import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRouteScope } from '@/lib/admin-route-guard';
import { hasRestoreManageScope } from '@/lib/admin-scope';
import { getRequestIpFromHeaders, writeAuditLog } from '@/lib/audit';
import { isSqliteDatabaseUrl } from '@/lib/database-engine';
import { buildOfflineRestoreCommand } from '@/lib/backup-files';
import { isMultipartFormDataContentType } from '@/lib/services/restore-upload';

export async function POST(req: NextRequest) {
  try {
    const { user, response } = await requireAdminRouteScope({
      canAccess: hasRestoreManageScope,
      forbiddenMessage: 'Only owner-scoped admins can restore backups.',
    });
    if (response || !user) {
      return response!;
    }

    if (!isMultipartFormDataContentType(req.headers.get('content-type'))) {
      return NextResponse.json(
        { error: 'Backup restore expects a multipart/form-data upload.' },
        { status: 415 },
      );
    }

    const restoreCommand = buildOfflineRestoreCommand('backup.db', '/absolute/path/to/backup.db');
    const postgresRestoreCommand = buildOfflineRestoreCommand('backup.dump', '/absolute/path/to/backup.dump');
    const errorMessage = isSqliteDatabaseUrl()
      ? `Backup restore is disabled from the running web app. Stop the service first, then run: ${restoreCommand}`
      : `Backup restore is disabled from the running web app for Postgres environments. Stop the service first, then run: ${postgresRestoreCommand}`;

    await writeAuditLog({
      userId: user.id,
      ip: getRequestIpFromHeaders(req.headers),
      action: 'BACKUP_RESTORE_BLOCKED',
      entity: 'BACKUP',
      details: {
        databaseEngine: isSqliteDatabaseUrl() ? 'sqlite' : 'postgres',
        restoreCommand: isSqliteDatabaseUrl() ? restoreCommand : postgresRestoreCommand,
      },
    });

    return NextResponse.json({ error: errorMessage }, { status: 409 });
  } catch (error) {
    console.error('Restore error:', error);
    return NextResponse.json({ error: 'Restore failed: ' + (error as Error).message }, { status: 500 });
  }
}
