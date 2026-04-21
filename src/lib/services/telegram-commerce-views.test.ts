import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTelegramBuySummaryMessage,
  buildTelegramRenewSummaryMessage,
} from '@/lib/services/telegram-order-state';
import { buildTelegramInboxSummaryMessage } from '@/lib/services/telegram-inbox-ui';
import { buildTelegramKeysSummaryMessage } from '@/lib/services/telegram-keys';
import { buildTelegramPremiumHubMessage } from '@/lib/services/telegram-premium';
import { buildTelegramOrdersSummaryMessage } from '@/lib/services/telegram-orders';
import { buildTelegramSupportStatusSummaryMessage } from '@/lib/services/telegram-support-cards';

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

test('my keys summary stays compact and omits raw urls and latest reply dumps', () => {
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

  assert.match(message, /1 standard • 1 premium/);
  assert.doesNotMatch(message, /Standard key/);
  assert.doesNotMatch(message, /Premium key/);
  assert.match(message, /Quota: 0 B \/ 150 GB • 30 day\(s\) left/);
  assert.doesNotMatch(message, /https?:\/\//);
  assert.doesNotMatch(message, /Latest reply/i);
  assert.ok(message.split('\n').length < 16);
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
      {
        id: 'ord_3',
        orderCode: 'ORD-3',
        kind: 'NEW',
        status: 'AWAITING_PLAN',
        planName: null,
        planCode: null,
        durationMonths: null,
        durationDays: null,
        requestedName: null,
      },
    ] as any,
  });

  assert.doesNotMatch(message, /#ORD-1/);
  assert.doesNotMatch(message, /#ORD-3/);
  assert.doesNotMatch(message, /\[Created\]/);
  assert.doesNotMatch(message, /Next step:/);
  assert.doesNotMatch(message, /Use \/order ORDER-CODE/);
  assert.match(message, /Premium \/ 1 Month \/ 200 GB • 1m • Two/);
  assert.match(message, /Status: Awaiting plan selection/);
  assert.match(message, /\nNew\nStatus: Awaiting plan selection/);
  assert.match(message, /Flow ended • restart available/);
  assert.match(message, /Step 4\/4 • Delivered/);
});

test('renew summary stays compact and removes repeated key-type copy', () => {
  const message = buildTelegramRenewSummaryMessage({
    locale: 'en',
    orderCode: 'ORD-RENEW',
    page: 1,
    keys: [
      {
        id: 'key_1',
        name: 'Ninety',
        kind: 'access',
        status: 'ACTIVE',
        expirationSummary: '73 day(s) left (6/29/2026)',
        serverLabel: 'SG-2 🇸🇬',
      },
      {
        id: 'dak_1',
        name: 'Onn',
        kind: 'dynamic',
        status: 'ACTIVE',
        expirationSummary: '12 day(s) left (4/28/2026)',
        serverLabel: null,
      },
    ],
  });

  assert.doesNotMatch(message, /Normal access key/);
  assert.doesNotMatch(message, /Premium dynamic key/);
  assert.doesNotMatch(message, /Preferred server:/);
  assert.match(message, /Status: <b>ACTIVE<\/b>/);
  assert.match(message, /73 day\(s\) left \(6\/29\/2026\) • SG-2/);
  assert.ok(message.split('\n').length < 18);
});

test('inbox summary stays compact and avoids category dump walls', () => {
  const message = buildTelegramInboxSummaryMessage({
    locale: 'en',
    mode: 'ALL',
    summaryLine: '2 announcement(s) • 1 order update(s) • 1 support update(s)',
    items: [
      {
        icon: '📣',
        title: 'Flash sale',
        detail: 'PROMO • Unread',
        meta: 'Apr 20, 2026 11:00 AM',
        sortAt: new Date('2026-04-20T11:00:00.000Z'),
      },
      {
        icon: '🧾',
        title: 'ORD-1',
        detail: 'Awaiting review • Premium / 1 Month / 200 GB',
        meta: 'Apr 20, 2026 10:30 AM',
        sortAt: new Date('2026-04-20T10:30:00.000Z'),
      },
      {
        icon: '💎',
        title: 'PRM-1',
        detail: 'Route issue • Waiting for admin',
        meta: 'Apr 20, 2026 10:00 AM',
        sortAt: new Date('2026-04-20T10:00:00.000Z'),
      },
      {
        icon: '🔑',
        title: 'LIMIT_NEAR',
        detail: 'Key 90',
        meta: 'Apr 20, 2026 09:00 AM',
        sortAt: new Date('2026-04-20T09:00:00.000Z'),
      },
    ],
  });

  assert.match(message, /Your Notice Inbox/);
  assert.match(message, /1\.\s+📣/);
  assert.match(message, /2\.\s+🧾/);
  assert.match(message, /3\.\s+💎/);
  assert.doesNotMatch(message, /Announcements<\/b>/);
  assert.doesNotMatch(message, /Order updates<\/b>/);
  assert.doesNotMatch(message, /Support updates<\/b>/);
  assert.ok(message.split('\n').length <= 18);
});

test('support status summary shows a short thread list instead of only the latest thread', () => {
  const message = buildTelegramSupportStatusSummaryMessage({
    locale: 'en',
    threads: [
      {
        id: 'thread_1',
        threadCode: 'SUP-AAA111',
        issueCategory: 'ORDER',
        status: 'OPEN',
        waitingOn: 'ADMIN',
        createdAt: new Date('2026-04-20T08:00:00.000Z'),
        updatedAt: new Date('2026-04-20T10:00:00.000Z'),
      },
      {
        id: 'thread_2',
        threadCode: 'SUP-BBB222',
        issueCategory: 'SERVER',
        status: 'OPEN',
        waitingOn: 'USER',
        createdAt: new Date('2026-04-20T07:00:00.000Z'),
        updatedAt: new Date('2026-04-20T09:00:00.000Z'),
      },
    ],
    premiumRequests: [
      {
        id: 'request_1',
        requestCode: 'PRM-111',
        requestType: 'REGION_CHANGE',
        status: 'OPEN',
        followUpPending: true,
        createdAt: new Date('2026-04-20T06:00:00.000Z'),
        updatedAt: new Date('2026-04-20T09:30:00.000Z'),
        dynamicKeyName: 'Onn',
      },
    ],
  });

  assert.match(message, /Your support center/);
  assert.match(message, /2 open • 2 recent • 1 premium/);
  assert.match(message, /SUP-AAA111/);
  assert.match(message, /SUP-BBB222/);
  assert.match(message, /PRM-111/);
  assert.doesNotMatch(message, /Latest thread:/);
  assert.ok(message.split('\n').length <= 18);
});
