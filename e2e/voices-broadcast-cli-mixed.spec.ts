/**
 * e2e tests for CLI and mixed API+CLI voice providers in broadcast mode.
 *
 * Covers: Copilot (CLI) alone, multi-round, and mixed compositions with API
 * voices (Anthropic, OpenAI) alongside Copilot.
 */
import { test } from './fixtures';
import {
  buildComposition,
  startSession,
  sendMessage,
  expectResponse,
  waitIdle,
} from './voices-helpers';

// ── CLI voice — broadcast mode ────────────────────────────────────────────────

test.describe('CLI voice — broadcast', () => {
  test('single Copilot voice responds', async ({ sharedWindow: window }) => {
    await buildComposition(window, 'Copilot Solo', ['Copilot'], { mode: 'broadcast' });
    await startSession(window, 'Copilot Solo', 'Copilot Session');
    await sendMessage(window, 'Hello CLI!');

    await expectResponse(window, 'Copilot');
    await waitIdle(window);
  });

  test('Copilot responds across multiple rounds', async ({ sharedWindow: window }) => {
    await buildComposition(window, 'Copilot Multi', ['Copilot'], { mode: 'broadcast' });
    await startSession(window, 'Copilot Multi', 'Copilot Multi Session');

    await sendMessage(window, 'First message');
    await expectResponse(window, 'Copilot');
    await waitIdle(window);

    await sendMessage(window, 'Second message');
    await expectResponse(window, 'Copilot');
    await waitIdle(window);
  });
});

// ── Mixed API + CLI — broadcast mode ─────────────────────────────────────────

test.describe('Mixed API + CLI — broadcast', () => {
  test('Anthropic (API) + Copilot (CLI) both respond', async ({ sharedWindow: window }) => {
    await buildComposition(window, 'API CLI Duo', ['Anthropic', 'Copilot'], { mode: 'broadcast' });
    await startSession(window, 'API CLI Duo', 'API CLI Session');
    await sendMessage(window, 'Hello from a mixed composition!');

    await expectResponse(window, 'Anthropic');
    await expectResponse(window, 'Copilot');
    await waitIdle(window);
  });

  test('OpenAI (API) + Copilot (CLI) both respond', async ({ sharedWindow: window }) => {
    await buildComposition(window, 'OAI CLI Duo', ['OpenAI', 'Copilot'], { mode: 'broadcast' });
    await startSession(window, 'OAI CLI Duo', 'OAI CLI Session');
    await sendMessage(window, 'Hello!');

    await expectResponse(window, 'OpenAI');
    await expectResponse(window, 'Copilot');
    await waitIdle(window);
  });

  test('Anthropic (API) + OpenAI (API) + Copilot (CLI) all three respond', async ({ sharedWindow: window }) => {
    await buildComposition(window, 'Full Mix', ['Anthropic', 'OpenAI', 'Copilot'], { mode: 'broadcast' });
    await startSession(window, 'Full Mix', 'Full Mix Session');
    await sendMessage(window, 'Everyone weigh in!');

    await expectResponse(window, 'Anthropic');
    await expectResponse(window, 'OpenAI');
    await expectResponse(window, 'Copilot');
    await waitIdle(window);
  });

  test('mixed trio responds across multiple rounds', async ({ sharedWindow: window }) => {
    await buildComposition(window, 'Mix Rounds', ['Anthropic', 'Copilot'], { mode: 'broadcast' });
    await startSession(window, 'Mix Rounds', 'Mix Rounds Session');

    await sendMessage(window, 'First round');
    await expectResponse(window, 'Anthropic');
    await expectResponse(window, 'Copilot');
    await waitIdle(window);

    await sendMessage(window, 'Second round');
    await expectResponse(window, 'Anthropic');
    await expectResponse(window, 'Copilot');
    await waitIdle(window);
  });
});
