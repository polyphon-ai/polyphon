/**
 * Live e2e tests for built-in voice providers (Anthropic, OpenAI, Gemini, Copilot).
 *
 * Each test skips gracefully when the required credential or CLI binary is not available.
 * Run via: make test-e2e-live
 *
 * With no credentials: all tests skip, exit code 0.
 * With credentials: matching tests run against real providers.
 *
 * Scenarios:
 *   1. Multi-voice broadcast — API trio (Anthropic API + OpenAI API + Gemini API)
 *   2. Multi-voice broadcast — CLI trio (Anthropic CLI + OpenAI CLI + Copilot CLI)
 *   3. Mixed API+CLI broadcast — multi-round (Anthropic API + Copilot CLI, 2 rounds)
 *   4. Mixed conductor routing — @mention directed (Anthropic API + Copilot CLI, 2 directed rounds)
 *
 * Keyword-anchor prompts ("include the word X") are used for human-observer clarity only.
 * The specific keyword is NOT asserted programmatically — LLM output is non-deterministic.
 * Response bubbles are asserted for non-empty content with correct voice attribution.
 */

import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, makeTempDir, skipOnboarding, goToProvidersTab } from './helpers';

// ── Timing constants — the only two values to change for global pacing adjustments ──
const STEP_PAUSE = 1_500;
const LONG_PAUSE = 4_000;

