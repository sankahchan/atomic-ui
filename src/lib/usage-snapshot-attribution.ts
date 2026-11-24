/**
 * Shared helpers for attributing usage snapshots to keys and servers.
 *
 * Dynamic access keys aggregate traffic from their attached access keys, so
 * their snapshots are tracked as a separate key type. When a snapshot does
 * carry a serverId it is the server that most recently resolved the dynamic
 * key; access-key snapshots remain the source of truth for server bandwidth
 * totals to avoid double counting the same traffic.
 */

export const ACCESS_KEY_SNAPSHOT_TYPE = 'ACCESS_KEY';
export const DYNAMIC_KEY_SNAPSHOT_TYPE = 'DYNAMIC_KEY';

export type UsageSnapshotKeyType =
  | typeof ACCESS_KEY_SNAPSHOT_TYPE
  | typeof DYNAMIC_KEY_SNAPSHOT_TYPE;

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
}): {
  serverId: string | null;
  keyId: string;
  keyType: UsageSnapshotKeyType;
  usedBytes: bigint;
  deltaBytes: bigint;
} {
  return {
    serverId: input.lastResolvedServerId,
    keyId: input.id,
    keyType: DYNAMIC_KEY_SNAPSHOT_TYPE,
    usedBytes: input.usedBytes,
    deltaBytes: input.deltaBytes,
  };
}

export function isServerBandwidthSnapshot(snapshot: { keyType: string | null }): boolean {
  return snapshot.keyType === ACCESS_KEY_SNAPSHOT_TYPE;
}
