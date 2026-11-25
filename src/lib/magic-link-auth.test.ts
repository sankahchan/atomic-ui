import assert from 'node:assert/strict';
import test from 'node:test';

import {
  authorizeWebAppToken,
  createMagicLinkSession,
  verifyMagicLinkSession,
} from './magic-link-auth';
import { createTelegramWebAppSession } from './telegram-webapp-auth';

test('magic-link sessions carry only the scoped key grant', async () => {
  const token = await createMagicLinkSession({
    keyId: 'key-1',
    kind: 'normal',
    locale: 'my',
  });

  const claims = await verifyMagicLinkSession(token);
  assert.deepEqual(claims, { keyId: 'key-1', kind: 'normal', locale: 'my' });

  const auth = await authorizeWebAppToken(token);
  assert.equal(auth?.type, 'magic');
  if (auth?.type === 'magic') {
    assert.equal(auth.claims.keyId, 'key-1');
  }
});

test('telegram sessions are not accepted as magic links', async () => {
  const telegramToken = await createTelegramWebAppSession({ telegramUserId: 12345 });

  assert.equal(await verifyMagicLinkSession(telegramToken), null);
  const auth = await authorizeWebAppToken(telegramToken);
  assert.equal(auth?.type, 'telegram');
});

test('invalid tokens are rejected', async () => {
  assert.equal(await verifyMagicLinkSession('not-a-token'), null);
  assert.equal(await authorizeWebAppToken(null), null);
  assert.equal(await authorizeWebAppToken(''), null);
});
