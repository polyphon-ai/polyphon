/**
 * take-videos.ts
 *
 * Standalone Playwright + Electron script that launches the Polyphon app with
 * real voice providers, drives the UI through each required flow, captures
 * frames via page.screenshot(), compiles them to MP4 via ffmpeg, generates
 * narration scripts, and rewrites markdown files to replace video placeholder
 * blockquotes with Hugo video shortcodes.
 *
 * Usage:
 *   npx tsx scripts/take-videos.ts
 *   make videos
 *   make videos-docs          # --docs-only
 *   make videos-walkthrough   # --walkthrough-only
 *
 * Requirements:
 *   - .vite/build/main.js must exist (run `make build` or `npm run build:e2e` first)
 *   - At least one API voice provider (ANTHROPIC_API_KEY or OPENAI_API_KEY) and
 *     one CLI voice (claude or codex in PATH) must be available for the walkthrough
 *   - /opt/homebrew/bin/ffmpeg must exist (override with FFMPEG_PATH env var)
 */

import path from 'path';
import fs from 'fs';
import os from 'os';
import { spawnSync } from 'child_process';
import { type Page, _electron as electron } from '@playwright/test';
import type { ElectronApplication } from '@playwright/test';

// ── Constants ─────────────────────────────────────────────────────────────────

const REPO_ROOT = path.join(__dirname, '..');
const SITE_STATIC = path.join(REPO_ROOT, 'site', 'static');
const APP_ENTRY = path.join(REPO_ROOT, '.vite', 'build', 'main.js');

// ── CLI flags ─────────────────────────────────────────────────────────────────

const DOCS_ONLY = process.argv.includes('--docs-only');
const WALKTHROUGH_ONLY = process.argv.includes('--walkthrough-only');
const CUSTOM_PROVIDERS_ONLY = process.argv.includes('--custom-providers-only');

// ── Run counters ──────────────────────────────────────────────────────────────

let captured = 0;
let replaced = 0;
let injected = 0;
let narrationWritten = 0;
const skipped: { label: string; reason: string }[] = [];

// ── Cue emitter ───────────────────────────────────────────────────────────────

interface Cue {
  t: number;
  label: string;
  context: string;
}

class CueEmitter {
  private startMs = 0;
  private cues: Cue[] = [];

  start(): void {
    this.startMs = Date.now();
  }

  emit(label: string, context: string): void {
    this.cues.push({
      t: parseFloat(((Date.now() - this.startMs) / 1000).toFixed(2)),
      label,
      context,
    });
  }

  save(outputPath: string): void {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(this.cues, null, 2) + '\n', 'utf8');
    console.log(`  cues  → ${path.relative(path.join(__dirname, '..'), outputPath)}`);
  }
}

// ── Startup guards ────────────────────────────────────────────────────────────

function assertBuildExists(): void {
  if (!fs.existsSync(APP_ENTRY)) {
    console.error(`\nERROR: ${APP_ENTRY} not found.`);
    console.error('Run "make build" or "npm run build:e2e" before capturing videos.\n');
    process.exit(1);
  }
}

function assertOllamaRunning(): void {
  const result = spawnSync('curl', ['-sf', 'http://localhost:11434/api/tags', '--max-time', '3'], { stdio: 'pipe' });
  if (result.status !== 0) {
    console.error('\nERROR: Ollama is not running at http://localhost:11434.');
    console.error('Start it with: ollama serve');
    console.error('Then pull the required models:');
    console.error('  ollama pull llama3.2:1b');
    console.error('  ollama pull qwen2.5:0.5b\n');
    process.exit(1);
  }
}

function assertFfmpegInstalled(): string {
  const resolved =
    process.env.FFMPEG_PATH ??
    (fs.existsSync('/opt/homebrew/bin/ffmpeg') ? '/opt/homebrew/bin/ffmpeg' : null) ??
    (fs.existsSync('/usr/local/bin/ffmpeg') ? '/usr/local/bin/ffmpeg' : null);
  if (!resolved) {
    console.error('\nERROR: ffmpeg not found.');
    console.error('Expected at /opt/homebrew/bin/ffmpeg or /usr/local/bin/ffmpeg.');
    console.error('Override with FFMPEG_PATH env var.\n');
    process.exit(1);
  }
  return resolved;
}

// ── App launch helpers ────────────────────────────────────────────────────────

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/**
 * Build env for a real-provider video capture run.
 * - Spreads the user's real shell env so API keys are available.
 * - Uses an isolated temp dir for the SQLite DB (fresh state per track).
 * - Does NOT set POLYPHON_E2E or NODE_ENV=test — we want normal app behaviour.
 */
function buildEnv(): Record<string, string> {
  const env = { ...(process.env as Record<string, string>) };
  env['POLYPHON_TEST_USER_DATA'] = makeTempDir('polyphon-videos-data-');
  // Prevent openDevTools() from being called even if MAIN_WINDOW_VITE_DEV_SERVER_URL
  // is set (e.g. leftover in the shell from a previous `npm start` session).
  env['POLYPHON_NO_DEVTOOLS'] = '1';
  return env;
}

async function launchApp(opts: { skipOnboarding?: boolean } = {}): Promise<{
  app: ElectronApplication;
  window: Page;
}> {
  const { skipOnboarding = true } = opts;

  const app = await electron.launch({
    args: [APP_ENTRY, '--no-sandbox'],
    env: buildEnv(),
  });

  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');


  if (skipOnboarding) {
    await skipOnboardingModal(window);
    await window.getByRole('button', { name: /settings/i }).waitFor({ state: 'visible', timeout: 15_000 });
    await window.waitForTimeout(300);
  }

  return { app, window };
}

async function skipOnboardingModal(window: Page): Promise<void> {
  const skipBtn = window.getByRole('button', { name: /skip for now/i });
  try {
    await skipBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await skipBtn.click();
    await skipBtn.waitFor({ state: 'hidden', timeout: 3_000 });
  } catch {
    // no onboarding modal
  }
}

async function fillOnboarding(window: Page, name: string, pronouns: string, bio: string): Promise<void> {
  const nameField = window.getByPlaceholder(/e\.g\. Alex/i);
  await nameField.waitFor({ state: 'visible', timeout: 10_000 });

  // Dwell on the empty form so viewers can read it before anything is typed
  await window.waitForTimeout(2_500);

  // Type name at a human pace so viewers can follow along
  await nameField.click();
  await nameField.pressSequentially(name, { delay: 120 });
  await window.waitForTimeout(2_000);

  // Select pronouns from the dropdown
  try {
    await window.locator('select').selectOption(pronouns);
    await window.waitForTimeout(2_000);
  } catch {
    // pronouns select shape may differ
  }

  // Fill in the bio textarea
  try {
    const bioField = window.getByPlaceholder(/senior backend engineer/i);
    await bioField.waitFor({ state: 'visible', timeout: 3_000 });
    await bioField.click();
    await bioField.pressSequentially(bio, { delay: 60 });
    await window.waitForTimeout(2_000);
  } catch {
    // textarea may not be present
  }

  // Dwell on the completed form before clicking
  await window.waitForTimeout(1_500);

  const startBtn = window.getByRole('button', { name: /get started/i });
  await startBtn.waitFor({ state: 'visible', timeout: 3_000 });
  await startBtn.click();
  await window.getByRole('button', { name: /settings/i }).waitFor({ state: 'visible', timeout: 15_000 });
  await window.waitForTimeout(500);
}

// ── Frame recording ───────────────────────────────────────────────────────────

/**
 * Start capturing frames from `page` at `fps` into `framesDir`.
 * Returns a stop function that waits for the current frame to flush before returning.
 *
 * Because page.screenshot() uses the same rendering path as take-screenshots.ts,
 * the app window is visible and renders normally — no blank-window side effects.
 */
async function startFrameRecording(
  page: Page,
  framesDir: string,
  fps = 10,
): Promise<() => Promise<void>> {
  fs.mkdirSync(framesDir, { recursive: true });
  let active = true;
  let frameIndex = 0;
  const delay = Math.floor(1000 / fps);

  const loopDone = (async () => {
    while (active) {
      const framePath = path.join(framesDir, `frame-${String(frameIndex).padStart(6, '0')}.png`);
      frameIndex++;
      try {
        await page.screenshot({ path: framePath, fullPage: false, timeout: 3_000 });
      } catch {
        // page is transitioning or the app is closing — skip this frame
      }
      if (active) {
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
      }
    }
  })();

  return async () => {
    active = false;
    await loopDone;
  };
}

// ── ffmpeg compilation ────────────────────────────────────────────────────────

/**
 * Compile a directory of sequentially-named PNG frames into an MP4.
 * Uses the concat demuxer to handle any gaps in frame numbers.
 */
