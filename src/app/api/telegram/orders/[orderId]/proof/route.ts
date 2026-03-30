import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { getTelegramConfig } from '@/lib/services/telegram-bot';

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

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ orderId: string }> },
) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { orderId } = await context.params;
  const order = await db.telegramOrder.findUnique({
    where: { id: orderId },
    select: {
      paymentProofFileId: true,
      paymentProofType: true,
      orderCode: true,
    },
  });

  if (!order?.paymentProofFileId) {
    return NextResponse.json({ error: 'Payment proof not found' }, { status: 404 });
  }

  const config = await getTelegramConfig();
  if (!config?.botToken) {
    return NextResponse.json({ error: 'Telegram bot is not configured' }, { status: 503 });
  }

  const fileInfoResponse = await fetch(
    `https://api.telegram.org/bot${config.botToken}/getFile`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_id: order.paymentProofFileId }),
      cache: 'no-store',
    },
  );

  if (!fileInfoResponse.ok) {
    return NextResponse.json({ error: 'Failed to resolve payment proof' }, { status: 502 });
  }

  const fileInfoPayload = (await fileInfoResponse.json()) as {
    ok?: boolean;
    result?: { file_path?: string | null };
  };

  const filePath = fileInfoPayload.result?.file_path?.trim();
  if (!fileInfoPayload.ok || !filePath) {
    return NextResponse.json({ error: 'Payment proof is unavailable' }, { status: 404 });
  }

  const telegramFileResponse = await fetch(
    `https://api.telegram.org/file/bot${config.botToken}/${filePath}`,
    {
      cache: 'no-store',
    },
  );

  if (!telegramFileResponse.ok) {
    return NextResponse.json({ error: 'Failed to download payment proof' }, { status: 502 });
  }

  const fileBuffer = Buffer.from(await telegramFileResponse.arrayBuffer());
  const contentType = inferContentType(
    filePath,
    telegramFileResponse.headers.get('content-type'),
  );
  const download = request.nextUrl.searchParams.get('download') === '1';
  const filename = `telegram-order-${order.orderCode}-proof${path.extname(filePath) || (order.paymentProofType === 'photo' ? '.jpg' : '')}`;

  return new NextResponse(fileBuffer, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(fileBuffer.length),
      'Cache-Control': 'no-store',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
    },
  });
}
