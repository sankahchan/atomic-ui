import assert from 'node:assert/strict';
import test from 'node:test';

import { db } from '@/lib/db';
import {
  getTelegramConversationLocale,
  getTelegramSupportLink,
  getTelegramUserProfile,
  hasTelegramUserStartedBot,
  runWithTelegramRequestConfig,
  sendTelegramMessageDetailed,
  upsertTelegramUserProfile,
} from '@/lib/services/telegram-runtime';
import { serializeTelegramBotSettingsValue } from '@/lib/telegram-bot-settings';

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

  const result = await runWithTelegramRequestConfig(
    {
      botToken: 'token',
      botUsername: '@atomicui_bot',
      adminChatIds: [],
      dailyDigestEnabled: false,
      dailyDigestHour: 9,
      dailyDigestMinute: 0,
      digestLookbackHours: 24,
      defaultLanguage: 'en',
      showLanguageSelectorOnStart: true,
      role: 'ACTIVE',
    },
    () => sendTelegramMessageDetailed('token', 'chat-id', 'Hello'),
  );
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

  const result = await runWithTelegramRequestConfig(
    {
      botToken: 'token',
      botUsername: '@atomicui_bot',
      adminChatIds: [],
      dailyDigestEnabled: false,
      dailyDigestHour: 9,
      dailyDigestMinute: 0,
      digestLookbackHours: 24,
      defaultLanguage: 'en',
      showLanguageSelectorOnStart: true,
      role: 'ACTIVE',
    },
    () => sendTelegramMessageDetailed('token', 'chat-id', 'Hello'),
  );
  assert.equal(result.success, false);
  assert.equal(result.error, 'permission denied');
  assert.equal(calls, 1);
});

test('upsertTelegramUserProfile records started bot usernames and last seen bot metadata', async (t) => {
  const delegate = db.telegramUserProfile as {
    findUnique: (...args: any[]) => Promise<any>;
    create: (...args: any[]) => Promise<any>;
    update: (...args: any[]) => Promise<any>;
  };
  const originalFindUnique = delegate.findUnique;
  const originalCreate = delegate.create;
  const originalUpdate = delegate.update;
  let createArgs: any = null;

  delegate.findUnique = (async () => null) as typeof delegate.findUnique;
  delegate.create = (async (args: Record<string, any>) => {
    createArgs = args;
    return args.data;
  }) as typeof delegate.create;
  delegate.update = (async () => {
    throw new Error('update should not be called');
  }) as typeof delegate.update;

  t.after(() => {
    delegate.findUnique = originalFindUnique;
    delegate.create = originalCreate;
    delegate.update = originalUpdate;
  });

  await upsertTelegramUserProfile({
    telegramUserId: '7989641645',
    telegramChatId: '7989641645',
    username: 'atomicui_user',
    startedBotUsername: '@atomicui_next_bot',
  });

  assert.equal(createArgs?.data.startedBotUsernamesJson, JSON.stringify(['atomicui_next_bot']));
  assert.equal(createArgs?.data.lastSeenBotUsername, 'atomicui_next_bot');
  assert.ok(createArgs?.data.lastSeenBotAt instanceof Date);
});

test('hasTelegramUserStartedBot falls back to chat lookup when user id does not exist', async (t) => {
  const delegate = db.telegramUserProfile as {
    findUnique: (...args: any[]) => Promise<any>;
    findFirst: (...args: any[]) => Promise<any>;
  };
  const originalFindUnique = delegate.findUnique;
  const originalFindFirst = delegate.findFirst;

  delegate.findUnique = (async () => null) as typeof delegate.findUnique;
  delegate.findFirst = (async () => ({
    telegramUserId: '798964164599',
    telegramChatId: '7989641645',
    startedBotUsernamesJson: JSON.stringify(['atomicui_next_bot']),
  })) as typeof delegate.findFirst;

  t.after(() => {
    delegate.findUnique = originalFindUnique;
    delegate.findFirst = originalFindFirst;
  });

  const started = await hasTelegramUserStartedBot({
    telegramUserId: 'missing-user',
    telegramChatId: '7989641645',
    botUsername: '@atomicui_next_bot',
  });

  assert.equal(started, true);
});

