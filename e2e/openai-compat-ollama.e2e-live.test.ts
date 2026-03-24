/**
 * Live e2e tests for user-defined OpenAI-compatible voice providers.
 *
 * Prerequisites:
 *   - Ollama running (native install recommended for Metal GPU) or Docker
 *   - Run via: make test-e2e-compat-live
 *
 * Test coverage:
 *   - Dashboard: custom providers appear in the Providers section with an API status pill
 *   - Directed mode: two custom voices, @mention routes only to the targeted voice
 *   - Broadcast mode: two custom voices, both respond to an unmentioned message
 *   - Voice-level system prompt: response follows per-voice instruction
 *   - Restart/resume: sessions and providers persist across an app restart
 */

import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { startOllama, stopOllama } from './helpers/dockerHelpers';
import {
  goToCustomProvidersSection,
  addCustomProvider,
  buildComposition,
  startSession,
} from './helpers/openaiCompatHelpers';
import { launchApp, makeTempDir, skipOnboarding, goToHome } from './helpers';

const STEP_PAUSE = 1_000;
const LONG_PAUSE = 3_000;

function makePause(win: Page) {
  return {
    pause: () => win.waitForTimeout(STEP_PAUSE),
    longPause: () => win.waitForTimeout(LONG_PAUSE),
  };
}

// ── Shared Ollama lifecycle ───────────────────────────────────────────────────

test.beforeAll(async () => {
  await startOllama();
});

test.afterAll(async () => {
  await stopOllama();
});

// Shared across both describe blocks so restart-persistence can reuse the same data dir
let sharedDir: string;

// ── Live conversations ────────────────────────────────────────────────────────

test.describe('two custom voices — live conversations', () => {
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

    // Add both custom providers (same URL/model, different names)
    await goToCustomProvidersSection(win);
    await addCustomProvider(win, pause, longPause, 'Alpha');
    await addCustomProvider(win, pause, longPause, 'Beta');
  });

  test.afterAll(async () => {
    await app?.close().catch(() => {});
  });

  test('custom providers appear on the dashboard with an API status pill', async () => {
    await goToHome(win);
    await pause();

    // The dashboard "Providers" section heading must be visible
    await expect(win.locator('h2').filter({ hasText: /providers/i })).toBeVisible({ timeout: 5_000 });

    // Each custom provider card shows the provider name and an "API" status pill.
    // Match the card div by requiring both a name-span and an API-span as descendants.
    for (const name of ['Alpha', 'Beta']) {
      const card = win
        .locator('div')
        .filter({ has: win.locator('span').filter({ hasText: new RegExp(`^${name}$`) }) })
        .filter({ has: win.locator('span').filter({ hasText: /^API$/ }) })
        .first();
      await expect(card).toBeVisible({ timeout: 5_000 });
    }
  });

  test('directed mode: @mention routes only to targeted voice', async () => {
    await buildComposition(
      win, pause, longPause,
      'Directed Duo',
      [/Select Alpha provider/i, /Select Beta provider/i],
      { mode: 'conductor', colors: ['pink', 'amber'] },
    );

    await startSession(win, pause, /Directed Duo/i, 'Directed Session');

    // ── Round 1: message Alpha only ──────────────────────────────────────────
    await win.getByPlaceholder('Message the ensemble\u2026').fill('@Alpha What is the capital of France?');
    await pause();
    await win.keyboard.press('Enter');

    await expect(win.getByRole('article', { name: /Message from Alpha/i })).toBeVisible({ timeout: 60_000 });
    await expect(win.getByPlaceholder('Message the ensemble\u2026')).toBeVisible({ timeout: 60_000 });
    await longPause();

    // Beta must NOT respond to an Alpha-only message
    await expect(win.getByRole('article', { name: /Message from Beta/i })).not.toBeVisible();

    // ── Round 2: message Beta only ───────────────────────────────────────────
    await win.getByPlaceholder('Message the ensemble\u2026').fill('@Beta What is the capital of Japan?');
    await pause();
    await win.keyboard.press('Enter');

    await expect(win.getByRole('article', { name: /Message from Beta/i })).toBeVisible({ timeout: 60_000 });
    await expect(win.getByPlaceholder('Message the ensemble\u2026')).toBeVisible({ timeout: 60_000 });
    await longPause();

    // Alpha must NOT have produced a second response bubble during the Beta-only round
    await expect(win.getByRole('article', { name: /Message from Alpha/i })).toHaveCount(1);
  });

  test('broadcast mode: both voices respond', async () => {
    await buildComposition(
      win, pause, longPause,
      'Broadcast Duo',
      [/Select Alpha provider/i, /Select Beta provider/i],
      { mode: 'broadcast', colors: ['pink', 'amber'] },
    );

    await startSession(win, pause, /Broadcast Duo/i, 'Broadcast Session');

    await win.getByPlaceholder('Message the ensemble\u2026').fill('What is 2+2?');
    await pause();
    await win.keyboard.press('Enter');

    // Both voice response bubbles should appear in the message feed
    await expect(win.getByRole('article', { name: /Message from Alpha/i })).toBeVisible({ timeout: 60_000 });
    await expect(win.getByRole('article', { name: /Message from Beta/i })).toBeVisible({ timeout: 60_000 });
    await longPause();
  });

  test('broadcast — prompt me continuation: allow triggers round 2, dismiss clears banner', async () => {
    await buildComposition(
      win, pause, longPause,
      'Prompt Me Duo',
      [/Select Alpha provider/i, /Select Beta provider/i],
      { mode: 'broadcast', colors: ['pink', 'amber'], continuationPolicy: 'prompt' },
    );

    await startSession(win, pause, /Prompt Me Duo/i, 'Prompt Me Session');

    await win.getByPlaceholder('Message the ensemble\u2026').fill('What is 3+3?');
    await pause();
    await win.keyboard.press('Enter');

    // Round 1 — both voices respond
    await expect(win.getByRole('article', { name: /Message from Alpha/i })).toBeVisible({ timeout: 60_000 });
    await expect(win.getByRole('article', { name: /Message from Beta/i })).toBeVisible({ timeout: 60_000 });
    await longPause();

    // Nudge banner appears with Yes and Dismiss buttons
    await expect(win.getByText(/let the voices go another round/i)).toBeVisible({ timeout: 10_000 });
    await expect(win.getByRole('button', { name: /yes/i })).toBeVisible();
    await expect(win.getByRole('button', { name: /dismiss/i })).toBeVisible();

    // Yes path — round 2 fires
    await win.getByRole('button', { name: /yes/i }).click();
    await expect(win.getByRole('article', { name: /Message from Alpha/i })).toHaveCount(2, { timeout: 60_000 });
    await expect(win.getByRole('article', { name: /Message from Beta/i })).toHaveCount(2, { timeout: 60_000 });
    await longPause();

    // Nudge reappears after round 2 — dismiss it
    await expect(win.getByText(/let the voices go another round/i)).toBeVisible({ timeout: 10_000 });
    await win.getByRole('button', { name: /dismiss/i }).click();
    await pause();
    await expect(win.getByText(/let the voices go another round/i)).not.toBeVisible();
    await expect(win.getByPlaceholder('Message the ensemble\u2026')).toBeVisible();
  });

  test('broadcast — auto continuation: second round fires automatically', async () => {
    await buildComposition(
      win, pause, longPause,
      'Auto Duo',
      [/Select Alpha provider/i, /Select Beta provider/i],
      {
        mode: 'broadcast',
        colors: ['pink', 'amber'],
        continuationPolicy: 'auto',
        continuationMaxRounds: 2,
        systemPrompts: [
          'Always end every response with the sentence: Beta also knows about this.',
          'Always end every response with the sentence: Alpha also knows about this.',
        ],
      },
    );

    await startSession(win, pause, /Auto Duo/i, 'Auto Session');

    await win.getByPlaceholder('Message the ensemble\u2026').fill('What is 4+4?');
    await pause();
    await win.keyboard.press('Enter');

    // First round — both voices respond
    await expect(win.getByRole('article', { name: /Message from Alpha/i })).toBeVisible({ timeout: 60_000 });
    await expect(win.getByRole('article', { name: /Message from Beta/i })).toBeVisible({ timeout: 60_000 });

    // Auto continuation should trigger a second round — at least one voice gets a second bubble
    await expect(
      win.getByRole('article', { name: /Message from (Alpha|Beta)/i }).nth(2),
    ).toBeVisible({ timeout: 90_000 });
    await longPause();
  });

  test('voice-level system prompt', async () => {
    await buildComposition(
      win, pause, longPause,
      'Prompt Test',
      [/Select Alpha provider/i],
      {
        mode: 'conductor',
        colors: ['pink'],
        systemPrompts: ['Always begin every response with the word Ahoy.'],
      },
    );

    await startSession(win, pause, /Prompt Test/i, 'Prompt Session');

    await win.getByPlaceholder('Message the ensemble\u2026').fill('@Alpha Introduce yourself.');
    await pause();
    await win.keyboard.press('Enter');

    await expect(win.getByRole('article', { name: /Message from Alpha/i })).toBeVisible({ timeout: 60_000 });
    await expect(win.getByPlaceholder('Message the ensemble\u2026')).toBeVisible({ timeout: 60_000 });
    await longPause();

    // Assert "Ahoy" appears in Alpha's response bubble specifically — not just anywhere on the page
    // Fallback: if the model ignores the system prompt, assert the bubble is non-empty and
    // visible — see sprint 012 risks. Document here if changed.
    await expect(win.getByRole('article', { name: /Message from Alpha/i })).toContainText(
      /ahoy/i,
      { timeout: 60_000 },
    );
  });
});

