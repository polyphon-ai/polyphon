/**
 * take-screenshots.ts
 *
 * Standalone Playwright + Electron script that launches the Polyphon app with
 * live voice providers, drives the UI through each required state, captures
 * WebP screenshots, and rewrites markdown files to replace screenshot
 * placeholder blockquotes with real image references.
 *
 * Usage:
 *   npx tsx scripts/take-screenshots.ts
 *   make screenshots
 *
 * Requirements:
 *   - .vite/build/main.js must exist (run `make build` or `npm run build:e2e` first)
 *   - API keys (ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.) and/or CLI tools
 *     (claude, codex, copilot) must be available in the shell environment
 */

import path from 'path';
import fs from 'fs';
import os from 'os';
import { type Page, _electron as electron } from '@playwright/test';
import type { ElectronApplication } from '@playwright/test';
import sharp from 'sharp';

// ── Constants ─────────────────────────────────────────────────────────────────

const REPO_ROOT = path.join(__dirname, '..');
const SITE_STATIC = path.join(REPO_ROOT, 'site', 'static');
const APP_ENTRY = path.join(REPO_ROOT, '.vite', 'build', 'main.js');

// ── Startup guard ─────────────────────────────────────────────────────────────

if (!fs.existsSync(APP_ENTRY)) {
  console.error(`\nERROR: ${APP_ENTRY} not found.`);
  console.error('Run "make build" or "npm run build:e2e" before taking screenshots.\n');
  process.exit(1);
}

// ── Run counters ──────────────────────────────────────────────────────────────

let captured = 0;
let replaced = 0;
const skipped: { file: string; reason: string }[] = [];

// ── App launch helpers ────────────────────────────────────────────────────────

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'polyphon-screenshots-'));
}

function buildEnv(extra: Record<string, string> = {}): Record<string, string> {
  return {
    ...(process.env as Record<string, string>),
    NODE_ENV: 'test',
    POLYPHON_TEST_USER_DATA: makeTempDir(),
    POLYPHON_E2E: '1',
    POLYPHON_SHOW_WINDOW: '1',
    POLYPHON_NO_DEVTOOLS: '1',
    ...extra,
  };
}

async function launchApp(
  extra: Record<string, string> = {},
  opts: { skipOnboarding?: boolean } = {},
): Promise<{ app: ElectronApplication; window: Page }> {
  const app = await electron.launch({
    args: [APP_ENTRY, '--no-sandbox'],
    env: buildEnv(extra),
  });
  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  if (opts.skipOnboarding !== false) {
    await skipOnboarding(window);
    // Wait for the main UI to be fully rendered
    await window.getByRole('button', { name: /settings/i }).waitFor({ state: 'visible', timeout: 15_000 });
    await window.waitForTimeout(300);
  }
  return { app, window };
}

async function skipOnboarding(window: Page): Promise<void> {
  const skipBtn = window.getByRole('button', { name: /skip for now/i });
  try {
    await skipBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await skipBtn.click();
    await skipBtn.waitFor({ state: 'hidden', timeout: 3_000 });
  } catch {
    // no onboarding modal
  }
}

// ── Image capture helpers ─────────────────────────────────────────────────────

/**
 * Capture a full-page screenshot, convert to WebP, and write to site/static/<outputPath>.
 * outputPath is relative to site/static/, e.g. "images/screenshots/settings/tones.webp"
 */
async function captureWebP(window: Page, outputPath: string): Promise<void> {
  const absPath = path.join(SITE_STATIC, outputPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });

  const pngBuffer = await window.screenshot({ fullPage: false });
  await sharp(pngBuffer)
    .webp({ quality: 85 })
    .toFile(absPath);

  const stats = fs.statSync(absPath);
  const kb = Math.round(stats.size / 1024);
  if (kb > 500) {
    console.warn(`  WARNING: ${outputPath} is ${kb}KB (exceeds 500KB limit)`);
  }
  captured++;
  console.log(`  ✓ ${outputPath} (${kb}KB)`);
}

/**
 * Like captureWebP but clips the screenshot vertically to just below a given locator,
 * removing blank space at the bottom. Full width is always captured.
 * Falls back to a full-window capture if the locator's bounding box can't be determined.
 */
async function captureClippedWebP(
  window: Page,
  clipTo: import('@playwright/test').Locator,
  outputPath: string,
): Promise<void> {
  const box = await clipTo.boundingBox();
  if (!box) return captureWebP(window, outputPath);

  const absPath = path.join(SITE_STATIC, outputPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });

  const viewportSize = window.viewportSize();
  const fullWidth = viewportSize?.width ?? 1400;
  const clipHeight = Math.ceil(box.y + box.height) + 24; // 24px bottom padding

  const pngBuffer = await window.screenshot({
    fullPage: false,
    clip: { x: 0, y: 0, width: fullWidth, height: clipHeight },
  });
  await sharp(pngBuffer)
    .webp({ quality: 85 })
    .toFile(absPath);

  const stats = fs.statSync(absPath);
  const kb = Math.round(stats.size / 1024);
  if (kb > 500) {
    console.warn(`  WARNING: ${outputPath} is ${kb}KB (exceeds 500KB limit)`);
  }
  captured++;
  console.log(`  ✓ ${outputPath} (${kb}KB)`);
}

// ── Markdown replacement helpers ──────────────────────────────────────────────

/**
 * Replace a screenshot placeholder blockquote with a real image reference.
 * Matching uses string includes() — no regex.
 * Idempotent: if the image reference is already present, skips.
 */
function replacePlaceholder(
  filePath: string,
  placeholder: string,
  outputPath: string,
  alt: string,
): void {
  const absFile = path.join(REPO_ROOT, filePath);
  const content = fs.readFileSync(absFile, 'utf8');

  const imgPath = '/' + outputPath.replace(/\\/g, '/');
  const imgRef = `![${alt}](${imgPath})`;

  // Markdown reference already present — image file was recaptured above, no markdown change needed
  if (content.includes(imgPath)) {
    return;
  }

  // Find the placeholder line — use string includes, not regex
  const lines = content.split('\n');
  const blockquotePrefix = '> **Screenshot placeholder:**';
  let found = false;

  const updated = lines.map((line) => {
    if (!found && line.startsWith(blockquotePrefix) && line.includes(placeholder)) {
      found = true;
      return imgRef;
    }
    return line;
  });

  if (!found) {
    console.error(`\nERROR: Placeholder not found in ${filePath}:`);
    console.error(`  "${placeholder}"`);
    process.exit(1);
  }

  fs.writeFileSync(absFile, updated.join('\n'), 'utf8');
  replaced++;
}

// ── Navigation helpers ────────────────────────────────────────────────────────

async function goToSettings(window: Page): Promise<void> {
  await window.getByRole('button', { name: /settings/i }).click();
  await window.waitForTimeout(300);
}

async function goToSettingsTab(window: Page, tab: string): Promise<void> {
  await goToSettings(window);
  await window.getByRole('tab', { name: new RegExp(`^${tab}$`, 'i') }).click();
  await window.waitForTimeout(300);
}

async function goToCompositions(window: Page): Promise<void> {
  await window.getByRole('button', { name: /compositions/i }).click();
  await window.waitForTimeout(300);
}

async function goToSessions(window: Page): Promise<void> {
  await window.getByRole('button', { name: /^sessions$/i }).click();
  await window.waitForTimeout(300);
}

