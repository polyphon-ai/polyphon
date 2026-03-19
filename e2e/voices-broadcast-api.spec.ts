/**
 * e2e tests for API voice providers in broadcast mode.
 *
 * Covers: Anthropic, OpenAI, Gemini — single-voice, duo, trio, multi-round,
 * and random 2-of-3 assortment.
 */
import { test } from './fixtures';
import {
  PROVIDER,
  type ProviderEntry,
  buildComposition,
  startSession,
  sendMessage,
  expectResponse,
  waitIdle,
} from './voices-helpers';

// ── API voices — broadcast mode ───────────────────────────────────────────────

test.describe('API voices — broadcast', () => {
  for (const provider of [PROVIDER.ANTHROPIC, PROVIDER.OPENAI, PROVIDER.GEMINI]) {
    test(`single ${provider.name} voice responds`, async ({ sharedWindow: window }) => {
      await buildComposition(window, provider.name, [provider.name], { mode: 'broadcast' });
      await startSession(window, provider.name, `${provider.name} Session`);
      await sendMessage(window, 'Hello!');

      await expectResponse(window, provider.name);
      await waitIdle(window);
    });
  }

  test('Anthropic + OpenAI both respond', async ({ sharedWindow: window }) => {
    await buildComposition(window, 'Duo API', ['Anthropic', 'OpenAI'], { mode: 'broadcast' });
    await startSession(window, 'Duo API', 'Duo API Session');
    await sendMessage(window, 'Hello everyone!');

    await expectResponse(window, 'Anthropic');
    await expectResponse(window, 'OpenAI');
    await waitIdle(window);
  });

  test('Anthropic + Gemini both respond', async ({ sharedWindow: window }) => {
    await buildComposition(window, 'Duo AG', ['Anthropic', 'Gemini'], { mode: 'broadcast' });
    await startSession(window, 'Duo AG', 'AG Session');
    await sendMessage(window, 'Hello!');

    await expectResponse(window, 'Anthropic');
    await expectResponse(window, 'Gemini');
    await waitIdle(window);
  });

  test('OpenAI + Gemini both respond', async ({ sharedWindow: window }) => {
    await buildComposition(window, 'Duo OG', ['OpenAI', 'Gemini'], { mode: 'broadcast' });
    await startSession(window, 'Duo OG', 'OG Session');
    await sendMessage(window, 'Hello!');

    await expectResponse(window, 'OpenAI');
    await expectResponse(window, 'Gemini');
    await waitIdle(window);
  });

  test('all three API voices respond', async ({ sharedWindow: window }) => {
    await buildComposition(window, 'API Trio', ['Anthropic', 'OpenAI', 'Gemini'], { mode: 'broadcast' });
    await startSession(window, 'API Trio', 'Trio Session');
    await sendMessage(window, 'What do you think?');

    await expectResponse(window, 'Anthropic');
    await expectResponse(window, 'OpenAI');
    await expectResponse(window, 'Gemini');
    await waitIdle(window);
  });

  test('all three API voices respond across multiple rounds', async ({ sharedWindow: window }) => {
    await buildComposition(window, 'Trio Multi', ['Anthropic', 'OpenAI', 'Gemini'], { mode: 'broadcast' });
    await startSession(window, 'Trio Multi', 'Trio Multi Session');

    await sendMessage(window, 'Round one');
    await expectResponse(window, 'Anthropic');
    await expectResponse(window, 'OpenAI');
    await expectResponse(window, 'Gemini');
    await waitIdle(window);

    await sendMessage(window, 'Round two');
    await expectResponse(window, 'Anthropic');
    await expectResponse(window, 'OpenAI');
    await expectResponse(window, 'Gemini');
    await waitIdle(window);
  });

  test('random 2-of-3 API provider assortment responds', async ({ sharedWindow: window }) => {
    const all: ProviderEntry[] = [PROVIDER.ANTHROPIC, PROVIDER.OPENAI, PROVIDER.GEMINI];
    const picked = [...all].sort(() => Math.random() - 0.5).slice(0, 2);

    await buildComposition(window, 'Random API Duo', picked.map((p) => p.name), { mode: 'broadcast' });
    await startSession(window, 'Random API Duo', 'Random API Duo Session');
    await sendMessage(window, 'Hello!');

    for (const { name } of picked) {
      await expectResponse(window, name);
    }
    await waitIdle(window);
  });
});
