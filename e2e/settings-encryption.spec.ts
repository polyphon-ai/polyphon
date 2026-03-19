import { test, expect } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { launchApp, launchMockApp, skipOnboarding, goToEncryptionTab } from './helpers';

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

  test('set password form opens when "Set password" button is clicked', async () => {
    await window.getByRole('button', { name: /^set password$/i }).click();
    await expect(window.getByText('Set a password')).toBeVisible();
    await expect(window.getByPlaceholder('New password', { exact: true })).toBeVisible();
    await expect(window.getByPlaceholder('Confirm password')).toBeVisible();
  });

  test('cancel returns to idle state with "Set password" button visible', async () => {
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

  test('sets a password successfully — form closes and status becomes "Password-protected"', async () => {
    await window.getByRole('button', { name: /^set password$/i }).click();
    await window.getByPlaceholder('New password', { exact: true }).fill('InitialPass1!');
    await window.getByPlaceholder('Confirm password').fill('InitialPass1!');
    await window.getByRole('button', { name: /^save$/i }).click();
    // Form closing indicates the operation succeeded (errors keep the form open)
    await expect(window.getByText('Set a password')).not.toBeVisible({ timeout: 15_000 });
    // Re-navigate to get a fresh loadStatus() and confirm the persisted state
    await window.getByRole('button', { name: /sessions/i }).click();
    await goToEncryptionTab(window);
    await expect(window.getByText('Password-protected')).toBeVisible();
  });

  test('irrecoverability warning is visible when a password is set', async () => {
    await expect(
      window.getByText(/If you forget your password, your encrypted data is unrecoverable/i),
    ).toBeVisible();
  });

  test('"Change password" and "Remove password" buttons appear after password is set', async () => {
    await expect(window.getByRole('button', { name: /^change password$/i })).toBeVisible();
    await expect(window.getByRole('button', { name: /^remove password$/i })).toBeVisible();
    await expect(window.getByRole('button', { name: /^set password$/i })).not.toBeVisible();
  });

  test('change password form shows mismatch error when new passwords differ', async () => {
    await window.getByRole('button', { name: /^change password$/i }).click();
    await window.getByPlaceholder('Current password').fill('InitialPass1!');
    await window.getByPlaceholder('New password', { exact: true }).fill('NewPass1!');
    await window.getByPlaceholder('Confirm new password').fill('DifferentNew1!');
    await window.getByRole('button', { name: /^save$/i }).click();
    await expect(window.getByText('New passwords do not match.')).toBeVisible();
    await window.getByRole('button', { name: /^cancel$/i }).click();
  });

  test('changes the password — form closes and status remains "Password-protected"', async () => {
    await window.getByRole('button', { name: /^change password$/i }).click();
    await window.getByPlaceholder('Current password').fill('InitialPass1!');
    await window.getByPlaceholder('New password', { exact: true }).fill('ChangedPass2@');
    await window.getByPlaceholder('Confirm new password').fill('ChangedPass2@');
    await window.getByRole('button', { name: /^save$/i }).click();
    // "Confirm new password" field disappearing means the form closed
    await expect(window.getByPlaceholder('Confirm new password')).not.toBeVisible({ timeout: 15_000 });
    await window.getByRole('button', { name: /sessions/i }).click();
    await goToEncryptionTab(window);
    await expect(window.getByText('Password-protected')).toBeVisible();
  });

  test('remove password form shows error when current password field is empty', async () => {
    await window.getByRole('button', { name: /^remove password$/i }).click();
    await window.getByRole('button', { name: /^remove$/i }).click();
    await expect(window.getByText('Current password is required to confirm removal.')).toBeVisible();
    await window.getByRole('button', { name: /^cancel$/i }).click();
  });

  test('removes the password — form closes and status returns to "Encrypted (no password)"', async () => {
    await window.getByRole('button', { name: /^remove password$/i }).click();
    // Fill the "Current password" field in the remove-password form
    const currentPwField = window.getByPlaceholder('Current password');
    await currentPwField.fill('ChangedPass2@');
    await window.getByRole('button', { name: /^remove$/i }).click();
    // "Current password" field disappearing means the remove form closed
    await expect(currentPwField).not.toBeVisible({ timeout: 15_000 });
    await window.getByRole('button', { name: /sessions/i }).click();
    await goToEncryptionTab(window);
    await expect(window.getByText('Encrypted (no password)')).toBeVisible();
  });

  test('irrecoverability warning is gone and "Set password" button returns after removal', async () => {
    await expect(window.getByText(/If you forget your password/i)).not.toBeVisible();
    await expect(window.getByRole('button', { name: /^set password$/i })).toBeVisible();
    await expect(window.getByRole('button', { name: /^change password$/i })).not.toBeVisible();
    await expect(window.getByRole('button', { name: /^remove password$/i })).not.toBeVisible();
  });
});
