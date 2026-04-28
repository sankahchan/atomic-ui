import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTelegramAdminHomeKeyboard,
  buildTelegramAdminHomeMessage,
  buildTelegramHelpMessage,
} from '@/lib/services/telegram-admin';
import {
  buildTelegramRefundQueueCardKeyboard,
  buildTelegramRefundQueueDetailMessage,
  buildTelegramRefundQueueCardMessage,
  buildTelegramRefundQueueSummaryKeyboard,
  buildTelegramRefundQueueSummaryMessage,
} from '@/lib/services/telegram-admin-finance';
import {
  buildTelegramCouponReminderMessage,
  buildTelegramTrialExpiringReminderMessage,
} from '@/lib/services/telegram-reminders';
import {
  buildTelegramSupportReplySubmittedMessage,
  buildTelegramSupportStatusSummaryMessage,
  buildTelegramSupportThreadStartMessage,
  resolveTelegramSupportIssuePrompt,
} from '@/lib/services/telegram-support-cards';
import {
  buildTelegramInboxEmptyMessage,
  buildTelegramInboxTip,
  buildTelegramInboxTitle,
} from '@/lib/services/telegram-inbox-ui';
import {
  buildTelegramOrderReviewDetailMessage,
  buildTelegramReviewQueueSummaryKeyboard,
  buildTelegramReviewQueueSummaryMessage,
} from '@/lib/services/telegram-review-queue';
import {
  buildTelegramOrderReviewAlertKeyboard,
  buildTelegramOrderReviewAlertMessage,
} from '@/lib/services/telegram-review-queue';
import {
  buildTelegramPremiumSupportQueueDetailMessage,
  buildTelegramPremiumSupportQueueSummaryMessage,
  buildTelegramPremiumSupportQueueCardMessage,
  buildTelegramSupportQueueReplyKeyboard,
  buildTelegramSupportQueueShortcutMessage,
  buildTelegramSupportQueueSummaryKeyboard,
} from '@/lib/services/telegram-premium-support-queue';
import {
  buildTelegramSupportThreadQueueDetailMessage,
  buildTelegramSupportThreadsSummaryMessage,
  buildTelegramSupportThreadQueueMessage,
  buildTelegramSupportThreadQueueReplyKeyboard,
  buildTelegramSupportThreadsSummaryKeyboard,
} from '@/lib/services/telegram-support-console';
import {
  findUnsupportedTelegramHtmlTags,
  measureTelegramKeyboardLayout,
  measureTelegramMessageLayout,
  normalizeTelegramUtf8Text,
  sanitizeTelegramHtmlMessage,
  validateTelegramHtmlMessage,
} from '@/lib/services/telegram-message-validation';
import { getCommandKeyboard, parseTelegramMenuCallbackData } from '@/lib/services/telegram-callbacks';
import { getTelegramUi } from '@/lib/services/telegram-ui';

function assertTelegramMessageBudget(
  message: string,
  limits: { maxLines: number; maxChars: number },
) {
  const layout = measureTelegramMessageLayout(message);
  assert.ok(
    layout.nonEmptyLineCount <= limits.maxLines,
    `Expected <= ${limits.maxLines} non-empty lines, got ${layout.nonEmptyLineCount}:\n${message}`,
  );
  assert.ok(
    layout.visibleCharacterCount <= limits.maxChars,
    `Expected <= ${limits.maxChars} visible chars, got ${layout.visibleCharacterCount}:\n${message}`,
  );
}

function assertTelegramKeyboardBudget(
  keyboard: { inline_keyboard?: Array<Array<{ text?: string }>>; keyboard?: Array<Array<{ text?: string }>> },
  limits: { maxRows: number; maxButtonsPerRow: number; maxButtonTextLength: number },
) {
  const layout = measureTelegramKeyboardLayout(keyboard);
  assert.ok(layout.rowCount <= limits.maxRows, `Expected <= ${limits.maxRows} rows, got ${layout.rowCount}`);
  assert.ok(
    layout.maxButtonsPerRow <= limits.maxButtonsPerRow,
    `Expected <= ${limits.maxButtonsPerRow} buttons per row, got ${layout.maxButtonsPerRow}`,
  );
  assert.ok(
    layout.maxButtonTextLength <= limits.maxButtonTextLength,
    `Expected button text length <= ${limits.maxButtonTextLength}, got ${layout.maxButtonTextLength}`,
  );
}

test('telegram HTML validator accepts supported tags', () => {
  const message = '<b>Hello</b>\n<a href="https://example.com">Open</a>\n<code>ABC</code>';
  assert.deepEqual(findUnsupportedTelegramHtmlTags(message), []);
  assert.deepEqual(validateTelegramHtmlMessage(message), { valid: true, invalidTags: [] });
});

test('telegram HTML validator flags unsupported placeholder tags', () => {
  const message = 'Usage: /order <order-code>';
  assert.deepEqual(findUnsupportedTelegramHtmlTags(message), ['order-code']);
  assert.deepEqual(validateTelegramHtmlMessage(message), {
    valid: false,
    invalidTags: ['order-code'],
  });
});

