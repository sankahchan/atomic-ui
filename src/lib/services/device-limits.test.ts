import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEVICE_LIMIT_DISABLE_DELAY_MS,
  buildDeviceEvidenceMap,
  buildDeviceFingerprint,
  deriveDeviceLimitStage,
} from '@/lib/services/device-limits';

test('buildDeviceFingerprint normalizes user agent casing', () => {
  const a = buildDeviceFingerprint('1.2.3.4', 'Mozilla/5.0');
  const b = buildDeviceFingerprint('1.2.3.4', 'mozilla/5.0');

  assert.equal(a, b);
});

test('buildDeviceEvidenceMap deduplicates by ip and user agent', () => {
  const now = new Date('2026-04-04T00:00:00.000Z');
  const map = buildDeviceEvidenceMap([
    {
      accessKeyId: 'key_1',
      ip: '1.1.1.1',
      userAgent: 'App A',
      platform: 'iOS',
      createdAt: now,
    },
    {
      accessKeyId: 'key_1',
      ip: '1.1.1.1',
      userAgent: 'App A',
      platform: 'iOS',
      createdAt: new Date(now.getTime() + 10_000),
    },
    {
      accessKeyId: 'key_1',
      ip: '1.1.1.1',
      userAgent: 'App B',
      platform: 'Android',
      createdAt: new Date(now.getTime() + 20_000),
    },
  ]);

  assert.equal(map.get('key_1')?.size, 2);
});

test('deriveDeviceLimitStage returns pending disable after warning is sent', () => {
  const now = new Date('2026-04-04T01:00:00.000Z');
  const exceededAt = new Date(now.getTime() - DEVICE_LIMIT_DISABLE_DELAY_MS + 60_000);

  const stage = deriveDeviceLimitStage({
    status: 'ACTIVE',
    maxDevices: 2,
    observedDevices: 3,
    deviceLimitExceededAt: exceededAt,
    deviceLimitWarningSentAt: exceededAt,
    now,
  });

  assert.equal(stage.overLimit, true);
  assert.equal(stage.stage, 'PENDING_DISABLE');
  assert.ok(stage.disableAt instanceof Date);
});
