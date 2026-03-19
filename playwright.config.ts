import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: ['**/*.spec.ts'],
  // 120s to accommodate Electron startup on Windows (dev-drive workspace copy adds latency).
  timeout: 120_000,
  // Cap the entire suite. voices.spec.ts alone takes ~14 min on Linux/Windows runners.
  globalTimeout: process.env.CI ? 30 * 60 * 1_000 : 0,
  retries: process.env.CI ? 2 : 0,
  // Run all tests in parallel — each launches its own isolated Electron instance.
  // test.describe.serial blocks still enforce sequential order within that group.
  fullyParallel: true,
  workers: process.env.CI ? 3 : 10,
  reporter: process.env.CI ? 'github' : 'list',
  // Electron tests launch the app process directly — no browser URL needed.
  use: {
    // Screenshot on failure for easier debugging in CI
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
});
