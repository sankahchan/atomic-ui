import assert from 'node:assert/strict';
import test from 'node:test';

import { db } from '@/lib/db';
import {
  getTelegramConversationLocale,
  getTelegramUserProfile,
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
