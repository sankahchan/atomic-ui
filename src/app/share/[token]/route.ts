import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  buildSharePageUrl,
  buildShortShareUrl,
  buildDynamicSharePageUrl,
  buildDynamicShortShareUrl,
} from '@/lib/subscription-links';
import {
  recordSubscriptionPageEvent,
  SUBSCRIPTION_EVENT_TYPES,
} from '@/lib/services/subscription-events';

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
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || null;
  const userAgent = request.headers.get('user-agent');

  const link = await db.accessDistributionLink.findUnique({
    where: { token },
    include: {
      accessKey: {
        select: {
          subscriptionToken: true,
          publicSlug: true,
          sharePageEnabled: true,
          status: true,
        },
      },
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

  const accessKeyAvailable = link.accessKey
    ? link.accessKey.sharePageEnabled &&
      (link.accessKey.status === 'ACTIVE' || link.accessKey.status === 'PENDING') &&
      Boolean(link.accessKey.publicSlug || link.accessKey.subscriptionToken)
    : false;
  const dynamicKeyAvailable = link.dynamicAccessKey
    ? link.dynamicAccessKey.sharePageEnabled &&
      (link.dynamicAccessKey.status === 'ACTIVE' || link.dynamicAccessKey.status === 'PENDING') &&
      Boolean(link.dynamicAccessKey.publicSlug || link.dynamicAccessKey.dynamicUrl)
    : false;

  if (!accessKeyAvailable && !dynamicKeyAvailable) {
    return buildUnavailableResponse('This invite link is no longer available.', 403);
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
      lastOpenedAt: now,
      lastOpenedIp: clientIp,
    },
  });

  if (updateResult.count === 0) {
    return buildUnavailableResponse('This invite link is no longer available.', 410);
  }

  await recordSubscriptionPageEvent({
    accessKeyId: link.accessKeyId ?? null,
    dynamicAccessKeyId: link.dynamicAccessKeyId ?? null,
    eventType: SUBSCRIPTION_EVENT_TYPES.INVITE_OPEN,
    source: 'distribution',
    metadata: {
      token: link.token,
      maxUses: link.maxUses,
      currentUses: link.currentUses + 1,
      label: link.label,
    },
    ip: clientIp,
    userAgent,
  });

  const destination = accessKeyAvailable
    ? link.accessKey!.publicSlug
      ? buildShortShareUrl(link.accessKey!.publicSlug, {
          origin: request.nextUrl.origin,
          source: 'distribution',
          lang: request.nextUrl.searchParams.get('lang'),
        })
      : buildSharePageUrl(link.accessKey!.subscriptionToken!, {
          origin: request.nextUrl.origin,
          source: 'distribution',
          lang: request.nextUrl.searchParams.get('lang'),
        })
    : link.dynamicAccessKey!.publicSlug
      ? buildDynamicShortShareUrl(link.dynamicAccessKey!.publicSlug, {
          origin: request.nextUrl.origin,
          source: 'distribution',
          lang: request.nextUrl.searchParams.get('lang'),
        })
      : buildDynamicSharePageUrl(link.dynamicAccessKey!.dynamicUrl!, {
          origin: request.nextUrl.origin,
          source: 'distribution',
          lang: request.nextUrl.searchParams.get('lang'),
        });

  return NextResponse.redirect(destination, 307);
}
