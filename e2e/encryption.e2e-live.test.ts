/**
 * Live e2e tests for the password encryption flow.
 *
 * Exercises the full set → restart → unlock → change → restart → remove cycle
 * with a real Anthropic API voice, so the encrypted messages are genuine AI
 * content. Skips gracefully when no Anthropic API key is configured.
 *
 * Run via: make test-e2e-live
 *
 * Test coverage:
 *   - Unlock dialog appears at startup when a password is set
 *   - Wrong password shows an inline error; correct password opens the main window
 *   - Prior conductor message and AI response are readable after unlock
 *   - Changing the password: new password required on next restart
 *   - Removing the password: no unlock dialog on next restart; messages still readable
 */

import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, makeTempDir, skipOnboarding, goToEncryptionTab, goToProvidersTab } from './helpers';

const STEP_PAUSE = 1_500;
const LONG_PAUSE = 3_500;

function makePause(win: Page) {
  return {
    pause: () => win.waitForTimeout(STEP_PAUSE),
    longPause: () => win.waitForTimeout(LONG_PAUSE),
  };
}

const LIVE_MODEL = 'claude-haiku-4-5-20251001';
const VOICE_NAME = 'Anthropic Live';
const INITIAL_PASSWORD = 'LiveRestartPass1!';
const CHANGED_PASSWORD = 'LiveChangedPass2@';
const SESSION_NAME = 'Live Encrypted Session';
const CONDUCTOR_MSG = 'What is the meaning of polyphony? Reply in one sentence.';

// ── Availability helpers ───────────────────────────────────────────────────────

async function isAnthropicAvailable(win: Page): Promise<boolean> {
  const statuses = await win.evaluate(async () => window.polyphon.settings.getProviderStatus());
  const entry = statuses.find((s: { provider: string }) => s.provider === 'anthropic');
  return entry?.apiKeyStatus?.status !== 'none' && entry?.apiKeyStatus?.status !== undefined;
}

async function enableAnthropicApi(win: Page): Promise<void> {
  await win.evaluate(
    async ({ model }: { model: string }) => {
      await window.polyphon.settings.saveProviderConfig({
        provider: 'anthropic',
        enabled: true,
        voiceType: 'api',
        defaultModel: model,
        cliCommand: null,
        cliArgs: null,
      });
    },
    { model: LIVE_MODEL },
  );
}

// ── Shared state ───────────────────────────────────────────────────────────────

// Populated in beforeAll; each test checks this flag and skips if false.
let sharedDir: string;
let setupDone = false;

// ── Suite ──────────────────────────────────────────────────────────────────────

