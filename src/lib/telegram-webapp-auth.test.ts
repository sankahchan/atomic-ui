import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac } from 'node:crypto';
import {
  createTelegramWebAppSession,
  verifyTelegramWebAppInitData,
  verifyTelegramWebAppSession,
} from './telegram-webapp-auth';

const BOT_TOKEN = '123456:test-bot-token';

function buildInitData(input: {
  botToken?: string;
  authDate: number;
  user: Record<string, unknown>;
  chat?: Record<string, unknown>;
  Tamper?: boolean;
}) {
  const params = new URLSearchParams();
  params.set('auth_date', String(input.authDate));
  params.set('user', JSON.stringify(input.user));
  if (input.chat) {
    params.set('chat', JSON.stringify(input.chat));
  }

  const dataCheckString = Array.from(params.entries())
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData')
    .update(input.botToken ?? BOT_TOKEN)
    .digest();
  const hash = createHmac('sha256', secret).update(dataCheckString).digest('hex');
  params.set('hash', input.Tamper ? `0${hash.slice(1)}` : hash);

  return params.toString();
}

test('verifyTelegramWebAppInitData accepts a signed payload', () => {
  const authDate = Math.floor(Date.now() / 1000) - 30;
  const initData = buildInitData({
    authDate,
    user: { id: 42, username: 'sankahchan', language_code: 'my' },
    chat: { id: 99, type: 'private' },
  });

  assert.deepEqual(verifyTelegramWebAppInitData(initData, BOT_TOKEN), {
    telegramUserId: 42,
    chatId: 99,
    username: 'sankahchan',
    locale: 'my',
  });
});

test('verifyTelegramWebAppInitData rejects a tampered hash', () => {
  const initData = buildInitData({
    authDate: Math.floor(Date.now() / 1000),
    user: { id: 42 },
    Tamper: true,
  });

  assert.throws(
    () => verifyTelegramWebAppInitData(initData, BOT_TOKEN),
    /signature mismatch/,
  );
});

test('verifyTelegramWebAppInitData rejects stale initData', () => {
  const initData = buildInitData({
    authDate: Math.floor(Date.now() / 1000) - 3600,
    user: { id: 42 },
  });

  assert.throws(() => verifyTelegramWebAppInitData(initData, BOT_TOKEN), /expired/);
});

test('Telegram Web App session tokens round-trip', async () => {
  const identity = {
    telegramUserId: 42,
    chatId: 99,
    username: 'sankahchan',
    locale: 'my',
  };
  const token = await createTelegramWebAppSession(identity);

  assert.deepEqual(await verifyTelegramWebAppSession(token), identity);
  assert.equal(await verifyTelegramWebAppSession('not-a-token'), null);
});
