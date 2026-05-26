import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTelegramOrderActionKeyboard,
  buildTelegramServerChangeRequestKeyboard,
  buildTelegramServerChangeSupportKeyboard,
  buildTelegramSalesPaymentPrompt,
} from '@/lib/services/telegram-bot-core';
import {
  buildTelegramCommerceViewCallbackData,
  buildTelegramMenuCallbackData,
  buildTelegramOrderActionCallbackData,
  buildTelegramServerChangeActionCallbackData,
} from '@/lib/services/telegram-callbacks';

test('order action keyboard keeps proof and review states actionable without dead-end rows', () => {
  const awaitingProof = buildTelegramOrderActionKeyboard({
    order: {
      id: 'ord_proof',
      status: 'AWAITING_PAYMENT_PROOF',
      paymentMethodCode: 'kbzpay',
    },
    locale: 'en',
    supportLink: 'https://t.me/example_support',
  });

  assert.equal(awaitingProof?.inline_keyboard[0]?.[0]?.text, 'Payment guide');
  assert.equal(
    awaitingProof?.inline_keyboard[0]?.[0]?.callback_data,
    buildTelegramOrderActionCallbackData('up', 'ord_proof'),
  );
  assert.equal(awaitingProof?.inline_keyboard[0]?.[1]?.text, 'Switch payment method');
  assert.equal(awaitingProof?.inline_keyboard[1]?.[0]?.text, 'Check status');
  assert.equal(awaitingProof?.inline_keyboard[1]?.[1]?.text, 'Support');
  assert.equal(awaitingProof?.inline_keyboard[2]?.[0]?.text, '🧾 Orders');
  assert.equal(
    awaitingProof?.inline_keyboard[2]?.[0]?.callback_data,
    buildTelegramMenuCallbackData('orders', 'action'),
  );
  assert.equal(awaitingProof?.inline_keyboard[3]?.[0]?.text, 'Cancel order');

  const pendingReview = buildTelegramOrderActionKeyboard({
    order: {
      id: 'ord_review',
      status: 'PENDING_REVIEW',
      paymentMethodCode: 'kbzpay',
    },
    locale: 'en',
    supportLink: 'https://t.me/example_support',
  });

  assert.equal(pendingReview?.inline_keyboard[0]?.[0]?.text, 'Check status');
  assert.equal(pendingReview?.inline_keyboard[0]?.[1]?.text, 'Resend proof');
  assert.equal(
    pendingReview?.inline_keyboard[0]?.[1]?.callback_data,
    buildTelegramOrderActionCallbackData('up', 'ord_review'),
  );
  assert.equal(pendingReview?.inline_keyboard[1]?.[0]?.text, 'Payment guide');
  assert.equal(pendingReview?.inline_keyboard[1]?.[1]?.text, 'Support');
  assert.equal(pendingReview?.inline_keyboard[2]?.[0]?.text, '🧾 Orders');
  assert.equal(pendingReview?.inline_keyboard[3]?.[0]?.text, 'Cancel order');
});

test('payment prompt adds state-aware proof guidance for waiting and review states', () => {
  const awaitingProof = buildTelegramSalesPaymentPrompt({
    locale: 'en',
    orderCode: 'ORD-123',
    orderStatus: 'AWAITING_PAYMENT_PROOF',
    planSummary: 'Premium / 1 Month / 200 GB',
    paymentInstructions: 'Transfer first, then send the screenshot.',
    paymentMethodLabel: 'KBZPay',
    supportLink: 'https://t.me/example_support',
  });

  assert.match(awaitingProof, /After you send the screenshot, use Check status below/);

  const pendingReview = buildTelegramSalesPaymentPrompt({
    locale: 'en',
    orderCode: 'ORD-456',
    orderStatus: 'PENDING_REVIEW',
    planSummary: 'Premium / 1 Month / 200 GB',
    paymentInstructions: 'Transfer first, then send the screenshot.',
    paymentMethodLabel: 'KBZPay',
    supportLink: 'https://t.me/example_support',
  });

  assert.match(pendingReview, /Review has started\. Use Check status for updates/);
  assert.match(pendingReview, /Need help\?/);
});

test('server-change request keyboards keep pending and rejected requests actionable', () => {
  const pending = buildTelegramServerChangeRequestKeyboard({
    requestId: 'req_pending',
    locale: 'en',
    status: 'PENDING_REVIEW',
    accessKeyId: 'key_1',
    supportLink: 'https://t.me/example_support',
  });

  assert.equal(pending.inline_keyboard[0]?.[0]?.text, 'Check status');
  assert.equal(
    pending.inline_keyboard[0]?.[0]?.callback_data,
    buildTelegramServerChangeActionCallbackData('st', 'req_pending'),
  );
  assert.equal(pending.inline_keyboard[0]?.[1]?.text, 'Support');
  assert.equal(pending.inline_keyboard[1]?.[0]?.text, '🗂 My Keys');
  assert.equal(
    pending.inline_keyboard[1]?.[0]?.callback_data,
    buildTelegramCommerceViewCallbackData('keys', 'home', '1'),
  );

  const rejected = buildTelegramServerChangeRequestKeyboard({
    requestId: 'req_rejected',
    locale: 'en',
    status: 'REJECTED',
    accessKeyId: 'key_2',
    supportLink: 'https://t.me/example_support',
    canRetry: true,
  });

  assert.equal(rejected.inline_keyboard[0]?.[0]?.text, '🔁 Try another server');
  assert.equal(
    rejected.inline_keyboard[0]?.[0]?.callback_data,
    buildTelegramServerChangeActionCallbackData('ky', 'key_2'),
  );
  assert.equal(rejected.inline_keyboard[0]?.[1]?.text, 'Support');
  assert.equal(rejected.inline_keyboard[1]?.[0]?.text, '🗂 My Keys');
  assert.equal(rejected.inline_keyboard[1]?.[1]?.text, 'Buy new key');
});

test('server-change fallback keyboard offers my-keys and purchase exits', () => {
  const keyboard = buildTelegramServerChangeSupportKeyboard('en', 'https://t.me/example_support');

  assert.equal(keyboard.inline_keyboard[0]?.[0]?.text, '🗂 My Keys');
  assert.equal(
    keyboard.inline_keyboard[0]?.[0]?.callback_data,
    buildTelegramCommerceViewCallbackData('keys', 'home', '1'),
  );
  assert.equal(keyboard.inline_keyboard[0]?.[1]?.text, 'Buy new key');
  assert.equal(
    keyboard.inline_keyboard[0]?.[1]?.callback_data,
    buildTelegramOrderActionCallbackData('by', 'server-change'),
  );
  assert.equal(keyboard.inline_keyboard[1]?.[0]?.text, 'Support');
});
