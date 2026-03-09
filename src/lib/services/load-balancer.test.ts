import assert from 'node:assert/strict';
import test from 'node:test';
import {
  planRebalanceRecommendations,
  rankServersForAssignment,
} from './load-balancer';

test('rankServersForAssignment prioritizes healthy servers with free capacity', () => {
  const ranked = rankServersForAssignment([
    {
      serverId: 'busy',
      serverName: 'Busy',
      activeKeyCount: 18,
      totalBandwidthBytes: 900,
      isActive: true,
      lifecycleMode: 'ACTIVE',
      maxKeys: 20,
    },
    {
      serverId: 'light',
      serverName: 'Light',
      activeKeyCount: 4,
      totalBandwidthBytes: 200,
      isActive: true,
      lifecycleMode: 'ACTIVE',
      maxKeys: 20,
    },
    {
      serverId: 'draining',
      serverName: 'Draining',
      activeKeyCount: 1,
      totalBandwidthBytes: 50,
      isActive: true,
      lifecycleMode: 'DRAINING',
      maxKeys: 20,
    },
  ]);

  assert.equal(ranked[0].serverId, 'light');
  assert.equal(ranked[0].isAssignable, true);
  assert.equal(ranked[2].serverId, 'draining');
  assert.equal(ranked[2].isAssignable, false);
});

test('planRebalanceRecommendations moves offline standalone keys to lighter servers', () => {
  const plan = planRebalanceRecommendations([
    {
      serverId: 'busy',
      serverName: 'Busy',
      activeKeyCount: 16,
      totalBandwidthBytes: 900,
      isActive: true,
      lifecycleMode: 'ACTIVE',
      maxKeys: 18,
      keys: [
        {
          id: 'k1',
          name: 'Dormant A',
          usedBytes: BigInt(5),
          lastUsedAt: new Date('2025-01-01T00:00:00.000Z'),
          activeSessionCount: 0,
          dynamicKeyId: null,
        },
        {
          id: 'k2',
          name: 'Dormant B',
          usedBytes: BigInt(8),
          lastUsedAt: new Date('2025-01-02T00:00:00.000Z'),
          activeSessionCount: 0,
          dynamicKeyId: null,
        },
        {
          id: 'k3',
          name: 'Attached Dynamic',
          usedBytes: BigInt(1),
          lastUsedAt: new Date('2025-01-03T00:00:00.000Z'),
          activeSessionCount: 0,
          dynamicKeyId: 'dak-1',
        },
      ],
    },
    {
      serverId: 'light',
      serverName: 'Light',
      activeKeyCount: 3,
      totalBandwidthBytes: 120,
      isActive: true,
      lifecycleMode: 'ACTIVE',
      maxKeys: 18,
      keys: [],
    },
    {
      serverId: 'maintenance',
      serverName: 'Maintenance',
      activeKeyCount: 2,
      totalBandwidthBytes: 40,
      isActive: true,
      lifecycleMode: 'MAINTENANCE',
      maxKeys: 18,
      keys: [],
    },
  ], { maxMoves: 2 });

  assert.equal(plan.summary.overloadedServers, 1);
  assert.equal(plan.recommendations.length, 1);
  assert.equal(plan.recommendations[0].sourceServerId, 'busy');
  assert.equal(plan.recommendations[0].targetServerId, 'light');
  assert.deepEqual(plan.recommendations[0].keyNames, ['Dormant A', 'Dormant B']);
});
