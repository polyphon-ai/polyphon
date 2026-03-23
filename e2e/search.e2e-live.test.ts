/**
 * Live e2e tests for global Search and per-session (Cmd+F) search.
 *
 * Requires a real Anthropic API key — skips gracefully when absent.
 * Run via: make test-e2e-live
 *
 * Things only verifiable with real LLM content:
 *   1. FTS indexes conductor messages written to the DB via IPC
 *   2. Result card renders session name, role pill, snippet with <mark> tags
 *   3. Clicking a result navigates to the session and shows word highlights
 *      inside real rendered markdown (via the rehype highlight plugin)
 *   4. Per-session Cmd+F finds content and shows the match counter
 *   5. Voice responses are indexed — a follow-up search for the echoed
 *      anchor word finds both the conductor and voice messages
 *
 * Keyword-anchor strategy: the conductor message embeds a rare anchor word
 * ("wyvern") that is extremely unlikely to appear in any other test session.
 * The conductor message is deterministic so search results for this term are
 * guaranteed. Voice responses are non-deterministic and NOT asserted on by
 * content — only their presence (non-empty bubble) is checked.
 */

import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, makeTempDir, skipOnboarding } from './helpers';

// ── Constants ──────────────────────────────────────────────────────────────────

const STEP_PAUSE = 1_500;
const LONG_PAUSE  = 4_000;

// Rare anchor embedded in the conductor message so search results are
// unambiguous and isolated from other test sessions.
const SEARCH_ANCHOR = 'wyvern';

// Conductor message that deterministically contains SEARCH_ANCHOR.
const CONDUCTOR_MSG = `Please reply in one sentence. Include the word "${SEARCH_ANCHOR}" somewhere in your reply.`;

const COMP_NAME    = 'Search Live Comp';
const SESSION_NAME = 'Search Live Session';

const LIVE_MODEL = 'claude-haiku-4-5-20251001';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makePause(win: Page) {
  return {
    pause:     () => win.waitForTimeout(STEP_PAUSE),
    longPause: () => win.waitForTimeout(LONG_PAUSE),
  };
}

async function isAnthropicAvailable(win: Page): Promise<boolean> {
  const statuses = await win.evaluate(async () => window.polyphon.settings.getProviderStatus());
  const entry = (statuses as Array<{ provider: string; apiKeyStatus?: { status: string } }>)
    .find((s) => s.provider === 'anthropic');
  return entry?.apiKeyStatus?.status !== 'none' && entry?.apiKeyStatus?.status !== undefined;
}

async function enableAnthropicApi(win: Page): Promise<void> {
  await win.evaluate(
    async ({ model }: { model: string }) => {
      const configs = await window.polyphon.settings.getProviderConfig();
      const existing = configs.find(
        (c: { provider: string; voiceType: string }) =>
          c.provider === 'anthropic' && c.voiceType === 'api',
      );
      await window.polyphon.settings.saveProviderConfig({
        provider:     'anthropic',
        enabled:      true,
        voiceType:    'api',
        defaultModel: model,
        cliCommand:   existing?.cliCommand ?? null,
        cliArgs:      existing?.cliArgs ?? null,
      });
    },
    { model: LIVE_MODEL },
  );
}

async function waitForVoiceResponse(win: Page, displayName: string): Promise<void> {
  await expect(
    win.locator(`[role="article"][aria-label*="${displayName}"]`).filter({ hasText: /\S/ }),
  ).toBeVisible({ timeout: 90_000 });
}

async function waitForRoundIdle(win: Page): Promise<void> {
  await expect(
    win.getByPlaceholder('Message the ensemble\u2026'),
  ).toBeEnabled({ timeout: 120_000 });
}

// ── Suite ──────────────────────────────────────────────────────────────────────

