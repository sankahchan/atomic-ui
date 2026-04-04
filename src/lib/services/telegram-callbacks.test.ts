import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTelegramOrderReviewCallbackData,
  getCommandKeyboard,
  normalizeTelegramReplyKeyboardCommand,
  parseTelegramOrderReviewCallbackData,
  resolveTelegramRetentionSourceFromRenewAction,
} from '@/lib/services/telegram-callbacks';

test('getCommandKeyboard renders localized customer labels', () => {
  const english = getCommandKeyboard(false, 'en');
  const myanmar = getCommandKeyboard(false, 'my');

  assert.equal(english.keyboard[0]?.[0]?.text, '🛒 Buy key');
  assert.equal(english.keyboard[0]?.[1]?.text, '🗂 My keys');
  assert.equal(english.keyboard[1]?.[0]?.text, '🎟 Offers');
  assert.equal(myanmar.keyboard[0]?.[0]?.text, '🛒 Key ဝယ်မည်');
  assert.equal(myanmar.keyboard[0]?.[1]?.text, '🗂 Key များ');
  assert.equal(myanmar.keyboard[1]?.[0]?.text, '🎟 Offer များ');
});

test('normalizeTelegramReplyKeyboardCommand maps localized shortcut labels back to commands', () => {
  assert.equal(normalizeTelegramReplyKeyboardCommand('🛒 Buy key', false), '/buy');
  assert.equal(normalizeTelegramReplyKeyboardCommand('🗂 Key များ', false), '/mykeys');
  assert.equal(normalizeTelegramReplyKeyboardCommand('🎟 Offers', false), '/offers');
  assert.equal(normalizeTelegramReplyKeyboardCommand('🌐 Language', false), '/language');
  assert.equal(normalizeTelegramReplyKeyboardCommand('🛑 Cancel', false), '/cancel');
});

test('normalizeTelegramReplyKeyboardCommand keeps admin labels admin-only', () => {
  assert.equal(normalizeTelegramReplyKeyboardCommand('🧭 Admin home', false), null);
  assert.equal(normalizeTelegramReplyKeyboardCommand('📢 Broadcasts', false), null);
  assert.equal(normalizeTelegramReplyKeyboardCommand('🧭 Admin home', true), '/admin');
  assert.equal(normalizeTelegramReplyKeyboardCommand('📋 Review queue', true), '/reviewqueue');
  assert.equal(normalizeTelegramReplyKeyboardCommand('📢 Broadcasts', true), '/announcements');
});

test('telegram order review callbacks support quick reject presets', () => {
  const data = buildTelegramOrderReviewCallbackData('reject_duplicate', 'ord_123');
  assert.deepEqual(parseTelegramOrderReviewCallbackData(data), {
    action: 'reject_duplicate',
    orderId: 'ord_123',
  });

  assert.deepEqual(
    parseTelegramOrderReviewCallbackData(
      buildTelegramOrderReviewCallbackData('reject_blurry', 'ord_456'),
    ),
    {
      action: 'reject_blurry',
      orderId: 'ord_456',
    },
  );

  assert.deepEqual(
    parseTelegramOrderReviewCallbackData(
      buildTelegramOrderReviewCallbackData('reject_wrong_amount', 'ord_789'),
    ),
    {
      action: 'reject_wrong_amount',
      orderId: 'ord_789',
    },
  );
});

test('resolveTelegramRetentionSourceFromRenewAction supports dynamic coupon renewals', () => {
  assert.equal(
    resolveTelegramRetentionSourceFromRenewAction('dynamic_renewal_coupon'),
    'renewal_coupon',
  );
});
