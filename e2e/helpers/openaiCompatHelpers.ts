import { type Page, expect } from '@playwright/test';
import { OLLAMA_BASE_URL, OLLAMA_MODEL } from './dockerHelpers';
import { goToProvidersTab } from '../helpers';

/**
 * Navigate to the Providers tab and scroll to the Custom Providers section.
 */
export async function goToCustomProvidersSection(window: Page): Promise<void> {
  await goToProvidersTab(window);
  await window.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
}

/**
 * Add a custom OpenAI-compatible provider via the Settings UI.
 * Uses OLLAMA_BASE_URL and OLLAMA_MODEL from dockerHelpers.
 */
export async function addCustomProvider(
  window: Page,
  pause: () => Promise<void>,
  longPause: () => Promise<void>,
  name: string,
): Promise<void> {
  await window.getByRole('button', { name: /add custom provider/i }).click();
  await pause();
  await window.getByPlaceholder('Ollama', { exact: true }).fill(name);
  await pause();
  await window.getByPlaceholder('http://localhost:11434/v1').fill(OLLAMA_BASE_URL);
  await pause();
  await window.getByPlaceholder('llama3.2').fill(OLLAMA_MODEL);
  await pause();
  await window.getByRole('button', { name: /^save$/i }).click();
  await longPause();
}

/**
 * Build a composition via the Compositions view.
 * options.systemPrompts: optional per-voice inline system prompts (index-aligned with voicePatterns).
 */
export async function buildComposition(
  window: Page,
  pause: () => Promise<void>,
  longPause: () => Promise<void>,
  name: string,
  voicePatterns: RegExp[],
  options?: {
    mode?: 'broadcast' | 'conductor';
    colors?: string[];
    systemPrompts?: (string | undefined)[];
    continuationPolicy?: 'none' | 'prompt' | 'auto';
    continuationMaxRounds?: number;
  },
): Promise<void> {
  const {
    mode = 'conductor',
    colors = [],
    systemPrompts = [],
    continuationPolicy,
    continuationMaxRounds,
  } = options ?? {};

  await window.getByRole('button', { name: /compositions/i }).click();
  await pause();
  await window.getByRole('button', { name: 'New Composition', exact: true }).first().click();
  await pause();
  await window.getByPlaceholder('My Composition').fill(name);
  await pause();

  if (mode === 'broadcast') {
    await window.getByRole('button', { name: /broadcast/i }).first().click();
    await pause();

    if (continuationPolicy && continuationPolicy !== 'none') {
      const labelMap = { prompt: /prompt me/i, auto: /^auto$/i } as const;
      await window.getByRole('button', { name: labelMap[continuationPolicy] }).click();
      await pause();
    }

    if (continuationPolicy === 'auto' && continuationMaxRounds !== undefined) {
      // Range slider has no accessible label; set value directly via DOM evaluation
      await window.locator('input[type="range"]').evaluate(
        (el: HTMLInputElement, value: number) => {
          el.value = String(value);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        },
        continuationMaxRounds,
      );
      await pause();
    }
  }

  for (let i = 0; i < voicePatterns.length; i++) {
    await window.getByRole('button', { name: voicePatterns[i] }).click();
    await pause();
    if (colors[i]) {
      await window.getByRole('button', { name: `Voice color: ${colors[i]}` }).click();
      await pause();
    }
    await window.getByRole('button', { name: 'Add Voice' }).click();
    await pause();

    if (systemPrompts[i]) {
      // Expand the most-recently-added voice row to set its inline system prompt
      await window.getByRole('button', { name: /^Edit /i }).last().click();
      await pause();
      await window.getByPlaceholder('Optional per-voice system prompt…').fill(systemPrompts[i]);
      await pause();
      await window.getByRole('button', { name: 'Save', exact: true }).click();
      await pause();
    }
  }

  await window.getByRole('button', { name: 'Save Composition' }).click();
  await longPause();
}

/**
 * Start a session from a named composition and wait for the conductor input to be ready.
 */
export async function startSession(
  window: Page,
  pause: () => Promise<void>,
  compositionPattern: RegExp,
  sessionName: string,
): Promise<void> {
  await window.getByRole('button', { name: /sessions/i }).click();
  await pause();
  await window.getByRole('button', { name: 'New Session', exact: true }).click();
  await pause();
  await window.getByRole('button', { name: compositionPattern }).first().click();
  await pause();
  await window.getByPlaceholder('My session').fill(sessionName);
  await pause();
  await window.getByRole('button', { name: 'Start Session' }).click();
  await expect(window.getByPlaceholder('Message the ensemble\u2026')).toBeVisible({ timeout: 10_000 });
  await pause();
}
