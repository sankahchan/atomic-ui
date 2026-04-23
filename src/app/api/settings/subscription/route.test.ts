import assert from 'node:assert/strict';
import test from 'node:test';

import { NextRequest, NextResponse } from 'next/server';

import {
  handleSubscriptionSettingsGet,
  handleSubscriptionSettingsPost,
} from './route';

function createDeniedDeps() {
  return {
    requireAdminRouteScope: async () => ({
      user: null,
      response: NextResponse.json(
        { error: 'Only owner-scoped admins can manage subscription branding.' },
        { status: 403 },
      ),
    }),
    settings: {
      findMany: async () => [],
      upsert: async () => undefined,
      deleteMany: async () => ({ count: 0 }),
    },
    logError: () => undefined,
  };
}

test('subscription settings GET rejects lower-scope admins', async () => {
  const response = await handleSubscriptionSettingsGet(createDeniedDeps());

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: 'Only owner-scoped admins can manage subscription branding.',
  });
});

test('subscription settings POST rejects lower-scope admins', async () => {
  const request = new NextRequest('https://example.com/api/settings/subscription', {
    method: 'POST',
    body: JSON.stringify({ branding: {} }),
    headers: { 'content-type': 'application/json' },
  });

  const response = await handleSubscriptionSettingsPost(request, createDeniedDeps());

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: 'Only owner-scoped admins can manage subscription branding.',
  });
});

test('subscription settings GET allows owner-scoped admins', async () => {
  const response = await handleSubscriptionSettingsGet({
    requireAdminRouteScope: async () => ({
      user: { id: 'owner-1', email: 'owner@example.com', role: 'ADMIN', adminScope: 'OWNER' },
      response: null,
    }),
    settings: {
      findMany: async () => [
        { key: 'supportLink', value: 'https://support.example.com' },
      ],
      upsert: async () => undefined,
      deleteMany: async () => ({ count: 0 }),
    },
    logError: () => undefined,
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.supportLink, 'https://support.example.com');
  assert.equal(body.defaultSubscriptionTheme, 'dark');
  assert.equal(body.defaultLanguage, 'en');
  assert.equal(body.unsplashApiKey, '');
  assert.equal(body.branding.brandName, 'Atomic-UI');
  assert.equal(body.branding.logoSize, 25);
  assert.equal(body.branding.customCss, '');
});

test('subscription settings POST allows owner-scoped admins', async () => {
  const writes: Array<{ key: string; value: string }> = [];
  const request = new NextRequest('https://example.com/api/settings/subscription', {
    method: 'POST',
    body: JSON.stringify({
      supportLink: 'https://support.example.com',
      defaultSubscriptionTheme: 'light',
      defaultLanguage: 'my',
      unsplashApiKey: '',
      branding: {},
    }),
    headers: { 'content-type': 'application/json' },
  });

  const response = await handleSubscriptionSettingsPost(request, {
    requireAdminRouteScope: async () => ({
      user: { id: 'owner-1', email: 'owner@example.com', role: 'ADMIN', adminScope: 'OWNER' },
      response: null,
    }),
    settings: {
      findMany: async () => [],
      upsert: async (args) => {
        const key = args.where.key;
        assert.ok(key);
        writes.push({
          key,
          value: 'update' in args ? String(args.update?.value ?? '') : '',
        });
        return undefined;
      },
      deleteMany: async () => ({ count: 1 }),
    },
    logError: () => undefined,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true });
  assert.equal(writes.some((entry) => entry.key === 'supportLink'), true);
  assert.equal(writes.some((entry) => entry.key === 'defaultSubscriptionTheme'), true);
  assert.equal(writes.some((entry) => entry.key === 'defaultLanguage'), true);
});
