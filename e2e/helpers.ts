import { type Page, _electron as electron } from '@playwright/test';
import path from 'path';
import os from 'os';
import fs from 'fs';

export const APP_ENTRY = path.join(__dirname, '..', '.vite', 'build', 'main.js');

const SENSITIVE_ENV_PATTERNS = [
  /(^|_)API_KEY$/i,
  /(^|_)(TOKEN|SECRET|PASSWORD)$/i,
];

export function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'polyphon-e2e-'));
}

function buildTestEnv(extraEnv: Record<string, string>): Record<string, string> {
  const scrubbedEnv = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !SENSITIVE_ENV_PATTERNS.some((pattern) => pattern.test(key)),
    ),
  );

  return {
    ...scrubbedEnv,
    NODE_ENV: 'test',
    POLYPHON_TEST_USER_DATA: makeTempDir(),
    POLYPHON_E2E: '1',
    ...extraEnv,
  };
}

// In CI (headless VMs without a real GPU), Electron's GPU process either hangs
// against Xvfb on Linux or crashes the Windows driver. --disable-gpu forces
// software rendering from the start, keeping behaviour consistent across runners.
const ELECTRON_ARGS = [
  APP_ENTRY,
  '--no-sandbox',
  ...(process.env.CI ? ['--disable-gpu'] : []),
];

export function launchApp(extraEnv: Record<string, string> = {}, options: { slowMo?: number } = {}) {
  return electron.launch({
    args: ELECTRON_ARGS,
    env: buildTestEnv(extraEnv),
    ...options,
  });
}

export function launchMockApp(extraEnv: Record<string, string> = {}) {
  return launchApp({ POLYPHON_MOCK_VOICES: '1', ...extraEnv });
}

/**
 * Navigate to the Providers tab in Settings.
 * Required after clicking the Settings button since the default tab is now Conductor.
 */
export async function goToProvidersTab(window: Page): Promise<void> {
  await window.getByRole('button', { name: /settings/i }).click();
  await window.getByRole('tab', { name: /^providers$/i }).click();
}

/**
 * Navigate to the Conductor tab in Settings.
 */
export async function goToConductorTab(window: Page): Promise<void> {
  await window.getByRole('button', { name: /settings/i }).click();
  await window.getByRole('tab', { name: /^conductor$/i }).click();
}

/**
 * Enable all provider toggles that are currently OFF.
 * Navigates to the Providers tab and clicks each disabled switch once.
 */
export async function enableProviders(window: Page): Promise<void> {
  await goToProvidersTab(window);
  const { expect } = await import('@playwright/test');
  const toggles = window.getByRole('switch');
  const count = await toggles.count();
  for (let i = 0; i < count; i++) {
    const toggle = toggles.nth(i);
    if ((await toggle.getAttribute('aria-checked')) === 'false') {
      await toggle.click();
      await expect(window.getByText('Saved').first()).toBeVisible({ timeout: 15_000 });
    }
  }
}

/**
 * Navigate to the Tones tab in Settings.
 */
export async function goToTonesTab(window: Page): Promise<void> {
  await window.getByRole('button', { name: /settings/i }).click();
  await window.getByRole('tab', { name: /^tones$/i }).click();
}

/**
 * Navigate to the System Prompts tab in Settings.
 */
export async function goToSystemPromptsTab(window: Page): Promise<void> {
  await window.getByRole('button', { name: /settings/i }).click();
  await window.getByRole('tab', { name: /^system prompts$/i }).click();
}

/**
 * Navigate to the Encryption tab in Settings.
 */
export async function goToEncryptionTab(window: Page): Promise<void> {
  await window.getByRole('button', { name: /settings/i }).click();
  await window.getByRole('tab', { name: /^encryption$/i }).click();
}

/**
 * Navigate to the home dashboard.
 * Works regardless of whether the sidebar is expanded or collapsed.
 */
export async function goToHome(window: Page): Promise<void> {
  // Expanded sidebar: wordmark button (img alt="Polyphon")
  // Collapsed sidebar: icon button (aria-label="Home")
  const btn = window.getByRole('button', { name: 'Polyphon' }).or(window.getByRole('button', { name: 'Home' }));
  await btn.first().click();
}

/**
 * Dismiss the first-run onboarding modal by clicking "Skip for now".
 * Safe to call even if the modal does not appear (e.g. profile already set).
 *
 * Waits for the app to reach a stable post-load state before checking for the
 * modal, to avoid a race where the profile IPC response arrives after the
 * initial 5-second window and triggers the onboarding modal unexpectedly.
 */
export async function skipOnboarding(window: Page): Promise<void> {
  const skipBtn = window.getByRole('button', { name: /skip for now/i });
  const homeContent = window.getByRole('button', { name: /sessions/i });

  // Wait for either the onboarding modal or the home content to appear —
  // whichever comes first signals the profile has finished loading.
  await Promise.race([
    skipBtn.waitFor({ state: 'visible', timeout: 15_000 }),
    homeContent.waitFor({ state: 'visible', timeout: 15_000 }),
  ]).catch(() => {});

  if (await skipBtn.isVisible()) {
    await skipBtn.click();
    await skipBtn.waitFor({ state: 'hidden', timeout: 5_000 });
  }
}

/**
 * Launch the app, wait for the window to be ready, and dismiss onboarding.
 * Returns [app, window] ready for test interactions.
 */
export async function setupApp(extraEnv: Record<string, string> = {}) {
  const app = await launchApp(extraEnv);
  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  await skipOnboarding(window);
  return { app, window };
}

/**
 * Like setupApp but with POLYPHON_MOCK_VOICES=1.
 */
export async function setupMockApp(extraEnv: Record<string, string> = {}) {
  return setupApp({ POLYPHON_MOCK_VOICES: '1', ...extraEnv });
}

/**
 * Build an env block for live e2e tests.
 * Unlike buildTestEnv, this does NOT scrub credential env vars — API keys and tokens
 * from the developer's shell are passed through intentionally.
 * Named distinctly to prevent accidental use in mock tests.
 */
export function buildLiveTestEnv(extraEnv: Record<string, string> = {}): Record<string, string> {
  return {
    ...(process.env as Record<string, string>),
    NODE_ENV: 'test',
    POLYPHON_TEST_USER_DATA: makeTempDir(),
    POLYPHON_E2E: '1',
    POLYPHON_SHOW_WINDOW: '1',
    ...extraEnv,
  };
}

/**
 * Launch the Electron app with live credentials from the developer's env.
 * Use only in *.e2e-live.test.ts files — never in mock tests.
 */
export function launchLiveApp(extraEnv: Record<string, string> = {}) {
  return electron.launch({
    args: ELECTRON_ARGS,
    env: buildLiveTestEnv(extraEnv),
  });
}

/**
 * Launch the live app, wait for the window to be ready, and dismiss onboarding.
 * Returns [app, window] ready for test interactions.
 */
export async function setupLiveApp(extraEnv: Record<string, string> = {}) {
  const app = await launchLiveApp(extraEnv);
  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  await skipOnboarding(window);
  return { app, window };
}
