import assert from 'node:assert/strict';
import test from 'node:test';

import {
  maskTelegramBotSettingsForClient,
  parseTelegramBotSettingsValue,
  serializeTelegramBotSettingsValue,
  shouldRetainMaskedTelegramSecret,
  telegramBotSettingsNeedSecretMigration,
} from './telegram-bot-settings';

test('telegram bot settings serialize secrets in encrypted form and parse them back', () => {
  const serialized = serializeTelegramBotSettingsValue({
    botToken: 'bot-token-123',
    webhookSecretToken: 'webhook-secret-456',
    migrationPlan: {
      botToken: 'next-bot-token-789',
    },
    isEnabled: true,
  });

  assert.equal(serialized.includes('bot-token-123'), false);
  assert.equal(serialized.includes('webhook-secret-456'), false);
  assert.equal(serialized.includes('next-bot-token-789'), false);

  const parsed = parseTelegramBotSettingsValue(serialized);
  assert.equal(parsed?.botToken, 'bot-token-123');
  assert.equal(parsed?.webhookSecretToken, 'webhook-secret-456');
  assert.equal(parsed?.migrationPlan?.botToken, 'next-bot-token-789');
  assert.equal(parsed?.isEnabled, true);
});

test('telegram bot settings client payload masks the stored bot token', () => {
  const masked = maskTelegramBotSettingsForClient({
    botToken: 'bot-token-123',
    migrationPlan: {
      botToken: 'next-bot-token-789',
    },
    isEnabled: true,
  });

  assert.equal(masked.botToken, '********');
  assert.equal(masked.migrationPlan.botToken, '********');
});

test('telegram bot settings migration detects legacy plaintext secrets', () => {
  assert.equal(
    telegramBotSettingsNeedSecretMigration(
      JSON.stringify({
        botToken: 'legacy-plaintext-token',
        webhookSecretToken: 'legacy-secret',
        migrationPlan: {
          botToken: 'legacy-next-token',
        },
      }),
    ),
    true,
  );
});

test('telegram bot settings preserve masked secret placeholders on update', () => {
  assert.equal(shouldRetainMaskedTelegramSecret('********'), true);
  assert.equal(shouldRetainMaskedTelegramSecret('new-token'), false);
});

test('telegram bot settings fail closed when encrypted secrets cannot be decrypted', () => {
  const originalKey = process.env.SETTINGS_ENCRYPTION_KEY;

  try {
    process.env.SETTINGS_ENCRYPTION_KEY = 'a'.repeat(64);
    const serialized = serializeTelegramBotSettingsValue({
      botToken: 'bot-token-123',
      webhookSecretToken: 'webhook-secret-456',
      migrationPlan: {
        botToken: 'next-bot-token-789',
      },
      isEnabled: true,
    });

    process.env.SETTINGS_ENCRYPTION_KEY = 'b'.repeat(64);
    const parsed = parseTelegramBotSettingsValue(serialized);

    assert.equal(parsed?.botToken, '');
    assert.equal(parsed?.webhookSecretToken, '');
    assert.equal(parsed?.migrationPlan?.botToken, '');
  } finally {
    if (originalKey === undefined) {
      delete process.env.SETTINGS_ENCRYPTION_KEY;
    } else {
      process.env.SETTINGS_ENCRYPTION_KEY = originalKey;
    }
  }
});
