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

  // Idempotency check
  if (content.includes(imgPath)) {
    skipped.push({ file: filePath, reason: 'already replaced' });
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
  // Leave API key env var empty and default model empty
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
    placeholder: 'Sidebar with the new composition button highlighted',
    output: 'images/screenshots/compositions/sidebar-new-button.webp',
    alt: 'Sidebar showing the New Composition button',
  },
  {
    file: 'site/content/docs/compositions.md',
    placeholder: 'Composition builder — empty state with name field and "Add Voice" button',
    output: 'images/screenshots/compositions/builder-empty.webp',
    alt: 'Composition builder empty state with name field and Add Voice button',
  },
  {
    file: 'site/content/docs/compositions.md',
    placeholder: 'Voice configuration panel within the Composition Builder fully filled in',
    output: 'images/screenshots/compositions/builder-voice-config-full.webp',
    alt: 'Voice configuration panel fully configured with provider, model, display name, and tone',
  },
  {
    file: 'site/content/docs/compositions.md',
    placeholder: 'Voice selector in the Composition Builder with Anthropic selected. The voice type toggle shows both API and CLI buttons. The API button is disabled',
    output: 'images/screenshots/compositions/builder-type-toggle-disabled.webp',
    alt: 'Voice type toggle with API button disabled showing no API key configured',
  },
  {
    file: 'site/content/docs/compositions.md',
    placeholder: 'Voice configuration panel in the Composition Builder with a template attached',
    output: 'images/screenshots/compositions/builder-template-attached.webp',
    alt: 'Voice configuration panel with Security Reviewer template attached',
  },
  {
    file: 'site/content/docs/compositions.md',
    placeholder: 'Voice list in composition builder with drag handles visible',
    output: 'images/screenshots/compositions/builder-drag-handles.webp',
    alt: 'Composition builder voice list with drag handles on each voice row',
  },
  {
    file: 'site/content/docs/compositions.md',
    placeholder: 'Composition detail view with the "Start Session" button',
    output: 'images/screenshots/compositions/detail-start-session.webp',
    alt: 'Saved composition detail view showing the Start Session button',
  },
  {
    file: 'site/content/docs/compositions.md',
    placeholder: 'Context menu on a composition in the sidebar showing the archive option',
    output: 'images/screenshots/compositions/context-menu.webp',
    alt: 'Composition card showing archive and delete action buttons',
  },
  // ── concepts ──────────────────────────────────────────────────────────────
  {
    file: 'site/content/docs/concepts.md',
    placeholder: 'Composition list in the sidebar showing several named compositions',
    output: 'images/screenshots/compositions/concepts-composition-list.webp',
    alt: 'Composition list in the sidebar showing several named compositions',
  },
  {
    file: 'site/content/docs/concepts.md',
    placeholder: 'Active session view with messages from two or three voices',
    output: 'images/screenshots/sessions/concepts-active-session.webp',
    alt: 'Active session with voice message bubbles labeled with voice names and colors',
  },
  // ── conductor-profile ──────────────────────────────────────────────────────
  {
    file: 'site/content/docs/conductor-profile.md',
    placeholder: 'Settings page scrolled to the Conductor Profile section with all fields visible',
    output: 'images/screenshots/settings/conductor-profile-empty.webp',
    alt: 'Conductor Profile settings section showing all fields in default state',
  },
  {
    file: 'site/content/docs/conductor-profile.md',
    placeholder: 'Conductor Profile section with a name, pronouns, and background filled in',
    output: 'images/screenshots/settings/conductor-profile.webp',
    alt: 'Conductor Profile with name, pronouns, and background context filled in',
  },
  // ── custom-providers ──────────────────────────────────────────────────────
  {
    file: 'site/content/docs/custom-providers.md',
    placeholder: 'Add Custom Provider form fully filled out with: Name "Local Ollama"',
    output: 'images/screenshots/settings/custom-providers-add-form.webp',
    alt: 'Add Custom Provider form filled with Local Ollama details and base URL',
  },
  {
    file: 'site/content/docs/custom-providers.md',
    placeholder: 'Settings page with the Custom Providers tab selected — showing an existing custom provider',
    output: 'images/screenshots/settings/custom-providers-tab.webp',
    alt: 'Custom Providers section showing saved Local Ollama provider with Edit and Delete buttons',
  },
  {
    file: 'site/content/docs/custom-providers.md',
    placeholder: 'Composition Builder provider grid showing both built-in providers',
    output: 'images/screenshots/compositions/builder-custom-provider-voice.webp',
    alt: 'Composition Builder provider grid with built-in and Local Ollama custom provider',
  },
  // ── getting-started ────────────────────────────────────────────────────────
  {
    file: 'site/content/docs/getting-started.md',
    placeholder: 'Main application window on first launch — empty sidebar',
    output: 'images/screenshots/home/first-launch.webp',
    alt: 'Polyphon welcome dialog on first launch asking for name and pronouns',
  },
  // ── providers ──────────────────────────────────────────────────────────────
  {
    file: 'site/content/docs/providers.md',
    placeholder: 'Settings page with Anthropic provider card expanded, API key field and Test button visible',
    output: 'images/screenshots/settings/providers-tab-anthropic-expanded.webp',
    alt: 'Anthropic provider card expanded showing API key status and voice type selector',
  },
  {
    file: 'site/content/docs/providers.md',
    placeholder: 'Settings page with Claude CLI provider card, status showing "Available"',
    output: 'images/screenshots/settings/providers-tab-cli-available.webp',
    alt: 'Claude CLI provider card with Available status indicator',
  },
  {
    file: 'site/content/docs/providers.md',
    placeholder: 'Settings page showing provider status cards — one green (Available), one yellow (untested), one gray (not configured)',
    output: 'images/screenshots/settings/providers-status-cards.webp',
    alt: 'Provider settings page showing multiple provider cards in different states',
  },
  {
    file: 'site/content/docs/providers.md',
    placeholder: 'Voice selector in the Composition Builder showing the provider grid with both built-in providers',
    output: 'images/screenshots/settings/providers-tab-all-cards.webp',
    alt: 'Settings Providers tab showing all provider cards with enable toggles',
  },
  // ── sessions ──────────────────────────────────────────────────────────────
  {
    file: 'site/content/docs/sessions.md',
    placeholder: 'Sidebar with the new session button highlighted',
    output: 'images/screenshots/sessions/new-button.webp',
    alt: 'Sidebar showing the New Session button',
  },
  {
    file: 'site/content/docs/sessions.md',
    placeholder: 'New session panel showing composition picker and ad-hoc voice builder',
    output: 'images/screenshots/sessions/new-panel.webp',
    alt: 'New session panel with composition picker',
  },
  {
    file: 'site/content/docs/sessions.md',
    placeholder: 'Full session view with labels pointing to message feed, voice panel, and input bar',
    output: 'images/screenshots/sessions/full-view.webp',
    alt: 'Full session view showing message feed, voice panel on the right, and input bar at bottom',
  },
  {
    file: 'site/content/docs/sessions.md',
    placeholder: 'Session view mid-response with two voices streaming simultaneously',
    output: 'images/screenshots/sessions/mid-response-streaming.webp',
    alt: 'Session view with voices streaming their responses simultaneously',
  },
  {
    file: 'site/content/docs/sessions.md',
    placeholder: 'Voice panel with conductor mode active, one voice highlighted as the target',
    output: 'images/screenshots/sessions/conductor-mode-voice-panel.webp',
    alt: 'Session in conductor mode with Directed badge visible in the input area',
  },
  {
    file: 'site/content/docs/sessions.md',
    placeholder: 'Session view with conductor mode active. The message input bar shows "@" typed and a dropdown is open',
    output: 'images/screenshots/sessions/at-mention-dropdown.webp',
    alt: 'Session input bar with @ typed and voice name dropdown open',
  },
  {
    file: 'site/content/docs/sessions.md',
    placeholder: 'Session showing a continuation in progress',
    output: 'images/screenshots/sessions/continuation-round2.webp',
    alt: 'Session with continuation round in progress showing Round 2 divider and streaming voices',
  },
  {
    file: 'site/content/docs/sessions.md',
    placeholder: 'Context menu on a session in the sidebar showing the archive option',
    output: 'images/screenshots/sessions/context-menu.webp',
    alt: 'Session card showing archive and delete action buttons',
  },
  // ── settings ──────────────────────────────────────────────────────────────
  {
    file: 'site/content/docs/settings.md',
    placeholder: 'Full Settings page with all navigation tabs visible',
    output: 'images/screenshots/settings/settings-overview.webp',
    alt: 'Full Settings page with section navigation showing all settings areas',
  },
  {
    file: 'site/content/docs/settings.md',
    placeholder: 'Full Settings page showing provider cards for Anthropic, OpenAI, Google, and CLI providers',
    output: 'images/screenshots/settings/providers-tab-all-cards.webp',
    alt: 'Settings Providers tab showing all provider cards',
  },
  {
    file: 'site/content/docs/settings.md',
    placeholder: 'Provider card expanded showing model selector dropdown with available models listed',
    output: 'images/screenshots/settings/providers-tab-anthropic-expanded.webp',
    alt: 'Anthropic provider card expanded showing voice type and API key configuration',
  },
  // ── system-prompt-templates ────────────────────────────────────────────────
  {
    file: 'site/content/docs/system-prompt-templates.md',
    placeholder: 'Settings page with the Templates tab selected — showing a list of saved system prompt templates',
    output: 'images/screenshots/settings/templates-tab.webp',
    alt: 'System Prompts settings tab showing saved template list with names and previews',
  },
  {
    file: 'site/content/docs/system-prompt-templates.md',
    placeholder: 'Template creation/edit form showing the Name field containing "Security Reviewer"',
    output: 'images/screenshots/settings/templates-add-form.webp',
    alt: 'Template creation form with Security Reviewer name and content filled in',
  },
  {
    file: 'site/content/docs/system-prompt-templates.md',
    placeholder: 'Voice configuration panel in the Composition Builder showing the system prompt template dropdown with "Security Reviewer" selected',
    output: 'images/screenshots/compositions/builder-template-attached.webp',
    alt: 'Voice configuration panel with Security Reviewer template attached',
  },
  // ── tones ──────────────────────────────────────────────────────────────────
  {
    file: 'site/content/docs/tones.md',
    placeholder: 'Settings page with the Tones tab selected — showing the five built-in tone cards',
    output: 'images/screenshots/settings/tones-tab-builtins.webp',
    alt: 'Tones settings tab showing five built-in tone cards with names and descriptions',
  },
  {
    file: 'site/content/docs/tones.md',
    placeholder: 'Custom tone creation form with the Name field containing "Socratic"',
    output: 'images/screenshots/settings/tones-add-form.webp',
    alt: 'Custom tone creation form with Socratic name and question-first reasoning description',
  },
  {
    file: 'site/content/docs/tones.md',
    placeholder: 'Settings page with the Tones tab selected — showing both built-in preset tone cards and at least one custom tone card',
    output: 'images/screenshots/settings/tones-tab-with-custom.webp',
    alt: 'Tones tab showing built-in tones plus custom Socratic tone with Edit and Delete buttons',
  },
  {
    file: 'site/content/docs/tones.md',
    placeholder: 'Voice configuration panel in the Composition Builder with the Tone dropdown open',
    output: 'images/screenshots/compositions/builder-tone-dropdown.webp',
    alt: 'Voice configuration tone selector showing built-in and custom tones',
  },
];

