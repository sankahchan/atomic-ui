/**
 * Cover Image API for Access Keys
 *
 * PUT: Set cover image (URL, gradient, or uploaded file reference)
 * DELETE: Remove cover image
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: keyId } = await params;
    const body = await request.json();
    const { coverImageType, coverImage } = body;

    if (!coverImageType || !coverImage) {
      return NextResponse.json(
        { error: 'coverImageType and coverImage are required' },
        { status: 400 }
      );
    }

    if (!['upload', 'unsplash', 'gradient', 'url'].includes(coverImageType)) {
      return NextResponse.json(
        { error: 'Invalid coverImageType' },
        { status: 400 }
      );
    }

    const key = await db.accessKey.findUnique({
      where: { id: keyId },
      select: { id: true, coverImage: true, coverImageType: true },
    });

    if (!key) {
      return NextResponse.json({ error: 'Access key not found' }, { status: 404 });
    }

    // Delete old uploaded file if switching from upload to another type
    if (key.coverImageType === 'upload' && key.coverImage && coverImageType !== 'upload') {
      const oldPath = path.join(process.cwd(), 'public', key.coverImage);
      if (existsSync(oldPath)) {
        try {
          await unlink(oldPath);
        } catch (e) {
          console.warn('Failed to delete old cover:', e);
        }
      }
    }

    await db.accessKey.update({
      where: { id: keyId },
      data: {
        coverImageType,
        coverImage,
      },
    });

    return NextResponse.json({
      success: true,
      coverImageType,
      coverImage,
    });
  } catch (error) {
    console.error('Update cover failed:', error);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: keyId } = await params;

    const key = await db.accessKey.findUnique({
      where: { id: keyId },
      select: { id: true, coverImage: true, coverImageType: true },
    });

    if (!key) {
      return NextResponse.json({ error: 'Access key not found' }, { status: 404 });
    }

    // Delete uploaded file if exists
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

    await db.accessKey.update({
      where: { id: keyId },
      data: {
        coverImageType: null,
        coverImage: null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete cover failed:', error);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }
}
