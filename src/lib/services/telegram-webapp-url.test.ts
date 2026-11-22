import test from 'node:test';
import assert from 'node:assert/strict';

import { getTelegramWebAppUrl } from '@/lib/services/telegram-keys';

const URL_ENV_KEYS = [
  'APP_URL',
  'NEXT_PUBLIC_APP_URL',
  'NEXTAUTH_URL',
  'PANEL_PATH',
  'NEXT_PUBLIC_PANEL_PATH',
  'NEXT_PUBLIC_BASE_PATH',
] as const;

function withEnv(values: Record<string, string | undefined>, run: () => void) {
  const previous = new Map(URL_ENV_KEYS.map((key) => [key, process.env[key]]));
  try {
    for (const key of URL_ENV_KEYS) {
      delete process.env[key];
    }
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) continue;
      process.env[key] = value;
    }
    run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('Telegram Mini App URL includes the configured panel base path', () => {
  withEnv(
    {
      APP_URL: 'https://outlineadmin.com/',
      PANEL_PATH: '/bda71d6f',
    },
    () => {
      assert.equal(
        getTelegramWebAppUrl(),
        'https://outlineadmin.com/bda71d6f/webapp',
      );
    },
  );
});

test('Telegram Mini App URL works without a panel base path', () => {
  withEnv({ APP_URL: 'https://example.com' }, () => {
    assert.equal(getTelegramWebAppUrl(), 'https://example.com/webapp');
  });
});

test('Telegram Mini App URL is omitted when no app origin is configured', () => {
  withEnv({}, () => {
    assert.equal(getTelegramWebAppUrl(), null);
  });
});
