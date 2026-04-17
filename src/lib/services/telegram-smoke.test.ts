import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveLegacyTelegramWebhookSecret } from '@/lib/telegram-webhook-secret';
import {
  parseTelegramSmokeStoredConfig,
  resolveTelegramSmokeWebhookSecret,
  resolveTelegramSmokeWebhookUrl,
} from './telegram-smoke';

test('resolveTelegramSmokeWebhookUrl prefers an explicit smoke webhook url', () => {
  assert.equal(
    resolveTelegramSmokeWebhookUrl({
      explicitUrl: ' https://example.com/custom-webhook/ ',
      env: {
        NEXT_PUBLIC_APP_URL: 'https://example.com',
        NEXT_PUBLIC_BASE_PATH: '/panel',
      },
    }),
    'https://example.com/custom-webhook',
  );
});

test('resolveTelegramSmokeWebhookUrl derives the telegram webhook path from app env', () => {
  assert.equal(
    resolveTelegramSmokeWebhookUrl({
      env: {
        APP_URL: 'https://outlineadmin.com/',
        PANEL_PATH: '/1ea7cce1',
      },
    }),
    'https://outlineadmin.com/1ea7cce1/api/telegram/webhook',
  );
});

test('resolveTelegramSmokeWebhookSecret prefers an explicit smoke secret', () => {
  assert.equal(
    resolveTelegramSmokeWebhookSecret({
      explicitSecret: ' smoke-secret ',
      env: {
        TELEGRAM_SMOKE_WEBHOOK_SECRET: 'other-secret',
        TELEGRAM_WEBHOOK_SECRET: 'configured-secret',
        JWT_SECRET: 'jwt-secret-value',
      },
      botToken: '123:abc',
      persistedSecret: 'persisted-secret',
    }),
    'smoke-secret',
  );
});

test('resolveTelegramSmokeWebhookSecret falls back to the persisted webhook secret', () => {
  assert.equal(
    resolveTelegramSmokeWebhookSecret({
      env: {
        JWT_SECRET: 'jwt-secret-value',
      },
      botToken: '123:abc',
      persistedSecret: 'persisted-secret',
    }),
    'persisted-secret',
  );
});

test('resolveTelegramSmokeWebhookSecret derives the legacy secret when only bot token and jwt secret exist', () => {
  const expectedSecret = deriveLegacyTelegramWebhookSecret('123:abc', 'jwt-secret-value');

  assert.equal(
    resolveTelegramSmokeWebhookSecret({
      env: {
        JWT_SECRET: 'jwt-secret-value',
      },
      botToken: '123:abc',
    }),
    expectedSecret,
  );
});

test('parseTelegramSmokeStoredConfig extracts the persisted secret from stored telegram settings', () => {
  assert.deepEqual(
    parseTelegramSmokeStoredConfig(
      JSON.stringify({
        botToken: '123:abc',
        webhookSecretToken: 'persisted-secret',
      }),
    ),
    {
      botToken: '123:abc',
      webhookSecretToken: 'persisted-secret',
    },
  );
});