test('telegram HTML sanitizer escapes unsupported placeholder tags but keeps supported tags', () => {
  const message = 'Usage: <b>/order</b> <order-code>';
  const sanitized = sanitizeTelegramHtmlMessage(message);

  assert.equal(sanitized.changed, true);
  assert.deepEqual(sanitized.invalidTags, ['order-code']);
  assert.equal(sanitized.text, 'Usage: <b>/order</b> &lt;order-code&gt;');
});

test('telegram UTF-8 normalizer strips lone surrogates and control bytes', () => {
  const dirty = `Hello\u0000 world \ud800test\u0007`;
  const normalized = normalizeTelegramUtf8Text(dirty);

  assert.equal(normalized.changed, true);
  assert.equal(normalized.text, 'Hello world test');
});

test('telegram HTML sanitizer removes invalid UTF-8/control characters', () => {
  const sanitized = sanitizeTelegramHtmlMessage('A\u0000<b>ok</b>\ud800');

  assert.equal(sanitized.changed, true);
  assert.equal(sanitized.invalidCharactersRemoved, true);
  assert.equal(sanitized.text, 'A<b>ok</b>');
});

test('telegram help message stays valid HTML for user and admin variants', () => {
  const userHelp = buildTelegramHelpMessage({ isAdmin: false, locale: 'en' });
  const adminHelp = buildTelegramHelpMessage({ isAdmin: true, locale: 'en' });

  assert.deepEqual(validateTelegramHtmlMessage(userHelp), { valid: true, invalidTags: [] });
  assert.deepEqual(validateTelegramHtmlMessage(adminHelp), { valid: true, invalidTags: [] });
  assert.match(userHelp, /Quick command guide/);
  assert.doesNotMatch(userHelp, /Available Commands/);
  assert.match(adminHelp, /Admin commands/);
});

test('telegram usage and status hint strings stay HTML-safe', () => {
  const ui = getTelegramUi('en');
  const samples = [
    ui.orderStatusUsage,
    ui.findUsage,
    ui.enableUsage,
    ui.disableUsage,
    ui.resendUsage,
    ui.helpTitle,
  ];

  for (const sample of samples) {
    assert.deepEqual(validateTelegramHtmlMessage(sample), { valid: true, invalidTags: [] });
  }
});

test('telegram start surfaces stay summary-first', () => {
  const ui = getTelegramUi('en');
  const hello = ui.hello('User', 'Welcome text', 123456, '');
  const welcomeBack = ui.welcomeBack('User');
  const linked = ui.accountLinked('User');

  assert.match(hello, /Quick menu/);
  assert.doesNotMatch(hello, /Useful shortcuts/);
  assert.match(welcomeBack, /Start here/);
  assert.doesNotMatch(welcomeBack, /announcement and support updates/);
  assert.doesNotMatch(linked, /everything from Telegram/);
  assert.deepEqual(validateTelegramHtmlMessage(hello), { valid: true, invalidTags: [] });
  assert.deepEqual(validateTelegramHtmlMessage(welcomeBack), { valid: true, invalidTags: [] });
  assert.deepEqual(validateTelegramHtmlMessage(linked), { valid: true, invalidTags: [] });
});

test('telegram payment and refund reply strings stay compact and HTML-safe', () => {
  const ui = getTelegramUi('en');
  const samples = [
    ui.activeOrderPendingReview('ORD-123'),
    ui.paymentProofRequired,
    ui.orderProofPending('ORD-123'),
    ui.orderPaymentProofReminder('ORD-123'),
    ui.orderRejectedFollowUpReminder('ORD-123'),
    ui.refundRequested('ORD-123'),
    ui.refundRequestApproved('ORD-123'),
    ui.refundRequestRejected('ORD-123'),
  ];

  for (const sample of samples) {
    assert.deepEqual(validateTelegramHtmlMessage(sample), { valid: true, invalidTags: [] });
    assert.ok(sample.split('\n').length <= 3);
  }

  assert.doesNotMatch(ui.activeOrderPendingReview('ORD-123'), /waiting for review/);
  assert.doesNotMatch(ui.paymentProofRequired, /Make sure the amount, transfer ID, and time are clearly visible, then wait for review\./);
  assert.doesNotMatch(ui.orderProofPending('ORD-123'), /It is now waiting for admin review/);
  assert.doesNotMatch(ui.refundRequested('ORD-123'), /after admin review/);
});