test('sendTelegramMessageDetailed reroutes background delivery to the migration bot when the user already started it', async (t) => {
  const settingsDelegate = db.settings as {
    findUnique: (...args: any[]) => Promise<any>;
  };
  const profileDelegate = db.telegramUserProfile as {
    findUnique: (...args: any[]) => Promise<any>;
    findFirst: (...args: any[]) => Promise<any>;
  };
  const channelDelegate = db.notificationChannel as {
    findMany: (...args: any[]) => Promise<any>;
  };
  const originalFindUnique = settingsDelegate.findUnique;
  const originalProfileFindUnique = profileDelegate.findUnique;
  const originalProfileFindFirst = profileDelegate.findFirst;
  const originalChannelFindMany = channelDelegate.findMany;
  const originalFetch = global.fetch;
  let sendMessageUrl = '';

  settingsDelegate.findUnique = (async ({ where }: { where: { key: string } }) => {
    if (where.key === 'telegram_bot') {
      return {
        value: serializeTelegramBotSettingsValue({
          isEnabled: true,
          botToken: 'active-token',
          botUsername: '@atomicui_bot',
          webhookSecretToken: 'active-secret',
          adminChatIds: [],
          migrationPlan: {
            enabled: true,
            botToken: 'migration-token',
            botUsername: '@atomicui_next_bot',
          },
        }),
      };
    }

    return null;
  }) as typeof settingsDelegate.findUnique;
  channelDelegate.findMany = (async () => []) as typeof channelDelegate.findMany;
  profileDelegate.findUnique = (async () => null) as typeof profileDelegate.findUnique;
  profileDelegate.findFirst = (async () => ({
    telegramUserId: '7989641645',
    telegramChatId: '7989641645',
    startedBotUsernamesJson: JSON.stringify(['atomicui_next_bot']),
  })) as typeof profileDelegate.findFirst;
  global.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/sendMessage')) {
      sendMessageUrl = url;
    }

    return new Response(JSON.stringify({ ok: true, result: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof global.fetch;

  t.after(() => {
    settingsDelegate.findUnique = originalFindUnique;
    profileDelegate.findUnique = originalProfileFindUnique;
    profileDelegate.findFirst = originalProfileFindFirst;
    channelDelegate.findMany = originalChannelFindMany;
    global.fetch = originalFetch;
  });

  const result = await sendTelegramMessageDetailed('active-token', '7989641645', 'Hello');
  assert.equal(result.success, true);
  assert.match(sendMessageUrl, /botmigration-token\/sendMessage$/);
});

test('sendTelegramMessageDetailed keeps the current bot inside an active Telegram request context', async (t) => {
  const settingsDelegate = db.settings as {
    findUnique: (...args: any[]) => Promise<any>;
  };
  const profileDelegate = db.telegramUserProfile as {
    findUnique: (...args: any[]) => Promise<any>;
    findFirst: (...args: any[]) => Promise<any>;
  };
  const channelDelegate = db.notificationChannel as {
    findMany: (...args: any[]) => Promise<any>;
  };
  const originalFindUnique = settingsDelegate.findUnique;
  const originalProfileFindUnique = profileDelegate.findUnique;
  const originalProfileFindFirst = profileDelegate.findFirst;
  const originalChannelFindMany = channelDelegate.findMany;
  const originalFetch = global.fetch;
  let sendMessageUrl = '';

  settingsDelegate.findUnique = (async ({ where }: { where: { key: string } }) => {
    if (where.key === 'telegram_bot') {
      return {
        value: serializeTelegramBotSettingsValue({
          isEnabled: true,
          botToken: 'active-token',
          botUsername: '@atomicui_bot',
          webhookSecretToken: 'active-secret',
          adminChatIds: [],
          migrationPlan: {
            enabled: true,
            botToken: 'migration-token',
            botUsername: '@atomicui_next_bot',
          },
        }),
      };
    }

    return null;
  }) as typeof settingsDelegate.findUnique;
  channelDelegate.findMany = (async () => []) as typeof channelDelegate.findMany;
  profileDelegate.findUnique = (async () => null) as typeof profileDelegate.findUnique;
  profileDelegate.findFirst = (async () => ({
    telegramUserId: '7989641645',
    telegramChatId: '7989641645',
    startedBotUsernamesJson: JSON.stringify(['atomicui_next_bot']),
  })) as typeof profileDelegate.findFirst;
  global.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/sendMessage')) {
      sendMessageUrl = url;
    }

    return new Response(JSON.stringify({ ok: true, result: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof global.fetch;

  t.after(() => {
    settingsDelegate.findUnique = originalFindUnique;
    profileDelegate.findUnique = originalProfileFindUnique;
    profileDelegate.findFirst = originalProfileFindFirst;
    channelDelegate.findMany = originalChannelFindMany;
    global.fetch = originalFetch;
  });

  const result = await runWithTelegramRequestConfig(
    {
      botToken: 'active-token',
      botUsername: '@atomicui_bot',
      adminChatIds: [],
      dailyDigestEnabled: false,
      dailyDigestHour: 9,
      dailyDigestMinute: 0,
      digestLookbackHours: 24,
      defaultLanguage: 'en',
      showLanguageSelectorOnStart: true,
      role: 'ACTIVE',
    },
    () => sendTelegramMessageDetailed('active-token', '7989641645', 'Hello'),
  );
  assert.equal(result.success, true);
  assert.match(sendMessageUrl, /botactive-token\/sendMessage$/);
});
