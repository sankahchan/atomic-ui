import assert from 'node:assert/strict';
import test from 'node:test';

import { getQuotaAlertState } from './access-key-policies';

test('getQuotaAlertState returns pending thresholds below hard limit', () => {
  const state = getQuotaAlertState({
    usagePercent: 92,
    thresholds: '80,90',
    sentThresholds: '[80]',
  });

  assert.deepEqual(state.crossedThresholds, [80, 90]);
  assert.deepEqual(state.pendingThresholds, [90]);
  assert.equal(state.highestCrossedThreshold, 90);
  assert.equal(state.recommendedLevel, 90);
  assert.equal(state.hasReachedLimit, false);
  assert.equal(state.nextThreshold, null);
});

test('getQuotaAlertState recommends disabled notice when usage reaches 100%', () => {
  const state = getQuotaAlertState({
    usagePercent: 100,
    thresholds: '80,90',
    sentThresholds: '[80,90]',
  });

  assert.deepEqual(state.pendingThresholds, []);
  assert.equal(state.highestCrossedThreshold, 90);
  assert.equal(state.recommendedLevel, 'DISABLED');
  assert.equal(state.hasReachedLimit, true);
});
