import { test, expect } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { launchMockApp, skipOnboarding, goToSystemPromptsTab } from './helpers';

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

test.describe('System Prompt Templates CRUD', () => {
  test('shows seeded templates on the System Prompts tab', async () => {
    await goToSystemPromptsTab(window);

    await expect(window.getByText("Devil's Advocate", { exact: true })).toBeVisible();
    await expect(window.getByText('Socratic Guide', { exact: true })).toBeVisible();
    await expect(window.getByText('Creative Brainstormer', { exact: true })).toBeVisible();
    await expect(window.getByText('Pragmatic Implementer', { exact: true })).toBeVisible();
    await expect(window.getByText('Domain Expert', { exact: true })).toBeVisible();
  });

  test('creates a new template', async () => {
    await goToSystemPromptsTab(window);

    await window.getByRole('button', { name: /add template/i }).click();
    await window.getByPlaceholder(/code review assistant/i).fill('Test Template');
    await window.getByPlaceholder(/you are a careful code reviewer/i).fill('You are a test assistant.');
    await window.getByRole('button', { name: /^save$/i }).click();

    await expect(window.getByText('Test Template')).toBeVisible();
  });

  test('edits an existing template', async () => {
    await goToSystemPromptsTab(window);

    // Create a template to edit
    await window.getByRole('button', { name: /add template/i }).click();
    await window.getByPlaceholder(/code review assistant/i).fill('Original Template');
    await window.getByPlaceholder(/you are a careful code reviewer/i).fill('Original content.');
    await window.getByRole('button', { name: /^save$/i }).click();
    await expect(window.getByText('Original Template')).toBeVisible();

    // Edit it
    const card = window.locator('[class*="rounded-xl"]').filter({ hasText: 'Original Template' });
    await card.getByRole('button', { name: /^edit /i }).click();

    const nameInput = window.getByPlaceholder(/code review assistant/i);
    await nameInput.clear();
    await nameInput.fill('Updated Template');
    await window.getByRole('button', { name: /^save$/i }).click();

    await expect(window.getByText('Updated Template')).toBeVisible();
    await expect(window.getByText('Original Template')).not.toBeVisible();
  });

  test('deletes a template after confirmation', async () => {
    await goToSystemPromptsTab(window);

    // Create a disposable template
    await window.getByRole('button', { name: /add template/i }).click();
    await window.getByPlaceholder(/code review assistant/i).fill('Temporary Template');
    await window.getByPlaceholder(/you are a careful code reviewer/i).fill('Will be deleted.');
    await window.getByRole('button', { name: /^save$/i }).click();
    await expect(window.getByText('Temporary Template')).toBeVisible();

    // Delete → confirm
    const card = window.locator('[class*="rounded-xl"]').filter({ hasText: 'Temporary Template' });
    await card.getByRole('button', { name: /^delete /i }).click();
    await card.getByRole('button', { name: /^yes$/i }).click();

    await expect(window.getByText('Temporary Template')).not.toBeVisible();
  });

  test('cancelling delete keeps the template', async () => {
    await goToSystemPromptsTab(window);

    // Create a template to target
    await window.getByRole('button', { name: /add template/i }).click();
    await window.getByPlaceholder(/code review assistant/i).fill('Keep This Template');
    await window.getByPlaceholder(/you are a careful code reviewer/i).fill('Should survive.');
    await window.getByRole('button', { name: /^save$/i }).click();
    await expect(window.getByText('Keep This Template')).toBeVisible();

    // Delete → cancel
    const card = window.locator('[class*="rounded-xl"]').filter({ hasText: 'Keep This Template' });
    await card.getByRole('button', { name: /^delete /i }).click();
    await card.getByRole('button', { name: /^no$/i }).click();

    await expect(window.getByText('Keep This Template')).toBeVisible();
  });

  test('shows validation error when name is empty', async () => {
    await goToSystemPromptsTab(window);

    await window.getByRole('button', { name: /add template/i }).click();
    // Leave name blank, fill content
    await window.getByPlaceholder(/you are a careful code reviewer/i).fill('Some content.');
    await window.getByRole('button', { name: /^save$/i }).click();

    await expect(window.getByText('Name is required')).toBeVisible();
    // Close the form so subsequent tests can open it again
    await window.getByRole('button', { name: /^cancel$/i }).click();
  });

  test('shows validation error when content is empty', async () => {
    await goToSystemPromptsTab(window);

    await window.getByRole('button', { name: /add template/i }).click();
    await window.getByPlaceholder(/code review assistant/i).fill('No Content Template');
    // Leave content blank
    await window.getByRole('button', { name: /^save$/i }).click();

    await expect(window.getByText('Content is required')).toBeVisible();
  });
});
