import { db } from '@/lib/db';
import {
  selectKeyByLeastLoad,
  selectLeastLoadedServer,
  type LoadBalancerAlgorithm,
} from '@/lib/services/load-balancer';

export interface DynamicRoutingAccessKeyCandidate {
  id: string;
  name: string;
  status: string;
  accessUrl?: string | null;
  lastTrafficAt?: Date | null;
  lastUsedAt?: Date | null;
  server: {
    id: string;
    name: string;
    countryCode?: string | null;
  };
}

export interface DynamicRoutingSelectionResult {
  key: DynamicRoutingAccessKeyCandidate;
  selectedIndex: number;
  algorithm: LoadBalancerAlgorithm;
}

export function getDynamicRoutingAlgorithmLabel(algorithm: LoadBalancerAlgorithm) {
  switch (algorithm) {
    case 'IP_HASH':
      return 'IP Hash';
    case 'ROUND_ROBIN':
      return 'Round Robin';
    case 'LEAST_LOAD':
      return 'Least Load';
    case 'RANDOM':
      return 'Random';
    default:
      return algorithm;
  }
}

export function getDynamicRoutingAlgorithmHint(algorithm: LoadBalancerAlgorithm) {
  switch (algorithm) {
    case 'IP_HASH':
      return 'Clients with the same public IP stay on the same backend when possible.';
    case 'ROUND_ROBIN':
      return 'Each new client fetch advances to the next attached backend.';
    case 'LEAST_LOAD':
      return 'The healthiest backend with the lowest current pressure wins.';
    case 'RANDOM':
      return 'Each client fetch can land on a different backend.';
    default:
      return 'Backend selection is managed automatically.';
  }
}

function crc32(value: string): number {
  let crc = 0xffffffff;
  for (let i = 0; i < value.length; i += 1) {
    crc ^= value.charCodeAt(i);
    for (let j = 0; j < 8; j += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export async function selectDynamicAccessKeyForClient(input: {
  dakId: string;
  accessKeys: DynamicRoutingAccessKeyCandidate[];
  algorithm: LoadBalancerAlgorithm;
  clientIp: string;
  lastSelectedKeyIndex: number;
  persistRoundRobin?: boolean;
}): Promise<DynamicRoutingSelectionResult | null> {
  const { accessKeys, algorithm, clientIp, dakId, lastSelectedKeyIndex, persistRoundRobin } = input;

  if (accessKeys.length === 0) {
    return null;
  }

  if (accessKeys.length === 1) {
    return {
      key: accessKeys[0],
      selectedIndex: 0,
      algorithm,
    };
  }

  let selectedIndex = 0;

  switch (algorithm) {
    case 'IP_HASH': {
      selectedIndex = crc32(clientIp || '127.0.0.1') % accessKeys.length;
      break;
    }
    case 'ROUND_ROBIN': {
      selectedIndex = (lastSelectedKeyIndex + 1) % accessKeys.length;
      if (persistRoundRobin) {
        await db.dynamicAccessKey.update({
          where: { id: dakId },
          data: { lastSelectedKeyIndex: selectedIndex },
        });
      }
      break;
    }
    case 'LEAST_LOAD': {
      const bestIndex = await selectKeyByLeastLoad(accessKeys.map((key, index) => ({
        ...key,
        _originalIndex: index,
      })));
      selectedIndex = bestIndex ?? 0;
      break;
    }
    case 'RANDOM':
    default: {
      selectedIndex = Math.floor(Math.random() * accessKeys.length);
      break;
    }
  }

  return {
    key: accessKeys[selectedIndex],
    selectedIndex,
    algorithm,
  };
}

export async function getSelfManagedServerCandidate(input: {
  serverTagIds: string[];
  algorithm: LoadBalancerAlgorithm;
}) {
  const { serverTagIds, algorithm } = input;

  if (algorithm === 'LEAST_LOAD') {
    const leastLoaded = await selectLeastLoadedServer(serverTagIds);
    if (!leastLoaded) {
      return null;
    }

    return {
      serverId: leastLoaded.serverId,
      serverName: leastLoaded.serverName,
      countryCode: leastLoaded.countryCode ?? null,
      reason: leastLoaded.reasons.join(' · '),
    };
  }

  const servers = await db.server.findMany({
    where: serverTagIds.length > 0
      ? {
          isActive: true,
          tags: {
            some: {
              tagId: { in: serverTagIds },
            },
          },
        }
      : {
          isActive: true,
        },
    select: {
      id: true,
      name: true,
      countryCode: true,
    },
    orderBy: {
      name: 'asc',
    },
  });

  if (servers.length === 0) {
    return null;
  }

  const fallback = servers[0];

  return {
    serverId: fallback.id,
    serverName: fallback.name,
    countryCode: fallback.countryCode ?? null,
    reason: algorithm === 'RANDOM'
      ? 'A backend will be chosen randomly when the next client fetch happens.'
      : 'A backend will be created on demand when the next client fetch happens.',
  };
}
