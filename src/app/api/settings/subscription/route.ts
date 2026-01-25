/**
 * Subscription Settings API
 *
 * GET: Fetch subscription page settings including branding
 * POST: Update subscription page settings (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { defaultBranding } from '@/lib/subscription-themes';

// All branding setting keys
const brandingKeys = [
  'subscriptionLogoUrl',
  'subscriptionLogoSize',
  'subscriptionBrandName',
  'subscriptionFooterText',
  'subscriptionShowPoweredBy',
  'subscriptionWelcomeMessage',
  'subscriptionShowWelcome',
  'subscriptionCustomCss',
  'subscriptionFontFamily',
  'subscriptionFontUrl',
  'subscriptionLayout',
  'subscriptionCardStyle',
  'subscriptionEnableAnimations',
  'subscriptionAnimatedBackground',
  'subscriptionShowUsageAlerts',
  'subscriptionUsageAlertThresholds',
  'subscriptionEnabledApps',
  'subscriptionCustomApps',
];

export async function GET() {
  try {
    // Fetch all settings
    const allKeys = [
      'supportLink',
      'defaultSubscriptionTheme',
      'unsplashApiKey',
      ...brandingKeys,
    ];

    const settings = await db.settings.findMany({
      where: { key: { in: allKeys } },
    });

    const settingsMap = new Map(settings.map(s => [s.key, s.value]));

    // Parse JSON values safely
    const parseJson = <T>(value: string | undefined, fallback: T): T => {
      if (!value) return fallback;
      try {
        return JSON.parse(value) as T;
      } catch {
        return fallback;
      }
    };

    // Don't expose the full API key, just indicate if it's set
    const hasUnsplashKey = !!settingsMap.get('unsplashApiKey');

    // Build branding object
    const branding = {
      logoUrl: settingsMap.get('subscriptionLogoUrl') || '',
      logoSize: settingsMap.get('subscriptionLogoSize')
        ? parseInt(settingsMap.get('subscriptionLogoSize')!)
        : 25,
      brandName: settingsMap.get('subscriptionBrandName') || defaultBranding.brandName,
      footerText: settingsMap.get('subscriptionFooterText') || '',
      showPoweredBy: settingsMap.get('subscriptionShowPoweredBy')
        ? settingsMap.get('subscriptionShowPoweredBy') === 'true'
        : defaultBranding.showPoweredBy,
      welcomeMessage: settingsMap.get('subscriptionWelcomeMessage') || '',
      showWelcome: settingsMap.get('subscriptionShowWelcome')
        ? settingsMap.get('subscriptionShowWelcome') === 'true'
        : defaultBranding.showWelcome,
      customCss: settingsMap.get('subscriptionCustomCss') || '',
      fontFamily: settingsMap.get('subscriptionFontFamily') || '',
      fontUrl: settingsMap.get('subscriptionFontUrl') || '',
      layout: settingsMap.get('subscriptionLayout') || defaultBranding.layout,
      cardStyle: settingsMap.get('subscriptionCardStyle') || defaultBranding.cardStyle,
      enableAnimations: settingsMap.get('subscriptionEnableAnimations')
        ? settingsMap.get('subscriptionEnableAnimations') === 'true'
        : defaultBranding.enableAnimations,
      animatedBackground: settingsMap.get('subscriptionAnimatedBackground') || defaultBranding.animatedBackground,
      showUsageAlerts: settingsMap.get('subscriptionShowUsageAlerts')
        ? settingsMap.get('subscriptionShowUsageAlerts') === 'true'
        : defaultBranding.showUsageAlerts,
      usageAlertThresholds: parseJson(
        settingsMap.get('subscriptionUsageAlertThresholds'),
        defaultBranding.usageAlertThresholds!
      ),
      enabledApps: parseJson(
        settingsMap.get('subscriptionEnabledApps'),
        defaultBranding.enabledApps!
      ),
      customApps: parseJson(
        settingsMap.get('subscriptionCustomApps'),
        []
      ),
    };

    return NextResponse.json({
      supportLink: settingsMap.get('supportLink') || '',
      defaultSubscriptionTheme: settingsMap.get('defaultSubscriptionTheme') || 'dark',
      unsplashApiKey: hasUnsplashKey ? '********' : '',
      branding,
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
    const { supportLink, defaultSubscriptionTheme, unsplashApiKey, branding } = body;

    // Build upsert operations
    const operations: Promise<unknown>[] = [
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
    if (unsplashApiKey && !unsplashApiKey.includes('*')) {
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
        })
      );
    }

    // Handle branding settings
    if (branding) {
      // String settings
      const stringSettings: Record<string, string | undefined> = {
        subscriptionLogoUrl: branding.logoUrl,
        subscriptionBrandName: branding.brandName,
        subscriptionFooterText: branding.footerText,
        subscriptionWelcomeMessage: branding.welcomeMessage,
        subscriptionCustomCss: branding.customCss,
        subscriptionFontFamily: branding.fontFamily,
        subscriptionFontUrl: branding.fontUrl,
        subscriptionLayout: branding.layout,
        subscriptionCardStyle: branding.cardStyle,
        subscriptionAnimatedBackground: branding.animatedBackground,
      };

      // Number settings
      if (branding.logoSize !== undefined) {
        operations.push(
          db.settings.upsert({
            where: { key: 'subscriptionLogoSize' },
            update: { value: String(branding.logoSize) },
            create: { key: 'subscriptionLogoSize', value: String(branding.logoSize) },
          })
        );
      }

      // Boolean settings
      const booleanSettings: Record<string, boolean | undefined> = {
        subscriptionShowPoweredBy: branding.showPoweredBy,
        subscriptionShowWelcome: branding.showWelcome,
        subscriptionEnableAnimations: branding.enableAnimations,
        subscriptionShowUsageAlerts: branding.showUsageAlerts,
      };

      // JSON settings
      const jsonSettings: Record<string, unknown> = {
        subscriptionUsageAlertThresholds: branding.usageAlertThresholds,
        subscriptionEnabledApps: branding.enabledApps,
        subscriptionCustomApps: branding.customApps,
      };

      // Add string operations
      for (const [key, value] of Object.entries(stringSettings)) {
        if (value !== undefined) {
          operations.push(
            db.settings.upsert({
              where: { key },
              update: { value: value || '' },
              create: { key, value: value || '' },
            })
          );
        }
      }

      // Add boolean operations
      for (const [key, value] of Object.entries(booleanSettings)) {
        if (value !== undefined) {
          operations.push(
            db.settings.upsert({
              where: { key },
              update: { value: String(value) },
              create: { key, value: String(value) },
            })
          );
        }
      }

      // Add JSON operations
      for (const [key, value] of Object.entries(jsonSettings)) {
        if (value !== undefined) {
          operations.push(
            db.settings.upsert({
              where: { key },
              update: { value: JSON.stringify(value) },
              create: { key, value: JSON.stringify(value) },
            })
          );
        }
      }
    }

    await Promise.all(operations);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to save settings:', error);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