function compileFramesToMp4(
  ffmpegBin: string,
  framesDir: string,
  outputMp4: string,
  fps: number,
  opts: { crf?: number; trimDurationSeconds?: number } = {},
): void {
  const { crf = 22, trimDurationSeconds } = opts;

  const frames = fs
    .readdirSync(framesDir)
    .filter((f) => f.endsWith('.png'))
    .sort();

  if (frames.length === 0) {
    throw new Error(`No frames captured in ${framesDir}`);
  }

  const frameDuration = (1 / fps).toFixed(6);
  const concatLines: string[] = [];
  for (const f of frames) {
    concatLines.push(`file '${path.join(framesDir, f).replace(/\\/g, '/')}'`);
    concatLines.push(`duration ${frameDuration}`);
  }
  const concatFile = path.join(framesDir, 'frames.txt');
  fs.writeFileSync(concatFile, concatLines.join('\n') + '\n', 'utf8');

  fs.mkdirSync(path.dirname(outputMp4), { recursive: true });

  const args = [
    '-f', 'concat',
    '-safe', '0',
    '-i', concatFile,
    ...(trimDurationSeconds != null ? ['-t', String(trimDurationSeconds)] : []),
    '-vf', 'fps=25',
    '-vcodec', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-crf', String(crf),
    '-preset', 'fast',
    '-movflags', '+faststart',
    '-an',
    '-y',
    outputMp4,
  ];

  const result = spawnSync(ffmpegBin, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed with exit code ${result.status}`);
  }
}

/**
 * Extract a single frame at `offsetSeconds` from an MP4 and write it as a
 * WebP poster image. Called after compileFramesToMp4 so the poster always
 * reflects the freshly compiled video.
 */
function extractPosterFrame(
  ffmpegBin: string,
  inputMp4: string,
  outputWebP: string,
  offsetSeconds: number,
): void {
  fs.mkdirSync(path.dirname(outputWebP), { recursive: true });
  const tmpPng = outputWebP.replace(/\.webp$/, '.tmp.png');

  const result = spawnSync(ffmpegBin, [
    '-ss', String(offsetSeconds),
    '-i', inputMp4,
    '-vframes', '1',
    '-update', '1',
    '-y', tmpPng,
  ], { stdio: 'pipe' });

  if (result.status !== 0) {
    console.warn(`  WARNING: poster extraction failed for ${path.basename(inputMp4)}`);
    return;
  }

  // Convert PNG → WebP using sharp (already a project dependency)
  const { execFileSync } = require('child_process');
  execFileSync(process.execPath, ['-e', `
    require('sharp')('${tmpPng}').webp({ quality: 85 }).toFile('${outputWebP}')
      .then(() => { require('fs').unlinkSync('${tmpPng}'); })
      .catch(e => { console.error(e); process.exit(1); });
  `], { stdio: 'inherit' });
}

function assertOutputWithinBudget(outputPath: string, maxSizeMb: number): void {
  const mb = fs.statSync(outputPath).size / (1024 * 1024);
  if (mb > maxSizeMb) {
    console.warn(`  WARNING: ${path.basename(outputPath)} is ${mb.toFixed(1)}MB (budget: ${maxSizeMb}MB)`);
  }
}

// ── Markdown helpers ──────────────────────────────────────────────────────────

/**
 * Replace a video placeholder blockquote with a Hugo video shortcode.
 * Matching uses string includes() — no regex. Idempotent.
 */
function replacePlaceholder(filePath: string, placeholder: string, shortcode: string): void {
  const absFile = path.join(REPO_ROOT, filePath);
  const content = fs.readFileSync(absFile, 'utf8');

  const srcMatch = shortcode.match(/src="([^"]+)"/);
  if (srcMatch && content.includes(srcMatch[1])) {
    skipped.push({ label: filePath, reason: 'already replaced' });
    return;
  }

  const blockquotePrefix = '> **Video placeholder:**';
  const lines = content.split('\n');
  let found = false;

  const updated = lines.map((line) => {
    if (!found && line.startsWith(blockquotePrefix) && line.includes(placeholder)) {
      found = true;
      return shortcode;
    }
    return line;
  });

  if (!found) {
    console.error(`\nERROR: Video placeholder not found in ${filePath}:`);
    console.error(`  "${placeholder}"`);
    process.exit(1);
  }

  fs.writeFileSync(absFile, updated.join('\n'), 'utf8');
  replaced++;
}

function injectHomepageVideo(filePath: string, shortcode: string): void {
  const absFile = path.join(REPO_ROOT, filePath);
  const content = fs.readFileSync(absFile, 'utf8');

  const srcMatch = shortcode.match(/src="([^"]+)"/);
  if (srcMatch && content.includes(srcMatch[1])) {
    skipped.push({ label: filePath, reason: 'homepage video already injected' });
    return;
  }

  const marker = '## Get Started';
  if (!content.includes(marker)) {
    console.warn(`  WARNING: "${marker}" not found in ${filePath}; appending at end`);
    fs.writeFileSync(absFile, content + `\n## See it in action\n\n${shortcode}\n`, 'utf8');
    injected++;
    return;
  }

  const updated = content.replace(
    marker,
    `## See it in action\n\n${shortcode}\n\n---\n\n${marker}`,
  );
  fs.writeFileSync(absFile, updated, 'utf8');
  injected++;
}

// ── Narration helper ──────────────────────────────────────────────────────────

function writeNarrationScript(filePath: string, content: string): void {
  const absFile = path.join(REPO_ROOT, filePath);
  fs.mkdirSync(path.dirname(absFile), { recursive: true });
  fs.writeFileSync(absFile, content, 'utf8');
  narrationWritten++;
  console.log(`  narration → ${filePath}`);
}

// ── Navigation helpers ────────────────────────────────────────────────────────

async function goToSettingsTab(window: Page, tab: string): Promise<void> {
  await window.getByRole('button', { name: /settings/i }).click();
  await window.waitForTimeout(300);
  await window.getByRole('tab', { name: new RegExp(`^${tab}$`, 'i') }).click();
  await window.waitForTimeout(300);
}

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

async function goToCompositions(window: Page): Promise<void> {
  await window.getByRole('button', { name: /compositions/i }).click();
  await window.waitForTimeout(300);
}

async function openNewComposition(window: Page): Promise<void> {
  await goToCompositions(window);
  await window.getByRole('button', { name: 'New Composition', exact: true }).first().click();
  await window.waitForTimeout(300);
}

async function buildAndSaveComposition(
  window: Page,
  name: string,
  providers: string[],
  opts: { mode?: 'broadcast' | 'conductor' } = {},
): Promise<void> {
  const { mode = 'broadcast' } = opts;

  await openNewComposition(window);
  await window.getByPlaceholder('My Composition').fill(name);

  if (mode === 'broadcast') {
    await window.getByRole('button', { name: /broadcast/i }).first().click();
  }

  for (const provider of providers) {
    await window.getByRole('button', { name: provider }).first().click();
    await window.getByRole('button', { name: 'Add Voice' }).click();
    await window.waitForTimeout(200);
  }

  await window.getByRole('button', { name: 'Save Composition' }).click();
  await window.waitForTimeout(500);
}

async function startSessionFromComposition(window: Page, compositionName: string): Promise<void> {
  await window.getByRole('button', { name: /^sessions$/i }).click();
  await window.waitForTimeout(300);
  await window.getByRole('button', { name: 'New Session', exact: true }).first().click();
  await window.waitForTimeout(300);

  const escaped = compositionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const compBtn = window.getByRole('button', { name: new RegExp(escaped, 'i') }).first();
  await compBtn.waitFor({ state: 'visible', timeout: 10_000 });
  await compBtn.click();
  await window.getByPlaceholder('My session').waitFor({ state: 'visible', timeout: 5_000 });
  await window.getByPlaceholder('My session').fill(`${compositionName} Session`);
  await window.getByRole('button', { name: 'Start Session' }).click();
  await window.getByPlaceholder('Message the ensemble\u2026').waitFor({ state: 'visible', timeout: 45_000 });
  await window.waitForTimeout(300);
}

async function sendMessage(window: Page, message: string): Promise<void> {
  await window.getByPlaceholder('Message the ensemble\u2026').fill(message);
  await window.keyboard.press('Enter');
}

async function waitForSessionIdle(window: Page, timeout = 120_000): Promise<void> {
  await window.getByPlaceholder('Message the ensemble\u2026').waitFor({ state: 'visible', timeout });
}

// ── Track capture functions ───────────────────────────────────────────────────

