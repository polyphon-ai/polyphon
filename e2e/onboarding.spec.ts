/**
 * e2e tests for the first-run onboarding modal.
 *
 * The modal appears on first launch when the conductor has not yet set a name.
 * Tests cover: skip, save with name only, save with all fields, keyboard submit,
 * and validation that "Get started" is disabled until a name is entered.
 */
import { test, expect } from '@playwright/test';
import { launchMockApp } from './helpers';

test.describe('Onboarding modal', () => {
  test('appears on first launch and is dismissed by Skip', async () => {
    const app = await launchMockApp();
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await expect(window.getByText('Welcome to Polyphon')).toBeVisible({ timeout: 8_000 });
    await expect(window.getByRole('button', { name: /skip for now/i })).toBeVisible();

    await window.getByRole('button', { name: /skip for now/i }).click();

    await expect(window.getByText('Welcome to Polyphon')).not.toBeVisible();

    await app.close();
  });

  test('"Get started" is disabled until a name is entered', async () => {
    const app = await launchMockApp();
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await expect(window.getByText('Welcome to Polyphon')).toBeVisible({ timeout: 8_000 });

    const getStarted = window.getByRole('button', { name: /get started/i });
    await expect(getStarted).toBeDisabled();

    await window.getByPlaceholder('e.g. Corey').fill('Jordan');
    await expect(getStarted).toBeEnabled();

    await window.getByRole('button', { name: /skip for now/i }).click();
    await app.close();
  });

  test('saving with a name dismisses the modal', async () => {
    const app = await launchMockApp();
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await expect(window.getByText('Welcome to Polyphon')).toBeVisible({ timeout: 8_000 });

    await window.getByPlaceholder('e.g. Corey').fill('Jordan');
    await window.getByRole('button', { name: /get started/i }).click();

    await expect(window.getByText('Welcome to Polyphon')).not.toBeVisible();

    await app.close();
  });

  test('saving with name and pronouns set dismisses the modal', async () => {
    const app = await launchMockApp();
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await expect(window.getByText('Welcome to Polyphon')).toBeVisible({ timeout: 8_000 });

    await window.getByPlaceholder('e.g. Corey').fill('Corey');
    await window.locator('select').selectOption('they/them');
    await window.getByRole('button', { name: /get started/i }).click();

    await expect(window.getByText('Welcome to Polyphon')).not.toBeVisible();

    await app.close();
  });

  test('saving with all fields filled dismisses the modal', async () => {
    const app = await launchMockApp();
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await expect(window.getByText('Welcome to Polyphon')).toBeVisible({ timeout: 8_000 });

    await window.getByPlaceholder('e.g. Corey').fill('Sam');
    await window.locator('select').selectOption('she/her');
    await window
      .getByPlaceholder(/Senior backend engineer/)
      .fill('Full-stack developer working on open source tools.');
    await window.getByRole('button', { name: /get started/i }).click();

    await expect(window.getByText('Welcome to Polyphon')).not.toBeVisible();

    await app.close();
  });

  test('pressing Enter submits the form when name is filled', async () => {
    const app = await launchMockApp();
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await expect(window.getByText('Welcome to Polyphon')).toBeVisible({ timeout: 8_000 });

    await window.getByPlaceholder('e.g. Corey').fill('Morgan');
    await window.getByPlaceholder('e.g. Corey').press('Enter');

    await expect(window.getByText('Welcome to Polyphon')).not.toBeVisible();

    await app.close();
  });

  test('does not reappear after being skipped', async () => {
    const app = await launchMockApp();
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await expect(window.getByText('Welcome to Polyphon')).toBeVisible({ timeout: 8_000 });
    await window.getByRole('button', { name: /skip for now/i }).click();
    await expect(window.getByText('Welcome to Polyphon')).not.toBeVisible();

    // Navigate away and back to home — modal must not reappear
    await window.getByRole('button', { name: /settings/i }).click();
    await window.getByRole('button', { name: /sessions/i }).click();

    await expect(window.getByText('Welcome to Polyphon')).not.toBeVisible();

    await app.close();
  });
});
