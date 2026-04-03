import { parseDynamicRoutingPreferences } from '@/lib/services/dynamic-subscription-routing';

export type PremiumRoutingServer = {
  id?: string | null;
  name: string;
  countryCode?: string | null;
};

export type PremiumRoutingAccessKey = {
  id: string;
  name: string;
  server?: PremiumRoutingServer | null;
};

export type PremiumRoutingKey = {
  type?: string | null;
  preferredCountryCodesJson?: string | null;
  lastResolvedServerId?: string | null;
  accessKeys: PremiumRoutingAccessKey[];
};

export type PremiumRegionHealthCheck = {
  serverId: string;
  lastStatus: string | null;
  lastLatencyMs: number | null;
  lastCheckedAt: Date | null;
  latencyThresholdMs: number | null;
  server: {
    id: string;
    name: string;
    countryCode: string | null;
  } | null;
};

export type PremiumRegionSummary = {
  regionCode: string;
  status: string | null;
  latencyMs: number | null;
  latencyThresholdMs: number | null;
  lastCheckedAt: Date | null;
  serverCount: number;
  serverName: string | null;
  isCurrent: boolean;
};

export type PremiumRegionAnalysis = {
  preferredRegions: string[];
  attachedServers: PremiumRoutingServer[];
  currentServer: PremiumRoutingServer | null;
  currentSummary: PremiumRegionSummary | null;
  regionSummaries: PremiumRegionSummary[];
  suggestedFallbacks: PremiumRegionSummary[];
};

export type PremiumFallbackTarget = {
  mode: 'ATTACHED_KEY' | 'SELF_MANAGED_SERVER';
  accessKeyId: string | null;
  accessKeyName: string | null;
  serverId: string;
  serverName: string;
  serverCountryCode: string | null;
  regionCode: string;
  status: string | null;
  latencyMs: number | null;
};

function normalizeCountryCode(countryCode?: string | null) {
  const normalized = countryCode?.trim().toUpperCase() || '';
  return /^[A-Z]{2}$/.test(normalized) ? normalized : null;
}

export function getPremiumRegionHealthRank(status?: string | null) {
  switch (status) {
    case 'UP':
      return 0;
    case 'SLOW':
      return 1;
    case 'DOWN':
      return 2;
    default:
      return 3;
  }
}

export function getPremiumPreferredRegions(key: PremiumRoutingKey) {
  return parseDynamicRoutingPreferences({
    preferredCountryCodesJson: key.preferredCountryCodesJson,
  }).preferredCountryCodes.map((code) => code.toUpperCase());
}

export function summarizePremiumRegions(
  key: PremiumRoutingKey,
  healthByServerId: Map<string, PremiumRegionHealthCheck>,
): PremiumRegionAnalysis {
  const preferredRegions = getPremiumPreferredRegions(key);
  const preferredRegionSet = new Set(preferredRegions);
  const attachedServers = key.accessKeys
    .map((accessKey) => accessKey.server)
    .filter((server): server is PremiumRoutingServer => Boolean(server));
  const currentServer = attachedServers.find((server) => server.id === key.lastResolvedServerId) || null;
  const regionCodes = Array.from(
    new Set(
      [
        ...preferredRegions,
        ...attachedServers
          .map((server) => normalizeCountryCode(server.countryCode))
          .filter((value): value is string => Boolean(value)),
      ],
    ),
  );

  const regionSummaries = regionCodes
    .map((regionCode) => {
      const regionServers = attachedServers.filter(
        (server) => normalizeCountryCode(server.countryCode) === regionCode,
      );
      const regionChecks = regionServers
        .map((server) => (server.id ? healthByServerId.get(server.id) : null))
        .filter((entry): entry is PremiumRegionHealthCheck => Boolean(entry))
        .sort((left, right) => {
          const rankDelta = getPremiumRegionHealthRank(left.lastStatus) - getPremiumRegionHealthRank(right.lastStatus);
          if (rankDelta !== 0) {
            return rankDelta;
          }
          return (left.lastLatencyMs ?? Number.MAX_SAFE_INTEGER) - (right.lastLatencyMs ?? Number.MAX_SAFE_INTEGER);
        });
      const primary = regionChecks[0] || null;

      return {
        regionCode,
        status: primary?.lastStatus || null,
        latencyMs: primary?.lastLatencyMs ?? null,
        latencyThresholdMs: primary?.latencyThresholdMs ?? null,
        lastCheckedAt: primary?.lastCheckedAt ?? null,
        serverCount: regionServers.length,
        serverName: primary?.server?.name || regionServers[0]?.name || null,
        isCurrent: normalizeCountryCode(currentServer?.countryCode) === regionCode,
      };
    })
    .sort((left, right) => {
      const preferredDelta = Number(preferredRegionSet.has(left.regionCode)) - Number(preferredRegionSet.has(right.regionCode));
      if (preferredDelta !== 0) {
        return preferredDelta * -1;
      }
      const currentDelta = Number(right.isCurrent) - Number(left.isCurrent);
      if (currentDelta !== 0) {
        return currentDelta;
      }
      const rankDelta = getPremiumRegionHealthRank(left.status) - getPremiumRegionHealthRank(right.status);
      if (rankDelta !== 0) {
        return rankDelta;
      }
      return (left.latencyMs ?? Number.MAX_SAFE_INTEGER) - (right.latencyMs ?? Number.MAX_SAFE_INTEGER);
    });

  const currentSummary =
    regionSummaries.find((entry) => entry.isCurrent) ||
    (currentServer?.countryCode
      ? regionSummaries.find((entry) => entry.regionCode === normalizeCountryCode(currentServer.countryCode)) || null
      : null);

  const suggestedFallbacks = regionSummaries
    .filter((entry) => !entry.isCurrent)
    .filter((entry) => entry.status !== 'DOWN')
    .sort((left, right) => {
      const leftPreferred = preferredRegionSet.has(left.regionCode) ? 0 : 1;
      const rightPreferred = preferredRegionSet.has(right.regionCode) ? 0 : 1;
      if (leftPreferred !== rightPreferred) {
        return leftPreferred - rightPreferred;
      }
      const rankDelta = getPremiumRegionHealthRank(left.status) - getPremiumRegionHealthRank(right.status);
      if (rankDelta !== 0) {
        return rankDelta;
      }
      return (left.latencyMs ?? Number.MAX_SAFE_INTEGER) - (right.latencyMs ?? Number.MAX_SAFE_INTEGER);
    })
    .slice(0, 3);

  return {
    preferredRegions,
    attachedServers,
    currentServer,
    currentSummary,
    regionSummaries,
    suggestedFallbacks,
  };
}

