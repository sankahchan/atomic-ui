/**
 * Shared helpers for attributing usage snapshots to keys and servers.
 *
 * Dynamic access keys aggregate traffic from their attached access keys, so
 * their snapshots are tracked as a separate key type. When a snapshot does
 * carry a serverId it is the server that most recently resolved the dynamic
 * key. When attached access-key deltas are available, the dynamic total is
 * split proportionally across those servers so per-server top consumers do
 * not credit everything to the most recently resolved server. Access-key
 * snapshots remain the source of truth for server bandwidth totals to avoid
 * double counting the same traffic.
 */

export const ACCESS_KEY_SNAPSHOT_TYPE = 'ACCESS_KEY';
export const DYNAMIC_KEY_SNAPSHOT_TYPE = 'DYNAMIC_KEY';

export type UsageSnapshotKeyType =
  | typeof ACCESS_KEY_SNAPSHOT_TYPE
  | typeof DYNAMIC_KEY_SNAPSHOT_TYPE;

export type UsageSnapshotRow = {
  serverId: string | null;
  keyId: string;
  keyType: UsageSnapshotKeyType;
  usedBytes: bigint;
  deltaBytes: bigint;
};

export function resolveUsageSnapshotKeyType(value: string | null): UsageSnapshotKeyType | null {
  if (value === ACCESS_KEY_SNAPSHOT_TYPE || value === DYNAMIC_KEY_SNAPSHOT_TYPE) {
    return value;
  }
  return null;
}

export function buildDynamicKeySnapshot(input: {
  id: string;
  usedBytes: bigint;
  lastResolvedServerId: string | null;
  deltaBytes: bigint;
}): UsageSnapshotRow {
  return {
    serverId: input.lastResolvedServerId,
    keyId: input.id,
    keyType: DYNAMIC_KEY_SNAPSHOT_TYPE,
    usedBytes: input.usedBytes,
    deltaBytes: input.deltaBytes,
  };
}

/**
 * Split a dynamic key's usage delta across the servers of its attached
 * access keys. The allocation is proportional to each server's access-key
 * delta, with largest-remainder rounding so the rows still sum to the exact
 * dynamic total. Falls back to the last resolved server when no usable
 * per-server deltas exist.
 */
export function buildDynamicKeyServerSnapshots(input: {
  id: string;
  usedBytes: bigint;
  fallbackServerId: string | null;
  deltaBytes: bigint;
  serverDeltas: ReadonlyMap<string, bigint>;
}): UsageSnapshotRow[] {
  const weights = Array.from(input.serverDeltas.entries())
    .filter(([serverId, delta]) => serverId.length > 0 && delta > BigInt(0))
    .sort(([a], [b]) => a.localeCompare(b));

  const totalWeight = weights.reduce((sum, [, delta]) => sum + delta, BigInt(0));
  if (input.deltaBytes <= BigInt(0) || totalWeight <= BigInt(0)) {
    return [buildDynamicKeySnapshot({
      id: input.id,
      usedBytes: input.usedBytes,
      lastResolvedServerId: input.fallbackServerId,
      deltaBytes: input.deltaBytes,
    })];
  }

  const shares = weights.map(([serverId, weight]) => {
    const scaled = input.deltaBytes * weight;
    return {
      serverId,
      deltaBytes: scaled / totalWeight,
      remainder: scaled % totalWeight,
    };
  });

  let leftover = input.deltaBytes - shares.reduce((sum, share) => sum + share.deltaBytes, BigInt(0));
  const largestRemainderFirst = [...shares].sort((a, b) => {
    if (a.remainder > b.remainder) return -1;
    if (a.remainder < b.remainder) return 1;
    return a.serverId.localeCompare(b.serverId);
  });

  for (const share of largestRemainderFirst) {
    if (leftover <= BigInt(0)) break;
    share.deltaBytes += BigInt(1);
    leftover -= BigInt(1);
  }

  return shares
    .filter((share) => share.deltaBytes > BigInt(0))
    .map((share) => ({
      serverId: share.serverId,
      keyId: input.id,
      keyType: DYNAMIC_KEY_SNAPSHOT_TYPE,
      usedBytes: input.usedBytes,
      deltaBytes: share.deltaBytes,
    }));
}

export function isServerBandwidthSnapshot(snapshot: { keyType: string | null }): boolean {
  return snapshot.keyType === ACCESS_KEY_SNAPSHOT_TYPE;
}
