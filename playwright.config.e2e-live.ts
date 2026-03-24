import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: ['**/*.e2e-live.test.ts'],
  timeout: 300_000,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
});
