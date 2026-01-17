/**
 * Cover Image Upload API
 *
 * POST: Upload a cover image for subscription pages
 * Stores files in /public/uploads/covers/
 */

import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';

// Max file size: 5MB
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export async function POST(request: NextRequest) {
  try {
    // Verify admin session
    const user = await getCurrentUser();
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const keyId = formData.get('keyId') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!keyId) {
      return NextResponse.json({ error: 'No keyId provided' }, { status: 400 });
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed: JPEG, PNG, WebP, GIF' },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size: 5MB' },
        { status: 400 }
      );
    }

    // Check if key exists
    const key = await db.accessKey.findUnique({
      where: { id: keyId },
      select: { id: true, coverImage: true, coverImageType: true },
    });

    if (!key) {
      return NextResponse.json({ error: 'Access key not found' }, { status: 404 });
    }

    // Create upload directory if it doesn't exist
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'covers');
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    // Delete old uploaded cover if exists
    if (key.coverImageType === 'upload' && key.coverImage) {
      const oldPath = path.join(process.cwd(), 'public', key.coverImage);
      if (existsSync(oldPath)) {
        try {
          await unlink(oldPath);
        } catch (e) {
          console.warn('Failed to delete old cover:', e);
        }
      }
    }

    // Generate unique filename
    const ext = file.name.split('.').pop() || 'jpg';
    const filename = `${keyId}-${Date.now()}.${ext}`;
    const filepath = path.join(uploadDir, filename);
    const publicPath = `/uploads/covers/${filename}`;

    // Write file
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filepath, buffer);

    // Update database
    await db.accessKey.update({
      where: { id: keyId },
      data: {
        coverImageType: 'upload',
        coverImage: publicPath,
      },
    });

    return NextResponse.json({
      success: true,
      coverImage: publicPath,
      coverImageType: 'upload',
    });
  } catch (error) {
    console.error('Upload failed:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Verify admin session
    const user = await getCurrentUser();
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const keyId = searchParams.get('keyId');

    if (!keyId) {
      return NextResponse.json({ error: 'No keyId provided' }, { status: 400 });
    }

    const key = await db.accessKey.findUnique({
      where: { id: keyId },
      select: { id: true, coverImage: true, coverImageType: true },
    });

    if (!key) {
      return NextResponse.json({ error: 'Access key not found' }, { status: 404 });
    }

    // Delete file if it's an upload
    if (key.coverImageType === 'upload' && key.coverImage) {
      const filepath = path.join(process.cwd(), 'public', key.coverImage);
      if (existsSync(filepath)) {
        try {
          await unlink(filepath);
        } catch (e) {
          console.warn('Failed to delete cover file:', e);
        }
      }
    }

    // Clear database fields
    await db.accessKey.update({
      where: { id: keyId },
      data: {
        coverImageType: null,
        coverImage: null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete failed:', error);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }
}
