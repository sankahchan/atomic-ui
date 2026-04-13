import { expect, test } from '@playwright/test';

const smokeAdminEmail = 'smoke-admin@example.com';
const smokeAdminPassword = 'Admin123!';

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.locator('#email').fill(smokeAdminEmail);
  await page.locator('#password').fill(smokeAdminPassword);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\?.*)?$/, { timeout: 30_000 });
}

test('admin smoke journeys stay functional', async ({ page }) => {
  await login(page);

  await test.step('manual scheduler run works from jobs page', async () => {
    await page.goto('/dashboard/jobs');
    const healthJob = page.getByTestId('scheduler-job-health_check');
    await expect(healthJob).toBeVisible();
    await healthJob.getByTestId('scheduler-run-health_check').click();
    await expect(healthJob).toContainText('Last trigger: MANUAL');
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
    await expect(page.getByText(replyText)).toBeVisible();
  });

  await test.step('telegram review queue claim and reject macro works', async () => {
    await page.goto('/dashboard/notifications?workspace=workflow&workflowTab=review');
    const reviewCard = page.getByTestId('review-order-PW-ORDER-001');
    await expect(reviewCard).toBeVisible();
    await page.getByTestId('review-order-claim-PW-ORDER-001').click();
    await page.getByTestId('review-order-reject-primary-PW-ORDER-001').click();
    await expect(reviewCard).toContainText(/Rejected|REJECTED/);
  });
});
