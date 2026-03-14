import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

export const PROVIDER = {
  ANTHROPIC: { name: 'Anthropic' },
  OPENAI:    { name: 'OpenAI' },
  GEMINI:    { name: 'Gemini' },
  COPILOT:   { name: 'Copilot' },
} as const;

export type ProviderEntry = (typeof PROVIDER)[keyof typeof PROVIDER];

export async function buildComposition(
  window: Page,
  name: string,
  voiceProviderNames: string[],
  opts: {
    mode?: 'broadcast' | 'conductor';
    continuationPolicy?: 'none' | 'prompt' | 'auto';
  } = {},
): Promise<void> {
  const { mode = 'broadcast', continuationPolicy = 'none' } = opts;

  await window.getByRole('button', { name: /compositions/i }).click();
  // exact: true avoids the sidebar + button whose title is "New composition" (lowercase c)
  await window.getByRole('button', { name: 'New Composition', exact: true }).first().click();

  await window.getByPlaceholder('My Composition').fill(name);

  if (mode === 'broadcast') {
    await window.getByRole('button', { name: /broadcast/i }).first().click();
    if (continuationPolicy !== 'none') {
      const label = continuationPolicy === 'prompt' ? 'Prompt me' : 'Auto';
      await window.getByRole('button', { name: label }).click();
    }
  }
  // else: default is Conductor-Directed

  for (const providerName of voiceProviderNames) {
    await window.getByRole('button', { name: providerName }).first().click();
    await window.getByRole('button', { name: 'Add Voice' }).click();
  }

  await window.getByRole('button', { name: 'Save Composition' }).click();
}

export async function startSession(
  window: Page,
  compositionName: string,
  sessionName: string,
): Promise<void> {
  await window.getByRole('button', { name: /sessions/i }).click();
  // exact: true avoids the sidebar + button whose title is "New session" (lowercase s)
  await window.getByRole('button', { name: 'New Session', exact: true }).click();
  // Escape regex metacharacters in the composition name before building the locator
  const escapedName = compositionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await window.getByRole('button', { name: new RegExp(escapedName, 'i') }).first().click();
  await window.getByPlaceholder('My session').fill(sessionName);
  await window.getByRole('button', { name: 'Start Session' }).click();
  await expect(window.getByPlaceholder('Message the ensemble\u2026')).toBeVisible({ timeout: 10_000 });
}

/** Type a message and submit with Enter. */
export async function sendMessage(window: Page, message: string): Promise<void> {
  await window.getByPlaceholder('Message the ensemble\u2026').fill(message);
  await window.keyboard.press('Enter');
}

/** Assert a mock voice response is visible and wait for the textarea to re-enable. */
export async function expectResponse(window: Page, voiceName: string): Promise<void> {
  await expect(
    window.getByText(new RegExp(`Mock response from ${voiceName}!`)),
  ).toBeVisible({ timeout: 15_000 });
}

/** Wait until no voice is streaming (textarea re-enabled). */
export async function waitIdle(window: Page): Promise<void> {
  await expect(
    window.getByPlaceholder('Message the ensemble\u2026'),
  ).toBeVisible({ timeout: 20_000 });
}

/** Assert a mock response is NOT present in the feed. */
export async function expectNoResponse(window: Page, voiceName: string): Promise<void> {
  await expect(
    window.getByText(new RegExp(`Mock response from ${voiceName}!`)),
  ).not.toBeVisible();
}
