import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTelegramPromoDeliveryCandidates,
  resolveTelegramPromoAttribution,
} from '@/lib/services/telegram-attribution';

test('resolveTelegramPromoAttribution chooses the most recent matching promo delivery', () => {
  const deliveries = buildTelegramPromoDeliveryCandidates([
    {
      id: 'ann-1',
      title: 'Old promo',
      type: 'PROMO',
      audience: 'ACTIVE_USERS',
      templateId: null,
      templateName: 'Old template',
      targetSegment: 'TRIAL_TO_PAID',
      cardStyle: 'PROMO',
      deliveries: [
        {
          id: 'delivery-1',
          chatId: 'chat-1',
          status: 'SENT',
          sentAt: new Date('2026-04-01T08:00:00.000Z'),
        },
      ],
    },
    {
      id: 'ann-2',
      title: 'New promo',
      type: 'PROMO',
      audience: 'ACTIVE_USERS',
      templateId: null,
      templateName: 'New template',
      targetSegment: 'HIGH_VALUE',
      cardStyle: 'PROMO',
      deliveries: [
        {
          id: 'delivery-2',
          chatId: 'chat-1',
          status: 'SENT',
          sentAt: new Date('2026-04-02T08:00:00.000Z'),
        },
      ],
    },
  ]);

  const attribution = resolveTelegramPromoAttribution({
    chatId: 'chat-1',
    createdAt: new Date('2026-04-02T09:15:00.000Z'),
    deliveries,
  });

  assert.equal(attribution?.announcementId, 'ann-2');
  assert.equal(attribution?.deliveryId, 'delivery-2');
  assert.equal(attribution?.targetSegment, 'HIGH_VALUE');
});
