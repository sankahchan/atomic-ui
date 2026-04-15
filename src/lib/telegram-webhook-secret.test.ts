import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deriveLegacyTelegramWebhookSecret,
  resolveTelegramWebhookSecret,
} from './telegram-webhook-secret';

test('resolveTelegramWebhookSecret prefers an explicit configured secret', () => {
  assert.equal(
    resolveTelegramWebhookSecret({
      botToken: '123:abc',
      jwtSecret: 'jwt-secret-value',
      configuredSecret: ' configured-secret ',
      persistedSecret: 'persisted-secret',
    }),
    'configured-secret',
  );
});

test('resolveTelegramWebhookSecret prefers a persisted secret over the legacy derived secret', () => {
  assert.equal(
    resolveTelegramWebhookSecret({
      botToken: '123:abc',
      jwtSecret: 'new-jwt-secret',
      persistedSecret: 'persisted-secret',
    }),
    'persisted-secret',
  );
});

test('resolveTelegramWebhookSecret falls back to the legacy JWT-derived secret', () => {
  const legacySecret = deriveLegacyTelegramWebhookSecret('123:abc', 'jwt-secret-value');

  assert.equal(
    resolveTelegramWebhookSecret({
      botToken: '123:abc',
      jwtSecret: 'jwt-secret-value',
    }),
    legacySecret,
  );
});