async function captureTypeToggle(ffmpegBin: string): Promise<void> {
  console.log('\n── Track 1: Compositions — build, type toggle, directed messages ─');

  const { app, window } = await launchApp({ skipOnboarding: true });
  const framesDir = makeTempDir('polyphon-frames-type-toggle-');
  const cues = new CueEmitter();

  try {
    await enableAllProviders(window);

    cues.start();
    const stopRecording = await startFrameRecording(window, framesDir, 15);
    cues.emit('app-launched', 'App open, all providers enabled, Compositions section visible');

    // ── Part 1: Build the composition ──────────────────────────────────────

    await openNewComposition(window);
    cues.emit('composition-builder-opened', 'New composition builder opened, name field empty');
    await window.getByPlaceholder('My Composition').fill('Research Duo');
    await window.waitForTimeout(2_500);
    cues.emit('composition-named', 'Composition named "Research Duo"');

    // Select Anthropic — show the voice type toggle before adding
    await window.getByRole('button', { name: 'Anthropic' }).first().click();
    await window.waitForTimeout(2_500);

    // Scroll the type toggle into view so it isn't cut off
    try {
      const apiBtn = window.getByRole('button', { name: /^api$/i });
      await apiBtn.waitFor({ state: 'visible', timeout: 3_000 });
      await apiBtn.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      await window.waitForTimeout(1_000);
      // Hover API to show the "No API key configured" tooltip
      await apiBtn.hover();
      await window.waitForTimeout(4_500);
      // Switch to CLI
      const cliBtn = window.getByRole('button', { name: /^cli$/i });
      await cliBtn.waitFor({ state: 'visible', timeout: 2_000 });
      const isDisabled = await cliBtn.getAttribute('disabled');
      if (!isDisabled) {
        await cliBtn.click();
        await window.waitForTimeout(3_000);
      }
    } catch {
      // type toggle may not be present if both types unavailable
    }
    cues.emit('voice-type-toggle', 'Voice type toggle shown — API disabled (no key), switching to CLI');

    // Add Anthropic to the composition
    await window.getByRole('button', { name: 'Add Voice' }).click();
    await window.waitForTimeout(2_500);
    cues.emit('anthropic-voice-added', 'Anthropic voice added to composition in CLI mode');

    // Select OpenAI and add it too
    await window.getByRole('button', { name: 'OpenAI' }).first().click();
    await window.waitForTimeout(2_500);
    await window.getByRole('button', { name: 'Add Voice' }).click();
    await window.waitForTimeout(2_500);
    cues.emit('openai-voice-added', 'OpenAI voice added to composition');

    // Save — composition is already in conductor mode (the default)
    await window.getByRole('button', { name: 'Save Composition' }).click();
    await window.waitForTimeout(2_000);
    cues.emit('composition-saved', 'Research Duo composition saved with both voices');

    // ── Part 2: Start a session and send directed messages ─────────────────

    await startSessionFromComposition(window, 'Research Duo');
    await window.waitForTimeout(2_500);
    cues.emit('session-started', 'Session started from Research Duo composition');

    // Direct a question to Anthropic using @mention
    await window.getByPlaceholder('Message the ensemble\u2026').click();
    await window.waitForTimeout(1_000);
    await window.getByPlaceholder('Message the ensemble\u2026').type('@');
    await window.waitForTimeout(2_000);
    await window.getByPlaceholder('Message the ensemble\u2026').type('A');
    await window.waitForTimeout(3_500);
    try {
      await window.locator('[role="option"]').first().waitFor({ state: 'visible', timeout: 2_000 });
      await window.locator('[role="option"]').first().click();
      await window.waitForTimeout(1_500);
    } catch { /* dropdown shape may differ */ }
    cues.emit('at-mention-anthropic', 'At-mention picker used to target Anthropic voice');
    await window.getByPlaceholder('Message the ensemble\u2026').type(' What makes a great API design?');
    await window.waitForTimeout(1_000);
    await window.keyboard.press('Enter');
    await window.getByPlaceholder('Waiting for voices\u2026').waitFor({ state: 'visible', timeout: 30_000 });
    await waitForSessionIdle(window);
    await window.waitForTimeout(3_500);
    cues.emit('anthropic-responded', 'Anthropic voice finished streaming its response');

    // Direct a different question to OpenAI using @mention
    await window.getByPlaceholder('Message the ensemble\u2026').click();
    await window.waitForTimeout(1_000);
    await window.getByPlaceholder('Message the ensemble\u2026').type('@');
    await window.waitForTimeout(2_000);
    await window.getByPlaceholder('Message the ensemble\u2026').type('O');
    await window.waitForTimeout(3_500);
    try {
      await window.locator('[role="option"]').first().waitFor({ state: 'visible', timeout: 2_000 });
      await window.locator('[role="option"]').first().click();
      await window.waitForTimeout(1_500);
    } catch { /* dropdown shape may differ */ }
    cues.emit('at-mention-openai', 'At-mention picker used to target OpenAI voice');
    await window.getByPlaceholder('Message the ensemble\u2026').type(' What makes a great developer experience?');
    await window.waitForTimeout(1_000);
    await window.keyboard.press('Enter');
    await window.getByPlaceholder('Waiting for voices\u2026').waitFor({ state: 'visible', timeout: 30_000 });
    await waitForSessionIdle(window);
    await window.waitForTimeout(4_000);
    cues.emit('openai-responded', 'OpenAI voice finished streaming its response');

    await stopRecording();
  } finally {
    try { await app.close(); } catch { /* ignore */ }
  }

  const outputMp4 = path.join(SITE_STATIC, 'videos', 'docs', 'compositions-type-toggle.mp4');
  compileFramesToMp4(ffmpegBin, framesDir, outputMp4, 15);
  cues.save(path.join(SITE_STATIC, 'videos', 'docs', 'compositions-type-toggle-cues.json'));
  // Poster at 12s: lands after the type toggle, showing the saved composition with both voices
  extractPosterFrame(ffmpegBin, outputMp4, path.join(SITE_STATIC, 'images', 'video-posters', 'docs', 'compositions-type-toggle.webp'), 12);
  assertOutputWithinBudget(outputMp4, 30);
  captured++;
  const mb = (fs.statSync(outputMp4).size / (1024 * 1024)).toFixed(1);
  console.log(`  ✓ videos/docs/compositions-type-toggle.mp4 (${mb}MB)`);
}

async function captureStreaming(ffmpegBin: string): Promise<void> {
  console.log('\n── Track 2: Multi-voice streaming ───────────────────────────────');

  const { app, window } = await launchApp({ skipOnboarding: true });
  const framesDir = makeTempDir('polyphon-frames-streaming-');
  const cues = new CueEmitter();

  try {
    await enableAllProviders(window);
    await buildAndSaveComposition(window, 'Streaming Demo', ['Anthropic', 'OpenAI']);
    await startSessionFromComposition(window, 'Streaming Demo');

    // Start recording at 15fps; dwell on the empty session so viewers can orient
    cues.start();
    const stopRecording = await startFrameRecording(window, framesDir, 15);
    await window.waitForTimeout(3_000);
    cues.emit('session-started', 'Streaming Demo session open with Anthropic and OpenAI voices');

    // Round 1: open question — each voice answers from its own perspective
    await sendMessage(window, 'What is the single most important quality in a great software engineer: technical skill or communication?');
    cues.emit('round1-sent', 'Question sent — both voices begin streaming simultaneously');
    await window.getByPlaceholder('Waiting for voices\u2026').waitFor({ state: 'visible', timeout: 30_000 });
    await waitForSessionIdle(window);
    await window.waitForTimeout(3_000); // hold so viewers can read both responses
    cues.emit('round1-complete', 'Both voices finished streaming round 1 responses');

    // Round 2: ask each voice to engage with what the other said
    await sendMessage(window, 'Now read each other\'s response and say in two sentences whether you agree or disagree.');
    cues.emit('round2-sent', 'Follow-up sent — voices read each other\'s responses');
    await window.getByPlaceholder('Waiting for voices\u2026').waitFor({ state: 'visible', timeout: 30_000 });
    await waitForSessionIdle(window);
    await window.waitForTimeout(4_000); // hold on the final exchange before cut
    cues.emit('round2-complete', 'Both voices finished their round 2 responses');

    await stopRecording();
  } finally {
    try { await app.close(); } catch { /* ignore */ }
  }

  const outputMp4 = path.join(SITE_STATIC, 'videos', 'docs', 'sessions-streaming.mp4');
  // No trim — capture the full natural response; budget raised accordingly
  compileFramesToMp4(ffmpegBin, framesDir, outputMp4, 15);
  cues.save(path.join(SITE_STATIC, 'videos', 'docs', 'sessions-streaming-cues.json'));
  // Poster at 4s: recording starts with a 3s dwell, so 4s lands just as the message is sent
  extractPosterFrame(ffmpegBin, outputMp4, path.join(SITE_STATIC, 'images', 'video-posters', 'docs', 'sessions-streaming.webp'), 4);
  assertOutputWithinBudget(outputMp4, 20);
  captured++;
  const mb = (fs.statSync(outputMp4).size / (1024 * 1024)).toFixed(1);
  console.log(`  ✓ videos/docs/sessions-streaming.mp4 (${mb}MB)`);
}

