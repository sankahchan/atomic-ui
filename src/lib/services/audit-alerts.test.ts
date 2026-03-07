import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldTriggerAuditAlert } from './audit-alerts';

test('shouldTriggerAuditAlert fires immediately for single-match rules', () => {
  assert.equal(shouldTriggerAuditAlert({ minMatches: 1 }, 1), true);
  assert.equal(shouldTriggerAuditAlert({ minMatches: 1 }, 3), true);
});

test('shouldTriggerAuditAlert only fires when a burst threshold is first reached', () => {
  assert.equal(shouldTriggerAuditAlert({ minMatches: 3 }, 1), false);
  assert.equal(shouldTriggerAuditAlert({ minMatches: 3 }, 2), false);
  assert.equal(shouldTriggerAuditAlert({ minMatches: 3 }, 3), true);
  assert.equal(shouldTriggerAuditAlert({ minMatches: 3 }, 4), false);
});
