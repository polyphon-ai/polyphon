import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: ['**/*.spec.ts'],
  timeout: 60_000,
  retries: process.env.CI ? 2 : 0,
  // Run spec files in parallel — each launches its own isolated Electron instance.
  // Cap at 3 (one per spec file); CI gets 2 to stay within typical runner core counts.
  workers: process.env.CI ? 2 : 3,
  reporter: process.env.CI ? 'github' : 'list',
  // Electron tests launch the app process directly — no browser URL needed.
  use: {
    // Screenshot on failure for easier debugging in CI
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
});
