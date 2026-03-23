/**
 * Live e2e tests for CLI voice providers (Anthropic CLI, OpenAI CLI, Copilot CLI).
 *
 * Each test skips gracefully when the required CLI binary is not available.
 * Run via: make test-e2e-cli-live
 *
 * Scenarios:
 *   1. Multi-voice broadcast — CLI trio (Anthropic CLI + OpenAI CLI + Copilot CLI)
 *   2. Broadcast with "Prompt me" continuation — nudge appears, Allow triggers round 2
 *   3. Broadcast with "Auto" continuation — round cap enforced for maxRounds = 1, 2, and 3
 *   4. Conductor routing — @mention directed (Anthropic CLI + Copilot CLI, 2 directed rounds)
 *   5. Transcript export — session exported to markdown, json, and plaintext without dialog
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, makeTempDir, skipOnboarding, goToProvidersTab } from './helpers';
import {
  makePause,
  enableProvider,
  requireProviders,
  buildCompositionLive,
  expandSidebarAndAssertVoiceTypes,
  waitForVoiceResponse,
  waitForRoundIdle,
  countVoiceResponses,
  startSession,
} from './helpers/liveHelpers';

// Shared across the live-conversations and restart-persistence describes so the
// restart test can reuse the same data directory.
let sharedDir: string;

test.describe.serial('CLI providers', () => {
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

    for (const id of ['anthropic', 'openai', 'copilot']) {
      await enableProvider(win, id, 'cli');
    }

    await goToProvidersTab(win);
    await pause();
  });

  test.afterAll(async () => {
    await app?.close().catch(() => {});
  });

  // ── Scenario 1: Multi-voice broadcast — CLI trio ────────────────────────────

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
      await waitForRoundIdle(win);
      await expect(win.locator('[role="alert"]')).not.toBeVisible();
      await longPause();
    });
  });

  // ── Scenario 2: Broadcast with "Prompt me" continuation ────────────────────

  test.describe.serial('broadcast — prompt continuation', () => {
    test('continuation nudge appears and second round fires after Allow', async () => {
      const ok = await requireProviders(win, [
        { providerId: 'anthropic', voiceType: 'cli', cliCommand: 'claude', label: 'Anthropic CLI' },
        { providerId: 'openai', voiceType: 'cli', cliCommand: 'codex', label: 'OpenAI CLI' },
      ]);
      if (!ok) return;

      await buildCompositionLive(
        win,
        pause,
        longPause,
        'Live CLI Prompt Cont',
        [
          { providerId: 'anthropic', voiceType: 'cli', displayName: 'Anthropic CLI Prompt' },
          { providerId: 'openai', voiceType: 'cli', displayName: 'OpenAI CLI Prompt' },
        ],
        { mode: 'broadcast', continuationPolicy: 'prompt' },
      );
      await startSession(win, pause, 'Live CLI Prompt Cont', 'CLI Prompt Cont Session');
      await expandSidebarAndAssertVoiceTypes(win, pause, [
        { displayName: 'Anthropic CLI Prompt', voiceType: 'cli' },
        { displayName: 'OpenAI CLI Prompt', voiceType: 'cli' },
      ]);

      await win
        .getByPlaceholder('Message the ensemble\u2026')
        .fill('Reply in one sentence and include the word "first".');
      await pause();
      await win.keyboard.press('Enter');

      // Round 1
      await waitForVoiceResponse(win, 'Anthropic CLI Prompt');
      await waitForVoiceResponse(win, 'OpenAI CLI Prompt');
      await waitForRoundIdle(win);

      // Continuation nudge must appear
      await expect(win.getByText(/let the voices go another round/i)).toBeVisible({ timeout: 10_000 });
      await win.getByRole('button', { name: 'Yes' }).click();
      await longPause();

      // Round 2 fires
      await expect(
        win.locator('[role="article"][aria-label*="Anthropic CLI Prompt"]').filter({ hasText: /\S/ }),
      ).toHaveCount(2, { timeout: 90_000 });
      await expect(
        win.locator('[role="article"][aria-label*="OpenAI CLI Prompt"]').filter({ hasText: /\S/ }),
      ).toHaveCount(2, { timeout: 90_000 });
      await waitForRoundIdle(win);
      await expect(win.locator('[role="alert"]')).not.toBeVisible();
      await longPause();
    });
  });

  // ── Scenario 3: Broadcast with "Auto" continuation — round cap enforcement ──
  //
  // maxRounds semantics (from SessionManager):
  //   maxDepth = continuationMaxRounds - 1
  //   auto fires when depth < maxDepth (initial send is depth 0)
  //
  //   maxRounds = 1 → maxDepth = 0 → condition never satisfied → 1 response set
  //   maxRounds = 2 → maxDepth = 1 → fires once   → 2 response sets
  //   maxRounds = 3 → maxDepth = 2 → fires twice  → 3 response sets

  test.describe.serial('broadcast — auto continuation', () => {
    async function runAutoRoundsTest(
      maxRounds: 1 | 2 | 3,
      compositionName: string,
      sessionName: string,
      voiceA: string,
      voiceB: string,
    ): Promise<void> {
      const ok = await requireProviders(win, [
        { providerId: 'anthropic', voiceType: 'cli', cliCommand: 'claude', label: 'Anthropic CLI' },
        { providerId: 'openai', voiceType: 'cli', cliCommand: 'codex', label: 'OpenAI CLI' },
      ]);
      if (!ok) return;

      await buildCompositionLive(
        win,
        pause,
        longPause,
        compositionName,
        [
          { providerId: 'anthropic', voiceType: 'cli', displayName: voiceA },
          { providerId: 'openai', voiceType: 'cli', displayName: voiceB },
        ],
        { mode: 'broadcast', continuationPolicy: 'auto', continuationMaxRounds: maxRounds },
      );
      await startSession(win, pause, compositionName, sessionName);
      await expandSidebarAndAssertVoiceTypes(win, pause, [
        { displayName: voiceA, voiceType: 'cli' },
        { displayName: voiceB, voiceType: 'cli' },
      ]);

      await win
        .getByPlaceholder('Message the ensemble\u2026')
        .fill('Reply in one sentence only.');
      await pause();
      await win.keyboard.press('Enter');

      const perRoundTimeout = 90_000;
      const totalTimeout = maxRounds * perRoundTimeout;

      await expect(
        win.locator(`[role="article"][aria-label*="${voiceA}"]`).filter({ hasText: /\S/ }),
      ).toHaveCount(maxRounds, { timeout: totalTimeout });
      await expect(
        win.locator(`[role="article"][aria-label*="${voiceB}"]`).filter({ hasText: /\S/ }),
      ).toHaveCount(maxRounds, { timeout: totalTimeout });

      await waitForRoundIdle(win);

      expect(await countVoiceResponses(win, voiceA)).toBe(maxRounds);
      expect(await countVoiceResponses(win, voiceB)).toBe(maxRounds);

      await expect(win.locator('[role="alert"]')).not.toBeVisible();
      await longPause();
    }

    test('maxRounds=1: exactly 1 response set, no auto continuation fires', async () => {
      await runAutoRoundsTest(1, 'Live CLI Auto 1R', 'CLI Auto 1R Session', 'Anthropic CLI Auto 1R', 'OpenAI CLI Auto 1R');
    });

    test('maxRounds=2: exactly 2 response sets, 1 auto continuation fires', async () => {
      await runAutoRoundsTest(2, 'Live CLI Auto 2R', 'CLI Auto 2R Session', 'Anthropic CLI Auto 2R', 'OpenAI CLI Auto 2R');
    });

    test('maxRounds=3: exactly 3 response sets, 2 auto continuations fire', async () => {
      await runAutoRoundsTest(3, 'Live CLI Auto 3R', 'CLI Auto 3R Session', 'Anthropic CLI Auto 3R', 'OpenAI CLI Auto 3R');
    });
  });

  // ── Scenario 4: Conductor routing ──────────────────────────────────────────

  test.describe.serial('conductor routing', () => {
    test('@Anthropic CLI only responds, then @Copilot CLI only responds', async () => {
      const ok = await requireProviders(win, [
        { providerId: 'anthropic', voiceType: 'cli', cliCommand: 'claude', label: 'Anthropic CLI' },
        { providerId: 'copilot', voiceType: 'cli', cliCommand: 'copilot', label: 'Copilot CLI' },
      ]);
      if (!ok) return;

      await buildCompositionLive(
        win,
        pause,
        longPause,
        'Live CLI Dir',
        [
          { providerId: 'anthropic', voiceType: 'cli', displayName: 'Anthropic CLI' },
          { providerId: 'copilot', voiceType: 'cli', displayName: 'Copilot CLI' },
        ],
        { mode: 'conductor' },
      );
      await startSession(win, pause, 'Live CLI Dir', 'CLI Dir Session');
      await expandSidebarAndAssertVoiceTypes(win, pause, [
        { displayName: 'Anthropic CLI', voiceType: 'cli' },
        { displayName: 'Copilot CLI', voiceType: 'cli' },
      ]);

      // --- Round 1: target Anthropic CLI ---
      const anthropicBefore = await countVoiceResponses(win, 'Anthropic CLI');
      const copilotBefore = await countVoiceResponses(win, 'Copilot CLI');

      await win
        .getByPlaceholder('Message the ensemble\u2026')
        .fill('@Anthropic CLI Reply in one sentence and include the word "alpha".');
      await pause();
      await win.keyboard.press('Enter');

      await waitForVoiceResponse(win, 'Anthropic CLI');
      await waitForRoundIdle(win);
      await longPause();

      await expect(
        win.locator('[role="article"][aria-label*="Anthropic CLI"]').filter({ hasText: /\S/ }),
      ).toHaveCount(anthropicBefore + 1, { timeout: 10_000 });
      const copilotAfterRound1 = await countVoiceResponses(win, 'Copilot CLI');
      expect(copilotAfterRound1).toBe(copilotBefore);
      await longPause();

      // --- Round 2: target Copilot CLI ---
      const anthropicBefore2 = await countVoiceResponses(win, 'Anthropic CLI');

      await win
        .getByPlaceholder('Message the ensemble\u2026')
        .fill('@Copilot CLI Reply in one sentence and include the word "beta".');
      await pause();
      await win.keyboard.press('Enter');

      await waitForVoiceResponse(win, 'Copilot CLI');
      await waitForRoundIdle(win);
      await longPause();

      await expect(
        win.locator('[role="article"][aria-label*="Copilot CLI"]').filter({ hasText: /\S/ }),
      ).toHaveCount(copilotAfterRound1 + 1, { timeout: 10_000 });
      const anthropicAfterRound2 = await countVoiceResponses(win, 'Anthropic CLI');
      expect(anthropicAfterRound2).toBe(anthropicBefore2);

      await expect(win.locator('[role="alert"]')).not.toBeVisible();
      await longPause();
    });
  });

  // ── Scenario 5: Transcript export ────────────────────────────────────────────
  //
  // Reuses the CLI Trio Session from Scenario 1. Exports it to all three formats
  // via the IPC savePath bypass (no native dialog). Asserts files exist, are
  // non-empty, and that the JSON export parses with a non-empty messages array.

  test.describe.serial('transcript export', () => {
    test('exports session to markdown, json, and plaintext without dialog', async () => {
      const sessions: Array<{ id: string; name: string }> = await win.evaluate(
        () => window.polyphon.session.list(),
      );
      const session = sessions.find((s) => s.name === 'CLI Trio Session');
      if (!session) {
        test.skip(true, '"CLI Trio Session" not found — CLI trio test was skipped');
        return;
      }

      const exportDir = makeTempDir();

      for (const format of ['markdown', 'json', 'plaintext'] as const) {
        const ext = format === 'json' ? 'json' : format === 'markdown' ? 'md' : 'txt';
        const savePath = path.join(exportDir, `export.${ext}`);

        const result: { ok: boolean; error?: string } = await win.evaluate(
          async ({ sessionId, fmt, sp }) =>
            window.polyphon.session.export(sessionId, fmt as 'markdown' | 'json' | 'plaintext', sp),
          { sessionId: session.id, fmt: format, sp: savePath },
        );

        expect(result.ok).toBe(true);
        expect(fs.existsSync(savePath)).toBe(true);
        const content = fs.readFileSync(savePath, 'utf-8');
        expect(content.length).toBeGreaterThan(0);

        if (format === 'json') {
          const parsed = JSON.parse(content) as { messages: unknown[] };
          expect(Array.isArray(parsed.messages)).toBe(true);
          expect(parsed.messages.length).toBeGreaterThan(0);
        }
      }

      await longPause();
    });
  });
});

// ── Restart persistence ───────────────────────────────────────────────────────
//
// Deliberately depends on sharedDir populated by the CLI providers describe above.
// If all CLI provider tests were skipped, this test skips too.

test.describe('restart persistence — CLI', () => {
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
      { name: 'CLI Trio Session', message: 'Reply in one sentence and include the word "subprocess".' },
      { name: 'CLI Prompt Cont Session', message: 'Reply in one sentence and include the word "first".' },
    ];

    let found: { name: string; message: string } | null = null;
    for (const candidate of candidateSessions) {
      if (await nav.getByText(candidate.name).isVisible()) {
        found = candidate;
        break;
      }
    }

    if (!found) {
      test.skip(true, 'No live CLI sessions were created — all CLI provider tests were skipped');
      await app.close().catch(() => {});
      return;
    }

    await nav.getByText(found.name).click();
    await pause();

    await expect(win.getByText(found.message)).toBeVisible({ timeout: 5_000 });
    await longPause();

    await app.close().catch(() => {});
  });
});
