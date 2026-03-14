import { test, expect } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { launchMockApp, skipOnboarding, goToProvidersTab } from './helpers';

let app: ElectronApplication;
let window: Page;

test.beforeAll(async () => {
  app = await launchMockApp();
  window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  await skipOnboarding(window);
  // Enable all provider type toggles
  await goToProvidersTab(window);
  const switches = window.getByRole('switch');
  const switchCount = await switches.count();
  for (let i = 0; i < switchCount; i++) {
    await switches.nth(i).click();
    await expect(window.getByText('Saved').first()).toBeVisible({ timeout: 5_000 });
  }
  // Create reusable compositions
  await createComposition('Broadcast Base', ['Anthropic', 'OpenAI'], 'broadcast');
  await createComposition('Directed Base', ['Anthropic', 'Gemini'], 'conductor');
});

test.afterAll(async () => {
  await app.close();
});

async function createComposition(
  name: string,
  voices: string[],
  mode: 'broadcast' | 'conductor',
): Promise<void> {
  await window.getByRole('button', { name: /compositions/i }).click();
  await window.getByRole('button', { name: 'New Composition', exact: true }).first().click();
  await window.getByPlaceholder('My Composition').fill(name);
  if (mode === 'broadcast') {
    await window.getByRole('button', { name: /broadcast/i }).first().click();
  }
  for (const v of voices) {
    await window.getByRole('button', { name: v }).first().click();
    await window.getByRole('button', { name: 'Add Voice' }).click();
  }
  await window.getByRole('button', { name: 'Save Composition' }).click();
  await window.getByRole('button', { name: /compositions/i }).click();
  await expect(window.locator('#main-content').getByText(name)).toBeVisible({ timeout: 5000 });
}

async function startSession(compositionName: string, sessionName: string): Promise<void> {
  await window.getByRole('button', { name: 'Sessions', exact: true }).click();
  await window.getByRole('button', { name: 'New Session', exact: true }).click();
  const escaped = compositionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await window.getByRole('button', { name: new RegExp(escaped, 'i') }).first().click();
  await window.getByPlaceholder('My session').fill(sessionName);
  await window.getByRole('button', { name: 'Start Session' }).click();
  await expect(window.getByPlaceholder('Message the ensemble\u2026')).toBeVisible({ timeout: 10_000 });
}

test.describe('Session creation', () => {
  test('starts a broadcast session and it appears in the session list', async () => {
    await startSession('Broadcast Base', 'BC Session 1');
    await window.getByRole('button', { name: 'Sessions', exact: true }).click();
    await expect(window.getByText('BC Session 1').first()).toBeVisible();
  });

  test('starts a directed session and it appears in the session list', async () => {
    await startSession('Directed Base', 'Dir Session 1');
    await window.getByRole('button', { name: 'Sessions', exact: true }).click();
    await expect(window.getByText('Dir Session 1').first()).toBeVisible();
  });

  test('multiple sessions appear in the session list', async () => {
    await startSession('Broadcast Base', 'BC Session 2');
    await window.getByRole('button', { name: 'Sessions', exact: true }).click();
    await expect(window.getByText('BC Session 2').first()).toBeVisible();
    await expect(window.getByText('Dir Session 1').first()).toBeVisible();
  });
});

test.describe('Session archive and management', () => {
  test('archives a session via the Archive button', async () => {
    await startSession('Broadcast Base', 'To Archive Session');
    await window.getByRole('button', { name: 'Sessions', exact: true }).click();
    const card = window.locator('[class*="rounded-lg"]').filter({ hasText: 'To Archive Session' }).first();
    await card.getByRole('button', { name: /^archive$/i }).click();
    await expect(window.locator('[class*="rounded-lg"]').filter({ hasText: 'To Archive Session' })).not.toBeVisible({ timeout: 5000 });
  });

  test('archived session reappears when Show archived is toggled', async () => {
    await window.getByRole('button', { name: 'Sessions', exact: true }).click();
    await window.getByRole('button', { name: /show archived/i }).click();
    await expect(window.locator('[class*="rounded-lg"]').filter({ hasText: 'To Archive Session' })).toBeVisible({ timeout: 5000 });
    await window.getByRole('button', { name: /show archived/i }).click();
  });

  test('deletes a session after confirmation', async () => {
    await startSession('Broadcast Base', 'To Delete Session');
    await window.getByRole('button', { name: 'Sessions', exact: true }).click();
    const card = window.locator('[class*="rounded-lg"]').filter({ hasText: 'To Delete Session' }).first();
    await card.getByTitle('Delete').click();
    await window.getByRole('button', { name: /^yes$/i }).click();
    await expect(window.locator('[class*="rounded-lg"]').filter({ hasText: 'To Delete Session' })).not.toBeVisible({ timeout: 5000 });
  });
});
