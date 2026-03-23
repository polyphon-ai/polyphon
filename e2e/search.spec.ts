/**
 * e2e tests for global Search and per-session (Cmd+F) search.
 *
 * Uses MockVoice — no real API keys required.
 *
 * Setup: creates one composition + session and sends two conductor messages
 * both containing SEARCH_TERM so that multi-match navigation can be tested.
 * The MockVoice responds to each, giving 4 total messages in the session.
 */
import { test, expect } from './fixtures';
import { buildComposition, startSession, sendMessage, waitIdle } from './voices-helpers';

const COMP_NAME = 'Search E2E Comp';
const SESSION_NAME = 'Search E2E Session';
const SEARCH_TERM = 'jabberwocky';
const MSG_1 = 'jabberwocky search alpha round';
const MSG_2 = 'jabberwocky search beta round';

test.beforeAll(async ({ sharedWindow: window }) => {
  await buildComposition(window, COMP_NAME, ['Anthropic']);
  await startSession(window, COMP_NAME, SESSION_NAME);
  await sendMessage(window, MSG_1);
  await waitIdle(window);
  await sendMessage(window, MSG_2);
  await waitIdle(window);
  // Session now has 4 messages: 2 conductor (both contain SEARCH_TERM), 2 voice
});

// ── Per-session search (Cmd+F) ────────────────────────────────────────────────

test.describe('Per-session search (Cmd+F)', () => {
  // Navigate into the session before each test so Cmd+F has a target.
  test.beforeEach(async ({ sharedWindow: window }) => {
    await window.getByRole('button', { name: 'Sessions', exact: true }).click();
    await window.getByText(SESSION_NAME).first().click();
    await expect(window.getByPlaceholder('Message the ensemble\u2026')).toBeVisible({ timeout: 10_000 });
    // Click the message feed to move focus off the conductor textarea.
    // The Cmd+F handler is gated on the focused element not being a text input,
    // so Meta+f is silently ignored while the textarea has focus.
    await window.locator('[role="log"]').click();
  });

  test('Cmd+F opens search overlay with input', async ({ sharedWindow: window }) => {
    await window.keyboard.press('Meta+f');
    await expect(window.getByPlaceholder('Search session\u2026')).toBeVisible({ timeout: 3_000 });
    await window.keyboard.press('Escape');
  });

  test('Escape closes the search overlay', async ({ sharedWindow: window }) => {
    await window.keyboard.press('Meta+f');
    await expect(window.getByPlaceholder('Search session\u2026')).toBeVisible({ timeout: 3_000 });
    await window.keyboard.press('Escape');
    await expect(window.getByPlaceholder('Search session\u2026')).not.toBeVisible({ timeout: 3_000 });
  });

  test('close button dismisses the search overlay', async ({ sharedWindow: window }) => {
    await window.keyboard.press('Meta+f');
    await expect(window.getByPlaceholder('Search session\u2026')).toBeVisible({ timeout: 3_000 });
    await window.getByRole('button', { name: 'Close search' }).click();
    await expect(window.getByPlaceholder('Search session\u2026')).not.toBeVisible({ timeout: 3_000 });
  });

  test('shows "X of Y messages" counter for matches', async ({ sharedWindow: window }) => {
    await window.keyboard.press('Meta+f');
    await window.getByPlaceholder('Search session\u2026').fill(SEARCH_TERM);
    // Both conductor messages contain SEARCH_TERM
    await expect(window.getByText('1 of 2 messages')).toBeVisible({ timeout: 5_000 });
    await window.keyboard.press('Escape');
  });

  test('next/prev buttons cycle through matches and update counter', async ({ sharedWindow: window }) => {
    await window.keyboard.press('Meta+f');
    await window.getByPlaceholder('Search session\u2026').fill(SEARCH_TERM);
    await expect(window.getByText('1 of 2 messages')).toBeVisible({ timeout: 5_000 });

    await window.getByRole('button', { name: 'Next match' }).click();
    await expect(window.getByText('2 of 2 messages')).toBeVisible({ timeout: 3_000 });

    await window.getByRole('button', { name: 'Previous match' }).click();
    await expect(window.getByText('1 of 2 messages')).toBeVisible({ timeout: 3_000 });

    await window.keyboard.press('Escape');
  });

  test('Enter / Shift+Enter cycle through matches', async ({ sharedWindow: window }) => {
    await window.keyboard.press('Meta+f');
    const input = window.getByPlaceholder('Search session\u2026');
    await input.fill(SEARCH_TERM);
    await expect(window.getByText('1 of 2 messages')).toBeVisible({ timeout: 5_000 });

    await input.press('Enter');
    await expect(window.getByText('2 of 2 messages')).toBeVisible({ timeout: 3_000 });

    await input.press('Shift+Enter');
    await expect(window.getByText('1 of 2 messages')).toBeVisible({ timeout: 3_000 });

    await window.keyboard.press('Escape');
  });

  test('matched words are highlighted with mark.search-highlight', async ({ sharedWindow: window }) => {
    await window.keyboard.press('Meta+f');
    await window.getByPlaceholder('Search session\u2026').fill(SEARCH_TERM);
    await expect(window.getByText('1 of 2 messages')).toBeVisible({ timeout: 5_000 });

    const mark = window.locator('mark.search-highlight').first();
    await expect(mark).toBeVisible({ timeout: 3_000 });
    await expect(mark).toContainText(SEARCH_TERM, { ignoreCase: true });

    await window.keyboard.press('Escape');
  });

  test('shows "No results" when query has no matches', async ({ sharedWindow: window }) => {
    await window.keyboard.press('Meta+f');
    await window.getByPlaceholder('Search session\u2026').fill('zzznomatch999');
    await expect(window.getByText('No results')).toBeVisible({ timeout: 5_000 });
    await window.keyboard.press('Escape');
  });
});