// ── Provider helpers ──────────────────────────────────────────────────────────

async function enableAllProviders(window: Page): Promise<void> {
  await goToSettingsTab(window, 'Providers');
  const toggles = window.getByRole('switch');
  const count = await toggles.count();
  for (let i = 0; i < count; i++) {
    const checked = await toggles.nth(i).getAttribute('aria-checked');
    if (checked !== 'true') {
      await toggles.nth(i).click();
      await window.getByText('Saved').first().waitFor({ state: 'visible', timeout: 5_000 });
    }
  }
  await window.waitForTimeout(300);
}

async function createCustomProvider(window: Page, name: string, baseUrl: string): Promise<void> {
  // Scroll the overflow container to bring the Add Custom Provider button into view
  const addBtn = window.getByRole('button', { name: /add custom provider/i });
  await addBtn.scrollIntoViewIfNeeded();
  await window.waitForTimeout(300);

  await addBtn.click();
  await window.waitForTimeout(300);

  await window.getByPlaceholder('Ollama', { exact: true }).fill(name);
  await window.getByPlaceholder(/http:\/\/localhost:11434\/v1/i).fill(baseUrl);
  const modelInput = window.getByPlaceholder('llama3.2');
  await modelInput.scrollIntoViewIfNeeded();
  await modelInput.fill('llama3.2');
  await window.getByRole('button', { name: /^save$/i }).click();
  await window.waitForTimeout(500);
}

async function createTone(window: Page, name: string, description: string, instructions: string): Promise<void> {
  await window.getByRole('button', { name: /add tone/i }).click();
  await window.waitForTimeout(200);
  await window.getByPlaceholder(/motivational/i).fill(name);
  await window.getByPlaceholder(/describe the tone/i).fill(description);
  // Instructions textarea — fill the system instructions field if present
  const instructionsArea = window.locator('textarea').filter({ hasText: '' }).nth(1);
  try {
    await instructionsArea.fill(instructions, { timeout: 1_000 });
  } catch {
    // instructions field may not be present in this version
  }
  await window.getByRole('button', { name: /^save$/i }).click();
  await window.getByRole('button', { name: /add tone/i }).waitFor({ state: 'visible', timeout: 5_000 });
  await window.waitForTimeout(200);
}

async function createTemplate(window: Page, name: string, content: string): Promise<void> {
  await window.getByRole('button', { name: /add template/i }).click();
  await window.waitForTimeout(200);
  await window.getByPlaceholder(/code review assistant/i).fill(name);
  await window.getByPlaceholder(/you are a careful code reviewer/i).fill(content);
  await window.getByRole('button', { name: /^save$/i }).click();
  await window.getByRole('button', { name: /add template/i }).waitFor({ state: 'visible', timeout: 5_000 });
  await window.waitForTimeout(200);
}

async function fillConductorProfile(window: Page, name: string, pronouns: string, context: string): Promise<void> {
  const nameInput = window.getByLabel(/conductor name/i);
  await nameInput.fill(name);
  await nameInput.blur();

  // Pronouns — try a select or input
  try {
    const pronounsSelect = window.getByLabel(/pronouns/i);
    await pronounsSelect.fill(pronouns);
    await pronounsSelect.blur();
  } catch {
    // pronouns might be a different element type
  }

  const contextArea = window.getByLabel(/background/i);
  await contextArea.fill(context);
  await contextArea.blur();
  await window.waitForTimeout(500);
}

// ── Composition helpers ───────────────────────────────────────────────────────

async function openNewComposition(window: Page): Promise<void> {
  await goToCompositions(window);
  await window.getByRole('button', { name: 'New Composition', exact: true }).first().click();
  await window.waitForTimeout(300);
}

async function buildComposition(
  window: Page,
  name: string,
  providers: string[],
  opts: {
    mode?: 'broadcast' | 'conductor';
    continuationPolicy?: 'none' | 'prompt' | 'auto';
  } = {},
): Promise<void> {
  const { mode = 'broadcast', continuationPolicy = 'none' } = opts;
  await openNewComposition(window);
  await window.getByPlaceholder('My Composition').fill(name);

  if (mode === 'broadcast') {
    await window.getByRole('button', { name: /broadcast/i }).first().click();
    if (continuationPolicy !== 'none') {
      const label = continuationPolicy === 'prompt' ? 'Prompt me' : 'Auto';
      await window.getByRole('button', { name: label }).click();
    }
  }

  for (const provider of providers) {
    await window.getByRole('button', { name: provider }).first().click();
    await window.getByRole('button', { name: 'Add Voice' }).click();
    await window.waitForTimeout(200);
  }

  await window.getByRole('button', { name: 'Save Composition' }).click();
  await window.waitForTimeout(500);
}

async function startSession(window: Page, compositionName: string, sessionName: string): Promise<void> {
  await goToSessions(window);
  await window.getByRole('button', { name: 'New Session', exact: true }).click();
  await window.waitForTimeout(300);

  const escaped = compositionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await window.getByRole('button', { name: new RegExp(escaped, 'i') }).first().click();
  await window.getByPlaceholder('My session').fill(sessionName);
  await window.getByRole('button', { name: 'Start Session' }).click();
  await window.getByPlaceholder('Message the ensemble\u2026').waitFor({ state: 'visible', timeout: 20_000 });
  await window.waitForTimeout(300);
}

async function sendMessage(window: Page, message: string): Promise<void> {
  await window.getByPlaceholder('Message the ensemble\u2026').fill(message);
  await window.keyboard.press('Enter');
}

async function waitForSessionIdle(window: Page, timeout = 120_000): Promise<void> {
  await window.getByPlaceholder('Message the ensemble\u2026').waitFor({ state: 'visible', timeout });
}

// ── Screenshot manifest ───────────────────────────────────────────────────────

interface ScreenshotSpec {
  file: string;
  placeholder: string;
  output: string;
  alt: string;
}

