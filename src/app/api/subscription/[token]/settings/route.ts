/**
 * Subscription Settings API
 *
 * Returns public settings for the subscription page including branding customization.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { defaultBranding, type SubscriptionBranding } from '@/lib/subscription-themes';

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

    // Fetch all subscription-related settings
    const settingsKeys = [
      'supportLink',
      'defaultSubscriptionTheme',
      // Branding settings
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

    const settings = await db.settings.findMany({
      where: { key: { in: settingsKeys } },
    });

    // Convert to a map for easy access
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

    // Build branding object with defaults
    const branding: SubscriptionBranding = {
      logoUrl: settingsMap.get('subscriptionLogoUrl') || defaultBranding.logoUrl,
      logoSize: settingsMap.get('subscriptionLogoSize')
        ? parseInt(settingsMap.get('subscriptionLogoSize')!)
        : defaultBranding.logoSize,
      brandName: settingsMap.get('subscriptionBrandName') || defaultBranding.brandName,
      footerText: settingsMap.get('subscriptionFooterText') || defaultBranding.footerText,
      showPoweredBy: settingsMap.get('subscriptionShowPoweredBy')
        ? settingsMap.get('subscriptionShowPoweredBy') === 'true'
        : defaultBranding.showPoweredBy,
      welcomeMessage: settingsMap.get('subscriptionWelcomeMessage') || defaultBranding.welcomeMessage,
      showWelcome: settingsMap.get('subscriptionShowWelcome')
        ? settingsMap.get('subscriptionShowWelcome') === 'true'
        : defaultBranding.showWelcome,
      customCss: settingsMap.get('subscriptionCustomCss') || defaultBranding.customCss,
      fontFamily: settingsMap.get('subscriptionFontFamily') || defaultBranding.fontFamily,
      fontUrl: settingsMap.get('subscriptionFontUrl') || defaultBranding.fontUrl,
      layout: (settingsMap.get('subscriptionLayout') as SubscriptionBranding['layout']) || defaultBranding.layout,
      cardStyle: (settingsMap.get('subscriptionCardStyle') as SubscriptionBranding['cardStyle']) || defaultBranding.cardStyle,
      enableAnimations: settingsMap.get('subscriptionEnableAnimations')
        ? settingsMap.get('subscriptionEnableAnimations') === 'true'
        : defaultBranding.enableAnimations,
      animatedBackground: (settingsMap.get('subscriptionAnimatedBackground') as SubscriptionBranding['animatedBackground']) || defaultBranding.animatedBackground,
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
        defaultBranding.customApps || []
      ),
    };

    return NextResponse.json({
      supportLink: settingsMap.get('supportLink') || null,
      defaultSubscriptionTheme: settingsMap.get('defaultSubscriptionTheme') || 'dark',
      branding,
    });
  } catch (error) {
    console.error('Settings fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}
