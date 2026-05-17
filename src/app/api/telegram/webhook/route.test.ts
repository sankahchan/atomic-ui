import assert from 'node:assert/strict';
import test from 'node:test';

import { NextRequest } from 'next/server';

import { TELEGRAM_WEBHOOK_SECRET_HEADER } from '@/lib/telegram-webhook-secret';

import {
  handleTelegramWebhookGet,
  handleTelegramWebhookPost,
  handleTelegramWebhookSetup,
  type TelegramWebhookRouteDeps,
} from './route-helpers';

const baseWebhookDeps: TelegramWebhookRouteDeps = {
  getTelegramConfig: async () => ({
    botToken: 'bot-token',
    webhookSecretToken: 'expected-secret',
    adminChatIds: [],
    dailyDigestEnabled: false,
    dailyDigestHour: 9,
    dailyDigestMinute: 0,
    digestLookbackHours: 24,
    defaultLanguage: 'en' as const,
    showLanguageSelectorOnStart: true,
  }),
  handleTelegramUpdate: async () => null,
  sendTelegramMessage: async () => true,
  requireAdminRouteScope: async () => ({
    user: { id: 'admin-1', email: 'owner@example.com', role: 'ADMIN', adminScope: 'OWNER' },
    response: null,
  }),
  getConfiguredPublicAppOrigin: () => 'https://example.com',
  getPublicBasePath: () => '/panel',
  fetchImpl: fetch,
  logError: () => undefined,
};

test('telegram webhook rejects requests without the webhook secret header', async () => {
  const request = new NextRequest('https://example.com/api/telegram/webhook', {
    method: 'POST',
    body: JSON.stringify({ update_id: 1 }),
    headers: { 'content-type': 'application/json' },
  });

  const response = await handleTelegramWebhookPost(request, baseWebhookDeps);

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: 'Unauthorized webhook request',
  });
});

test('telegram webhook rejects requests with the wrong webhook secret header', async () => {
  const request = new NextRequest('https://example.com/api/telegram/webhook', {
    method: 'POST',
    body: JSON.stringify({ update_id: 1 }),
    headers: {
      'content-type': 'application/json',
      [TELEGRAM_WEBHOOK_SECRET_HEADER]: 'wrong-secret',
    },
  });

  const response = await handleTelegramWebhookPost(request, baseWebhookDeps);

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: 'Unauthorized webhook request',
  });
});

test('telegram webhook accepts requests with the correct webhook secret header', async () => {
  let handledUpdate: unknown = null;
  const request = new NextRequest('https://example.com/api/telegram/webhook', {
    method: 'POST',
    body: JSON.stringify({ update_id: 42 }),
    headers: {
      'content-type': 'application/json',
      [TELEGRAM_WEBHOOK_SECRET_HEADER]: 'expected-secret',
    },
  });

  const response = await handleTelegramWebhookPost(request, {
    ...baseWebhookDeps,
    handleTelegramUpdate: async (update) => {
      handledUpdate = update;
      return null;
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.deepEqual(handledUpdate, { update_id: 42 });
});

test('telegram webhook setup must use POST instead of GET', async () => {
  const request = new NextRequest('https://example.com/api/telegram/webhook?setWebhook=true', {
    method: 'GET',
  });

  const response = await handleTelegramWebhookGet(request, baseWebhookDeps);

  assert.equal(response.status, 405);
  assert.deepEqual(await response.json(), {
    status: 'method_not_allowed',
    message: 'Use POST /api/telegram/webhook?setWebhook=true to configure the Telegram webhook.',
  });
});

test('telegram webhook reports an error when webhook info lookup fails', async () => {
  const request = new NextRequest('https://example.com/api/telegram/webhook', {
    method: 'GET',
  });

  const response = await handleTelegramWebhookGet(request, {
    ...baseWebhookDeps,
    fetchImpl: async () => {
      throw new Error('telegram unreachable');
    },
  });

  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), {
    status: 'error',
    message: 'Bot token configured but could not fetch webhook info.',
  });
});

test('telegram webhook setup accepts authenticated POST requests', async () => {
  const request = new NextRequest('https://example.com/api/telegram/webhook?setWebhook=true', {
    method: 'POST',
  });

  const response = await handleTelegramWebhookSetup(request, {
    ...baseWebhookDeps,
    fetchImpl: async () =>
      new Response(JSON.stringify({ ok: true, result: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, 'webhook_set');
  assert.equal(body.webhookUrl, 'https://example.com/panel/api/telegram/webhook');
});
