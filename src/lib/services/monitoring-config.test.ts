import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getDefaultMonitoringSettings,
  normalizeMonitoringSettings,
} from './monitoring-config';

test('getDefaultMonitoringSettings preserves the old review threshold behavior', () => {
  const settings = getDefaultMonitoringSettings({
    pendingReviewReminderHours: 6,
  });

  assert.deepEqual(settings, {
    backupVerificationAlertCooldownHours: 20,
    telegramWebhookAlertCooldownMinutes: 60,
    telegramWebhookPendingUpdateThreshold: 20,
    adminQueueAlertCooldownHours: 6,
    reviewQueueAlertHours: 12,
  });
});

test('normalizeMonitoringSettings clamps invalid values and keeps derived defaults', () => {
  const settings = normalizeMonitoringSettings(
    {
      backupVerificationAlertCooldownHours: -12,
      telegramWebhookAlertCooldownMinutes: 999999,
      telegramWebhookPendingUpdateThreshold: 0,
      adminQueueAlertCooldownHours: 4.9,
    },
    {
      pendingReviewReminderHours: 5,
    },
  );

  assert.deepEqual(settings, {
    backupVerificationAlertCooldownHours: 0,
    telegramWebhookAlertCooldownMinutes: 1440,
    telegramWebhookPendingUpdateThreshold: 1,
    adminQueueAlertCooldownHours: 4,
    reviewQueueAlertHours: 10,
  });
});
