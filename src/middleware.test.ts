import assert from 'node:assert/strict';
import test from 'node:test';

import { isPublicRoute } from '@/middleware';

test('status page is explicitly public', () => {
  assert.equal(isPublicRoute('/status'), true);
  assert.equal(isPublicRoute('/status/history'), true);
});

test('exact public-route matching does not leak to sibling paths', () => {
  assert.equal(isPublicRoute('/login'), true);
  assert.equal(isPublicRoute('/login-approval'), true);
  assert.equal(isPublicRoute('/loginish'), false);
  assert.equal(isPublicRoute('/statuspage'), false);
});