export function shouldAlertForPremiumRegionDegradation(analysis: PremiumRegionAnalysis) {
  if (analysis.currentSummary && ['SLOW', 'DOWN'].includes(analysis.currentSummary.status || '')) {
    return true;
  }

  const preferredSummaries = analysis.regionSummaries.filter((entry) =>
    analysis.preferredRegions.includes(entry.regionCode),
  );

  return (
    preferredSummaries.length > 0 &&
    preferredSummaries.some((entry) => ['SLOW', 'DOWN'].includes(entry.status || '')) &&
    preferredSummaries.every((entry) => entry.status !== 'UP')
  );
}

export function getPremiumHealthyPreferredRegions(analysis: PremiumRegionAnalysis) {
  const preferredSet = new Set(analysis.preferredRegions);
  const preferredHealthy = analysis.regionSummaries
    .filter((entry) => preferredSet.has(entry.regionCode) && entry.status === 'UP')
    .map((entry) => entry.regionCode);

  if (preferredHealthy.length > 0) {
    return preferredHealthy;
  }

  if (analysis.preferredRegions.length === 0 && analysis.currentSummary?.status === 'UP' && analysis.currentSummary.regionCode) {
    return [analysis.currentSummary.regionCode];
  }

  return [];
}

export function getPremiumIncidentRegionCode(analysis: PremiumRegionAnalysis) {
  return analysis.currentSummary?.regionCode || analysis.preferredRegions[0] || null;
}

export function buildPremiumIncidentKey(regionCode: string | null, createdAt: Date) {
  const bucketHours = 6;
  const bucket = Math.floor(createdAt.getTime() / (bucketHours * 60 * 60_000));
  return `${regionCode || 'AUTO'}:${bucket}`;
}

export function selectPremiumFallbackTarget(
  key: PremiumRoutingKey,
  healthByServerId: Map<string, PremiumRegionHealthCheck>,
  analysis?: PremiumRegionAnalysis,
): PremiumFallbackTarget | null {
  const resolvedAnalysis = analysis ?? summarizePremiumRegions(key, healthByServerId);
  const currentRegionCode = normalizeCountryCode(
    resolvedAnalysis.currentServer?.countryCode || resolvedAnalysis.currentSummary?.regionCode || null,
  );
  const fallbackRank = new Map(
    resolvedAnalysis.suggestedFallbacks.map((entry, index) => [entry.regionCode, index] as const),
  );

  const candidates = key.accessKeys
    .map((accessKey) => {
      const server = accessKey.server;
      if (!server?.id) {
        return null;
      }
      const regionCode = normalizeCountryCode(server.countryCode);
      if (!regionCode) {
        return null;
      }
      if (currentRegionCode && regionCode === currentRegionCode) {
        return null;
      }
      const health = healthByServerId.get(server.id);
      if (health?.lastStatus === 'DOWN') {
        return null;
      }

      return {
        mode: key.type === 'MANUAL' ? 'ATTACHED_KEY' : 'SELF_MANAGED_SERVER',
        accessKeyId: key.type === 'MANUAL' ? accessKey.id : null,
        accessKeyName: key.type === 'MANUAL' ? accessKey.name : null,
        serverId: server.id,
        serverName: server.name,
        serverCountryCode: normalizeCountryCode(server.countryCode),
        regionCode,
        status: health?.lastStatus ?? null,
        latencyMs: health?.lastLatencyMs ?? null,
      } satisfies PremiumFallbackTarget;
    })
    .filter((entry): entry is PremiumFallbackTarget => Boolean(entry))
    .sort((left, right) => {
      const leftSuggested = fallbackRank.has(left.regionCode) ? 0 : 1;
      const rightSuggested = fallbackRank.has(right.regionCode) ? 0 : 1;
      if (leftSuggested !== rightSuggested) {
        return leftSuggested - rightSuggested;
      }
      if (leftSuggested === 0 && rightSuggested === 0) {
        const suggestedDelta =
          (fallbackRank.get(left.regionCode) ?? Number.MAX_SAFE_INTEGER) -
          (fallbackRank.get(right.regionCode) ?? Number.MAX_SAFE_INTEGER);
        if (suggestedDelta !== 0) {
          return suggestedDelta;
        }
      }
      const rankDelta = getPremiumRegionHealthRank(left.status) - getPremiumRegionHealthRank(right.status);
      if (rankDelta !== 0) {
        return rankDelta;
      }
      return (left.latencyMs ?? Number.MAX_SAFE_INTEGER) - (right.latencyMs ?? Number.MAX_SAFE_INTEGER);
    });

  return candidates[0] ?? null;
}
