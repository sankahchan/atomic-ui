import { defineConfig } from '@playwright/test';

const port = 3100;
const baseURL = `http://127.0.0.1:${port}`;
const channel = process.env.PLAYWRIGHT_BROWSER_CHANNEL?.trim();

export default defineConfig({
  testDir: './playwright',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL,
    headless: true,
    ...(channel ? { channel } : {}),
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'tsx scripts/playwright-web-server.ts',
    url: `${baseURL}/login`,
    reuseExistingServer: false,
    timeout: 600_000,
  },
});
