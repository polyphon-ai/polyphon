/**
 * E2E tests for the API Server & CLI settings tab.
 *
 * Covers the UI in Settings → API Server & CLI:
 * - Toggle enable/disable
 * - Running badge and host:port display
 * - Token visibility (masked / revealed)
 * - Rotate key two-click confirm flow
 * - Remote access toggle and warning
 */

import { test, expect } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { launchMockApp, skipOnboarding } from './helpers';

let app: ElectronApplication;
let window: Page;

test.beforeAll(async () => {
  app = await launchMockApp();
  window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  await skipOnboarding(window);
});

test.afterAll(async () => {
  await app.close().catch(() => {});
});

async function goToApiTab(): Promise<void> {
  await window.getByRole('button', { name: /settings/i }).click();
  await window.getByRole('tab', { name: /api server & cli/i }).click();
}

/** Enable API server if not already running. */
async function enableApi(): Promise<void> {
  const toggle = window.getByRole('switch').first();
  if ((await toggle.getAttribute('aria-checked')) === 'false') {
    await toggle.click();
    await expect(window.getByText(/running on/i)).toBeVisible({ timeout: 10_000 });
  }
}

/** Disable API server if currently running. */
async function disableApi(): Promise<void> {
  const toggle = window.getByRole('switch').first();
  if ((await toggle.getAttribute('aria-checked')) === 'true') {
    await toggle.click();
    await expect(window.getByText(/running on/i)).not.toBeVisible({ timeout: 10_000 });
  }
}

test.describe.serial('API Server Settings tab', () => {
  test('tab is present and shows heading', async () => {
    await goToApiTab();
    await expect(window.getByRole('heading', { name: 'API Server & CLI' })).toBeVisible();
    await expect(window.getByText(/json-rpc server/i).first()).toBeVisible();
  });

  test('toggle is off by default, no Running badge', async () => {
    await goToApiTab();
    const toggle = window.getByRole('switch').first();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(window.getByText(/running on/i)).not.toBeVisible();
  });

  test('poly CLI info section is always visible', async () => {
    await goToApiTab();
    await expect(window.getByText('poly CLI')).toBeVisible();
    await expect(window.getByText(/npm install -g @polyphon-ai\/poly/i)).toBeVisible();
    await expect(window.getByText('poly status')).toBeVisible();
  });

  test('enabling toggle shows Running badge with host:port', async () => {
    await goToApiTab();
    await enableApi();
    await expect(window.getByText(/running on 127\.0\.0\.1:/i)).toBeVisible();
    await disableApi();
  });

  test('token section appears when enabled and hides when disabled', async () => {
    await goToApiTab();
    await enableApi();
    await expect(window.getByText('API Key')).toBeVisible();
    await expect(window.getByText(/treat it like a password/i)).toBeVisible();
    await disableApi();
    await expect(window.getByText('API Key')).not.toBeVisible();
  });

  test('token is masked by default', async () => {
    await goToApiTab();
    await enableApi();
    // Token display starts masked (shows bullet characters)
    const maskedCode = window.locator('code').filter({ hasText: /•+/ });
    await expect(maskedCode).toBeVisible();
    await disableApi();
  });

  test('eye button reveals and hides the full token', async () => {
    await goToApiTab();
    await enableApi();

    // Verify masked initially
    const maskedCode = window.locator('code').filter({ hasText: /•+/ });
    await expect(maskedCode).toBeVisible();

    // Reveal
    await window.getByTitle('Reveal key').click();
    // Full 64-char hex token should now appear
    const revealedCode = window.locator('code').filter({ hasText: /^[0-9a-f]{64}$/i });
    await expect(revealedCode).toBeVisible();
    await expect(maskedCode).not.toBeVisible();

    // Hide again
    await window.getByTitle('Hide key').click();
    await expect(maskedCode).toBeVisible();
    await expect(revealedCode).not.toBeVisible();

    await disableApi();
  });

  test('copy button is present when enabled', async () => {
    await goToApiTab();
    await enableApi();
    await expect(window.getByTitle('Copy key')).toBeVisible();
    await disableApi();
  });

  test('rotate key: first click shows confirm message', async () => {
    await goToApiTab();
    await enableApi();

    // First click sets rotateConfirm state
    await window.getByRole('button', { name: /rotate key/i }).click();
    await expect(window.getByText(/rotates the key and disconnects/i)).toBeVisible();
    await expect(window.getByRole('button', { name: /confirm rotate/i })).toBeVisible();

    // Navigate away to reset state without actually rotating
    await disableApi();
  });

  test('remote access toggle is visible when API is enabled', async () => {
    await goToApiTab();
    await enableApi();
    await expect(window.getByText('Remote Access')).toBeVisible();
    const remoteToggle = window.getByRole('switch').nth(1);
    await expect(remoteToggle).toHaveAttribute('aria-checked', 'false');
    await disableApi();
  });

  test('enabling remote access changes host and shows warning', async () => {
    await goToApiTab();
    await enableApi();

    const remoteToggle = window.getByRole('switch').nth(1);
    await remoteToggle.click();

    // Running badge now shows 0.0.0.0 instead of 127.0.0.1
    await expect(window.getByText(/running on 0\.0\.0\.0:/i)).toBeVisible({ timeout: 10_000 });
    // Security warning is shown
    await expect(window.getByText(/remote access exposes/i)).toBeVisible();

    // Restore: disable remote access, then disable API
    await remoteToggle.click();
    await expect(window.getByText(/running on 127\.0\.0\.1:/i)).toBeVisible({ timeout: 10_000 });
    await disableApi();
  });
});