async function captureAtMention(ffmpegBin: string): Promise<void> {
  console.log('\n── Track 3: @mention flow ───────────────────────────────────────');

  // Fresh launch — do not reuse streaming state
  const { app, window } = await launchApp({ skipOnboarding: true });
  const framesDir = makeTempDir('polyphon-frames-at-mention-');
  const cues = new CueEmitter();

  try {
    await enableAllProviders(window);
    await buildAndSaveComposition(
      window,
      'Mention Demo',
      ['Anthropic', 'OpenAI'],
      { mode: 'conductor' },
    );
    await startSessionFromComposition(window, 'Mention Demo');

    // Start recording at 15fps; dwell on the session so viewers can orient
    cues.start();
    const stopRecording = await startFrameRecording(window, framesDir, 15);
    await window.waitForTimeout(3_000);
    cues.emit('session-started', 'Mention Demo session open in conductor mode');

    // Click into the input, pause so viewers see focus, then type "@" deliberately
    await window.getByPlaceholder('Message the ensemble\u2026').click();
    await window.waitForTimeout(1_500);
    cues.emit('input-focused', 'Message input focused, about to type @mention');
    await window.getByPlaceholder('Message the ensemble\u2026').type('@');
    await window.waitForTimeout(2_500); // hold so viewers see the picker open
    cues.emit('at-sign-typed', 'At-sign typed, voice picker dropdown opened');

    // Type a character to filter; hold so viewers can read the dropdown
    await window.getByPlaceholder('Message the ensemble\u2026').type('A');
    await window.waitForTimeout(4_500);
    cues.emit('picker-filtered', 'Picker filtered to Anthropic voice');

    // Click the first voice; dwell so viewers see the voice panel highlight
    try {
      const dropdownItem = window.locator('[role="option"]').first();
      await dropdownItem.waitFor({ state: 'visible', timeout: 2_000 });
      await dropdownItem.click();
      await window.waitForTimeout(2_500); // hold — viewer sees the targeted voice highlighted
    } catch {
      // dropdown structure may differ
    }
    cues.emit('voice-selected', 'Anthropic voice selected from picker, input shows @mention tag');

    // Type the rest of the message and send it — this is the point of the demo
    await window.getByPlaceholder('Message the ensemble\u2026').type(' what is polyphony in one sentence?');
    await window.waitForTimeout(1_000);
    cues.emit('message-composed', 'Full directed message composed targeting Anthropic');
    await window.keyboard.press('Enter');

    // Wait for the directed voice to stream its response
    await window.getByPlaceholder('Waiting for voices\u2026').waitFor({ state: 'visible', timeout: 30_000 });
    await waitForSessionIdle(window);
    await window.waitForTimeout(4_000); // hold on the completed response before cut
    cues.emit('voice-responded', 'Anthropic responded to the directed question');

    await stopRecording();
  } finally {
    try { await app.close(); } catch { /* ignore */ }
  }

  const outputMp4 = path.join(SITE_STATIC, 'videos', 'docs', 'sessions-at-mention.mp4');
  // No trim — let the full response play out naturally
  compileFramesToMp4(ffmpegBin, framesDir, outputMp4, 15);
  cues.save(path.join(SITE_STATIC, 'videos', 'docs', 'sessions-at-mention-cues.json'));
  // Poster at 8s: lands after the @mention selection, showing the targeted voice highlighted
  extractPosterFrame(ffmpegBin, outputMp4, path.join(SITE_STATIC, 'images', 'video-posters', 'docs', 'sessions-at-mention.webp'), 8);
  assertOutputWithinBudget(outputMp4, 20);
  captured++;
  const mb = (fs.statSync(outputMp4).size / (1024 * 1024)).toFixed(1);
  console.log(`  ✓ videos/docs/sessions-at-mention.mp4 (${mb}MB)`);
}

