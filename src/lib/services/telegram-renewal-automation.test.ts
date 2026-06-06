import assert from 'node:assert/strict';
import test from 'node:test';

import { getDefaultTelegramSalesSettings } from '@/lib/services/telegram-sales';
import {
  buildTelegramRenewalAutomationSnapshotMap,
  evaluateTelegramRenewalReminderCandidate,
} from '@/lib/services/telegram-renewal-automation';

test('renewal automation blocks repeated sends for the same wave until a renewal happens', () => {
  const settings = getDefaultTelegramSalesSettings();
  settings.renewalReminderExpiring3dEnabled = true;
  settings.renewalReminderExpiring1dEnabled = true;
  settings.renewalReminderDepletedEnabled = true;

  const now = new Date('2026-06-06T12:00:00.000Z');
  const snapshots = buildTelegramRenewalAutomationSnapshotMap([
    {
      entityId: 'key_1',
      action: 'ACCESS_KEY_RENEWAL_REMINDER_TRIGGERED',
      details: JSON.stringify({ wave: 'EXPIRING_3D', automation: true }),
      createdAt: new Date('2026-06-05T09:00:00.000Z'),
    },
  ]);

  const blocked = evaluateTelegramRenewalReminderCandidate({
    candidate: {
      accessKeyId: 'key_1',
      keyName: 'Trial',
      status: 'ACTIVE',
      expiresAt: new Date('2026-06-08T10:00:00.000Z'),
      dataLimitBytes: null,
      usedBytes: BigInt(0),
      telegramDeliveryEnabled: true,
      destinationChatId: '12345',
    },
    snapshot: snapshots.get('key_1'),
    settings,
    now,
  });

  assert.equal(blocked.wave, 'EXPIRING_3D');
  assert.equal(blocked.eligible, false);
  assert.equal(blocked.blockedReason, 'ALREADY_SENT_FOR_WAVE');

  const renewedSnapshots = buildTelegramRenewalAutomationSnapshotMap([
    {
      entityId: 'key_1',
      action: 'ACCESS_KEY_RENEWAL_REMINDER_TRIGGERED',
      details: JSON.stringify({ wave: 'EXPIRING_3D', automation: true }),
      createdAt: new Date('2026-06-05T09:00:00.000Z'),
    },
    {
      entityId: 'key_1',
      action: 'ACCESS_KEY_RENEWED',
      details: JSON.stringify({ months: 1 }),
      createdAt: new Date('2026-06-05T11:00:00.000Z'),
    },
  ]);

  const eligibleAgain = evaluateTelegramRenewalReminderCandidate({
    candidate: {
      accessKeyId: 'key_1',
      keyName: 'Trial',
      status: 'ACTIVE',
      expiresAt: new Date('2026-06-08T10:00:00.000Z'),
      dataLimitBytes: null,
      usedBytes: BigInt(0),
      telegramDeliveryEnabled: true,
      destinationChatId: '12345',
    },
    snapshot: renewedSnapshots.get('key_1'),
    settings,
    now,
  });

  assert.equal(eligibleAgain.wave, 'EXPIRING_3D');
  assert.equal(eligibleAgain.eligible, true);
  assert.equal(eligibleAgain.blockedReason, null);
});

test('renewal automation respects cooldowns and depleted wave toggles', () => {
  const settings = getDefaultTelegramSalesSettings();
  settings.renewalReminderDepletedEnabled = false;
  const now = new Date('2026-06-06T12:00:00.000Z');

  const disabledWave = evaluateTelegramRenewalReminderCandidate({
    candidate: {
      accessKeyId: 'key_2',
      keyName: 'Quota hit',
      status: 'DEPLETED',
      expiresAt: null,
      dataLimitBytes: BigInt(10),
      usedBytes: BigInt(10),
      telegramDeliveryEnabled: true,
      destinationChatId: '12345',
    },
    snapshot: null,
    settings,
    now,
  });

  assert.equal(disabledWave.wave, 'DEPLETED');
  assert.equal(disabledWave.eligible, false);
  assert.equal(disabledWave.blockedReason, 'WAVE_DISABLED');

  settings.renewalReminderDepletedEnabled = true;
  const cooldownSnapshots = buildTelegramRenewalAutomationSnapshotMap([
    {
      entityId: 'key_3',
      action: 'ACCESS_KEY_RENEWAL_REMINDER_SENT',
      details: null,
      createdAt: new Date('2026-06-06T04:30:00.000Z'),
    },
  ]);

  const coolingDown = evaluateTelegramRenewalReminderCandidate({
    candidate: {
      accessKeyId: 'key_3',
      keyName: 'Soon expiring',
      status: 'ACTIVE',
      expiresAt: new Date('2026-06-07T08:00:00.000Z'),
      dataLimitBytes: null,
      usedBytes: BigInt(0),
      telegramDeliveryEnabled: true,
      destinationChatId: '12345',
    },
    snapshot: cooldownSnapshots.get('key_3'),
    settings,
    now,
  });

  assert.equal(coolingDown.wave, 'EXPIRING_1D');
  assert.equal(coolingDown.eligible, false);
  assert.equal(coolingDown.blockedReason, 'COOLDOWN');
  assert.ok(coolingDown.cooldownUntil);
});
