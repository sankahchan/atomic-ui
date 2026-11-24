import test from 'node:test';
import assert from 'node:assert/strict';

import { withBasePath } from '@/lib/base-path';
import {
  buildTelegramWebAppInlineButton,
  getTelegramWebAppUrl,
} from '@/lib/services/telegram-keys';
import {
  buildTelegramStoreActiveKeysView,
  buildTelegramStoreHelpView,
  buildTelegramStoreMainMenuView,
  buildTelegramStoreMyKeysEmptyView,
} from '@/lib/services/telegram-storefront';

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

test('Telegram Web App API calls respect the client-exposed base path', () => {
  withEnv({ NEXT_PUBLIC_BASE_PATH: '/bda71d6f' }, () => {
    assert.equal(
      withBasePath('/api/telegram/webapp/session'),
      '/bda71d6f/api/telegram/webapp/session',
    );
    assert.equal(
      withBasePath('/api/telegram/webapp/keys'),
      '/bda71d6f/api/telegram/webapp/keys',
    );
  });
});

test('Mini App buttons are visible from the main menu, empty key state, and help view', () => {
  withEnv(
    {
      APP_URL: 'https://outlineadmin.com/',
      PANEL_PATH: '/bda71d6f',
    },
    () => {
      const expectedUrl = 'https://outlineadmin.com/bda71d6f/webapp';
      assert.deepEqual(buildTelegramWebAppInlineButton('my'), {
        text: '📲 Mini App ဖွင့်မည်',
        web_app: { url: expectedUrl },
      });

      for (const keyboard of [
        buildTelegramStoreMainMenuView({
          firstName: 'Sankha',
          activeKeyCount: 0,
          nextExpiryLabel: '—',
          locale: 'my',
        }).replyMarkup.inline_keyboard,
        buildTelegramStoreMyKeysEmptyView('my').replyMarkup.inline_keyboard,
        buildTelegramStoreActiveKeysView([
          {
            id: 'key_1',
            kind: 'access',
            planId: 'plan_basic',
            planName: 'Basic',
            categoryLabel: 'Flash',
            usedLabel: '10 GB',
            totalLabel: '50 GB',
            progressBar: '█████░░░░░',
            percentLabel: '20%',
            expiryLabel: '23 Dec 2026',
            switchesUsed: 0,
            switchesMaxLabel: '3',
            renewPriceLabel: '5,000 Ks',
            currentServerName: 'SG 🇸🇬',
          },
        ], 'my').replyMarkup.inline_keyboard,
        buildTelegramStoreHelpView({ locale: 'my' }).replyMarkup.inline_keyboard,
      ]) {
        assert.ok(
          keyboard.some((row) => row.some((button) => (
            'web_app' in button && button.web_app?.url === expectedUrl
          ))),
        );
      }
    },
  );
});
