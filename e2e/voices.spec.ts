/**
 * e2e tests for voice providers and session modes.
 *
 * All tests run with POLYPHON_MOCK_VOICES=1 so no real API keys or CLI
 * binaries are required. Coverage is spread across:
 *   - API-only voices (Anthropic, OpenAI, Gemini)
 *   - CLI-only voices (Copilot)
 *   - Mixed API + CLI compositions
 *   - Broadcast mode (all voices respond) with and without @mention overrides
 *   - Directed (conductor) mode: @mention routing, no-mention hint
 *   - Continuation policy: "Prompt me" nudge, dismiss, and Allow
 *
 * One Electron app is launched per spec file run. All providers are enabled
 * once in beforeAll. Each test creates its own uniquely-named composition and
 * session so tests don't interfere with each other's state.
 */
import { test, expect } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { launchMockApp, skipOnboarding, goToProvidersTab } from './helpers';

const PROVIDER = {
  ANTHROPIC: { name: 'Anthropic' },
  OPENAI:    { name: 'OpenAI' },
  GEMINI:    { name: 'Gemini' },
  COPILOT:   { name: 'Copilot' },
} as const;

type ProviderEntry = (typeof PROVIDER)[keyof typeof PROVIDER];

// ── Shared app instance ────────────────────────────────────────────────────────

let app: ElectronApplication;
let window: Page;

test.beforeAll(async () => {
  app = await launchMockApp();
  window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  await skipOnboarding(window);
  // Enable all provider type toggles once; each test builds compositions using only the
  // voices it needs so unneeded providers don't interfere.
  await goToProvidersTab(window);
  const switches = window.getByRole('switch');
  const switchCount = await switches.count();
  for (let i = 0; i < switchCount; i++) {
    await switches.nth(i).click();
    await expect(window.getByText('Saved').first()).toBeVisible({ timeout: 5_000 });
  }
});

