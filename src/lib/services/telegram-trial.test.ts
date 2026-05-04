import assert from 'node:assert/strict';
import test from 'node:test';

import { parseTelegramMenuCallbackData } from '@/lib/services/telegram-callbacks';
import { validateTelegramHtmlMessage } from '@/lib/services/telegram-message-validation';
import {
  buildTelegramTrialActivatedMessage,
  buildTelegramTrialOfferKeyboard,
  buildTelegramTrialOfferMessage,
} from '@/lib/services/telegram-trial';

test('telegram trial offer message stays compact and HTML-safe', () => {
  const message = buildTelegramTrialOfferMessage({
    locale: 'en',
    firstName: 'Trial User',
  });

  assert.deepEqual(validateTelegramHtmlMessage(message), { valid: true, invalidTags: [] });
  assert.match(message, /FREE 2-day trial/);
  assert.match(message, /5 GB/);
  assert.ok(message.split('\n').length <= 12);
});

test('telegram trial activated message stays HTML-safe', () => {
  const message = buildTelegramTrialActivatedMessage({
    locale: 'en',
    firstName: 'Trial User',
    outlineKey: 'ss://example-key',
    expiresAt: new Date('2026-05-07T09:00:00.000Z'),
  });

  assert.deepEqual(validateTelegramHtmlMessage(message), { valid: true, invalidTags: [] });
  assert.match(message, /Trial Activated/);
  assert.match(message, /ss:\/\/example-key/);
  assert.match(message, /5 GB/);
});

test('telegram trial keyboard uses trial callback actions', () => {
  const keyboard = buildTelegramTrialOfferKeyboard('en');
  const claim = keyboard.inline_keyboard[0]?.[0]?.callback_data ?? null;
  const back = keyboard.inline_keyboard[1]?.[0]?.callback_data ?? null;

  assert.deepEqual(parseTelegramMenuCallbackData(claim), {
    section: 'trial',
    action: 'claim',
  });
  assert.deepEqual(parseTelegramMenuCallbackData(back), {
    section: 'trial',
    action: 'back_main',
  });
});
