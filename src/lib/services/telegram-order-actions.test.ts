import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTelegramOrderActionKeyboard,
  buildTelegramSalesPaymentPrompt,
} from '@/lib/services/telegram-bot-core';
import {
  buildTelegramMenuCallbackData,
  buildTelegramOrderActionCallbackData,
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
