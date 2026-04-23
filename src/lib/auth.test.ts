import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSessionCookieOptions, shouldUseSecureSessionCookie } from './auth';

const originalEnv = {
  nodeEnv: process.env.NODE_ENV,
  appUrl: process.env.APP_URL,
  nextPublicAppUrl: process.env.NEXT_PUBLIC_APP_URL,
  nextAuthUrl: process.env.NEXTAUTH_URL,
};

test.afterEach(() => {
  (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv.nodeEnv;

  if (typeof originalEnv.appUrl === 'undefined') {
    delete process.env.APP_URL;
  } else {
    process.env.APP_URL = originalEnv.appUrl;
  }

  if (typeof originalEnv.nextPublicAppUrl === 'undefined') {
    delete process.env.NEXT_PUBLIC_APP_URL;
  } else {
    process.env.NEXT_PUBLIC_APP_URL = originalEnv.nextPublicAppUrl;
  }

  if (typeof originalEnv.nextAuthUrl === 'undefined') {
    delete process.env.NEXTAUTH_URL;
  } else {
    process.env.NEXTAUTH_URL = originalEnv.nextAuthUrl;
  }
});

test('secure session cookies are enabled for https production origins', () => {
  (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
  process.env.APP_URL = 'https://panel.example.com';
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.NEXTAUTH_URL;

  assert.equal(shouldUseSecureSessionCookie(), true);
  assert.equal(buildSessionCookieOptions().secure, true);
  assert.equal(buildSessionCookieOptions().sameSite, 'strict');
  assert.equal(buildSessionCookieOptions().priority, 'high');
});

test('http bootstrap installs keep session cookies compatible', () => {
  (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
  process.env.APP_URL = 'http://139.59.229.145';
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.NEXTAUTH_URL;

  assert.equal(shouldUseSecureSessionCookie(), false);
  assert.equal(buildSessionCookieOptions().secure, false);
  assert.equal(buildSessionCookieOptions().sameSite, 'lax');
});
