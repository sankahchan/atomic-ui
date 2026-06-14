import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TELEGRAM_SUPPORT_FIRST_RESPONSE_SLA_MS,
  buildCustomerSubmittedTelegramSupportThreadWhere,
  resolveTelegramSupportFirstResponseDueAt,
} from '@/lib/services/telegram-support-data';

test('resolveTelegramSupportFirstResponseDueAt starts the SLA when the first customer reply arrives', () => {
  const now = new Date('2026-06-14T12:00:00.000Z');

  const dueAt = resolveTelegramSupportFirstResponseDueAt({
    senderType: 'CUSTOMER',
    existingFirstResponseDueAt: null,
    existingFirstAdminReplyAt: null,
    now,
  });

  assert.ok(dueAt instanceof Date);
  assert.equal(
    dueAt?.toISOString(),
    new Date(now.getTime() + TELEGRAM_SUPPORT_FIRST_RESPONSE_SLA_MS).toISOString(),
  );
});

test('resolveTelegramSupportFirstResponseDueAt does not restart the SLA for follow-ups or admin replies', () => {
  const existingDueAt = new Date('2026-06-14T14:00:00.000Z');

  assert.equal(
    resolveTelegramSupportFirstResponseDueAt({
      senderType: 'CUSTOMER',
      existingFirstResponseDueAt: existingDueAt,
      existingFirstAdminReplyAt: null,
      now: new Date('2026-06-14T13:00:00.000Z'),
    }),
    undefined,
  );

  assert.equal(
    resolveTelegramSupportFirstResponseDueAt({
      senderType: 'ADMIN',
      existingFirstResponseDueAt: null,
      existingFirstAdminReplyAt: null,
      now: new Date('2026-06-14T13:00:00.000Z'),
    }),
    undefined,
  );
});

test('buildCustomerSubmittedTelegramSupportThreadWhere requires a customer reply', () => {
  assert.deepEqual(
    buildCustomerSubmittedTelegramSupportThreadWhere({
      status: {
        in: ['OPEN', 'ESCALATED'],
      },
    }),
    {
      AND: [
        {
          status: {
            in: ['OPEN', 'ESCALATED'],
          },
        },
        {
          replies: {
            some: {
              senderType: 'CUSTOMER',
            },
          },
        },
      ],
    },
  );
});
