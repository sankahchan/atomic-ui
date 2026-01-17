/**
 * Subscription Settings API
 *
 * GET: Fetch subscription page settings
 * POST: Update subscription page settings (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function GET() {
  try {
    const [supportLinkSetting, defaultThemeSetting] = await Promise.all([
      db.settings.findUnique({ where: { key: 'supportLink' } }),
      db.settings.findUnique({ where: { key: 'defaultSubscriptionTheme' } }),
    ]);

    return NextResponse.json({
      supportLink: supportLinkSetting?.value || '',
      defaultSubscriptionTheme: defaultThemeSetting?.value || 'dark',
    });
  } catch (error) {
    console.error('Failed to fetch settings:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Verify admin session
    const user = await getCurrentUser();
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { supportLink, defaultSubscriptionTheme } = body;

    // Update settings using upsert
    await Promise.all([
      db.settings.upsert({
        where: { key: 'supportLink' },
        update: { value: supportLink || '' },
        create: { key: 'supportLink', value: supportLink || '' },
      }),
      db.settings.upsert({
        where: { key: 'defaultSubscriptionTheme' },
        update: { value: defaultSubscriptionTheme || 'dark' },
        create: { key: 'defaultSubscriptionTheme', value: defaultSubscriptionTheme || 'dark' },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to save settings:', error);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
