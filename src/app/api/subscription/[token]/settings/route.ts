/**
 * Subscription Settings API
 *
 * Returns public settings for the subscription page (support link, default theme).
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (!token) {
    return NextResponse.json({ error: 'Token is required' }, { status: 400 });
  }

  try {
    // Verify the token exists (don't expose settings if token is invalid)
    const key = await db.accessKey.findUnique({
      where: { subscriptionToken: token },
      select: { id: true },
    });

    let isValid = !!key;

    if (!isValid) {
      const dak = await db.dynamicAccessKey.findUnique({
        where: { dynamicUrl: token },
        select: { id: true },
      });
      isValid = !!dak;
    }

    if (!isValid) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 404 });
    }

    // Fetch public settings
    const [supportLinkSetting, defaultThemeSetting] = await Promise.all([
      db.settings.findUnique({ where: { key: 'supportLink' } }),
      db.settings.findUnique({ where: { key: 'defaultSubscriptionTheme' } }),
    ]);

    return NextResponse.json({
      supportLink: supportLinkSetting?.value || null,
      defaultSubscriptionTheme: defaultThemeSetting?.value || 'dark',
    });
  } catch (error) {
    console.error('Settings fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}
