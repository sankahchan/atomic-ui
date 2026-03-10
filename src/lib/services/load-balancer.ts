/**
 * Smart Server Load Balancer Service
 *
 * Centralizes server scoring for:
 * - Dynamic key LEAST_LOAD routing
 * - Admin-side automatic key assignment
 * - Rebalance planning between servers
 */

import { z } from 'zod';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { canAssignKeysToServer } from '@/lib/services/server-lifecycle';
import { writeAuditLog } from '@/lib/audit';

export type LoadBalancerAlgorithm = 'IP_HASH' | 'RANDOM' | 'ROUND_ROBIN' | 'LEAST_LOAD';

const ACTIVE_KEY_STATUSES = ['ACTIVE', 'PENDING'] as const;
const OVERLOAD_SCORE_THRESHOLD = 68;
const OVERLOAD_CAPACITY_THRESHOLD = 85;
const TARGET_CAPACITY_THRESHOLD = 72;
const MIN_LOAD_GAP_FOR_MOVE = 12;
const SERVER_BALANCER_POLICY_KEY = 'serverBalancerPolicy';
const SERVER_BALANCER_PLAN_SIGNATURE_KEY = 'serverBalancerLastPlanSignature';

export type RegionPreferenceMode = 'PREFER' | 'ONLY';

export interface ServerBalancerPolicy {
  scheduledRebalanceEnabled: boolean;
  autoApplySafeMoves: boolean;
  preferredCountryCodes: string[];
  preferredCountryMode: RegionPreferenceMode;
  autoApplySameCountryOnly: boolean;
  maxRecommendationsPerRun: number;
  maxAutoMoveKeysPerRun: number;
  minAutoApplyLoadDelta: number;
}

const serverBalancerPolicySchema = z.object({
  scheduledRebalanceEnabled: z.boolean().default(true),
  autoApplySafeMoves: z.boolean().default(false),
  preferredCountryCodes: z.array(z.string()).default([]),
  preferredCountryMode: z.enum(['PREFER', 'ONLY']).default('PREFER'),
  autoApplySameCountryOnly: z.boolean().default(true),
  maxRecommendationsPerRun: z.number().int().min(1).max(10).default(3),
  maxAutoMoveKeysPerRun: z.number().int().min(1).max(5).default(2),
  minAutoApplyLoadDelta: z.number().int().min(5).max(50).default(18),
});

export const DEFAULT_SERVER_BALANCER_POLICY: ServerBalancerPolicy = {
  scheduledRebalanceEnabled: true,
  autoApplySafeMoves: false,
  preferredCountryCodes: [],
  preferredCountryMode: 'PREFER',
  autoApplySameCountryOnly: true,
  maxRecommendationsPerRun: 3,
  maxAutoMoveKeysPerRun: 2,
  minAutoApplyLoadDelta: 18,
};

export interface ServerLoadInfo {
  serverId: string;
  serverName: string;
  activeKeyCount: number;
  totalBandwidthBytes: number;
  loadScore: number;
  isActive: boolean;
  lifecycleMode: string;
  capacityPercent: number | null;
  availableSlots: number | null;
  isAssignable: boolean;
  assignmentReason: string | null;
  countryCode?: string | null;
}

export interface SmartAssignmentTarget extends ServerLoadInfo {
  reasons: string[];
}

export interface SelectLeastLoadedServerOptions {
  serverTagIds?: string[];
  preferredCountryCodes?: string[];
  preferredCountryMode?: RegionPreferenceMode;
  usePolicy?: boolean;
}

export interface RebalanceRecommendation {
  sourceServerId: string;
  sourceServerName: string;
  sourceServerCountryCode: string | null;
  sourceLoadScore: number;
  sourceCapacityPercent: number | null;
  targetServerId: string;
  targetServerName: string;
  targetServerCountryCode: string | null;
  targetLoadScore: number;
  targetCapacityPercent: number | null;
  keyIds: string[];
  keyNames: string[];
  keyCount: number;
  reason: string;
  estimatedLoadDelta: number;
}

