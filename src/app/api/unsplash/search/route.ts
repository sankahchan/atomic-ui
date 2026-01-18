/**
 * Unsplash Search API Proxy
 *
 * GET: Search photos on Unsplash
 * Proxies requests to avoid exposing API key to client
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';

const UNSPLASH_API_URL = 'https://api.unsplash.com';

export async function GET(request: NextRequest) {
  try {
    // Verify admin session
    const user = await getCurrentUser();
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get Unsplash API key from settings
    const apiKeySetting = await db.settings.findUnique({
      where: { key: 'unsplashApiKey' },
    });

    let apiKey = apiKeySetting?.value;

    // Fallback to environment variable
    if (!apiKey && process.env.UNSPLASH_ACCESS_KEY) {
      apiKey = process.env.UNSPLASH_ACCESS_KEY;
    }

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Unsplash API key not configured. Please add it in Settings or .env file.' },
        { status: 400 }
      );
    }

    try {
      // Try to parse if it's JSON encoded (from DB settings)
      if (apiKey.startsWith('"') || apiKey.startsWith('{')) {
        apiKey = JSON.parse(apiKey);
      }
    } catch (e) {
      // Use raw value if parse fails (likely env var or plain string in DB)
      console.warn('Failed to parse Unsplash API key as JSON, using raw value');
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query');
    const page = searchParams.get('page') || '1';
    const perPage = searchParams.get('per_page') || '20';
    const orientation = searchParams.get('orientation') || 'landscape';

    if (!query) {
      return NextResponse.json({ error: 'Query parameter required' }, { status: 400 });
    }

    // Search Unsplash
    const response = await fetch(
      `${UNSPLASH_API_URL}/search/photos?query=${encodeURIComponent(query)}&page=${page}&per_page=${perPage}&orientation=${orientation}`,
      {
        headers: {
          Authorization: `Client-ID ${apiKey}`,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Unsplash API error:', errorText);
      return NextResponse.json(
        { error: 'Failed to search Unsplash' },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Transform response to only include necessary fields
    const photos = data.results.map((photo: any) => ({
      id: photo.id,
      description: photo.description || photo.alt_description,
      urls: {
        thumb: photo.urls.thumb,
        small: photo.urls.small,
        regular: photo.urls.regular,
        full: photo.urls.full,
      },
      user: {
        name: photo.user.name,
        username: photo.user.username,
        link: photo.user.links.html,
      },
      color: photo.color,
      width: photo.width,
      height: photo.height,
    }));

    return NextResponse.json({
      total: data.total,
      total_pages: data.total_pages,
      photos,
    });
  } catch (error) {
    console.error('Unsplash search failed:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}

/**
 * Get curated/random photos for initial display
 */
export async function POST(request: NextRequest) {
  try {
    // Verify admin session
    const user = await getCurrentUser();
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get Unsplash API key from settings
    const apiKeySetting = await db.settings.findUnique({
      where: { key: 'unsplashApiKey' },
    });

    let apiKey = apiKeySetting?.value;

    // Fallback to environment variable
    if (!apiKey && process.env.UNSPLASH_ACCESS_KEY) {
      apiKey = process.env.UNSPLASH_ACCESS_KEY;
    }

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Unsplash API key not configured' },
        { status: 400 }
      );
    }

    try {
      if (apiKey.startsWith('"') || apiKey.startsWith('{')) {
        apiKey = JSON.parse(apiKey);
      }
    } catch (e) {
      console.warn('Failed to parse Unsplash API key as JSON, using raw value');
    }

    const body = await request.json();
    const { collection } = body;

    // Get photos from a specific collection or random
    let url = `${UNSPLASH_API_URL}/photos/random?count=12&orientation=landscape`;
    if (collection) {
      url = `${UNSPLASH_API_URL}/collections/${collection}/photos?per_page=12`;
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Client-ID ${apiKey}`,
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch photos' },
        { status: response.status }
      );
    }

    const data = await response.json();
    const photos = (Array.isArray(data) ? data : data.results || []).map((photo: any) => ({
      id: photo.id,
      description: photo.description || photo.alt_description,
      urls: {
        thumb: photo.urls.thumb,
        small: photo.urls.small,
        regular: photo.urls.regular,
        full: photo.urls.full,
      },
      user: {
        name: photo.user.name,
        username: photo.user.username,
        link: photo.user.links.html,
      },
      color: photo.color,
      width: photo.width,
      height: photo.height,
    }));

    return NextResponse.json({ photos });
  } catch (error) {
    console.error('Unsplash fetch failed:', error);
    return NextResponse.json({ error: 'Fetch failed' }, { status: 500 });
  }
}
