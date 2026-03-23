/**
 * Shared helpers for live e2e provider tests.
 *
 * Imported by providers-api.e2e-live.test.ts, providers-cli.e2e-live.test.ts,
 * and providers-mixed.e2e-live.test.ts.
 */

import { test, expect, type Page } from '@playwright/test';

// ── Timing constants — the only two values to change for global pacing adjustments ──
export const STEP_PAUSE = 1_500;
export const LONG_PAUSE = 4_000;

export function makePause(win: Page) {
  return {
    pause: () => win.waitForTimeout(STEP_PAUSE),
    longPause: () => win.waitForTimeout(LONG_PAUSE),
  };
}

// ── Hardcoded cheap models for live tests ─────────────────────────────────────
//
// These are pinned to specific known-cheap models rather than inferred from the
// API model list to avoid picking deprecated or restricted models at runtime.
// If a model stops working, update this map and the test will tell you why.

export const LIVE_TEST_MODELS: Record<string, string> = {
  anthropic: 'claude-haiku-4-5-20251001',
  openai: 'gpt-4.1-nano',
  gemini: 'gemini-2.5-flash-lite',
};

// ── Provider availability helpers ─────────────────────────────────────────────

export async function enableProvider(win: Page, providerId: string, voiceType: 'api' | 'cli' = 'api') {
  const model = voiceType === 'api' ? (LIVE_TEST_MODELS[providerId] ?? null) : null;
  await win.evaluate(
    async ({ id, model, voiceType }: { id: string; model: string | null; voiceType: 'api' | 'cli' }) => {
      const configs = await window.polyphon.settings.getProviderConfig();
      const existing = configs.find((c) => c.provider === id && c.voiceType === voiceType);
      await window.polyphon.settings.saveProviderConfig({
        provider: id,
        enabled: true,
        voiceType,
        defaultModel: model ?? existing?.defaultModel ?? null,
        cliCommand: existing?.cliCommand ?? null,
        cliArgs: existing?.cliArgs ?? null,
      });
    },
    { id: providerId, model, voiceType },
  );
}

export async function isApiKeyAvailable(win: Page, providerId: string): Promise<boolean> {
  const statuses = await win.evaluate(async () => window.polyphon.settings.getProviderStatus());
  const entry = statuses.find((s: { provider: string }) => s.provider === providerId);
  return entry?.apiKeyStatus?.status !== 'none' && entry?.apiKeyStatus?.status !== undefined;
}

export async function isCliAvailable(win: Page, cliCommand: string): Promise<boolean> {
  const result = await win.evaluate(
    async (cmd: string) => window.polyphon.settings.testCliVoice(cmd),
    cliCommand,
  );
  return result.success === true;
}

// ── Multi-voice helpers ───────────────────────────────────────────────────────

export interface LiveVoiceEntry {
  providerId: string;
  voiceType: 'api' | 'cli';
  cliCommand?: string;
  label: string;
}

export async function requireProviders(win: Page, entries: LiveVoiceEntry[]): Promise<boolean> {
  for (const entry of entries) {
    if (entry.voiceType === 'api') {
      const ok = await isApiKeyAvailable(win, entry.providerId);
      if (!ok) {
        test.skip(true, `${entry.label}: no API key configured`);
        return false;
      }
    } else {
      const ok = await isCliAvailable(win, entry.cliCommand!);
      if (!ok) {
        test.skip(true, `${entry.label}: CLI binary not found`);
        return false;
      }
    }
  }
  return true;
}

export interface LiveVoiceSpec {
  providerId: string;
  voiceType: 'api' | 'cli';
  displayName: string;
  model?: string;
  /** Tool labels to enable (e.g. 'Read File', 'List Directory'). API voices only. */
  tools?: string[];
}