async function captureWalkthrough(ffmpegBin: string): Promise<void> {
  console.log('\n── Track 4: Full walkthrough ────────────────────────────────────');

  assertOllamaRunning();

  // Do NOT skip onboarding — walkthrough shows it
  const { app, window } = await launchApp({ skipOnboarding: false });
  const framesDir = makeTempDir('polyphon-frames-walkthrough-');
  const cues = new CueEmitter();

  try {
    await window.waitForLoadState('domcontentloaded');

    // 15fps for smooth playback throughout the walkthrough
    cues.start();
    const stopRecording = await startFrameRecording(window, framesDir, 15);
    cues.emit('app-launched', 'App launched, onboarding screen visible');

    // ── Step 1: Onboarding ────────────────────────────────────────────────────

    await fillOnboarding(window, 'Alex', 'they/them', 'Software engineer exploring AI-assisted development.');
    await window.waitForTimeout(2_500);
    cues.emit('onboarding-complete', 'Conductor profile set — name Alex, pronouns they/them, software engineer bio');

    // ── Step 2: Settings tour ─────────────────────────────────────────────────

    await window.getByRole('button', { name: /settings/i }).click();
    await window.waitForTimeout(5_000); // Conductor tab (the default) — viewer reads the filled profile
    cues.emit('settings-conductor-tab', 'Settings open on Conductor tab — filled profile visible');

    await window.getByRole('tab', { name: /^Tones$/i }).click();
    await window.waitForTimeout(5_000);
    cues.emit('settings-tones-tab', 'Tones tab — preset tones like Professional, Collaborative, Concise visible');

    await window.getByRole('tab', { name: /^System Prompts$/i }).click();
    await window.waitForTimeout(5_000);
    cues.emit('settings-system-prompts-tab', 'System Prompts tab — reusable prompt templates for voices');

    await window.getByRole('tab', { name: /^General$/i }).click();
    await window.waitForTimeout(5_000);
    cues.emit('settings-general-tab', 'General tab — theme and app-level preferences');

    // ── Providers — detailed walkthrough ──────────────────────────────────────

    await window.getByRole('tab', { name: /^Providers$/i }).click();
    await window.waitForTimeout(4_000); // dwell on the full provider list before touching anything
    cues.emit('settings-providers-tab', 'Providers tab — all built-in providers listed, none yet enabled');

    // --- Anthropic ---
    // Enable it; the card expands in API mode by default — let the viewer read it
    const providerSwitches = window.getByRole('switch');
    await providerSwitches.nth(0).click();
    await window.getByText('Saved').first().waitFor({ state: 'visible', timeout: 5_000 });
    await window.waitForTimeout(4_000); // hold on API mode so viewers see the API key section + model list
    cues.emit('anthropic-api-enabled', 'Anthropic enabled in API mode — API key section and model list visible');

    // Switch to CLI to show how it works differently
    const firstCliBtn = window.getByRole('button', { name: /^CLI$/i }).first();
    await firstCliBtn.waitFor({ state: 'visible', timeout: 3_000 });
    await firstCliBtn.click();
    await window.getByText('Saved').first().waitFor({ state: 'visible', timeout: 5_000 });
    await window.waitForTimeout(4_500); // hold on CLI config — viewer sees command/args fields
    cues.emit('anthropic-cli-mode', 'Anthropic switched to CLI mode — command and args fields visible');

    // --- OpenAI ---
    // Scroll the OpenAI card into view, then enable it in API mode
    await providerSwitches.nth(1).evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    await window.waitForTimeout(1_200);
    await providerSwitches.nth(1).click();
    await window.getByText('Saved').first().waitFor({ state: 'visible', timeout: 5_000 });
    await window.waitForTimeout(3_000); // hold on API mode — show API key badge + model dropdown
    cues.emit('openai-enabled', 'OpenAI enabled in API mode — API key badge and model dropdown visible');

    // Click Refresh to demonstrate the live model fetch
    try {
      const refreshBtn = window.getByRole('button', { name: /refresh models for openai/i });
      await refreshBtn.waitFor({ state: 'visible', timeout: 3_000 });
      await refreshBtn.click();
      await window.waitForTimeout(4_500); // watch the model list populate
    } catch { /* no API key or button not found — skip */ }
    await window.waitForTimeout(3_500); // hold on the populated model dropdown
    cues.emit('openai-models-fetched', 'OpenAI model list refreshed from the API');

    // --- Gemini ---
    // Scroll down, enable it — Gemini is API-only so there's no CLI toggle to show
    await providerSwitches.nth(2).evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    await window.waitForTimeout(1_200);
    await providerSwitches.nth(2).click();
    await window.getByText('Saved').first().waitFor({ state: 'visible', timeout: 5_000 });
    await window.waitForTimeout(4_000); // dwell — viewer sees Gemini has no CLI option
    cues.emit('gemini-enabled', 'Gemini enabled — API-only, no CLI option');

    await window.waitForTimeout(2_500); // final hold on the configured providers screen

    // ── Custom Providers — add two Ollama-backed providers ────────────────────

    // Scroll the Add Custom Provider button into view
    const addCustomBtn = window.getByRole('button', { name: /Add Custom Provider/i }).first();
    await addCustomBtn.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    await window.waitForTimeout(2_500); // hold — viewers read the Custom Providers heading
    cues.emit('custom-providers-section', 'Custom Providers section visible — Add Custom Provider button shown');

    // Provider 1: Llama 3.2
    await addCustomBtn.click();
    await window.waitForTimeout(1_000);
    // Scroll the form into view so viewers can see every field being filled
    const nameField1 = window.getByRole('textbox', { name: /^Name/ });
    await nameField1.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    await window.waitForTimeout(1_500);
    await nameField1.fill('Llama 3.2');
    await window.waitForTimeout(800);
    await window.getByPlaceholder('http://localhost:11434/v1').fill('http://localhost:11434/v1');
    await window.waitForTimeout(800);
    await window.getByPlaceholder('llama3.2').fill('llama3.2:1b');
    await window.waitForTimeout(1_500);
    cues.emit('llama-form-filled', 'Llama 3.2 custom provider form filled — name, base URL http://localhost:11434/v1, model llama3.2:1b');
    const saveBtn1 = window.getByRole('button', { name: 'Save', exact: true }).first();
    await saveBtn1.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    await window.waitForTimeout(800);
    await saveBtn1.click();
    await window.waitForTimeout(2_500); // hold — viewers see the Llama 3.2 card saved
    cues.emit('llama-provider-saved', 'Llama 3.2 custom provider saved and card visible');

    // Provider 2: Qwen 2.5
    const addCustomBtn2 = window.getByRole('button', { name: /Add Custom Provider/i }).first();
    await addCustomBtn2.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    await window.waitForTimeout(800);
    await addCustomBtn2.click();
    await window.waitForTimeout(1_000);
    // Scroll the form into view so viewers can see every field being filled
    const nameField2 = window.getByRole('textbox', { name: /^Name/ });
    await nameField2.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    await window.waitForTimeout(1_500);
    await nameField2.fill('Qwen 2.5');
    await window.waitForTimeout(800);
    await window.getByPlaceholder('http://localhost:11434/v1').fill('http://localhost:11434/v1');
    await window.waitForTimeout(800);
    await window.getByPlaceholder('llama3.2').fill('qwen2.5:0.5b');
    await window.waitForTimeout(1_500);
    cues.emit('qwen-form-filled', 'Qwen 2.5 custom provider form filled — same Ollama base URL, model qwen2.5:0.5b');
    const saveBtn2 = window.getByRole('button', { name: 'Save', exact: true }).first();
    await saveBtn2.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    await window.waitForTimeout(800);
    await saveBtn2.click();
    await window.waitForTimeout(3_000); // hold — viewers see both custom provider cards
    cues.emit('qwen-provider-saved', 'Qwen 2.5 custom provider saved — both Ollama providers now listed');

    // ── Step 3: Create three compositions ────────────────────────────────────

    // Composition 1 — broadcast: both voices answer every message in parallel
    await window.getByRole('button', { name: /compositions/i }).click();
    await window.waitForTimeout(2_000); // hold — viewers see the compositions list
    await window.getByRole('button', { name: 'New Composition', exact: true }).first().click();
    await window.waitForTimeout(2_500); // hold — viewers see the empty builder appear
    cues.emit('composition-builder-opened-1', 'Composition builder opened for first composition');
    await window.getByPlaceholder('My Composition').fill('Research Panel');
    await window.waitForTimeout(2_500); // hold — viewers read the name
    cues.emit('composition-named-broadcast', 'Composition named "Research Panel"');
    await window.getByRole('button', { name: /broadcast/i }).first().click();
    await window.waitForTimeout(3_000); // hold — viewers see the mode switch to Broadcast
    cues.emit('composition-mode-broadcast', 'Mode set to Broadcast — all voices answer every message');
    await window.getByRole('button', { name: 'Anthropic' }).first().click();
    await window.waitForTimeout(3_000); // hold — viewers see the Anthropic voice config form
    await window.getByRole('button', { name: 'Add Voice' }).click();
    await window.waitForTimeout(2_500); // hold — voice appears in the order list
    cues.emit('composition-anthropic-added', 'Anthropic voice added to Research Panel');
    await window.getByRole('button', { name: 'OpenAI' }).first().click();
    await window.waitForTimeout(3_000); // hold — viewers see the OpenAI voice config form
    await window.getByRole('button', { name: 'Add Voice' }).click();
    await window.waitForTimeout(2_500); // hold — both voices listed
    cues.emit('composition-openai-added', 'OpenAI voice added to Research Panel');
    await window.getByRole('button', { name: 'Save Composition' }).click();
    await window.waitForTimeout(3_000); // hold — viewers see the saved composition
    cues.emit('composition-broadcast-saved', 'Research Panel broadcast composition saved');

    // Composition 2 — conductor: direct messages to individual voices
    await window.getByRole('button', { name: /compositions/i }).click();
    await window.waitForTimeout(2_000); // hold — viewers see both compositions listed
    await window.getByRole('button', { name: 'New Composition', exact: true }).first().click();
    await window.waitForTimeout(2_500); // hold — viewers see the empty builder appear
    cues.emit('composition-builder-opened-2', 'Composition builder opened for second composition');
    await window.getByPlaceholder('My Composition').fill('Directed Q&A');
    await window.waitForTimeout(3_000); // hold — viewers read the name; conductor is the default mode
    cues.emit('composition-named-conductor', 'Composition named "Directed Q&A" — conductor mode is default');
    await window.getByRole('button', { name: 'Anthropic' }).first().click();
    await window.waitForTimeout(3_000); // hold — viewers see the Anthropic voice config form
    await window.getByRole('button', { name: 'Add Voice' }).click();
    await window.waitForTimeout(2_500); // hold — voice appears in the order list
    cues.emit('composition-conductor-anthropic-added', 'Anthropic voice added to Directed Q&A');
    await window.getByRole('button', { name: 'OpenAI' }).first().click();
    await window.waitForTimeout(3_000); // hold — viewers see the OpenAI voice config form
    await window.getByRole('button', { name: 'Add Voice' }).click();
    await window.waitForTimeout(2_500); // hold — both voices listed
    cues.emit('composition-conductor-openai-added', 'OpenAI voice added to Directed Q&A');
    await window.getByRole('button', { name: 'Save Composition' }).click();
    await window.waitForTimeout(3_000); // hold — viewers see the saved composition
    cues.emit('composition-conductor-saved', 'Directed Q&A conductor composition saved');

    // Composition 3 — conductor: two local Ollama models
    await window.getByRole('button', { name: /compositions/i }).click();
    await window.waitForTimeout(2_000); // hold — viewers see all three compositions listed
    await window.getByRole('button', { name: 'New Composition', exact: true }).first().click();
    await window.waitForTimeout(2_500); // hold — viewers see the empty builder appear
    cues.emit('composition-builder-opened-3', 'Composition builder opened for Ollama Duo composition');
    await window.getByPlaceholder('My Composition').fill('Ollama Duo');
    await window.waitForTimeout(2_500); // hold — viewers read the name
    cues.emit('composition-named-ollama', 'Composition named "Ollama Duo" — conductor mode');
    await window.getByRole('button', { name: /Llama 3\.2/i }).first().click();
    await window.waitForTimeout(3_000); // hold — viewers see the Llama 3.2 voice config form
    await window.getByRole('button', { name: 'Add Voice' }).click();
    await window.waitForTimeout(2_500); // hold — voice appears in the order list
    cues.emit('composition-ollama-llama-added', 'Llama 3.2 local voice added to Ollama Duo');
    await window.getByRole('button', { name: /Qwen 2\.5/i }).first().click();
    await window.waitForTimeout(3_000); // hold — viewers see the Qwen 2.5 voice config form
    await window.getByRole('button', { name: 'Add Voice' }).click();
    await window.waitForTimeout(2_500); // hold — both voices listed
    cues.emit('composition-ollama-qwen-added', 'Qwen 2.5 local voice added to Ollama Duo');
    await window.getByRole('button', { name: 'Save Composition' }).click();
    await window.waitForTimeout(3_000); // hold — viewers see the saved composition
    cues.emit('composition-ollama-saved', 'Ollama Duo composition saved with both local voices');

    // ── Step 4: Broadcast session — both voices research a topic together ─────

    await window.getByRole('button', { name: /^sessions$/i }).click();
    await window.waitForTimeout(2_000); // hold — viewers see the sessions list
    await window.getByRole('button', { name: 'New Session', exact: true }).first().click();
    await window.waitForTimeout(2_500); // hold — viewers see the composition picker
    await window.getByRole('button', { name: /Research Panel/i }).first().waitFor({ state: 'visible', timeout: 10_000 });
    await window.getByRole('button', { name: /Research Panel/i }).first().click();
    await window.waitForTimeout(2_000); // hold — viewers see the composition selected
    await window.getByPlaceholder('My session').waitFor({ state: 'visible', timeout: 5_000 });
    await window.getByPlaceholder('My session').fill('Research Panel Session');
    await window.waitForTimeout(2_000); // hold — viewers read the session name
    await window.getByRole('button', { name: 'Start Session' }).click();
    await window.getByPlaceholder('Message the ensemble\u2026').waitFor({ state: 'visible', timeout: 45_000 });
    await window.waitForTimeout(3_000); // hold — viewers orient to the session view
    cues.emit('session-broadcast-started', 'Research Panel broadcast session started — both voices ready');

    // Round 1 — ask a research question; both voices respond simultaneously
    await sendMessage(window, 'What are the main tradeoffs between microservices and monolithic architectures?');
    cues.emit('broadcast-round1-sent', 'Research question sent — Anthropic and OpenAI stream simultaneously');
    await window.getByPlaceholder('Waiting for voices\u2026').waitFor({ state: 'visible', timeout: 30_000 });
    await waitForSessionIdle(window, 180_000);
    await window.waitForTimeout(4_000);
    cues.emit('broadcast-round1-complete', 'Both voices finished round 1 — parallel responses visible');

    // Round 2 — ask voices to engage with each other's response
    await sendMessage(window, 'Read each other\'s response and add one important point the other missed.');
    cues.emit('broadcast-round2-sent', 'Follow-up sent — voices read and respond to each other');
    await window.getByPlaceholder('Waiting for voices\u2026').waitFor({ state: 'visible', timeout: 30_000 });
    await waitForSessionIdle(window, 180_000);
    await window.waitForTimeout(4_000);
    cues.emit('broadcast-round2-complete', 'Round 2 complete — voices have engaged with each other\'s answers');

    // ── Step 5: Conductor session — direct different questions to each voice ──

    await window.getByRole('button', { name: /^sessions$/i }).click();
    await window.waitForTimeout(2_000); // hold — viewers see the sessions list
    await window.getByRole('button', { name: 'New Session', exact: true }).first().click();
    await window.waitForTimeout(2_500); // hold — viewers see the composition picker
    await window.getByRole('button', { name: /Directed Q&A/i }).first().waitFor({ state: 'visible', timeout: 10_000 });
    await window.getByRole('button', { name: /Directed Q&A/i }).first().click();
    await window.waitForTimeout(2_000); // hold — viewers see the composition selected
    await window.getByPlaceholder('My session').waitFor({ state: 'visible', timeout: 5_000 });
    await window.getByPlaceholder('My session').fill('Directed Q&A Session');
    await window.waitForTimeout(2_000); // hold — viewers read the session name
    await window.getByRole('button', { name: 'Start Session' }).click();
    await window.getByPlaceholder('Message the ensemble\u2026').waitFor({ state: 'visible', timeout: 45_000 });
    await window.waitForTimeout(3_000); // hold — viewers orient to the session view
    cues.emit('session-conductor-started', 'Directed Q&A conductor session started');

    // Direct a question to Anthropic
    await window.getByPlaceholder('Message the ensemble\u2026').click();
    await window.waitForTimeout(1_000);
    await window.getByPlaceholder('Message the ensemble\u2026').type('@');
    await window.waitForTimeout(2_000);
    await window.getByPlaceholder('Message the ensemble\u2026').type('A');
    await window.waitForTimeout(3_500);
    try {
      await window.locator('[role="option"]').first().waitFor({ state: 'visible', timeout: 2_000 });
      await window.locator('[role="option"]').first().click();
      await window.waitForTimeout(1_500);
    } catch { /* dropdown shape may differ */ }
    cues.emit('directed-anthropic-targeted', 'Anthropic targeted via @mention for the first question');
    await window.getByPlaceholder('Message the ensemble\u2026').type(' What\'s your top tip for a junior developer trying to grow quickly?');
    await window.waitForTimeout(1_500);
    await window.keyboard.press('Enter');
    await window.getByPlaceholder('Waiting for voices\u2026').waitFor({ state: 'visible', timeout: 30_000 });
    await waitForSessionIdle(window, 180_000);
    await window.waitForTimeout(4_000);
    cues.emit('directed-anthropic-responded', 'Anthropic answered — only this voice responded');

    // Direct OpenAI to engage with Anthropic's answer
    await window.getByPlaceholder('Message the ensemble\u2026').click();
    await window.waitForTimeout(1_000);
    await window.getByPlaceholder('Message the ensemble\u2026').type('@');
    await window.waitForTimeout(2_000);
    await window.getByPlaceholder('Message the ensemble\u2026').type('O');
    await window.waitForTimeout(3_500);
    try {
      await window.locator('[role="option"]').first().waitFor({ state: 'visible', timeout: 2_000 });
      await window.locator('[role="option"]').first().click();
      await window.waitForTimeout(1_500);
    } catch { /* dropdown shape may differ */ }
    cues.emit('directed-openai-targeted', 'OpenAI targeted via @mention to respond to Anthropic\'s answer');
    await window.getByPlaceholder('Message the ensemble\u2026').type(' What do you think of that advice? Would you add or change anything?');
    await window.waitForTimeout(1_500);
    await window.keyboard.press('Enter');
    await window.getByPlaceholder('Waiting for voices\u2026').waitFor({ state: 'visible', timeout: 30_000 });
    await waitForSessionIdle(window, 180_000);
    await window.waitForTimeout(4_000);
    cues.emit('directed-openai-responded', 'OpenAI responded — a direct reply to Anthropic\'s answer');

    // ── Step 6: Ollama Duo — local models with directed questions ─────────────

    await window.getByRole('button', { name: /^sessions$/i }).click();
    await window.waitForTimeout(2_000); // hold — viewers see the sessions list
    await window.getByRole('button', { name: 'New Session', exact: true }).first().click();
    await window.waitForTimeout(2_500); // hold — viewers see the composition picker
    await window.getByRole('button', { name: /Ollama Duo/i }).first().waitFor({ state: 'visible', timeout: 10_000 });
    await window.getByRole('button', { name: /Ollama Duo/i }).first().click();
    await window.waitForTimeout(2_000); // hold — viewers see the composition selected
    await window.getByPlaceholder('My session').waitFor({ state: 'visible', timeout: 5_000 });
    await window.getByPlaceholder('My session').fill('Ollama Duo Session');
    await window.waitForTimeout(2_000); // hold — viewers read the session name
    await window.getByRole('button', { name: 'Start Session' }).click();
    await window.getByPlaceholder('Message the ensemble\u2026').waitFor({ state: 'visible', timeout: 45_000 });
    await window.waitForTimeout(3_000); // hold — viewers orient to the session view
    cues.emit('session-ollama-started', 'Ollama Duo session started — two local models ready');

    // Direct a simple question to Llama 3.2
    await window.getByPlaceholder('Message the ensemble\u2026').click();
    await window.waitForTimeout(1_000);
    await window.getByPlaceholder('Message the ensemble\u2026').type('@');
    await window.waitForTimeout(2_000);
    await window.getByPlaceholder('Message the ensemble\u2026').type('L');
    await window.waitForTimeout(3_500);
    try {
      await window.locator('[role="option"]').first().waitFor({ state: 'visible', timeout: 2_000 });
      await window.locator('[role="option"]').first().click();
      await window.waitForTimeout(1_500);
    } catch { /* dropdown shape may differ */ }
    cues.emit('directed-llama-targeted', 'Llama 3.2 targeted with a simple question');
    await window.getByPlaceholder('Message the ensemble\u2026').type(' What is the capital of France?');
    await window.waitForTimeout(1_500);
    await window.keyboard.press('Enter');
    await window.getByPlaceholder('Waiting for voices\u2026').waitFor({ state: 'visible', timeout: 30_000 });
    await waitForSessionIdle(window, 120_000);
    await window.waitForTimeout(4_000);
    cues.emit('directed-llama-responded', 'Llama 3.2 answered locally — no cloud required');

    // Direct a simple question to Qwen 2.5
    await window.getByPlaceholder('Message the ensemble\u2026').click();
    await window.waitForTimeout(1_000);
    await window.getByPlaceholder('Message the ensemble\u2026').type('@');
    await window.waitForTimeout(2_000);
    await window.getByPlaceholder('Message the ensemble\u2026').type('Q');
    await window.waitForTimeout(3_500);
    try {
      await window.locator('[role="option"]').first().waitFor({ state: 'visible', timeout: 2_000 });
      await window.locator('[role="option"]').first().click();
      await window.waitForTimeout(1_500);
    } catch { /* dropdown shape may differ */ }
    cues.emit('directed-qwen-targeted', 'Qwen 2.5 targeted with a different simple question');
    await window.getByPlaceholder('Message the ensemble\u2026').type(' What color is the sky?');
    await window.waitForTimeout(1_500);
    await window.keyboard.press('Enter');
    await window.getByPlaceholder('Waiting for voices\u2026').waitFor({ state: 'visible', timeout: 30_000 });
    await waitForSessionIdle(window, 120_000);
    await window.waitForTimeout(4_000);
    cues.emit('directed-qwen-responded', 'Qwen 2.5 answered — two local models, one conversation');

    await stopRecording();
  } finally {
    try { await app.close(); } catch { /* ignore */ }
  }

  const outputMp4 = path.join(SITE_STATIC, 'videos', 'home', 'full-walkthrough.mp4');
  compileFramesToMp4(ffmpegBin, framesDir, outputMp4, 15);
  cues.save(path.join(SITE_STATIC, 'videos', 'home', 'full-walkthrough-cues.json'));
  assertOutputWithinBudget(outputMp4, 100);
  captured++;
  const mb = (fs.statSync(outputMp4).size / (1024 * 1024)).toFixed(1);
  console.log(`  ✓ videos/home/full-walkthrough.mp4 (${mb}MB)`);
}