const MANIFEST: ScreenshotSpec[] = [
  // ── home ──────────────────────────────────────────────────────────────────
  {
    file: 'site/content/_index.md',
    placeholder: 'Main application window showing a live session with three voices',
    output: 'images/screenshots/home/live-session.webp',
    alt: 'Polyphon session view showing three voices that have each responded',
  },
  {
    file: 'site/content/_index.md',
    placeholder: 'Composition Builder showing three voices with different providers configured',
    output: 'images/screenshots/home/composition-builder.webp',
    alt: 'Composition Builder with three voices from different providers',
  },
  {
    file: 'site/content/_index.md',
    placeholder: 'Session view showing continuation rounds in progress',
    output: 'images/screenshots/home/continuation-session.webp',
    alt: 'Session showing continuation round in progress with voices streaming',
  },
  // ── compositions ──────────────────────────────────────────────────────────
  {
    file: 'site/content/docs/compositions.md',
    placeholder: 'Compositions — sidebar showing the New Composition button below the session list',
    output: 'images/screenshots/compositions/sidebar-new-button.webp',
    alt: 'Sidebar showing the New Composition button below the session list',
  },
  {
    file: 'site/content/docs/compositions.md',
    placeholder: 'Compositions — Composition Builder in empty state: name field, mode selector (Conductor-Directed / Broadcast buttons), and Add Voice button visible',
    output: 'images/screenshots/compositions/builder-empty.webp',
    alt: 'Composition Builder in empty state with name field, mode selector, and Add Voice button',
  },
  {
    file: 'site/content/docs/compositions.md',
    placeholder: 'Compositions — Composition Builder showing Broadcast mode selected and the Continuation policy cards (None, Prompt me, Auto) with Auto selected and the Max rounds slider visible',
    output: 'images/screenshots/compositions/builder-continuation-auto.webp',
    alt: 'Composition Builder showing Broadcast mode with continuation policy set to Auto and Max rounds slider visible',
  },
  {
    file: 'site/content/docs/compositions.md',
    placeholder: 'Compositions — voice configuration panel with provider, model, display name, avatar icon, color, and tone all configured; Tools section visible below system prompt showing available tool toggles',
    output: 'images/screenshots/compositions/builder-voice-config-full.webp',
    alt: 'Voice configuration panel fully configured with provider, model, display name, avatar icon, color, tone, and Tools section visible',
  },
  {
    file: 'site/content/docs/compositions.md',
    placeholder: 'Compositions — voice configuration panel showing the Tools section with some read-only tools enabled; amber warning visible for write-capable tools',
    output: 'images/screenshots/compositions/builder-voice-tools.webp',
    alt: 'Voice configuration panel showing Tools section with read-only tools checked and write-capable tools unchecked',
  },
  {
    file: 'site/content/docs/compositions.md',
    placeholder: 'Compositions — voice configuration panel with a system prompt template attached; "Template attached" badge visible next to the template dropdown',
    output: 'images/screenshots/compositions/builder-template-attached.webp',
    alt: 'Voice configuration panel with Security Reviewer template attached and Template attached badge visible',
  },
  {
    file: 'site/content/docs/compositions.md',
    placeholder: 'Compositions — voice list in the Composition Builder showing drag handles on each voice row',
    output: 'images/screenshots/compositions/builder-drag-handles.webp',
    alt: 'Composition Builder voice list with drag handles on each voice row',
  },
  {
    file: 'site/content/docs/compositions.md',
    placeholder: 'Compositions — saved composition detail view showing name, voice list, mode, continuation policy, and the Start Session button',
    output: 'images/screenshots/compositions/detail-start-session.webp',
    alt: 'Saved composition detail view showing name, voice list, mode, continuation policy, and Start Session button',
  },
  {
    file: 'site/content/docs/compositions.md',
    placeholder: 'Compositions — right-click context menu on a composition showing Archive and Delete options',
    output: 'images/screenshots/compositions/context-menu.webp',
    alt: 'Right-click context menu on a composition showing Archive and Delete options',
  },
  // ── concepts ──────────────────────────────────────────────────────────────
  {
    file: 'site/content/docs/concepts.md',
    placeholder: 'Concepts — sidebar showing several named compositions in the composition list',
    output: 'images/screenshots/compositions/concepts-composition-list.webp',
    alt: 'Composition list in the sidebar showing several named compositions',
  },
  {
    file: 'site/content/docs/concepts.md',
    placeholder: 'Concepts — active session with voice message bubbles; each bubble shows the voice name, its avatar icon, its color, and markdown-rendered response content',
    output: 'images/screenshots/sessions/concepts-active-session.webp',
    alt: 'Active session with voice message bubbles showing voice names, avatar icons, colors, and markdown-rendered content',
  },
  // ── conductor-profile ──────────────────────────────────────────────────────
  {
    file: 'site/content/docs/conductor-profile.md',
    placeholder: 'Conductor Profile — Settings → Conductor Profile tab showing avatar button, name, pronouns, default tone, and background fields in their default (empty) state',
    output: 'images/screenshots/settings/conductor-profile-empty.webp',
    alt: 'Conductor Profile tab showing all fields in default empty state',
  },
  {
    file: 'site/content/docs/conductor-profile.md',
    placeholder: 'Conductor Profile — AvatarEditor modal open with a photo loaded; circular crop preview visible with drag-to-reposition instructions, zoom slider, and rotate buttons; Cancel and Apply buttons at bottom',
    output: 'images/screenshots/settings/avatar-editor.webp',
    alt: 'AvatarEditor modal with circular crop preview, zoom slider, and rotate buttons',
  },
  {
    file: 'site/content/docs/conductor-profile.md',
    placeholder: 'Conductor Profile — Settings → Conductor Profile tab with avatar photo, name, pronouns, and background context all filled in',
    output: 'images/screenshots/settings/conductor-profile.webp',
    alt: 'Conductor Profile tab with avatar photo, name, pronouns, and background context filled in',
  },
  // ── custom-providers ──────────────────────────────────────────────────────
  {
    file: 'site/content/docs/custom-providers.md',
    placeholder: 'Custom Providers — Add Custom Provider form filled in with Local Ollama name, base URL set to http://localhost:11434/v1, API key env var left blank',
    output: 'images/screenshots/settings/custom-providers-add-form.webp',
    alt: 'Add Custom Provider form filled with Local Ollama details and base URL',
  },
  {
    file: 'site/content/docs/custom-providers.md',
    placeholder: 'Custom Providers — Custom Providers tab showing a saved "Local Ollama" provider card with the auth-less badge ("No API key required (auth-less endpoint)") and Edit / Delete buttons',
    output: 'images/screenshots/settings/custom-providers-tab.webp',
    alt: 'Custom Providers tab showing saved Local Ollama provider with auth-less badge and Edit / Delete buttons',
  },
  {
    file: 'site/content/docs/custom-providers.md',
    placeholder: 'Compositions — Composition Builder provider grid showing built-in providers alongside a custom "Local Ollama" provider with CUSTOM · API label',
    output: 'images/screenshots/compositions/builder-custom-provider-voice.webp',
    alt: 'Composition Builder provider grid with built-in providers and Local Ollama custom provider',
  },
  // ── getting-started ────────────────────────────────────────────────────────
  {
    file: 'site/content/docs/getting-started.md',
    placeholder: 'Onboarding — welcome dialog with avatar upload button, name field, pronouns dropdown, and "About me" context textarea visible; "Get started" and "Skip for now" buttons at bottom',
    output: 'images/screenshots/home/onboarding-welcome.webp',
    alt: 'Polyphon welcome dialog on first launch showing avatar button, name field, pronouns dropdown, and About me textarea',
  },
  // ── providers ──────────────────────────────────────────────────────────────
  {
    file: 'site/content/docs/providers.md',
    placeholder: 'Providers — Anthropic provider card expanded showing the API key status indicator and voice type selector (API / CLI)',
    output: 'images/screenshots/settings/providers-tab-anthropic-expanded.webp',
    alt: 'Anthropic provider card expanded showing API key status indicator and voice type selector',
  },
  {
    file: 'site/content/docs/providers.md',
    placeholder: 'Providers — Claude CLI provider card with "Available" status indicator shown',
    output: 'images/screenshots/settings/providers-tab-cli-available.webp',
    alt: 'Claude CLI provider card with Available status indicator',
  },
  {
    file: 'site/content/docs/providers.md',
    placeholder: 'Providers — Settings Providers tab showing multiple provider cards in different status states (Available, Key found, Not configured)',
    output: 'images/screenshots/settings/providers-status-cards.webp',
    alt: 'Provider settings showing multiple cards in different status states',
  },
  // ── sessions ──────────────────────────────────────────────────────────────
  {
    file: 'site/content/docs/sessions.md',
    placeholder: 'Sessions — sidebar showing the New Session (+) button at the top',
    output: 'images/screenshots/sessions/new-button.webp',
    alt: 'Sidebar showing the New Session (+) button at the top',
  },
  {
    file: 'site/content/docs/sessions.md',
    placeholder: 'Sessions — new session panel showing the composition picker, session name field, optional working directory field, and option to add voices manually',
    output: 'images/screenshots/sessions/new-panel.webp',
    alt: 'New session panel showing composition picker, session name field, optional working directory field, and option to add voices manually',
  },
  {
    file: 'site/content/docs/sessions.md',
    placeholder: 'Sessions — full session view: message feed with voice bubbles showing markdown-rendered responses with avatar icons and colors, voice panel on the right with status indicators, input bar at bottom',
    output: 'images/screenshots/sessions/full-view.webp',
    alt: 'Full session view showing message feed with voice bubbles and markdown content, voice panel, and input bar',
  },
  {
    file: 'site/content/docs/sessions.md',
    placeholder: 'Sessions — session in conductor-directed mode with "Directed" badge visible in the session header and a single voice highlighted in the voice panel',
    output: 'images/screenshots/sessions/conductor-mode-voice-panel.webp',
    alt: 'Session in conductor-directed mode with Directed badge and single voice highlighted',
  },
  {
    file: 'site/content/docs/sessions.md',
    placeholder: 'Sessions — right-click context menu on a session in the sidebar showing Archive and Delete options',
    output: 'images/screenshots/sessions/context-menu.webp',
    alt: 'Right-click context menu on a session showing Archive and Delete options',
  },
  {
    file: 'site/content/docs/sessions.md',
    placeholder: 'Sessions — new session panel with a working directory path entered and the "Sandbox API voices to this directory" checkbox visible',
    output: 'images/screenshots/sessions/new-panel-sandbox-checkbox.webp',
    alt: 'New session panel with working directory path entered and Sandbox API voices checkbox visible',
  },
  {
    file: 'site/content/docs/sessions.md',
    placeholder: 'Sessions — new session panel showing the amber warning that CLI voices are not affected by sandboxing, visible when the sandbox checkbox is checked in a composition that includes CLI voices',
    output: 'images/screenshots/sessions/new-panel-sandbox-cli-warning.webp',
    alt: 'New session panel showing amber warning that CLI voices are not affected by sandboxing',
  },
  {
    file: 'site/content/docs/sessions.md',
    placeholder: 'Sessions — session header showing the green Sandboxed badge, working directory path, and Broadcast mode badge',
    output: 'images/screenshots/sessions/session-header-sandboxed.webp',
    alt: 'Session header showing green Sandboxed badge, working directory path, and Broadcast mode badge',
  },
  {
    file: 'site/content/docs/sessions.md',
    placeholder: 'Sessions — @ mention voice picker dropdown open in the conductor input showing active voice display names as selectable options',
    output: 'images/screenshots/sessions/at-mention-dropdown.webp',
    alt: '@ mention voice picker dropdown open in conductor input showing active voice display names',
  },
  {
    file: 'site/content/docs/sessions.md',
    placeholder: 'Sessions — continuation nudge banner visible in the session feed asking whether to continue to the next round, with Yes and Dismiss buttons',
    output: 'images/screenshots/sessions/continuation-nudge.webp',
    alt: 'Continuation nudge banner in session feed with Yes and Dismiss buttons',
  },
  {
    file: 'site/content/docs/sessions.md',
    placeholder: 'Sessions — session message feed showing a round divider separating round 1 and round 2 voice responses, with voice bubbles in both rounds',
    output: 'images/screenshots/sessions/continuation-round2.webp',
    alt: 'Session message feed showing round divider between round 1 and round 2 voice responses',
  },
  {
    file: 'site/content/docs/sessions.md',
    placeholder: 'Sessions — transcript export modal showing the three format options (Markdown, JSON, Plain text) with the unencrypted export note visible',
    output: 'images/screenshots/sessions/export-modal.webp',
    alt: 'Transcript export modal showing Markdown, JSON, and Plain text format options with unencrypted note',
  },
  // ── settings ──────────────────────────────────────────────────────────────
  {
    file: 'site/content/docs/settings.md',
    placeholder: 'Settings — full Settings page showing the tab navigation bar with all eight tabs visible (Conductor, Tones, System Prompts, Providers, Encryption, General, Logs, About)',
    output: 'images/screenshots/settings/settings-overview.webp',
    alt: 'Full Settings page showing the tab navigation bar with all eight tabs',
  },
  {
    file: 'site/content/docs/settings.md',
    placeholder: 'Settings — Providers tab showing all provider cards (Anthropic, OpenAI, Google, Claude CLI, Codex CLI, Copilot CLI) in their default states',
    output: 'images/screenshots/settings/providers-tab-all-cards.webp',
    alt: 'Settings Providers tab showing all provider cards in their default states',
  },
  {
    file: 'site/content/docs/settings.md',
    placeholder: 'Settings — Anthropic provider card expanded showing the voice type selector, API key field, and Fetch Models button',
    output: 'images/screenshots/settings/providers-tab-anthropic-expanded.webp',
    alt: 'Anthropic provider card expanded showing voice type selector, API key field, and Fetch Models button',
  },
  // ── system-prompt-templates ────────────────────────────────────────────────
  {
    file: 'site/content/docs/system-prompt-templates.md',
    placeholder: 'Templates — Settings → Templates tab showing the saved template list with names and content previews',
    output: 'images/screenshots/settings/templates-tab.webp',
    alt: 'System Prompts settings tab showing saved template list with names and previews',
  },
  {
    file: 'site/content/docs/system-prompt-templates.md',
    placeholder: 'Templates — template creation form with "Security Reviewer" name and content filled in',
    output: 'images/screenshots/settings/templates-add-form.webp',
    alt: 'Template creation form with Security Reviewer name and content filled in',
  },
  {
    file: 'site/content/docs/system-prompt-templates.md',
    placeholder: 'Compositions — voice configuration panel with the "Security Reviewer" template attached; "Template attached" badge visible, system prompt textarea pre-filled with template content',
    output: 'images/screenshots/compositions/builder-template-attached.webp',
    alt: 'Voice configuration panel with Security Reviewer template attached and textarea pre-filled',
  },
  // ── tools ──────────────────────────────────────────────────────────────────
  {
    file: 'site/content/docs/tools.md',
    placeholder: 'Tools — voice configuration panel in the Composition Builder showing the Tools section with checkboxes for each tool; read-only tools (Read File, List Directory, Search Files, Search File Contents, Fetch URL) checked; write-capable tools (Write File, Move / Rename File, Copy File, Delete File, Run Command) unchecked; amber write-capable warning visible below the toggles',
    output: 'images/screenshots/compositions/builder-voice-tools.webp',
    alt: 'Voice configuration panel showing Tools section with read-only tools checked and write-capable tools unchecked',
  },
  // ── tones ──────────────────────────────────────────────────────────────────
  {
    file: 'site/content/docs/tones.md',
    placeholder: 'Tones — Settings → Tones tab showing the five built-in tone cards with names, descriptions, and Edit / Delete buttons',
    output: 'images/screenshots/settings/tones-tab-builtins.webp',
    alt: 'Tones settings tab showing five built-in tone cards with names, descriptions, and Edit / Delete buttons',
  },
  {
    file: 'site/content/docs/tones.md',
    placeholder: 'Tones — custom tone creation form with "Socratic" as name and a question-first reasoning description filled in',
    output: 'images/screenshots/settings/tones-add-form.webp',
    alt: 'Custom tone creation form with Socratic name and question-first reasoning description',
  },
  {
    file: 'site/content/docs/tones.md',
    placeholder: 'Tones — Tones tab showing the five built-in tones plus a custom "Socratic" tone, all with Edit and Delete buttons',
    output: 'images/screenshots/settings/tones-tab-with-custom.webp',
    alt: 'Tones tab showing five built-in tones plus custom Socratic tone with Edit and Delete buttons',
  },
  {
    file: 'site/content/docs/tones.md',
    placeholder: 'Compositions — voice configuration tone dropdown open showing all built-in and custom tones, with "Use conductor default" at the top',
    output: 'images/screenshots/compositions/builder-tone-dropdown.webp',
    alt: 'Voice configuration tone dropdown open showing all built-in and custom tones',
  },
];