test('telegram premium prompts and order outcomes stay compact and HTML-safe', () => {
  const ui = getTelegramUi('en');
  const samples = [
    ui.premiumRegionPrompt('Onn', 'SG, JP, US'),
    ui.premiumRegionRequestSubmitted('Onn', 'SG'),
    ui.premiumRouteIssueSubmitted('Onn'),
    ui.premiumSupportRequestPending('PRM-123'),
    ui.premiumFollowUpPrompt('PRM-123', 'Onn'),
    ui.premiumFollowUpSubmitted('PRM-123'),
    ui.orderRejected('ORD-123'),
    ui.orderApproved('ORD-123'),
    ui.receiptFooter,
  ];

  for (const sample of samples) {
    assert.deepEqual(validateTelegramHtmlMessage(sample), { valid: true, invalidTags: [] });
    assert.ok(sample.split('\n').length <= 4);
  }

  assert.doesNotMatch(ui.premiumRegionPrompt('Onn', 'SG, JP, US'), /manual review/);
  assert.doesNotMatch(ui.premiumRegionRequestSubmitted('Onn', 'SG'), /follow up/);
  assert.doesNotMatch(ui.premiumRouteIssueSubmitted('Onn'), /has been sent to the admin/);
  assert.doesNotMatch(ui.premiumFollowUpSubmitted('PRM-123'), /has been sent to the admin/);
  assert.doesNotMatch(ui.orderRejected('ORD-123'), /please contact the admin/i);
  assert.doesNotMatch(ui.receiptFooter, /client URL/i);
});

