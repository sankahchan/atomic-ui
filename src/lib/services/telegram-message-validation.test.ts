import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTelegramHelpMessage } from '@/lib/services/telegram-admin';
import {
  findUnsupportedTelegramHtmlTags,
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