test.afterAll(async () => {
  await app.close();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function buildComposition(
  name: string,
  voiceProviderNames: string[],
  opts: {
    mode?: 'broadcast' | 'conductor';
    continuationPolicy?: 'none' | 'prompt' | 'auto';
  } = {},
): Promise<void> {
  const { mode = 'broadcast', continuationPolicy = 'none' } = opts;

  await window.getByRole('button', { name: /compositions/i }).click();
  // exact: true avoids the sidebar + button whose title is "New composition" (lowercase c)
  await window.getByRole('button', { name: 'New Composition', exact: true }).first().click();

  await window.getByPlaceholder('My Composition').fill(name);

  if (mode === 'broadcast') {
    await window.getByRole('button', { name: /broadcast/i }).first().click();
    if (continuationPolicy !== 'none') {
      const label = continuationPolicy === 'prompt' ? 'Prompt me' : 'Auto';
      await window.getByRole('button', { name: label }).click();
    }
  }
  // else: default is Conductor-Directed

  for (const providerName of voiceProviderNames) {
    await window.getByRole('button', { name: providerName }).first().click();
    await window.getByRole('button', { name: 'Add Voice' }).click();
  }

  await window.getByRole('button', { name: 'Save Composition' }).click();
}

async function startSession(
  compositionName: string,
  sessionName: string,
): Promise<void> {
  await window.getByRole('button', { name: /sessions/i }).click();
  // exact: true avoids the sidebar + button whose title is "New session" (lowercase s)
  await window.getByRole('button', { name: 'New Session', exact: true }).click();
  // Escape regex metacharacters in the composition name before building the locator
  const escapedName = compositionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await window.getByRole('button', { name: new RegExp(escapedName, 'i') }).first().click();
  await window.getByPlaceholder('My session').fill(sessionName);
  await window.getByRole('button', { name: 'Start Session' }).click();
  await expect(window.getByPlaceholder('Message the ensemble\u2026')).toBeVisible({ timeout: 10_000 });
}

/** Type a message and submit with Enter. */
async function sendMessage(message: string): Promise<void> {
  await window.getByPlaceholder('Message the ensemble\u2026').fill(message);
  await window.keyboard.press('Enter');
}

/** Assert a mock voice response is visible and wait for the textarea to re-enable. */
async function expectResponse(voiceName: string): Promise<void> {
  await expect(
    window.getByText(new RegExp(`Mock response from ${voiceName}!`)),
  ).toBeVisible({ timeout: 15_000 });
}

/** Wait until no voice is streaming (textarea re-enabled). */
async function waitIdle(): Promise<void> {
  await expect(
    window.getByPlaceholder('Message the ensemble\u2026'),
  ).toBeVisible({ timeout: 20_000 });
}

/** Assert a mock response is NOT present in the feed. */
async function expectNoResponse(voiceName: string): Promise<void> {
  await expect(
    window.getByText(new RegExp(`Mock response from ${voiceName}!`)),
  ).not.toBeVisible();
}

// ── API voices — broadcast mode ───────────────────────────────────────────────

test.describe('API voices — broadcast', () => {
  for (const provider of [PROVIDER.ANTHROPIC, PROVIDER.OPENAI, PROVIDER.GEMINI]) {
    test(`single ${provider.name} voice responds`, async () => {
      await buildComposition(provider.name, [provider.name], { mode: 'broadcast' });
      await startSession(provider.name, `${provider.name} Session`);
      await sendMessage('Hello!');

      await expectResponse(provider.name);
      await waitIdle();
    });
  }

  test('Anthropic + OpenAI both respond', async () => {
    await buildComposition('Duo API', ['Anthropic', 'OpenAI'], { mode: 'broadcast' });
    await startSession('Duo API', 'Duo API Session');
    await sendMessage('Hello everyone!');

    await expectResponse('Anthropic');
    await expectResponse('OpenAI');
    await waitIdle();
  });

  test('Anthropic + Gemini both respond', async () => {
    await buildComposition('Duo AG', ['Anthropic', 'Gemini'], { mode: 'broadcast' });
    await startSession('Duo AG', 'AG Session');
    await sendMessage('Hello!');

    await expectResponse('Anthropic');
    await expectResponse('Gemini');
    await waitIdle();
  });

  test('OpenAI + Gemini both respond', async () => {
    await buildComposition('Duo OG', ['OpenAI', 'Gemini'], { mode: 'broadcast' });
    await startSession('Duo OG', 'OG Session');
    await sendMessage('Hello!');

    await expectResponse('OpenAI');
    await expectResponse('Gemini');
    await waitIdle();
  });

  test('all three API voices respond', async () => {
    await buildComposition('API Trio', ['Anthropic', 'OpenAI', 'Gemini'], { mode: 'broadcast' });
    await startSession('API Trio', 'Trio Session');
    await sendMessage('What do you think?');

    await expectResponse('Anthropic');
    await expectResponse('OpenAI');
    await expectResponse('Gemini');
    await waitIdle();
  });

  test('all three API voices respond across multiple rounds', async () => {
    await buildComposition('Trio Multi', ['Anthropic', 'OpenAI', 'Gemini'], { mode: 'broadcast' });
    await startSession('Trio Multi', 'Trio Multi Session');

    await sendMessage('Round one');
    await expectResponse('Anthropic');
    await expectResponse('OpenAI');
    await expectResponse('Gemini');
    await waitIdle();

    await sendMessage('Round two');
    await expectResponse('Anthropic');
    await expectResponse('OpenAI');
    await expectResponse('Gemini');
    await waitIdle();
  });

  test('random 2-of-3 API provider assortment responds', async () => {
    const all: ProviderEntry[] = [PROVIDER.ANTHROPIC, PROVIDER.OPENAI, PROVIDER.GEMINI];
    const picked = [...all].sort(() => Math.random() - 0.5).slice(0, 2);

    await buildComposition('Random API Duo', picked.map((p) => p.name), { mode: 'broadcast' });
    await startSession('Random API Duo', 'Random API Duo Session');
    await sendMessage('Hello!');

    for (const { name } of picked) {
      await expectResponse(name);
    }
    await waitIdle();
  });
});

// ── CLI voice — broadcast mode ────────────────────────────────────────────────

test.describe('CLI voice — broadcast', () => {
  test('single Copilot voice responds', async () => {
    await buildComposition('Copilot Solo', ['Copilot'], { mode: 'broadcast' });
    await startSession('Copilot Solo', 'Copilot Session');
    await sendMessage('Hello CLI!');

    await expectResponse('Copilot');
    await waitIdle();
  });

  test('Copilot responds across multiple rounds', async () => {
    await buildComposition('Copilot Multi', ['Copilot'], { mode: 'broadcast' });
    await startSession('Copilot Multi', 'Copilot Multi Session');

    await sendMessage('First message');
    await expectResponse('Copilot');
    await waitIdle();

    await sendMessage('Second message');
    await expectResponse('Copilot');
    await waitIdle();
  });
});

// ── Mixed API + CLI — broadcast mode ─────────────────────────────────────────

test.describe('Mixed API + CLI — broadcast', () => {
  test('Anthropic (API) + Copilot (CLI) both respond', async () => {
    await buildComposition('API CLI Duo', ['Anthropic', 'Copilot'], { mode: 'broadcast' });
    await startSession('API CLI Duo', 'API CLI Session');
    await sendMessage('Hello from a mixed composition!');

    await expectResponse('Anthropic');
    await expectResponse('Copilot');
    await waitIdle();
  });

  test('OpenAI (API) + Copilot (CLI) both respond', async () => {
    await buildComposition('OAI CLI Duo', ['OpenAI', 'Copilot'], { mode: 'broadcast' });
    await startSession('OAI CLI Duo', 'OAI CLI Session');
    await sendMessage('Hello!');

    await expectResponse('OpenAI');
    await expectResponse('Copilot');
    await waitIdle();
  });

  test('Anthropic (API) + OpenAI (API) + Copilot (CLI) all three respond', async () => {
    await buildComposition('Full Mix', ['Anthropic', 'OpenAI', 'Copilot'], { mode: 'broadcast' });
    await startSession('Full Mix', 'Full Mix Session');
    await sendMessage('Everyone weigh in!');

    await expectResponse('Anthropic');
    await expectResponse('OpenAI');
    await expectResponse('Copilot');
    await waitIdle();
  });

  test('mixed trio responds across multiple rounds', async () => {
    await buildComposition('Mix Rounds', ['Anthropic', 'Copilot'], { mode: 'broadcast' });
    await startSession('Mix Rounds', 'Mix Rounds Session');

    await sendMessage('First round');
    await expectResponse('Anthropic');
    await expectResponse('Copilot');
    await waitIdle();

    await sendMessage('Second round');
    await expectResponse('Anthropic');
    await expectResponse('Copilot');
    await waitIdle();
  });
});

// ── Directed (conductor) mode — @mention routing ──────────────────────────────

test.describe('Directed mode — API voices', () => {
  test('@Anthropic routes only to Anthropic, OpenAI stays silent', async () => {
    await buildComposition('Dir API Duo', ['Anthropic', 'OpenAI'], { mode: 'conductor' });
    await startSession('Dir API Duo', 'Dir API Session');

    await sendMessage('@Anthropic What is your answer?');

    await expectResponse('Anthropic');
    await waitIdle();
    await expectNoResponse('OpenAI');
  });

  test('@OpenAI routes only to OpenAI, Anthropic stays silent', async () => {
    await buildComposition('Dir OAI Duo', ['Anthropic', 'OpenAI'], { mode: 'conductor' });
    await startSession('Dir OAI Duo', 'Dir OAI Session');

    await sendMessage('@OpenAI Your perspective?');

    await expectResponse('OpenAI');
    await waitIdle();
    await expectNoResponse('Anthropic');
  });

  test('@Gemini routes only to Gemini among three API voices', async () => {
    await buildComposition('Dir API Trio', ['Anthropic', 'OpenAI', 'Gemini'], { mode: 'conductor' });
    await startSession('Dir API Trio', 'Dir Gemini Session');

    await sendMessage('@Gemini Thoughts?');

    await expectResponse('Gemini');
    await waitIdle();
    await expectNoResponse('Anthropic');
    await expectNoResponse('OpenAI');
  });

  test('directed sequence: alternating @mentions each get a response', async () => {
    await buildComposition('Dir Seq', ['Anthropic', 'OpenAI'], { mode: 'conductor' });
    await startSession('Dir Seq', 'Dir Seq Session');

    // Round 1: address Anthropic only
    await sendMessage('@Anthropic First question');
    await expectResponse('Anthropic');
    await waitIdle();
    await expectNoResponse('OpenAI');

    // Round 2: address OpenAI only
    await sendMessage('@OpenAI Now your turn');
    await expectResponse('OpenAI');
    await waitIdle();
  });

  test('message without @mention shows directed-mode hint listing all voice names', async () => {
    await buildComposition('Dir Hint', ['Anthropic', 'OpenAI'], { mode: 'conductor' });
    await startSession('Dir Hint', 'Hint Session');

    await sendMessage('Hello, anyone?');

    // Directed-mode hint should name every voice in the session
    await expect(window.getByText(/Directed mode/)).toBeVisible({ timeout: 10_000 });
    await expect(window.getByText(/@Anthropic/)).toBeVisible({ timeout: 5_000 });
    await expect(window.getByText(/@OpenAI/)).toBeVisible({ timeout: 5_000 });

    // No voice should have responded
    await expectNoResponse('Anthropic');
    await expectNoResponse('OpenAI');
  });
});

test.describe('Directed mode — CLI voice', () => {
  test('@Copilot routes only to Copilot, API voice stays silent', async () => {
    await buildComposition('Dir CLI Mix', ['Anthropic', 'Copilot'], { mode: 'conductor' });
    await startSession('Dir CLI Mix', 'Dir Copilot Session');

    await sendMessage('@Copilot Run this for me');

    await expectResponse('Copilot');
    await waitIdle();
    await expectNoResponse('Anthropic');
  });

  test('@Anthropic routes to API voice, CLI Copilot stays silent', async () => {
    await buildComposition('Dir API CLI Mix', ['Anthropic', 'Copilot'], { mode: 'conductor' });
    await startSession('Dir API CLI Mix', 'Dir API Only Session');

    await sendMessage('@Anthropic Explain this');

    await expectResponse('Anthropic');
    await waitIdle();
    await expectNoResponse('Copilot');
  });

  test('directed sequence: alternate between API and CLI voices', async () => {
    await buildComposition('Dir Alt', ['Anthropic', 'Copilot'], { mode: 'conductor' });
    await startSession('Dir Alt', 'Dir Alt Session');

    // First: API voice
    await sendMessage('@Anthropic Your thoughts?');
    await expectResponse('Anthropic');
    await waitIdle();
    await expectNoResponse('Copilot');

    // Second: CLI voice
    await sendMessage('@Copilot Now execute');
    await expectResponse('Copilot');
    await waitIdle();
  });

  test('no @mention in CLI mixed session shows hint for both voices', async () => {
    await buildComposition('Dir CLI Hint', ['Anthropic', 'Copilot'], { mode: 'conductor' });
    await startSession('Dir CLI Hint', 'CLI Hint Session');

    await sendMessage('Who should answer this?');

    await expect(window.getByText(/Directed mode/)).toBeVisible({ timeout: 10_000 });
    await expect(window.getByText(/@Anthropic/)).toBeVisible({ timeout: 5_000 });
    await expect(window.getByText(/@Copilot/)).toBeVisible({ timeout: 5_000 });

    await expectNoResponse('Anthropic');
    await expectNoResponse('Copilot');
  });
});

// ── Broadcast mode with @mention override ────────────────────────────────────

test.describe('Broadcast mode — @mention override', () => {
  test('@mention in broadcast routes to one voice; without it all respond', async () => {
    await buildComposition('BC Override', ['Anthropic', 'OpenAI'], { mode: 'broadcast' });
    await startSession('BC Override', 'BC Override Session');

    // Directed message within a broadcast session → only Anthropic responds
    await sendMessage('@Anthropic Just you please');
    await expectResponse('Anthropic');
    await waitIdle();
    await expectNoResponse('OpenAI');

    // Broadcast message → both respond
    await sendMessage('Now everyone answer');
    await expectResponse('Anthropic');
    await expectResponse('OpenAI');
    await waitIdle();
  });

  test('@mention to CLI voice in broadcast session routes correctly', async () => {
    await buildComposition('BC CLI Override', ['Anthropic', 'Copilot'], { mode: 'broadcast' });
    await startSession('BC CLI Override', 'BC CLI Override Session');

    // Direct the CLI voice specifically
    await sendMessage('@Copilot Run a check');
    await expectResponse('Copilot');
    await waitIdle();
    await expectNoResponse('Anthropic');

    // Then broadcast — both respond
    await sendMessage('Status update everyone');
    await expectResponse('Anthropic');
    await expectResponse('Copilot');
    await waitIdle();
  });

  test('@mention to API voice in mixed broadcast, CLI stays silent', async () => {
    await buildComposition('BC API Override', ['OpenAI', 'Copilot'], { mode: 'broadcast' });
    await startSession('BC API Override', 'BC API Override Session');

    // Direct the API voice
    await sendMessage('@OpenAI Analyze this');
    await expectResponse('OpenAI');
    await waitIdle();
    await expectNoResponse('Copilot');

    // Full broadcast round
    await sendMessage('All voices now');
    await expectResponse('OpenAI');
    await expectResponse('Copilot');
    await waitIdle();
  });
});

// ── Input focus ───────────────────────────────────────────────────────────────

test.describe('Input focus', () => {
  test('textarea regains focus after voices finish responding (Enter to send)', async () => {
    await buildComposition('Focus Test', ['Anthropic'], { mode: 'broadcast' });
    await startSession('Focus Test', 'Focus Session');

    const textarea = window.getByPlaceholder('Message the ensemble\u2026');
    await textarea.fill('First message');
    await textarea.press('Enter');

    // Wait for voices to finish and input to re-enable
    await waitIdle();

    const isFocused = await textarea.evaluate((el) => el === document.activeElement);
    expect(isFocused).toBe(true);
  });

  test('textarea regains focus after voices finish responding (button click to send)', async () => {
    await buildComposition('Focus Test 2', ['Anthropic'], { mode: 'broadcast' });
    await startSession('Focus Test 2', 'Focus Session 2');

    const textarea = window.getByPlaceholder('Message the ensemble\u2026');
    await textarea.fill('First message');
    await window.getByRole('button', { name: 'Send message' }).click();

    // Wait for voices to finish and input to re-enable
    await waitIdle();

    const isFocused = await textarea.evaluate((el) => el === document.activeElement);
    expect(isFocused).toBe(true);
  });

  test('can type a second message without re-clicking after voices respond', async () => {
    await buildComposition('Focus Test 3', ['Anthropic'], { mode: 'broadcast' });
    await startSession('Focus Test 3', 'Focus Session 3');

    const textarea = window.getByPlaceholder('Message the ensemble\u2026');
    await textarea.fill('First message');
    await textarea.press('Enter');

    // Wait for voices to finish
    await waitIdle();

    // Type without clicking textarea first — if focus is lost this will fail
    await window.keyboard.type('Second message');
    await expect(textarea).toHaveValue('Second message');
  });
});

// ── Continuation policy ───────────────────────────────────────────────────────

test.describe('Continuation policy', () => {
  test('"Prompt me" shows nudge after API voices finish a broadcast round', async () => {
    await buildComposition('Cont API', ['Anthropic', 'OpenAI'], {
      mode: 'broadcast',
      continuationPolicy: 'prompt',
    });
    await startSession('Cont API', 'Cont API Session');
    await sendMessage('Hello!');

    await expectResponse('Anthropic');
    await expectResponse('OpenAI');
    await expect(window.getByText(/Agents have more to say/)).toBeVisible({ timeout: 10_000 });
  });

  test('"Prompt me" shows nudge after mixed API + CLI broadcast round', async () => {
    await buildComposition('Cont Mix', ['Anthropic', 'Copilot'], {
      mode: 'broadcast',
      continuationPolicy: 'prompt',
    });
    await startSession('Cont Mix', 'Cont Mix Session');
    await sendMessage('Begin!');

    await expectResponse('Anthropic');
    await expectResponse('Copilot');
    await expect(window.getByText(/Agents have more to say/)).toBeVisible({ timeout: 10_000 });
  });

  test('dismissing the continuation nudge removes it', async () => {
    await buildComposition('Cont Dismiss', ['Anthropic', 'OpenAI'], {
      mode: 'broadcast',
      continuationPolicy: 'prompt',
    });
    await startSession('Cont Dismiss', 'Dismiss Session');
    await sendMessage('Hello!');

    await expect(window.getByText(/Agents have more to say/)).toBeVisible({ timeout: 10_000 });
    await window.getByRole('button', { name: 'Dismiss' }).click();
    await expect(window.getByText(/Agents have more to say/)).not.toBeVisible();
  });

  test('allowing continuation triggers a second streaming round', async () => {
    await buildComposition('Cont Allow', ['Anthropic', 'OpenAI'], {
      mode: 'broadcast',
      continuationPolicy: 'prompt',
    });
    await startSession('Cont Allow', 'Allow Session');
    await sendMessage('Go!');

    // First round completes
    await expectResponse('Anthropic');
    await expectResponse('OpenAI');
    await expect(window.getByText(/Agents have more to say/)).toBeVisible({ timeout: 10_000 });

    // Allow the continuation
    await window.getByRole('button', { name: 'Allow' }).click();

    // Voices stream during the second round
    await expect(
      window.getByPlaceholder('Waiting for voices\u2026'),
    ).toBeVisible({ timeout: 10_000 });
    await waitIdle();

    // The nudge reappears after the second round (still within max-rounds limit)
    await expect(window.getByText(/Agents have more to say/)).toBeVisible({ timeout: 10_000 });
  });

  test('allowing continuation works with mixed API + CLI voices', async () => {
    await buildComposition('Cont Mix Allow', ['Anthropic', 'Copilot'], {
      mode: 'broadcast',
      continuationPolicy: 'prompt',
    });
    await startSession('Cont Mix Allow', 'Mix Allow Session');
    await sendMessage('Start!');

    await expectResponse('Anthropic');
    await expectResponse('Copilot');
    await expect(window.getByText(/Agents have more to say/)).toBeVisible({ timeout: 10_000 });

    await window.getByRole('button', { name: 'Allow' }).click();

    await expect(
      window.getByPlaceholder('Waiting for voices\u2026'),
    ).toBeVisible({ timeout: 10_000 });
    await waitIdle();

    await expect(window.getByText(/Agents have more to say/)).toBeVisible({ timeout: 10_000 });
  });
});
