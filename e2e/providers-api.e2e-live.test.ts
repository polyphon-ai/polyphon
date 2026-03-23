/**
 * Live e2e tests for API voice providers (Anthropic, OpenAI, Gemini).
 *
 * Each test skips gracefully when the required API key is not available.
 * Run via: make test-e2e-api-live
 *
 * Scenarios:
 *   1. Multi-voice broadcast — API trio (Anthropic API + OpenAI API + Gemini API)
 *   2. Tool use — Anthropic API reads a sentinel file via read_file + list_directory
 *   3. Sandboxed tool rejection — Anthropic API cannot read outside the working dir
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, makeTempDir, skipOnboarding, goToProvidersTab } from './helpers';
import {
  makePause,
  LIVE_TEST_MODELS,
  enableProvider,
  isApiKeyAvailable,
  requireProviders,
  buildCompositionLive,
  expandSidebarAndAssertVoiceTypes,
  waitForVoiceResponse,
  waitForRoundIdle,
  startSession,
} from './helpers/liveHelpers';

// Shared across the live-conversations and restart-persistence describes so the
// restart test can reuse the same data directory.
let sharedDir: string;

test.describe.serial('API providers', () => {
  let app: ElectronApplication;
  let win: Page;
  let pause: () => Promise<void>;
  let longPause: () => Promise<void>;

  test.beforeAll(async () => {
    sharedDir = makeTempDir();
    app = await launchApp({ POLYPHON_TEST_USER_DATA: sharedDir, POLYPHON_SHOW_WINDOW: '1' });
    win = await app.firstWindow();
    await win.waitForLoadState('domcontentloaded');
    await skipOnboarding(win);

    ({ pause, longPause } = makePause(win));
    await pause();

    for (const id of ['anthropic', 'openai', 'gemini']) {
      await enableProvider(win, id, 'api');
    }

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

      const listResult = await win.evaluate(
        async (id: string) => window.polyphon.settings.fetchModels(id),
        providerId,
      );
      const models: string[] = listResult?.models ?? [];
      if (!models.includes(model)) {
        throw new Error(
          `Preflight failed for ${providerId}: model "${model}" was not found in the API model list.\n` +
          `Available models: ${models.join(', ')}\n` +
          `The model may have been deprecated or renamed. Update LIVE_TEST_MODELS in e2e/helpers/liveHelpers.ts.`,
        );
      }

      const probeResult = await win.evaluate(
        async ({ id, m }: { id: string; m: string }) =>
          window.polyphon.settings.probeModel(id, m),
        { id: providerId, m: model },
      );
      if (!probeResult.ok) {
        throw new Error(
          `Preflight failed for ${providerId}: model "${model}" returned an error on a test prompt.\n` +
          `Error: ${(probeResult as { ok: false; error: string }).error}\n` +
          `The model may be restricted or unavailable. Update LIVE_TEST_MODELS in e2e/helpers/liveHelpers.ts.`,
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
      await waitForRoundIdle(win);
      await expect(win.locator('[role="alert"]')).not.toBeVisible();
      await longPause();
    });
  });

  // ── Scenario 2: Tool use — API voice reads a real file ──────────────────────
  //
  // Creates a temp dir with a known sentinel file. Anthropic API is given
  // list_directory + read_file tools and asked to list the dir and read the file.
  // Asserts the sentinel value appears in the response, proving the tool-use loop
  // executed end-to-end against a real provider.

  test.describe.serial('tool use — read_file + list_directory', () => {
    test('Anthropic API reads a sentinel file via tool call', async () => {
      test.setTimeout(300_000);
      const ok = await requireProviders(win, [
        { providerId: 'anthropic', voiceType: 'api', label: 'Anthropic API' },
      ]);
      if (!ok) return;

      const toolDir = makeTempDir();
      fs.writeFileSync(path.join(toolDir, 'polyphon-test.txt'), 'POLYPHON_SENTINEL_12345');

      await buildCompositionLive(win, pause, longPause, 'Live Tool Read', [
        {
          providerId: 'anthropic',
          voiceType: 'api',
          displayName: 'Anthropic Tool',
          model: LIVE_TEST_MODELS.anthropic,
          tools: ['Read File', 'List Directory'],
        },
      ]);

      await startSession(win, pause, 'Live Tool Read', 'Tool Read Session', { workingDir: toolDir });

      await win
        .getByPlaceholder('Message the ensemble\u2026')
        .fill(
          'Use the list_directory tool to list the working directory, then use the read_file tool to read polyphon-test.txt. Reply with its exact text content.',
        );
      await pause();
      await win.keyboard.press('Enter');

      await waitForVoiceResponse(win, 'Anthropic Tool');
      await waitForRoundIdle(win);

      await expect(
        win
          .locator('[role="article"][aria-label*="Anthropic Tool"]')
          .filter({ hasText: 'POLYPHON_SENTINEL_12345' }),
      ).toBeVisible({ timeout: 90_000 });

      await expect(win.locator('[role="alert"]')).not.toBeVisible();
      await longPause();
    });
  });

  // ── Scenario 3: Sandboxed tool rejection ────────────────────────────────────
  //
  // Creates a session with sandbox enabled. Anthropic API is given read_file and
  // asked to read /etc/hosts (outside the sandbox dir). The tool executor returns
  // an error; the voice response must not contain actual /etc/hosts content.

  test.describe.serial('tool use — sandboxed rejection', () => {
    test('Anthropic API cannot read outside the sandbox working dir', async () => {
      test.setTimeout(300_000);
      const ok = await requireProviders(win, [
        { providerId: 'anthropic', voiceType: 'api', label: 'Anthropic API' },
      ]);
      if (!ok) return;

      const sandboxDir = makeTempDir();

      await buildCompositionLive(win, pause, longPause, 'Live Tool Sandbox', [
        {
          providerId: 'anthropic',
          voiceType: 'api',
          displayName: 'Anthropic Sandbox',
          model: LIVE_TEST_MODELS.anthropic,
          tools: ['Read File'],
        },
      ]);

      await startSession(win, pause, 'Live Tool Sandbox', 'Sandbox Session', {
        workingDir: sandboxDir,
        sandboxed: true,
      });

      await win
        .getByPlaceholder('Message the ensemble\u2026')
        .fill('Use the read_file tool to read /etc/hosts and tell me its exact contents.');
      await pause();
      await win.keyboard.press('Enter');

      await waitForVoiceResponse(win, 'Anthropic Sandbox');
      await waitForRoundIdle(win);

      // /etc/hosts always contains this loopback line — it must NOT appear in the response.
      const article = win
        .locator('[role="article"][aria-label*="Anthropic Sandbox"]')
        .filter({ hasText: /\S/ })
        .first();
      await expect(article).not.toContainText('127.0.0.1');

      await expect(win.locator('[role="alert"]')).not.toBeVisible();
      await longPause();
    });
  });
});

// ── Restart persistence ───────────────────────────────────────────────────────
//
// Deliberately depends on sharedDir populated by the API providers describe above.
// If all API provider tests were skipped, this test skips too.

test.describe('restart persistence — API', () => {
  test('session messages are readable after app restart', async () => {
    const app = await launchApp({ POLYPHON_TEST_USER_DATA: sharedDir, POLYPHON_SHOW_WINDOW: '1' });
    const win = await app.firstWindow();
    await win.waitForLoadState('domcontentloaded');
    await skipOnboarding(win);

    const { pause, longPause } = makePause(win);
    await pause();

    await win.getByRole('button', { name: /sessions/i }).click();
    await pause();

    const nav = win.getByRole('navigation');

    const candidateSessions = [
      { name: 'API Trio Session', message: 'Reply in one sentence and include the word "ensemble".' },
      { name: 'Tool Read Session', message: 'Use the list_directory tool to list the working directory' },
    ];

    let found: { name: string; message: string } | null = null;
    for (const candidate of candidateSessions) {
      if (await nav.getByText(candidate.name).isVisible()) {
        found = candidate;
        break;
      }
    }

    if (!found) {
      test.skip(true, 'No live API sessions were created — all API provider tests were skipped');
      await app.close().catch(() => {});
      return;
    }

    await nav.getByText(found.name).click();
    await pause();

    await expect(win.getByText(found.message, { exact: false })).toBeVisible({ timeout: 5_000 });
    await longPause();

    await app.close().catch(() => {});
  });
});
