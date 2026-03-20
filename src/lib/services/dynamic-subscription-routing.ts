import { db } from '@/lib/db';
import {
  getServerLoadStats,
  selectKeyByLeastLoad,
  type LoadBalancerAlgorithm,
  type RegionPreferenceMode,
} from '@/lib/services/load-balancer';

export interface DynamicRoutingPreferences {
  preferredServerIds: string[];
  preferredCountryCodes: string[];
  preferredRegionMode: RegionPreferenceMode;
}

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

interface DynamicRoutingServerCandidate {
  id: string;
  name: string;
  countryCode?: string | null;
}

export interface DynamicRoutingPreferenceResolution {
  preferredRegionMode: RegionPreferenceMode;
  preferredServerIds: string[];
  preferredCountryCodes: string[];
  scope: 'UNRESTRICTED' | 'SERVER' | 'COUNTRY' | 'FALLBACK' | 'NONE';
  note: string;
}

export interface DynamicRoutingSelectionResult {
  key: DynamicRoutingAccessKeyCandidate;
  selectedIndex: number;
  algorithm: LoadBalancerAlgorithm;
  preferenceResolution: DynamicRoutingPreferenceResolution;
}

function normalizeCountryCode(countryCode: string | null | undefined) {
  if (!countryCode) {
    return null;
  }

  const normalized = countryCode.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) ? normalized : null;
}

