import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CLIENT_BUILD_HEADER_NAME,
  CLIENT_BUILD_QUERY_PARAM_NAME,
} from '@/lib/deploy-guard';
import {
  buildFormActionWithClientBuild,
  buildFetchRequestWithClientBuild,
  isNextRouterRscFetch,
} from '@/lib/deploy-guard-client';

const currentHref = 'https://example.com/dashboard';

test('RSC fetch detection accepts the _rsc query marker', () => {
  assert.equal(
    isNextRouterRscFetch('https://example.com/dashboard?_rsc=abc', undefined, currentHref),
    true,
  );
});

test('RSC fetch detection accepts app-router headers', () => {
  assert.equal(
    isNextRouterRscFetch(
      'https://example.com/dashboard',
      {
        headers: {
          rsc: '1',
          'next-router-state-tree': '[]',
        },
      },
      currentHref,
    ),
    true,
  );
});

test('RSC fetch detection ignores cross-origin requests', () => {
  assert.equal(
    isNextRouterRscFetch('https://other.example/dashboard?_rsc=abc', undefined, currentHref),
    false,
  );
});

test('client build header is merged without replacing the original Request object', () => {
  const request = new Request('https://example.com/dashboard?_rsc=abc', {
    headers: {
      rsc: '1',
    },
  });

  const [input, init] = buildFetchRequestWithClientBuild(
    request,
    undefined,
    'current-build',
    currentHref,
  );

  assert.equal(input, request);
  assert.equal(new Headers(init?.headers).get(CLIENT_BUILD_HEADER_NAME), 'current-build');
  assert.equal(new Headers(init?.headers).get('rsc'), '1');
});

test('same-origin form actions receive an immutable build query marker', () => {
  const action = buildFormActionWithClientBuild('/dashboard/settings', 'current-build', currentHref);
  assert.equal(
    action,
    `https://example.com/dashboard/settings?${CLIENT_BUILD_QUERY_PARAM_NAME}=current-build`,
  );
});

test('cross-origin form actions are left untouched', () => {
  const action = buildFormActionWithClientBuild('https://other.example/form', 'current-build', currentHref);
  assert.equal(action, 'https://other.example/form');
});
