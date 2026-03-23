/**
 * Live e2e tests for mixed API+CLI voice scenarios.
 *
 * Each test skips gracefully when the required credential or CLI binary is not available.
 * Run via: make test-e2e-mixed-live
 *
 * Scenarios:
 *   1. Mixed API+CLI broadcast — multi-round (Anthropic API + Copilot CLI, 2 rounds)
 */

import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, makeTempDir, skipOnboarding, goToProvidersTab } from './helpers';
import {
  makePause,
  LIVE_TEST_MODELS,
  enableProvider,
  requireProviders,
  buildCompositionLive,
  expandSidebarAndAssertVoiceTypes,
  waitForVoiceResponse,
  waitForRoundIdle,
  startSession,
} from './helpers/liveHelpers';

// Shared across the live-conversations and restart-persistence describes so the
// restart test can reuse the same data directory.
let sharedDir: string;

test.describe.serial('mixed API+CLI providers', () => {
  let app: ElectronApplication;
  let win: Page;
  let pause: () => Promise<void>;
  let longPause: () => Promise<void>;

  test.beforeAll(async () => {
    sharedDir = makeTempDir();
    app = await launchApp({ POLYPHON_TEST_USER_DATA: sharedDir, POLYPHON_SHOW_WINDOW: '1' });
    win = await app.firstWindow();
    await win.waitForLoadState('domcontentloaded');
    await skipOnboarding(win);

    ({ pause, longPause } = makePause(win));
    await pause();

    await enableProvider(win, 'anthropic', 'api');
    await enableProvider(win, 'copilot', 'api');
    await enableProvider(win, 'copilot', 'cli');

    await goToProvidersTab(win);
    await pause();
  });

  test.afterAll(async () => {
    await app?.close().catch(() => {});
  });

  // ── Scenario 1: Mixed API+CLI broadcast — multi-round ──────────────────────

  test.describe.serial('mixed API+CLI broadcast — multi-round', () => {
    test('Anthropic API + Copilot CLI respond across two rounds', async () => {
      const ok = await requireProviders(win, [
        { providerId: 'anthropic', voiceType: 'api', label: 'Anthropic API' },
        { providerId: 'copilot', voiceType: 'cli', cliCommand: 'copilot', label: 'Copilot CLI' },
      ]);
      if (!ok) return;

      await buildCompositionLive(win, pause, longPause, 'Live Mix Duo', [
        { providerId: 'anthropic', voiceType: 'api', displayName: 'Anthropic API', model: LIVE_TEST_MODELS.anthropic },
        { providerId: 'copilot', voiceType: 'cli', displayName: 'Copilot CLI' },
      ]);
      await startSession(win, pause, 'Live Mix Duo', 'Mix Duo Session');
      await expandSidebarAndAssertVoiceTypes(win, pause, [
        { displayName: 'Anthropic API', voiceType: 'api' },
        { displayName: 'Copilot CLI', voiceType: 'cli' },
      ]);

      // Round 1
      await win
        .getByPlaceholder('Message the ensemble\u2026')
        .fill('Reply in one sentence and include the word "first".');
      await pause();
      await win.keyboard.press('Enter');
      await waitForVoiceResponse(win, 'Anthropic API');
      await waitForVoiceResponse(win, 'Copilot CLI');
      await waitForRoundIdle(win);
      await longPause();

      // Round 2
      await win
        .getByPlaceholder('Message the ensemble\u2026')
        .fill('Reply in one sentence and include the word "second".');
      await pause();
      await win.keyboard.press('Enter');

      await expect(
        win.locator('[role="article"][aria-label*="Anthropic API"]').filter({ hasText: /\S/ }),
      ).toHaveCount(2, { timeout: 90_000 });
      await expect(
        win.locator('[role="article"][aria-label*="Copilot CLI"]').filter({ hasText: /\S/ }),
      ).toHaveCount(2, { timeout: 90_000 });
      await waitForRoundIdle(win);
      await expect(win.locator('[role="alert"]')).not.toBeVisible();
      await longPause();
    });
  });

});

// ── Restart persistence ───────────────────────────────────────────────────────
//
// Deliberately depends on sharedDir populated by the mixed providers describe above.
// If all mixed provider tests were skipped, this test skips too.

test.describe('restart persistence — mixed', () => {
  test('session messages are readable after app restart', async () => {
    const app = await launchApp({ POLYPHON_TEST_USER_DATA: sharedDir, POLYPHON_SHOW_WINDOW: '1' });
    const win = await app.firstWindow();
    await win.waitForLoadState('domcontentloaded');
    await skipOnboarding(win);

    const { pause, longPause } = makePause(win);
    await pause();

    await win.getByRole('button', { name: /sessions/i }).click();
    await pause();

    const nav = win.getByRole('navigation');

    if (!(await nav.getByText('Mix Duo Session').isVisible())) {
      test.skip(true, 'No live mixed sessions were created — all mixed provider tests were skipped');
      await app.close().catch(() => {});
      return;
    }

    await nav.getByText('Mix Duo Session').click();
    await pause();

    await expect(
      win.getByText('Reply in one sentence and include the word "first".'),
    ).toBeVisible({ timeout: 5_000 });
    await longPause();

    await app.close().catch(() => {});
  });
});
