import { test, expect } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { launchMockApp, skipOnboarding, goToTonesTab } from './helpers';

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

test.describe('Tones CRUD', () => {
  test('shows seeded tones on the Tones tab', async () => {
    await goToTonesTab(window);

    await expect(window.getByText('Professional')).toBeVisible();
    await expect(window.getByText('Collaborative')).toBeVisible();
    await expect(window.getByText('Concise')).toBeVisible();
    await expect(window.getByText('Exploratory')).toBeVisible();
    await expect(window.getByText('Teaching')).toBeVisible();
  });

  test('creates a new tone', async () => {
    await goToTonesTab(window);

    await window.getByRole('button', { name: /add tone/i }).click();
    await window.getByPlaceholder(/motivational/i).fill('Motivational');
    await window.getByPlaceholder(/describe the tone/i).fill('Upbeat and encouraging.');
    await window.getByRole('button', { name: /^save$/i }).click();

    // Wait for form to close (Add Tone button reappears) before asserting card content
    await expect(window.getByRole('button', { name: /add tone/i })).toBeVisible({ timeout: 5000 });
    await expect(window.getByText('Motivational')).toBeVisible();
    await expect(window.getByText('Upbeat and encouraging.')).toBeVisible();
  });

  test('edits an existing tone', async () => {
    await goToTonesTab(window);

    // Create a tone to edit so we have a known target
    await window.getByRole('button', { name: /add tone/i }).click();
    await window.getByPlaceholder(/motivational/i).fill('To Be Renamed');
    await window.getByPlaceholder(/describe the tone/i).fill('Original description.');
    await window.getByRole('button', { name: /^save$/i }).click();
    await expect(window.getByText('To Be Renamed')).toBeVisible();

    // Click the Edit button on the new card
    const card = window.locator('[class*="rounded-xl"]').filter({ hasText: 'To Be Renamed' });
    await card.getByRole('button', { name: /^edit /i }).click();

    // The inline edit form should appear; clear and retype the name
    const nameInput = window.getByPlaceholder(/motivational/i);
    await nameInput.clear();
    await nameInput.fill('Renamed Tone');
    await window.getByRole('button', { name: /^save$/i }).click();

    await expect(window.getByText('Renamed Tone')).toBeVisible();
    await expect(window.getByText('To Be Renamed')).not.toBeVisible();
  });

  test('edits a built-in tone', async () => {
    await goToTonesTab(window);

    const card = window.locator('[class*="rounded-xl"]').filter({ hasText: 'Professional' }).first();
    await card.getByRole('button', { name: /^edit /i }).click();

    // The inline edit form should appear
    await expect(window.getByText('Edit Tone')).toBeVisible();

    // Update the description (more stable to assert on than a very short name)
    const descInput = window.getByPlaceholder(/describe the tone for voices/i);
    await descInput.clear();
    await descInput.fill('Updated professional description.');
    await window.getByRole('button', { name: /^save$/i }).click();

    await expect(window.getByText('Updated professional description.')).toBeVisible();
    await expect(window.getByText('Edit Tone')).not.toBeVisible();
  });

  test('deletes a tone after confirmation', async () => {
    await goToTonesTab(window);

    // Create a tone so we have a disposable target
    await window.getByRole('button', { name: /add tone/i }).click();
    await window.getByPlaceholder(/motivational/i).fill('Temporary Tone');
    await window.getByPlaceholder(/describe the tone/i).fill('Will be deleted.');
    await window.getByRole('button', { name: /^save$/i }).click();
    await expect(window.getByText('Temporary Tone')).toBeVisible();

    // Click Delete → confirm with Yes
    const card = window.locator('[class*="rounded-xl"]').filter({ hasText: 'Temporary Tone' });
    await card.getByRole('button', { name: /^delete /i }).click();
    await card.getByRole('button', { name: /^yes$/i }).click();

    await expect(window.getByText('Temporary Tone')).not.toBeVisible();
  });

  test('cancelling delete keeps the tone', async () => {
    await goToTonesTab(window);

    // Create a tone to target
    await window.getByRole('button', { name: /add tone/i }).click();
    await window.getByPlaceholder(/motivational/i).fill('Keep This Tone');
    await window.getByPlaceholder(/describe the tone/i).fill('Should survive the cancel.');
    await window.getByRole('button', { name: /^save$/i }).click();
    await expect(window.getByText('Keep This Tone')).toBeVisible();

    // Click Delete → cancel with No
    const card = window.locator('[class*="rounded-xl"]').filter({ hasText: 'Keep This Tone' });
    await card.getByRole('button', { name: /^delete /i }).click();
    await card.getByRole('button', { name: /^no$/i }).click();

    await expect(window.getByText('Keep This Tone')).toBeVisible();
  });

  test('shows validation error when name is empty', async () => {
    await goToTonesTab(window);

    await window.getByRole('button', { name: /add tone/i }).click();
    // Leave name blank, fill description
    await window.getByPlaceholder(/describe the tone/i).fill('Some description.');
    await window.getByRole('button', { name: /^save$/i }).click();

    await expect(window.getByText('Name is required')).toBeVisible();
  });
});