function normalizeStringArray(values: string[] | null | undefined) {
  return Array.from(
    new Set(
      (values ?? [])
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function normalizeCountryCodes(values: string[] | null | undefined) {
  return Array.from(
    new Set(
      (values ?? [])
        .map((value) => normalizeCountryCode(value))
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

export function normalizeDynamicRoutingPreferences(
  preferences?: Partial<DynamicRoutingPreferences> | null,
): DynamicRoutingPreferences {
  return {
    preferredServerIds: normalizeStringArray(preferences?.preferredServerIds),
    preferredCountryCodes: normalizeCountryCodes(preferences?.preferredCountryCodes),
    preferredRegionMode: preferences?.preferredRegionMode === 'ONLY' ? 'ONLY' : 'PREFER',
  };
}

export function parseDynamicRoutingPreferences(input: {
  preferredServerIdsJson?: string | null;
  preferredCountryCodesJson?: string | null;
  preferredRegionMode?: string | null;
}): DynamicRoutingPreferences {
  const parseJsonArray = (value: string | null | undefined) => {
    if (!value) {
      return [];
    }

    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  };

  return normalizeDynamicRoutingPreferences({
    preferredServerIds: parseJsonArray(input.preferredServerIdsJson),
    preferredCountryCodes: parseJsonArray(input.preferredCountryCodesJson),
    preferredRegionMode: input.preferredRegionMode === 'ONLY' ? 'ONLY' : 'PREFER',
  });
}

function getPreferenceResolutionNote(
  resolution: DynamicRoutingPreferenceResolution['scope'],
  preferences: DynamicRoutingPreferences,
) {
  if (resolution === 'UNRESTRICTED') {
    return 'No preferred regions or servers are configured.';
  }

  if (resolution === 'SERVER') {
    return preferences.preferredRegionMode === 'ONLY'
      ? 'Restricted to the preferred server list.'
      : 'Using the preferred server list before any fallback.';
  }

  if (resolution === 'COUNTRY') {
    return preferences.preferredRegionMode === 'ONLY'
      ? 'Restricted to the preferred region list.'
      : 'Using the preferred region list before any fallback.';
  }

  if (resolution === 'FALLBACK') {
    return 'No preferred servers or regions are currently available, so routing fell back to the remaining pool.';
  }

  return 'No active servers or backends match the current routing preferences.';
}

function resolvePreferencePool<T extends { server: { id: string; countryCode?: string | null } }>(
  items: T[],
  preferences?: Partial<DynamicRoutingPreferences> | null,
): {
  items: T[];
  resolution: DynamicRoutingPreferenceResolution;
} {
  const normalized = normalizeDynamicRoutingPreferences(preferences);

  if (normalized.preferredServerIds.length === 0 && normalized.preferredCountryCodes.length === 0) {
    return {
      items,
      resolution: {
        ...normalized,
        scope: 'UNRESTRICTED',
        note: getPreferenceResolutionNote('UNRESTRICTED', normalized),
      },
    };
  }

  const matchedServerIds = new Set<string>();
  const serverMatches = normalized.preferredServerIds.flatMap((serverId) => {
    const matches = items.filter((item) => item.server.id === serverId);
    matches.forEach((item) => matchedServerIds.add(item.server.id));
    return matches;
  });

  const remainingAfterServer = items.filter((item) => !matchedServerIds.has(item.server.id));
  const matchedCountryKeys = new Set<string>();
  const countryMatches = normalized.preferredCountryCodes.flatMap((countryCode) => {
    const matches = remainingAfterServer.filter(
      (item) => normalizeCountryCode(item.server.countryCode) === countryCode,
    );
    matches.forEach((item) => matchedCountryKeys.add(`${item.server.id}:${countryCode}`));
    return matches;
  });

  const remaining = remainingAfterServer.filter((item) => {
    const countryCode = normalizeCountryCode(item.server.countryCode);
    return !countryCode || !matchedCountryKeys.has(`${item.server.id}:${countryCode}`);
  });

  if (serverMatches.length > 0) {
    return {
      items: serverMatches,
      resolution: {
        ...normalized,
        scope: 'SERVER',
        note: getPreferenceResolutionNote('SERVER', normalized),
      },
    };
  }

  if (countryMatches.length > 0) {
    return {
      items: countryMatches,
      resolution: {
        ...normalized,
        scope: 'COUNTRY',
        note: getPreferenceResolutionNote('COUNTRY', normalized),
      },
    };
  }

  if (normalized.preferredRegionMode === 'ONLY') {
    return {
      items: [],
      resolution: {
        ...normalized,
        scope: 'NONE',
        note: getPreferenceResolutionNote('NONE', normalized),
      },
    };
  }

  return {
    items: remaining.length > 0 ? remaining : items,
    resolution: {
      ...normalized,
      scope: 'FALLBACK',
      note: getPreferenceResolutionNote('FALLBACK', normalized),
    },
  };
}

function resolveServerPreferencePool<T extends DynamicRoutingServerCandidate>(
  servers: T[],
  preferences?: Partial<DynamicRoutingPreferences> | null,
): {
  servers: T[];
  resolution: DynamicRoutingPreferenceResolution;
} {
  const wrapped = servers.map((server) => ({
    server,
    value: server,
  }));
  const result = resolvePreferencePool(wrapped, preferences);
  return {
    servers: result.items.map((item) => item.value),
    resolution: result.resolution,
  };
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

function selectIndexFromAlgorithm<T>(input: {
  items: T[];
  algorithm: LoadBalancerAlgorithm;
  clientIp: string;
  lastSelectedKeyIndex: number;
}) {
  const { items, algorithm, clientIp, lastSelectedKeyIndex } = input;

  if (items.length <= 1) {
    return 0;
  }

  switch (algorithm) {
    case 'IP_HASH':
      return crc32(clientIp || '127.0.0.1') % items.length;
    case 'ROUND_ROBIN':
      return (lastSelectedKeyIndex + 1) % items.length;
    case 'RANDOM':
      return Math.floor(Math.random() * items.length);
    default:
      return 0;
  }
}

export async function selectDynamicAccessKeyForClient(input: {
  dakId: string;
  accessKeys: DynamicRoutingAccessKeyCandidate[];
  algorithm: LoadBalancerAlgorithm;
  clientIp: string;
  lastSelectedKeyIndex: number;
  preferredServerIds?: string[];
  preferredCountryCodes?: string[];
  preferredRegionMode?: RegionPreferenceMode;
  persistRoundRobin?: boolean;
}): Promise<DynamicRoutingSelectionResult | null> {
  const {
    accessKeys,
    algorithm,
    clientIp,
    dakId,
    lastSelectedKeyIndex,
    persistRoundRobin,
    preferredServerIds,
    preferredCountryCodes,
    preferredRegionMode,
  } = input;

  if (accessKeys.length === 0) {
    return null;
  }

  const { items: preferredPool, resolution } = resolvePreferencePool(accessKeys, {
    preferredServerIds,
    preferredCountryCodes,
    preferredRegionMode,
  });

  if (preferredPool.length === 0) {
    return null;
  }

  if (preferredPool.length === 1) {
    return {
      key: preferredPool[0],
      selectedIndex: 0,
      algorithm,
      preferenceResolution: resolution,
    };
  }

  let selectedIndex = 0;

  if (algorithm === 'LEAST_LOAD') {
    const bestIndex = await selectKeyByLeastLoad(
      preferredPool.map((key, index) => ({
        ...key,
        _originalIndex: index,
      })),
    );
    selectedIndex = bestIndex ?? 0;
  } else {
    selectedIndex = selectIndexFromAlgorithm({
      items: preferredPool,
      algorithm,
      clientIp,
      lastSelectedKeyIndex,
    });
  }

  if (algorithm === 'ROUND_ROBIN' && persistRoundRobin) {
    await db.dynamicAccessKey.update({
      where: { id: dakId },
      data: { lastSelectedKeyIndex: selectedIndex },
    });
  }

  return {
    key: preferredPool[selectedIndex],
    selectedIndex,
    algorithm,
    preferenceResolution: resolution,
  };
}

export async function getSelfManagedServerCandidate(input: {
  dakId?: string;
  serverTagIds: string[];
  algorithm: LoadBalancerAlgorithm;
  clientIp?: string;
  lastSelectedKeyIndex?: number;
  preferredServerIds?: string[];
  preferredCountryCodes?: string[];
  preferredRegionMode?: RegionPreferenceMode;
  persistRoundRobin?: boolean;
}) {
  const {
    dakId,
    serverTagIds,
    algorithm,
    clientIp = '127.0.0.1',
    lastSelectedKeyIndex = 0,
    preferredServerIds,
    preferredCountryCodes,
    preferredRegionMode,
    persistRoundRobin,
  } = input;

  const loadStats = await getServerLoadStats(serverTagIds);
  const servers = loadStats
    .filter((server) => server.isAssignable)
    .map((server) => ({
      id: server.serverId,
      name: server.serverName,
      countryCode: server.countryCode ?? null,
    }));

  if (servers.length === 0) {
    return null;
  }

  const { servers: preferredPool, resolution } = resolveServerPreferencePool(servers, {
    preferredServerIds,
    preferredCountryCodes,
    preferredRegionMode,
  });

  if (preferredPool.length === 0) {
    return null;
  }

  if (algorithm === 'LEAST_LOAD') {
    const rankedPool = loadStats
      .filter((server) => preferredPool.some((candidate) => candidate.id === server.serverId))
      .filter((server) => server.isAssignable)
      .sort((left, right) => left.loadScore - right.loadScore);

    const selected = rankedPool[0];
    if (!selected) {
      return null;
    }

    return {
      serverId: selected.serverId,
      serverName: selected.serverName,
      countryCode: selected.countryCode ?? null,
      reason: `${resolution.note} ${selected.capacityPercent !== null ? `${selected.capacityPercent}% capacity used.` : 'No max-key cap configured.'} ${selected.activeKeyCount} active keys, load score ${selected.loadScore}.`.trim(),
      preferenceResolution: resolution,
    };
  }

  const selectedIndex = selectIndexFromAlgorithm({
    items: preferredPool,
    algorithm,
    clientIp,
    lastSelectedKeyIndex,
  });
  const selected = preferredPool[selectedIndex];

  if (algorithm === 'ROUND_ROBIN' && persistRoundRobin && dakId) {
    await db.dynamicAccessKey.update({
      where: { id: dakId },
      data: { lastSelectedKeyIndex: selectedIndex },
    });
  }

  const algorithmReason = algorithm === 'IP_HASH'
    ? 'Client IP hashing picked this server from the current pool.'
    : algorithm === 'ROUND_ROBIN'
      ? 'Round-robin advanced to the next server in the current pool.'
      : 'A server was selected randomly from the current pool.';

  return {
    serverId: selected.id,
    serverName: selected.name,
    countryCode: selected.countryCode ?? null,
    reason: `${resolution.note} ${algorithmReason}`.trim(),
    preferenceResolution: resolution,
  };
}
