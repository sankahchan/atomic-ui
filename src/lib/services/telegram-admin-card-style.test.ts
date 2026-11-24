import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildTelegramAdminCardStyleKeyboard,
  buildTelegramAdminCardStylePromptMessage,
  buildTelegramAdminDirectMessagePromptMessage,
  formatTelegramAdminCardStyleLabel,
} from './telegram-admin-key-delivery';
import { buildTelegramAnnouncementMessage } from './telegram-announcements';
import { parseTelegramAdminKeyCallbackData } from './telegram-callbacks';

test('admin card style keyboard exposes every style and cancel', () => {
  const keyboard = buildTelegramAdminCardStyleKeyboard('en');
  const buttons = keyboard.inline_keyboard.flat();

  assert.equal(keyboard.inline_keyboard.length, 3);
  assert.deepEqual(
    buttons.map((button) => parseTelegramAdminKeyCallbackData(button.callback_data)?.action),
    ['card_style', 'card_style', 'card_style', 'card_style', 'cancel'],
  );
  assert.deepEqual(
    buttons.slice(0, 4).map((button) => parseTelegramAdminKeyCallbackData(button.callback_data)?.primary),
    ['DEFAULT', 'PROMO', 'PREMIUM', 'OPERATIONS'],
  );
});

test('card style labels and prompts are localized', () => {
  assert.equal(formatTelegramAdminCardStyleLabel('PROMO', 'my'), 'ပရိုမိုးရှင်း');
  assert.match(buildTelegramAdminCardStylePromptMessage({ locale: 'my', recipientLabel: 'မောင်' }), /ကတ်ပုံစံ/);
  const prompt = buildTelegramAdminDirectMessagePromptMessage({
    locale: 'en',
    recipientLabel: 'Maung',
    cardStyle: 'PREMIUM',
  });
  assert.match(prompt, /Card: <b>Premium<\/b>/);
});

test('announcement builder honors a custom heading and the chosen card style', () => {
  const message = buildTelegramAnnouncementMessage({
    type: 'ANNOUNCEMENT',
    title: 'Message from admin',
    message: 'Your key is ready.',
    cardStyle: 'OPERATIONS',
    heading: '📨 <b>Message from admin</b>',
  });

  assert.match(message, /📨 <b>Message from admin<\/b>/);
  assert.match(message, /━━━━━━━━━━━━ STATUS ━━━━━━━━━━━━━/);
  assert.match(message, /<b>Message from admin<\/b>/);
  assert.match(message, /Your key is ready\./);
  assert.doesNotMatch(message, /📣 <b>Announcement<\/b>/);
});