export interface RebalancePlan {
  summary: {
    overloadedServers: number;
    targetServers: number;
    recommendedMoves: number;
    movableKeys: number;
  };
  recommendations: RebalanceRecommendation[];
}

export interface ScheduledRebalanceResult {
  skipped: boolean;
  reason?: string;
  policy: ServerBalancerPolicy;
  recommendations: number;
  autoApplied: number;
  failedRecommendations: number;
  summary: RebalancePlan['summary'];
}

interface ServerDatasetKey {
  id: string;
  name: string;
  usedBytes: bigint;
  lastUsedAt: Date | null;
  dynamicKeyId: string | null;
  sessions: { id: string }[];
}

interface ServerDataset {
  id: string;
  name: string;
  countryCode: string | null;
  isActive: boolean;
  lifecycleMode: string;
  maxKeys: number | null;
  activeKeyCount: number;
  totalBandwidthBytes: number;
  loadScore: number;
  capacityPercent: number | null;
  availableSlots: number | null;
  isAssignable: boolean;
  assignmentReason: string | null;
  keys: ServerDatasetKey[];
}

interface RawServerMetrics {
  serverId: string;
  serverName: string;
  countryCode: string | null;
  isActive: boolean;
  lifecycleMode: string | null;
  maxKeys: number | null;
  activeKeyCount: number;
  totalBandwidthBytes: number;
  keys: ServerDatasetKey[];
}

export interface ServerRankingInput {
  serverId: string;
  serverName: string;
  activeKeyCount: number;
  totalBandwidthBytes: number;
  isActive: boolean;
  lifecycleMode?: string | null;
  maxKeys?: number | null;
  countryCode?: string | null;
}

export interface RebalanceCandidateInput extends ServerRankingInput {
  keys: Array<{
    id: string;
    name: string;
    usedBytes: bigint;
    lastUsedAt: Date | null;
    dynamicKeyId?: string | null;
    activeSessionCount?: number;
  }>;
}

function roundToSingleDecimal(value: number) {
  return Math.round(value * 10) / 10;
}

function normalizeCountryCode(countryCode: string | null | undefined) {
  if (!countryCode) {
    return null;
  }

  const normalized = countryCode.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) ? normalized : null;
}

function normalizeCountryCodes(countryCodes: string[]) {
  return Array.from(
    new Set(
      countryCodes
        .map((countryCode) => normalizeCountryCode(countryCode))
        .filter((countryCode): countryCode is string => Boolean(countryCode)),
    ),
  );
}

function parseServerBalancerPolicy(value: unknown): ServerBalancerPolicy {
  const parsed = serverBalancerPolicySchema.safeParse({
    ...DEFAULT_SERVER_BALANCER_POLICY,
    ...(value && typeof value === 'object' ? value as Record<string, unknown> : {}),
  });

  if (!parsed.success) {
    return DEFAULT_SERVER_BALANCER_POLICY;
  }

  return {
    ...parsed.data,
    preferredCountryCodes: normalizeCountryCodes(parsed.data.preferredCountryCodes),
  };
}

export async function getServerBalancerPolicy(): Promise<ServerBalancerPolicy> {
  const setting = await db.settings.findUnique({
    where: { key: SERVER_BALANCER_POLICY_KEY },
  });

  if (!setting) {
    return DEFAULT_SERVER_BALANCER_POLICY;
  }

  try {
    return parseServerBalancerPolicy(JSON.parse(setting.value));
  } catch {
    return DEFAULT_SERVER_BALANCER_POLICY;
  }
}

function normalizeSelectionOptions(
  options?: string[] | SelectLeastLoadedServerOptions,
): SelectLeastLoadedServerOptions {
  if (Array.isArray(options)) {
    return {
      serverTagIds: options,
      usePolicy: true,
    };
  }

  return {
    usePolicy: true,
    ...options,
  };
}

