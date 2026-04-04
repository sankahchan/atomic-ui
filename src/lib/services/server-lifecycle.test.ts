import assert from 'node:assert/strict';
import test from 'node:test';
import { canAssignKeysToServer } from './server-lifecycle';

test('canAssignKeysToServer rejects inactive servers', () => {
  const result = canAssignKeysToServer({
    isActive: false,
    lifecycleMode: 'ACTIVE',
  });

  assert.equal(result.allowed, false);
  assert.match(result.reason ?? '', /inactive/i);
});

test('canAssignKeysToServer rejects draining and maintenance servers', () => {
  const draining = canAssignKeysToServer({
    isActive: true,
    lifecycleMode: 'DRAINING',
  });
  const maintenance = canAssignKeysToServer({
    isActive: true,
    lifecycleMode: 'MAINTENANCE',
  });

  assert.equal(draining.allowed, false);
  assert.match(draining.reason ?? '', /draining/i);
  assert.equal(maintenance.allowed, false);
  assert.match(maintenance.reason ?? '', /maintenance/i);
});

test('canAssignKeysToServer allows draining when explicitly requested', () => {
  const result = canAssignKeysToServer({
    isActive: true,
    lifecycleMode: 'DRAINING',
  }, {
    allowDraining: true,
  });

  assert.deepEqual(result, {
    allowed: true,
    reason: null,
  });
});

test('canAssignKeysToServer allows draining even when the old manual flag is false', () => {
  const result = canAssignKeysToServer({
    isActive: true,
    lifecycleMode: 'DRAINING',
    allowManualAssignmentsWhenDraining: false,
  }, {
    allowDraining: true,
  });

  assert.deepEqual(result, {
    allowed: true,
    reason: null,
  });
});

test('canAssignKeysToServer treats unknown lifecycle modes as active', () => {
  const result = canAssignKeysToServer({
    isActive: true,
    lifecycleMode: 'UNKNOWN_MODE',
  });

  assert.deepEqual(result, {
    allowed: true,
    reason: null,
  });
});
