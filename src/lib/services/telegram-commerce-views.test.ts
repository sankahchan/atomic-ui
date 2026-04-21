import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTelegramBuySummaryMessage,
  buildTelegramRenewSummaryMessage,
} from '@/lib/services/telegram-order-state';
import { buildTelegramInboxSummaryMessage } from '@/lib/services/telegram-inbox-ui';
import {
  buildTelegramKeyDetailMessage,
  buildTelegramKeysSummaryMessage,
} from '@/lib/services/telegram-keys';
import {
  buildTelegramPremiumDetailMessage,
  buildTelegramPremiumHubMessage,
  buildTelegramPremiumRegionDetailMessage,
  buildTelegramPremiumSupportListMessage,
  buildTelegramPremiumSupportStatusMessage,
} from '@/lib/services/telegram-premium';
import {
  buildTelegramOrderStatusMessage,
  buildTelegramOrdersSummaryMessage,
  buildTelegramRefundSummaryMessage,
} from '@/lib/services/telegram-orders';
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

test('key detail stays compact and keeps actions out of the text body', () => {
  const message = buildTelegramKeyDetailMessage({
    locale: 'en',
    item: {
      id: 'dak_1',
      kind: 'premium',
      name: 'Onn',
      status: 'ACTIVE',
      sharePageUrl: 'https://share.example/dak_1',
      quotaSummary: '12 GB / 200 GB',
      expirationSummary: '73 day(s) left (6/29/2026)',
      summaryLine: '🟢 ACTIVE • SG-2 🇸🇬',
      detailLines: [
        'Current pool: 1 preferred server',
        'Current route: SG-2 🇸🇬',
        'Requested region: SG',
        'Quota: 12 GB / 200 GB',
        'Thread: PRM-123 • Waiting for admin',
      ],
      renewSecondary: 'dynamic',
      latestPremiumRequestId: 'req_1',
    },
  });

  assert.match(message, /Premium key detail/);
  assert.match(message, /buttons below/i);
  assert.doesNotMatch(message, /Share page, renew, and support actions stay below this detail card/i);
  assert.doesNotMatch(message, /https?:\/\//);
  assert.ok(message.split('\n').length <= 14);
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

test('premium detail and request list stay compact', () => {
  const detailMessage = buildTelegramPremiumDetailMessage({
    locale: 'en',
    item: {
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
  });
  const listMessage = buildTelegramPremiumSupportListMessage({
    locale: 'en',
    page: 1,
    items: [
      {
        id: 'req_1',
        requestCode: 'PRM-123',
        keyName: 'Onn',
        requestTypeLabel: 'Route issue',
        statusLabel: 'Pending review',
        threadStateLabel: 'Waiting for admin',
        replyStateLabel: 'Admin reply sent',
        createdAtLabel: 'Apr 20, 2026 8:00 AM',
      },
    ],
  });

  assert.match(detailMessage, /Premium key detail/);
  assert.match(detailMessage, /buttons below/i);
  assert.doesNotMatch(detailMessage, /Buttons below keep the region change/i);
  assert.doesNotMatch(detailMessage, /https?:\/\//);
  assert.ok(detailMessage.split('\n').length <= 14);

  assert.match(listMessage, /PRM-123/);
  assert.doesNotMatch(listMessage, /\nStatus: [^\n]+\nThread status:/);
  assert.ok(listMessage.split('\n').length <= 12);
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

test('refund summary stays compact and keeps the center view short', () => {
  const message = buildTelegramRefundSummaryMessage({
    locale: 'en',
    recentRefundRequests: [
      {
        id: 'ord_1',
        orderCode: 'ORD-1',
        refundRequestStatus: 'PENDING_REVIEW',
        refundRequestedAt: new Date('2026-04-20T08:00:00.000Z'),
        refundReviewReasonCode: null,
      },
      {
        id: 'ord_2',
        orderCode: 'ORD-2',
        refundRequestStatus: 'REJECTED',
        refundRequestedAt: new Date('2026-04-19T08:00:00.000Z'),
        refundReviewReasonCode: 'USAGE_OVER_LIMIT',
      },
    ] as any,
    refundableOrders: [
      {
        order: {
          id: 'ord_3',
          orderCode: 'ORD-3',
          kind: 'NEW',
          status: 'FULFILLED',
          planName: 'Premium / 1 Month / 200 GB',
          planCode: 'premium_1m_200gb',
          durationMonths: 1,
          durationDays: null,
          requestedName: 'Onn',
        },
        refundEligibility: {
          usedBytes: 1024,
        },
      },
    ] as any,
  });

  assert.match(message, /Refund center/);
  assert.match(message, /Recent refund status/);
  assert.match(message, /Eligible now/);
  assert.doesNotMatch(message, /Request refund on one of the order cards below to submit a refund request\./);
  assert.ok(message.split('\n').length <= 16);
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

test('premium support detail stays compact and avoids timeline dumps', () => {
  const message = buildTelegramPremiumSupportStatusMessage({
    locale: 'en',
    request: {
      id: 'req_1',
      requestCode: 'PRM-123',
      status: 'PENDING_REVIEW',
      requestType: 'REGION_CHANGE',
      followUpPending: true,
      createdAt: new Date('2026-04-20T08:00:00.000Z'),
      updatedAt: new Date('2026-04-20T10:00:00.000Z'),
      reviewedAt: null,
      handledAt: null,
      dismissedAt: null,
      requestedRegionCode: 'SG',
      currentResolvedServerName: 'SG-2',
      currentResolvedServerCountryCode: 'SG',
      appliedPinServerName: null,
      appliedPinExpiresAt: null,
      customerMessage: 'Please move me back to Singapore.',
      dynamicAccessKey: {
        name: 'Onn',
        accessKeys: [],
        preferredCountryCodesJson: '["SG"]',
        preferredServerIdsJson: '[]',
        lastResolvedServerId: null,
        pinnedAccessKeyId: null,
        pinnedServerId: null,
        pinnedAt: null,
        pinExpiresAt: null,
      },
      replies: [
        {
          id: 'reply_1',
          senderType: 'CUSTOMER',
          message: 'Route feels unstable today.',
          createdAt: new Date('2026-04-20T09:00:00.000Z'),
        },
        {
          id: 'reply_2',
          senderType: 'ADMIN',
          message: 'We are checking the preferred region pool now.',
          createdAt: new Date('2026-04-20T09:30:00.000Z'),
        },
      ],
    } as any,
  });

  assert.match(message, /PRM-123/);
  assert.match(message, /Request snapshot/);
  assert.match(message, /Route snapshot/);
  assert.match(message, /Next step:/);
  assert.match(message, /Latest reply/);
  assert.doesNotMatch(message, /What happens next/);
  assert.doesNotMatch(message, /Timeline/i);
  assert.doesNotMatch(message, /Follow-up history/i);
  assert.doesNotMatch(message, /Current premium pool: <b>.*<\/b>\nRequested region: <b>.*<\/b>\nResolved server: <b>.*<\/b>\nUpdated:/);
  assert.ok(message.split('\n').length <= 20);
});

test('premium region detail stays compact and focuses on routing snapshot', () => {
  const message = buildTelegramPremiumRegionDetailMessage({
    locale: 'en',
    key: {
      id: 'dak_1',
      name: 'Onn',
      status: 'ACTIVE',
      accessKeys: [],
      preferredCountryCodesJson: '["SG","JP","US"]',
      preferredServerIdsJson: '[]',
      lastResolvedServerId: 'srv_sg',
      pinnedAccessKeyId: null,
      pinnedServerId: null,
      pinnedAt: null,
      pinExpiresAt: null,
    } as any,
    analysis: {
      preferredRegions: ['SG', 'JP', 'US'],
      currentServer: { name: 'SG-2', countryCode: 'SG' },
      currentSummary: {
        regionCode: 'SG',
        status: 'UP',
        latencyMs: 72,
        latencyThresholdMs: 150,
        serverCount: 2,
        isCurrent: true,
      },
      regionSummaries: [
        {
          regionCode: 'SG',
          status: 'UP',
          latencyMs: 72,
          latencyThresholdMs: 150,
          serverCount: 2,
          isCurrent: true,
        },
        {
          regionCode: 'JP',
          status: 'SLOW',
          latencyMs: 210,
          latencyThresholdMs: 180,
          serverCount: 1,
          isCurrent: false,
        },
        {
          regionCode: 'US',
          status: 'DOWN',
          latencyMs: null,
          latencyThresholdMs: null,
          serverCount: 0,
          isCurrent: false,
        },
        {
          regionCode: 'DE',
          status: 'UP',
          latencyMs: 95,
          latencyThresholdMs: 160,
          serverCount: 1,
          isCurrent: false,
        },
      ],
      suggestedFallbacks: [{ regionCode: 'JP' }],
    } as any,
    latestRoutingEvent: {
      eventType: 'AUTO_ROUTE',
      reason: 'Latency normal again after SG route recovered.',
      createdAt: new Date('2026-04-20T09:30:00.000Z'),
    } as any,
    index: 1,
    total: 1,
  });

  assert.match(message, /Region status 1\/1/);
  assert.match(message, /Routing snapshot/);
  assert.match(message, /Health snapshot/);
  assert.doesNotMatch(message, /Current routing/);
  assert.doesNotMatch(message, /Region health/);
  assert.doesNotMatch(message, /🇩🇪/);
  assert.ok(message.split('\n').length <= 15);
});

test('order detail stays compact and keeps links in buttons', async () => {
  const message = await buildTelegramOrderStatusMessage({
    locale: 'en',
    order: {
      id: 'ord_123',
      orderCode: 'ORD-123',
      kind: 'NEW',
      status: 'AWAITING_PAYMENT_PROOF',
      planName: 'Premium / 1 Month / 200 GB',
      planCode: 'premium_1m_200gb',
      durationMonths: 1,
      durationDays: null,
      requestedName: 'Onn',
      requestedEmail: 'onn@example.com',
      selectedServerName: 'SG-2',
      selectedServerCountryCode: 'SG',
      paymentMethodLabel: 'KBZPay',
      createdAt: new Date('2026-04-20T08:00:00.000Z'),
      paymentSubmittedAt: null,
      reviewedAt: null,
      fulfilledAt: null,
      rejectedAt: null,
      refundRequestStatus: null,
      refundRequestedAt: null,
      refundRequestReviewedAt: null,
      refundReviewReasonCode: null,
      customerMessage: 'Please review quickly.',
      refundRequestCustomerMessage: null,
      referralCode: 'REF123',
      orderMode: 'SELF',
      giftRecipientLabel: null,
      approvedAccessKeyId: null,
      targetAccessKeyId: null,
      approvedDynamicKeyId: null,
      targetDynamicKeyId: null,
      financeStatus: 'PAID',
    } as any,
    ensureAccessKeySubscriptionToken: async () => 'sub-token',
    getDynamicKeyMessagingUrls: () => ({
      sharePageUrl: null,
      subscriptionUrl: null,
      outlineClientUrl: null,
    }),
  });
  assert.ok(message);

  assert.match(message, /Current status/);
  assert.match(message, /Payment & review/);
  assert.doesNotMatch(message, /What you can do now/i);
  assert.doesNotMatch(message, /Order timeline/i);
  assert.doesNotMatch(message, /https?:\/\//);
  assert.ok(message.split('\n').length <= 24);
});
