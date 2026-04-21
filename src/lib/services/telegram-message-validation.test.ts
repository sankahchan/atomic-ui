import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTelegramHelpMessage } from '@/lib/services/telegram-admin';
import {
  findUnsupportedTelegramHtmlTags,
  normalizeTelegramUtf8Text,
  sanitizeTelegramHtmlMessage,
  validateTelegramHtmlMessage,
} from '@/lib/services/telegram-message-validation';
import { getTelegramUi } from '@/lib/services/telegram-ui';

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
