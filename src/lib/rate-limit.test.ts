import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearRateLimitStoreForTests,
  consumeRateLimit,
  resetRateLimit,
} from './rate-limit';

test.beforeEach(() => {
  clearRateLimitStoreForTests();
});

test('consumeRateLimit blocks after the configured limit', () => {
  assert.equal(consumeRateLimit('key', { limit: 2, windowMs: 60_000 }).allowed, true);
  assert.equal(consumeRateLimit('key', { limit: 2, windowMs: 60_000 }).allowed, true);

  const blocked = consumeRateLimit('key', { limit: 2, windowMs: 60_000, blockMs: 5_000 });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.equal(blocked.retryAfterMs > 0, true);
});

test('resetRateLimit clears the stored budget', () => {
  consumeRateLimit('key', { limit: 1, windowMs: 60_000 });
  resetRateLimit('key');
  assert.equal(consumeRateLimit('key', { limit: 1, windowMs: 60_000 }).allowed, true);
});