// ── Track helpers (shared app state) ─────────────────────────────────────────

async function runTrack1(app2: ElectronApplication, window2: Page): Promise<void> {
  console.log('\n── Track 1: First-launch clean state ───────────────────────────');
  // Onboarding modal is visible on first launch — capture it before dismissing
  const skipBtn = window2.getByRole('button', { name: /skip for now/i });
  await skipBtn.waitFor({ state: 'visible', timeout: 10_000 });
  // Capture the modal in its empty state first — all fields visible but nothing filled
  await window2.waitForTimeout(300);
  await captureWebP(window2, 'images/screenshots/home/onboarding-welcome.webp');
  await app2.close();
}

async function runTrack2(window: Page): Promise<void> {
  console.log('\n── Track 2: Settings and configuration ──────────────────────────');

  // 2a: Navigate to Settings, Conductor tab (default)
  await goToSettings(window);
  await captureWebP(window, 'images/screenshots/settings/settings-overview.webp');

  // 2a: Conductor Profile — empty state (Settings opens on Conductor Profile tab)
  await captureWebP(window, 'images/screenshots/settings/conductor-profile-empty.webp');

  // 2a-avatar: Open AvatarEditor by intercepting pickAvatarFile with a synthetic image
  try {
    // Create a synthetic gradient image data URL and override the IPC call
    await window.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 400; canvas.height = 400;
      const ctx = canvas.getContext('2d')!;
      const grad = ctx.createLinearGradient(0, 0, 400, 400);
      grad.addColorStop(0, '#4f46e5');
      grad.addColorStop(1, '#7c3aed');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 400, 400);
      // Add a circle so it looks like a face silhouette
      ctx.fillStyle = '#c7d2fe';
      ctx.beginPath(); ctx.arc(200, 160, 80, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#818cf8';
      ctx.beginPath(); ctx.arc(200, 320, 140, Math.PI, 0); ctx.fill();
      // @ts-ignore
      (window as any).__testAvatarDataUrl = canvas.toDataURL('image/png');
      // Override pickAvatarFile to return our synthetic image
      // @ts-ignore
      (window as any).polyphon.settings.pickAvatarFile = async () =>
        (window as any).__testAvatarDataUrl;
    });
    // Click the avatar button (circular button at the top of the Conductor Profile tab)
    const avatarBtn = window.locator('button').filter({ has: window.locator('svg') }).first();
    // Try a more targeted locator — the avatar button typically has a specific test id or aria label
    const avatarTrigger = window.getByRole('button', { name: /upload|avatar|photo/i }).first();
    try {
      await avatarTrigger.waitFor({ state: 'visible', timeout: 3_000 });
      await avatarTrigger.click();
    } catch {
      // Fallback: click the circular avatar button by its position/class
      await avatarBtn.click();
    }
    await window.waitForTimeout(800);
    // AvatarEditor modal should now be open — capture it
    const applyBtn = window.getByRole('button', { name: /apply/i });
    await applyBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await captureWebP(window, 'images/screenshots/settings/avatar-editor.webp');
    // Apply the crop to proceed
    await applyBtn.click();
    await window.waitForTimeout(500);
  } catch {
    console.warn('  WARN: AvatarEditor capture failed — skipping avatar-editor.webp');
  }

  // 2a: Fill conductor profile fields (avatar already applied above if successful)
  try {
    const nameInput = window.getByPlaceholder(/your name/i);
    await nameInput.fill('Alex Rivera');
    await nameInput.blur();
    await window.waitForTimeout(300);
    const contextArea = window.getByPlaceholder(/background/i).first();
    await contextArea.fill('Senior software engineer working on distributed systems and developer tooling.');
    await contextArea.blur();
    await window.waitForTimeout(500);
  } catch {
    // fields might use different placeholders
  }
  await captureWebP(window, 'images/screenshots/settings/conductor-profile.webp');

  // 2b: Navigate to Providers tab
  await window.getByRole('tab', { name: /^providers$/i }).click();
  await window.waitForTimeout(500);

  // All 4 providers off — capture status overview
  await captureWebP(window, 'images/screenshots/settings/providers-status-cards.webp');

  // Enable Anthropic (first toggle)
  const toggles = window.getByRole('switch');
  await toggles.nth(0).click();
  await window.getByText('Saved').first().waitFor({ state: 'visible', timeout: 5_000 });
  await window.waitForTimeout(300);

  // Anthropic expanded
  await captureWebP(window, 'images/screenshots/settings/providers-tab-anthropic-expanded.webp');

  // Enable remaining providers
  const totalToggles = await toggles.count();
  for (let i = 1; i < totalToggles; i++) {
    const checked = await toggles.nth(i).getAttribute('aria-checked');
    if (checked !== 'true') {
      await toggles.nth(i).click();
      await window.getByText('Saved').first().waitFor({ state: 'visible', timeout: 5_000 });
      await window.waitForTimeout(200);
    }
  }

  // All providers enabled — overview
  await captureWebP(window, 'images/screenshots/settings/providers-tab-all-cards.webp');

  // CLI provider (last card) — capture "Available" state (mock mode reports CLI as available)
  await captureWebP(window, 'images/screenshots/settings/providers-tab-cli-available.webp');

  // 2b-about: Navigate to About tab and capture
  try {
    await window.getByRole('tab', { name: /^about$/i }).click();
    await window.waitForTimeout(500);
    await captureWebP(window, 'images/screenshots/settings/about-page.webp');
    // Return to Providers tab for the custom providers section below
    await window.getByRole('tab', { name: /^providers$/i }).click();
    await window.waitForTimeout(300);
  } catch {
    console.warn('  WARN: About tab capture failed — skipping about-page.webp');
  }

  // 2b: Scroll to Custom Providers section (scroll the actual overflow container, not document.body)
  const addBtn = window.getByRole('button', { name: /add custom provider/i });
  await addBtn.scrollIntoViewIfNeeded();
  await window.waitForTimeout(300);
  await captureClippedWebP(window, addBtn, 'images/screenshots/settings/custom-providers-empty.webp');

  // 2c: Fill Add Custom Provider form
  await addBtn.click();
  await window.waitForTimeout(300);
  await window.getByPlaceholder('Ollama', { exact: true }).fill('Local Ollama');
  await window.getByPlaceholder(/http:\/\/localhost:11434\/v1/i).fill('http://localhost:11434/v1');
  const modelInput = window.getByPlaceholder('llama3.2');
  await modelInput.scrollIntoViewIfNeeded();
  await modelInput.fill('llama3.2');
  await window.waitForTimeout(200);
  // Clip to the Save button so the full form is visible without blank space below
  await captureClippedWebP(
    window,
    window.getByRole('button', { name: /^save$/i }),
    'images/screenshots/settings/custom-providers-add-form.webp',
  );

  // 2d: Save
  await window.getByRole('button', { name: /^save$/i }).click();
  await window.waitForTimeout(500);
  // After save, the provider card + Add Custom Provider button are visible — clip to button
  const addBtnAfterSave = window.getByRole('button', { name: /add custom provider/i });
  await addBtnAfterSave.scrollIntoViewIfNeeded();
  await window.waitForTimeout(200);
  await captureClippedWebP(window, addBtnAfterSave, 'images/screenshots/settings/custom-providers-tab.webp');

  // 2e: Tones tab — built-ins only
  await window.getByRole('tab', { name: /^tones$/i }).click();
  await window.waitForTimeout(400);
  await captureWebP(window, 'images/screenshots/settings/tones-tab-builtins.webp');

  // 2f: Open Add Tone form with Socratic
  await window.getByRole('button', { name: /add tone/i }).click();
  await window.waitForTimeout(300);
  await window.getByPlaceholder(/motivational/i).fill('Socratic');
  await window.getByPlaceholder(/describe the tone/i).fill('Question-first reasoning');
  await window.waitForTimeout(200);
  await captureWebP(window, 'images/screenshots/settings/tones-add-form.webp');

  // 2g: Save tone
  await window.getByRole('button', { name: /^save$/i }).click();
  await window.getByRole('button', { name: /add tone/i }).waitFor({ state: 'visible', timeout: 5_000 });
  await window.waitForTimeout(300);
  await captureWebP(window, 'images/screenshots/settings/tones-tab-with-custom.webp');

  // 2h: System Prompts tab — create Security Reviewer
  await window.getByRole('tab', { name: /^system prompts$/i }).click();
  await window.waitForTimeout(400);

  // 2i: Add Template form
  await window.getByRole('button', { name: /add template/i }).click();
  await window.waitForTimeout(300);
  await window.getByPlaceholder(/code review assistant/i).fill('Security Reviewer');
  await window.getByPlaceholder(/you are a careful code reviewer/i).fill(
    'You are a security-focused code reviewer. Identify vulnerabilities, flag OWASP Top 10 risks, and suggest concrete mitigations for each issue found.',
  );
  await window.waitForTimeout(200);
  await captureWebP(window, 'images/screenshots/settings/templates-add-form.webp');

  // Save template
  await window.getByRole('button', { name: /^save$/i }).click();
  await window.getByRole('button', { name: /add template/i }).waitFor({ state: 'visible', timeout: 5_000 });
  await window.waitForTimeout(300);
  await captureWebP(window, 'images/screenshots/settings/templates-tab.webp');
}

