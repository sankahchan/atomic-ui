import { NextRequest, NextResponse } from 'next/server';
import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';

// Helper to save uploaded file to temp path
async function saveFile(file: File): Promise<string> {
    const tempDir = path.join(process.cwd(), 'tmp');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }
    const tempPath = path.join(tempDir, `upload-${Date.now()}.zip`);
    const stream = file.stream() as unknown as ReadableStream;
    // Convert web stream to node stream
    // @ts-ignore
    const nodeStream = Readable.fromWeb(stream);
    await pipeline(nodeStream, createWriteStream(tempPath));
    return tempPath;
}

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get('backup') as File;

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        // Convert Web File to buffer (easier for adm-zip)
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const zip = new AdmZip(buffer);
        const zipEntries = zip.getEntries();

        let dbFound = false;
        let envFound = false;

        // Validate zip contents
        zipEntries.forEach((entry) => {
            if (entry.entryName === 'atomic-ui.db') dbFound = true;
            if (entry.entryName === '.env') envFound = true;
        });

        if (!dbFound) {
            return NextResponse.json({ error: 'Invalid backup: atomic-ui.db not found in zip' }, { status: 400 });
        }

        // Define target paths
        const dbPath = path.join(process.cwd(), 'prisma', 'data', 'atomic-ui.db');
        const envPath = path.join(process.cwd(), '.env');

        // Create backup of current state before restoring (just in case)
        if (fs.existsSync(dbPath)) fs.copyFileSync(dbPath, `${dbPath}.bak`);
        if (fs.existsSync(envPath)) fs.copyFileSync(envPath, `${envPath}.bak`);

        // Extract files
        if (dbFound) {
            zip.extractEntryTo('atomic-ui.db', path.dirname(dbPath), false, true);
        }

        if (envFound) {
            // Overwrite .env
            zip.extractEntryTo('.env', process.cwd(), false, true);
        }

        return NextResponse.json({ success: true, message: 'Restore complete. Please restart the service.' });

    } catch (error) {
        console.error('Restore error:', error);
        return NextResponse.json({ error: 'Restore failed: ' + (error as Error).message }, { status: 500 });
    }
}
