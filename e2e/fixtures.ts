import { test as base, expect } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { launchMockApp, skipOnboarding, enableProviders } from './helpers';

type WorkerFixtures = {
  sharedApp: ElectronApplication;
  sharedWindow: Page;
};

/**
 * Worker-scoped Electron fixture.
 *
 * One Electron instance is launched per worker process and reused across all
 * spec files assigned to that worker. This cuts app startup overhead from
 * N-spec-files down to N-workers.
 *
 * Safe teardown kills the entire process group before calling app.close() so
 * that any CLI voice subprocesses don't keep the group alive and cause
 * Playwright's teardown to hang on Linux/Windows (playwright#39248).
 */
export const test = base.extend<{}, WorkerFixtures>({
  sharedApp: [
    async ({}, use) => {
      const app = await launchMockApp();
      const win = await app.firstWindow();
      await win.waitForLoadState('domcontentloaded');
      await skipOnboarding(win);
      await enableProviders(win);
      await use(app);

      // Safe teardown: kill the entire process group so no orphaned child
      // processes (CLI voices, GPU helper) keep the group alive and hang teardown.
      const pid = app.process().pid;
      if (pid != null) {
        try { process.kill(-pid, 'SIGTERM'); } catch { /* already gone */ }
      }
      await app.close().catch(() => {});
    },
    { scope: 'worker', timeout: 120_000 },
  ],

  sharedWindow: [
    async ({ sharedApp }, use) => {
      const win = await sharedApp.firstWindow();
      await use(win);
    },
    { scope: 'worker' },
  ],
});

export { expect };