async function runTrack3(window: Page): Promise<void> {
  console.log('\n── Track 3: Composition builder ──────────────────────────────────');

  // 3a: Navigate to Compositions — sidebar with New button
  await goToCompositions(window);
  await captureWebP(window, 'images/screenshots/compositions/sidebar-new-button.webp');

  // 3b: Open New Composition — empty builder
  await window.getByRole('button', { name: 'New Composition', exact: true }).first().click();
  await window.waitForTimeout(300);
  await captureWebP(window, 'images/screenshots/compositions/builder-empty.webp');

  // 3b-continuation: Select Broadcast mode → Auto continuation → capture continuation policy cards
  try {
    await window.getByRole('button', { name: /broadcast/i }).first().click();
    await window.waitForTimeout(300);
    // Select Auto continuation
    await window.getByRole('button', { name: /^Auto/i }).click();
    await window.waitForTimeout(300);
    await captureWebP(window, 'images/screenshots/compositions/builder-continuation-auto.webp');
    // Reset back to None for the rest of the track
    await window.getByRole('button', { name: /^None/i }).click();
    await window.waitForTimeout(200);
  } catch {
    console.warn('  WARN: Continuation policy capture failed — skipping builder-continuation-auto.webp');
  }

  // 3c: Add Anthropic voice with full config
  await window.getByRole('button', { name: 'Anthropic' }).first().click();
  await window.waitForTimeout(200);

  // Fill display name
  const displayNameInput = window.getByPlaceholder('Display name', { exact: true });
  await displayNameInput.fill('Critic');
  await window.waitForTimeout(200);

  // System prompt
  const systemPromptArea = window.locator('textarea').filter({ hasText: '' }).first();
  await systemPromptArea.fill('You are a critical reviewer. Challenge assumptions and identify weaknesses in any argument or code.');
  await window.waitForTimeout(200);

  // Tone — find the tone <select> and pick "Concise" (or the first built-in tone)
  const toneSelect = window.locator('select').filter({ hasText: 'Use conductor default' }).first();
  // Get available options and pick one containing "Concise"
  const toneOptions = await toneSelect.locator('option').allTextContents();
  const conciseOption = toneOptions.find((o) => o.includes('Concise'));
  if (conciseOption) {
    await toneSelect.selectOption({ label: conciseOption });
  }
  await window.waitForTimeout(200);

  await captureWebP(window, 'images/screenshots/compositions/builder-voice-config-full.webp');

  // 3c-tools: Scroll to Tools section, enable read-only tools, capture
  try {
    // Find and scroll to the Tools heading inside the voice config panel
    const toolsHeading = window.getByText('Tools', { exact: true }).last();
    await toolsHeading.scrollIntoViewIfNeeded();
    await window.waitForTimeout(300);
    // Enable read-only tool toggles (checkboxes or switches)
    for (const label of ['Read File', 'List Directory', 'Search Files', 'Search File Contents', 'Fetch URL']) {
      const toggle = window.getByLabel(new RegExp(`^${label}$`, 'i'));
      const isVisible = await toggle.isVisible({ timeout: 500 }).catch(() => false);
      if (isVisible) {
        await toggle.check().catch(() => {});
        await window.waitForTimeout(100);
      }
    }
    await window.waitForTimeout(200);
    await captureWebP(window, 'images/screenshots/compositions/builder-voice-tools.webp');
  } catch {
    console.warn('  WARN: Tools section capture failed — skipping builder-voice-tools.webp');
  }

  // 3e: Attach Security Reviewer template
  try {
    const templateSelect = window.locator('select').filter({ hasText: 'No template (inline)' }).first();
    const opts = await templateSelect.locator('option').allTextContents();
    const secOpt = opts.find((o) => o.includes('Security Reviewer'));
    if (secOpt) {
      await templateSelect.selectOption({ label: secOpt });
      await window.waitForTimeout(300);
    }
  } catch {
    // template selector not found, skip
  }
  await captureWebP(window, 'images/screenshots/compositions/builder-template-attached.webp');

  // 3f: Open Tone dropdown (it's a <select>) and screenshot showing options
  await captureWebP(window, 'images/screenshots/compositions/builder-tone-dropdown.webp');

  // Add voice and save (need at least 1 voice for save to work)
  await window.getByRole('button', { name: 'Add Voice' }).click();
  await window.waitForTimeout(300);

  // Add a second voice for drag handles screenshot
  await window.getByRole('button', { name: 'OpenAI' }).first().click();
  await window.waitForTimeout(200);
  await window.getByRole('button', { name: 'Add Voice' }).click();
  await window.waitForTimeout(300);

  await window.getByPlaceholder('My Composition').fill('Critic Panel');
  await captureWebP(window, 'images/screenshots/compositions/builder-drag-handles.webp');

  await window.getByRole('button', { name: 'Save Composition' }).click();
  await window.waitForTimeout(500);

  // 3j: Saved — detail view with Start Session button
  await captureWebP(window, 'images/screenshots/compositions/detail-start-session.webp');

  // 3h: Build a three-provider composition (Anthropic + OpenAI + Local Ollama)
  await openNewComposition(window);
  await window.getByPlaceholder('My Composition').fill('Multi-Provider Panel');
  await window.getByRole('button', { name: /broadcast/i }).first().click();

  // Add Anthropic
  await window.getByRole('button', { name: 'Anthropic' }).first().click();
  await window.waitForTimeout(100);
  await window.getByRole('button', { name: 'Add Voice' }).click();
  await window.waitForTimeout(200);

  // Add OpenAI
  await window.getByRole('button', { name: 'OpenAI' }).first().click();
  await window.waitForTimeout(100);
  await window.getByRole('button', { name: 'Add Voice' }).click();
  await window.waitForTimeout(200);

  // 3i: Screenshot provider grid with Local Ollama visible (before adding)
  // The custom provider should appear in the provider grid
  await captureWebP(window, 'images/screenshots/compositions/builder-custom-provider-voice.webp');

  // Add Local Ollama custom provider (look for it in the grid)
  try {
    await window.getByRole('button', { name: /local ollama/i }).first().click();
    await window.waitForTimeout(100);
    await window.getByRole('button', { name: 'Add Voice' }).click();
    await window.waitForTimeout(200);
  } catch {
    // custom provider might not show in mock mode
  }

  await captureWebP(window, 'images/screenshots/compositions/builder-three-providers.webp');
  await window.getByRole('button', { name: 'Save Composition' }).click();
  await window.waitForTimeout(500);

  // 3k: Create a few more compositions for sidebar list
  const extraCompositions = ['Code Review Panel', 'Writing Assistants', 'Brainstorm Crew'];
  for (const name of extraCompositions) {
    await openNewComposition(window);
    await window.getByPlaceholder('My Composition').fill(name);
    await window.getByRole('button', { name: 'Anthropic' }).first().click();
    await window.waitForTimeout(100);
    await window.getByRole('button', { name: 'Add Voice' }).click();
    await window.waitForTimeout(200);
    await window.getByRole('button', { name: 'Save Composition' }).click();
    await window.waitForTimeout(400);
  }

  // Navigate to compositions list
  await goToCompositions(window);
  await window.waitForTimeout(300);
  await captureWebP(window, 'images/screenshots/compositions/list-sidebar.webp');
  await captureWebP(window, 'images/screenshots/compositions/concepts-composition-list.webp');

  // 3l: Context menu — show the archive/delete action buttons on a composition card
  // CardActions (Archive/Delete) are always visible in each row — no hover needed
  const firstCard = window.locator('[class*="rounded-lg"]').filter({ hasText: 'Critic Panel' }).first();
  await firstCard.waitFor({ state: 'visible', timeout: 5_000 });
  await captureWebP(window, 'images/screenshots/compositions/context-menu.webp');

  // Also capture for home/composition-builder
  await captureWebP(window, 'images/screenshots/home/composition-builder.webp');
}

