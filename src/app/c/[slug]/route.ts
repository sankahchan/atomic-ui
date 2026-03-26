import { NextRequest, NextResponse } from 'next/server';
import { handleSubscriptionRequest } from '@/app/api/sub/[token]/route';
import { resolveAccessKeyPublicIdentifier } from '@/lib/access-key-public-identifiers';
import { getPublicBasePath } from '@/lib/subscription-links';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const resolved = await resolveAccessKeyPublicIdentifier(slug);

  if (resolved?.matchedBy === 'historicalSlug' && resolved.redirectSlug) {
    const url = new URL(request.url);
    url.pathname = `${getPublicBasePath()}/c/${resolved.redirectSlug}`;
    return NextResponse.redirect(url, 307);
  }

  return handleSubscriptionRequest(request, slug);
}
