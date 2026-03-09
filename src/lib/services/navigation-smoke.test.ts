import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  adminToolNavItems,
  primaryDashboardNavItems,
  settingsShortcutItems,
} from '@/components/layout/dashboard-nav';

const rootDir = path.resolve(process.cwd(), 'src/app/(dashboard)');

function routeToCandidates(href: string): string[] {
  if (href === '/dashboard') {
    return [path.join(rootDir, 'dashboard/page.tsx')];
  }

  if (href.startsWith('/dashboard/')) {
    const relative = href.replace('/dashboard/', '');
    return [path.join(rootDir, `dashboard/${relative}/page.tsx`)];
  }

  return [path.join(rootDir, `${href.replace(/^\//, '')}/page.tsx`)];
}

test('dashboard navigation routes resolve to page files', () => {
  const hrefs = [
    ...primaryDashboardNavItems.map((item) => item.href),
    ...adminToolNavItems.map((item) => item.href),
    ...settingsShortcutItems.map((item) => item.href),
  ];

  assert.equal(new Set(hrefs).size, hrefs.length, 'navigation hrefs must be unique');

  for (const href of hrefs) {
    const exists = routeToCandidates(href).some((candidate) => fs.existsSync(candidate));
    assert.equal(exists, true, `missing page file for ${href}`);
  }
});

test('critical detail pages exist', () => {
  const criticalPages = [
    'dashboard/servers/[id]/page.tsx',
    'dashboard/keys/[id]/page.tsx',
    'dashboard/dynamic-keys/[id]/page.tsx',
    'dashboard/settings/page.tsx',
    'dashboard/notifications/page.tsx',
  ];

  for (const file of criticalPages) {
    assert.equal(fs.existsSync(path.join(rootDir, file)), true, `missing critical page ${file}`);
  }
});
