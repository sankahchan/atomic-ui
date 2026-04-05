import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { hasTelegramReviewManageScope } from '@/lib/admin-scope';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { getTelegramConfig } from '@/lib/services/telegram-runtime';

const TELEGRAM_SUPPORT_MEDIA_TIMEOUT_MS = 15_000;
const TELEGRAM_SUPPORT_MEDIA_MAX_BYTES = 20 * 1024 * 1024;

function inferContentType(filePath?: string | null, fallback?: string | null) {
  if (fallback) {
    return fallback;
  }

  const ext = path.extname(filePath || '').toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.pdf':
      return 'application/pdf';
    default:
      return 'application/octet-stream';
  }
}

function sanitizeDownloadFilename(filename: string) {
  const normalized = path.basename(filename);
  const safe = normalized
    .replace(/[\r\n"]/g, '_')
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/[\\/;]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return safe || 'telegram-support-attachment.bin';
}

function parseContentLength(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

async function fetchWithTimeout(input: string, init?: RequestInit) {
  return fetch(input, {
    ...init,
    cache: 'no-store',
    signal: AbortSignal.timeout(TELEGRAM_SUPPORT_MEDIA_TIMEOUT_MS),
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ threadId: string; replyId: string }> },
) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasTelegramReviewManageScope(user.adminScope)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { threadId, replyId } = await context.params;
  try {
    const reply = await db.telegramSupportReply.findFirst({
      where: {
        id: replyId,
        threadId,
      },
      select: {
        id: true,
        message: true,
        mediaKind: true,
        mediaTelegramFileId: true,
        mediaFilename: true,
        mediaContentType: true,
        thread: {
          select: {
            threadCode: true,
          },
        },
      },
    });

    if (!reply?.mediaTelegramFileId) {
      return NextResponse.json({ error: 'Support attachment not found' }, { status: 404 });
    }

    const config = await getTelegramConfig();
    if (!config?.botToken) {
      return NextResponse.json({ error: 'Telegram bot is not configured' }, { status: 503 });
    }

    const fileInfoResponse = await fetchWithTimeout(
      `https://api.telegram.org/bot${config.botToken}/getFile`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_id: reply.mediaTelegramFileId }),
      },
    );

    if (!fileInfoResponse.ok) {
      return NextResponse.json({ error: 'Failed to resolve support attachment' }, { status: 502 });
    }

    const fileInfoPayload = (await fileInfoResponse.json()) as {
      ok?: boolean;
      result?: { file_path?: string | null; file_size?: number | null };
    };

    const filePath = fileInfoPayload.result?.file_path?.trim();
    const fileSize = fileInfoPayload.result?.file_size ?? null;
    if (!fileInfoPayload.ok || !filePath) {
      return NextResponse.json({ error: 'Support attachment is unavailable' }, { status: 404 });
    }
    if (typeof fileSize === 'number' && fileSize > TELEGRAM_SUPPORT_MEDIA_MAX_BYTES) {
      return NextResponse.json({ error: 'Support attachment is too large to preview' }, { status: 413 });
    }

    const telegramFileResponse = await fetchWithTimeout(
      `https://api.telegram.org/file/bot${config.botToken}/${filePath}`,
    );

    if (!telegramFileResponse.ok) {
      return NextResponse.json({ error: 'Failed to download support attachment' }, { status: 502 });
    }

    const upstreamContentLength = parseContentLength(telegramFileResponse.headers.get('content-length'));
    if (upstreamContentLength && upstreamContentLength > TELEGRAM_SUPPORT_MEDIA_MAX_BYTES) {
      return NextResponse.json({ error: 'Support attachment is too large to preview' }, { status: 413 });
    }
    if (!telegramFileResponse.body) {
      return NextResponse.json({ error: 'Support attachment stream is unavailable' }, { status: 502 });
    }

    const contentType = inferContentType(
      filePath,
      reply.mediaContentType || telegramFileResponse.headers.get('content-type'),
    );
    const download = request.nextUrl.searchParams.get('download') === '1';
    const fallbackExt =
      reply.mediaKind === 'IMAGE'
        ? '.jpg'
        : reply.mediaKind === 'FILE'
          ? path.extname(filePath) || '.bin'
          : '';
    const filename = sanitizeDownloadFilename(
      reply.mediaFilename?.trim()
      || `telegram-support-${reply.thread.threadCode}-reply${fallbackExt}`,
    );

    return new NextResponse(telegramFileResponse.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        ...(upstreamContentLength ? { 'Content-Length': String(upstreamContentLength) } : {}),
        'Cache-Control': 'private, no-store',
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'TimeoutError';
    console.error('[telegram-support-media] failed to proxy attachment', {
      threadId,
      replyId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      {
        error: isTimeout
          ? 'Timed out while loading support attachment'
          : 'Failed to load support attachment',
      },
      { status: isTimeout ? 504 : 502 },
    );
  }
}
