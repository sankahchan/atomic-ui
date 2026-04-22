import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAdminQueueHealthAlertMessage,
  buildBackupVerificationFailureAlertMessage,
  buildTelegramWebhookHealthAlertMessage,
  resolveTelegramWebhookMonitorIssue,
} from './monitoring-alerts';

test('resolveTelegramWebhookMonitorIssue returns healthy when webhook matches and has no errors', () => {
  const result = resolveTelegramWebhookMonitorIssue({
    webhookSecretConfigured: true,
    expectedWebhookUrl: 'https://example.com/panel/api/telegram/webhook',
    webhookInfo: {
      url: 'https://example.com/panel/api/telegram/webhook',
      pending_update_count: 0,
      last_error_date: null,
      last_error_message: null,
    },
  });

  assert.equal(result.healthy, true);
  assert.equal(result.issueCode, null);
  assert.equal(result.fingerprint, null);
});

test('resolveTelegramWebhookMonitorIssue detects mismatch, delivery errors, and backlog', () => {
  const result = resolveTelegramWebhookMonitorIssue({
    webhookSecretConfigured: true,
    expectedWebhookUrl: 'https://example.com/panel/api/telegram/webhook',
    webhookInfo: {
      url: 'https://wrong.example.com/api/telegram/webhook',
      pending_update_count: 42,
      last_error_date: 1_776_818_400,
      last_error_message: 'Wrong response from the webhook: 502 Bad Gateway',
    },
  });

  assert.equal(result.healthy, false);
  assert.match(result.issueCode ?? '', /url_mismatch/);
  assert.match(result.issueCode ?? '', /delivery_error/);
  assert.match(result.issueCode ?? '', /pending_backlog/);
  assert.match(result.summary ?? '', /URL mismatch/);
  assert.equal(result.pendingUpdateCount, 42);
});

test('buildBackupVerificationFailureAlertMessage lists failed backups succinctly', () => {
  const message = buildBackupVerificationFailureAlertMessage({
    locale: 'en',
    failures: [
      {
        filename: 'backup-1.postgres.zip',
        error: 'pg_restore failed while inspecting the dump.',
        restoreReady: false,
        verifiedAt: new Date('2026-04-22T10:00:00.000Z'),
      },
    ],
  });

  assert.match(message, /Backup verification failed/);
  assert.match(message, /backup-1\.postgres\.zip/);
  assert.match(message, /pg_restore failed while inspecting the dump\./);
  assert.match(message, /Backup & Restore dashboard/);
});

test('buildTelegramWebhookHealthAlertMessage includes issue summary and URLs', () => {
  const message = buildTelegramWebhookHealthAlertMessage({
    locale: 'en',
    issue: {
      healthy: false,
      issueCode: 'url_mismatch,delivery_error',
      fingerprint: 'abc',
      summary: 'URL mismatch, Telegram reported delivery errors',
      currentWebhookUrl: 'https://wrong.example.com/api/telegram/webhook',
      expectedWebhookUrl: 'https://example.com/panel/api/telegram/webhook',
      pendingUpdateCount: 7,
      lastErrorMessage: 'Wrong response from the webhook: 502 Bad Gateway',
      lastErrorAt: new Date('2026-04-22T09:30:00.000Z'),
    },
  });

  assert.match(message, /Telegram webhook health issue/);
  assert.match(message, /URL mismatch, Telegram reported delivery errors/);
  assert.match(message, /wrong\.example\.com/);
  assert.match(message, /example\.com\/panel/);
  assert.match(message, /Pending updates: <b>7<\/b>/);
});

test('buildAdminQueueHealthAlertMessage summarizes support and review backlog', () => {
  const message = buildAdminQueueHealthAlertMessage({
    locale: 'en',
    supportOverdueCount: 2,
    oldestSupportOverdueMinutes: 135,
    supportThreadCodes: ['SUP-101', 'SUP-102'],
    pendingReviewCount: 5,
    unclaimedReviewCount: 3,
    oldestReviewAgeMinutes: 780,
    reviewOrderCodes: ['ORD-201', 'ORD-202'],
    reviewThresholdHours: 12,
  });

  assert.match(message, /Admin queue aging/);
  assert.match(message, /Support overdue: <b>2<\/b>/);
  assert.match(message, /SUP-101, SUP-102/);
  assert.match(message, /Review pending: <b>5<\/b>/);
  assert.match(message, /Unclaimed: <b>3<\/b>/);
  assert.match(message, /ORD-201, ORD-202/);
  assert.match(message, /12 hour\(s\)/);
});