function applyCountryPreference<T extends { countryCode?: string | null }>(
  servers: T[],
  preferredCountryCodes: string[],
  preferredCountryMode: RegionPreferenceMode,
) {
  const normalizedCountries = normalizeCountryCodes(preferredCountryCodes);
  if (normalizedCountries.length === 0) {
    return servers;
  }

  const preferred = servers.filter((server) => {
    const countryCode = normalizeCountryCode(server.countryCode);
    return countryCode ? normalizedCountries.includes(countryCode) : false;
  });

  if (preferred.length > 0) {
    return preferred;
  }

  return preferredCountryMode === 'ONLY' ? [] : servers;
}

function getCapacityPercent(activeKeyCount: number, maxKeys: number | null | undefined) {
  if (!maxKeys || maxKeys <= 0) {
    return null;
  }

  return roundToSingleDecimal((activeKeyCount / maxKeys) * 100);
}

function getAvailableSlots(activeKeyCount: number, maxKeys: number | null | undefined) {
  if (!maxKeys || maxKeys <= 0) {
    return null;
  }

  return Math.max(maxKeys - activeKeyCount, 0);
}

export function calculateLoadScore(
  activeKeys: number,
  totalBandwidthBytes: number,
  maxKeysAcrossServers: number,
  maxBandwidthAcrossServers: number,
  capacityPercent: number | null,
  maxCapacityPercentAcrossServers: number,
): number {
  const keyScore = maxKeysAcrossServers > 0 ? activeKeys / maxKeysAcrossServers : 0;
  const bandwidthScore = maxBandwidthAcrossServers > 0
    ? totalBandwidthBytes / maxBandwidthAcrossServers
    : 0;
  const capacityScore = capacityPercent !== null && maxCapacityPercentAcrossServers > 0
    ? capacityPercent / maxCapacityPercentAcrossServers
    : null;

  const weightedParts = [
    { value: keyScore, weight: 0.55 },
    { value: bandwidthScore, weight: 0.25 },
  ];

  if (capacityScore !== null) {
    weightedParts.push({ value: capacityScore, weight: 0.20 });
  }

  const totalWeight = weightedParts.reduce((sum, part) => sum + part.weight, 0);
  const score = weightedParts.reduce((sum, part) => sum + part.value * part.weight, 0) / totalWeight;

  return roundToSingleDecimal(Math.min(100, score * 100));
}

export function rankServersForAssignment<T extends ServerRankingInput>(servers: T[]): Array<T & Omit<ServerLoadInfo, 'serverId' | 'serverName' | 'activeKeyCount' | 'totalBandwidthBytes' | 'isActive' | 'countryCode'>> {
  if (servers.length === 0) {
    return [];
  }

  const prepared = servers.map((server) => {
    const capacityPercent = getCapacityPercent(server.activeKeyCount, server.maxKeys ?? null);
    const availableSlots = getAvailableSlots(server.activeKeyCount, server.maxKeys ?? null);
    const assignmentCheck = canAssignKeysToServer({
      isActive: server.isActive,
      lifecycleMode: server.lifecycleMode ?? 'ACTIVE',
    });
    const isAtCapacity = availableSlots !== null && availableSlots <= 0;

    return {
      ...server,
      lifecycleMode: server.lifecycleMode ?? 'ACTIVE',
      capacityPercent,
      availableSlots,
      isAssignable: assignmentCheck.allowed && !isAtCapacity,
      assignmentReason: !assignmentCheck.allowed
        ? assignmentCheck.reason
        : isAtCapacity
          ? 'Server reached max key capacity.'
          : null,
    };
  });

  const maxKeysAcrossServers = Math.max(...prepared.map((server) => server.activeKeyCount), 1);
  const maxBandwidthAcrossServers = Math.max(...prepared.map((server) => server.totalBandwidthBytes), 1);
  const maxCapacityAcrossServers = Math.max(
    ...prepared
      .map((server) => server.capacityPercent ?? 0),
    1,
  );

  return prepared
    .map((server) => ({
      ...server,
      loadScore: calculateLoadScore(
        server.activeKeyCount,
        server.totalBandwidthBytes,
        maxKeysAcrossServers,
        maxBandwidthAcrossServers,
        server.capacityPercent,
        maxCapacityAcrossServers,
      ),
    }))
    .sort((left, right) => {
      if (left.isAssignable !== right.isAssignable) {
        return left.isAssignable ? -1 : 1;
      }

      if (left.loadScore !== right.loadScore) {
        return left.loadScore - right.loadScore;
      }

      if ((left.availableSlots ?? Number.MAX_SAFE_INTEGER) !== (right.availableSlots ?? Number.MAX_SAFE_INTEGER)) {
        return (right.availableSlots ?? Number.MAX_SAFE_INTEGER) - (left.availableSlots ?? Number.MAX_SAFE_INTEGER);
      }

      return left.serverName.localeCompare(right.serverName);
    });
}

