import { expect, test } from '@playwright/test';
import { login, smokePortalEmail, smokePortalPassword } from './helpers';

test('admin smoke journeys stay functional', async ({ page }) => {
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
    const keyName = 'Playwright Smoke Key';
    await page.goto('/dashboard/keys');
    await page.getByTestId('create-access-key').first().click();
    await page.locator('#name').fill(keyName);
    await page.getByTestId('create-access-key-submit').click();
    await expect(page.getByRole('dialog').getByText(keyName)).toBeVisible();
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
    const response = await page.evaluate(async () => {
      const res = await fetch('/api/restore', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bad: true }),
      });
      return {
        status: res.status,
        body: await res.text(),
      };
    });

    expect(response.status).toBe(415);
    expect(response.body).toContain('multipart/form-data');
  });
});

test('portal smoke login stays functional', async ({ page }) => {
  await login(page, smokePortalEmail, smokePortalPassword);
  await expect(page).toHaveURL(/\/portal(?:\?.*)?$/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: /My Access Keys/i })).toBeVisible();
});
