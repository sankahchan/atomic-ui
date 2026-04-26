import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveRequestBuildId,
  shouldRejectStaleServerAction,
} from '@/lib/deploy-guard';

test('request build id prefers immutable client header over cookie', () => {
  assert.equal(
    resolveRequestBuildId({
      headerBuildId: 'old-build',
      cookieBuildId: 'new-build',
    }),
    'old-build',
  );
});

test('request build id prefers immutable client query marker over cookie when no header exists', () => {
  assert.equal(
    resolveRequestBuildId({
      queryBuildId: 'old-build',
      cookieBuildId: 'new-build',
    }),
    'old-build',
  );
});

test('stale server action is rejected when client header is older than current build', () => {
  assert.equal(
    shouldRejectStaleServerAction({
      currentBuildId: 'new-build',
      headerBuildId: 'old-build',
      cookieBuildId: 'new-build',
    }),
    true,
  );
});

test('matching immutable client header suppresses false stale-cookie mismatches', () => {
  assert.equal(
    shouldRejectStaleServerAction({
      currentBuildId: 'new-build',
      headerBuildId: 'new-build',
      cookieBuildId: 'old-build',
    }),
    false,
  );
});

test('stale server action is rejected when form query marker is older than the current build', () => {
  assert.equal(
    shouldRejectStaleServerAction({
      currentBuildId: 'new-build',
      queryBuildId: 'old-build',
      cookieBuildId: 'new-build',
    }),
    true,
  );
});

test('server action is not rejected when the request does not carry a build id', () => {
  assert.equal(
    shouldRejectStaleServerAction({
      currentBuildId: 'new-build',
    }),
    false,
  );
});
