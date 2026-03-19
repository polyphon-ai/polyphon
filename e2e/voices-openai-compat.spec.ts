/**
 * e2e tests for OpenAI-compatible custom voice providers using a local mock server.
 *
 * Unlike the live Ollama tests (`custom-providers.openai-compatible.test.ts`),
 * these run entirely without external dependencies and are included in the
 * standard `make test-e2e` target.
 *
 * The mock server (helpers/mockOpenAIServer.ts) implements the OpenAI chat
 * completions SSE streaming endpoint so that OpenAICompatVoice is exercised
 * end-to-end — no POLYPHON_MOCK_VOICES shortcut is used here.
 */

import { test, expect } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { launchApp, makeTempDir, skipOnboarding, goToProvidersTab, goToHome } from './helpers';
import { startMockOpenAIServer, MOCK_COMPLETION_TEXT } from './helpers/mockOpenAIServer';
import type { MockOpenAIServer } from './helpers/mockOpenAIServer';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function addCustomProvider(
  win: Page,
  name: string,
  baseUrl: string,
  model = 'mock-model',
): Promise<void> {
  await goToProvidersTab(win);
  await win.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await win.getByRole('button', { name: /add custom provider/i }).click();
  await win.getByPlaceholder('Ollama', { exact: true }).fill(name);
  await win.getByPlaceholder('http://localhost:11434/v1').fill(baseUrl);
  const modelInput = win.getByPlaceholder('llama3.2');
  await modelInput.scrollIntoViewIfNeeded();
  await modelInput.fill(model);
  await win.getByRole('button', { name: /^save$/i }).click();
  // Wait for the card to appear, confirming the provider was saved
  await expect(win.getByText(name).first()).toBeVisible({ timeout: 10_000 });
}

async function buildComposition(
  win: Page,
  name: string,
  voicePatterns: RegExp[],
  mode: 'conductor' | 'broadcast' = 'conductor',
  continuationPolicy?: 'none' | 'prompt' | 'auto',
): Promise<void> {
  await win.getByRole('button', { name: /compositions/i }).click();
  await win.getByRole('button', { name: 'New Composition', exact: true }).first().click();
  await win.getByPlaceholder('My Composition').fill(name);
  if (mode === 'broadcast') {
    await win.getByRole('button', { name: /broadcast/i }).first().click();
    if (continuationPolicy === 'prompt') {
      await win.getByRole('button', { name: /^Prompt me$/i }).click();
    } else if (continuationPolicy === 'auto') {
      await win.getByRole('button', { name: /^Auto$/i }).click();
    }
  }
  for (const pattern of voicePatterns) {
    await win.getByRole('button', { name: pattern }).first().click();
    await win.getByRole('button', { name: 'Add Voice' }).click();
  }
  await win.getByRole('button', { name: 'Save Composition' }).click();
}

async function startSession(win: Page, compositionPattern: RegExp, sessionName: string): Promise<void> {
  await win.getByRole('button', { name: /sessions/i }).click();
  await win.getByRole('button', { name: 'New Session', exact: true }).click();
  await win.getByRole('button', { name: compositionPattern }).first().click();
  await win.getByPlaceholder('My session').fill(sessionName);
  await win.getByRole('button', { name: 'Start Session' }).click();
  await expect(win.getByPlaceholder('Message the ensemble\u2026')).toBeVisible({ timeout: 10_000 });
}

async function sendMessage(win: Page, message: string): Promise<void> {
  await win.getByPlaceholder('Message the ensemble\u2026').fill(message);
  await win.keyboard.press('Enter');
}

async function expectMockResponse(win: Page): Promise<void> {
  await expect(win.getByText(MOCK_COMPLETION_TEXT).first()).toBeVisible({ timeout: 20_000 });
}

async function waitIdle(win: Page): Promise<void> {
  await expect(win.getByPlaceholder('Message the ensemble\u2026')).toBeVisible({ timeout: 20_000 });
}

// ── Shared lifecycle ──────────────────────────────────────────────────────────

let app: ElectronApplication;
let win: Page;
let mockServer: MockOpenAIServer;

test.beforeAll(async () => {
  mockServer = await startMockOpenAIServer();

  app = await launchApp({ POLYPHON_TEST_USER_DATA: makeTempDir() });
  win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await skipOnboarding(win);

  // Register two custom providers, both pointing at the mock server
  await addCustomProvider(win, 'Alpha', mockServer.baseUrl);
  await addCustomProvider(win, 'Beta', mockServer.baseUrl);
});

