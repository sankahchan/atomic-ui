import { NextRequest, NextResponse } from 'next/server';
import { getRequestIpFromHeaders } from '@/lib/audit';
import { recordSubscriptionPageEventByToken } from '@/lib/services/subscription-events';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  if (!token) {
    return NextResponse.json({ error: 'Token is required' }, { status: 400 });
  }

  try {
    const body = (await request.json()) as {
      eventType?: string;
      source?: string | null;
      platform?: string | null;
      metadata?: Record<string, unknown> | null;
    };

    if (!body?.eventType || typeof body.eventType !== 'string') {
      return NextResponse.json({ error: 'eventType is required' }, { status: 400 });
    }

    const event = await recordSubscriptionPageEventByToken({
      token,
      eventType: body.eventType,
      source: body.source ?? null,
      platform: body.platform ?? null,
      metadata: body.metadata ?? null,
      ip: getRequestIpFromHeaders(request.headers),
      userAgent: request.headers.get('user-agent'),
    });

    if (!event) {
      return NextResponse.json({ error: 'Subscription token not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Failed to track subscription event:', error);
    return NextResponse.json({ error: 'Failed to track event' }, { status: 500 });
  }
}