// ── Restart persistence ───────────────────────────────────────────────────────
//
// This describe deliberately depends on sharedDir populated by the live-conversations
// describe above. If the first describe fails, this test is expected to fail too.
// This coupling is intentional — it simulates a real restart scenario.

test.describe('restart persistence', () => {
  test('sessions and providers persist after app restart', async () => {
    const app = await launchApp({ POLYPHON_TEST_USER_DATA: sharedDir, POLYPHON_SHOW_WINDOW: '1' });
    const win = await app.firstWindow();
    await win.waitForLoadState('domcontentloaded');
    await skipOnboarding(win);

    const { pause, longPause } = makePause(win);
    await pause();

    // Both sessions from prior tests should still be listed
    await win.getByRole('button', { name: /sessions/i }).click();
    await pause();
    const nav = win.getByRole('navigation');
    await expect(nav.getByText('Directed Session')).toBeVisible({ timeout: 5_000 });
    await expect(nav.getByText('Broadcast Session')).toBeVisible({ timeout: 5_000 });
    await longPause();

    // Open the broadcast session and verify the message history is intact
    await nav.getByText('Broadcast Session').click();
    await pause();
    await expect(win.getByText('What is 2+2?')).toBeVisible({ timeout: 5_000 });
    await longPause();

    // Custom providers should still be present in Settings
    await goToCustomProvidersSection(win);
    const providersSection = win.getByLabel('Providers');
    await expect(providersSection.getByText('Alpha', { exact: true })).toBeVisible({ timeout: 5_000 });
    await expect(providersSection.getByText('Beta', { exact: true })).toBeVisible({ timeout: 5_000 });
    await longPause();

    await app.close().catch(() => {});
  });
});
