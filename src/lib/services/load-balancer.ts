/**
 * Smart Server Load Balancer Service
 *
 * Provides intelligent server selection for Dynamic Access Keys.
 * Supports multiple algorithms including a new LEAST_LOAD algorithm
 * that selects servers based on current key count and bandwidth usage.
 *
 * Algorithms:
 * - IP_HASH: Consistent routing based on client IP (CRC32)
 * - RANDOM: Random selection from available servers
 * - ROUND_ROBIN: Sequential cycling through servers
 * - LEAST_LOAD: Smart selection based on lowest load score
 */

import { db } from '@/lib/db';
import { createOutlineClient } from '@/lib/outline-api';
import { logger } from '@/lib/logger';

export type LoadBalancerAlgorithm = 'IP_HASH' | 'RANDOM' | 'ROUND_ROBIN' | 'LEAST_LOAD';

export interface ServerLoadInfo {
    serverId: string;
    serverName: string;
    activeKeyCount: number;
    totalBandwidthBytes: number;
    loadScore: number; // 0-100, lower is better
    isActive: boolean;
}

/**
 * Calculate load score for a server.
 *
 * The score is a weighted combination of:
 * - Key density: number of active keys (60% weight)
 * - Bandwidth usage: total bytes transferred (40% weight)
 *
 * Score ranges from 0 (no load) to 100 (maximum load).
 */
function calculateLoadScore(
    activeKeys: number,
    totalBandwidthBytes: number,
    maxKeysAcrossServers: number,
    maxBandwidthAcrossServers: number
): number {
    // Normalize each metric to 0-1 range
    const keyScore = maxKeysAcrossServers > 0
        ? activeKeys / maxKeysAcrossServers
        : 0;

    const bandwidthScore = maxBandwidthAcrossServers > 0
        ? totalBandwidthBytes / maxBandwidthAcrossServers
        : 0;

    // Weighted combination: 60% keys, 40% bandwidth
    const combinedScore = (keyScore * 0.6 + bandwidthScore * 0.4) * 100;

    return Math.min(100, Math.round(combinedScore * 10) / 10);
}

/**
 * Get load information for all active servers.
 * Fetches key counts from DB and bandwidth from Outline API.
 */
export async function getServerLoadStats(serverTagIds?: string[]): Promise<ServerLoadInfo[]> {
    // Build server query
    const whereClause: Record<string, unknown> = { isActive: true };

    if (serverTagIds && serverTagIds.length > 0) {
        whereClause.tags = {
            some: {
                tagId: { in: serverTagIds },
            },
        };
    }

    const servers = await db.server.findMany({
        where: whereClause,
        include: {
            _count: {
                select: {
                    accessKeys: {
                        where: { status: 'ACTIVE' },
                    },
                },
            },
            accessKeys: {
                where: { status: 'ACTIVE' },
                select: {
                    usedBytes: true,
                },
            },
        },
    });

    if (servers.length === 0) return [];

    // Gather raw stats per server
    const rawStats = servers.map((server) => {
        const activeKeyCount = server._count.accessKeys;
        const totalBandwidthBytes = server.accessKeys.reduce(
            (sum, key) => sum + Number(key.usedBytes),
            0
        );

        return {
            serverId: server.id,
            serverName: server.name,
            activeKeyCount,
            totalBandwidthBytes,
            isActive: server.isActive,
        };
    });

    // Calculate max values for normalization
    const maxKeys = Math.max(...rawStats.map((s) => s.activeKeyCount), 1);
    const maxBandwidth = Math.max(...rawStats.map((s) => s.totalBandwidthBytes), 1);

    // Calculate load scores
    return rawStats.map((stats) => ({
        ...stats,
        loadScore: calculateLoadScore(
            stats.activeKeyCount,
            stats.totalBandwidthBytes,
            maxKeys,
            maxBandwidth
        ),
    }));
}

/**
 * Select the optimal server based on LEAST_LOAD algorithm.
 *
 * Returns the server with the lowest load score.
 * If multiple servers have the same score, picks randomly among them.
 */
export async function selectLeastLoadedServer(
    serverTagIds?: string[]
): Promise<{ serverId: string; serverName: string; loadScore: number } | null> {
    const loadStats = await getServerLoadStats(serverTagIds);

    if (loadStats.length === 0) return null;

    // Sort by load score ascending (lowest load first)
    loadStats.sort((a, b) => a.loadScore - b.loadScore);

    // Find all servers with the minimum load score
    const minScore = loadStats[0].loadScore;
    const leastLoaded = loadStats.filter((s) => s.loadScore === minScore);

    // If multiple servers have the same score, pick randomly
    const selected = leastLoaded[Math.floor(Math.random() * leastLoaded.length)];

    logger.debug(
        `🔄 Load balancer selected server "${selected.serverName}" ` +
        `(score: ${selected.loadScore}, keys: ${loadStats.find(s => s.serverId === selected.serverId)?.activeKeyCount})`
    );

    return {
        serverId: selected.serverId,
        serverName: selected.serverName,
        loadScore: selected.loadScore,
    };
}

/**
 * Select an access key from a list using the LEAST_LOAD algorithm.
 *
 * Groups keys by server, calculates per-server load, and picks
 * a key from the least loaded server.
 */
export async function selectKeyByLeastLoad(
    accessKeys: Array<{
        id: string;
        server: { id: string; name: string };
        [key: string]: unknown;
    }>
): Promise<number | null> {
    if (accessKeys.length === 0) return null;
    if (accessKeys.length === 1) return 0;

    // Group keys by server
    const serverGroups = new Map<string, number[]>();
    accessKeys.forEach((key, index) => {
        const serverId = key.server.id;
        if (!serverGroups.has(serverId)) {
            serverGroups.set(serverId, []);
        }
        serverGroups.get(serverId)!.push(index);
    });

    // Get unique server IDs
    const serverIds = Array.from(serverGroups.keys());

    // Fetch load stats for these specific servers
    const servers = await db.server.findMany({
        where: { id: { in: serverIds } },
        include: {
            _count: {
                select: {
                    accessKeys: {
                        where: { status: 'ACTIVE' },
                    },
                },
            },
            accessKeys: {
                where: { status: 'ACTIVE' },
                select: { usedBytes: true },
            },
        },
    });

    if (servers.length === 0) return 0;

    // Calculate load per server
    const serverLoads = servers.map((server) => ({
        id: server.id,
        activeKeys: server._count.accessKeys,
        totalBandwidth: server.accessKeys.reduce((sum, k) => sum + Number(k.usedBytes), 0),
    }));

    const maxKeys = Math.max(...serverLoads.map((s) => s.activeKeys), 1);
    const maxBandwidth = Math.max(...serverLoads.map((s) => s.totalBandwidth), 1);

    // Find the server with the lowest load
    let bestServerId = serverIds[0];
    let bestScore = Infinity;

    for (const load of serverLoads) {
        const score = calculateLoadScore(
            load.activeKeys,
            load.totalBandwidth,
            maxKeys,
            maxBandwidth
        );
        if (score < bestScore) {
            bestScore = score;
            bestServerId = load.id;
        }
    }

    // Pick a random key from the least loaded server
    const keyIndices = serverGroups.get(bestServerId);
    if (!keyIndices || keyIndices.length === 0) return 0;

    return keyIndices[Math.floor(Math.random() * keyIndices.length)];
}