test.describe.serial('encryption password flow — live', () => {
  function launchLiveKeyApp(extraEnv: Record<string, string> = {}): Promise<ElectronApplication> {
    return launchApp({
      POLYPHON_E2E: '',
      POLYPHON_TEST_USER_DATA: sharedDir,
      POLYPHON_SHOW_WINDOW: '1',
      ...extraEnv,
    });
  }

  // Launch expecting a password-protected key, submit the password, and return
  // the main window. The caller is responsible for closing the app.
  async function unlockApp(password: string): Promise<{ app: ElectronApplication; mainWin: Page; pause: () => Promise<void>; longPause: () => Promise<void> }> {
    const app = await launchLiveKeyApp();
    const unlockWin = await app.firstWindow();
    await unlockWin.waitForLoadState('domcontentloaded');
    await expect(unlockWin.getByPlaceholder('Password')).toBeVisible({ timeout: 10_000 });

    // Register the 'window' listener before clicking so we don't miss the event.
    const mainWinPromise = app.waitForEvent('window');
    await unlockWin.getByPlaceholder('Password').fill(password);
    await unlockWin.getByRole('button', { name: 'Unlock' }).click();

    const mainWin = await mainWinPromise;
    await mainWin.waitForLoadState('domcontentloaded');
    await skipOnboarding(mainWin);
    const { pause, longPause } = makePause(mainWin);
    await pause();
    return { app, mainWin, pause, longPause };
  }

  // ── Seed: create encrypted session, set password ───────────────────────────

  test.beforeAll(async () => {
    sharedDir = makeTempDir();

    const app = await launchLiveKeyApp();
    const win = await app.firstWindow();
    await win.waitForLoadState('domcontentloaded');
    await skipOnboarding(win);
    const { pause, longPause } = makePause(win);
    await pause();

    // Skip entire suite if no API key is present.
    if (!(await isAnthropicAvailable(win))) {
      await app.close().catch(() => {});
      return; // setupDone stays false; each test will call test.skip()
    }

    await enableAnthropicApi(win);
    // Navigate to Settings so SettingsPage mounts and calls load(), refreshing
    // the store with the newly enabled provider config saved above via IPC.
    await goToProvidersTab(win);
    await pause();

    // Build a one-voice broadcast composition.
    await win.getByRole('button', { name: /compositions/i }).click();
    await pause();
    await win.getByRole('button', { name: 'New Composition', exact: true }).first().click();
    await pause();
    await win.getByPlaceholder('My Composition').fill('Live Enc Comp');
    await pause();
    await win.getByRole('button', { name: /broadcast/i }).first().click();
    await pause();

    await win.getByRole('button', { name: /select anthropic provider/i }).click();
    await pause();
    const displayInput = win.getByPlaceholder(/display name/i);
    if (await displayInput.isVisible()) {
      await displayInput.clear();
      await displayInput.fill(VOICE_NAME);
      await pause();
    }
    await win.getByRole('button', { name: 'Add Voice' }).click();
    await pause();
    await win.getByRole('button', { name: 'Save Composition' }).click();
    await longPause();

    // Start a session and wait for a real AI response (the content will be encrypted).
    await win.getByRole('button', { name: /sessions/i }).click();
    await pause();
    await win.getByRole('button', { name: 'New Session', exact: true }).click();
    await pause();
    await win.getByRole('button', { name: /live enc comp/i }).first().click();
    await pause();
    await win.getByPlaceholder('My session').fill(SESSION_NAME);
    await pause();
    await win.getByRole('button', { name: 'Start Session' }).click();
    await expect(win.getByPlaceholder('Message the ensemble\u2026')).toBeVisible({ timeout: 10_000 });
    await pause();

    await win.getByPlaceholder('Message the ensemble\u2026').fill(CONDUCTOR_MSG);
    await win.keyboard.press('Enter');
    await expect(
      win.locator(`[role="article"][aria-label*="${VOICE_NAME}"]`).filter({ hasText: /\S/ }),
    ).toBeVisible({ timeout: 90_000 });
    await longPause();

    // Set the initial password to protect the key file before closing.
    await goToEncryptionTab(win);
    await pause();
    await win.getByRole('button', { name: /^set password$/i }).click();
    await win.getByPlaceholder('New password', { exact: true }).fill(INITIAL_PASSWORD);
    await win.getByPlaceholder('Confirm password').fill(INITIAL_PASSWORD);
    await win.getByRole('button', { name: /^save$/i }).click();
    await expect(win.getByText('Set a password')).not.toBeVisible({ timeout: 15_000 });
    await longPause();

    await app.close().catch(() => {});
    setupDone = true;
  });

  // ── Tests ──────────────────────────────────────────────────────────────────

  test('unlock dialog appears at startup; wrong password shows an error', async () => {
    if (!setupDone) { test.skip(true, 'Anthropic API key not configured'); return; }

    const app = await launchLiveKeyApp();
    const unlockWin = await app.firstWindow();
    await unlockWin.waitForLoadState('domcontentloaded');
    const { pause, longPause } = makePause(unlockWin);
    await pause();

    // Unlock dialog UI
    await expect(unlockWin.getByText(/enter your password to unlock/i)).toBeVisible({ timeout: 10_000 });
    await expect(unlockWin.getByPlaceholder('Password')).toBeVisible();
    await expect(unlockWin.getByRole('button', { name: 'Unlock' })).toBeVisible();

    // Wrong password
    await unlockWin.getByPlaceholder('Password').fill('definitelywrong!');
    await unlockWin.getByRole('button', { name: 'Unlock' }).click();
    await expect(unlockWin.getByText(/incorrect password/i)).toBeVisible({ timeout: 15_000 });
    await longPause();

    await app.close().catch(() => {});
  });

  test('correct password unlocks; conductor message and AI response are readable', async () => {
    if (!setupDone) { test.skip(true, 'Anthropic API key not configured'); return; }

    const { app, mainWin, pause, longPause } = await unlockApp(INITIAL_PASSWORD);

    await mainWin.getByRole('button', { name: /sessions/i }).click();
    await pause();
    const nav = mainWin.getByRole('navigation');
    await expect(nav.getByText(SESSION_NAME)).toBeVisible({ timeout: 5_000 });
    await nav.getByText(SESSION_NAME).click();
    await longPause();

    // Both the encrypted conductor message and the encrypted AI response must be readable.
    await expect(mainWin.getByText(CONDUCTOR_MSG)).toBeVisible({ timeout: 5_000 });
    await expect(
      mainWin.locator(`[role="article"][aria-label*="${VOICE_NAME}"]`).filter({ hasText: /\S/ }),
    ).toBeVisible({ timeout: 5_000 });

    await app.close().catch(() => {});
  });

  test('changed password is required on the next restart', async () => {
    if (!setupDone) { test.skip(true, 'Anthropic API key not configured'); return; }

    const { app, mainWin, pause, longPause } = await unlockApp(INITIAL_PASSWORD);

    await goToEncryptionTab(mainWin);
    await pause();
    await mainWin.getByRole('button', { name: /^change password$/i }).click();
    await mainWin.getByPlaceholder('Current password').fill(INITIAL_PASSWORD);
    await mainWin.getByPlaceholder('New password', { exact: true }).fill(CHANGED_PASSWORD);
    await mainWin.getByPlaceholder('Confirm new password').fill(CHANGED_PASSWORD);
    await mainWin.getByRole('button', { name: /^save$/i }).click();
    await expect(mainWin.getByPlaceholder('Confirm new password')).not.toBeVisible({ timeout: 15_000 });
    await longPause();

    await app.close().catch(() => {});

    // Relaunch — new password should be accepted; old one is gone.
    const { app: app2, mainWin: mainWin2, longPause: longPause2 } = await unlockApp(CHANGED_PASSWORD);
    await expect(mainWin2.getByRole('button', { name: /sessions/i })).toBeVisible({ timeout: 5_000 });
    await longPause2();
    await app2.close().catch(() => {});
  });

  test('removing the password eliminates the unlock dialog; messages stay readable', async () => {
    if (!setupDone) { test.skip(true, 'Anthropic API key not configured'); return; }

    const { app, mainWin, pause, longPause } = await unlockApp(CHANGED_PASSWORD);

    await goToEncryptionTab(mainWin);
    await pause();
    await mainWin.getByRole('button', { name: /^remove password$/i }).click();
    await mainWin.getByPlaceholder('Current password').fill(CHANGED_PASSWORD);
    await mainWin.getByRole('button', { name: /^remove$/i }).click();
    await expect(mainWin.getByText('Encrypted (no password)')).toBeVisible({ timeout: 15_000 });
    await longPause();

    await app.close().catch(() => {});

    // Relaunch — should go directly to the main window without an unlock dialog.
    const app2 = await launchLiveKeyApp();
    const mainWin2 = await app2.firstWindow();
    await mainWin2.waitForLoadState('domcontentloaded');
    await skipOnboarding(mainWin2);
    const { pause: pause2, longPause: longPause2 } = makePause(mainWin2);
    await pause2();

    await expect(mainWin2.getByPlaceholder('Password')).not.toBeVisible();
    await expect(mainWin2.getByRole('button', { name: /sessions/i })).toBeVisible({ timeout: 5_000 });

    // Messages are still readable after key is re-wrapped to wrapping:none.
    await mainWin2.getByRole('button', { name: /sessions/i }).click();
    await pause2();
    const nav = mainWin2.getByRole('navigation');
    await nav.getByText(SESSION_NAME).click();
    await longPause2();

    await expect(mainWin2.getByText(CONDUCTOR_MSG)).toBeVisible({ timeout: 5_000 });
    await expect(
      mainWin2.locator(`[role="article"][aria-label*="${VOICE_NAME}"]`).filter({ hasText: /\S/ }),
    ).toBeVisible({ timeout: 5_000 });

    await app2.close().catch(() => {});
  });
});