test.afterAll(async () => {
  const pid = app?.process().pid;
  if (pid != null) {
    try { process.kill(-pid, 'SIGTERM'); } catch { /* already gone */ }
  }
  await app?.close().catch(() => {});
  await mockServer?.stop();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

test('custom providers appear on the dashboard', async () => {
  await goToHome(win);
  await expect(win.getByText('Alpha')).toBeVisible({ timeout: 5_000 });
  await expect(win.getByText('Beta')).toBeVisible({ timeout: 5_000 });
});

test('single custom voice responds in conductor mode', async () => {
  await buildComposition(win, 'Compat Solo', [/Select Alpha provider/i]);
  await startSession(win, /Compat Solo/i, 'Compat Solo Session');
  await sendMessage(win, '@Alpha Hello!');

  await expectMockResponse(win);
  await waitIdle(win);
});

test('single custom voice responds in broadcast mode', async () => {
  await buildComposition(win, 'Compat Broadcast', [/Select Alpha provider/i], 'broadcast');
  await startSession(win, /Compat Broadcast/i, 'Compat Broadcast Session');
  await sendMessage(win, 'Hello!');

  await expectMockResponse(win);
  await waitIdle(win);
});

test('broadcast with "prompt" policy shows continuation nudge and resumes on Allow', async () => {
  await buildComposition(win, 'Compat Prompt', [/Select Alpha provider/i], 'broadcast', 'prompt');
  await startSession(win, /Compat Prompt/i, 'Compat Prompt Session');
  await sendMessage(win, 'Start');

  // First round response
  const responses = win.getByText(MOCK_COMPLETION_TEXT);
  await expect(responses.first()).toBeVisible({ timeout: 20_000 });

  // Nudge banner appears
  await expect(win.getByText(/Agents have more to say/i)).toBeVisible({ timeout: 10_000 });

  // Allow triggers a second round
  await win.getByRole('button', { name: /^Allow$/i }).click();
  await expect(responses.nth(1)).toBeVisible({ timeout: 20_000 });

  // Dismiss the follow-up nudge to stop further rounds
  await expect(win.getByText(/Agents have more to say/i)).toBeVisible({ timeout: 10_000 });
  await win.getByRole('button', { name: /^Dismiss$/i }).click();
  await waitIdle(win);
});

test('broadcast with "auto" policy voices respond across continuation rounds without user input', async () => {
  await buildComposition(win, 'Compat Auto', [/Select Alpha provider/i], 'broadcast', 'auto');
  await startSession(win, /Compat Auto/i, 'Compat Auto Session');
  await sendMessage(win, 'Go');

  // Auto continuation triggers at least one more round without any user action
  const responses = win.getByText(MOCK_COMPLETION_TEXT);
  await expect(responses.first()).toBeVisible({ timeout: 20_000 });
  await expect(responses.nth(1)).toBeVisible({ timeout: 30_000 });
  await waitIdle(win);
});

test('two custom voices both respond in broadcast mode', async () => {
  await buildComposition(win, 'Compat Duo', [/Select Alpha provider/i, /Select Beta provider/i], 'broadcast');
  await startSession(win, /Compat Duo/i, 'Compat Duo Session');
  await sendMessage(win, 'Hello everyone!');

  // Both Alpha and Beta should each emit MOCK_COMPLETION_TEXT
  const responses = win.getByText(MOCK_COMPLETION_TEXT);
  await expect(responses.first()).toBeVisible({ timeout: 20_000 });
  await expect(responses.nth(1)).toBeVisible({ timeout: 20_000 });
  await waitIdle(win);
});

test('custom voice responds across multiple rounds', async () => {
  await buildComposition(win, 'Compat Multi', [/Select Alpha provider/i], 'broadcast');
  await startSession(win, /Compat Multi/i, 'Compat Multi Session');

  await sendMessage(win, 'Round one');
  await expectMockResponse(win);
  await waitIdle(win);

  await sendMessage(win, 'Round two');
  const responses = win.getByText(MOCK_COMPLETION_TEXT);
  await expect(responses.nth(1)).toBeVisible({ timeout: 20_000 });
  await waitIdle(win);
});

test('custom providers are visible in the Providers settings tab', async () => {
  await goToProvidersTab(win);
  await win.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(win.getByText('Alpha').first()).toBeVisible({ timeout: 5_000 });
  await expect(win.getByText('Beta').first()).toBeVisible({ timeout: 5_000 });
});