function makePause(win: Page) {
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

const LIVE_TEST_MODELS: Record<string, string> = {
  anthropic: 'claude-haiku-4-5-20251001',
  openai: 'gpt-4.1-nano',
  gemini: 'gemini-2.5-flash-lite',
};

// ── Provider availability helpers ─────────────────────────────────────────────

async function enableProvider(win: Page, providerId: string, voiceType: 'api' | 'cli' = 'api') {
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

async function isApiKeyAvailable(win: Page, providerId: string): Promise<boolean> {
  const statuses = await win.evaluate(async () => window.polyphon.settings.getProviderStatus());
  const entry = statuses.find((s: { provider: string }) => s.provider === providerId);
  return entry?.apiKeyStatus?.status !== 'none' && entry?.apiKeyStatus?.status !== undefined;
}

async function isCliAvailable(win: Page, cliCommand: string): Promise<boolean> {
  const result = await win.evaluate(
    async (cmd: string) => window.polyphon.settings.testCliVoice(cmd),
    cliCommand,
  );
  return result.success === true;
}

// ── Multi-voice helpers ───────────────────────────────────────────────────────

interface LiveVoiceEntry {
  providerId: string;
  voiceType: 'api' | 'cli';
  cliCommand?: string;
  label: string;
}

async function requireProviders(win: Page, entries: LiveVoiceEntry[]): Promise<boolean> {
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

interface LiveVoiceSpec {
  providerId: string;
  voiceType: 'api' | 'cli';
  displayName: string;
  model?: string;
}

async function buildCompositionLive(
  win: Page,
  pause: () => Promise<void>,
  longPause: () => Promise<void>,
  compositionName: string,
  voices: LiveVoiceSpec[],
  opts: {
    mode?: 'broadcast' | 'conductor';
    continuationPolicy?: 'none' | 'prompt' | 'auto';
  } = {},
): Promise<void> {
  const { mode = 'broadcast', continuationPolicy = 'none' } = opts;

  await win.getByRole('button', { name: /compositions/i }).click();
  await pause();
  await win.getByRole('button', { name: 'New Composition', exact: true }).first().click();
  await pause();
  await win.getByPlaceholder('My Composition').fill(compositionName);
  await pause();

  if (mode === 'broadcast') {
    await win.getByRole('button', { name: /broadcast/i }).first().click();
    await pause();
    if (continuationPolicy !== 'none') {
      const label = continuationPolicy === 'prompt' ? 'Prompt me' : 'Auto';
      await win.getByRole('button', { name: label }).click();
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
  }

  await win.getByRole('button', { name: 'Save Composition' }).click();
  await longPause();
}

/**
 * Expand the voice sidebar and assert each named voice shows the expected type badge
 * (CLI or API). The sidebar is left expanded so the badges remain visible throughout
 * the rest of the test.
 */
async function expandSidebarAndAssertVoiceTypes(
  win: Page,
  pause: () => Promise<void>,
  voices: Array<{ displayName: string; voiceType: 'api' | 'cli' }>,
): Promise<void> {
  await win.getByRole('button', { name: /expand sidebar/i }).click();
  await pause();

  for (const { displayName, voiceType } of voices) {
    const panel = win.locator(`[aria-label*="Voice: ${displayName}"]`);
    const expectedBadge = voiceType === 'cli' ? 'CLI' : 'API';
    await expect(panel.getByText(expectedBadge, { exact: true })).toBeVisible({ timeout: 5_000 });
  }
}

/**
 * Assert that the most recent response bubble from the named voice shows the correct
 * type badge (CLI or API) in its header.
 */
async function assertMessageBubbleType(
  win: Page,
  displayName: string,
  voiceType: 'api' | 'cli',
): Promise<void> {
  const expectedBadge = voiceType === 'cli' ? 'CLI' : 'API';
  const article = win
    .locator(`[role="article"][aria-label*="Message from ${displayName}"]`)
    .filter({ hasText: /\S/ })
    .first();
  await expect(article.getByText(expectedBadge, { exact: true })).toBeVisible({ timeout: 10_000 });
}

/**
 * Assert that the named voice has at least one non-empty response bubble visible.
 * The aria-label pattern is: "Message from <displayName>" on role="article" elements.
 */
async function waitForVoiceResponse(win: Page, displayName: string): Promise<void> {
  await expect(
    win.locator(`[role="article"][aria-label*="${displayName}"]`).filter({ hasText: /\S/ }),
  ).toBeVisible({ timeout: 90_000 });
}

/**
 * Wait until the conductor textarea is enabled again (round complete).
 */
async function waitForRoundIdle(win: Page): Promise<void> {
  await expect(
    win.getByPlaceholder('Message the ensemble\u2026'),
  ).toBeEnabled({ timeout: 120_000 });
}

/**
 * Return the current count of non-empty response bubbles for the named voice.
 * Use before a send to establish a baseline for round-scoped silence assertions.
 */
async function countVoiceResponses(win: Page, displayName: string): Promise<number> {
  return win
    .locator(`[role="article"][aria-label*="${displayName}"]`)
    .filter({ hasText: /\S/ })
    .count();
}

async function startSession(
  win: Page,
  pause: () => Promise<void>,
  compositionName: string,
  sessionName: string,
): Promise<void> {
  await win.getByRole('button', { name: /sessions/i }).click();
  await pause();
  await win.getByRole('button', { name: 'New Session', exact: true }).click();
  await pause();
  await win.getByRole('button', { name: new RegExp(compositionName, 'i') }).first().click();
  await pause();
  await win.getByPlaceholder('My session').fill(sessionName);
  await pause();
  await win.getByRole('button', { name: 'Start Session' }).click();
  await expect(win.getByPlaceholder('Message the ensemble\u2026')).toBeVisible({ timeout: 10_000 });
  await pause();
}

// ── Test suite ─────────────────────────────────────────────────────────────────

test.describe.serial('built-in providers', () => {
  let app: ElectronApplication;
  let win: Page;
  let pause: () => Promise<void>;
  let longPause: () => Promise<void>;

  test.beforeAll(async () => {
    app = await launchApp({ POLYPHON_TEST_USER_DATA: makeTempDir(), POLYPHON_SHOW_WINDOW: '1' });
    win = await app.firstWindow();
    await win.waitForLoadState('domcontentloaded');
    await skipOnboarding(win);

    ({ pause, longPause } = makePause(win));
    await pause();

    // Enable all built-in providers so they appear in the composition builder.
    // API type for all; CLI type for providers that support it (so the CLI
    // toggle renders in VoiceSelector when both types are enabled).
    for (const id of ['anthropic', 'openai', 'gemini', 'copilot']) {
      await enableProvider(win, id, 'api');
    }
    for (const id of ['anthropic', 'openai', 'copilot']) {
      await enableProvider(win, id, 'cli');
    }

    // Navigate to Settings so the SettingsPage mounts and calls load(), refreshing
    // the store with the newly enabled provider configs saved above via IPC.
    await goToProvidersTab(win);
    await pause();
  });

  test.afterAll(async () => {
    await app?.close().catch(() => {});
  });

  // ── Preflight: verify hardcoded cheap models are available ──────────────────

  test('preflight: hardcoded LIVE_TEST_MODELS exist and respond to a simple prompt', async () => {
    for (const [providerId, model] of Object.entries(LIVE_TEST_MODELS)) {
      const available = await isApiKeyAvailable(win, providerId);
      if (!available) continue;

      // 1. Verify the model is listed by the provider API.
      const listResult = await win.evaluate(
        async (id: string) => window.polyphon.settings.fetchModels(id),
        providerId,
      );
      const models: string[] = listResult?.models ?? [];
      if (!models.includes(model)) {
        throw new Error(
          `Preflight failed for ${providerId}: model "${model}" was not found in the API model list.\n` +
          `Available models: ${models.join(', ')}\n` +
          `The model may have been deprecated or renamed. Update LIVE_TEST_MODELS in providers.e2e-live.test.ts.`,
        );
      }

      // 2. Verify the model can respond to a minimal prompt.
      const probeResult = await win.evaluate(
        async ({ id, m }: { id: string; m: string }) =>
          window.polyphon.settings.probeModel(id, m),
        { id: providerId, m: model },
      );
      if (!probeResult.ok) {
        throw new Error(
          `Preflight failed for ${providerId}: model "${model}" returned an error on a test prompt.\n` +
          `Error: ${(probeResult as { ok: false; error: string }).error}\n` +
          `The model may be restricted or unavailable. Update LIVE_TEST_MODELS in providers.e2e-live.test.ts.`,
        );
      }
    }
  });

  // ── Scenario 1: Multi-voice broadcast — API trio ────────────────────────────

  test.describe.serial('multi-voice broadcast — API trio', () => {
    test('Anthropic API + OpenAI API + Gemini API all respond', async () => {
      const ok = await requireProviders(win, [
        { providerId: 'anthropic', voiceType: 'api', label: 'Anthropic API' },
        { providerId: 'openai', voiceType: 'api', label: 'OpenAI API' },
        { providerId: 'gemini', voiceType: 'api', label: 'Gemini API' },
      ]);
      if (!ok) return;

      await buildCompositionLive(win, pause, longPause, 'Live API Trio', [
        { providerId: 'anthropic', voiceType: 'api', displayName: 'Anthropic API', model: LIVE_TEST_MODELS.anthropic },
        { providerId: 'openai', voiceType: 'api', displayName: 'OpenAI API', model: LIVE_TEST_MODELS.openai },
        { providerId: 'gemini', voiceType: 'api', displayName: 'Gemini API', model: LIVE_TEST_MODELS.gemini },
      ]);
      await startSession(win, pause, 'Live API Trio', 'API Trio Session');
      await expandSidebarAndAssertVoiceTypes(win, pause, [
        { displayName: 'Anthropic API', voiceType: 'api' },
        { displayName: 'OpenAI API', voiceType: 'api' },
        { displayName: 'Gemini API', voiceType: 'api' },
      ]);

      await win
        .getByPlaceholder('Message the ensemble\u2026')
        .fill('Reply in one sentence and include the word "ensemble".');
      await pause();
      await win.keyboard.press('Enter');

      await waitForVoiceResponse(win, 'Anthropic API');
      await waitForVoiceResponse(win, 'OpenAI API');
      await waitForVoiceResponse(win, 'Gemini API');
      await assertMessageBubbleType(win, 'Anthropic API', 'api');
      await assertMessageBubbleType(win, 'OpenAI API', 'api');
      await assertMessageBubbleType(win, 'Gemini API', 'api');
      await waitForRoundIdle(win);
      await expect(win.locator('[role="alert"]')).not.toBeVisible();
      await longPause();
    });
  });

  // ── Scenario 2: Multi-voice broadcast — CLI trio ────────────────────────────

  test.describe.serial('multi-voice broadcast — CLI trio', () => {
    test('Anthropic CLI + OpenAI CLI + Copilot CLI all respond', async () => {
      const ok = await requireProviders(win, [
        { providerId: 'anthropic', voiceType: 'cli', cliCommand: 'claude', label: 'Anthropic CLI' },
        { providerId: 'openai', voiceType: 'cli', cliCommand: 'codex', label: 'OpenAI CLI' },
        { providerId: 'copilot', voiceType: 'cli', cliCommand: 'copilot', label: 'Copilot CLI' },
      ]);
      if (!ok) return;

      await buildCompositionLive(win, pause, longPause, 'Live CLI Trio', [
        { providerId: 'anthropic', voiceType: 'cli', displayName: 'Anthropic CLI' },
        { providerId: 'openai', voiceType: 'cli', displayName: 'OpenAI CLI' },
        { providerId: 'copilot', voiceType: 'cli', displayName: 'Copilot CLI' },
      ]);
      await startSession(win, pause, 'Live CLI Trio', 'CLI Trio Session');
      await expandSidebarAndAssertVoiceTypes(win, pause, [
        { displayName: 'Anthropic CLI', voiceType: 'cli' },
        { displayName: 'OpenAI CLI', voiceType: 'cli' },
        { displayName: 'Copilot CLI', voiceType: 'cli' },
      ]);

      await win
        .getByPlaceholder('Message the ensemble\u2026')
        .fill('Reply in one sentence and include the word "subprocess".');
      await pause();
      await win.keyboard.press('Enter');

      await waitForVoiceResponse(win, 'Anthropic CLI');
      await waitForVoiceResponse(win, 'OpenAI CLI');
      await waitForVoiceResponse(win, 'Copilot CLI');
      await assertMessageBubbleType(win, 'Anthropic CLI', 'cli');
      await assertMessageBubbleType(win, 'OpenAI CLI', 'cli');
      await assertMessageBubbleType(win, 'Copilot CLI', 'cli');
      await waitForRoundIdle(win);
      await expect(win.locator('[role="alert"]')).not.toBeVisible();
      await longPause();
    });
  });

  // ── Scenario 3: Mixed API+CLI broadcast — multi-round ──────────────────────

  test.describe.serial('mixed API+CLI broadcast — multi-round', () => {
    test('Anthropic API + Copilot CLI respond across two rounds', async () => {
      const ok = await requireProviders(win, [
        { providerId: 'anthropic', voiceType: 'api', label: 'Anthropic API' },
        { providerId: 'copilot', voiceType: 'cli', cliCommand: 'copilot', label: 'Copilot CLI' },
      ]);
      if (!ok) return;

      await buildCompositionLive(win, pause, longPause, 'Live Mix Duo', [
        { providerId: 'anthropic', voiceType: 'api', displayName: 'Anthropic API', model: LIVE_TEST_MODELS.anthropic },
        { providerId: 'copilot', voiceType: 'cli', displayName: 'Copilot CLI' },
      ]);
      await startSession(win, pause, 'Live Mix Duo', 'Mix Duo Session');
      await expandSidebarAndAssertVoiceTypes(win, pause, [
        { displayName: 'Anthropic API', voiceType: 'api' },
        { displayName: 'Copilot CLI', voiceType: 'cli' },
      ]);

      // Round 1
      await win
        .getByPlaceholder('Message the ensemble\u2026')
        .fill('Reply in one sentence and include the word "first".');
      await pause();
      await win.keyboard.press('Enter');
      await waitForVoiceResponse(win, 'Anthropic API');
      await waitForVoiceResponse(win, 'Copilot CLI');
      await assertMessageBubbleType(win, 'Anthropic API', 'api');
      await assertMessageBubbleType(win, 'Copilot CLI', 'cli');
      await waitForRoundIdle(win);
      await longPause();

      // Round 2
      await win
        .getByPlaceholder('Message the ensemble\u2026')
        .fill('Reply in one sentence and include the word "second".');
      await pause();
      await win.keyboard.press('Enter');

      // Assert round 2 articles exist (count = 2 total for each voice)
      await expect(
        win.locator('[role="article"][aria-label*="Anthropic API"]').filter({ hasText: /\S/ }),
      ).toHaveCount(2, { timeout: 90_000 });
      await expect(
        win.locator('[role="article"][aria-label*="Copilot CLI"]').filter({ hasText: /\S/ }),
      ).toHaveCount(2, { timeout: 90_000 });
      await waitForRoundIdle(win);
      await expect(win.locator('[role="alert"]')).not.toBeVisible();
      await longPause();
    });
  });

  // ── Scenario 4: Mixed conductor routing ────────────────────────────────────

  test.describe.serial('mixed conductor routing', () => {
    test('@Anthropic API only responds, then @Copilot CLI only responds', async () => {
      const ok = await requireProviders(win, [
        { providerId: 'anthropic', voiceType: 'api', label: 'Anthropic API' },
        { providerId: 'copilot', voiceType: 'cli', cliCommand: 'copilot', label: 'Copilot CLI' },
      ]);
      if (!ok) return;

      await buildCompositionLive(
        win,
        pause,
        longPause,
        'Live Dir Mix',
        [
          { providerId: 'anthropic', voiceType: 'api', displayName: 'Anthropic API', model: LIVE_TEST_MODELS.anthropic },
          { providerId: 'copilot', voiceType: 'cli', displayName: 'Copilot CLI' },
        ],
        { mode: 'conductor' },
      );
      await startSession(win, pause, 'Live Dir Mix', 'Dir Mix Session');
      await expandSidebarAndAssertVoiceTypes(win, pause, [
        { displayName: 'Anthropic API', voiceType: 'api' },
        { displayName: 'Copilot CLI', voiceType: 'cli' },
      ]);

      // --- Round 1: target Anthropic API ---
      const anthropicBefore = await countVoiceResponses(win, 'Anthropic API');
      const copilotBefore = await countVoiceResponses(win, 'Copilot CLI');

      await win
        .getByPlaceholder('Message the ensemble\u2026')
        .fill('@Anthropic API Reply in one sentence and include the word "alpha".');
      await pause();
      await win.keyboard.press('Enter');

      await waitForVoiceResponse(win, 'Anthropic API');
      await assertMessageBubbleType(win, 'Anthropic API', 'api');
      await waitForRoundIdle(win);
      await longPause();

      // Assert Anthropic API responded (count increased) and Copilot CLI stayed silent
      await expect(
        win.locator('[role="article"][aria-label*="Anthropic API"]').filter({ hasText: /\S/ }),
      ).toHaveCount(anthropicBefore + 1, { timeout: 10_000 });
      const copilotAfterRound1 = await countVoiceResponses(win, 'Copilot CLI');
      expect(copilotAfterRound1).toBe(copilotBefore);
      await longPause();

      // --- Round 2: target Copilot CLI ---
      const anthropicBefore2 = await countVoiceResponses(win, 'Anthropic API');

      await win
        .getByPlaceholder('Message the ensemble\u2026')
        .fill('@Copilot CLI Reply in one sentence and include the word "beta".');
      await pause();
      await win.keyboard.press('Enter');

      await waitForVoiceResponse(win, 'Copilot CLI');
      await assertMessageBubbleType(win, 'Copilot CLI', 'cli');
      await waitForRoundIdle(win);
      await longPause();

      // Assert Copilot CLI responded and Anthropic API stayed silent
      await expect(
        win.locator('[role="article"][aria-label*="Copilot CLI"]').filter({ hasText: /\S/ }),
      ).toHaveCount(copilotAfterRound1 + 1, { timeout: 10_000 });
      const anthropicAfterRound2 = await countVoiceResponses(win, 'Anthropic API');
      expect(anthropicAfterRound2).toBe(anthropicBefore2);

      await expect(win.locator('[role="alert"]')).not.toBeVisible();
      await longPause();
    });
  });
});
