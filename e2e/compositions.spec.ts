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
  // Enable all provider type toggles once for the file
  await goToProvidersTab(window);
  const switches = window.getByRole('switch');
  const switchCount = await switches.count();
  for (let i = 0; i < switchCount; i++) {
    await switches.nth(i).click();
    await expect(window.getByText('Saved').first()).toBeVisible({ timeout: 5_000 });
  }
});

test.afterAll(async () => {
  await app.close();
});

async function buildComposition(
  name: string,
  voices: string[],
  opts: { mode?: 'broadcast' | 'conductor'; continuationPolicy?: 'none' | 'prompt' | 'auto' } = {},
): Promise<void> {
  const { mode = 'conductor', continuationPolicy = 'none' } = opts;
  await window.getByRole('button', { name: /compositions/i }).click();
  await window.getByRole('button', { name: 'New Composition', exact: true }).first().click();
  await window.getByPlaceholder('My Composition').fill(name);
  if (mode === 'broadcast') {
    await window.getByRole('button', { name: /broadcast/i }).first().click();
    if (continuationPolicy !== 'none') {
      const label = continuationPolicy === 'prompt' ? 'Prompt me' : 'Auto';
      await window.getByRole('button', { name: label }).click();
    }
  }
  for (const voice of voices) {
    await window.getByRole('button', { name: voice }).first().click();
    await window.getByRole('button', { name: 'Add Voice' }).click();
  }
  await window.getByRole('button', { name: 'Save Composition' }).click();
}

test.describe('Composition builder', () => {
  test('creates a two-voice broadcast composition', async () => {
    await buildComposition('Broadcast Duo', ['Anthropic', 'OpenAI'], { mode: 'broadcast' });
    await window.getByRole('button', { name: /compositions/i }).click();
    await expect(window.locator('#main-content').getByText('Broadcast Duo')).toBeVisible({ timeout: 5000 });
  });

  test('creates a three-voice conductor-directed composition', async () => {
    await buildComposition('Directed Trio', ['Anthropic', 'OpenAI', 'Gemini'], { mode: 'conductor' });
    await window.getByRole('button', { name: /compositions/i }).click();
    await expect(window.locator('#main-content').getByText('Directed Trio')).toBeVisible({ timeout: 5000 });
  });

  test('creates a broadcast composition with Prompt me continuation policy', async () => {
    await buildComposition('Prompt Duo', ['Anthropic', 'Copilot'], {
      mode: 'broadcast',
      continuationPolicy: 'prompt',
    });
    await window.getByRole('button', { name: /compositions/i }).click();
    await expect(window.locator('#main-content').getByText('Prompt Duo')).toBeVisible({ timeout: 5000 });
  });

  test('creates a broadcast composition with Auto continuation policy', async () => {
    await buildComposition('Auto Duo', ['OpenAI', 'Copilot'], {
      mode: 'broadcast',
      continuationPolicy: 'auto',
    });
    await window.getByRole('button', { name: /compositions/i }).click();
    await expect(window.locator('#main-content').getByText('Auto Duo')).toBeVisible({ timeout: 5000 });
  });

  test('cancelling the builder discards changes', async () => {
    await window.getByRole('button', { name: /compositions/i }).click();
    await window.getByRole('button', { name: 'New Composition', exact: true }).first().click();
    await window.getByPlaceholder('My Composition').fill('Should Not Save');
    await window.getByRole('button', { name: 'Anthropic' }).first().click();
    await window.getByRole('button', { name: 'Add Voice' }).click();
    await window.getByRole('button', { name: /cancel/i }).click();
    await expect(window.getByText('Should Not Save')).not.toBeVisible();
  });
});

test.describe('Composition list and archive', () => {
  test('saved compositions appear in the compositions list', async () => {
    await buildComposition('Listed Comp A', ['Anthropic', 'OpenAI'], { mode: 'broadcast' });
    await buildComposition('Listed Comp B', ['Gemini', 'Copilot'], { mode: 'conductor' });
    await window.getByRole('button', { name: /compositions/i }).click();
    await expect(window.locator('#main-content').getByText('Listed Comp A')).toBeVisible();
    await expect(window.locator('#main-content').getByText('Listed Comp B')).toBeVisible();
  });

  test('archives a composition and it reappears when Show archived is toggled', async () => {
    await buildComposition('To Archive Comp', ['Anthropic', 'Gemini'], { mode: 'broadcast' });
    await window.getByRole('button', { name: /compositions/i }).click();
    const card = window.locator('[class*="rounded-lg"]').filter({ hasText: 'To Archive Comp' }).first();
    await card.getByRole('button', { name: /^archive$/i }).click();
    await expect(window.getByText('To Archive Comp')).not.toBeVisible({ timeout: 5000 });
    await window.getByRole('button', { name: /show archived/i }).click();
    await expect(window.locator('#main-content').getByText('To Archive Comp')).toBeVisible({ timeout: 5000 });
    await window.getByRole('button', { name: /show archived/i }).click();
  });

  test('deletes a composition after confirmation', async () => {
    await buildComposition('To Delete Comp', ['Anthropic', 'OpenAI'], { mode: 'broadcast' });
    await window.getByRole('button', { name: /compositions/i }).click();
    const card = window.locator('[class*="rounded-lg"]').filter({ hasText: 'To Delete Comp' }).first();
    await card.getByTitle('Delete').click();
    await window.getByRole('button', { name: /^yes$/i }).click();
    await expect(window.getByText('To Delete Comp')).not.toBeVisible({ timeout: 5000 });
  });
});
