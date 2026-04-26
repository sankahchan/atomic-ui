import assert from 'node:assert/strict';
import test from 'node:test';

import { NextRequest } from 'next/server';

import {
  APP_BUILD_COOKIE_NAME,
  CLIENT_BUILD_HEADER_NAME,
  CLIENT_BUILD_QUERY_PARAM_NAME,
} from '@/lib/deploy-guard';
import { isPublicRoute, middleware } from '@/middleware';

const originalBuildId = process.env.NEXT_PUBLIC_APP_VERSION;

test.after(() => {
  if (originalBuildId === undefined) {
    delete process.env.NEXT_PUBLIC_APP_VERSION;
    return;
  }

  process.env.NEXT_PUBLIC_APP_VERSION = originalBuildId;
});

test('status page is explicitly public', () => {
  assert.equal(isPublicRoute('/status'), true);
  assert.equal(isPublicRoute('/status/history'), true);
});

test('exact public-route matching does not leak to sibling paths', () => {
  assert.equal(isPublicRoute('/login'), true);
  assert.equal(isPublicRoute('/login-approval'), true);
  assert.equal(isPublicRoute('/loginish'), false);
  assert.equal(isPublicRoute('/statuspage'), false);
});

test('stale server action requests are rejected before Next.js handles them', async () => {
  process.env.NEXT_PUBLIC_APP_VERSION = 'new-build';
  const request = new NextRequest('https://example.com/dashboard', {
    method: 'POST',
    headers: {
      cookie: `${APP_BUILD_COOKIE_NAME}=old-build`,
      'next-action': 'x',
    },
  });

  const response = await middleware(request);

  assert.equal(response.status, 409);
  assert.equal(response.headers.get('x-atomic-stale-build'), '1');
  assert.deepEqual(await response.json(), {
    ok: false,
    error: 'STALE_BUILD',
    message: 'This tab is using an older deploy and needs to reload.',
  });
});

test('fresh server action requests are not rejected by the stale-build guard', async () => {
  process.env.NEXT_PUBLIC_APP_VERSION = 'new-build';
  const request = new NextRequest('https://example.com/dashboard', {
    method: 'POST',
    headers: {
      cookie: `${APP_BUILD_COOKIE_NAME}=new-build`,
      'next-action': 'x',
    },
  });

  const response = await middleware(request);

  assert.notEqual(response.status, 409);
  assert.notEqual(response.headers.get('x-atomic-stale-build'), '1');
});

test('client build header takes precedence over stale build cookie on server action requests', async () => {
  process.env.NEXT_PUBLIC_APP_VERSION = 'new-build';
  const request = new NextRequest('https://example.com/dashboard', {
    method: 'POST',
    headers: {
      [CLIENT_BUILD_HEADER_NAME]: 'new-build',
      cookie: `${APP_BUILD_COOKIE_NAME}=old-build`,
      'next-action': 'x',
    },
  });

  const response = await middleware(request);

  assert.notEqual(response.status, 409);
  assert.notEqual(response.headers.get('x-atomic-stale-build'), '1');
});

test('client build query marker takes precedence over a refreshed build cookie on server action requests', async () => {
  process.env.NEXT_PUBLIC_APP_VERSION = 'new-build';
  const request = new NextRequest(
    `https://example.com/dashboard?${CLIENT_BUILD_QUERY_PARAM_NAME}=old-build`,
    {
      method: 'POST',
      headers: {
        cookie: `${APP_BUILD_COOKIE_NAME}=new-build`,
        'next-action': 'x',
      },
    },
  );

  const response = await middleware(request);

  assert.equal(response.status, 409);
  assert.equal(response.headers.get('x-atomic-stale-build'), '1');
});