async function captureCustomProviders(ffmpegBin: string): Promise<void> {
  console.log('\n── Track 5: Custom providers — Ollama ──────────────────────────');

  const { app, window } = await launchApp({ skipOnboarding: true });
  const framesDir = makeTempDir('polyphon-frames-custom-providers-');
  const cues = new CueEmitter();

  try {
    cues.start();
    const stopRecording = await startFrameRecording(window, framesDir, 15);
    await window.waitForTimeout(2_000);
    cues.emit('app-launched', 'App open, navigating to Settings Providers tab');

    // ── Step 1: Add first custom provider — Llama 3.2 ────────────────────

    await goToSettingsTab(window, 'Providers');

    // Scroll the Add Custom Provider button into view so viewers see the section
    const addBtn = window.getByRole('button', { name: /Add Custom Provider/i }).first();
    await addBtn.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    await window.waitForTimeout(2_500); // hold — viewers read the Custom Providers heading
    cues.emit('custom-providers-section', 'Custom Providers section visible');

    await addBtn.click();
    await window.waitForTimeout(1_000);
    // Scroll the form into view so viewers can see every field being filled
    const nameField1 = window.getByRole('textbox', { name: /^Name/ });
    await nameField1.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    await window.waitForTimeout(1_500);

    await nameField1.fill('Llama 3.2');
    await window.waitForTimeout(1_000);
    await window.getByPlaceholder('http://localhost:11434/v1').fill('http://localhost:11434/v1');
    await window.waitForTimeout(1_000);
    await window.getByPlaceholder('llama3.2').fill('llama3.2:1b');
    await window.waitForTimeout(2_000);
    cues.emit('llama-form-filled', 'Llama 3.2 form filled — Ollama base URL and model name');

    const saveBtn1 = window.getByRole('button', { name: 'Save', exact: true }).first();
    await saveBtn1.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    await window.waitForTimeout(800);
    await saveBtn1.click();
    await window.waitForTimeout(2_500); // hold — viewers see the saved provider card
    cues.emit('llama-provider-saved', 'Llama 3.2 provider saved');

    // ── Step 2: Add second custom provider — Qwen 2.5 ────────────────────

    const addBtn2 = window.getByRole('button', { name: /Add Custom Provider/i }).first();
    await addBtn2.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    await window.waitForTimeout(1_000);

    await addBtn2.click();
    await window.waitForTimeout(1_000);
    // Scroll the form into view so viewers can see every field being filled
    const nameField2 = window.getByRole('textbox', { name: /^Name/ });
    await nameField2.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    await window.waitForTimeout(1_500);

    await nameField2.fill('Qwen 2.5');
    await window.waitForTimeout(1_000);
    await window.getByPlaceholder('http://localhost:11434/v1').fill('http://localhost:11434/v1');
    await window.waitForTimeout(1_000);
    await window.getByPlaceholder('llama3.2').fill('qwen2.5:0.5b');
    await window.waitForTimeout(2_000);
    cues.emit('qwen-form-filled', 'Qwen 2.5 form filled — same Ollama URL, different model');

    const saveBtn2 = window.getByRole('button', { name: 'Save', exact: true }).first();
    await saveBtn2.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    await window.waitForTimeout(800);
    await saveBtn2.click();
    await window.waitForTimeout(3_000); // hold — viewers see both provider cards
    cues.emit('qwen-provider-saved', 'Both Ollama providers saved');

    // ── Step 3: Build a directed composition with both ────────────────────

    await openNewComposition(window);
    await window.getByPlaceholder('My Composition').fill('Ollama Duo');
    await window.waitForTimeout(2_000);

    // Conductor mode is the default — no toggle needed

    // Add Llama 3.2 voice
    await window.getByRole('button', { name: /Llama 3\.2/i }).first().click();
    await window.waitForTimeout(2_000);
    await window.getByRole('button', { name: 'Add Voice' }).click();
    await window.waitForTimeout(1_500);

    // Add Qwen 2.5 voice
    await window.getByRole('button', { name: /Qwen 2\.5/i }).first().click();
    await window.waitForTimeout(2_000);
    await window.getByRole('button', { name: 'Add Voice' }).click();
    await window.waitForTimeout(1_500);

    await window.getByRole('button', { name: 'Save Composition' }).click();
    await window.waitForTimeout(2_000);
    cues.emit('composition-saved', 'Ollama Duo conductor composition saved with both local voices');

    // ── Step 4: Start a session and direct easy questions ─────────────────

    await startSessionFromComposition(window, 'Ollama Duo');
    await window.waitForTimeout(2_500);
    cues.emit('session-started', 'Ollama Duo session started');

    // Ask Llama 3.2 a simple question
    await window.getByPlaceholder('Message the ensemble\u2026').click();
    await window.waitForTimeout(1_000);
    await window.getByPlaceholder('Message the ensemble\u2026').type('@');
    await window.waitForTimeout(2_000);
    await window.getByPlaceholder('Message the ensemble\u2026').type('L');
    await window.waitForTimeout(3_500);
    try {
      await window.locator('[role="option"]').first().waitFor({ state: 'visible', timeout: 2_000 });
      await window.locator('[role="option"]').first().click();
      await window.waitForTimeout(1_500);
    } catch { /* dropdown shape may differ */ }
    cues.emit('directed-llama-targeted', 'Llama 3.2 targeted');
    await window.getByPlaceholder('Message the ensemble\u2026').type(' What is the capital of France?');
    await window.waitForTimeout(1_000);
    await window.keyboard.press('Enter');
    await window.getByPlaceholder('Waiting for voices\u2026').waitFor({ state: 'visible', timeout: 30_000 });
    await waitForSessionIdle(window, 120_000);
    await window.waitForTimeout(3_500);
    cues.emit('directed-llama-responded', 'Llama 3.2 answered');

    // Ask Qwen 2.5 a simple question
    await window.getByPlaceholder('Message the ensemble\u2026').click();
    await window.waitForTimeout(1_000);
    await window.getByPlaceholder('Message the ensemble\u2026').type('@');
    await window.waitForTimeout(2_000);
    await window.getByPlaceholder('Message the ensemble\u2026').type('Q');
    await window.waitForTimeout(3_500);
    try {
      await window.locator('[role="option"]').first().waitFor({ state: 'visible', timeout: 2_000 });
      await window.locator('[role="option"]').first().click();
      await window.waitForTimeout(1_500);
    } catch { /* dropdown shape may differ */ }
    cues.emit('directed-qwen-targeted', 'Qwen 2.5 targeted');
    await window.getByPlaceholder('Message the ensemble\u2026').type(' What color is the sky?');
    await window.waitForTimeout(1_000);
    await window.keyboard.press('Enter');
    await window.getByPlaceholder('Waiting for voices\u2026').waitFor({ state: 'visible', timeout: 30_000 });
    await waitForSessionIdle(window, 120_000);
    await window.waitForTimeout(4_000);
    cues.emit('directed-qwen-responded', 'Qwen 2.5 answered');

    await stopRecording();
  } finally {
    try { await app.close(); } catch { /* ignore */ }
  }

  const outputMp4 = path.join(SITE_STATIC, 'videos', 'docs', 'custom-providers-ollama.mp4');
  compileFramesToMp4(ffmpegBin, framesDir, outputMp4, 15);
  cues.save(path.join(SITE_STATIC, 'videos', 'docs', 'custom-providers-ollama-cues.json'));
  // Poster at 10s: lands after both providers are saved, showing the Custom Providers cards
  extractPosterFrame(ffmpegBin, outputMp4, path.join(SITE_STATIC, 'images', 'video-posters', 'docs', 'custom-providers-ollama.webp'), 10);
  assertOutputWithinBudget(outputMp4, 30);
  captured++;
  const mb = (fs.statSync(outputMp4).size / (1024 * 1024)).toFixed(1);
  console.log(`  ✓ videos/docs/custom-providers-ollama.mp4 (${mb}MB)`);
}

