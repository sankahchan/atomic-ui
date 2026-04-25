type SmokeLiveStatsKey = {
  outlineKeyId: string;
  usedBytes?: bigint | null;
};

const SMOKE_LIVE_STATS_BASELINE_BYTES = 96 * 1024;
const SMOKE_LIVE_STATS_STEP_BYTES = 24 * 1024;
const SMOKE_LIVE_STATS_JITTER_BYTES = 8 * 1024;

export function isPlaywrightSmokeEnv(env?: { PLAYWRIGHT_SMOKE?: string }) {
  const smokeEnv = env?.PLAYWRIGHT_SMOKE ?? process.env.PLAYWRIGHT_SMOKE;
  return smokeEnv === '1';
}

export function buildPlaywrightSmokeLiveStats(keys: SmokeLiveStatsKey[]) {
  const sortedKeys = [...keys]
    .filter((key) => key.outlineKeyId.trim().length > 0)
    .sort((left, right) => left.outlineKeyId.localeCompare(right.outlineKeyId));

  const keyStats: Record<string, number> = {};
  let bandwidthBps = 0;

  sortedKeys.forEach((key, index) => {
    const usedBytes = key.usedBytes ?? BigInt(0);
    const jitter = Number(usedBytes % BigInt(SMOKE_LIVE_STATS_JITTER_BYTES));
    const delta = SMOKE_LIVE_STATS_BASELINE_BYTES + (index * SMOKE_LIVE_STATS_STEP_BYTES) + jitter;

    keyStats[key.outlineKeyId] = delta;
    bandwidthBps += delta;
  });

  return {
    activeConnections: sortedKeys.length,
    bandwidthBps,
    keyStats,
  };
}
