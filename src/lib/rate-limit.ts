type RateLimitEntry = {
  windowStartedAt: number;
  count: number;
  blockedUntil: number;
};

type RateLimitOptions = {
  limit: number;
  windowMs: number;
  blockMs?: number;
};

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
};

const GLOBAL_KEY = '__atomic_ui_rate_limit_store__';
const MAX_ENTRIES = 5000;

function getStore() {
  const globalStore = globalThis as typeof globalThis & {
    [GLOBAL_KEY]?: Map<string, RateLimitEntry>;
  };

  if (!globalStore[GLOBAL_KEY]) {
    globalStore[GLOBAL_KEY] = new Map<string, RateLimitEntry>();
  }

  return globalStore[GLOBAL_KEY];
}

function cleanupStore(now: number) {
  const store = getStore();
  for (const [key, entry] of store.entries()) {
    const expiredWindow = entry.windowStartedAt + 24 * 60 * 60_000 <= now;
    const expiredBlock = entry.blockedUntil > 0 && entry.blockedUntil <= now;
    if (expiredWindow && expiredBlock) {
      store.delete(key);
    }
  }

  if (store.size <= MAX_ENTRIES) {
    return;
  }

  const overflow = store.size - MAX_ENTRIES;
  let removed = 0;
  for (const key of store.keys()) {
    store.delete(key);
    removed += 1;
    if (removed >= overflow) {
      break;
    }
  }
}

export function consumeRateLimit(key: string, options: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  cleanupStore(now);

  const blockMs = options.blockMs ?? options.windowMs;
  const store = getStore();
  const existing = store.get(key);

  if (existing?.blockedUntil && existing.blockedUntil > now) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: existing.blockedUntil - now,
    };
  }

  const entry =
    !existing || existing.windowStartedAt + options.windowMs <= now
      ? {
          windowStartedAt: now,
          count: 0,
          blockedUntil: 0,
        }
      : existing;

  entry.count += 1;

  if (entry.count > options.limit) {
    entry.blockedUntil = now + blockMs;
    store.set(key, entry);
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: blockMs,
    };
  }

  store.set(key, entry);
  return {
    allowed: true,
    remaining: Math.max(0, options.limit - entry.count),
    retryAfterMs: 0,
  };
}

export function resetRateLimit(key: string) {
  getStore().delete(key);
}

export function clearRateLimitStoreForTests() {
  getStore().clear();
}
