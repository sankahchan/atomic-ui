import { NextRequest, NextResponse } from 'next/server';
import archiver from 'archiver';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { getCurrentUser } from '@/lib/auth';
import { resolveSqliteDbPath } from '@/lib/sqlite-path';

// Helper to convert Node stream to Web stream (for Next.js Response)
function streamToWeb(nodeStream: Readable) {
    return new ReadableStream({
        start(controller) {
            nodeStream.on('data', chunk => controller.enqueue(chunk));
            nodeStream.on('end', () => controller.close());
            nodeStream.on('error', err => controller.error(err));
        },
        cancel() {
            nodeStream.destroy();
        },
    });
}

export async function GET(req: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || user.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Define files to backup
        const dbPath = resolveSqliteDbPath();
        const envPath = path.join(process.cwd(), '.env');

        if (!fs.existsSync(dbPath)) {
            return NextResponse.json({ error: 'Database file not found' }, { status: 404 });
        }

        const archive = archiver('zip', {
            zlib: { level: 9 }, // Sets the compression level.
        });

        // Keep a stable filename for restore compatibility.
        archive.file(dbPath, { name: 'atomic-ui.db' });

        // Add .env
        if (fs.existsSync(envPath)) {
            archive.file(envPath, { name: '.env' });
        }

        archive.on('error', (error) => {
            console.error('Archive error:', error);
        });
        archive.finalize();

        return new NextResponse(streamToWeb(archive), {
            headers: {
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename="atomic-backup-${new Date().toISOString().split('T')[0]}.zip"`,
            },
        });

    } catch (error) {
        console.error('Backup error:', error);
        return NextResponse.json({ error: 'Check server logs' }, { status: 500 });
    }
}
