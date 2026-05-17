import assert from 'node:assert/strict';
import test from 'node:test';

import { hasValidRequestSecret } from './request-secret-auth';

test('hasValidRequestSecret accepts the direct header', () => {
  const headers = new Headers({ 'x-cron-secret': 'secret-value' });
  assert.equal(hasValidRequestSecret(headers, 'secret-value'), true);
});

test('hasValidRequestSecret accepts bearer authorization', () => {
  const headers = new Headers({ authorization: 'Bearer secret-value' });
  assert.equal(hasValidRequestSecret(headers, 'secret-value'), true);
});

test('hasValidRequestSecret rejects missing or mismatched secrets', () => {
  assert.equal(hasValidRequestSecret(new Headers(), 'secret-value'), false);
  assert.equal(
    hasValidRequestSecret(new Headers({ authorization: 'Bearer wrong-value' }), 'secret-value'),
    false,
  );
});

