import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ACCESS_KEY_SNAPSHOT_TYPE,
  DYNAMIC_KEY_SNAPSHOT_TYPE,
  buildDynamicKeySnapshot,
  isServerBandwidthSnapshot,
  resolveUsageSnapshotKeyType,
} from './usage-snapshot-attribution';

test('dynamic key snapshots carry the last resolved server', () => {
  const snapshot = buildDynamicKeySnapshot({
    id: 'dynamic-1',
    usedBytes: BigInt(2048),
    lastResolvedServerId: 'server-7',
    deltaBytes: BigInt(512),
  });

  assert.equal(snapshot.keyId, 'dynamic-1');
  assert.equal(snapshot.keyType, DYNAMIC_KEY_SNAPSHOT_TYPE);
  assert.equal(snapshot.serverId, 'server-7');
  assert.equal(snapshot.usedBytes, BigInt(2048));
  assert.equal(snapshot.deltaBytes, BigInt(512));

  const unresolved = buildDynamicKeySnapshot({
    id: 'dynamic-2',
    usedBytes: BigInt(0),
    lastResolvedServerId: null,
    deltaBytes: BigInt(0),
  });
  assert.equal(unresolved.serverId, null);
});

test('snapshot types are resolved without accepting unknown values', () => {
  assert.equal(resolveUsageSnapshotKeyType(ACCESS_KEY_SNAPSHOT_TYPE), ACCESS_KEY_SNAPSHOT_TYPE);
  assert.equal(resolveUsageSnapshotKeyType(DYNAMIC_KEY_SNAPSHOT_TYPE), DYNAMIC_KEY_SNAPSHOT_TYPE);
  assert.equal(resolveUsageSnapshotKeyType(null), null);
  assert.equal(resolveUsageSnapshotKeyType('OTHER'), null);
});

test('only access key snapshots count toward server bandwidth totals', () => {
  assert.equal(isServerBandwidthSnapshot({ keyType: ACCESS_KEY_SNAPSHOT_TYPE }), true);
  assert.equal(isServerBandwidthSnapshot({ keyType: DYNAMIC_KEY_SNAPSHOT_TYPE }), false);
  assert.equal(isServerBandwidthSnapshot({ keyType: null }), false);
});
