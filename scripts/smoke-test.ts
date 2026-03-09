import assert from 'node:assert/strict';
import { URL } from 'node:url';
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from '../src/server/routers';

function getArg(name: string): string | undefined {
  const match = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return match ? match.slice(name.length + 3) : undefined;
}

const baseUrl = (getArg('base-url') || process.env.SMOKE_BASE_URL || '').replace(/\/$/, '');
const email = getArg('email') || process.env.SMOKE_EMAIL || process.env.SMOKE_USERNAME;
const password = getArg('password') || process.env.SMOKE_PASSWORD;

if (!baseUrl) {
  throw new Error('Missing base URL. Use --base-url=https://panel.example.com or SMOKE_BASE_URL.');
}

if (!email || !password) {
  throw new Error('Missing credentials. Set --email/--password or SMOKE_EMAIL/SMOKE_PASSWORD.');
}

const smokeEmail = email;
const smokePassword = password;

let sessionCookie = '';

const client = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${baseUrl}/api/trpc`,
      transformer: superjson,
      fetch: async (url, options) => {
        const response = await fetch(url, {
          ...options,
          headers: {
            ...(options?.headers || {}),
            ...(sessionCookie ? { cookie: sessionCookie } : {}),
          },
        });

        const setCookie = response.headers.get('set-cookie');
        if (setCookie) {
          sessionCookie = setCookie.split(';')[0] || sessionCookie;
        }

        return response;
      },
    }),
  ],
});

async function checkRoute(path: string, expectedStatuses: number[], label: string, withSession = false) {
  const url = new URL(path, baseUrl);
  const response = await fetch(url, {
    redirect: 'manual',
    headers: withSession && sessionCookie ? { cookie: sessionCookie } : undefined,
  });

  assert(
    expectedStatuses.includes(response.status),
    `${label} expected status ${expectedStatuses.join('/')} but got ${response.status}`
  );
}

async function main() {
  await checkRoute('/login', [200], 'login page');
  await checkRoute('/dashboard', [302, 307], 'dashboard redirect without session');

  const loginResult = await client.auth.login.mutate({
    email: smokeEmail,
    password: smokePassword,
  });

  assert(loginResult, 'login mutation returned no result');
  assert.equal(loginResult.requires2FA, false, 'smoke test requires a non-2FA account');
  assert(sessionCookie, 'login succeeded but session cookie was not captured');

  await checkRoute('/dashboard', [200], 'dashboard with session', true);
  await checkRoute('/dashboard/servers', [200], 'servers page', true);
  await checkRoute('/dashboard/keys', [200], 'keys page', true);
  await checkRoute('/dashboard/dynamic-keys', [200], 'dynamic keys page', true);
  await checkRoute('/dashboard/settings', [200], 'settings page', true);

  const [servers, keys, dynamicKeys] = await Promise.all([
    client.servers.list.query({}),
    client.keys.list.query({ page: 1, pageSize: 1 }),
    client.dynamicKeys.list.query({ page: 1, pageSize: 1 }),
  ]);

  if (servers[0]?.id) {
    await checkRoute(`/dashboard/servers/${servers[0].id}`, [200], 'server detail page', true);
  }

  if (keys.items?.[0]?.id) {
    await checkRoute(`/dashboard/keys/${keys.items[0].id}`, [200], 'key detail page', true);
  }

  if (dynamicKeys.items?.[0]?.id) {
    await checkRoute(`/dashboard/dynamic-keys/${dynamicKeys.items[0].id}`, [200], 'dynamic key detail page', true);
  }

  console.log('Smoke test passed');
}

main().catch((error) => {
  console.error('Smoke test failed');
  console.error(error);
  process.exit(1);
});