function sortMovableKeys(keys: RebalanceCandidateInput['keys']) {
  return [...keys].sort((left, right) => {
    const leftSessions = left.activeSessionCount ?? 0;
    const rightSessions = right.activeSessionCount ?? 0;
    if (leftSessions !== rightSessions) {
      return leftSessions - rightSessions;
    }

    const leftLastUsed = left.lastUsedAt ? left.lastUsedAt.getTime() : 0;
    const rightLastUsed = right.lastUsedAt ? right.lastUsedAt.getTime() : 0;
    if (leftLastUsed !== rightLastUsed) {
      return leftLastUsed - rightLastUsed;
    }

    return Number(left.usedBytes) - Number(right.usedBytes);
  });
}

export function planRebalanceRecommendations(
  servers: RebalanceCandidateInput[],
  options?: { maxMoves?: number },
): RebalancePlan {
  const ranked = rankServersForAssignment(servers);
  if (ranked.length <= 1) {
    return {
      summary: {
        overloadedServers: 0,
        targetServers: 0,
        recommendedMoves: 0,
        movableKeys: 0,
      },
      recommendations: [],
    };
  }

  const averageScore = ranked.reduce((sum, server) => sum + server.loadScore, 0) / ranked.length;
  const projectedCounts = new Map(ranked.map((server) => [server.serverId, server.activeKeyCount]));
  const projectedSlots = new Map(ranked.map((server) => [server.serverId, server.availableSlots]));
  const maxMoves = options?.maxMoves ?? 3;

  const overloaded = ranked.filter((server) => {
    const capacityHot = (server.capacityPercent ?? 0) >= OVERLOAD_CAPACITY_THRESHOLD;
    const scoreHot = server.loadScore >= Math.max(OVERLOAD_SCORE_THRESHOLD, averageScore + 8);
    return server.activeKeyCount > 0 && (capacityHot || scoreHot);
  });

  const targets = ranked.filter((server) =>
    server.isAssignable &&
    (server.capacityPercent ?? 0) < TARGET_CAPACITY_THRESHOLD,
  );

  const movableKeys = overloaded.reduce((sum, server) => (
    sum + server.keys.filter((key) => !key.dynamicKeyId && (key.activeSessionCount ?? 0) === 0).length
  ), 0);

  const recommendations: RebalanceRecommendation[] = [];

  for (const source of overloaded) {
    if (recommendations.length >= maxMoves) {
      break;
    }

    const candidates = sortMovableKeys(
      source.keys
        .filter((key) => !key.dynamicKeyId)
        .map((key) => ({
          id: key.id,
          name: key.name,
          usedBytes: key.usedBytes,
          lastUsedAt: key.lastUsedAt,
          dynamicKeyId: key.dynamicKeyId,
          activeSessionCount: key.activeSessionCount,
        })),
    ).filter((key) => (key.activeSessionCount ?? 0) === 0);

    if (candidates.length === 0) {
      continue;
    }

    const sourceProjectedCount = projectedCounts.get(source.serverId) ?? source.activeKeyCount;
    const sourceProjectedScore = sourceProjectedCount === source.activeKeyCount
      ? source.loadScore
      : roundToSingleDecimal((sourceProjectedCount / Math.max(source.activeKeyCount, 1)) * source.loadScore);

    for (const target of targets) {
      if (recommendations.length >= maxMoves) {
        break;
      }

      if (target.serverId === source.serverId) {
        continue;
      }

      const targetSlots = projectedSlots.get(target.serverId);
      if (targetSlots !== null && targetSlots !== undefined && targetSlots <= 0) {
        continue;
      }

      const targetProjectedCount = projectedCounts.get(target.serverId) ?? target.activeKeyCount;
      const targetProjectedScore = targetProjectedCount === target.activeKeyCount
        ? target.loadScore
        : roundToSingleDecimal(Math.max(target.loadScore, (targetProjectedCount / Math.max(target.activeKeyCount, 1)) * target.loadScore));

      const scoreGap = sourceProjectedScore - targetProjectedScore;
      const capacityHot = (source.capacityPercent ?? 0) >= OVERLOAD_CAPACITY_THRESHOLD;

      if (scoreGap < MIN_LOAD_GAP_FOR_MOVE && !capacityHot) {
        continue;
      }

      const safeSlots = targetSlots ?? candidates.length;
      const maxSuggestedMoves = Math.max(
        1,
        Math.min(
          candidates.length,
          safeSlots,
          capacityHot ? 3 : 2,
          Math.ceil(Math.max(scoreGap, 10) / 18),
        ),
      );

      const selected = candidates.slice(0, maxSuggestedMoves);
      if (selected.length === 0) {
        continue;
      }

      projectedCounts.set(source.serverId, sourceProjectedCount - selected.length);
      projectedCounts.set(target.serverId, targetProjectedCount + selected.length);

      if (targetSlots !== null && targetSlots !== undefined) {
        projectedSlots.set(target.serverId, Math.max(targetSlots - selected.length, 0));
      }

      recommendations.push({
        sourceServerId: source.serverId,
        sourceServerName: source.serverName,
        sourceServerCountryCode: source.countryCode ?? null,
        sourceLoadScore: source.loadScore,
        sourceCapacityPercent: source.capacityPercent,
        targetServerId: target.serverId,
        targetServerName: target.serverName,
        targetServerCountryCode: target.countryCode ?? null,
        targetLoadScore: target.loadScore,
        targetCapacityPercent: target.capacityPercent,
        keyIds: selected.map((key) => key.id),
        keyNames: selected.map((key) => key.name),
        keyCount: selected.length,
        reason: capacityHot
          ? 'Source server is close to capacity and has lower-risk offline keys to move.'
          : 'Load gap indicates these offline keys should be shifted to a lighter server.',
        estimatedLoadDelta: roundToSingleDecimal(scoreGap),
      });

      break;
    }
  }

  return {
    summary: {
      overloadedServers: overloaded.length,
      targetServers: targets.length,
      recommendedMoves: recommendations.length,
      movableKeys,
    },
    recommendations,
  };
}

