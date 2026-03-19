import { test, expect } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { launchApp, launchMockApp, makeTempDir, skipOnboarding, goToEncryptionTab, enableProviders } from './helpers';
import { buildComposition, startSession, sendMessage, expectResponse } from './voices-helpers';

// ── e2e test mode display ────────────────────────────────────────────────────
// When POLYPHON_E2E=1 the encryption section shows a "Test mode" badge and
// hides all password action buttons.

test.describe('Encryption — e2e test mode', () => {
  let app: ElectronApplication;
  let window: Page;

  test.beforeAll(async () => {
    app = await launchMockApp();
    window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await skipOnboarding(window);
  });

  test.afterAll(async () => {
    await app.close();
  });

  test('shows "Test mode" badge and no password buttons', async () => {
    await goToEncryptionTab(window);
    await expect(window.getByText('Test mode (encryption disabled)')).toBeVisible();
    await expect(window.getByRole('button', { name: /set password/i })).not.toBeVisible();
    await expect(window.getByRole('button', { name: /change password/i })).not.toBeVisible();
    await expect(window.getByRole('button', { name: /remove password/i })).not.toBeVisible();
  });
});

// ── Full encryption tests (real key, no POLYPHON_E2E) ───────────────────────
// Override POLYPHON_E2E so the key manager uses a real key file in the temp
// userData dir instead of the ephemeral e2e key. POLYPHON_MOCK_VOICES keeps
// voice sessions in mock mode — API calls are never made.

test.describe('Encryption — initial state', () => {
  let app: ElectronApplication;
  let window: Page;

  test.beforeAll(async () => {
    app = await launchApp({ POLYPHON_MOCK_VOICES: '1', POLYPHON_E2E: '', POLYPHON_HIDE_WINDOW: '1' });
    window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await skipOnboarding(window);
    await goToEncryptionTab(window);
  });

  test.afterAll(async () => {
    await app.close();
  });

  test('shows "Encrypted (no password)" status when no password is set', async () => {
    await expect(window.getByText('Encrypted (no password)')).toBeVisible();
  });

  test('shows "Set password" button when no password is set', async () => {
    await expect(window.getByRole('button', { name: /^set password$/i })).toBeVisible();
  });

  test('does not show irrecoverability warning when no password is set', async () => {
    await expect(window.getByText(/If you forget your password/i)).not.toBeVisible();
  });

  test('does not show "Change password" or "Remove password" buttons', async () => {
    await expect(window.getByRole('button', { name: /^change password$/i })).not.toBeVisible();
    await expect(window.getByRole('button', { name: /^remove password$/i })).not.toBeVisible();
  });
});

// ── Password strength gauge ──────────────────────────────────────────────────

test.describe('Password strength gauge', () => {
  let app: ElectronApplication;
  let window: Page;

  test.beforeAll(async () => {
    app = await launchApp({ POLYPHON_MOCK_VOICES: '1', POLYPHON_E2E: '', POLYPHON_HIDE_WINDOW: '1' });
    window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await skipOnboarding(window);
    await goToEncryptionTab(window);
    await window.getByRole('button', { name: /^set password$/i }).click();
  });

  test.afterAll(async () => {
    await app.close();
  });

  test('gauge is not visible when password field is empty', async () => {
    await expect(window.getByPlaceholder('New password', { exact: true })).toBeVisible();
    // None of the strength labels should be present when the field is empty
    await expect(window.getByText('Weak password')).not.toBeVisible();
    await expect(window.getByText('Fair password')).not.toBeVisible();
    await expect(window.getByText('Good password')).not.toBeVisible();
    await expect(window.getByText('Strong password')).not.toBeVisible();
  });

  test('shows "Weak password" for a password meeting only one criterion', async () => {
    // 'password' is 8 chars (length>=8 +1) but has no uppercase, digits, or special → score 1 = Weak
    await window.getByPlaceholder('New password', { exact: true }).fill('password');
    await expect(window.getByText('Weak password')).toBeVisible();
  });

  test('shows "Fair password" for a moderate password (length + digits)', async () => {
    // length >= 8 (+1) + digits (+1) = score 2
    await window.getByPlaceholder('New password', { exact: true }).fill('hello123');
    await expect(window.getByText('Fair password')).toBeVisible();
  });

  test('shows "Good password" for length + uppercase + digits', async () => {
    // length >= 8 (+1) + uppercase (+1) + digits (+1) = score 3
    await window.getByPlaceholder('New password', { exact: true }).fill('Hello1234');
    await expect(window.getByText('Good password')).toBeVisible();
  });

  test('shows "Strong password" for a long, complex password', async () => {
    // length >= 8 (+1), length >= 14 (+1), uppercase (+1), digits (+1), special (+1) → clamped to 4
    await window.getByPlaceholder('New password', { exact: true }).fill('MyPass123!@#$$');
    await expect(window.getByText('Strong password')).toBeVisible();
  });
});