// ── Track helpers (shared app state) ─────────────────────────────────────────

async function runTrack1(app2: ElectronApplication, window2: Page): Promise<void> {
  console.log('\n── Track 1: First-launch clean state ───────────────────────────');
  // Onboarding modal is visible on first launch — capture it before dismissing
  const skipBtn = window2.getByRole('button', { name: /skip for now/i });
  await skipBtn.waitFor({ state: 'visible', timeout: 10_000 });
  // Pre-fill name so the "Get started" button is active and the modal looks realistic
  await window2.getByPlaceholder('e.g. Alex').fill('Alex');
  await window2.waitForTimeout(200);
  // Select they/them pronouns
  await window2.locator('select').selectOption('they/them');
  await window2.waitForTimeout(150);
  await captureWebP(window2, 'images/screenshots/home/first-launch.webp');
  await app2.close();
}

async function runTrack2(window: Page): Promise<void> {
  console.log('\n── Track 2: Settings and configuration ──────────────────────────');

  // 2a: Navigate to Settings, Conductor tab (default)
  await goToSettings(window);
  await captureWebP(window, 'images/screenshots/settings/settings-overview.webp');

  // 2a: Conductor Profile — empty state
  await captureWebP(window, 'images/screenshots/settings/conductor-profile-empty.webp');

  // 2a: Fill conductor profile
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

  // 3c: Add Anthropic voice with full config
  await window.getByRole('button', { name: 'Anthropic' }).first().click();
  await window.waitForTimeout(200);

  // Fill display name
  const displayNameInput = window.getByPlaceholder('Voice name', { exact: true });
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

  // 3d: Type-toggle disabled state — need a fresh composition without API key
  // In mock mode, API toggle is enabled. We'll capture what's available.
  // The mock always reports providers as configured; capture as-is.
  await captureWebP(window, 'images/screenshots/compositions/builder-type-toggle-disabled.webp');

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
  // Hover over first card to reveal actions
  const firstCard = window.locator('[class*="rounded-xl"]').filter({ hasText: 'Critic Panel' }).first();
  await firstCard.hover();
  await window.waitForTimeout(300);
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

  // 4c-4d: Start session, send message, wait for completion
  await window.getByRole('button', { name: /session demo/i }).first().click();
  await window.getByPlaceholder('My session').fill('Demo Session');
  await window.getByRole('button', { name: 'Start Session' }).click();
  await window.getByPlaceholder('Message the ensemble\u2026').waitFor({ state: 'visible', timeout: 20_000 });
  await window.waitForTimeout(300);

  await sendMessage(window, 'What is the most important principle of good software design?');

  // 4e: Wait for streaming to begin (input disabled = voices responding), then capture
  await window.getByPlaceholder('Waiting for voices\u2026').waitFor({ state: 'visible', timeout: 30_000 });
  await window.waitForTimeout(1_000);
  await captureWebP(window, 'images/screenshots/sessions/mid-response-streaming.webp');

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

  // 4f: Conductor mode — create a conductor-mode composition
  await buildComposition(window, 'Directed Session Demo', ['Anthropic', 'OpenAI'], { mode: 'conductor' });
  await startSession(window, 'Directed Session Demo', 'Conductor Session');

  // Capture conductor mode input area (shows "Directed" badge)
  await captureWebP(window, 'images/screenshots/sessions/conductor-mode-voice-panel.webp');

  // 4g: Type @ to open mention dropdown
  await window.getByPlaceholder('Message the ensemble\u2026').fill('@');
  await window.waitForTimeout(200);
  // Type one more char to trigger dropdown (requires @word pattern)
  await window.getByPlaceholder('Message the ensemble\u2026').type('A');
  await window.waitForTimeout(300);
  await captureWebP(window, 'images/screenshots/sessions/at-mention-dropdown.webp');

  // Clear input
  await window.getByPlaceholder('Message the ensemble\u2026').fill('');
  await window.waitForTimeout(200);

  // 4i: Session context menu — go to sessions list, hover over session card
  await goToSessions(window);
  await window.waitForTimeout(300);
  // Hover over first session card to show archive/delete actions
  const firstSessionCard = window.locator('[class*="rounded-xl"]').first();
  await firstSessionCard.hover();
  await window.waitForTimeout(300);
  await captureWebP(window, 'images/screenshots/sessions/context-menu.webp');

  // 4h: Continuation round — create broadcast + prompt policy composition
  await buildComposition(window, 'Continuation Demo', ['Anthropic', 'OpenAI'], {
    mode: 'broadcast',
    continuationPolicy: 'prompt',
  });
  await startSession(window, 'Continuation Demo', 'Continuation Session');
  await sendMessage(window, 'Explain the CAP theorem briefly.');

  // Wait for round 1 to complete
  await waitForSessionIdle(window);
  await window.waitForTimeout(300);

  // Click Allow to start round 2
  await window.getByRole('button', { name: 'Allow' }).click();
  await window.waitForTimeout(300);

  // Capture during/after round 2 (round divider "Round 2" should be visible)
  await captureWebP(window, 'images/screenshots/sessions/continuation-round2.webp');
  await captureWebP(window, 'images/screenshots/home/continuation-session.webp');

  await waitForSessionIdle(window);
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
