import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ACCESS_KEY_SNAPSHOT_TYPE,
  DYNAMIC_KEY_SNAPSHOT_TYPE,
  buildDynamicKeyServerSnapshots,
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

test('dynamic usage is split proportionally across attached-key servers', () => {
  const rows = buildDynamicKeyServerSnapshots({
    id: 'dynamic-1',
    usedBytes: BigInt(4096),
    fallbackServerId: 'server-fallback',
    deltaBytes: BigInt(100),
    serverDeltas: new Map([
      ['server-a', BigInt(30)],
      ['server-b', BigInt(10)],
    ]),
  });

  assert.deepEqual(rows.map((row) => [row.serverId, row.deltaBytes]), [
    ['server-a', BigInt(75)],
    ['server-b', BigInt(25)],
  ]);
  assert.equal(rows.reduce((sum, row) => sum + row.deltaBytes, BigInt(0)), BigInt(100));
  assert.ok(rows.every((row) => row.keyType === DYNAMIC_KEY_SNAPSHOT_TYPE));
  assert.ok(rows.every((row) => row.usedBytes === BigInt(4096)));
});

test('leftover bytes go to the largest remainders with deterministic ties', () => {
  const rows = buildDynamicKeyServerSnapshots({
    id: 'dynamic-2',
    usedBytes: BigInt(512),
    fallbackServerId: null,
    deltaBytes: BigInt(10),
    serverDeltas: new Map([
      ['server-c', BigInt(1)],
      ['server-a', BigInt(1)],
      ['server-b', BigInt(1)],
    ]),
  });

  assert.deepEqual(rows.map((row) => [row.serverId, row.deltaBytes]), [
    ['server-a', BigInt(4)],
    ['server-b', BigInt(3)],
    ['server-c', BigInt(3)],
  ]);
});

test('dynamic usage falls back to the resolved server when no split is available', () => {
  const noWeights = buildDynamicKeyServerSnapshots({
    id: 'dynamic-3',
    usedBytes: BigInt(256),
    fallbackServerId: 'server-7',
    deltaBytes: BigInt(64),
    serverDeltas: new Map(),
  });
  assert.equal(noWeights.length, 1);
  assert.equal(noWeights[0].serverId, 'server-7');
  assert.equal(noWeights[0].deltaBytes, BigInt(64));

  const reset = buildDynamicKeyServerSnapshots({
    id: 'dynamic-4',
    usedBytes: BigInt(0),
    fallbackServerId: 'server-8',
    deltaBytes: BigInt(0),
    serverDeltas: new Map([['server-a', BigInt(20)]]),
  });
  assert.equal(reset.length, 1);
  assert.equal(reset[0].serverId, 'server-8');
  assert.equal(reset[0].deltaBytes, BigInt(0));
});

test('large bigint usage is allocated without precision loss', () => {
  const total = BigInt('9007199254740993');
  const rows = buildDynamicKeyServerSnapshots({
    id: 'dynamic-5',
    usedBytes: total,
    fallbackServerId: null,
    deltaBytes: total,
    serverDeltas: new Map([
      ['server-a', BigInt(1)],
      ['server-b', BigInt(2)],
    ]),
  });

  assert.deepEqual(rows.map((row) => row.deltaBytes), [
    BigInt('3002399751580331'),
    BigInt('6004799503160662'),
  ]);
  assert.equal(rows.reduce((sum, row) => sum + row.deltaBytes, BigInt(0)), total);
});