async function fetchServerDataset(serverTagIds?: string[], serverIds?: string[]): Promise<ServerDataset[]> {
  const whereClause: Record<string, unknown> = { isActive: true };

  if (serverTagIds && serverTagIds.length > 0) {
    whereClause.tags = {
      some: {
        tagId: { in: serverTagIds },
      },
    };
  }

  if (serverIds && serverIds.length > 0) {
    whereClause.id = { in: serverIds };
  }

  const servers = await db.server.findMany({
    where: whereClause,
    include: {
      _count: {
        select: {
          accessKeys: {
            where: {
              status: { in: ACTIVE_KEY_STATUSES as unknown as string[] },
            },
          },
        },
      },
      accessKeys: {
        where: {
          status: { in: ACTIVE_KEY_STATUSES as unknown as string[] },
        },
        select: {
          id: true,
          name: true,
          usedBytes: true,
          lastUsedAt: true,
          dynamicKeyId: true,
          sessions: {
            where: { isActive: true },
            select: { id: true },
          },
        },
      },
    },
  });

  const raw: RawServerMetrics[] = servers.map((server) => ({
    serverId: server.id,
    serverName: server.name,
    countryCode: server.countryCode ?? null,
    isActive: server.isActive,
    lifecycleMode: server.lifecycleMode ?? 'ACTIVE',
    maxKeys: server.maxKeys ?? null,
    activeKeyCount: server._count.accessKeys,
    totalBandwidthBytes: server.accessKeys.reduce((sum, key) => sum + Number(key.usedBytes), 0),
    keys: server.accessKeys,
  }));

  const ranked = rankServersForAssignment(raw);
  const rankedById = new Map(ranked.map((server) => [server.serverId, server]));

  return raw.map((server) => {
    const rank = rankedById.get(server.serverId);
    if (!rank) {
      throw new Error(`Missing rank for server ${server.serverName}`);
    }

    return {
      id: server.serverId,
      name: server.serverName,
      countryCode: server.countryCode,
      isActive: server.isActive,
      lifecycleMode: rank.lifecycleMode,
      maxKeys: server.maxKeys,
      activeKeyCount: server.activeKeyCount,
      totalBandwidthBytes: server.totalBandwidthBytes,
      loadScore: rank.loadScore,
      capacityPercent: rank.capacityPercent,
      availableSlots: rank.availableSlots,
      isAssignable: rank.isAssignable,
      assignmentReason: rank.assignmentReason,
      keys: server.keys,
    };
  }).sort((left, right) => left.loadScore - right.loadScore);
}

