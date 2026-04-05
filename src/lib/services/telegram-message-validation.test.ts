import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTelegramHelpMessage } from '@/lib/services/telegram-admin';
import {
  findUnsupportedTelegramHtmlTags,
  normalizeTelegramUtf8Text,
  sanitizeTelegramHtmlMessage,
  validateTelegramHtmlMessage,
} from '@/lib/services/telegram-message-validation';
import { getTelegramUi } from '@/lib/services/telegram-ui';

test('telegram HTML validator accepts supported tags', () => {
  const message = '<b>Hello</b>\n<a href="https://example.com">Open</a>\n<code>ABC</code>';
  assert.deepEqual(findUnsupportedTelegramHtmlTags(message), []);
  assert.deepEqual(validateTelegramHtmlMessage(message), { valid: true, invalidTags: [] });
});

test('telegram HTML validator flags unsupported placeholder tags', () => {
  const message = 'Usage: /order <order-code>';
  assert.deepEqual(findUnsupportedTelegramHtmlTags(message), ['order-code']);
  assert.deepEqual(validateTelegramHtmlMessage(message), {
    valid: false,
    invalidTags: ['order-code'],
  });
});

test('telegram HTML sanitizer escapes unsupported placeholder tags but keeps supported tags', () => {
  const message = 'Usage: <b>/order</b> <order-code>';
  const sanitized = sanitizeTelegramHtmlMessage(message);

  assert.equal(sanitized.changed, true);
  assert.deepEqual(sanitized.invalidTags, ['order-code']);
  assert.equal(sanitized.text, 'Usage: <b>/order</b> &lt;order-code&gt;');
});

test('telegram UTF-8 normalizer strips lone surrogates and control bytes', () => {
  const dirty = `Hello\u0000 world \ud800test\u0007`;
  const normalized = normalizeTelegramUtf8Text(dirty);

  assert.equal(normalized.changed, true);
  assert.equal(normalized.text, 'Hello world test');
});

test('telegram HTML sanitizer removes invalid UTF-8/control characters', () => {
  const sanitized = sanitizeTelegramHtmlMessage('A\u0000<b>ok</b>\ud800');

  assert.equal(sanitized.changed, true);
  assert.equal(sanitized.invalidCharactersRemoved, true);
  assert.equal(sanitized.text, 'A<b>ok</b>');
});

test('telegram help message stays valid HTML for user and admin variants', () => {
  const userHelp = buildTelegramHelpMessage({ isAdmin: false, locale: 'en' });
  const adminHelp = buildTelegramHelpMessage({ isAdmin: true, locale: 'en' });

  assert.deepEqual(validateTelegramHtmlMessage(userHelp), { valid: true, invalidTags: [] });
  assert.deepEqual(validateTelegramHtmlMessage(adminHelp), { valid: true, invalidTags: [] });
});

test('telegram usage and status hint strings stay HTML-safe', () => {
  const ui = getTelegramUi('en');
  const samples = [
    ui.orderStatusUsage,
    ui.findUsage,
    ui.enableUsage,
    ui.disableUsage,
    ui.resendUsage,
    ui.helpTitle,
  ];

  for (const sample of samples) {
    assert.deepEqual(validateTelegramHtmlMessage(sample), { valid: true, invalidTags: [] });
  }
});