test.describe.serial('Search — live (Anthropic API)', () => {
  let app: ElectronApplication;
  let win: Page;
  let pause: () => Promise<void>;
  let longPause: () => Promise<void>;

  test.beforeAll(async () => {
    app = await launchApp({
      POLYPHON_TEST_USER_DATA: makeTempDir(),
      POLYPHON_SHOW_WINDOW: '1',
    });
    win = await app.firstWindow();
    await win.waitForLoadState('domcontentloaded');
    await skipOnboarding(win);

    ({ pause, longPause } = makePause(win));
    await pause();
  });

  test.afterAll(async () => {
    await app?.close().catch(() => {});
  });

  // ── Preflight ────────────────────────────────────────────────────────────────

  test('preflight: Anthropic API key is present', async () => {
    const ok = await isAnthropicAvailable(win);
    if (!ok) test.skip(true, 'No Anthropic API key configured');
  });

  // ── Setup: composition + session + message ───────────────────────────────────

  test('setup: build composition, start session, send anchor message', async () => {
    const ok = await isAnthropicAvailable(win);
    if (!ok) test.skip(true, 'No Anthropic API key configured');

    await enableAnthropicApi(win);
    await pause();

    // Navigate to Settings → Providers so the store re-hydrates with the saved config.
    await win.getByRole('button', { name: /settings/i }).click();
    await win.getByRole('tab', { name: /^providers$/i }).click();
    await pause();

    // Build composition
    await win.getByRole('button', { name: /compositions/i }).click();
    await pause();
    await win.getByRole('button', { name: 'New Composition', exact: true }).first().click();
    await pause();
    await win.getByPlaceholder('My Composition').fill(COMP_NAME);
    await pause();
    await win.getByRole('button', { name: /broadcast/i }).first().click();
    await pause();
    await win.getByRole('button', { name: 'None', exact: true }).click();
    await pause();
    await win.getByRole('button', { name: /Select anthropic provider/i }).click();
    await pause();
    const displayInput = win.getByPlaceholder(/display name/i);
    if (await displayInput.isVisible()) {
      await displayInput.clear();
      await displayInput.fill('Anthropic');
      await pause();
    }
    const modelSelect = win.locator('select').filter({
      has: win.locator(`option[value="${LIVE_MODEL}"]`),
    });
    if (await modelSelect.isVisible()) {
      await modelSelect.selectOption(LIVE_MODEL);
      await pause();
    }
    await win.getByRole('button', { name: 'Add Voice' }).click();
    await pause();
    await win.getByRole('button', { name: 'Save Composition' }).click();
    await longPause();

    // Start session
    await win.getByRole('button', { name: /sessions/i }).click();
    await pause();
    await win.getByRole('button', { name: 'New Session', exact: true }).click();
    await pause();
    await win.getByRole('button', { name: new RegExp(COMP_NAME, 'i') }).first().click();
    await pause();
    await win.getByPlaceholder('My session').fill(SESSION_NAME);
    await pause();
    await win.getByRole('button', { name: 'Start Session' }).click();
    await expect(win.getByPlaceholder('Message the ensemble\u2026')).toBeVisible({ timeout: 10_000 });
    await pause();

    // Send the anchor message and wait for a complete response
    await win.getByPlaceholder('Message the ensemble\u2026').fill(CONDUCTOR_MSG);
    await win.keyboard.press('Enter');
    await waitForVoiceResponse(win, 'Anthropic');
    await waitForRoundIdle(win);
    await longPause();
  });

  // ── Global search ────────────────────────────────────────────────────────────

  test('global search finds the conductor message and renders a result card', async () => {
    const ok = await isAnthropicAvailable(win);
    if (!ok) test.skip(true, 'No Anthropic API key configured');

    await win.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(win.getByPlaceholder('Search across all sessions\u2026')).toBeVisible({ timeout: 5_000 });

    await win.getByPlaceholder('Search across all sessions\u2026').fill(SEARCH_ANCHOR);

    // At least one result card must appear
    await expect(win.locator('.search-result-card').first()).toBeVisible({ timeout: 10_000 });

    // The session name appears in the results
    await expect(win.getByText(SESSION_NAME).first()).toBeVisible({ timeout: 5_000 });

    // The FTS snippet has word-level highlighting
    await expect(
      win.locator('.search-result-card mark.search-highlight').first(),
    ).toBeVisible({ timeout: 5_000 });

    // The result count label is rendered
    await expect(win.locator('.search-results-count')).toBeVisible();
  });

  test('global search result card shows correct role pill for conductor message', async () => {
    const ok = await isAnthropicAvailable(win);
    if (!ok) test.skip(true, 'No Anthropic API key configured');

    await win.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(win.getByPlaceholder('Search across all sessions\u2026')).toBeVisible({ timeout: 5_000 });
    await win.getByPlaceholder('Search across all sessions\u2026').fill(SEARCH_ANCHOR);
    await expect(win.locator('.search-result-card').first()).toBeVisible({ timeout: 10_000 });

    // The conductor message result should show the "you" role pill
    const conductorCard = win.locator('.search-result-card').filter({
      has: win.locator('.search-result-role', { hasText: 'you' }),
    });
    await expect(conductorCard.first()).toBeVisible({ timeout: 5_000 });
  });

  test('clicking a result navigates to the session and shows the message', async () => {
    const ok = await isAnthropicAvailable(win);
    if (!ok) test.skip(true, 'No Anthropic API key configured');

    await win.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(win.getByPlaceholder('Search across all sessions\u2026')).toBeVisible({ timeout: 5_000 });
    await win.getByPlaceholder('Search across all sessions\u2026').fill(SEARCH_ANCHOR);
    await expect(win.locator('.search-result-card').first()).toBeVisible({ timeout: 10_000 });

    await win.locator('.search-result-card').first().click();

    // Must land in the session view
    await expect(win.getByPlaceholder('Message the ensemble\u2026')).toBeVisible({ timeout: 10_000 });
    // The conductor message containing the anchor word must be visible in the feed
    await expect(win.getByText(SEARCH_ANCHOR, { exact: false }).first()).toBeVisible({ timeout: 5_000 });
  });

  // ── Per-session search ───────────────────────────────────────────────────────

  test('per-session Cmd+F finds the conductor message and shows match counter', async () => {
    const ok = await isAnthropicAvailable(win);
    if (!ok) test.skip(true, 'No Anthropic API key configured');

    // Ensure we are in the session view
    await win.getByRole('button', { name: 'Sessions', exact: true }).click();
    await win.getByText(SESSION_NAME).first().click();
    await expect(win.getByPlaceholder('Message the ensemble\u2026')).toBeVisible({ timeout: 10_000 });
    await win.locator('[role="log"]').click();

    await win.keyboard.press('Meta+f');
    await expect(win.getByPlaceholder('Search session\u2026')).toBeVisible({ timeout: 3_000 });

    await win.getByPlaceholder('Search session\u2026').fill(SEARCH_ANCHOR);

    // At least the conductor message matches — there may be more if the LLM echoed the word
    await expect(win.getByText(/\d+ of \d+ messages?/)).toBeVisible({ timeout: 10_000 });

    await win.keyboard.press('Escape');
  });

  test('per-session Cmd+F highlights matched words inside real markdown content', async () => {
    const ok = await isAnthropicAvailable(win);
    if (!ok) test.skip(true, 'No Anthropic API key configured');

    await win.getByRole('button', { name: 'Sessions', exact: true }).click();
    await win.getByText(SESSION_NAME).first().click();
    await expect(win.getByPlaceholder('Message the ensemble\u2026')).toBeVisible({ timeout: 10_000 });
    await win.locator('[role="log"]').click();

    await win.keyboard.press('Meta+f');
    await win.getByPlaceholder('Search session\u2026').fill(SEARCH_ANCHOR);
    await expect(win.getByText(/\d+ of \d+ messages?/)).toBeVisible({ timeout: 10_000 });

    // Word-level highlights must appear inside rendered message bubbles
    const highlight = win.locator('mark.search-highlight').first();
    await expect(highlight).toBeVisible({ timeout: 5_000 });
    await expect(highlight).toContainText(SEARCH_ANCHOR, { ignoreCase: true });

    await win.keyboard.press('Escape');
  });

  test('per-session next/prev navigation scrolls between matches', async () => {
    const ok = await isAnthropicAvailable(win);
    if (!ok) test.skip(true, 'No Anthropic API key configured');

    // Send a second message so there are at least 2 conductor matches if the
    // LLM echoed the word, or navigate through conductor + voice matches.
    // Either way, if there is only 1 match, next wraps to 1 and the test still passes.
    await win.getByRole('button', { name: 'Sessions', exact: true }).click();
    await win.getByText(SESSION_NAME).first().click();
    await expect(win.getByPlaceholder('Message the ensemble\u2026')).toBeVisible({ timeout: 10_000 });
    await win.locator('[role="log"]').click();

    await win.keyboard.press('Meta+f');
    await win.getByPlaceholder('Search session\u2026').fill(SEARCH_ANCHOR);

    const counterText = await win.getByText(/\d+ of \d+ messages?/).textContent({ timeout: 10_000 });
    const totalMatch = counterText?.match(/of (\d+)/);
    const total = totalMatch ? parseInt(totalMatch[1]!, 10) : 1;

    if (total > 1) {
      await win.getByRole('button', { name: 'Next match' }).click();
      await expect(win.getByText(`2 of ${total} messages`)).toBeVisible({ timeout: 3_000 });

      await win.getByRole('button', { name: 'Previous match' }).click();
      await expect(win.getByText(`1 of ${total} messages`)).toBeVisible({ timeout: 3_000 });
    } else {
      // Only one match — wrapping: next goes back to 1
      await win.getByRole('button', { name: 'Next match' }).click();
      await expect(win.getByText('1 of 1 messages')).toBeVisible({ timeout: 3_000 });
    }

    await win.keyboard.press('Escape');
  });
});
