import assert from 'node:assert/strict';
import test from 'node:test';

import { getJwtSecretString } from './session-secret';

const originalEnv = {
  nodeEnv: process.env.NODE_ENV,
  jwtSecret: process.env.JWT_SECRET,
};
const mutableEnv = process.env as Record<string, string | undefined>;

test.afterEach(() => {
  mutableEnv.NODE_ENV = originalEnv.nodeEnv;

  if (typeof originalEnv.jwtSecret === 'undefined') {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalEnv.jwtSecret;
  }
});

test('getJwtSecretString rejects short production secrets', () => {
  mutableEnv.NODE_ENV = 'production';
  process.env.JWT_SECRET = 'too-short-secret';

  assert.throws(
    () => getJwtSecretString(),
    /JWT_SECRET must be at least 32 characters in production/,
  );
});

test('getJwtSecretString accepts strong production secrets', () => {
  mutableEnv.NODE_ENV = 'production';
  process.env.JWT_SECRET = '12345678901234567890123456789012';

  assert.equal(getJwtSecretString(), '12345678901234567890123456789012');
});
