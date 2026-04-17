import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTelegramBuySummaryMessage } from '@/lib/services/telegram-order-state';
import { buildTelegramKeysSummaryMessage } from '@/lib/services/telegram-keys';
import { buildTelegramPremiumHubMessage } from '@/lib/services/telegram-premium';
import { buildTelegramOrdersSummaryMessage } from '@/lib/services/telegram-orders';

const samplePlans = [
  {
    code: '1m_150gb',
    enabled: true,
    label: '1 Month / 150 GB',
    localizedLabels: { my: '၁ လ / 150 GB' },
    priceAmount: 5000,
    priceCurrency: 'MMK',
    priceLabel: '',
    localizedPriceLabels: {},
    deliveryType: 'ACCESS_KEY',
    templateId: null,
    dynamicTemplateId: null,
    fixedDurationDays: null,
    fixedDurationMonths: 1,
    minDurationMonths: null,
    dataLimitGB: 150,
    unlimitedQuota: false,
  },
  {
    code: 'premium_1m_200gb',
    enabled: true,
    label: 'Premium / 1 Month / 200 GB',
    localizedLabels: { my: 'Premium / ၁ လ / 200 GB' },
    priceAmount: 6000,
    priceCurrency: 'MMK',
    priceLabel: '',
    localizedPriceLabels: {},
    deliveryType: 'DYNAMIC_KEY',
    templateId: null,
    dynamicTemplateId: null,
    fixedDurationDays: null,
    fixedDurationMonths: 1,
    minDurationMonths: null,
    dataLimitGB: 200,
    unlimitedQuota: false,
  },
  {
    code: 'trial_1d_3gb',
    enabled: true,
    label: 'Free Trial / 1 Day / 3 GB',
    localizedLabels: { my: 'Free Trial / ၁ ရက် / 3 GB' },
    priceAmount: 0,
    priceCurrency: 'MMK',
    priceLabel: 'Free Trial',
    localizedPriceLabels: { en: 'Free Trial', my: 'အခမဲ့ အစမ်းသုံး' },
    deliveryType: 'ACCESS_KEY',
    templateId: null,
    dynamicTemplateId: null,
    fixedDurationDays: 1,
    fixedDurationMonths: null,
    minDurationMonths: null,
    dataLimitGB: 3,
    unlimitedQuota: false,
  },
] as const;

