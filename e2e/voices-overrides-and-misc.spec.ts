/**
 * e2e tests for broadcast @mention overrides, input focus retention, and
 * continuation policy behaviour.
 *
 * Covers:
 *   - @mention in a broadcast session routes to one voice; plain message broadcasts
 *   - Textarea regains focus after voices finish responding
 *   - "Prompt me" continuation nudge appears, can be dismissed, and allows a
 *     second streaming round
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

// ── Broadcast mode with @mention override ────────────────────────────────────

test.describe('Broadcast mode — @mention override', () => {
  test('@mention in broadcast routes to one voice; without it all respond', async ({ sharedWindow: window }) => {
    await buildComposition(window, 'BC Override', ['Anthropic', 'OpenAI'], { mode: 'broadcast' });
    await startSession(window, 'BC Override', 'BC Override Session');

    // Directed message within a broadcast session → only Anthropic responds
    await sendMessage(window, '@Anthropic Just you please');
    await expectResponse(window, 'Anthropic');
    await waitIdle(window);
    await expectNoResponse(window, 'OpenAI');

    // Broadcast message → both respond
    await sendMessage(window, 'Now everyone answer');
    await expectResponse(window, 'Anthropic');
    await expectResponse(window, 'OpenAI');
    await waitIdle(window);
  });

  test('@mention to CLI voice in broadcast session routes correctly', async ({ sharedWindow: window }) => {
    await buildComposition(window, 'BC CLI Override', ['Anthropic', 'Copilot'], { mode: 'broadcast' });
    await startSession(window, 'BC CLI Override', 'BC CLI Override Session');

    // Direct the CLI voice specifically
    await sendMessage(window, '@Copilot Run a check');
    await expectResponse(window, 'Copilot');
    await waitIdle(window);
    await expectNoResponse(window, 'Anthropic');

    // Then broadcast — both respond
    await sendMessage(window, 'Status update everyone');
    await expectResponse(window, 'Anthropic');
    await expectResponse(window, 'Copilot');
    await waitIdle(window);
  });

  test('@mention to API voice in mixed broadcast, CLI stays silent', async ({ sharedWindow: window }) => {
    await buildComposition(window, 'BC API Override', ['OpenAI', 'Copilot'], { mode: 'broadcast' });
    await startSession(window, 'BC API Override', 'BC API Override Session');

    // Direct the API voice
    await sendMessage(window, '@OpenAI Analyze this');
    await expectResponse(window, 'OpenAI');
    await waitIdle(window);
    await expectNoResponse(window, 'Copilot');

    // Full broadcast round
    await sendMessage(window, 'All voices now');
    await expectResponse(window, 'OpenAI');
    await expectResponse(window, 'Copilot');
    await waitIdle(window);
  });
});

// ── Input focus ───────────────────────────────────────────────────────────────

test.describe('Input focus', () => {
  test('textarea regains focus after voices finish responding (Enter to send)', async ({ sharedWindow: window }) => {
    await buildComposition(window, 'Focus Test', ['Anthropic'], { mode: 'broadcast' });
    await startSession(window, 'Focus Test', 'Focus Session');

    const textarea = window.getByPlaceholder('Message the ensemble\u2026');
    await textarea.fill('First message');
    await textarea.press('Enter');

    await waitIdle(window);

    const isFocused = await textarea.evaluate((el) => el === document.activeElement);
    expect(isFocused).toBe(true);
  });

  test('textarea regains focus after voices finish responding (button click to send)', async ({ sharedWindow: window }) => {
    await buildComposition(window, 'Focus Test 2', ['Anthropic'], { mode: 'broadcast' });
    await startSession(window, 'Focus Test 2', 'Focus Session 2');

    const textarea = window.getByPlaceholder('Message the ensemble\u2026');
    await textarea.fill('First message');
    await window.getByRole('button', { name: 'Send message' }).click();

    await waitIdle(window);

    const isFocused = await textarea.evaluate((el) => el === document.activeElement);
    expect(isFocused).toBe(true);
  });

  test('can type a second message without re-clicking after voices respond', async ({ sharedWindow: window }) => {
    await buildComposition(window, 'Focus Test 3', ['Anthropic'], { mode: 'broadcast' });
    await startSession(window, 'Focus Test 3', 'Focus Session 3');

    const textarea = window.getByPlaceholder('Message the ensemble\u2026');
    await textarea.fill('First message');
    await textarea.press('Enter');

    await waitIdle(window);

    // Type without clicking textarea first — if focus is lost this will fail
    await window.keyboard.type('Second message');
    await expect(textarea).toHaveValue('Second message');
  });
});

// ── Continuation policy ───────────────────────────────────────────────────────

test.describe('Continuation policy', () => {
  test('"Prompt me" shows nudge after API voices finish a broadcast round', async ({ sharedWindow: window }) => {
    await buildComposition(window, 'Cont API', ['Anthropic', 'OpenAI'], {
      mode: 'broadcast',
      continuationPolicy: 'prompt',
    });
    await startSession(window, 'Cont API', 'Cont API Session');
    await sendMessage(window, 'Hello!');

    await expectResponse(window, 'Anthropic');
    await expectResponse(window, 'OpenAI');
    await expect(window.getByText(/Agents have more to say/)).toBeVisible({ timeout: 10_000 });
  });

  test('"Prompt me" shows nudge after mixed API + CLI broadcast round', async ({ sharedWindow: window }) => {
    await buildComposition(window, 'Cont Mix', ['Anthropic', 'Copilot'], {
      mode: 'broadcast',
      continuationPolicy: 'prompt',
    });
    await startSession(window, 'Cont Mix', 'Cont Mix Session');
    await sendMessage(window, 'Begin!');

    await expectResponse(window, 'Anthropic');
    await expectResponse(window, 'Copilot');
    await expect(window.getByText(/Agents have more to say/)).toBeVisible({ timeout: 10_000 });
  });

  test('dismissing the continuation nudge removes it', async ({ sharedWindow: window }) => {
    await buildComposition(window, 'Cont Dismiss', ['Anthropic', 'OpenAI'], {
      mode: 'broadcast',
      continuationPolicy: 'prompt',
    });
    await startSession(window, 'Cont Dismiss', 'Dismiss Session');
    await sendMessage(window, 'Hello!');

    await expect(window.getByText(/Agents have more to say/)).toBeVisible({ timeout: 10_000 });
    await window.getByRole('button', { name: 'Dismiss' }).click();
    await expect(window.getByText(/Agents have more to say/)).not.toBeVisible();
  });

  test('allowing continuation triggers a second streaming round', async ({ sharedWindow: window }) => {
    await buildComposition(window, 'Cont Allow', ['Anthropic', 'OpenAI'], {
      mode: 'broadcast',
      continuationPolicy: 'prompt',
    });
    await startSession(window, 'Cont Allow', 'Allow Session');
    await sendMessage(window, 'Go!');

    // First round completes
    await expectResponse(window, 'Anthropic');
    await expectResponse(window, 'OpenAI');
    await expect(window.getByText(/Agents have more to say/)).toBeVisible({ timeout: 10_000 });

    // Allow the continuation
    await window.getByRole('button', { name: 'Allow' }).click();

    // Voices stream during the second round
    await expect(
      window.getByPlaceholder('Waiting for voices\u2026'),
    ).toBeVisible({ timeout: 10_000 });
    await waitIdle(window);

    // The nudge reappears after the second round (still within max-rounds limit)
    await expect(window.getByText(/Agents have more to say/)).toBeVisible({ timeout: 10_000 });
  });

  test('allowing continuation works with mixed API + CLI voices', async ({ sharedWindow: window }) => {
    await buildComposition(window, 'Cont Mix Allow', ['Anthropic', 'Copilot'], {
      mode: 'broadcast',
      continuationPolicy: 'prompt',
    });
    await startSession(window, 'Cont Mix Allow', 'Mix Allow Session');
    await sendMessage(window, 'Start!');

    await expectResponse(window, 'Anthropic');
    await expectResponse(window, 'Copilot');
    await expect(window.getByText(/Agents have more to say/)).toBeVisible({ timeout: 10_000 });

    await window.getByRole('button', { name: 'Allow' }).click();

    await expect(
      window.getByPlaceholder('Waiting for voices\u2026'),
    ).toBeVisible({ timeout: 10_000 });
    await waitIdle(window);

    await expect(window.getByText(/Agents have more to say/)).toBeVisible({ timeout: 10_000 });
  });
});
