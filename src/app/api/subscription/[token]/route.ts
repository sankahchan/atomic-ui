/**
 * Subscription API Endpoint
 *
 * This public endpoint returns the access URL for a given subscription token.
 * Clients can use this URL to automatically fetch and update their VPN config.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

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
    const key = await db.accessKey.findUnique({
      where: { subscriptionToken: token },
      select: {
        id: true,
        name: true,
        accessUrl: true,
        status: true,
        expiresAt: true,
        dataLimitBytes: true,
        usedBytes: true,
        server: {
          select: {
            name: true,
            countryCode: true,
          },
        },
      },
    });

    if (!key) {
      return NextResponse.json(
        { error: 'Invalid subscription token' },
        { status: 404 }
      );
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

    // Check Accept header to determine response format
    const acceptHeader = request.headers.get('accept') || '';

    // If client wants JSON (default for browsers/programmatic access)
    if (acceptHeader.includes('application/json')) {
      return NextResponse.json({
        name: key.name,
        server: key.server.name,
        countryCode: key.server.countryCode,
        accessUrl: key.accessUrl,
        status: key.status,
      });
    }

    // Return plain text access URL (for Shadowsocks clients)
    return new NextResponse(key.accessUrl, {
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