// ── Narration texts ───────────────────────────────────────────────────────────

const NARRATION_TYPE_TOGGLE = `A composition is a saved set of voices you can launch any time.
Here we add two voices — Anthropic and OpenAI. For Anthropic, the API option is disabled because no key is configured, so we switch to the local CLI instead.
Once the composition is saved, we start a session and use the at-mention picker to direct different questions to each voice.
Each voice responds only when addressed — giving you full control over who speaks and when.
`;

const NARRATION_STREAMING = `When you send a message, all voices in the session respond at the same time.
Each voice streams its response token by token, independently.
Because every voice sees the full conversation history, a follow-up message lets them read and respond to each other.
This is the core of Polyphon: many voices, one conversation.
`;

const NARRATION_AT_MENTION = `In conductor mode, you can address a specific voice using the at-mention picker.
Type the at sign to open the voice list, then select any voice from your composition.
Only the targeted voice will respond — useful when you want a focused follow-up.
`;

const NARRATION_CUSTOM_PROVIDERS = `Custom providers let you connect any OpenAI-compatible endpoint to Polyphon — no built-in integration required.
Here we add two Ollama providers, each backed by a different local model running on the same machine.
In Settings, we enter the Ollama base URL, type in the model name, and save each provider.
Both appear in the Composition Builder alongside the built-in providers.
We create a directed composition and use the at-mention picker to address each model separately — one answers a geography question, the other a science question.
Two local models, one conversation, under your control.
`;

