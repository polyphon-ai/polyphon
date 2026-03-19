import { test, expect } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { launchMockApp, skipOnboarding, goToProvidersTab } from './helpers';

test.describe('Provider cards', () => {
  let app: ElectronApplication;
  let window: Page;

  test.beforeAll(async () => {
    app = await launchMockApp();
    window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await skipOnboarding(window);
    await goToProvidersTab(window);
  });

  test.afterAll(async () => {
    await app.close();
  });

  test('all provider type toggles render disabled by default', async () => {
    await expect(window.getByText('Anthropic')).toBeVisible();
    await expect(window.getByText('OpenAI', { exact: true })).toBeVisible();
    await expect(window.getByText('Gemini')).toBeVisible();
    await expect(window.getByText('Copilot')).toBeVisible();
    const toggles = window.getByRole('switch');
    const count = await toggles.count();
    // anthropic(api+cli) + openai(api+cli) + gemini(api) + copilot(cli) = 6
    expect(count).toBe(6);
    for (let i = 0; i < count; i++) {
      await expect(toggles.nth(i)).toHaveAttribute('aria-checked', 'false');
    }
  });

  test('enabling an API provider reveals its configuration panel', async () => {
    await expect(window.getByText('Default model')).not.toBeVisible();
    await window.getByRole('switch').first().click();
    await expect(window.getByText('Saved').first()).toBeVisible({ timeout: 3000 });
    await expect(window.getByText('Default model')).toBeVisible();
  });

  test('enabling a CLI provider reveals CLI command input and Test button', async () => {
    const toggles = window.getByRole('switch');
    const count = await toggles.count();
    await toggles.nth(count - 1).click();
    await expect(window.getByText('Saved').first()).toBeVisible({ timeout: 3000 });
    await expect(window.getByPlaceholder('copilot')).toBeVisible();
    await expect(window.getByRole('button', { name: /^test$/i })).toBeVisible();
  });
});

test.describe('Provider cards — with API key', () => {
  let keyApp: ElectronApplication;
  let keyWindow: Page;

  test.beforeAll(async () => {
    keyApp = await launchMockApp({ POLYPHON_ANTHROPIC_API_KEY: 'sk-ant-testkey123' }); // not a real key
    keyWindow = await keyApp.firstWindow();
    await keyWindow.waitForLoadState('domcontentloaded');
    await skipOnboarding(keyWindow);
    await goToProvidersTab(keyWindow);
    await keyWindow.getByRole('switch').first().click();
    await expect(keyWindow.getByText('Saved').first()).toBeVisible({ timeout: 3000 });
  });

  test.afterAll(async () => {
    await keyApp.close();
  });

  test('API key status shown when provider is enabled with a key', async () => {
    await expect(keyWindow.getByText('POLYPHON_ANTHROPIC_API_KEY')).toBeVisible();
  });

  test('model refresh button visible when API provider is enabled with a key', async () => {
    await expect(keyWindow.getByRole('button', { name: /refresh/i })).toBeVisible();
  });
});

test.describe('Custom Providers', () => {
  let app: ElectronApplication;
  let window: Page;

  test.beforeAll(async () => {
    app = await launchMockApp();
    window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await skipOnboarding(window);
    await goToProvidersTab(window);
  });

  test.afterAll(async () => {
    await app.close();
  });

  test('custom providers section is visible on the Providers tab', async () => {
    await expect(window.getByText('Custom Providers')).toBeVisible();
    await expect(window.getByRole('button', { name: /add custom provider/i })).toBeVisible();
  });

  test('creates a custom OpenAI-compatible provider', async () => {
    await window.getByRole('button', { name: /add custom provider/i }).click();
    await window.getByPlaceholder('Ollama', { exact: true }).fill('Local Ollama');
    await window.getByPlaceholder('http://localhost:11434/v1').fill('http://localhost:11434/v1');
    await window.getByPlaceholder('llama3.2').fill('llama3.2');
    await window.getByRole('button', { name: /^save$/i }).click();
    await expect(window.getByText('Local Ollama')).toBeVisible({ timeout: 5000 });
  });

  test('validation requires name to save', async () => {
    await window.getByRole('button', { name: /add custom provider/i }).click();
    await window.getByPlaceholder('http://localhost:11434/v1').fill('http://localhost:9000/v1');
    await window.getByPlaceholder('llama3.2').fill('mistral');
    await window.getByRole('button', { name: /^save$/i }).click();
    await expect(window.getByText('Name is required')).toBeVisible();
    await window.getByRole('button', { name: /^cancel$/i }).click();
  });

  test('validation requires base URL to save', async () => {
    await window.getByRole('button', { name: /add custom provider/i }).click();
    await window.getByPlaceholder('Ollama', { exact: true }).fill('No URL Provider');
    await window.getByPlaceholder('llama3.2').fill('mistral');
    await window.getByRole('button', { name: /^save$/i }).click();
    await expect(window.getByText('Base URL is required')).toBeVisible();
    await window.getByRole('button', { name: /^cancel$/i }).click();
  });

  test('validation requires default model to save', async () => {
    await window.getByRole('button', { name: /add custom provider/i }).click();
    await window.getByPlaceholder('Ollama', { exact: true }).fill('No Model Provider');
    await window.getByPlaceholder('http://localhost:11434/v1').fill('http://localhost:9001/v1');
    await window.getByRole('button', { name: /^save$/i }).click();
    await expect(window.getByText('Default model is required')).toBeVisible();
    await window.getByRole('button', { name: /^cancel$/i }).click();
  });

  test('edits an existing custom provider name', async () => {
    const card = window.locator('[class*="rounded-xl"]').filter({ hasText: 'Local Ollama' }).first();
    await card.getByRole('button', { name: /Edit Local Ollama/i }).click();
    const nameInput = window.getByPlaceholder('Ollama', { exact: true });
    await nameInput.clear();
    await nameInput.fill('Renamed Ollama');
    await window.getByRole('button', { name: /^save$/i }).click();
    await expect(window.getByText('Renamed Ollama')).toBeVisible({ timeout: 5000 });
    await expect(window.getByText('Local Ollama')).not.toBeVisible();
  });

  test('deletes a custom provider after confirmation', async () => {
    // Create a disposable provider
    await window.getByRole('button', { name: /add custom provider/i }).click();
    await window.getByPlaceholder('Ollama', { exact: true }).fill('Temp Provider');
    await window.getByPlaceholder('http://localhost:11434/v1').fill('http://localhost:9999/v1');
    await window.getByPlaceholder('llama3.2').fill('phi3');
    await window.getByRole('button', { name: /^save$/i }).click();
    await expect(window.getByText('Temp Provider')).toBeVisible({ timeout: 5000 });

    // Click aria-label Delete → Yes
    const card = window.locator('[class*="rounded-xl"]').filter({ hasText: 'Temp Provider' }).first();
    await card.getByRole('button', { name: /Delete Temp Provider/i }).click();
    await card.getByRole('button', { name: /^yes$/i }).click();
    await expect(window.getByText('Temp Provider')).not.toBeVisible({ timeout: 5000 });
  });
});