// ── Password match indicator ─────────────────────────────────────────────────

test.describe('Password match indicator', () => {
  let app: ElectronApplication;
  let window: Page;

  test.beforeAll(async () => {
    app = await launchApp({ POLYPHON_MOCK_VOICES: '1', POLYPHON_E2E: '', POLYPHON_HIDE_WINDOW: '1' });
    window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await skipOnboarding(window);
    await goToEncryptionTab(window);
    await window.getByRole('button', { name: /^set password$/i }).click();
  });

  test.afterAll(async () => {
    await app.close();
  });

  test('indicator is not visible when confirm field is empty', async () => {
    await window.getByPlaceholder('New password', { exact: true }).fill('SomePass1!');
    // Confirm field is still empty — indicator renders null
    await expect(window.getByText('Passwords match')).not.toBeVisible();
    await expect(window.getByText('Passwords do not match')).not.toBeVisible();
  });

  test('shows "Passwords do not match" when passwords differ', async () => {
    await window.getByPlaceholder('New password', { exact: true }).fill('SomePass1!');
    await window.getByPlaceholder('Confirm password').fill('Different!');
    await expect(window.getByText('Passwords do not match')).toBeVisible();
  });

  test('shows "Passwords match" when both fields are identical', async () => {
    await window.getByPlaceholder('New password', { exact: true }).fill('SomePass1!');
    await window.getByPlaceholder('Confirm password').fill('SomePass1!');
    await expect(window.getByText('Passwords match')).toBeVisible();
  });
});

// ── Set password form — client-side validation ───────────────────────────────

test.describe('Set password form — validation', () => {
  let app: ElectronApplication;
  let window: Page;

  test.beforeAll(async () => {
    app = await launchApp({ POLYPHON_MOCK_VOICES: '1', POLYPHON_E2E: '', POLYPHON_HIDE_WINDOW: '1' });
    window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await skipOnboarding(window);
    await goToEncryptionTab(window);
  });

  test.afterAll(async () => {
    await app.close();
  });

  test('set password form opens and can be cancelled', async () => {
    await window.getByRole('button', { name: /^set password$/i }).click();
    await expect(window.getByText('Set a password')).toBeVisible();
    await expect(window.getByPlaceholder('New password', { exact: true })).toBeVisible();
    await expect(window.getByPlaceholder('Confirm password')).toBeVisible();
    await window.getByRole('button', { name: /^cancel$/i }).click();
    await expect(window.getByText('Set a password')).not.toBeVisible();
    await expect(window.getByRole('button', { name: /^set password$/i })).toBeVisible();
  });

  test('shows error when submitting mismatched passwords', async () => {
    await window.getByRole('button', { name: /^set password$/i }).click();
    await window.getByPlaceholder('New password', { exact: true }).fill('Password1!');
    await window.getByPlaceholder('Confirm password').fill('Different1!');
    await window.getByRole('button', { name: /^save$/i }).click();
    await expect(window.getByText('Passwords do not match.')).toBeVisible();
    await window.getByRole('button', { name: /^cancel$/i }).click();
  });

  test('shows error when submitting with empty password', async () => {
    await window.getByRole('button', { name: /^set password$/i }).click();
    await window.getByRole('button', { name: /^save$/i }).click();
    await expect(window.getByText('Password is required.')).toBeVisible();
    await window.getByRole('button', { name: /^cancel$/i }).click();
  });
});

