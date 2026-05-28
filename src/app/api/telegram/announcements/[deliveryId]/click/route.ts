import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTelegramSupportLink } from '@/lib/services/telegram-runtime';
import { consumeRateLimit } from '@/lib/rate-limit';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ deliveryId: string }> },
) {
  const { deliveryId } = await context.params;

  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
  const budget = consumeRateLimit(`announce-click:${clientIp}`, {
    limit: 60,
    windowMs: 60_000,
    blockMs: 60_000,
  });

  if (!budget.allowed) {
    return new NextResponse('Too many requests', { status: 429 });
  }

  const target = request.nextUrl.searchParams.get('target') || 'support';
  const delivery = await db.telegramAnnouncementDelivery.findUnique({
    where: { id: deliveryId },
    include: {
      announcement: true,
    },
  });

  if (!delivery) {
    return new NextResponse('Announcement not found', { status: 404 });
  }

  await db.telegramAnnouncementDelivery.update({
    where: { id: delivery.id },
    data: {
      readAt: delivery.readAt || new Date(),
      clickCount: { increment: 1 },
      lastClickedAt: new Date(),
    },
  });

  if (target !== 'support') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  const supportLink = delivery.announcement.includeSupportButton
    ? await getTelegramSupportLink()
    : null;
  if (!supportLink) {
    return new NextResponse('Support link is not configured', { status: 404 });
  }

  return NextResponse.redirect(supportLink);
}
