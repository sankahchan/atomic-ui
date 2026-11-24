import assert from 'node:assert/strict';
import test from 'node:test';

import { syncTelegramWebAppMenuButton } from './telegram-webapp-menu';

const WEB_APP_URL = 'https://example.com/panel/webapp';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('syncTelegramWebAppMenuButton skips when no Web App URL is available', async () => {
  let called = false;
  const result = await syncTelegramWebAppMenuButton({
    botToken: 'token',
    webAppUrl: null,
    fetchImpl: async () => {
      called = true;
      return jsonResponse({ ok: true });
    },
  });

  assert.deepEqual(result, { attempted: false, ok: false });
  assert.equal(called, false);
});

test('syncTelegramWebAppMenuButton sets a web_app menu button', async () => {
  let requestUrl = '';
  let requestBody: Record<string, unknown> | null = null;
  const result = await syncTelegramWebAppMenuButton({
    botToken: 'secret-token',
    webAppUrl: WEB_APP_URL,
    fetchImpl: async (input, init) => {
      requestUrl = String(input);
      requestBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      return jsonResponse({ ok: true, result: true });
    },
  });

  assert.deepEqual(result, { attempted: true, ok: true, description: null });
  assert.equal(requestUrl, 'https://api.telegram.org/botsecret-token/setChatMenuButton');
  assert.deepEqual(requestBody, {
    menu_button: {
      type: 'web_app',
      text: '📲 Mini App',
      web_app: { url: WEB_APP_URL },
    },
  });
});

test('syncTelegramWebAppMenuButton reports Telegram errors without throwing', async () => {
  const result = await syncTelegramWebAppMenuButton({
    botToken: 'token',
    webAppUrl: WEB_APP_URL,
    fetchImpl: async () => jsonResponse({ ok: false, description: 'Bad Request: WEB_APP_URL_INVALID' }, 400),
  });

  assert.deepEqual(result, {
    attempted: true,
    ok: false,
    description: 'Bad Request: WEB_APP_URL_INVALID',
  });
});