test('buy summary stays concise in english and removes legacy essay text', () => {
  const message = buildTelegramBuySummaryMessage({
    locale: 'en',
    order: {
      id: 'ord_1',
      orderCode: 'ORD-123',
      couponCode: 'HELLO',
      referralCode: 'REF123',
      orderMode: 'SELF',
      giftRecipientLabel: null,
    },
    plans: samplePlans as any,
    page: 1,
    activeOfferCount: 1,
    couponHintLines: ['Coupon ready'],
  });

  assert.match(message, /1\.\s+🔑/);
  assert.match(message, /2\.\s+💎/);
  assert.doesNotMatch(message, /How buying works/);
  assert.doesNotMatch(message, /Compare your options/);
  assert.doesNotMatch(message, /https?:\/\//);
});

test('buy summary preserves concise numbering in myanmar locale', () => {
  const message = buildTelegramBuySummaryMessage({
    locale: 'my',
    order: {
      id: 'ord_1',
      orderCode: 'ORD-123',
      couponCode: null,
      referralCode: null,
      orderMode: 'SELF',
      giftRecipientLabel: null,
    },
    plans: samplePlans as any,
    page: 1,
    activeOfferCount: 0,
    couponHintLines: [],
  });

  assert.match(message, /1\.\s+🔑/);
  assert.match(message, /2\.\s+💎/);
  assert.doesNotMatch(message, /How buying works/);
});

test('my keys summary omits raw urls and latest reply dumps', () => {
  const message = buildTelegramKeysSummaryMessage({
    locale: 'en',
    counts: { standard: 1, trial: 0, premium: 1 },
    page: 1,
    items: [
      {
        id: 'key_1',
        kind: 'standard',
        name: 'Normal access',
        status: 'ACTIVE',
        sharePageUrl: 'https://share.example/key_1',
        quotaSummary: '0 B / 150 GB',
        expirationSummary: '30 day(s) left',
        summaryLine: '🟢 ACTIVE • SG-2 🇸🇬',
        detailLines: ['Quota: 0 B / 150 GB'],
        renewSecondary: null,
        latestPremiumRequestId: null,
      },
      {
        id: 'dak_1',
        kind: 'premium',
        name: 'Premium route',
        status: 'ACTIVE',
        sharePageUrl: 'https://share.example/dak_1',
        quotaSummary: '0 B / 200 GB',
        expirationSummary: '30 day(s) left',
        summaryLine: '🟢 ACTIVE • SG-2 🇸🇬',
        detailLines: ['Thread: PRM-123'],
        renewSecondary: 'dynamic',
        latestPremiumRequestId: 'req_1',
      },
    ],
  });

  assert.match(message, /standard • 0 trial • 1 premium/);
  assert.doesNotMatch(message, /https?:\/\//);
  assert.doesNotMatch(message, /Latest reply/i);
});

test('premium hub summary keeps links out of the text body', () => {
  const message = buildTelegramPremiumHubMessage({
    locale: 'en',
    requestCount: 1,
    page: 1,
    items: [
      {
        id: 'dak_1',
        name: 'Onn',
        sharePageUrl: 'https://share.example/onn',
        poolSummary: '1 preferred server',
        currentRouteLabel: 'SG-2 🇸🇬',
        preferredRegions: ['SG'],
        summaryLine: 'Overall: Healthy',
        latestRequestId: 'req_1',
        latestRequestCode: 'PRM-123',
        latestRequestState: 'Waiting for admin',
      },
    ],
  });

  assert.match(message, /Premium center/);
  assert.doesNotMatch(message, /https?:\/\//);
  assert.doesNotMatch(message, /Latest reply/i);
});

test('orders summary keeps timeline and next-step detail out of the list view', () => {
  const message = buildTelegramOrdersSummaryMessage({
    locale: 'en',
    filter: 'ALL',
    page: 1,
    attentionOrders: [
      {
        id: 'ord_1',
        orderCode: 'ORD-1',
        kind: 'NEW',
        status: 'REJECTED',
        planName: 'Premium / 1 Month / 200 GB',
        planCode: 'premium_1m_200gb',
        durationMonths: 1,
        durationDays: null,
        requestedName: 'Two',
      },
    ] as any,
    reviewOrders: [],
    completedOrders: [
      {
        id: 'ord_2',
        orderCode: 'ORD-2',
        kind: 'NEW',
        status: 'FULFILLED',
        planName: 'Free Trial / 1 Day / 3 GB',
        planCode: 'trial_1d_3gb',
        durationMonths: null,
        durationDays: 1,
        requestedName: 'One',
      },
    ] as any,
    filteredOrders: [
      {
        id: 'ord_1',
        orderCode: 'ORD-1',
        kind: 'NEW',
        status: 'REJECTED',
        planName: 'Premium / 1 Month / 200 GB',
        planCode: 'premium_1m_200gb',
        durationMonths: 1,
        durationDays: null,
        requestedName: 'Two',
      },
      {
        id: 'ord_2',
        orderCode: 'ORD-2',
        kind: 'NEW',
        status: 'FULFILLED',
        planName: 'Free Trial / 1 Day / 3 GB',
        planCode: 'trial_1d_3gb',
        durationMonths: null,
        durationDays: 1,
        requestedName: 'One',
      },
    ] as any,
  });

  assert.doesNotMatch(message, /#ORD-1/);
  assert.doesNotMatch(message, /\[Created\]/);
  assert.doesNotMatch(message, /Next step:/);
  assert.match(message, /Premium \/ 1 Month \/ 200 GB • 1m • Two/);
  assert.match(message, /Flow ended • restart available/);
  assert.match(message, /Step 4\/4 • Delivered/);
});