const NARRATION_WALKTHROUGH = `Polyphon is a desktop app for orchestrating conversations between multiple AI voices.

Settings gives you full control over your setup. The Conductor profile lets voices address you personally. Tones shape how every voice communicates — from concise to collaborative. System prompt templates save reusable instructions you can attach to any voice in a composition.

In Providers, each provider can run in one of two modes. API mode connects to the cloud using your API key and lets you choose the exact model. CLI mode uses a local command-line tool installed on your machine — no key required. Anthropic and OpenAI both support both modes. Gemini is API-only. You can mix and match across a single composition.

Custom providers let you connect any OpenAI-compatible endpoint — Ollama, LM Studio, vLLM, or a private proxy. Enter a base URL, fetch the available models, and save. No built-in integration required.

Compositions are saved, reusable sets of voices. Create a broadcast composition for parallel research — all voices answer every message at the same time. Create a conductor composition for directed conversation — you choose which voice speaks next. Custom provider voices appear in the builder alongside built-in ones.

In a broadcast session, ask a question and every voice responds simultaneously. Ask a follow-up and they read each other's answers and build on them.

In a conductor session, use the at-mention picker to direct each message to a specific voice. One voice makes a claim; the other responds to it. A real back-and-forth between models, under your control. The same works with local models — same interface, same directed workflow, no cloud required.

Polyphon: one chat, many minds.
`;

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('Polyphon video capture starting...');
  console.log(`App entry: ${APP_ENTRY}`);

  assertBuildExists();
  const ffmpegBin = assertFfmpegInstalled();
  console.log(`ffmpeg: ${ffmpegBin}`);

  const runDocs = !WALKTHROUGH_ONLY && !CUSTOM_PROVIDERS_ONLY;
  const runWalkthrough = !DOCS_ONLY && !CUSTOM_PROVIDERS_ONLY;
  const runCustomProviders = CUSTOM_PROVIDERS_ONLY;

  const docErrors: { label: string; error: unknown }[] = [];

  // ── Docs clips (processed per-asset — each failure is independent) ────────

  if (runDocs) {
    try {
      await captureTypeToggle(ffmpegBin);
      writeNarrationScript('docs/video-narration/compositions-type-toggle.txt', NARRATION_TYPE_TOGGLE);
    } catch (err) {
      console.error('\nERROR in type-toggle capture:', err);
      docErrors.push({ label: 'compositions-type-toggle', error: err });
      skipped.push({ label: 'compositions-type-toggle', reason: String(err) });
    }

    try {
      await captureStreaming(ffmpegBin);
      writeNarrationScript('docs/video-narration/sessions-streaming.txt', NARRATION_STREAMING);
    } catch (err) {
      console.error('\nERROR in streaming capture:', err);
      docErrors.push({ label: 'sessions-streaming', error: err });
      skipped.push({ label: 'sessions-streaming', reason: String(err) });
    }

    try {
      await captureAtMention(ffmpegBin);
      writeNarrationScript('docs/video-narration/sessions-at-mention.txt', NARRATION_AT_MENTION);
    } catch (err) {
      console.error('\nERROR in at-mention capture:', err);
      docErrors.push({ label: 'sessions-at-mention', error: err });
      skipped.push({ label: 'sessions-at-mention', reason: String(err) });
    }
  }

  // ── Walkthrough (separate failure domain) ────────────────────────────────

  if (runWalkthrough) {
    try {
      await captureWalkthrough(ffmpegBin);
      writeNarrationScript('docs/video-narration/full-walkthrough.txt', NARRATION_WALKTHROUGH);
    } catch (err) {
      console.error('\nERROR in walkthrough capture:', err);
      skipped.push({ label: 'full-walkthrough', reason: String(err) });
    }
  }

  // ── Custom providers standalone (separate failure domain) ─────────────────

  if (runCustomProviders) {
    assertOllamaRunning();
    try {
      await captureCustomProviders(ffmpegBin);
      writeNarrationScript('docs/video-narration/custom-providers-ollama.txt', NARRATION_CUSTOM_PROVIDERS);
    } catch (err) {
      console.error('\nERROR in custom-providers capture:', err);
      skipped.push({ label: 'custom-providers-ollama', reason: String(err) });
    }
  }

  // ── Markdown replacements ────────────────────────────────────────────────

  console.log('\n── Applying markdown replacements ─────────────────────────────────');

  if (runDocs) {
    const docsReplacements: Array<{ file: string; placeholder: string; src: string }> = [
      {
        file: 'site/content/docs/compositions.md',
        placeholder: 'Short screen recording (5–8 seconds) showing the voice type toggle interaction',
        src: '/videos/docs/compositions-type-toggle.mp4',
      },
      {
        file: 'site/content/docs/sessions.md',
        placeholder: 'Short screen recording (8–12 seconds) showing multi-voice streaming',
        src: '/videos/docs/sessions-streaming.mp4',
      },
      {
        file: 'site/content/docs/sessions.md',
        placeholder: 'Short screen recording (5–8 seconds) of the @mention flow',
        src: '/videos/docs/sessions-at-mention.mp4',
      },
    ];

    for (const { file, placeholder, src } of docsReplacements) {
      const outputPath = path.join(SITE_STATIC, src.slice(1));
      if (!fs.existsSync(outputPath)) {
        skipped.push({ label: file, reason: `capture missing: ${src}` });
        continue;
      }
      replacePlaceholder(file, placeholder, `{{< video src="${src}" >}}`);
    }
  }

  if (runWalkthrough) {
    const walkthroughMp4 = path.join(SITE_STATIC, 'videos', 'home', 'full-walkthrough.mp4');
    if (fs.existsSync(walkthroughMp4)) {
      injectHomepageVideo(
        'site/content/_index.md',
        '{{< video src="/videos/home/full-walkthrough.mp4" >}}',
      );
    } else {
      skipped.push({ label: 'homepage', reason: 'walkthrough capture missing' });
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log('\n══════════════════════════════════════════════');
  console.log(`  Captured:          ${captured}`);
  console.log(`  Replaced (docs):   ${replaced}`);
  console.log(`  Injected (home):   ${injected}`);
  console.log(`  Narration files:   ${narrationWritten}`);
  console.log(`  Skipped:           ${skipped.length}`);
  if (skipped.length > 0) {
    for (const s of skipped) {
      console.log(`    - ${s.label}: ${s.reason}`);
    }
  }
  console.log('══════════════════════════════════════════════\n');

  if (docErrors.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\nFATAL:', err);
  process.exit(1);
});
