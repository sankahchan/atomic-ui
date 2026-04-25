import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPlaywrightSmokeLiveStats,
  isPlaywrightSmokeEnv,
} from './playwright-smoke';

test('isPlaywrightSmokeEnv only enables the dedicated smoke flag', () => {
  assert.equal(isPlaywrightSmokeEnv({ PLAYWRIGHT_SMOKE: '1' }), true);
  assert.equal(isPlaywrightSmokeEnv({ PLAYWRIGHT_SMOKE: '0' }), false);
  assert.equal(isPlaywrightSmokeEnv({}), false);
});

test('buildPlaywrightSmokeLiveStats returns deterministic synthetic traffic', () => {
  const result = buildPlaywrightSmokeLiveStats([
    { outlineKeyId: 'outline-b', usedBytes: BigInt(4_096) },
    { outlineKeyId: 'outline-a', usedBytes: BigInt(8_193) },
  ]);

  assert.deepEqual(result.keyStats, {
    'outline-a': 98_305,
    'outline-b': 126_976,
  });
  assert.equal(result.activeConnections, 2);
  assert.equal(result.bandwidthBps, 225_281);
});

test('buildPlaywrightSmokeLiveStats ignores blank outline key ids', () => {
  const result = buildPlaywrightSmokeLiveStats([
    { outlineKeyId: '   ', usedBytes: BigInt(1) },
  ]);

  assert.deepEqual(result, {
    activeConnections: 0,
    bandwidthBps: 0,
    keyStats: {},
  });
});
