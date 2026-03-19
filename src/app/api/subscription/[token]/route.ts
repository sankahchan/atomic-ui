/**
 * Subscription API Endpoint
 *
 * This public endpoint returns the access URL for a given subscription token.
 * Clients can use this URL to automatically fetch and update their VPN config.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { decorateOutlineAccessUrl } from '@/lib/outline-access-url';
import { buildDynamicOutlineUrl, buildSubscriptionClientUrl } from '@/lib/subscription-links';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (!token) {
    return NextResponse.json(
      { error: 'Token is required' },
      { status: 400 }
    );
  }

  try {
    // Find the key by subscription token
    const key = await db.accessKey.findFirst({
      where: {
        OR: [
          { subscriptionToken: token },
          { publicSlug: token },
        ],
      },
      include: {
        server: {
          select: {
            name: true,
            countryCode: true,
            location: true,
          },
        },
      },
    });

    // If not found in AccessKey, check DynamicAccessKey
    if (!key) {
      const dak = await db.dynamicAccessKey.findFirst({
        where: {
          OR: [
            { dynamicUrl: token },
            { publicSlug: token },
          ],
        },
        include: {
          accessKeys: {
            where: { status: 'ACTIVE' },
            include: {
              server: {
                select: {
                  name: true,
                  countryCode: true,
                  location: true,
                },
              },
            },
          },
        },
      });

      if (!dak) {
        return NextResponse.json(
          { error: 'Invalid subscription token' },
          { status: 404 }
        );
      }

      // Check DAK status
      if (dak.status !== 'ACTIVE') {
        return NextResponse.json(
          { error: `Key is ${dak.status.toLowerCase()}` },
          { status: 403 }
        );
      }

      // Check DAK expiration
      if (dak.expiresAt && new Date() > dak.expiresAt) {
        return NextResponse.json(
          { error: 'Key has expired' },
          { status: 403 }
        );
      }

      // Check DAK data limit
      if (dak.dataLimitBytes && dak.usedBytes >= dak.dataLimitBytes) {
        return NextResponse.json(
          { error: 'Data limit exceeded' },
          { status: 403 }
        );
      }

      const acceptHeader = request.headers.get('accept') || '';
      const dynamicIdentifier = dak.publicSlug || dak.dynamicUrl || token;
      const ssConfUrl = buildDynamicOutlineUrl(dynamicIdentifier, dak.name, {
        origin: request.nextUrl.origin,
        shortPath: Boolean(dak.publicSlug),
      });

      if (acceptHeader.includes('application/json')) {
        return NextResponse.json({
          id: dak.id,
          name: dak.name,
          accessUrl: ssConfUrl,
          outlineClientUrl: ssConfUrl,
          status: dak.status,
          server: {
            name: "Dynamic Backend",
            countryCode: null, // Could maybe aggregate flags?
            location: "Auto-Selected",
          },
          usedBytes: dak.usedBytes.toString(),
          dataLimitBytes: dak.dataLimitBytes?.toString() || null,
          expiresAt: dak.expiresAt?.toISOString() || null,
          subscriptionTheme: dak.subscriptionTheme || null,
          coverImage: dak.coverImage || null,
          coverImageType: dak.coverImageType || null,
          method: dak.method || null,
          port: null,
          contactLinks: dak.contactLinks ? JSON.parse(dak.contactLinks) : null,
          subscriptionWelcomeMessage: null,
          isDynamic: true,
        });
      }

      // Return SIP002/SIP008 style list for plain text (the subscription content)
      // We return a list of ss:// links separated by newlines, or base64 encoded.
      // Many clients support base64 encoded list.

      const validKeys = dak.accessKeys.filter(k => k.accessUrl);
      const links = validKeys
        .map((k) => decorateOutlineAccessUrl(k.accessUrl, k.name) || k.accessUrl)
        .join('\n');

      // Base64 encode the list for better compatibility with some clients
      const b64Links = Buffer.from(links).toString('base64');

      return new NextResponse(b64Links, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `inline; filename="${dak.name}.txt"`,
        },
      });
    }

    // Check if key is active
    if (key.status !== 'ACTIVE' && key.status !== 'PENDING') {
      return NextResponse.json(
        { error: `Key is ${key.status.toLowerCase()}` },
        { status: 403 }
      );
    }

    // Check if key is expired
    if (key.expiresAt && new Date() > key.expiresAt) {
      return NextResponse.json(
        { error: 'Key has expired' },
        { status: 403 }
      );
    }

    // Check data limit
    if (key.dataLimitBytes && key.usedBytes >= key.dataLimitBytes) {
      return NextResponse.json(
        { error: 'Data limit exceeded' },
        { status: 403 }
      );
    }

    const decoratedAccessUrl = decorateOutlineAccessUrl(key.accessUrl, key.name) || key.accessUrl;
    const outlineIdentifier = key.publicSlug || token;
    const outlineClientUrl = buildSubscriptionClientUrl(outlineIdentifier, key.name, {
      origin: request.nextUrl.origin,
      shortPath: Boolean(key.publicSlug),
    });

    // Check Accept header to determine response format
    const acceptHeader = request.headers.get('accept') || '';

    // If client wants JSON (default for browsers/programmatic access)
    if (acceptHeader.includes('application/json')) {
      return NextResponse.json({
        id: key.id,
        name: key.name,
        accessUrl: decoratedAccessUrl,
        outlineClientUrl,
        status: key.status,
        server: {
          name: key.server.name,
          countryCode: key.server.countryCode,
          location: key.server.location || null,
        },
        usedBytes: key.usedBytes.toString(),
        dataLimitBytes: key.dataLimitBytes?.toString() || null,
        expiresAt: key.expiresAt?.toISOString() || null,
        subscriptionTheme: key.subscriptionTheme || null,
        coverImage: key.coverImage || null,
        coverImageType: key.coverImageType || null,
        method: key.method || null,
        port: key.port || null,
        contactLinks: (key as any).contactLinks ? JSON.parse((key as any).contactLinks) : null,
        subscriptionWelcomeMessage: (key as any).subscriptionWelcomeMessage || null,
      });
    }

    // Return plain text access URL (for Shadowsocks clients)
    return new NextResponse(decoratedAccessUrl, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
        'Content-Disposition': `inline; filename="${key.name}.txt"`,
      },
    });
  } catch (error) {
    console.error('Subscription error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
