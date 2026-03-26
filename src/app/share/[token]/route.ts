import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  buildDynamicSharePageUrl,
  buildDynamicShortShareUrl,
} from '@/lib/subscription-links';

function buildUnavailableResponse(message: string, status: number) {
  return new NextResponse(message, {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const now = new Date();

  const link = await db.accessDistributionLink.findUnique({
    where: { token },
    include: {
      dynamicAccessKey: {
        select: {
          dynamicUrl: true,
          publicSlug: true,
          sharePageEnabled: true,
          status: true,
        },
      },
    },
  });

  if (!link) {
    return buildUnavailableResponse('This invite link could not be found.', 404);
  }

  if (link.expiresAt <= now) {
    return buildUnavailableResponse('This invite link has expired.', 410);
  }

  if (link.maxUses !== null && link.currentUses >= link.maxUses) {
    return buildUnavailableResponse('This invite link has already been used.', 410);
  }

  if (
    !link.dynamicAccessKey.sharePageEnabled ||
    (link.dynamicAccessKey.status !== 'ACTIVE' && link.dynamicAccessKey.status !== 'PENDING')
  ) {
    return buildUnavailableResponse('This invite link is no longer available.', 403);
  }

  if (!link.dynamicAccessKey.publicSlug && !link.dynamicAccessKey.dynamicUrl) {
    return buildUnavailableResponse('This invite link is not ready yet.', 404);
  }

  const updateResult = await db.accessDistributionLink.updateMany({
    where: {
      id: link.id,
      expiresAt: { gt: now },
      ...(link.maxUses !== null ? { currentUses: { lt: link.maxUses } } : {}),
    },
    data: {
      currentUses: {
        increment: 1,
      },
    },
  });

  if (updateResult.count === 0) {
    return buildUnavailableResponse('This invite link is no longer available.', 410);
  }

  const destination = link.dynamicAccessKey.publicSlug
    ? buildDynamicShortShareUrl(link.dynamicAccessKey.publicSlug, {
        origin: request.nextUrl.origin,
        source: 'distribution',
        lang: request.nextUrl.searchParams.get('lang'),
      })
    : buildDynamicSharePageUrl(link.dynamicAccessKey.dynamicUrl!, {
        origin: request.nextUrl.origin,
        source: 'distribution',
        lang: request.nextUrl.searchParams.get('lang'),
      });

  return NextResponse.redirect(destination, 307);
}