/**
 * Get load information for active servers.
 */
export async function getServerLoadStats(serverTagIds?: string[]): Promise<ServerLoadInfo[]> {
  const dataset = await fetchServerDataset(serverTagIds);

  return dataset.map((server) => ({
    serverId: server.id,
    serverName: server.name,
    activeKeyCount: server.activeKeyCount,
    totalBandwidthBytes: server.totalBandwidthBytes,
    loadScore: server.loadScore,
    isActive: server.isActive,
    lifecycleMode: server.lifecycleMode,
    capacityPercent: server.capacityPercent,
    availableSlots: server.availableSlots,
    isAssignable: server.isAssignable,
    assignmentReason: server.assignmentReason,
    countryCode: server.countryCode,
  }));
}

/**
 * Select the best target server for a new key.
 */
export async function selectLeastLoadedServer(
  options?: string[] | SelectLeastLoadedServerOptions,
): Promise<SmartAssignmentTarget | null> {
  const normalizedOptions = normalizeSelectionOptions(options);
  const policy = normalizedOptions.usePolicy === false
    ? DEFAULT_SERVER_BALANCER_POLICY
    : await getServerBalancerPolicy();

  const preferredCountryCodes = normalizedOptions.preferredCountryCodes ?? policy.preferredCountryCodes;
  const preferredCountryMode = normalizedOptions.preferredCountryMode ?? policy.preferredCountryMode;

  const loadStats = await getServerLoadStats(normalizedOptions.serverTagIds);
  const assignable = loadStats.filter((server) => server.isAssignable);
  const candidates = applyCountryPreference(assignable, preferredCountryCodes, preferredCountryMode);
  const selected = candidates[0];

  if (!selected) {
    return null;
  }

  const reasons = [
    selected.capacityPercent !== null
      ? `${selected.capacityPercent}% capacity used`
      : 'No max-key cap configured',
    `${selected.activeKeyCount} active keys`,
    `load score ${selected.loadScore}`,
  ];

  if (preferredCountryCodes.length > 0) {
    reasons.push(
      preferredCountryMode === 'ONLY'
        ? `restricted to preferred countries: ${preferredCountryCodes.join(', ')}`
        : `preferred countries: ${preferredCountryCodes.join(', ')}`,
    );
  }

  logger.verbose(
    'smart-assignment',
    `Selected server "${selected.serverName}" for automatic assignment`,
    {
      serverId: selected.serverId,
      loadScore: selected.loadScore,
      activeKeyCount: selected.activeKeyCount,
      capacityPercent: selected.capacityPercent,
    },
  );

  return {
    ...selected,
    reasons,
  };
}

