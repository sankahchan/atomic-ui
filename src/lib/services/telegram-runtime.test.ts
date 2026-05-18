import assert from 'node:assert/strict';
import test from 'node:test';

import { db } from '@/lib/db';
import {
  getTelegramConversationLocale,
  getTelegramSupportLink,
  getTelegramUserProfile,
  sendTelegramMessageDetailed,
} from '@/lib/services/telegram-runtime';

test('getTelegramConversationLocale prefers the exact telegramUserId profile', async (t) => {
  const delegate = db.telegramUserProfile as {
    findUnique: (...args: any[]) => Promise<any>;
    findFirst: (...args: any[]) => Promise<any>;
  };
  const originalFindUnique = delegate.findUnique;
  const originalFindFirst = delegate.findFirst;
  let chatFallbackCalled = false;

  delegate.findUnique = (async ({ where }: { where: { telegramUserId: string } }) => {
    assert.equal(where.telegramUserId, '7989641645');
    return {
      telegramUserId: '7989641645',
      telegramChatId: '7989641645',
      locale: 'my',
    };
  }) as typeof delegate.findUnique;

  delegate.findFirst = (async () => {
    chatFallbackCalled = true;
    return {
      telegramUserId: '798964164599',
      telegramChatId: '7989641645',
      locale: null,
    };
  }) as typeof delegate.findFirst;

  t.after(() => {
    delegate.findUnique = originalFindUnique;
    delegate.findFirst = originalFindFirst;
  });

  const locale = await getTelegramConversationLocale({
    telegramUserId: '7989641645',
    telegramChatId: '7989641645',
  });

  assert.equal(locale, 'my');
  assert.equal(chatFallbackCalled, false);
});

test('getTelegramUserProfile falls back to the latest chat profile when needed', async (t) => {
  const delegate = db.telegramUserProfile as {
    findUnique: (...args: any[]) => Promise<any>;
    findFirst: (...args: any[]) => Promise<any>;
  };
  const originalFindUnique = delegate.findUnique;
  const originalFindFirst = delegate.findFirst;
  let fallbackArgs: Record<string, unknown> | null = null;

  delegate.findUnique = (async () => null) as typeof delegate.findUnique;
  delegate.findFirst = (async (args: Record<string, unknown>) => {
    fallbackArgs = args;
    return {
      telegramUserId: '798964164599',
      telegramChatId: '7989641645',
      locale: null,
    };
  }) as typeof delegate.findFirst;

  t.after(() => {
    delegate.findUnique = originalFindUnique;
    delegate.findFirst = originalFindFirst;
  });

  const profile = await getTelegramUserProfile('missing-user', '7989641645');

  assert.deepEqual(profile, {
    telegramUserId: '798964164599',
    telegramChatId: '7989641645',
    locale: null,
  });
  assert.deepEqual(fallbackArgs, {
    where: {
      telegramChatId: '7989641645',
    },
    orderBy: {
      updatedAt: 'desc',
    },
  });
});

test('getTelegramSupportLink normalizes telegram usernames from sales settings and fallback settings', async (t) => {
  const settingsDelegate = db.settings as {
    findUnique: (...args: any[]) => Promise<any>;
    findMany: (...args: any[]) => Promise<any>;
  };
  const originalFindUnique = settingsDelegate.findUnique;
  const originalFindMany = settingsDelegate.findMany;

  settingsDelegate.findUnique = (async ({ where }: { where: { key: string } }) => {
    assert.equal(where.key, 'telegram_sales');
    return {
      value: JSON.stringify({
        enabled: true,
        allowRenewals: true,
        supportLink: '@outline_sales',
      }),
    };
  }) as typeof settingsDelegate.findUnique;

  settingsDelegate.findMany = (async () => [
    { key: 'supportLink', value: '@outline_fallback' },
    { key: 'defaultLanguage', value: 'en' },
  ]) as typeof settingsDelegate.findMany;

  t.after(() => {
    settingsDelegate.findUnique = originalFindUnique;
    settingsDelegate.findMany = originalFindMany;
  });

  const supportLink = await getTelegramSupportLink();
  assert.equal(supportLink, 'https://t.me/outline_sales');
});

test('sendTelegramMessageDetailed retries one transient timeout and succeeds', async (t) => {
  const originalFetch = global.fetch;
  let calls = 0;

  global.fetch = (async () => {
    calls += 1;
    if (calls === 1) {
      const error = new Error('fetch failed') as Error & { cause?: { code: string } };
      error.cause = { code: 'ETIMEDOUT' };
      throw error;
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof global.fetch;

  t.after(() => {
    global.fetch = originalFetch;
  });

  const result = await sendTelegramMessageDetailed('token', 'chat-id', 'Hello');
  assert.equal(result.success, true);
  assert.equal(calls, 2);
});

test('sendTelegramMessageDetailed does not retry non-retryable failures', async (t) => {
  const originalFetch = global.fetch;
  let calls = 0;

  global.fetch = (async () => {
    calls += 1;
    throw new Error('permission denied');
  }) as typeof global.fetch;

  t.after(() => {
    global.fetch = originalFetch;
  });

  const result = await sendTelegramMessageDetailed('token', 'chat-id', 'Hello');
  assert.equal(result.success, false);
  assert.equal(result.error, 'permission denied');
  assert.equal(calls, 1);
});
