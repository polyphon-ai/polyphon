import { test, expect } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { launchMockApp, skipOnboarding, goToConductorTab } from './helpers';

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

test.describe('Conductor Profile', () => {
  test('conductor profile fields are visible on the Conductor tab', async () => {
    await goToConductorTab(window);
    await expect(window.getByPlaceholder('e.g. Corey')).toBeVisible();
    await expect(window.locator('select#conductor-pronouns')).toBeVisible();
    await expect(window.getByRole('button', { name: /^save$/i })).toBeVisible();
  });

  test('saves conductor name and persists after re-navigation', async () => {
    await goToConductorTab(window);
    await window.getByPlaceholder('e.g. Corey').fill('Jordan');
    await window.getByRole('button', { name: /^save$/i }).click();
    await expect(window.getByText('Saved')).toBeVisible({ timeout: 3000 });

    // Navigate away and back
    await window.getByRole('button', { name: /sessions/i }).click();
    await goToConductorTab(window);
    await expect(window.getByPlaceholder('e.g. Corey')).toHaveValue('Jordan');
  });

  test('saves pronouns selection and persists after re-navigation', async () => {
    await goToConductorTab(window);
    await window.locator('select#conductor-pronouns').selectOption('they/them');
    await window.getByRole('button', { name: /^save$/i }).click();
    await expect(window.getByText('Saved')).toBeVisible({ timeout: 3000 });

    await window.getByRole('button', { name: /sessions/i }).click();
    await goToConductorTab(window);
    await expect(window.locator('select#conductor-pronouns')).toHaveValue('they/them');
  });

  test('saves "About me" context and persists after re-navigation', async () => {
    await goToConductorTab(window);
    const ctx = window.getByPlaceholder(/Senior backend engineer/i);
    await ctx.fill('Full-stack developer working on open source AI tools.');
    await window.getByRole('button', { name: /^save$/i }).click();
    await expect(window.getByText('Saved')).toBeVisible({ timeout: 3000 });

    await window.getByRole('button', { name: /sessions/i }).click();
    await goToConductorTab(window);
    await expect(
      window.getByPlaceholder(/Senior backend engineer/i),
    ).toHaveValue('Full-stack developer working on open source AI tools.');
  });

  test('color picker swatches are visible in the Conductor Profile tab', async () => {
    await goToConductorTab(window);
    // The "no color" option and all 6 preset swatches should be present
    await expect(window.getByRole('button', { name: /No color/i })).toBeVisible();
    await expect(window.getByRole('button', { name: /Voice color: indigo/i })).toBeVisible();
    await expect(window.getByRole('button', { name: /Voice color: pink/i })).toBeVisible();
    await expect(window.getByRole('button', { name: /Voice color: green/i })).toBeVisible();
    await expect(window.getByRole('button', { name: /Voice color: amber/i })).toBeVisible();
    await expect(window.getByRole('button', { name: /Voice color: blue/i })).toBeVisible();
    await expect(window.getByRole('button', { name: /Voice color: red/i })).toBeVisible();
  });

  test('selecting a conductor color and saving persists after re-navigation', async () => {
    await goToConductorTab(window);
    await window.getByRole('button', { name: /Voice color: green/i }).click();
    await window.getByRole('button', { name: /^save$/i }).click();
    await expect(window.getByText('Saved')).toBeVisible({ timeout: 3000 });

    await window.getByRole('button', { name: /sessions/i }).click();
    await goToConductorTab(window);
    // The selected swatch should show aria-pressed=true after reload
    await expect(
      window.getByRole('button', { name: /Voice color: green/i }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  test('selecting no color clears the conductor color', async () => {
    await goToConductorTab(window);
    // First pick a color
    await window.getByRole('button', { name: /Voice color: amber/i }).click();
    await window.getByRole('button', { name: /^save$/i }).click();
    await expect(window.getByText('Saved')).toBeVisible({ timeout: 3000 });

    // Then clear it
    await window.getByRole('button', { name: /No color/i }).click();
    await window.getByRole('button', { name: /^save$/i }).click();
    await expect(window.getByText('Saved')).toBeVisible({ timeout: 3000 });

    await window.getByRole('button', { name: /sessions/i }).click();
    await goToConductorTab(window);
    await expect(
      window.getByRole('button', { name: /No color/i }),
    ).toHaveAttribute('aria-pressed', 'true');
  });
});
