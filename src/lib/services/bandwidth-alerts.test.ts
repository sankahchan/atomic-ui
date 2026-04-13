import assert from 'node:assert/strict';
import test from 'node:test';

import { formatThresholdCountSummary } from './bandwidth-alerts';

test('formatThresholdCountSummary reports exact threshold counts in order', () => {
  assert.equal(formatThresholdCountSummary({ 95: 2, 70: 1, 85: 3 }), '1 at 70%, 3 at 85%, 2 at 95%');
});

test('formatThresholdCountSummary returns none when no thresholds are pending', () => {
  assert.equal(formatThresholdCountSummary({}), 'none');
});
