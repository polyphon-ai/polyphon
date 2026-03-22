import { test, expect } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { launchMockApp, skipOnboarding, enableProviders, makeTempDir } from './helpers';

let app: ElectronApplication;
let window: Page;
let tempDir: string;

test.beforeAll(async () => {
  app = await launchMockApp();
  window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  await skipOnboarding(window);
  await enableProviders(window);

  // Create a composition with API voices so the sandbox checkbox is relevant
  await window.getByRole('button', { name: /compositions/i }).click();
  await window.getByRole('button', { name: 'New Composition', exact: true }).first().click();
  await window.getByPlaceholder('My Composition').fill('Sandbox Test Comp');
  await window.getByRole('button', { name: 'Anthropic' }).first().click();
  await window.getByRole('button', { name: 'Add Voice' }).click();
  await window.getByRole('button', { name: 'Save Composition' }).click();
  await window.getByRole('button', { name: /compositions/i }).click();
  await expect(window.locator('#main-content').getByText('Sandbox Test Comp')).toBeVisible({ timeout: 5000 });

  // Real directory that passes validation
  tempDir = makeTempDir();
});

test.afterAll(async () => {
  await app.close();
});

async function openNewSessionPanel(): Promise<void> {
  await window.getByRole('button', { name: 'Sessions', exact: true }).click();
  await window.getByRole('button', { name: 'New Session', exact: true }).click();
  await window.getByRole('button', { name: /sandbox test comp/i }).first().click();
}

test.describe('Sandbox checkbox visibility', () => {
  test('sandbox checkbox is not shown when no working directory is entered', async () => {
    await openNewSessionPanel();
    await expect(window.getByText(/sandbox api voices/i)).not.toBeVisible();
    await window.getByRole('button', { name: 'Cancel' }).click();
  });

  test('sandbox checkbox appears after a valid working directory is typed', async () => {
    await openNewSessionPanel();
    await window.getByPlaceholder('/path/to/project').fill(tempDir);
    // Wait for the debounced validation to resolve
    await expect(window.getByText(/sandbox api voices/i)).toBeVisible({ timeout: 5000 });
    await window.getByRole('button', { name: 'Cancel' }).click();
  });

  test('sandbox checkbox disappears when the working directory is cleared', async () => {
    await openNewSessionPanel();
    await window.getByPlaceholder('/path/to/project').fill(tempDir);
    await expect(window.getByText(/sandbox api voices/i)).toBeVisible({ timeout: 5000 });
    await window.getByPlaceholder('/path/to/project').fill('');
    await expect(window.getByText(/sandbox api voices/i)).not.toBeVisible({ timeout: 3000 });
    await window.getByRole('button', { name: 'Cancel' }).click();
  });

  test('sandbox checkbox is unchecked by default', async () => {
    await openNewSessionPanel();
    await window.getByPlaceholder('/path/to/project').fill(tempDir);
    await expect(window.getByText(/sandbox api voices/i)).toBeVisible({ timeout: 5000 });
    const checkbox = window.locator('label').filter({ hasText: /sandbox api voices/i }).locator('input[type="checkbox"]');
    await expect(checkbox).not.toBeChecked();
    await window.getByRole('button', { name: 'Cancel' }).click();
  });

  test('sandbox checkbox can be checked and unchecked', async () => {
    await openNewSessionPanel();
    await window.getByPlaceholder('/path/to/project').fill(tempDir);
    await expect(window.getByText(/sandbox api voices/i)).toBeVisible({ timeout: 5000 });
    const label = window.locator('label').filter({ hasText: /sandbox api voices/i });
    const checkbox = label.locator('input[type="checkbox"]');
    await expect(checkbox).not.toBeChecked();
    await label.click();
    await expect(checkbox).toBeChecked();
    await label.click();
    await expect(checkbox).not.toBeChecked();
    await window.getByRole('button', { name: 'Cancel' }).click();
  });
});

test.describe('Session creation with sandbox', () => {
  test('creates a session with a working directory and sandbox enabled', async () => {
    await openNewSessionPanel();
    await window.getByPlaceholder('My session').fill('Sandboxed Session');
    await window.getByPlaceholder('/path/to/project').fill(tempDir);
    await expect(window.getByText(/sandbox api voices/i)).toBeVisible({ timeout: 5000 });
    const label = window.locator('label').filter({ hasText: /sandbox api voices/i });
    await label.click();
    await expect(label.locator('input[type="checkbox"]')).toBeChecked();
    await window.getByRole('button', { name: 'Start Session' }).click();
    await expect(window.getByPlaceholder('Message the ensemble\u2026')).toBeVisible({ timeout: 10_000 });
    await window.getByRole('button', { name: 'Sessions', exact: true }).click();
    await expect(window.getByText('Sandboxed Session').first()).toBeVisible();
  });

  test('creates a session with a working directory but sandbox disabled', async () => {
    await openNewSessionPanel();
    await window.getByPlaceholder('My session').fill('Unsandboxed Session');
    await window.getByPlaceholder('/path/to/project').fill(tempDir);
    await expect(window.getByText(/sandbox api voices/i)).toBeVisible({ timeout: 5000 });
    // Leave checkbox unchecked (default)
    await window.getByRole('button', { name: 'Start Session' }).click();
    await expect(window.getByPlaceholder('Message the ensemble\u2026')).toBeVisible({ timeout: 10_000 });
    await window.getByRole('button', { name: 'Sessions', exact: true }).click();
    await expect(window.getByText('Unsandboxed Session').first()).toBeVisible();
  });
});