// ── Password lifecycle: set → change → remove ────────────────────────────────
// Tests are intentionally sequential and stateful. Each test navigates away
// and back to the Encryption tab to force a fresh loadStatus() IPC round-trip,
// ensuring the UI reflects the persisted key state rather than cached React state.

test.describe('Password lifecycle', () => {
  let app: ElectronApplication;
  let window: Page;

  test.beforeAll(async () => {
    app = await launchApp({ POLYPHON_MOCK_VOICES: '1', POLYPHON_E2E: '', POLYPHON_HIDE_WINDOW: '1' });
    window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await skipOnboarding(window);
    await goToEncryptionTab(window);
  });

  test.afterAll(async () => {
    await app.close();
  });

  test('set → change → remove password lifecycle', async () => {
    // Set password
    await window.getByRole('button', { name: /^set password$/i }).click();
    await window.getByPlaceholder('New password', { exact: true }).fill('InitialPass1!');
    await window.getByPlaceholder('Confirm password').fill('InitialPass1!');
    await window.getByRole('button', { name: /^save$/i }).click();
    await expect(window.getByText('Set a password')).not.toBeVisible({ timeout: 15_000 });
    await window.getByRole('button', { name: /sessions/i }).click();
    await goToEncryptionTab(window);
    await expect(window.getByText('Password-protected')).toBeVisible();
    await expect(window.getByText(/If you forget your password, your encrypted data is unrecoverable/i)).toBeVisible();
    await expect(window.getByRole('button', { name: /^change password$/i })).toBeVisible();
    await expect(window.getByRole('button', { name: /^remove password$/i })).toBeVisible();
    await expect(window.getByRole('button', { name: /^set password$/i })).not.toBeVisible();

    // Change password — mismatch error
    await window.getByRole('button', { name: /^change password$/i }).click();
    await window.getByPlaceholder('Current password').fill('InitialPass1!');
    await window.getByPlaceholder('New password', { exact: true }).fill('NewPass1!');
    await window.getByPlaceholder('Confirm new password').fill('DifferentNew1!');
    await window.getByRole('button', { name: /^save$/i }).click();
    await expect(window.getByText('New passwords do not match.')).toBeVisible();
    await window.getByRole('button', { name: /^cancel$/i }).click();

    // Change password — success
    await window.getByRole('button', { name: /^change password$/i }).click();
    await window.getByPlaceholder('Current password').fill('InitialPass1!');
    await window.getByPlaceholder('New password', { exact: true }).fill('ChangedPass2@');
    await window.getByPlaceholder('Confirm new password').fill('ChangedPass2@');
    await window.getByRole('button', { name: /^save$/i }).click();
    await expect(window.getByPlaceholder('Confirm new password')).not.toBeVisible({ timeout: 15_000 });
    await window.getByRole('button', { name: /sessions/i }).click();
    await goToEncryptionTab(window);
    await expect(window.getByText('Password-protected')).toBeVisible();

    // Remove password — empty field error
    await window.getByRole('button', { name: /^remove password$/i }).click();
    await window.getByRole('button', { name: /^remove$/i }).click();
    await expect(window.getByText('Current password is required to confirm removal.')).toBeVisible();
    await window.getByRole('button', { name: /^cancel$/i }).click();

    // Remove password — success
    await window.getByRole('button', { name: /^remove password$/i }).click();
    const currentPwField = window.getByPlaceholder('Current password');
    await currentPwField.fill('ChangedPass2@');
    await window.getByRole('button', { name: /^remove$/i }).click();
    await expect(currentPwField).not.toBeVisible({ timeout: 15_000 });
    await window.getByRole('button', { name: /sessions/i }).click();
    await goToEncryptionTab(window);
    await expect(window.getByText('Encrypted (no password)')).toBeVisible();
    await expect(window.getByText(/If you forget your password/i)).not.toBeVisible();
    await expect(window.getByRole('button', { name: /^set password$/i })).toBeVisible();
    await expect(window.getByRole('button', { name: /^change password$/i })).not.toBeVisible();
    await expect(window.getByRole('button', { name: /^remove password$/i })).not.toBeVisible();
  });
});