export function isSafeAutoApplyRecommendation(
  recommendation: RebalanceRecommendation,
  policy: ServerBalancerPolicy,
) {
  if (recommendation.keyCount > policy.maxAutoMoveKeysPerRun) {
    return false;
  }

  if (recommendation.estimatedLoadDelta < policy.minAutoApplyLoadDelta) {
    return false;
  }

  if (policy.autoApplySameCountryOnly) {
    const sourceCountry = normalizeCountryCode(recommendation.sourceServerCountryCode);
    const targetCountry = normalizeCountryCode(recommendation.targetServerCountryCode);
    if (!sourceCountry || !targetCountry || sourceCountry !== targetCountry) {
      return false;
    }
  }

  if (policy.preferredCountryCodes.length > 0 && policy.preferredCountryMode === 'ONLY') {
    const targetCountry = normalizeCountryCode(recommendation.targetServerCountryCode);
    if (!targetCountry || !normalizeCountryCodes(policy.preferredCountryCodes).includes(targetCountry)) {
      return false;
    }
  }

  return true;
}

/**
 * Build rebalance recommendations based on current server pressure.
 */
export async function getServerRebalancePlan(options?: {
  serverIds?: string[];
  maxMoves?: number;
}): Promise<RebalancePlan> {
  const dataset = await fetchServerDataset(undefined, options?.serverIds);

  const plan = planRebalanceRecommendations(
    dataset.map((server) => ({
      serverId: server.id,
      serverName: server.name,
      countryCode: server.countryCode,
      isActive: server.isActive,
      lifecycleMode: server.lifecycleMode,
      maxKeys: server.maxKeys,
      activeKeyCount: server.activeKeyCount,
      totalBandwidthBytes: server.totalBandwidthBytes,
      keys: server.keys.map((key) => ({
        id: key.id,
        name: key.name,
        usedBytes: key.usedBytes,
        lastUsedAt: key.lastUsedAt,
        dynamicKeyId: key.dynamicKeyId,
        activeSessionCount: key.sessions.length,
      })),
    })),
    { maxMoves: options?.maxMoves },
  );

  if (plan.recommendations.length > 0) {
    logger.verbose(
      'smart-assignment',
      `Generated ${plan.recommendations.length} rebalance recommendation(s)`,
      plan.summary,
    );
  }

  return plan;
}

