import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { requireAdminRouteScope } from '@/lib/admin-route-guard';
import { hasBackupManageScope } from '@/lib/admin-scope';
import { getRequestIpFromHeaders, writeAuditLog } from '@/lib/audit';

const BACKUP_DIR = path.join(process.cwd(), 'storage', 'backups');

export async function GET(req: NextRequest) {
    try {
        const { user, response } = await requireAdminRouteScope({
            canAccess: hasBackupManageScope,
            forbiddenMessage: 'Only owner-scoped admins can download backup archives.',
        });
        if (response || !user) {
            return response ?? new NextResponse('Unauthorized', { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const filename = searchParams.get('filename');

        if (!filename) {
            return new NextResponse('Filename is required', { status: 400 });
        }

        // Prevent directory traversal
        const safeFilename = path.basename(filename).replace(/[\r\n"]/g, '_');
        const filePath = path.join(BACKUP_DIR, safeFilename);

        if (!fs.existsSync(filePath)) {
            return new NextResponse('File not found', { status: 404 });
        }

        const fileStream = fs.createReadStream(filePath);
        const stats = fs.statSync(filePath);

        // Create a ReadableStream from the file stream
        const readableStream = new ReadableStream({
            start(controller) {
                fileStream.on('data', (chunk) => controller.enqueue(chunk));
                fileStream.on('end', () => controller.close());
                fileStream.on('error', (err) => controller.error(err));
            },
            cancel() {
                fileStream.destroy();
            },
        });

        await writeAuditLog({
            userId: user.id,
            ip: getRequestIpFromHeaders(req.headers),
            action: 'BACKUP_DOWNLOAD',
            entity: 'BACKUP',
            entityId: safeFilename,
            details: {
                filename: safeFilename,
                size: stats.size,
            },
        });

        return new NextResponse(readableStream, {
            headers: {
                'Content-Type': 'application/octet-stream',
                'Content-Disposition': `attachment; filename="${safeFilename}"`,
                'Content-Length': stats.size.toString(),
            },
        });
    } catch (error) {
        console.error('Download error:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
