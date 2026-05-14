import assert from 'node:assert/strict';
import test from 'node:test';

import { parseTelegramMenuCallbackData } from '@/lib/services/telegram-callbacks';
import { validateTelegramHtmlMessage } from '@/lib/services/telegram-message-validation';
import {
  buildTelegramTrialActivatedMessage,
  buildTelegramTrialActivatedKeyboard,
  buildTelegramTrialOfferKeyboard,
  buildTelegramTrialOfferMessage,
} from '@/lib/services/telegram-trial';
import { parseTelegramStorefrontCallbackData } from '@/lib/services/telegram-storefront';

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

test('telegram trial activated message uses the new MarkdownV2 storefront layout', () => {
  const message = buildTelegramTrialActivatedMessage({
    locale: 'en',
    firstName: 'Trial User',
    outlineKey: 'ss://example-key',
    expiresAt: new Date('2026-05-07T09:00:00.000Z'),
  });

  assert.match(message, /Trial Activated/);
  assert.match(message, /ss:\/\/example-key/);
  assert.match(message, /5 GB/);
  assert.match(message, /Tap Setup Guide to connect in 2 minutes/);
});

test('telegram trial screens localize Burmese copy', () => {
  const message = buildTelegramTrialActivatedMessage({
    locale: 'my',
    firstName: 'Trial User',
    outlineKey: 'ss://example-key',
    expiresAt: new Date('2026-05-07T09:00:00.000Z'),
  });

  assert.match(message, /Trial စတင်ပြီးပါပြီ/);
  assert.match(message, /သင်၏ Access Key/);
  assert.match(message, /Setup Guide ကိုနှိပ်ပြီး ၂ မိနစ်အတွင်း ချိတ်ဆက်ပါ/);

  const keyboard = buildTelegramTrialActivatedKeyboard({
    locale: 'my',
    keyId: 'key_123',
  });
  assert.equal(keyboard.inline_keyboard[3]?.[0]?.text, '🛒 Full Plan ဝယ်မည်');
  assert.equal(keyboard.inline_keyboard[4]?.[1]?.text, '💬 အကူအညီ');
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

test('telegram trial activated keyboard opens setup guide and paid storefront actions', () => {
  const keyboard = buildTelegramTrialActivatedKeyboard({
    locale: 'en',
    keyId: 'key_123',
  });

  assert.deepEqual(
    parseTelegramStorefrontCallbackData(keyboard.inline_keyboard[0]?.[0]?.callback_data ?? null),
    { action: 'platform_select', keyId: 'key_123' },
  );
  assert.deepEqual(
    parseTelegramStorefrontCallbackData(keyboard.inline_keyboard[1]?.[0]?.callback_data ?? null),
    { action: 'guide_platform', keyId: 'key_123', platform: 'android' },
  );
  assert.deepEqual(
    parseTelegramStorefrontCallbackData(keyboard.inline_keyboard[2]?.[1]?.callback_data ?? null),
    { action: 'guide_platform', keyId: 'key_123', platform: 'macos' },
  );
  assert.deepEqual(
    parseTelegramStorefrontCallbackData(keyboard.inline_keyboard[3]?.[0]?.callback_data ?? null),
    { action: 'show_plans' },
  );
});