export async function buildCompositionLive(
  win: Page,
  pause: () => Promise<void>,
  longPause: () => Promise<void>,
  compositionName: string,
  voices: LiveVoiceSpec[],
  opts: {
    mode?: 'broadcast' | 'conductor';
    continuationPolicy?: 'none' | 'prompt' | 'auto';
    continuationMaxRounds?: number;
  } = {},
): Promise<void> {
  const { mode = 'broadcast', continuationPolicy = 'none', continuationMaxRounds } = opts;

  await win.getByRole('button', { name: /compositions/i }).click();
  await pause();
  await win.getByRole('button', { name: 'New Composition', exact: true }).first().click();
  await pause();
  await win.getByPlaceholder('My Composition').fill(compositionName);
  await pause();

  if (mode === 'broadcast') {
    await win.getByRole('button', { name: /broadcast/i }).first().click();
    await pause();
    // Always explicitly click the continuation policy button to override the
    // CompositionBuilder's default ('prompt'), which persists between builds.
    const contLabel =
      continuationPolicy === 'none' ? 'None' : continuationPolicy === 'prompt' ? 'Prompt me' : 'Auto';
    await win.getByRole('button', { name: contLabel, exact: true }).click();
    await pause();

    if (continuationPolicy === 'auto' && continuationMaxRounds !== undefined) {
      const slider = win.locator('input[type="range"]').first();
      await slider.evaluate((el: HTMLInputElement, v: string) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        setter?.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }, String(continuationMaxRounds));
      await pause();
    }
  }

  for (const voice of voices) {
    await win
      .getByRole('button', { name: new RegExp(`Select ${voice.providerId} provider`, 'i') })
      .click();
    await pause();

    const typeToggle = win.getByRole('button', { name: new RegExp(`^${voice.voiceType}$`, 'i') });
    if (await typeToggle.isVisible()) {
      const disabled = await typeToggle.evaluate((el) => (el as HTMLButtonElement).disabled);
      if (!disabled) {
        await typeToggle.click();
        await pause();
      }
    }

    const displayInput = win.getByPlaceholder(/display name/i);
    if (await displayInput.isVisible()) {
      await displayInput.clear();
      await displayInput.fill(voice.displayName);
      await pause();
    }

    if (voice.model) {
      const modelSelect = win.locator('select').filter({ has: win.locator(`option[value="${voice.model}"]`) });
      if (await modelSelect.isVisible()) {
        await modelSelect.selectOption(voice.model);
        await pause();
      }
    }

    await win.getByRole('button', { name: 'Add Voice' }).click();
    await pause();

    if (voice.tools && voice.tools.length > 0 && voice.voiceType === 'api') {
      // Tools are configurable in the voice order list after adding. Expand the card.
      await win.getByRole('button', { name: `Edit ${voice.displayName}` }).click();
      await pause();
      for (const toolLabel of voice.tools) {
        await win.locator('button').filter({ hasText: toolLabel }).first().click();
        await pause();
      }
      // Commit the tool changes by clicking the inner Save button on the expanded row.
      // Without this, handleSave() never fires and enabledTools stays [] on the voice.
      await win.getByRole('button', { name: 'Save', exact: true }).click();
      await pause();
    }
  }

  await win.getByRole('button', { name: 'Save Composition' }).click();
  await longPause();
}

/**
 * Expand the voice sidebar and assert each named voice shows the expected type badge
 * (CLI or API). The sidebar is left expanded so the badges remain visible throughout
 * the rest of the test.
 */
export async function expandSidebarAndAssertVoiceTypes(
  win: Page,
  pause: () => Promise<void>,
  voices: Array<{ displayName: string; voiceType: 'api' | 'cli' }>,
): Promise<void> {
  const expandBtn = win.getByRole('button', { name: /expand sidebar/i });
  if (await expandBtn.isVisible()) {
    await expandBtn.click();
    await pause();
  }

  for (const { displayName, voiceType } of voices) {
    const panel = win.locator(`[aria-label*="Voice: ${displayName}"]`);
    const expectedBadge = voiceType === 'cli' ? 'CLI' : 'API';
    await expect(panel.getByText(expectedBadge, { exact: true })).toBeVisible({ timeout: 5_000 });
  }
}

/**
 * Assert that the named voice has at least one non-empty response bubble visible.
 * The aria-label pattern is: "Message from <displayName>" on role="article" elements.
 */
export async function waitForVoiceResponse(win: Page, displayName: string): Promise<void> {
  await expect(
    win.locator(`[role="article"][aria-label*="${displayName}"]`).filter({ hasText: /\S/ }),
  ).toBeVisible({ timeout: 90_000 });
}

/**
 * Wait until the conductor textarea is enabled again (round complete).
 */
export async function waitForRoundIdle(win: Page): Promise<void> {
  await expect(
    win.getByPlaceholder('Message the ensemble\u2026'),
  ).toBeEnabled({ timeout: 120_000 });
}

/**
 * Return the current count of non-empty response bubbles for the named voice.
 * Use before a send to establish a baseline for round-scoped silence assertions.
 */
export async function countVoiceResponses(win: Page, displayName: string): Promise<number> {
  return win
    .locator(`[role="article"][aria-label*="${displayName}"]`)
    .filter({ hasText: /\S/ })
    .count();
}

export async function startSession(
  win: Page,
  pause: () => Promise<void>,
  compositionName: string,
  sessionName: string,
  opts: { workingDir?: string; sandboxed?: boolean } = {},
): Promise<void> {
  await win.getByRole('button', { name: /sessions/i }).click();
  await pause();
  await win.getByRole('button', { name: 'New Session', exact: true }).click();
  await pause();
  await win.getByRole('button', { name: new RegExp(compositionName, 'i') }).first().click();
  await pause();
  await win.getByPlaceholder('My session').fill(sessionName);
  await pause();
  if (opts.workingDir) {
    await win.getByPlaceholder('/path/to/project').fill(opts.workingDir);
    // Wait for debounced directory validation to resolve
    await win.waitForTimeout(1_500);
  }
  if (opts.sandboxed) {
    const sandboxLabel = win.locator('label').filter({ hasText: /sandbox api voices/i });
    await expect(sandboxLabel).toBeVisible({ timeout: 5_000 });
    await sandboxLabel.click();
    await pause();
  }
  await win.getByRole('button', { name: 'Start Session' }).click();
  await expect(win.getByPlaceholder('Message the ensemble\u2026')).toBeVisible({ timeout: 10_000 });
  await pause();
}

