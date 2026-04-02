import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTelegramSupportLink } from '@/lib/services/telegram-runtime';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ deliveryId: string }> },
) {
  const { deliveryId } = await context.params;
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
