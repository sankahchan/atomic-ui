import { db } from '@/lib/db';
import {
  getServerLoadStats,
  type LoadBalancerAlgorithm,
  type RegionPreferenceMode,
} from '@/lib/services/load-balancer';

export interface DynamicRoutingPreferences {
  preferredServerIds: string[];
  preferredCountryCodes: string[];
  preferredServerWeights: Record<string, number>;
  preferredCountryWeights: Record<string, number>;
  preferredRegionMode: RegionPreferenceMode;
  sessionStickinessMode: 'NONE' | 'DRAIN';
  drainGraceMinutes: number;
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
  preferredServerWeights: Record<string, number>;
  preferredCountryWeights: Record<string, number>;
  sessionStickinessMode: 'NONE' | 'DRAIN';
  drainGraceMinutes: number;
  scope: 'UNRESTRICTED' | 'SERVER' | 'COUNTRY' | 'FALLBACK' | 'NONE';
  note: string;
}

export interface DynamicRoutingSelectionResult {
  key: DynamicRoutingAccessKeyCandidate;
  selectedIndex: number;
  algorithm: LoadBalancerAlgorithm;
  preferenceResolution: DynamicRoutingPreferenceResolution;
  stickinessApplied: boolean;
  selectionReason: string;
}

export interface DynamicRoutingCandidateRank {
  keyId?: string;
  keyName?: string;
  serverId: string;
  serverName: string;
  serverCountry: string | null;
  weight: number;
  preferenceScope: DynamicRoutingPreferenceResolution['scope'];
  loadScore: number | null;
  effectiveScore: number | null;
  reason: string;
}

export interface DynamicPinState {
  pinnedAccessKeyId: string | null;
  pinnedServerId: string | null;
  pinnedAt: Date | null;
  pinExpiresAt: Date | null;
  expired: boolean;
}

function normalizeCountryCode(countryCode: string | null | undefined) {
  if (!countryCode) {
    return null;
  }

  const normalized = countryCode.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) ? normalized : null;
}

export function isDynamicPinExpired(pinExpiresAt?: Date | null) {
  return Boolean(pinExpiresAt && pinExpiresAt.getTime() <= Date.now());
}

export async function clearExpiredDynamicPinIfNeeded(input: {
  dynamicAccessKeyId: string;
  pinnedAccessKeyId?: string | null;
  pinnedServerId?: string | null;
  pinnedAt?: Date | null;
  pinExpiresAt?: Date | null;
}) {
  if (
    !isDynamicPinExpired(input.pinExpiresAt) ||
    (!input.pinnedAccessKeyId && !input.pinnedServerId)
  ) {
    return false;
  }

  const result = await db.dynamicAccessKey.updateMany({
    where: {
      id: input.dynamicAccessKeyId,
      pinExpiresAt: {
        lte: new Date(),
      },
      OR: [
        { pinnedAccessKeyId: { not: null } },
        { pinnedServerId: { not: null } },
      ],
    },
    data: {
      pinnedAccessKeyId: null,
      pinnedServerId: null,
      pinnedAt: null,
      pinExpiresAt: null,
    },
  });

  if (result.count > 0) {
    const { DYNAMIC_ROUTING_EVENT_TYPES, recordDynamicRoutingEvent } = await import(
      '@/lib/services/dynamic-routing-events'
    );
    await recordDynamicRoutingEvent({
      dynamicAccessKeyId: input.dynamicAccessKeyId,
      eventType: DYNAMIC_ROUTING_EVENT_TYPES.PIN_CLEARED,
      severity: 'INFO',
      reason: 'The operator pin expired and routing returned to the live policy.',
      fromKeyId: input.pinnedAccessKeyId ?? null,
      fromServerId: input.pinnedServerId ?? null,
      metadata: {
        automatic: true,
        expired: true,
      },
    });
  }

  return result.count > 0;
}

