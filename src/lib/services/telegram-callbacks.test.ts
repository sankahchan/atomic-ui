import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getCommandKeyboard,
  normalizeTelegramReplyKeyboardCommand,
} from '@/lib/services/telegram-callbacks';

test('getCommandKeyboard renders localized customer labels', () => {
  const english = getCommandKeyboard(false, 'en');
  const myanmar = getCommandKeyboard(false, 'my');

  assert.equal(english.keyboard[0]?.[0]?.text, '🛒 Buy key');
  assert.equal(english.keyboard[0]?.[1]?.text, '🗂 My keys');
  assert.equal(myanmar.keyboard[0]?.[0]?.text, '🛒 Key ဝယ်မည်');
  assert.equal(myanmar.keyboard[0]?.[1]?.text, '🗂 Key များ');
});

test('normalizeTelegramReplyKeyboardCommand maps localized shortcut labels back to commands', () => {
  assert.equal(normalizeTelegramReplyKeyboardCommand('🛒 Buy key', false), '/buy');
  assert.equal(normalizeTelegramReplyKeyboardCommand('🗂 Key များ', false), '/mykeys');
  assert.equal(normalizeTelegramReplyKeyboardCommand('🌐 Language', false), '/language');
  assert.equal(normalizeTelegramReplyKeyboardCommand('🛑 Cancel', false), '/cancel');
});

test('normalizeTelegramReplyKeyboardCommand keeps admin labels admin-only', () => {
  assert.equal(normalizeTelegramReplyKeyboardCommand('📢 Broadcasts', false), null);
  assert.equal(normalizeTelegramReplyKeyboardCommand('📢 Broadcasts', true), '/announcements');
});