test('telegram promo reminder messages stay compact and keep links in buttons', () => {
  const ui = getTelegramUi('en');
  const samples = [
    buildTelegramTrialExpiringReminderMessage({
      locale: 'en',
      keyName: 'Onn iPhone 15',
      hoursLeft: 6,
    }),
    buildTelegramCouponReminderMessage({
      locale: 'en',
      title: ui.trialCouponTitle,
      keyName: 'Onn iPhone 15',
      body: ui.trialCouponBody(6),
      couponCode: 'SAVE20',
      discountLabel: '20% off',
      hint: ui.trialCouponHint,
    }),
    buildTelegramCouponReminderMessage({
      locale: 'en',
      title: ui.renewalCouponTitle,
      keyName: 'Onn iPhone 15',
      body: ui.renewalCouponBody(3),
      couponCode: 'RENEW10',
      discountLabel: '10% off',
      hint: ui.couponReadyHint,
    }),
    buildTelegramCouponReminderMessage({
      locale: 'en',
      title: ui.premiumUpsellCouponTitle,
      keyName: 'Onn iPhone 15',
      body: ui.premiumUpsellCouponBody(82),
      couponCode: 'PREMIUM15',
      discountLabel: '15% off',
      hint: ui.couponReadyHint,
    }),
    buildTelegramCouponReminderMessage({
      locale: 'en',
      title: ui.winbackCouponTitle,
      body: ui.winbackCouponBody(30),
      couponCode: 'COMEHOME',
      discountLabel: '25% off',
      hint: ui.couponReadyHint,
    }),
  ];

  for (const sample of samples) {
    assert.deepEqual(validateTelegramHtmlMessage(sample), { valid: true, invalidTags: [] });
    assert.ok(sample.split('\n').length <= 7);
    assert.doesNotMatch(sample, /https?:\/\//);
  }

  assert.doesNotMatch(ui.trialExpiringUpsell, /before the trial expires/i);
  assert.doesNotMatch(ui.trialCouponHint, /\/buy COUPON-CODE/);
  assert.doesNotMatch(ui.premiumUpsellCouponBody(82), /more stable premium plan/i);
});

test('telegram support intake messages stay compact and HTML-safe', () => {
  const prompts = [
    resolveTelegramSupportIssuePrompt('ORDER', 'en'),
    resolveTelegramSupportIssuePrompt('KEY', 'en'),
    resolveTelegramSupportIssuePrompt('SERVER', 'en'),
    resolveTelegramSupportIssuePrompt('BILLING', 'en'),
    resolveTelegramSupportIssuePrompt('GENERAL', 'en'),
  ];

  for (const prompt of prompts) {
    assert.deepEqual(validateTelegramHtmlMessage(prompt), { valid: true, invalidTags: [] });
    assert.ok(prompt.split('\n').length <= 2);
    assert.doesNotMatch(prompt, /next message/i);
  }

  const start = buildTelegramSupportThreadStartMessage({
    threadCode: 'SUP-123',
    issueCategory: 'BILLING',
    locale: 'en',
  });
  const submitted = buildTelegramSupportReplySubmittedMessage({
    threadCode: 'SUP-123',
    locale: 'en',
  });

  for (const sample of [start, submitted]) {
    assert.deepEqual(validateTelegramHtmlMessage(sample), { valid: true, invalidTags: [] });
    assert.doesNotMatch(sample, /https?:\/\//);
  }

  assert.ok(start.split('\n').length <= 9);
  assert.ok(submitted.split('\n').length <= 2);
  assert.doesNotMatch(start, /\bSLA\b/);
  assert.doesNotMatch(start, /\bAge\b/);
  assert.doesNotMatch(submitted, /support queue/i);
  assert.doesNotMatch(submitted, /as soon as it is available/i);
});

test('support hub copy avoids awkward legacy wording', () => {
  const line = 'Choose the category you need and start a new support thread.';
  assert.deepEqual(validateTelegramHtmlMessage(line), { valid: true, invalidTags: [] });
  assert.doesNotMatch(line, /real support thread/i);
});

test('myanmar help copy stays localized and html-safe', () => {
  const help = buildTelegramHelpMessage({ isAdmin: true, locale: 'my' });

  assert.deepEqual(validateTelegramHtmlMessage(help), { valid: true, invalidTags: [] });
  assert.match(help, /အမြန် command guide/);
  assert.match(help, /Admin command များ/);
  assert.doesNotMatch(help, /Quick command guide/);
});

test('myanmar inbox copy avoids english fallback text', () => {
  const title = buildTelegramInboxTitle('SUPPORT', 'my');
  const empty = buildTelegramInboxEmptyMessage('SUPPORT', 'my');
  const tip = buildTelegramInboxTip('ALL', 'my');

  for (const sample of [title, empty, tip]) {
    assert.deepEqual(validateTelegramHtmlMessage(sample), { valid: true, invalidTags: [] });
  }

  assert.match(title, /အကူအညီ အဖြေများ/);
  assert.match(empty, /support update မရှိသေးပါ/);
  assert.match(tip, /button များဖြင့် category/);
  assert.doesNotMatch(empty, /No recent support updates yet/);
});

test('myanmar support summary and admin queue labels stay localized', () => {
  const summary = buildTelegramSupportStatusSummaryMessage({
    locale: 'my',
    threads: [
      {
        id: 'thr_1',
        threadCode: 'SUP-123',
        issueCategory: 'ORDER',
        status: 'OPEN',
        waitingOn: 'ADMIN',
        createdAt: new Date('2026-04-20T00:00:00Z'),
        updatedAt: new Date('2026-04-20T02:00:00Z'),
      },
    ],
    premiumRequests: [],
  });
  const keyboard = buildTelegramReviewQueueSummaryKeyboard({
    locale: 'my',
    mode: 'all',
  });

  assert.deepEqual(validateTelegramHtmlMessage(summary), { valid: true, invalidTags: [] });
  assert.match(summary, /သင့် support center/);
  assert.match(summary, /Admin အဖြေ စောင့်နေ/);
  assert.doesNotMatch(summary, /Your support center/);

  const firstRow = keyboard.inline_keyboard[0]?.map((button) => button.text).join(' | ') || '';
  assert.match(firstRow, /အားလုံး/);
  assert.match(firstRow, /ကိုယ်ပိုင်/);
  assert.match(firstRow, /မယူရသေး/);
});

test('telegram user and admin keyboards stay within mobile row budgets', () => {
  const userKeyboard = getCommandKeyboard(false, 'en');
  const adminKeyboard = getCommandKeyboard(true, 'my');
  const adminHomeKeyboard = buildTelegramAdminHomeKeyboard({
    locale: 'my',
    adminActor: {
      isAdmin: true,
      userId: 'admin_1',
      email: 'owner@example.com',
      scope: 'OWNER',
    },
    pendingReview: 4,
    supportOpen: 7,
    customerSupportOpen: 5,
    premiumSupportOpen: 2,
    pendingRefunds: 3,
    scheduledAnnouncements: 1,
    failedDeliveries: 0,
  });
  const reviewKeyboard = buildTelegramReviewQueueSummaryKeyboard({
    locale: 'my',
    mode: 'all',
  });
  const supportConsoleKeyboard = buildTelegramSupportThreadsSummaryKeyboard({
    locale: 'my',
    mode: 'all',
  });
  const premiumQueueKeyboard = buildTelegramSupportQueueSummaryKeyboard({
    locale: 'my',
    mode: 'all',
  });
  const reviewActionKeyboard = buildTelegramOrderReviewAlertKeyboard({
    orderId: 'ord_1',
    locale: 'en',
    panelUrl: 'https://panel.example/orders/ord_1',
    queueMode: 'all',
  });
  const supportReplyKeyboard = buildTelegramSupportThreadQueueReplyKeyboard({
    threadId: 'thr_1',
    locale: 'en',
    panelUrl: 'https://panel.example/support/thr_1',
    mode: 'all',
    claimedByMe: false,
    isClaimed: false,
  });
  const premiumReplyKeyboard = buildTelegramSupportQueueReplyKeyboard({
    requestId: 'req_1',
    locale: 'my',
    panelUrl: 'https://panel.example/premium/req_1',
    mode: 'all',
  });
  const refundSummaryKeyboard = buildTelegramRefundQueueSummaryKeyboard({
    locale: 'en',
  });
  const refundCardKeyboard = buildTelegramRefundQueueCardKeyboard({
    locale: 'en',
    orderId: 'ord_1',
    panelUrl: 'https://panel.example/orders/ord_1',
  });

  for (const keyboard of [userKeyboard, adminKeyboard]) {
    assertTelegramKeyboardBudget(keyboard, {
      maxRows: 14,
      maxButtonsPerRow: 2,
      maxButtonTextLength: 20,
    });
  }

  for (const keyboard of [
    adminHomeKeyboard,
    reviewKeyboard,
    supportConsoleKeyboard,
    premiumQueueKeyboard,
    reviewActionKeyboard,
    supportReplyKeyboard,
    premiumReplyKeyboard,
    refundSummaryKeyboard,
    refundCardKeyboard,
  ]) {
    assertTelegramKeyboardBudget(keyboard, {
      maxRows: 8,
      maxButtonsPerRow: 3,
      maxButtonTextLength: 32,
    });
  }
});

test('admin queue cards stay compact and button-first', () => {
  const reviewSummary = buildTelegramReviewQueueSummaryMessage({
    locale: 'en',
    mode: 'all',
    totalPending: 7,
    unclaimed: 3,
    mine: 2,
    duplicateWarnings: 1,
    hasItems: true,
  });
  const reviewCard = buildTelegramOrderReviewAlertMessage({
    locale: 'en',
    mode: 'initial',
    order: {
      id: 'ord_1',
      orderCode: 'ORD-123',
      planName: 'Premium / 1 Month / 200 GB',
      planCode: 'premium_1m_200gb',
      assignedReviewerEmail: null,
      priceLabel: '6,000 Kyat',
      telegramUsername: 'sankahchan',
      telegramUserId: '7989641645',
      paymentSubmittedAt: new Date('2026-04-22T00:00:00Z'),
      paymentProofType: 'photo',
      paymentMethodLabel: 'KBZPay',
      selectedServerName: 'SG-2',
      paymentMessageId: 123,
      duplicateProofOrderCode: null,
      requestedName: 'Onn',
      targetAccessKeyId: 'key_123',
    } as any,
  });
  const adminHome = buildTelegramAdminHomeMessage({
    locale: 'en',
    adminActor: {
      isAdmin: true,
      userId: 'admin_1',
      email: 'owner@example.com',
      scope: 'OWNER',
    },
    pendingReview: 7,
    unclaimedReview: 3,
    customerSupportWaitingAdmin: 4,
    premiumSupportWaitingAdmin: 2,
    pendingRefunds: 1,
    myRefunds: 1,
    scheduledAnnouncements: 2,
    failedDeliveries: 1,
    todayFulfilledCount: 5,
    todayRevenue: 36000,
  });
  const supportThreadCard = buildTelegramSupportThreadQueueMessage({
    locale: 'my',
    thread: {
      id: 'thr_1',
      threadCode: 'SUP-123',
      issueCategory: 'ORDER',
      status: 'OPEN',
      waitingOn: 'ADMIN',
      firstAdminReplyAt: null,
      firstResponseDueAt: new Date('2026-04-22T06:00:00Z'),
      assignedAdminName: null,
      telegramUsername: 'customer_one',
      telegramUserId: '123456',
      createdAt: new Date('2026-04-22T00:00:00Z'),
      updatedAt: new Date('2026-04-22T01:30:00Z'),
      replies: [
        {
          id: 'rep_1',
          senderType: 'USER',
          message: 'Payment proof is attached. The transfer id is visible in the screenshot.',
          createdAt: new Date('2026-04-22T01:00:00Z'),
          mediaUrl: null,
        },
      ],
    } as any,
  });
  const supportThreadSummary = buildTelegramSupportThreadsSummaryMessage({
    locale: 'en',
    mode: 'all',
    totalOpen: 8,
    waitingAdmin: 4,
    waitingUser: 3,
    overdue: 2,
    hasItems: true,
  });
  const premiumQueueSummary = buildTelegramPremiumSupportQueueSummaryMessage({
    locale: 'en',
    mode: 'admin',
    totalOpen: 5,
    waitingAdmin: 3,
    waitingUser: 2,
    hasItems: true,
  });
  const premiumQueueCard = buildTelegramPremiumSupportQueueCardMessage({
    locale: 'my',
    request: {
      id: 'req_1',
      requestCode: 'PRM-123',
      requestType: 'REGION_CHANGE',
      followUpPending: true,
      dynamicAccessKey: {
        id: 'dak_1',
        name: 'Onn',
      },
      createdAt: new Date('2026-04-22T00:00:00Z'),
      updatedAt: new Date('2026-04-22T01:00:00Z'),
      replies: [
        {
          id: 'rep_1',
          senderType: 'USER',
          message: 'Please switch this key to SG first. JP is unstable for my current route.',
          createdAt: new Date('2026-04-22T00:30:00Z'),
        },
      ],
    } as any,
  });
  const refundSummary = buildTelegramRefundQueueSummaryMessage({
    locale: 'en',
    totalPending: 4,
    unclaimed: 2,
    claimed: 2,
    hasItems: true,
  });
  const refundCard = buildTelegramRefundQueueCardMessage({
    locale: 'en',
    order: {
      id: 'ord_refund_1',
      orderCode: 'ORD-REFUND',
      requestedEmail: 'customer@example.com',
      telegramUsername: 'customer_one',
      telegramUserId: '123456',
      priceAmount: 6000,
      priceCurrency: 'MMK',
      refundRequestedAt: new Date('2026-04-22T00:30:00Z'),
      refundRequestMessage: 'The key was not used and I want a refund before approval closes.',
      refundAssignedReviewerUserId: null,
      refundAssignedReviewerEmail: null,
    } as any,
  });

  for (const message of [
    reviewSummary,
    reviewCard,
    adminHome,
    supportThreadSummary,
    supportThreadCard,
    premiumQueueSummary,
    premiumQueueCard,
    refundSummary,
    refundCard,
  ]) {
    assert.deepEqual(validateTelegramHtmlMessage(message), { valid: true, invalidTags: [] });
    assert.doesNotMatch(message, /https?:\/\//);
  }

  assert.match(reviewSummary, /Opening the next item below/);
  assert.doesNotMatch(reviewSummary, /Showing \d+ item/);
  assertTelegramMessageBudget(reviewSummary, { maxLines: 6, maxChars: 220 });

  assert.doesNotMatch(reviewCard, /Proof snapshot/);
  assert.doesNotMatch(reviewCard, /Use the buttons below/);
  assert.doesNotMatch(reviewCard, /Queue:/);
  assert.match(reviewCard, /Renewal order/);
  assert.doesNotMatch(reviewCard, /key_123/);
  assertTelegramMessageBudget(reviewCard, { maxLines: 9, maxChars: 360 });
  assert.match(adminHome, /Needs attention/);
  assert.match(adminHome, /Choose the next admin action from the buttons below/);
  assert.doesNotMatch(adminHome, /Quick next actions/);
  assert.doesNotMatch(adminHome, /\/createkey|\/reviewqueue|\/finance/);
  assertTelegramMessageBudget(adminHome, { maxLines: 11, maxChars: 460 });
  assert.match(supportThreadSummary, /Opening the next thread below/);
  assertTelegramMessageBudget(supportThreadSummary, { maxLines: 6, maxChars: 220 });
  assert.doesNotMatch(supportThreadCard, /Use the buttons below/);
  assertTelegramMessageBudget(supportThreadCard, { maxLines: 8, maxChars: 320 });
  assert.match(premiumQueueSummary, /Opening the next request below/);
  assertTelegramMessageBudget(premiumQueueSummary, { maxLines: 5, maxChars: 220 });
  assert.doesNotMatch(premiumQueueCard, /Use the buttons below/);
  assert.match(premiumQueueCard, /နောက်ဆုံး reply/);
  assert.doesNotMatch(premiumQueueCard, /Latest reply/);
  assertTelegramMessageBudget(premiumQueueCard, { maxLines: 8, maxChars: 300 });
  assert.match(refundSummary, /Opening the next refund below/);
  assertTelegramMessageBudget(refundSummary, { maxLines: 3, maxChars: 180 });
  assert.doesNotMatch(refundCard, /https?:\/\//);
  assertTelegramMessageBudget(refundCard, { maxLines: 6, maxChars: 300 });
});

test('myanmar premium queue helpers stay localized and compact', () => {
  const adminHome = buildTelegramAdminHomeMessage({
    locale: 'my',
    adminActor: {
      isAdmin: true,
      userId: 'admin_1',
      email: 'owner@example.com',
      scope: 'OWNER',
    },
    pendingReview: 7,
    unclaimedReview: 3,
    customerSupportWaitingAdmin: 4,
    premiumSupportWaitingAdmin: 2,
    pendingRefunds: 1,
    myRefunds: 1,
    scheduledAnnouncements: 2,
    failedDeliveries: 1,
    todayFulfilledCount: 5,
    todayRevenue: 36000,
  });
  const queueKeyboard = buildTelegramSupportQueueSummaryKeyboard({
    locale: 'my',
    mode: 'admin',
  });
  const premiumQueueSummary = buildTelegramPremiumSupportQueueSummaryMessage({
    locale: 'my',
    mode: 'admin',
    totalOpen: 5,
    waitingAdmin: 3,
    waitingUser: 2,
    hasItems: true,
  });
  const premiumReplyKeyboard = buildTelegramSupportQueueReplyKeyboard({
    requestId: 'req_1',
    locale: 'my',
    panelUrl: 'https://panel.example/premium/req_1',
    mode: 'admin',
  });
  const reviewActionKeyboard = buildTelegramOrderReviewAlertKeyboard({
    locale: 'my',
    orderId: 'ord_1',
    panelUrl: 'https://panel.example/orders/ord_1',
  });
  const refundSummary = buildTelegramRefundQueueSummaryMessage({
    locale: 'my',
    totalPending: 4,
    unclaimed: 2,
    claimed: 2,
    hasItems: true,
  });
  const refundSummaryKeyboard = buildTelegramRefundQueueSummaryKeyboard({
    locale: 'my',
  });
  const refundCard = buildTelegramRefundQueueCardMessage({
    locale: 'my',
    order: {
      id: 'ord_refund_1',
      orderCode: 'ORD-REFUND',
      requestedEmail: 'customer@example.com',
      telegramUsername: 'customer_one',
      telegramUserId: '123456',
      priceAmount: 6000,
      priceCurrency: 'MMK',
      refundRequestedAt: new Date('2026-04-22T00:30:00Z'),
      refundRequestMessage: 'The key was not used and I want a refund before approval closes.',
      refundAssignedReviewerUserId: null,
      refundAssignedReviewerEmail: null,
    } as any,
  });
  const refundKeyboard = buildTelegramRefundQueueCardKeyboard({
    locale: 'my',
    orderId: 'ord_1',
    panelUrl: 'https://panel.example/orders/ord_1',
  });
  const workingMessage = buildTelegramSupportQueueShortcutMessage('wk', 'my');
  const detailMessage = buildTelegramSupportQueueShortcutMessage('nd', 'my');
  const handledMessage = buildTelegramSupportQueueShortcutMessage('hd', 'my');

  const firstRow = queueKeyboard.inline_keyboard[0]?.map((button) => button.text).join(' | ') || '';
  const premiumReplyFirstRow = premiumReplyKeyboard.inline_keyboard[0]?.map((button) => button.text).join(' | ') || '';
  const premiumReplySecondRow = premiumReplyKeyboard.inline_keyboard[1]?.map((button) => button.text).join(' | ') || '';
  const reviewActionThirdRow = reviewActionKeyboard.inline_keyboard[2]?.map((button) => button.text).join(' | ') || '';
  const refundSummaryFirstRow = refundSummaryKeyboard.inline_keyboard[0]?.map((button) => button.text).join(' | ') || '';
  const refundSummarySecondRow = refundSummaryKeyboard.inline_keyboard[1]?.map((button) => button.text).join(' | ') || '';
  const refundFirstRow = refundKeyboard.inline_keyboard[0]?.map((button) => button.text).join(' | ') || '';
  const nextActionCallback = parseTelegramMenuCallbackData(
    queueKeyboard.inline_keyboard[1]?.[0]?.callback_data,
  );
  assert.match(firstRow, /အားလုံး/);
  assert.match(firstRow, /Admin စောင့်နေ/);
  assert.match(firstRow, /User စောင့်နေ/);
  assert.deepEqual(nextActionCallback, {
    section: 'admin',
    action: 'supportqueue_admin',
  });

  for (const message of [workingMessage, detailMessage, handledMessage]) {
    assert.deepEqual(validateTelegramHtmlMessage(message), { valid: true, invalidTags: [] });
    assertTelegramMessageBudget(message, { maxLines: 2, maxChars: 100 });
  }

  assert.deepEqual(validateTelegramHtmlMessage(adminHome), { valid: true, invalidTags: [] });
  assert.deepEqual(validateTelegramHtmlMessage(premiumQueueSummary), { valid: true, invalidTags: [] });
  assert.deepEqual(validateTelegramHtmlMessage(refundSummary), { valid: true, invalidTags: [] });
  assert.deepEqual(validateTelegramHtmlMessage(refundCard), { valid: true, invalidTags: [] });
  assert.match(adminHome, /စစ်ရန်လိုသည်/);
  assert.match(adminHome, /နောက်လုပ်ဆောင်ချက်ကို/);
  assert.match(premiumQueueSummary, /Premium support စစ်ရန်/);
  assert.match(refundSummary, /Refund စစ်ရန်/);
  assert.match(refundSummary, /မယူရသေး/);
  assert.match(refundCard, /Refund တောင်းဆိုချက်/);
  assert.match(refundCard, /အကြောင်းရင်း/);
  assert.doesNotMatch(adminHome, /Needs attention|Choose the next admin action|Quick next actions/);
  assert.doesNotMatch(adminHome, /\/createkey|\/reviewqueue|\/finance/);
  assert.doesNotMatch(premiumQueueSummary, /Premium support queue|Need admin reply|Opening the next request below/);
  assert.doesNotMatch(refundSummary, /Refund queue|pending •|unclaimed|claimed|Opening the next refund below/);
  assert.doesNotMatch(refundCard, /Claimed by|Unclaimed|Reason:/);
  assert.doesNotMatch(premiumReplyFirstRow, /Working on it|Need details|Handled/);
  assert.doesNotMatch(premiumReplySecondRow, /Next|Panel/);
  assert.doesNotMatch(reviewActionThirdRow, /Duplicate|Blurry|Amount/);
  assert.doesNotMatch(refundSummaryFirstRow, /Refresh|Reviews/);
  assert.doesNotMatch(refundSummarySecondRow, /Admin home/);
  assert.doesNotMatch(refundFirstRow, /Claim|Prev|Next/);
  assertTelegramMessageBudget(adminHome, { maxLines: 11, maxChars: 460 });
  assertTelegramMessageBudget(premiumQueueSummary, { maxLines: 5, maxChars: 220 });
  assertTelegramMessageBudget(refundSummary, { maxLines: 3, maxChars: 180 });
  assertTelegramMessageBudget(refundCard, { maxLines: 6, maxChars: 300 });

  assert.doesNotMatch(workingMessage, /We are checking this now/);
  assert.doesNotMatch(detailMessage, /Please send a little more detail/);
  assert.doesNotMatch(handledMessage, /This issue has been handled/);
});

test('admin queue detail cards stay compact and keep links out of the text body', () => {
  const reviewDetail = buildTelegramOrderReviewDetailMessage({
    locale: 'en',
    renewalTargetLabel: 'Key 90',
    order: {
      id: 'ord_1',
      orderCode: 'ORD-1001',
      kind: 'RENEW',
      orderMode: 'SELF',
      telegramUserId: '123456',
      telegramUsername: 'buyer_one',
      requestedEmail: 'buyer@example.com',
      requestedName: 'Testing',
      planName: 'Premium / 1 Month / 200 GB',
      deliveryType: 'DYNAMIC_KEY',
      priceLabel: '6,000 Kyat',
      paymentMethodLabel: 'KBZPay',
      selectedServerName: 'SG-2',
      paymentCaption: 'Please use the same region if possible.',
      giftRecipientLabel: null,
    } as any,
  });
  const refundDetail = buildTelegramRefundQueueDetailMessage({
    locale: 'en',
    order: {
      id: 'ord_2',
      orderCode: 'ORD-2002',
      kind: 'RENEW',
      requestedEmail: 'refund@example.com',
      telegramUsername: 'refund_user',
      telegramUserId: '234567',
      priceAmount: 9000,
      priceCurrency: 'MMK',
      planName: '2 Months / 300 GB',
      paymentMethodLabel: 'AYA Pay',
      financeStatus: 'OPEN',
      refundRequestedAt: new Date('2026-04-22T00:30:00Z'),
      refundRequestMessage: 'I renewed by mistake and need the order cancelled before it is fulfilled.',
    } as any,
  });
  const premiumDetail = buildTelegramPremiumSupportQueueDetailMessage({
    locale: 'en',
    request: {
      requestCode: 'PRM-100',
      requestType: 'ROUTE_ISSUE',
      requestedRegionCode: 'SG',
      currentResolvedServerName: 'SG-2',
      currentPoolSummary: '1 preferred server • 2 fallback routes',
      linkedOutageServerName: 'SG-1',
      appliedPinServerName: 'SG-2',
      adminNote: 'User reported unstable routing after midnight.',
      customerMessage: null,
      followUpPending: true,
      dynamicAccessKey: {
        id: 'dak_1',
        name: 'Onn',
      },
      replies: [
        {
          id: 'reply_1',
          senderType: 'CUSTOMER',
          message: 'Routing became slow again after reconnecting.',
          createdAt: new Date('2026-04-22T01:00:00Z'),
        },
      ],
    } as any,
  });
  const supportThreadDetail = buildTelegramSupportThreadQueueDetailMessage({
    locale: 'en',
    thread: {
      id: 'thr_1',
      threadCode: 'SUP-100',
      issueCategory: 'PAYMENT',
      status: 'OPEN',
      waitingOn: 'ADMIN',
      telegramUserId: '345678',
      telegramUsername: 'support_user',
      relatedOrderCode: 'ORD-2002',
      relatedKeyName: 'Testing',
      relatedServerName: 'SG-2',
      subject: 'Need a quick confirmation before payment proof expires.',
      firstResponseDueAt: new Date('2026-04-22T01:30:00Z'),
      replies: [
        {
          id: 'reply_2',
          senderType: 'CUSTOMER',
          message: 'Can you confirm whether the screenshot is clear enough now?',
          createdAt: new Date('2026-04-22T01:05:00Z'),
        },
      ],
    } as any,
  });

  for (const message of [reviewDetail, refundDetail, premiumDetail, supportThreadDetail]) {
    assert.deepEqual(validateTelegramHtmlMessage(message), { valid: true, invalidTags: [] });
    assert.doesNotMatch(message, /https?:\/\//);
  }

  assert.match(reviewDetail, /Review detail/);
  assert.match(refundDetail, /Refund detail/);
  assert.match(premiumDetail, /Premium support detail/);
  assert.match(supportThreadDetail, /Support thread detail/);
  assertTelegramMessageBudget(reviewDetail, { maxLines: 8, maxChars: 340 });
  assertTelegramMessageBudget(refundDetail, { maxLines: 7, maxChars: 320 });
  assertTelegramMessageBudget(premiumDetail, { maxLines: 9, maxChars: 360 });
  assertTelegramMessageBudget(supportThreadDetail, { maxLines: 8, maxChars: 360 });
});
