import { expect, test } from '@playwright/test';
import { login, smokePortalEmail, smokePortalPassword } from './helpers';

test('admin smoke journeys stay functional', async ({ page }) => {
  test.setTimeout(120_000);
  await login(page);
  await expect(page).toHaveURL(/\/dashboard(?:\?.*)?$/, { timeout: 30_000 });

  await test.step('manual scheduler run works from jobs page', async () => {
    await page.goto('/dashboard/jobs');
    const healthJob = page.getByTestId('scheduler-job-health_check');
    await expect(healthJob).toBeVisible();
    await healthJob.getByTestId('scheduler-run-health_check').click();
    await expect(healthJob).toContainText('Last trigger: MANUAL');
  });

  await test.step('scheduler pause and resume controls work', async () => {
    await page.goto('/dashboard/jobs');
    const healthJob = page.getByTestId('scheduler-job-health_check');
    await healthJob.getByTestId('scheduler-pause-health_check').click();
    await expect(healthJob).toContainText('PAUSED');
    await healthJob.getByTestId('scheduler-pause-health_check').click();
    await expect(healthJob).not.toContainText('PAUSED');
  });

  await test.step('monitoring overview loads with live health cards', async () => {
    await page.goto('/dashboard/monitoring');
    await expect(page.getByRole('heading', { name: /Monitoring/i })).toBeVisible();
    await expect(page.getByText('Current monitor state')).toBeVisible();
    await expect(page.getByText('Portable restore baseline')).toBeVisible();
    await expect(page.getByText('Delivery health')).toBeVisible();
    await expect(page.getByText('Backlog aging')).toBeVisible();
    await expect(page.getByLabel('Webhook backlog threshold')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save monitoring settings' })).toBeVisible();
  });

  await test.step('access key creation works from the panel', async () => {
    const keyName = `Playwright Smoke Key ${Date.now()}`;
    await page.goto('/dashboard/keys');
    await page.getByTestId('create-access-key').first().click();
    await page.locator('#name').fill(keyName);
    await page.getByTestId('create-access-key-submit').click();
    const createdDialog = page.getByRole('dialog').filter({ hasText: keyName }).first();
    await expect(createdDialog.getByText('Access key created')).toBeVisible({ timeout: 15_000 });
    await expect(createdDialog.getByText(keyName, { exact: true })).toBeVisible({ timeout: 15_000 });
  });

  await test.step('support thread claim and reply works', async () => {
    const replyText = 'Playwright admin reply';
    await page.goto('/dashboard/support/threads/smoke-support-thread');
    await page.getByTestId('support-claim').click();
    await page.locator('#support-reply').fill(replyText);
    await page.getByTestId('support-send-reply').click();
    await expect(page.locator('p.whitespace-pre-wrap', { hasText: replyText }).last()).toBeVisible();
  });

  await test.step('telegram review queue claim and reject macro works', async () => {
    await page.goto('/dashboard/notifications?workspace=workflow&workflowTab=review');
    const reviewCard = page.getByTestId('review-order-PW-ORDER-001');
    await expect(reviewCard).toBeVisible();
    await page.getByTestId('review-order-claim-PW-ORDER-001').click();
    await page.getByTestId('review-order-reject-primary-PW-ORDER-001').click();
    await expect(reviewCard).toContainText(/Rejected|REJECTED/);
  });

  await test.step('restore endpoint rejects the wrong content type cleanly', async () => {
    const res = await page.request.post('/api/restore', {
      headers: { 'content-type': 'application/json' },
      data: { bad: true },
    });
    const response = {
      status: res.status(),
      body: await res.text(),
    };

    expect(response.status).toBe(415);
    expect(response.body).toContain('multipart/form-data');
  });
});

test('portal smoke login stays functional', async ({ page }) => {
  await login(page, smokePortalEmail, smokePortalPassword);
  await expect(page).toHaveURL(/\/portal(?:\?.*)?$/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: /My Access Keys/i })).toBeVisible();
});

test.describe('mobile dashboard layout', () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36',
    viewport: { width: 390, height: 844 },
  });

  test('preserves normal Android viewport scrolling', async ({ page }) => {
    await login(page);
    await expect(page).toHaveURL(/\/dashboard(?:\?.*)?$/, { timeout: 30_000 });
    await page.goto('/dashboard/keys');
    await expect(page.locator('.ops-mobile-root')).toBeVisible();
    await expect(page.locator('main.ops-mobile-scroll-main')).toBeVisible();

    const layout = await page.evaluate(() => {
      const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
      const root = document.querySelector<HTMLElement>('.ops-mobile-root');
      const shell = document.querySelector<HTMLElement>('.ops-mobile-scroll-shell');
      const main = document.querySelector<HTMLElement>('main.ops-mobile-scroll-main');
      const bodyStyle = getComputedStyle(document.body);
      const rootStyle = root ? getComputedStyle(root) : null;
      const shellStyle = shell ? getComputedStyle(shell) : null;
      const mainStyle = main ? getComputedStyle(main) : null;

      return {
        bodyOverflowY: bodyStyle.overflowY,
        bodyTouchAction: bodyStyle.touchAction,
        innerHeight: window.innerHeight,
        mainTransform: mainStyle?.transform ?? '',
        mainTouchAction: mainStyle?.touchAction ?? '',
        mainWillChange: mainStyle?.willChange ?? '',
        rootOverflowY: rootStyle?.overflowY ?? '',
        rootTouchAction: rootStyle?.touchAction ?? '',
        scrollHeight: document.documentElement.scrollHeight,
        shellTouchAction: shellStyle?.touchAction ?? '',
        viewport: viewport?.content ?? '',
      };
    });

    expect(layout.viewport).not.toContain('maximum-scale');
    expect(layout.viewport).not.toContain('user-scalable=no');
    expect(layout.scrollHeight).toBeGreaterThan(layout.innerHeight);
    expect(layout.bodyOverflowY).toBe('auto');
    expect(layout.rootOverflowY).toBe('visible');
    expect(layout.bodyTouchAction).toContain('pan-y');
    expect(layout.rootTouchAction).toContain('pan-y');
    expect(layout.shellTouchAction).toContain('pan-y');
    expect(layout.mainTouchAction).toContain('pan-y');
    expect(layout.mainTransform).toBe('none');
    expect(layout.mainWillChange).toBe('auto');

    await page.evaluate(() => {
      const maxScrollTop = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo(0, Math.min(600, maxScrollTop));
    });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  });
});