export async function runScheduledRebalanceCycle(): Promise<ScheduledRebalanceResult> {
  const policy = await getServerBalancerPolicy();

  if (!policy.scheduledRebalanceEnabled) {
    return {
      skipped: true,
      reason: 'Scheduled rebalance is disabled.',
      policy,
      recommendations: 0,
      autoApplied: 0,
      failedRecommendations: 0,
      summary: {
        overloadedServers: 0,
        targetServers: 0,
        recommendedMoves: 0,
        movableKeys: 0,
      },
    };
  }

  const plan = await getServerRebalancePlan({
    maxMoves: policy.maxRecommendationsPerRun,
  });
  const planSignature = JSON.stringify(
    plan.recommendations.map((recommendation) => ({
      sourceServerId: recommendation.sourceServerId,
      targetServerId: recommendation.targetServerId,
      keyIds: recommendation.keyIds,
      keyCount: recommendation.keyCount,
      estimatedLoadDelta: recommendation.estimatedLoadDelta,
    })),
  );

  if (plan.recommendations.length === 0) {
    await db.settings.upsert({
      where: { key: SERVER_BALANCER_PLAN_SIGNATURE_KEY },
      create: {
        key: SERVER_BALANCER_PLAN_SIGNATURE_KEY,
        value: JSON.stringify(''),
      },
      update: {
        value: JSON.stringify(''),
      },
    });

    return {
      skipped: false,
      policy,
      recommendations: 0,
      autoApplied: 0,
      failedRecommendations: 0,
      summary: plan.summary,
    };
  }

  const previousSignatureSetting = await db.settings.findUnique({
    where: { key: SERVER_BALANCER_PLAN_SIGNATURE_KEY },
  });
  const previousSignature = previousSignatureSetting
    ? (() => {
        try {
          return JSON.parse(previousSignatureSetting.value) as string;
        } catch {
          return '';
        }
      })()
    : '';

  const planChanged = planSignature !== previousSignature;

  if (planChanged) {
    await writeAuditLog({
      action: 'SERVER_REBALANCE_PLANNED',
      entity: 'SERVER',
      details: {
        triggeredBy: 'scheduler',
        policy,
        summary: plan.summary,
        recommendations: plan.recommendations.map((recommendation) => ({
          sourceServerId: recommendation.sourceServerId,
          targetServerId: recommendation.targetServerId,
          keyCount: recommendation.keyCount,
          keyNames: recommendation.keyNames,
          estimatedLoadDelta: recommendation.estimatedLoadDelta,
        })),
      },
    });
  }

  await db.settings.upsert({
    where: { key: SERVER_BALANCER_PLAN_SIGNATURE_KEY },
    create: {
      key: SERVER_BALANCER_PLAN_SIGNATURE_KEY,
      value: JSON.stringify(planSignature),
    },
    update: {
      value: JSON.stringify(planSignature),
    },
  });

  if (!policy.autoApplySafeMoves) {
    return {
      skipped: false,
      policy,
      recommendations: plan.recommendations.length,
      autoApplied: 0,
      failedRecommendations: 0,
      summary: plan.summary,
    };
  }

  const { migrateKeys } = await import('@/lib/services/server-migration');
  const safeRecommendations = plan.recommendations.filter((recommendation) =>
    isSafeAutoApplyRecommendation(recommendation, policy),
  );

  let autoApplied = 0;
  let failedRecommendations = 0;

  for (const recommendation of safeRecommendations) {
    const result = await migrateKeys(
      recommendation.sourceServerId,
      recommendation.targetServerId,
      recommendation.keyIds,
      true,
    );

    if (result.failed > 0) {
      failedRecommendations += 1;
    }

    if (result.migrated > 0) {
      autoApplied += 1;
      await writeAuditLog({
        action: 'SERVER_REBALANCE_AUTO_APPLIED',
        entity: 'SERVER',
        entityId: recommendation.sourceServerId,
        details: {
          triggeredBy: 'scheduler',
          sourceServerId: recommendation.sourceServerId,
          targetServerId: recommendation.targetServerId,
          keyIds: recommendation.keyIds,
          keyNames: recommendation.keyNames,
          migrated: result.migrated,
          failed: result.failed,
        },
      });
    }
  }

  return {
    skipped: false,
    policy,
    recommendations: plan.recommendations.length,
    autoApplied,
    failedRecommendations,
    summary: plan.summary,
  };
}

/**
 * Select an access key from a list using the LEAST_LOAD algorithm.
 */
export async function selectKeyByLeastLoad(
  accessKeys: Array<{
    id: string;
    server: { id: string; name: string };
    [key: string]: unknown;
  }>,
): Promise<number | null> {
  if (accessKeys.length === 0) return null;
  if (accessKeys.length === 1) return 0;

  const serverGroups = new Map<string, number[]>();
  accessKeys.forEach((key, index) => {
    const serverId = key.server.id;
    if (!serverGroups.has(serverId)) {
      serverGroups.set(serverId, []);
    }
    serverGroups.get(serverId)!.push(index);
  });

  const serverIds = Array.from(serverGroups.keys());
  const loadStats = await getServerLoadStats();
  const ranked = loadStats
    .filter((server) => serverIds.includes(server.serverId))
    .sort((left, right) => left.loadScore - right.loadScore);

  const selectedServer = ranked[0];
  if (!selectedServer) {
    return 0;
  }

  const keyIndices = serverGroups.get(selectedServer.serverId);
  if (!keyIndices || keyIndices.length === 0) {
    return 0;
  }

  return keyIndices[Math.floor(Math.random() * keyIndices.length)];
}
