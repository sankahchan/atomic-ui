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
    const [supportLinkSetting, defaultThemeSetting, unsplashApiKeySetting] = await Promise.all([
      db.settings.findUnique({ where: { key: 'supportLink' } }),
      db.settings.findUnique({ where: { key: 'defaultSubscriptionTheme' } }),
      db.settings.findUnique({ where: { key: 'unsplashApiKey' } }),
    ]);

    // Don't expose the full API key, just indicate if it's set
    const hasUnsplashKey = !!unsplashApiKeySetting?.value;

    return NextResponse.json({
      supportLink: supportLinkSetting?.value || '',
      defaultSubscriptionTheme: defaultThemeSetting?.value || 'dark',
      unsplashApiKey: hasUnsplashKey ? '••••••••' : '',
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
    const { supportLink, defaultSubscriptionTheme, unsplashApiKey } = body;

    // Build upsert operations
    const operations = [
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
    ];

    // Only update API key if a new one is provided (not the masked value)
    if (unsplashApiKey && !unsplashApiKey.includes('•')) {
      operations.push(
        db.settings.upsert({
          where: { key: 'unsplashApiKey' },
          update: { value: JSON.stringify(unsplashApiKey) },
          create: { key: 'unsplashApiKey', value: JSON.stringify(unsplashApiKey) },
        })
      );
    } else if (unsplashApiKey === '') {
      // Clear the API key if empty string is sent
      operations.push(
        db.settings.deleteMany({
          where: { key: 'unsplashApiKey' },
        }) as any
      );
    }

    await Promise.all(operations);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to save settings:', error);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
