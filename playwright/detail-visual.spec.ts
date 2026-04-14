import { expect, test } from '@playwright/test';

import { freezeBrowserTime, login, setTheme, stabilizeVisuals } from './helpers';

const layouts = [
  {
    name: 'desktop',
    viewport: { width: 1440, height: 1400 },
  },
  {
    name: 'mobile',
    viewport: { width: 393, height: 1180 },
  },
] as const;

const themes = ['dark', 'light'] as const;

const detailPages = [
  {
    name: 'access-key-detail',
    path: '/dashboard/keys/smoke-access-key',
    testId: 'access-key-detail-page',
  },
  {
    name: 'dynamic-key-detail',
    path: '/dashboard/dynamic-keys/smoke-dynamic-key',
    testId: 'dynamic-key-detail-page',
  },
  {
    name: 'support-thread-detail',
    path: '/dashboard/support/threads/smoke-support-thread',
    testId: 'support-thread-detail-page',
  },
  {
    name: 'customer-crm-detail',
    path: '/dashboard/users/smoke-portal-user',
    testId: 'customer-crm-detail-page',
  },
] as const;

for (const layout of layouts) {
  test.describe(`${layout.name} detail workspace visuals`, () => {
    test.use({
      viewport: layout.viewport,
    });

    for (const theme of themes) {
      for (const detailPage of detailPages) {
        test(`${detailPage.name} (${theme})`, async ({ page }) => {
          await freezeBrowserTime(page);
          await setTheme(page, theme);
          await login(page);
          await expect(page).toHaveURL(/\/dashboard(?:\?.*)?$/, { timeout: 30_000 });

          await page.goto(detailPage.path);
          await page.waitForLoadState('networkidle');
          await stabilizeVisuals(page);
          await expect(page.getByTestId(detailPage.testId)).toBeVisible();

          await expect(page).toHaveScreenshot(
            `${detailPage.name}-${layout.name}-${theme}.png`,
            {
              animations: 'disabled',
              caret: 'hide',
              maxDiffPixelRatio: 0.01,
            },
          );
        });
      }
    }
  });
}