export async function resolveDynamicPinState(input: {
  dynamicAccessKeyId: string;
  pinnedAccessKeyId?: string | null;
  pinnedServerId?: string | null;
  pinnedAt?: Date | null;
  pinExpiresAt?: Date | null;
}): Promise<DynamicPinState> {
  const expired = isDynamicPinExpired(input.pinExpiresAt);

  if (expired) {
    await clearExpiredDynamicPinIfNeeded(input);
  }

  return {
    pinnedAccessKeyId: expired ? null : input.pinnedAccessKeyId ?? null,
    pinnedServerId: expired ? null : input.pinnedServerId ?? null,
    pinnedAt: expired ? null : input.pinnedAt ?? null,
    pinExpiresAt: expired ? null : input.pinExpiresAt ?? null,
    expired,
  };
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

function normalizeWeightMap(
  values: Record<string, number> | null | undefined,
  normalizer?: (key: string) => string | null,
) {
  const entries = Object.entries(values ?? {})
    .map(([rawKey, rawValue]) => {
      const key = normalizer ? normalizer(rawKey) : rawKey.trim();
      const value = Number(rawValue);
      if (!key || !Number.isFinite(value) || value <= 0) {
        return null;
      }

      return [key, Math.max(1, Math.round(value))] as const;
    })
    .filter((entry): entry is readonly [string, number] => Boolean(entry));

  return Object.fromEntries(entries);
}

export function normalizeDynamicRoutingPreferences(
  preferences?: Partial<DynamicRoutingPreferences> | null,
): DynamicRoutingPreferences {
  return {
    preferredServerIds: normalizeStringArray(preferences?.preferredServerIds),
    preferredCountryCodes: normalizeCountryCodes(preferences?.preferredCountryCodes),
    preferredServerWeights: normalizeWeightMap(preferences?.preferredServerWeights),
    preferredCountryWeights: normalizeWeightMap(
      preferences?.preferredCountryWeights,
      normalizeCountryCode,
    ),
    preferredRegionMode: preferences?.preferredRegionMode === 'ONLY' ? 'ONLY' : 'PREFER',
    sessionStickinessMode: preferences?.sessionStickinessMode === 'NONE' ? 'NONE' : 'DRAIN',
    drainGraceMinutes: Math.min(240, Math.max(1, Math.round(preferences?.drainGraceMinutes ?? 20))),
  };
}

export function parseDynamicRoutingPreferences(input: {
  preferredServerIdsJson?: string | null;
  preferredCountryCodesJson?: string | null;
  preferredServerWeightsJson?: string | null;
  preferredCountryWeightsJson?: string | null;
  preferredRegionMode?: string | null;
  sessionStickinessMode?: string | null;
  drainGraceMinutes?: number | null;
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

  const parseJsonObject = (value: string | null | undefined) => {
    if (!value) {
      return {};
    }

    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, number>)
        : {};
    } catch {
      return {};
    }
  };

  return normalizeDynamicRoutingPreferences({
    preferredServerIds: parseJsonArray(input.preferredServerIdsJson),
    preferredCountryCodes: parseJsonArray(input.preferredCountryCodesJson),
    preferredServerWeights: parseJsonObject(input.preferredServerWeightsJson),
    preferredCountryWeights: parseJsonObject(input.preferredCountryWeightsJson),
    preferredRegionMode: input.preferredRegionMode === 'ONLY' ? 'ONLY' : 'PREFER',
    sessionStickinessMode: input.sessionStickinessMode === 'NONE' ? 'NONE' : 'DRAIN',
    drainGraceMinutes: input.drainGraceMinutes ?? 20,
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

function getRoutingWeight(
  serverId: string,
  countryCode: string | null | undefined,
  preferences: DynamicRoutingPreferences,
) {
  const country = normalizeCountryCode(countryCode);
  return (
    preferences.preferredServerWeights[serverId] ??
    (country ? preferences.preferredCountryWeights[country] : undefined) ??
    1
  );
}

function selectWeightedIndex(weights: number[], seed: number) {
  if (weights.length <= 1) {
    return 0;
  }

  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) {
    return 0;
  }

  let cursor = ((seed % total) + total) % total;
  for (let index = 0; index < weights.length; index += 1) {
    cursor -= weights[index] ?? 1;
    if (cursor < 0) {
      return index;
    }
  }

  return weights.length - 1;
}

function createWeightHint(weight: number) {
  return weight > 1 ? `Weighted preference boost ${weight}x applied.` : 'Default weight applied.';
}

function formatSelectionReason(input: {
  algorithm: LoadBalancerAlgorithm;
  weight: number;
  preferenceResolution: DynamicRoutingPreferenceResolution;
  extra?: string;
}) {
  const algorithmReason = input.algorithm === 'IP_HASH'
    ? 'Client IP hashing chose this backend from the current pool.'
    : input.algorithm === 'ROUND_ROBIN'
      ? 'Round-robin advanced to the next weighted backend in the current pool.'
      : input.algorithm === 'RANDOM'
        ? 'A weighted random choice picked this backend from the current pool.'
        : 'The backend with the best weighted load score won the selection.';

  return [input.preferenceResolution.note, algorithmReason, createWeightHint(input.weight), input.extra]
    .filter(Boolean)
    .join(' ');
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

async function resolveStickyKeyCandidate<T extends DynamicRoutingAccessKeyCandidate>(input: {
  accessKeys: T[];
  preferences: DynamicRoutingPreferences;
}) {
  if (input.preferences.sessionStickinessMode !== 'DRAIN' || input.accessKeys.length === 0) {
    return null;
  }

  const cutoff = new Date(Date.now() - input.preferences.drainGraceMinutes * 60_000);
  const recentSession = await db.connectionSession.findFirst({
    where: {
      accessKeyId: {
        in: input.accessKeys.map((key) => key.id),
      },
      OR: [
        { isActive: true },
        { lastActiveAt: { gte: cutoff } },
      ],
    },
    orderBy: [
      { isActive: 'desc' },
      { lastActiveAt: 'desc' },
    ],
    select: {
      accessKeyId: true,
      isActive: true,
      lastActiveAt: true,
    },
  });

  if (!recentSession) {
    return null;
  }

  const matchedKey = input.accessKeys.find((key) => key.id === recentSession.accessKeyId);
  if (!matchedKey) {
    return null;
  }

  return {
    key: matchedKey,
    reason: recentSession.isActive
      ? 'Session-aware drain mode kept the client on the currently active backend.'
      : `Session-aware drain mode kept the client on the most recent backend used in the last ${input.preferences.drainGraceMinutes} minutes.`,
  };
}

async function getServerLoadScoreMap(serverTagIds?: string[]) {
  const loadStats = await getServerLoadStats(serverTagIds);
  return new Map(
    loadStats.map((server) => [
      server.serverId,
      {
        loadScore: server.loadScore,
        capacityPercent: server.capacityPercent,
        activeKeyCount: server.activeKeyCount,
        assignmentReason: server.assignmentReason,
      },
    ]),
  );
}

export async function rankDynamicAccessKeyCandidates(input: {
  accessKeys: DynamicRoutingAccessKeyCandidate[];
  preferences?: Partial<DynamicRoutingPreferences> | null;
  serverTagIds?: string[];
}) {
  const { items: pool, resolution } = resolvePreferencePool(input.accessKeys, input.preferences);
  if (pool.length === 0) {
    return [] satisfies DynamicRoutingCandidateRank[];
  }

  const loadScoreMap = await getServerLoadScoreMap(input.serverTagIds);

  return pool
    .map((key) => {
      const loadInfo = loadScoreMap.get(key.server.id);
      const weight = getRoutingWeight(key.server.id, key.server.countryCode, resolution);
      const loadScore = loadInfo?.loadScore ?? null;
      const effectiveScore = loadScore === null
        ? null
        : Math.round((loadScore / Math.max(weight, 1)) * 100) / 100;

      return {
        keyId: key.id,
        keyName: key.name,
        serverId: key.server.id,
        serverName: key.server.name,
        serverCountry: normalizeCountryCode(key.server.countryCode) ?? null,
        weight,
        preferenceScope: resolution.scope,
        loadScore,
        effectiveScore,
        reason: loadScore === null
          ? `${resolution.note} ${createWeightHint(weight)} No live load score was available, so static ordering will be used.`
          : `${resolution.note} Load score ${loadScore} adjusted by weight ${weight} gives an effective score of ${effectiveScore}.`,
      } satisfies DynamicRoutingCandidateRank;
    })
    .sort((left, right) => {
      if (left.effectiveScore === null && right.effectiveScore !== null) {
        return 1;
      }
      if (left.effectiveScore !== null && right.effectiveScore === null) {
        return -1;
      }
      if (left.effectiveScore !== null && right.effectiveScore !== null && left.effectiveScore !== right.effectiveScore) {
        return left.effectiveScore - right.effectiveScore;
      }
      if (left.weight !== right.weight) {
        return right.weight - left.weight;
      }
      return left.serverName.localeCompare(right.serverName);
    });
}

export async function rankDynamicServerCandidates(input: {
  servers: DynamicRoutingServerCandidate[];
  preferences?: Partial<DynamicRoutingPreferences> | null;
  serverTagIds?: string[];
}) {
  const { servers: pool, resolution } = resolveServerPreferencePool(input.servers, input.preferences);
  if (pool.length === 0) {
    return [] satisfies DynamicRoutingCandidateRank[];
  }

  const loadScoreMap = await getServerLoadScoreMap(input.serverTagIds);

  return pool
    .map((server) => {
      const loadInfo = loadScoreMap.get(server.id);
      const weight = getRoutingWeight(server.id, server.countryCode, resolution);
      const loadScore = loadInfo?.loadScore ?? null;
      const effectiveScore = loadScore === null
        ? null
        : Math.round((loadScore / Math.max(weight, 1)) * 100) / 100;

      return {
        serverId: server.id,
        serverName: server.name,
        serverCountry: normalizeCountryCode(server.countryCode) ?? null,
        weight,
        preferenceScope: resolution.scope,
        loadScore,
        effectiveScore,
        reason: loadScore === null
          ? `${resolution.note} ${createWeightHint(weight)} No load score was available for this server.`
          : `${resolution.note} Load score ${loadScore} adjusted by weight ${weight} gives an effective score of ${effectiveScore}.`,
      } satisfies DynamicRoutingCandidateRank;
    })
    .sort((left, right) => {
      if (left.effectiveScore === null && right.effectiveScore !== null) {
        return 1;
      }
      if (left.effectiveScore !== null && right.effectiveScore === null) {
        return -1;
      }
      if (left.effectiveScore !== null && right.effectiveScore !== null && left.effectiveScore !== right.effectiveScore) {
        return left.effectiveScore - right.effectiveScore;
      }
      if (left.weight !== right.weight) {
        return right.weight - left.weight;
      }
      return left.serverName.localeCompare(right.serverName);
    });
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
  pinnedAccessKeyId?: string | null;
  preferredServerIds?: string[];
  preferredCountryCodes?: string[];
  preferredServerWeights?: Record<string, number>;
  preferredCountryWeights?: Record<string, number>;
  preferredRegionMode?: RegionPreferenceMode;
  sessionStickinessMode?: 'NONE' | 'DRAIN';
  drainGraceMinutes?: number;
  persistRoundRobin?: boolean;
}): Promise<DynamicRoutingSelectionResult | null> {
  const {
    accessKeys,
    algorithm,
    clientIp,
    dakId,
    lastSelectedKeyIndex,
    persistRoundRobin,
    pinnedAccessKeyId,
    preferredServerIds,
    preferredCountryCodes,
    preferredServerWeights,
    preferredCountryWeights,
    preferredRegionMode,
    sessionStickinessMode,
    drainGraceMinutes,
  } = input;

  if (accessKeys.length === 0) {
    return null;
  }

  const normalizedPreferences = normalizeDynamicRoutingPreferences({
    preferredServerIds,
    preferredCountryCodes,
    preferredServerWeights,
    preferredCountryWeights,
    preferredRegionMode,
    sessionStickinessMode,
    drainGraceMinutes,
  });
  const { items: preferredPool, resolution } = resolvePreferencePool(accessKeys, normalizedPreferences);

  if (preferredPool.length === 0) {
    return null;
  }

  if (pinnedAccessKeyId) {
    const pinnedCandidate = preferredPool.find((candidate) => candidate.id === pinnedAccessKeyId);
    if (pinnedCandidate) {
      return {
        key: pinnedCandidate,
        selectedIndex: preferredPool.findIndex((candidate) => candidate.id === pinnedCandidate.id),
        algorithm,
        preferenceResolution: resolution,
        stickinessApplied: false,
        selectionReason: 'Operator pin forced routing to this backend until the pin is cleared.',
      };
    }
  }

  const stickySelection = await resolveStickyKeyCandidate({
    accessKeys: preferredPool,
    preferences: normalizedPreferences,
  });

  if (stickySelection) {
    return {
      key: stickySelection.key,
      selectedIndex: preferredPool.findIndex((candidate) => candidate.id === stickySelection.key.id),
      algorithm,
      preferenceResolution: resolution,
      stickinessApplied: true,
      selectionReason: stickySelection.reason,
    };
  }

  if (preferredPool.length === 1) {
    return {
      key: preferredPool[0],
      selectedIndex: 0,
      algorithm,
      preferenceResolution: resolution,
      stickinessApplied: false,
      selectionReason: `${resolution.note} Only one backend is available in the current pool.`,
    };
  }

  let selectedIndex = 0;
  let selectionReason = '';

  if (algorithm === 'LEAST_LOAD') {
    const rankedCandidates = await rankDynamicAccessKeyCandidates({
      accessKeys: preferredPool,
      preferences: normalizedPreferences,
    });
    const bestCandidate = rankedCandidates[0];
    selectedIndex = bestCandidate
      ? preferredPool.findIndex((candidate) => candidate.id === bestCandidate.keyId)
      : 0;
    selectionReason = bestCandidate?.reason ?? `${resolution.note} Least-load routing picked the lightest backend.`;
  } else {
    const weights = preferredPool.map((key) =>
      getRoutingWeight(key.server.id, key.server.countryCode, resolution),
    );

    if (algorithm === 'IP_HASH') {
      selectedIndex = selectWeightedIndex(weights, crc32(clientIp || '127.0.0.1'));
    } else if (algorithm === 'ROUND_ROBIN') {
      selectedIndex = selectWeightedIndex(weights, lastSelectedKeyIndex + 1);
    } else {
      const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
      selectedIndex = selectWeightedIndex(weights, Math.floor(Math.random() * Math.max(totalWeight, 1)));
    }

    selectionReason = formatSelectionReason({
      algorithm,
      weight: weights[selectedIndex] ?? 1,
      preferenceResolution: resolution,
    });
  }

  if (algorithm === 'ROUND_ROBIN' && persistRoundRobin) {
    await db.dynamicAccessKey.update({
      where: { id: dakId },
      data: { lastSelectedKeyIndex: lastSelectedKeyIndex + 1 },
    });
  }

  return {
    key: preferredPool[selectedIndex],
    selectedIndex,
    algorithm,
    preferenceResolution: resolution,
    stickinessApplied: false,
    selectionReason,
  };
}

export async function getSelfManagedServerCandidate(input: {
  dakId?: string;
  serverTagIds: string[];
  algorithm: LoadBalancerAlgorithm;
  clientIp?: string;
  lastSelectedKeyIndex?: number;
  pinnedServerId?: string | null;
  preferredServerIds?: string[];
  preferredCountryCodes?: string[];
  preferredServerWeights?: Record<string, number>;
  preferredCountryWeights?: Record<string, number>;
  preferredRegionMode?: RegionPreferenceMode;
  sessionStickinessMode?: 'NONE' | 'DRAIN';
  drainGraceMinutes?: number;
  persistRoundRobin?: boolean;
}) {
  const {
    dakId,
    serverTagIds,
    algorithm,
    clientIp = '127.0.0.1',
    lastSelectedKeyIndex = 0,
    pinnedServerId,
    preferredServerIds,
    preferredCountryCodes,
    preferredServerWeights,
    preferredCountryWeights,
    preferredRegionMode,
    sessionStickinessMode,
    drainGraceMinutes,
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

  const normalizedPreferences = normalizeDynamicRoutingPreferences({
    preferredServerIds,
    preferredCountryCodes,
    preferredServerWeights,
    preferredCountryWeights,
    preferredRegionMode,
    sessionStickinessMode,
    drainGraceMinutes,
  });
  const { servers: preferredPool, resolution } = resolveServerPreferencePool(servers, normalizedPreferences);

  if (preferredPool.length === 0) {
    return null;
  }

  if (pinnedServerId) {
    const pinnedCandidate = preferredPool.find((server) => server.id === pinnedServerId);
    if (pinnedCandidate) {
      return {
        serverId: pinnedCandidate.id,
        serverName: pinnedCandidate.name,
        countryCode: pinnedCandidate.countryCode ?? null,
        reason: 'Operator pin forced routing to this server until the pin is cleared.',
        preferenceResolution: resolution,
      };
    }
  }

  if (algorithm === 'LEAST_LOAD') {
    const rankedPool = await rankDynamicServerCandidates({
      servers: preferredPool,
      preferences: normalizedPreferences,
      serverTagIds,
    });

    const selected = rankedPool[0];
    if (!selected) {
      return null;
    }

    return {
      serverId: selected.serverId,
      serverName: selected.serverName,
      countryCode: selected.serverCountry ?? null,
      reason: selected.reason,
      preferenceResolution: resolution,
    };
  }

  const weights = preferredPool.map((server) =>
    getRoutingWeight(server.id, server.countryCode, resolution),
  );
  const selectedIndex = algorithm === 'IP_HASH'
    ? selectWeightedIndex(weights, crc32(clientIp || '127.0.0.1'))
    : algorithm === 'ROUND_ROBIN'
      ? selectWeightedIndex(weights, lastSelectedKeyIndex + 1)
      : selectWeightedIndex(weights, Math.floor(Math.random() * Math.max(weights.reduce((sum, weight) => sum + weight, 0), 1)));
  const selected = preferredPool[selectedIndex];

  if (algorithm === 'ROUND_ROBIN' && persistRoundRobin && dakId) {
    await db.dynamicAccessKey.update({
      where: { id: dakId },
      data: { lastSelectedKeyIndex: lastSelectedKeyIndex + 1 },
    });
  }

  return {
    serverId: selected.id,
    serverName: selected.name,
    countryCode: selected.countryCode ?? null,
    reason: formatSelectionReason({
      algorithm,
      weight: weights[selectedIndex] ?? 1,
      preferenceResolution: resolution,
    }),
    preferenceResolution: resolution,
  };
}
