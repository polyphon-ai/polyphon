/**
 * e2e tests for directed (conductor) mode — @mention routing.
 *
 * Covers: @mention routes to the correct voice, unmentioned voices stay silent,
 * alternating mention sequences, and the no-mention hint for both API-only and
 * mixed API+CLI compositions.
 */
import { test, expect } from './fixtures';
import {
  buildComposition,
  startSession,
  sendMessage,
  expectResponse,
  waitIdle,
  expectNoResponse,
} from './voices-helpers';

// ── Directed (conductor) mode — API voices ────────────────────────────────────

test.describe('Directed mode — API voices', () => {
  test('@Anthropic routes only to Anthropic, OpenAI stays silent', async ({ sharedWindow: window }) => {
    await buildComposition(window, 'Dir API Duo', ['Anthropic', 'OpenAI'], { mode: 'conductor' });
    await startSession(window, 'Dir API Duo', 'Dir API Session');

    await sendMessage(window, '@Anthropic What is your answer?');

    await expectResponse(window, 'Anthropic');
    await waitIdle(window);
    await expectNoResponse(window, 'OpenAI');
  });

  test('@OpenAI routes only to OpenAI, Anthropic stays silent', async ({ sharedWindow: window }) => {
    await buildComposition(window, 'Dir OAI Duo', ['Anthropic', 'OpenAI'], { mode: 'conductor' });
    await startSession(window, 'Dir OAI Duo', 'Dir OAI Session');

    await sendMessage(window, '@OpenAI Your perspective?');

    await expectResponse(window, 'OpenAI');
    await waitIdle(window);
    await expectNoResponse(window, 'Anthropic');
  });

  test('@Gemini routes only to Gemini among three API voices', async ({ sharedWindow: window }) => {
    await buildComposition(window, 'Dir API Trio', ['Anthropic', 'OpenAI', 'Gemini'], { mode: 'conductor' });
    await startSession(window, 'Dir API Trio', 'Dir Gemini Session');

    await sendMessage(window, '@Gemini Thoughts?');

    await expectResponse(window, 'Gemini');
    await waitIdle(window);
    await expectNoResponse(window, 'Anthropic');
    await expectNoResponse(window, 'OpenAI');
  });

  test('directed sequence: alternating @mentions each get a response', async ({ sharedWindow: window }) => {
    await buildComposition(window, 'Dir Seq', ['Anthropic', 'OpenAI'], { mode: 'conductor' });
    await startSession(window, 'Dir Seq', 'Dir Seq Session');

    // Round 1: address Anthropic only
    await sendMessage(window, '@Anthropic First question');
    await expectResponse(window, 'Anthropic');
    await waitIdle(window);
    await expectNoResponse(window, 'OpenAI');

    // Round 2: address OpenAI only
    await sendMessage(window, '@OpenAI Now your turn');
    await expectResponse(window, 'OpenAI');
    await waitIdle(window);
  });

  test('message without @mention shows directed-mode hint listing all voice names', async ({ sharedWindow: window }) => {
    await buildComposition(window, 'Dir Hint', ['Anthropic', 'OpenAI'], { mode: 'conductor' });
    await startSession(window, 'Dir Hint', 'Hint Session');

    await sendMessage(window, 'Hello, anyone?');

    // Directed-mode hint should name every voice in the session
    await expect(window.getByText(/Directed mode/)).toBeVisible({ timeout: 10_000 });
    await expect(window.getByText(/@Anthropic/)).toBeVisible({ timeout: 5_000 });
    await expect(window.getByText(/@OpenAI/)).toBeVisible({ timeout: 5_000 });

    // No voice should have responded
    await expectNoResponse(window, 'Anthropic');
    await expectNoResponse(window, 'OpenAI');
  });
});

// ── Directed (conductor) mode — CLI voice ────────────────────────────────────

test.describe('Directed mode — CLI voice', () => {
  test('@Copilot routes only to Copilot, API voice stays silent', async ({ sharedWindow: window }) => {
    await buildComposition(window, 'Dir CLI Mix', ['Anthropic', 'Copilot'], { mode: 'conductor' });
    await startSession(window, 'Dir CLI Mix', 'Dir Copilot Session');

    await sendMessage(window, '@Copilot Run this for me');

    await expectResponse(window, 'Copilot');
    await waitIdle(window);
    await expectNoResponse(window, 'Anthropic');
  });

  test('@Anthropic routes to API voice, CLI Copilot stays silent', async ({ sharedWindow: window }) => {
    await buildComposition(window, 'Dir API CLI Mix', ['Anthropic', 'Copilot'], { mode: 'conductor' });
    await startSession(window, 'Dir API CLI Mix', 'Dir API Only Session');

    await sendMessage(window, '@Anthropic Explain this');

    await expectResponse(window, 'Anthropic');
    await waitIdle(window);
    await expectNoResponse(window, 'Copilot');
  });

  test('directed sequence: alternate between API and CLI voices', async ({ sharedWindow: window }) => {
    await buildComposition(window, 'Dir Alt', ['Anthropic', 'Copilot'], { mode: 'conductor' });
    await startSession(window, 'Dir Alt', 'Dir Alt Session');

    // First: API voice
    await sendMessage(window, '@Anthropic Your thoughts?');
    await expectResponse(window, 'Anthropic');
    await waitIdle(window);
    await expectNoResponse(window, 'Copilot');

    // Second: CLI voice
    await sendMessage(window, '@Copilot Now execute');
    await expectResponse(window, 'Copilot');
    await waitIdle(window);
  });

  test('no @mention in CLI mixed session shows hint for both voices', async ({ sharedWindow: window }) => {
    await buildComposition(window, 'Dir CLI Hint', ['Anthropic', 'Copilot'], { mode: 'conductor' });
    await startSession(window, 'Dir CLI Hint', 'CLI Hint Session');

    await sendMessage(window, 'Who should answer this?');

    await expect(window.getByText(/Directed mode/)).toBeVisible({ timeout: 10_000 });
    await expect(window.getByText(/@Anthropic/)).toBeVisible({ timeout: 5_000 });
    await expect(window.getByText(/@Copilot/)).toBeVisible({ timeout: 5_000 });

    await expectNoResponse(window, 'Anthropic');
    await expectNoResponse(window, 'Copilot');
  });
});
