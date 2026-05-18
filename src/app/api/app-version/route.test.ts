import assert from 'node:assert/strict';
import test from 'node:test';

import { GET } from '@/app/api/app-version/route';

const originalBuildId = process.env.NEXT_PUBLIC_APP_VERSION;

test.after(() => {
  if (originalBuildId === undefined) {
    delete process.env.NEXT_PUBLIC_APP_VERSION;
    return;
  }

  process.env.NEXT_PUBLIC_APP_VERSION = originalBuildId;
});

test('app-version route does not set the build cookie', async () => {
  process.env.NEXT_PUBLIC_APP_VERSION = 'new-build';

  const response = await GET();

  assert.equal(response.headers.get('set-cookie'), null);
});
