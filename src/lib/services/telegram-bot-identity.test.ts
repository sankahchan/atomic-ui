import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildTelegramBotProfileUrl,
  formatTelegramBotUsername,
  normalizeTelegramBotUsernameHandle,
} from './telegram-bot-identity';

test('telegram bot username normalization accepts handles and t.me links', () => {
  assert.equal(normalizeTelegramBotUsernameHandle('@atomicui_bot'), 'atomicui_bot');
  assert.equal(normalizeTelegramBotUsernameHandle('atomicui_bot'), 'atomicui_bot');
  assert.equal(normalizeTelegramBotUsernameHandle('https://t.me/atomicui_bot'), 'atomicui_bot');
  assert.equal(normalizeTelegramBotUsernameHandle('telegram.me/atomicui_bot'), 'atomicui_bot');
});

test('telegram bot username normalization rejects unsafe values', () => {
  assert.equal(normalizeTelegramBotUsernameHandle('javascript:alert(1)'), '');
  assert.equal(normalizeTelegramBotUsernameHandle('"><img src=x onerror=alert(1)>'), '');
  assert.equal(normalizeTelegramBotUsernameHandle('tg://resolve?domain=atomicui_bot'), '');
});

test('telegram bot username helpers return canonical display values', () => {
  assert.equal(formatTelegramBotUsername('atomicui_bot'), '@atomicui_bot');
  assert.equal(buildTelegramBotProfileUrl('@atomicui_bot'), 'https://t.me/atomicui_bot');
  assert.equal(buildTelegramBotProfileUrl('not valid'), null);
});
