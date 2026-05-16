import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRouteScope } from '@/lib/admin-route-guard';
import { hasBackupManageScope } from '@/lib/admin-scope';
import { getRequestIpFromHeaders, writeAuditLog } from '@/lib/audit';
import { ensureBackupDirectory } from '@/lib/backup-storage';
import { verifyBackupFile } from '@/lib/services/backup-verification';
import {
  INVALID_BACKUP_UPLOAD_MESSAGE,
  streamUploadedBackupFile,
} from '@/lib/services/backup-upload';
import {
  BACKUP_UPLOAD_TOO_LARGE_ERROR,
  isBackupUploadWithinLimit,
  parseRestoreUploadFormData,
} from '@/lib/services/restore-upload';

export async function POST(req: NextRequest) {
  try {
    const { user, response } = await requireAdminRouteScope({
      canAccess: hasBackupManageScope,
      forbiddenMessage: 'Only owner-scoped admins can upload backup archives.',
    });
    if (response || !user) {
      return response!;
    }

    const { formData, error } = await parseRestoreUploadFormData(req);
    if (error || !formData) {
      return NextResponse.json(
        { error: error?.error ?? INVALID_BACKUP_UPLOAD_MESSAGE },
        { status: error?.status ?? 400 },
      );
    }

    const uploadedBackup = formData.get('backup');
    if (!(uploadedBackup instanceof File)) {
      return NextResponse.json(
        { error: INVALID_BACKUP_UPLOAD_MESSAGE },
        { status: 400 },
      );
    }

    if (!isBackupUploadWithinLimit(uploadedBackup.size)) {
      return NextResponse.json(
        { error: BACKUP_UPLOAD_TOO_LARGE_ERROR.error },
        { status: BACKUP_UPLOAD_TOO_LARGE_ERROR.status },
      );
    }

    const result = await streamUploadedBackupFile({
      filename: uploadedBackup.name,
      file: uploadedBackup,
      outputDir: ensureBackupDirectory(),
    });
    const verification = await verifyBackupFile(result.filename, {
      userId: user.id,
      ip: getRequestIpFromHeaders(req.headers),
      triggeredBy: 'upload',
      writeAuditEntry: false,
    });

    await writeAuditLog({
      userId: user.id,
      ip: getRequestIpFromHeaders(req.headers),
      action: 'BACKUP_UPLOAD',
      entity: 'BACKUP',
      entityId: result.filename,
      details: {
        filename: result.filename,
        originalFilename: uploadedBackup.name,
        fileKind: result.fileKind,
        size: uploadedBackup.size,
        verificationStatus: verification.status,
        restoreReady: verification.restoreReady,
        verificationError: verification.error,
      },
    });

    return NextResponse.json({
      success: true,
      filename: result.filename,
      fileKind: result.fileKind,
      verification: {
        id: verification.id,
        status: verification.status,
        restoreReady: verification.restoreReady,
        error: verification.error,
        verifiedAt: verification.verifiedAt,
      },
    });
  } catch (error) {
    console.error('Backup upload error:', error);

    const message = error instanceof Error ? error.message : 'Backup upload failed.';
    const status = message === INVALID_BACKUP_UPLOAD_MESSAGE ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
