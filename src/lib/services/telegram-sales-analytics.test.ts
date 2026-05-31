import assert from 'node:assert/strict';
import test from 'node:test';

import { buildTelegramSalesFunnel } from './telegram-sales-analytics';

test('telegram sales funnel counts one coherent new-user cohort', () => {
  const funnel = buildTelegramSalesFunnel(
    [
      { telegramUserId: 'new-user-1', telegramChatId: 'new-chat-1' },
      { telegramUserId: 'new-user-2', telegramChatId: 'new-chat-2' },
    ],
    [
      {
        telegramUserId: 'new-user-1',
        telegramChatId: 'new-chat-1',
        status: 'AWAITING_PAYMENT_METHOD',
      },
      {
        telegramUserId: 'new-user-1',
        telegramChatId: 'new-chat-1',
        status: 'FULFILLED',
        paymentMethodCode: 'kbz',
        paymentSubmittedAt: new Date('2026-05-01T10:00:00.000Z'),
        reviewedAt: new Date('2026-05-01T10:05:00.000Z'),
        fulfilledAt: new Date('2026-05-01T10:08:00.000Z'),
      },
      {
        telegramUserId: 'new-user-2',
        telegramChatId: 'new-chat-2',
        status: 'PENDING_REVIEW',
        paymentMethodLabel: 'WavePay',
        paymentSubmittedAt: new Date('2026-05-01T10:10:00.000Z'),
      },
      {
        telegramUserId: 'returning-user',
        telegramChatId: 'returning-chat',
        status: 'FULFILLED',
        paymentMethodCode: 'cash',
        paymentSubmittedAt: new Date('2026-05-01T10:20:00.000Z'),
        reviewedAt: new Date('2026-05-01T10:25:00.000Z'),
        fulfilledAt: new Date('2026-05-01T10:30:00.000Z'),
      },
    ],
  );

  assert.deepEqual(funnel, {
    botStarted: 2,
    created: 2,
    paymentMethodSelected: 2,
    proofUploaded: 2,
    reviewed: 1,
    fulfilled: 1,
  });
});

test('telegram sales funnel matches orders by chat id fallback', () => {
  const funnel = buildTelegramSalesFunnel(
    [{ telegramUserId: 'new-user-1', telegramChatId: 'new-chat-1' }],
    [
      {
        telegramUserId: null,
        telegramChatId: 'new-chat-1',
        status: 'FULFILLED',
        fulfilledAt: new Date('2026-05-01T10:08:00.000Z'),
      },
    ],
  );

  assert.deepEqual(funnel, {
    botStarted: 1,
    created: 1,
    paymentMethodSelected: 0,
    proofUploaded: 1,
    reviewed: 1,
    fulfilled: 1,
  });
});