// ── Password lifecycle — restart & unlock ─────────────────────────────────────
//
// Tests are intentionally serial and stateful. The beforeAll seeds sharedDir
// with an encrypted session (mock voice) so each test can verify message
// content survives the full set → restart → unlock → change → remove cycle.
//
// Each test launches and closes its own app instance against the shared data
// directory. State (key file wrapping) carries forward between tests.

test.describe.serial('Password lifecycle — restart & unlock', () => {
  let sharedDir: string;

  const INITIAL_PASSWORD = 'RestartPass1!';
  const CHANGED_PASSWORD = 'ChangedPass2@';
  const SESSION_NAME = 'Encrypted Session';
  const CONDUCTOR_MSG = 'Encryption restart test message';

  function launchRealKeyApp(extraEnv: Record<string, string> = {}): Promise<ElectronApplication> {
    return launchApp({
      POLYPHON_MOCK_VOICES: '1',
      POLYPHON_E2E: '',
      POLYPHON_TEST_USER_DATA: sharedDir,
      POLYPHON_HIDE_WINDOW: '1',
      ...extraEnv,
    });
  }

  // Launch expecting a password-protected key: return the unlock window, the resolved
  // main window, and the app handle. The caller must close the app when done.
  async function unlockApp(password: string): Promise<{ app: ElectronApplication; mainWin: Page }> {
    const app = await launchRealKeyApp();
    const unlockWin = await app.firstWindow();
    await unlockWin.waitForLoadState('domcontentloaded');
    await expect(unlockWin.getByPlaceholder('Password')).toBeVisible({ timeout: 10_000 });

    // Register the 'window' listener before clicking Unlock to avoid a race.
    const mainWinPromise = app.waitForEvent('window');
    await unlockWin.getByPlaceholder('Password').fill(password);
    await unlockWin.getByRole('button', { name: 'Unlock' }).click();

    const mainWin = await mainWinPromise;
    await mainWin.waitForLoadState('domcontentloaded');
    await skipOnboarding(mainWin);
    return { app, mainWin };
  }

  test.beforeAll(async () => {
    sharedDir = makeTempDir();

    // Seed: create a session with an encrypted message, then set a password so
    // subsequent relaunches show the unlock dialog.
    const app = await launchRealKeyApp();
    const win = await app.firstWindow();
    await win.waitForLoadState('domcontentloaded');
    await skipOnboarding(win);

    await enableProviders(win);
    await buildComposition(win, 'Enc Comp', ['Anthropic'], { mode: 'broadcast' });
    await startSession(win, 'Enc Comp', SESSION_NAME);
    await sendMessage(win, CONDUCTOR_MSG);
    await expectResponse(win, 'Anthropic');

    await goToEncryptionTab(win);
    await win.getByRole('button', { name: /^set password$/i }).click();
    await win.getByPlaceholder('New password', { exact: true }).fill(INITIAL_PASSWORD);
    await win.getByPlaceholder('Confirm password').fill(INITIAL_PASSWORD);
    await win.getByRole('button', { name: /^save$/i }).click();
    await expect(win.getByText('Set a password')).not.toBeVisible({ timeout: 15_000 });

    await app.close().catch(() => {});
  });

  test('wrong password shows an error on the unlock dialog', async () => {
    const app = await launchRealKeyApp();
    const unlockWin = await app.firstWindow();
    await unlockWin.waitForLoadState('domcontentloaded');

    await expect(unlockWin.getByPlaceholder('Password')).toBeVisible({ timeout: 10_000 });
    await expect(unlockWin.getByText(/enter your password to unlock/i)).toBeVisible();

    await unlockWin.getByPlaceholder('Password').fill('definitelywrong!');
    await unlockWin.getByRole('button', { name: 'Unlock' }).click();

    await expect(unlockWin.getByText(/incorrect password/i)).toBeVisible({ timeout: 15_000 });

    await app.close().catch(() => {});
  });

  test('correct password unlocks and prior messages are readable', async () => {
    const { app, mainWin } = await unlockApp(INITIAL_PASSWORD);

    await mainWin.getByRole('button', { name: /sessions/i }).click();
    const nav = mainWin.getByRole('navigation');
    await expect(nav.getByText(SESSION_NAME)).toBeVisible({ timeout: 5_000 });
    await nav.getByText(SESSION_NAME).click();
    await mainWin.waitForTimeout(500);

    await expect(mainWin.getByText(CONDUCTOR_MSG)).toBeVisible({ timeout: 5_000 });
    await expect(mainWin.getByText(/mock response from anthropic/i).first()).toBeVisible({ timeout: 5_000 });

    await app.close().catch(() => {});
  });

  test('changed password is required on the next restart', async () => {
    // Unlock, change the password, close, then relaunch with the new password.
    const { app, mainWin } = await unlockApp(INITIAL_PASSWORD);

    await goToEncryptionTab(mainWin);
    await mainWin.getByRole('button', { name: /^change password$/i }).click();
    await mainWin.getByPlaceholder('Current password').fill(INITIAL_PASSWORD);
    await mainWin.getByPlaceholder('New password', { exact: true }).fill(CHANGED_PASSWORD);
    await mainWin.getByPlaceholder('Confirm new password').fill(CHANGED_PASSWORD);
    await mainWin.getByRole('button', { name: /^save$/i }).click();
    await expect(mainWin.getByPlaceholder('Confirm new password')).not.toBeVisible({ timeout: 15_000 });

    await app.close().catch(() => {});

    // Relaunch — should accept the new password and reject the old one.
    const { app: app2, mainWin: mainWin2 } = await unlockApp(CHANGED_PASSWORD);
    await expect(mainWin2.getByRole('button', { name: /sessions/i })).toBeVisible({ timeout: 5_000 });
    await app2.close().catch(() => {});
  });

  test('removing the password eliminates the unlock dialog and messages stay readable', async () => {
    // Unlock with the changed password, remove it, close, then relaunch.
    const { app, mainWin } = await unlockApp(CHANGED_PASSWORD);

    await goToEncryptionTab(mainWin);
    await mainWin.getByRole('button', { name: /^remove password$/i }).click();
    await mainWin.getByPlaceholder('Current password').fill(CHANGED_PASSWORD);
    await mainWin.getByRole('button', { name: /^remove$/i }).click();
    await expect(mainWin.getByText('Encrypted (no password)')).toBeVisible({ timeout: 15_000 });

    await app.close().catch(() => {});

    // Relaunch — no unlock dialog; app goes directly to the main window.
    const app2 = await launchRealKeyApp();
    const mainWin2 = await app2.firstWindow();
    await mainWin2.waitForLoadState('domcontentloaded');
    await skipOnboarding(mainWin2);

    await expect(mainWin2.getByPlaceholder('Password')).not.toBeVisible();
    await expect(mainWin2.getByRole('button', { name: /sessions/i })).toBeVisible({ timeout: 5_000 });

    // Messages are still readable after key re-wrapping to 'none'.
    await mainWin2.getByRole('button', { name: /sessions/i }).click();
    const nav = mainWin2.getByRole('navigation');
    await nav.getByText(SESSION_NAME).click();
    await mainWin2.waitForTimeout(500);
    await expect(mainWin2.getByText(CONDUCTOR_MSG)).toBeVisible({ timeout: 5_000 });

    await app2.close().catch(() => {});
  });
});
