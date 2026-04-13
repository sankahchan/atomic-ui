import { NextRequest, NextResponse } from 'next/server';
import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';
import { requireAdminRouteScope } from '@/lib/admin-route-guard';
import { hasRestoreManageScope } from '@/lib/admin-scope';
import { resolveSqliteDbPath } from '@/lib/sqlite-path';
import { getRequestIpFromHeaders, writeAuditLog } from '@/lib/audit';
import { parseRestoreUploadFormData } from '@/lib/services/restore-upload';
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

        if (!isSqliteDatabaseUrl()) {
            return NextResponse.json(
                {
                    error: 'Backup restore currently supports SQLite file databases only. Use pg_restore or a controlled Postgres cutover for production Postgres environments.',
                },
                { status: 409 },
            );
        }

        const { formData, error } = await parseRestoreUploadFormData(req);
        if (error) {
            return NextResponse.json({ error: error.error }, { status: error.status });
        }

        const file = formData?.get('backup');

        if (!(file instanceof File)) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        // Convert Web File to buffer (easier for adm-zip)
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const zip = new AdmZip(buffer);
        const zipEntries = zip.getEntries();

        const dbBasename = path.basename(resolveSqliteDbPath());
        let dbFound = false;
        let envFound = false;

        // Validate zip contents
        zipEntries.forEach((entry) => {
            if (entry.entryName === 'atomic-ui.db' || entry.entryName === dbBasename) dbFound = true;
            if (entry.entryName === '.env') envFound = true;
        });

        if (!dbFound) {
            return NextResponse.json({ error: 'Invalid backup: atomic-ui.db not found in zip' }, { status: 400 });
        }

        // Define target paths
        const dbPath = resolveSqliteDbPath();
        const envPath = path.join(process.cwd(), '.env');
        fs.mkdirSync(path.dirname(dbPath), { recursive: true });

        // Create backup of current state before restoring (just in case)
        if (fs.existsSync(dbPath)) fs.copyFileSync(dbPath, `${dbPath}.bak`);
        if (fs.existsSync(envPath)) fs.copyFileSync(envPath, `${envPath}.bak`);

        // Restore database file from archive entry
        const dbEntry = zip.getEntry('atomic-ui.db') || zip.getEntry(dbBasename);
        if (!dbEntry) {
            return NextResponse.json({ error: 'Invalid backup: atomic-ui.db entry is missing' }, { status: 400 });
        }
        fs.writeFileSync(dbPath, dbEntry.getData());

        // Restore environment file if present
        if (envFound) {
            const envEntry = zip.getEntry('.env');
            if (envEntry) {
                fs.writeFileSync(envPath, envEntry.getData());
            }
        }

        await writeAuditLog({
            userId: user.id,
            ip: getRequestIpFromHeaders(req.headers),
            action: 'BACKUP_RESTORE',
            entity: 'BACKUP',
            details: {
                hasEnv: envFound,
                restoredDatabase: dbBasename,
            },
        });

        return NextResponse.json({ success: true, message: 'Restore complete. Please restart the service.' });

    } catch (error) {
        console.error('Restore error:', error);
        return NextResponse.json({ error: 'Restore failed: ' + (error as Error).message }, { status: 500 });
    }
}
