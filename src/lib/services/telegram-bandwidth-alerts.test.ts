import test from 'node:test';
import assert from 'node:assert/strict';

import { decideUsageAlert } from './telegram-bandwidth-alerts';

test('80% triggers once per key', () => {
  assert.deepEqual(decideUsageAlert({ percent: 80, alert80: false, alert90: false }), {
    threshold: 80,
    markAlert80: true,
    markAlert90: false,
    resetAlerts: false,
  });
  assert.equal(decideUsageAlert({ percent: 85, alert80: true, alert90: false }).threshold, null);
});

test('90% supersedes an unsent 80% alert', () => {
  const decision = decideUsageAlert({ percent: 93, alert80: false, alert90: false });
  assert.equal(decision.threshold, 90);
  assert.equal(decision.markAlert80, true);
  assert.equal(decision.markAlert90, true);
});

test('90% alert is only sent once', () => {
  assert.equal(decideUsageAlert({ percent: 95, alert80: true, alert90: true }).threshold, null);
  assert.deepEqual(decideUsageAlert({ percent: 95, alert80: false, alert90: true }), {
    threshold: null,
    markAlert80: true,
    markAlert90: false,
    resetAlerts: false,
  });
});

test('alerts reset after usage drops below 50%', () => {
  assert.deepEqual(decideUsageAlert({ percent: 42, alert80: true, alert90: true }), {
    threshold: null,
    markAlert80: false,
    markAlert90: false,
    resetAlerts: true,
  });
  assert.equal(decideUsageAlert({ percent: 42, alert80: false, alert90: false }).resetAlerts, false);
});

test('invalid usage percentages are ignored', () => {
  for (const percent of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
    assert.equal(decideUsageAlert({ percent, alert80: false, alert90: false }).threshold, null);
  }
});