async function runTrack4(window: Page): Promise<void> {
  console.log('\n── Track 4: Sessions ──────────────────────────────────────────────');

  // First, enable providers and set up a composition for sessions
  await enableAllProviders(window);

  // Create a broadcast composition for sessions
  await buildComposition(window, 'Session Demo', ['Anthropic', 'OpenAI', 'Gemini'], { mode: 'broadcast' });

  // 4a: Navigate to Sessions — sidebar with New button
  await goToSessions(window);
  await captureWebP(window, 'images/screenshots/sessions/new-button.webp');

  // 4b: Click New Session — composition picker
  await window.getByRole('button', { name: 'New Session', exact: true }).click();
  await window.waitForTimeout(300);
  await captureWebP(window, 'images/screenshots/sessions/new-panel.webp');

  // 4b-sandbox: Mock directory picker and capture sandbox-related panels
  try {
    // Inject a mock for the directory picker IPC call
    await window.evaluate(() => {
      const p = (window as any).polyphon;
      if (p?.dialog?.openDirectory) {
        p.dialog.openDirectory = async () => '/Users/demo/my-project';
      } else if (p?.session?.pickWorkingDirectory) {
        p.session.pickWorkingDirectory = async () => '/Users/demo/my-project';
      }
    });
    const browseBtn = window.getByRole('button', { name: /browse/i });
    await browseBtn.waitFor({ state: 'visible', timeout: 3_000 });
    await browseBtn.click();
    await window.waitForTimeout(500);
    // If the working directory was set, the sandbox checkbox should appear
    const sandboxCheckbox = window.getByRole('checkbox', { name: /sandbox/i });
    const sandboxVisible = await sandboxCheckbox.isVisible({ timeout: 2_000 }).catch(() => false);
    if (sandboxVisible) {
      await captureWebP(window, 'images/screenshots/sessions/new-panel-sandbox-checkbox.webp');
      // Check the sandbox box to trigger CLI warning (if composition has CLI voices)
      await sandboxCheckbox.check();
      await window.waitForTimeout(300);
      await captureWebP(window, 'images/screenshots/sessions/new-panel-sandbox-cli-warning.webp');

      // Start a sandboxed session to capture the session header with the Sandboxed badge
      let sandboxedSessionStarted = false;
      try {
        await window.getByRole('button', { name: /session demo/i }).first().click();
        await window.getByPlaceholder('My session').fill('Sandboxed Session');
        await window.getByRole('button', { name: 'Start Session' }).click();
        await window.getByPlaceholder('Message the ensemble\u2026').waitFor({ state: 'visible', timeout: 20_000 });
        await window.waitForTimeout(300);
        const sessionHeader = window.locator('header').first();
        await captureClippedWebP(window, sessionHeader, 'images/screenshots/sessions/session-header-sandboxed.webp');
        sandboxedSessionStarted = true;
        await goToSessions(window);
        await window.waitForTimeout(300);
      } catch {
        console.warn('  WARN: Sandboxed session header capture failed — skipping session-header-sandboxed.webp');
      }

      if (sandboxedSessionStarted) {
        // Re-open the new session panel for the main session demo flow below
        await window.getByRole('button', { name: 'New Session', exact: true }).click();
        await window.waitForTimeout(300);
      }
    }
  } catch {
    console.warn('  WARN: Sandbox panel capture failed — skipping sandbox panel screenshots');
  }

  // 4c-4d: Start session, send message, wait for completion
  await window.getByRole('button', { name: /session demo/i }).first().click();
  await window.getByPlaceholder('My session').fill('Demo Session');
  await window.getByRole('button', { name: 'Start Session' }).click();
  await window.getByPlaceholder('Message the ensemble\u2026').waitFor({ state: 'visible', timeout: 20_000 });
  await window.waitForTimeout(300);

  await sendMessage(window, 'What is the most important principle of good software design?');

  // Wait for completion
  await waitForSessionIdle(window);
  await window.waitForTimeout(300);

  // 4c: Three voices done
  await captureWebP(window, 'images/screenshots/sessions/live-three-voices.webp');

  // 4d: Full view
  await captureWebP(window, 'images/screenshots/sessions/full-view.webp');

  // Also for home/live-session
  await captureWebP(window, 'images/screenshots/home/live-session.webp');
  await captureWebP(window, 'images/screenshots/sessions/concepts-active-session.webp');

  // 4d-export: Click Export button to show export modal
  try {
    const exportBtn = window.getByRole('button', { name: /export/i });
    await exportBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await exportBtn.click();
    await window.waitForTimeout(500);
    await captureWebP(window, 'images/screenshots/sessions/export-modal.webp');
    // Dismiss modal
    await window.keyboard.press('Escape');
    await window.waitForTimeout(300);
  } catch {
    console.warn('  WARN: Export modal capture failed — skipping export-modal.webp');
  }

  // 4f: Conductor mode — create a conductor-mode composition
  await buildComposition(window, 'Directed Session Demo', ['Anthropic', 'OpenAI'], { mode: 'conductor' });
  await startSession(window, 'Directed Session Demo', 'Conductor Session');

  // Capture conductor mode input area (shows "Directed" badge)
  await captureWebP(window, 'images/screenshots/sessions/conductor-mode-voice-panel.webp');

  // 4f-atmention: Type @ to open voice picker dropdown
  try {
    const conductorInput = window.getByPlaceholder('Message the ensemble\u2026');
    await conductorInput.fill('@');
    await window.waitForTimeout(600);
    // Dropdown should appear — capture it
    await captureWebP(window, 'images/screenshots/sessions/at-mention-dropdown.webp');
    await conductorInput.clear();
    await window.waitForTimeout(200);
  } catch {
    console.warn('  WARN: @ mention dropdown capture failed — skipping at-mention-dropdown.webp');
  }

  // 4i: Session context menu — go to sessions list, hover over session card
  await goToSessions(window);
  await window.waitForTimeout(300);
  // Hover over first session card to show archive/delete actions
  const firstSessionCard = window.locator('[class*="rounded-xl"]').first();
  await firstSessionCard.hover();
  await window.waitForTimeout(300);
  await captureWebP(window, 'images/screenshots/sessions/context-menu.webp');

  // 4h: Continuation nudge — create broadcast + prompt policy composition
  await buildComposition(window, 'Continuation Demo', ['Anthropic', 'OpenAI'], {
    mode: 'broadcast',
    continuationPolicy: 'prompt',
  });
  await startSession(window, 'Continuation Demo', 'Continuation Session');
  await sendMessage(window, 'Explain the CAP theorem briefly.');

  // Wait for round 1 to complete — nudge banner should appear
  await waitForSessionIdle(window);
  await window.waitForTimeout(300);

  // Capture the continuation nudge banner BEFORE clicking Allow
  try {
    const allowBtn = window.getByRole('button', { name: 'Allow' });
    await allowBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await captureWebP(window, 'images/screenshots/sessions/continuation-nudge.webp');
    // Now click Allow to start round 2 for the home/continuation-session screenshot
    await allowBtn.click();
    await window.waitForTimeout(300);
    await captureWebP(window, 'images/screenshots/home/continuation-session.webp');
    await waitForSessionIdle(window);
    await window.waitForTimeout(500);
    // Round 2 complete — capture the feed showing the round divider
    await captureWebP(window, 'images/screenshots/sessions/continuation-round2.webp');
  } catch {
    // nudge banner may not appear in mock mode — skip these captures
    console.warn('  WARN: Continuation nudge banner not found — skipping continuation-nudge.webp');
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('Polyphon screenshot capture starting...');
  console.log(`App entry: ${APP_ENTRY}`);

  // ── Track 1: Clean-state launch (no setup) — show onboarding modal
  {
    const { app: app1, window: win1 } = await launchApp({}, { skipOnboarding: false });
    await runTrack1(app1, win1);
  }

  // ── Track 2+3: Settings, composition builder (shared app)
  {
    const { app, window } = await launchApp();
    try {
      await runTrack2(window);
      await runTrack3(window);
    } finally {
      await app.close();
    }
  }

  // ── Track 4: Sessions (fresh isolated app)
  {
    const { app, window } = await launchApp();
    try {
      await runTrack4(window);
    } finally {
      await app.close();
    }
  }

  // ── Apply markdown replacements ───────────────────────────────────────────

  console.log('\n── Applying markdown replacements ────────────────────────────────');

  // Track which output paths have been captured
  const capturedPaths = new Set<string>();
  const ssDir = path.join(SITE_STATIC, 'images', 'screenshots');
  function collectPaths(dir: string): void {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        collectPaths(path.join(dir, entry.name));
      } else if (entry.name.endsWith('.webp')) {
        const rel = path.relative(SITE_STATIC, path.join(dir, entry.name)).replace(/\\/g, '/');
        capturedPaths.add(rel);
      }
    }
  }
  collectPaths(ssDir);

  for (const spec of MANIFEST) {
    const outputRel = spec.output.replace(/\\/g, '/');
    if (!capturedPaths.has(outputRel)) {
      skipped.push({ file: spec.file, reason: `capture missing: ${spec.output}` });
      continue;
    }
    replacePlaceholder(spec.file, spec.placeholder, spec.output, spec.alt);
  }

  // ── Post-run placeholder validation ────────────────────────────────────────

  console.log('\n── Validating placeholder coverage ──────────────────────────────');
  const DOCS_DIR = path.join(REPO_ROOT, 'site', 'content');
  let unmatchedCount = 0;
  function scanForRemainingPlaceholders(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanForRemainingPlaceholders(full);
      } else if (entry.name.endsWith('.md')) {
        const rel = path.relative(REPO_ROOT, full);
        for (const line of fs.readFileSync(full, 'utf8').split('\n')) {
          if (line.startsWith('> **Screenshot placeholder:**')) {
            console.warn(`  UNMATCHED: ${rel}`);
            console.warn(`    ${line.slice(0, 120)}`);
            unmatchedCount++;
          }
        }
      }
    }
  }
  scanForRemainingPlaceholders(DOCS_DIR);
  if (unmatchedCount === 0) {
    console.log('  All placeholders replaced.');
  } else {
    console.error(`\n  ERROR: ${unmatchedCount} placeholder(s) still present — add MANIFEST entries and capture code.`);
    process.exit(1);
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log('\n══════════════════════════════════════════════');
  console.log(`  Captured:  ${captured}`);
  console.log(`  Replaced:  ${replaced}`);
  console.log(`  Skipped:   ${skipped.length}`);
  if (skipped.length > 0) {
    for (const s of skipped) {
      console.log(`    - ${s.file}: ${s.reason}`);
    }
  }
  console.log('══════════════════════════════════════════════\n');
}

main().catch((err) => {
  console.error('\nFATAL:', err);
  process.exit(1);
});