// ── Global Search tab ─────────────────────────────────────────────────────────

test.describe('Global Search tab', () => {
  test.beforeEach(async ({ sharedWindow: window }) => {
    await window.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(window.getByPlaceholder('Search across all sessions\u2026')).toBeVisible({ timeout: 5_000 });
  });

  test('navigates to the search view and shows prompt state', async ({ sharedWindow: window }) => {
    await expect(window.getByText('Search your conversations')).toBeVisible({ timeout: 3_000 });
  });

  test('shows hint for query shorter than 2 chars', async ({ sharedWindow: window }) => {
    await window.getByPlaceholder('Search across all sessions\u2026').fill('a');
    await expect(window.getByText(/type at least 2 characters/i)).toBeVisible({ timeout: 3_000 });
  });

  test('shows no-results state for unmatched query', async ({ sharedWindow: window }) => {
    await window.getByPlaceholder('Search across all sessions\u2026').fill('zzznomatchxxx');
    await expect(window.getByText(/No results for/)).toBeVisible({ timeout: 5_000 });
  });

  test('finds messages and shows result cards with highlighted snippets', async ({ sharedWindow: window }) => {
    await window.getByPlaceholder('Search across all sessions\u2026').fill(SEARCH_TERM);

    await expect(window.locator('.search-result-card').first()).toBeVisible({ timeout: 5_000 });
    // Session name appears in at least one result card
    await expect(window.getByText(SESSION_NAME).first()).toBeVisible({ timeout: 3_000 });
    // Matched words are highlighted inside the snippets
    await expect(window.locator('.search-result-card mark.search-highlight').first()).toBeVisible({ timeout: 3_000 });
  });

  test('result count label is shown', async ({ sharedWindow: window }) => {
    await window.getByPlaceholder('Search across all sessions\u2026').fill(SEARCH_TERM);
    await expect(window.locator('.search-result-card').first()).toBeVisible({ timeout: 5_000 });
    // Count label format: "N result(s) for …"
    await expect(window.locator('.search-results-count')).toBeVisible({ timeout: 3_000 });
  });

  test('clicking a result navigates to the session and shows the message', async ({ sharedWindow: window }) => {
    await window.getByPlaceholder('Search across all sessions\u2026').fill(SEARCH_TERM);
    await expect(window.locator('.search-result-card').first()).toBeVisible({ timeout: 5_000 });

    await window.locator('.search-result-card').first().click();

    // Should land in the session view
    await expect(window.getByPlaceholder('Message the ensemble\u2026')).toBeVisible({ timeout: 10_000 });
    // The matched message content should be visible in the feed
    await expect(window.getByText(SEARCH_TERM, { exact: false }).first()).toBeVisible({ timeout: 5_000 });
  });

  test('clear button resets the input and restores prompt state', async ({ sharedWindow: window }) => {
    const input = window.getByPlaceholder('Search across all sessions\u2026');
    await input.fill(SEARCH_TERM);
    await expect(window.locator('.search-result-card').first()).toBeVisible({ timeout: 5_000 });

    await window.getByRole('button', { name: 'Clear search' }).click();
    await expect(input).toHaveValue('');
    await expect(window.getByText('Search your conversations')).toBeVisible({ timeout: 3_000 });
  });
});
