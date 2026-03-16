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

const TRACK_FLAG_IDX = process.argv.indexOf('--track');
const TRACK_ONLY = TRACK_FLAG_IDX !== -1 ? (process.argv[TRACK_FLAG_IDX + 1] ?? null) : null;

const VALID_TRACKS = [
  'type-toggle',
  'streaming',
  'at-mention',
  'continuation-nudge',
  'custom-providers',
  'walkthrough',
] as const;

// ── Run counters ──────────────────────────────────────────────────────────────

let captured = 0;
let replaced = 0;
let injected = 0;
let narrationWritten = 0;
const skipped: { label: string; reason: string }[] = [];

// ── Timing scale ──────────────────────────────────────────────────────────────
// Increase TIMING_SCALE above 1.0 to slow down all recorded interactions uniformly.
const TIMING_SCALE = 3;
function wait(_page: Page, ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.round(ms * TIMING_SCALE)));
}

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

const REQUIRED_OLLAMA_MODELS = ['llama3.2:1b', 'qwen2.5:0.5b'];

function assertOllamaRunning(): void {
  const result = spawnSync('curl', ['-sf', 'http://localhost:11434/api/tags', '--max-time', '3'], { stdio: 'pipe' });
  if (result.status !== 0) {
    console.error('\nERROR: Ollama is not running at http://localhost:11434.');
    console.error('Start it with: ollama serve\n');
    process.exit(1);
  }

  // Pull any missing models so the capture doesn't fail mid-run
  for (const model of REQUIRED_OLLAMA_MODELS) {
    const check = spawnSync('ollama', ['show', model], { stdio: 'pipe' });
    if (check.status !== 0) {
      console.log(`  pulling missing model: ${model}`);
      const pull = spawnSync('ollama', ['pull', model], { stdio: 'inherit' });
      if (pull.status !== 0) {
        console.error(`\nERROR: Failed to pull ${model}.\n`);
        process.exit(1);
      }
    }
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
    await wait(window,300);
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
  const nameField = window.getByPlaceholder(/e\.g\. Corey/i);
  await nameField.waitFor({ state: 'visible', timeout: 10_000 });

  // Dwell on the empty form so viewers can read it before anything is typed
  await wait(window,2_500);

  // Type name at a human pace so viewers can follow along
  await nameField.click();
  await nameField.pressSequentially(name, { delay: 180 });
  await wait(window,2_000);

  // Select pronouns from the dropdown
  try {
    await window.locator('select').selectOption(pronouns);
    await wait(window,2_000);
  } catch {
    // pronouns select shape may differ
  }

  // Fill in the bio textarea
  try {
    const bioField = window.getByPlaceholder(/senior backend engineer/i);
    await bioField.waitFor({ state: 'visible', timeout: 3_000 });
    await bioField.click();
    await bioField.pressSequentially(bio, { delay: 90 });
    await wait(window,2_000);
  } catch {
    // textarea may not be present
  }

  // Dwell on the completed form before clicking
  await wait(window,1_500);

  const startBtn = window.getByRole('button', { name: /get started/i });
  await startBtn.waitFor({ state: 'visible', timeout: 3_000 });
  await startBtn.click();
  await window.getByRole('button', { name: /settings/i }).waitFor({ state: 'visible', timeout: 15_000 });
  await wait(window,500);
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
  const timestamps: number[] = [];
  const startMs = Date.now();

  const loopDone = (async () => {
    while (active) {
      const framePath = path.join(framesDir, `frame-${String(frameIndex).padStart(6, '0')}.png`);
      frameIndex++;
      timestamps.push(Date.now() - startMs);
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
    // Persist frame timestamps so compileFramesToMp4 can assign real-time durations.
    fs.writeFileSync(path.join(framesDir, 'timestamps.json'), JSON.stringify(timestamps));
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

  // Use real inter-frame timestamps when available so the video plays at true
  // wall-clock speed regardless of how long each screenshot() call took.
  const tsFile = path.join(framesDir, 'timestamps.json');
  const timestamps: number[] | null = fs.existsSync(tsFile)
    ? (JSON.parse(fs.readFileSync(tsFile, 'utf8')) as number[])
    : null;

  const nominalDuration = 1 / fps;
  const concatLines: string[] = [];
  for (let i = 0; i < frames.length; i++) {
    let duration: number;
    if (timestamps && timestamps.length > i + 1) {
      duration = (timestamps[i + 1] - timestamps[i]) / 1000;
    } else {
      duration = nominalDuration;
    }
    concatLines.push(`file '${path.join(framesDir, frames[i]).replace(/\\/g, '/')}'`);
    concatLines.push(`duration ${duration.toFixed(6)}`);
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

  if (result.status !== 0 || !fs.existsSync(tmpPng)) {
    console.warn(`  WARNING: poster extraction failed for ${path.basename(inputMp4)} (offset ${offsetSeconds}s may exceed video duration)`);
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
  let skipNext = false;

  const updated = lines.flatMap((line) => {
    if (skipNext) {
      skipNext = false;
      // Drop the trailing "> See `docs/video-scripts.md`…" line if present
      if (line.startsWith('> See `docs/video-scripts.md`')) return [];
      return [line];
    }
    if (!found && line.startsWith(blockquotePrefix) && line.includes(placeholder)) {
      found = true;
      skipNext = true;
      return [shortcode];
    }
    return [line];
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
  await wait(window,300);
  await window.getByRole('tab', { name: new RegExp(`^${tab}$`, 'i') }).click();
  await wait(window,300);
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
  await wait(window,300);
}

async function goToCompositions(window: Page): Promise<void> {
  await window.getByRole('button', { name: /compositions/i }).click();
  await wait(window,300);
}

async function openNewComposition(window: Page): Promise<void> {
  await goToCompositions(window);
  await window.getByRole('button', { name: 'New Composition', exact: true }).first().click();
  await wait(window,300);
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
    await wait(window,200);
  }

  await window.getByRole('button', { name: 'Save Composition' }).click();
  await wait(window,500);
}

async function startSessionFromComposition(window: Page, compositionName: string): Promise<void> {
  await window.getByRole('button', { name: /^sessions$/i }).click();
  await wait(window,300);
  await window.getByRole('button', { name: 'New Session', exact: true }).first().click();
  await wait(window,300);

  const escaped = compositionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const compBtn = window.getByRole('button', { name: new RegExp(escaped, 'i') }).first();
  await compBtn.waitFor({ state: 'visible', timeout: 10_000 });
  await compBtn.click();
  await window.getByPlaceholder('My session').waitFor({ state: 'visible', timeout: 5_000 });
  await window.getByPlaceholder('My session').fill(`${compositionName} Session`);
  await window.getByRole('button', { name: 'Start Session' }).click();
  await window.getByPlaceholder('Message the ensemble\u2026').waitFor({ state: 'visible', timeout: 45_000 });
  await wait(window,300);
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
  console.log('\n── Track 1: Compositions — build, type toggle, directed messages ─  [TRACK=type-toggle]');

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
    await wait(window,2_500);
    cues.emit('composition-named', 'Composition named "Research Duo"');

    // Select Anthropic — show the voice type toggle before adding
    await window.getByRole('button', { name: 'Anthropic' }).first().click();
    await wait(window,2_500);

    // Scroll the type toggle into view so it isn't cut off
    try {
      const apiBtn = window.getByRole('button', { name: /^api$/i });
      await apiBtn.waitFor({ state: 'visible', timeout: 3_000 });
      await apiBtn.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      await wait(window,1_000);
      // Hover API to show the "No API key configured" tooltip
      await apiBtn.hover();
      await wait(window,4_500);
      // Switch to CLI
      const cliBtn = window.getByRole('button', { name: /^cli$/i });
      await cliBtn.waitFor({ state: 'visible', timeout: 2_000 });
      const isDisabled = await cliBtn.getAttribute('disabled');
      if (!isDisabled) {
        await cliBtn.click();
        await wait(window,3_000);
      }
    } catch {
      // type toggle may not be present if both types unavailable
    }
    cues.emit('voice-type-toggle', 'Voice type toggle shown — API disabled (no key), switching to CLI');

    // Add Anthropic to the composition
    await window.getByRole('button', { name: 'Add Voice' }).click();
    await wait(window,2_500);
    cues.emit('anthropic-voice-added', 'Anthropic voice added to composition in CLI mode');

    // Select OpenAI and add it too
    await window.getByRole('button', { name: 'OpenAI' }).first().click();
    await wait(window,2_500);
    await window.getByRole('button', { name: 'Add Voice' }).click();
    await wait(window,2_500);
    cues.emit('openai-voice-added', 'OpenAI voice added to composition');

    // Save — composition is already in conductor mode (the default)
    await window.getByRole('button', { name: 'Save Composition' }).click();
    await wait(window,2_000);
    cues.emit('composition-saved', 'Research Duo composition saved with both voices');

    // ── Part 2: Start a session and send directed messages ─────────────────

    await startSessionFromComposition(window, 'Research Duo');
    await wait(window,2_500);
    cues.emit('session-started', 'Session started from Research Duo composition');

    // Direct a question to Anthropic using @mention
    await window.getByPlaceholder('Message the ensemble\u2026').click();
    await wait(window,1_000);
    await window.getByPlaceholder('Message the ensemble\u2026').type('@');
    await wait(window,2_000);
    await window.getByPlaceholder('Message the ensemble\u2026').type('A');
    await wait(window,3_500);
    try {
      await window.locator('[role="option"]').first().waitFor({ state: 'visible', timeout: 2_000 });
      await window.locator('[role="option"]').first().click();
      await wait(window,1_500);
    } catch { /* dropdown shape may differ */ }
    cues.emit('at-mention-anthropic', 'At-mention picker used to target Anthropic voice');
    await window.getByPlaceholder('Message the ensemble\u2026').type(' What makes a great API design?');
    await wait(window,1_000);
    await window.keyboard.press('Enter');
    await window.getByPlaceholder('Waiting for voices\u2026').waitFor({ state: 'visible', timeout: 30_000 });
    await waitForSessionIdle(window);
    await wait(window,3_500);
    cues.emit('anthropic-responded', 'Anthropic voice finished streaming its response');

    // Direct a different question to OpenAI using @mention
    await window.getByPlaceholder('Message the ensemble\u2026').click();
    await wait(window,1_000);
    await window.getByPlaceholder('Message the ensemble\u2026').type('@');
    await wait(window,2_000);
    await window.getByPlaceholder('Message the ensemble\u2026').type('O');
    await wait(window,3_500);
    try {
      await window.locator('[role="option"]').first().waitFor({ state: 'visible', timeout: 2_000 });
      await window.locator('[role="option"]').first().click();
      await wait(window,1_500);
    } catch { /* dropdown shape may differ */ }
    cues.emit('at-mention-openai', 'At-mention picker used to target OpenAI voice');
    await window.getByPlaceholder('Message the ensemble\u2026').type(' What makes a great developer experience?');
    await wait(window,1_000);
    await window.keyboard.press('Enter');
    await window.getByPlaceholder('Waiting for voices\u2026').waitFor({ state: 'visible', timeout: 30_000 });
    await waitForSessionIdle(window);
    await wait(window,4_000);
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
  console.log('\n── Track 2: Multi-voice streaming ───────────────────────────────  [TRACK=streaming]');

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
    cues.emit('session-ready', 'Streaming Demo session open with Anthropic and OpenAI voices ready');
    await wait(window,3_000);
    cues.emit('session-started', 'Streaming Demo session open with Anthropic and OpenAI voices');

    // Round 1: open question — each voice answers from its own perspective
    await sendMessage(window, 'What is the single most important quality in a great software engineer: technical skill or communication?');
    cues.emit('round1-sent', 'Question sent — both voices begin streaming simultaneously');
    await window.getByPlaceholder('Waiting for voices\u2026').waitFor({ state: 'visible', timeout: 30_000 });
    await waitForSessionIdle(window);
    await wait(window,3_000); // hold so viewers can read both responses
    cues.emit('round1-complete', 'Both voices finished streaming round 1 responses');

    // Round 2: ask each voice to engage with what the other said
    await sendMessage(window, 'Now read each other\'s response and say in two sentences whether you agree or disagree.');
    cues.emit('round2-sent', 'Follow-up sent — voices read each other\'s responses');
    await window.getByPlaceholder('Waiting for voices\u2026').waitFor({ state: 'visible', timeout: 30_000 });
    await waitForSessionIdle(window);
    await wait(window,4_000); // hold on the final exchange before cut
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
  console.log('\n── Track 3: @mention flow ───────────────────────────────────────  [TRACK=at-mention]');

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
    cues.emit('session-ready', 'Mention Demo session open in conductor mode — two voices ready for directed messages');
    await wait(window,3_000);
    cues.emit('session-started', 'Mention Demo session open in conductor mode');

    // Click into the input, pause so viewers see focus, then type "@" deliberately
    await window.getByPlaceholder('Message the ensemble\u2026').click();
    await wait(window,1_500);
    cues.emit('input-focused', 'Message input focused, about to type @mention');
    await window.getByPlaceholder('Message the ensemble\u2026').type('@');
    await wait(window,2_500); // hold so viewers see the picker open
    cues.emit('at-sign-typed', 'At-sign typed, voice picker dropdown opened');

    // Type a character to filter; hold so viewers can read the dropdown
    await window.getByPlaceholder('Message the ensemble\u2026').type('A');
    await wait(window,4_500);
    cues.emit('picker-filtered', 'Picker filtered to Anthropic voice');

    // Click the first voice; dwell so viewers see the voice panel highlight
    try {
      const dropdownItem = window.locator('[role="option"]').first();
      await dropdownItem.waitFor({ state: 'visible', timeout: 2_000 });
      await dropdownItem.click();
      await wait(window,2_500); // hold — viewer sees the targeted voice highlighted
    } catch {
      // dropdown structure may differ
    }
    cues.emit('voice-selected', 'Anthropic voice selected from picker, input shows @mention tag');

    // Type the rest of the message and send it — this is the point of the demo
    await window.getByPlaceholder('Message the ensemble\u2026').type(' what is polyphony in one sentence?');
    await wait(window,1_000);
    cues.emit('message-composed', 'Full directed message composed targeting Anthropic');
    await window.keyboard.press('Enter');

    // Wait for the directed voice to stream its response
    await window.getByPlaceholder('Waiting for voices\u2026').waitFor({ state: 'visible', timeout: 30_000 });
    await waitForSessionIdle(window);
    await wait(window,4_000); // hold on the completed response before cut
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

async function captureContinuationNudge(ffmpegBin: string): Promise<void> {
  console.log('\n── Track 4: Continuation nudge (Prompt me) ──────────────────────  [TRACK=continuation-nudge]');

  const { app, window } = await launchApp({ skipOnboarding: true });
  const framesDir = makeTempDir('polyphon-frames-continuation-nudge-');
  const cues = new CueEmitter();

  try {
    await enableAllProviders(window);

    // Create a broadcast composition with "Prompt me" continuation policy
    await openNewComposition(window);
    await window.getByPlaceholder('My Composition').fill('Continuation Demo');
    await window.getByRole('button', { name: /broadcast/i }).first().click();
    await wait(window,300);
    // Select "Prompt me" continuation
    await window.getByRole('button', { name: /prompt me/i }).click();
    await wait(window,200);

    // Add two voices
    await window.getByRole('button', { name: 'Anthropic' }).first().click();
    await wait(window,200);
    await window.getByRole('button', { name: 'Add Voice' }).click();
    await wait(window,200);
    await window.getByRole('button', { name: 'OpenAI' }).first().click();
    await wait(window,200);
    await window.getByRole('button', { name: 'Add Voice' }).click();
    await wait(window,200);
    await window.getByRole('button', { name: 'Save Composition' }).click();
    await wait(window,500);

    await startSessionFromComposition(window, 'Continuation Demo');

    cues.start();
    const stopRecording = await startFrameRecording(window, framesDir, 15);
    cues.emit('session-ready', 'Continuation Demo session open in broadcast mode with Prompt me continuation policy');
    await wait(window,2_500);
    cues.emit('session-started', 'Continuation Demo session open in broadcast + Prompt me mode');

    await sendMessage(window, 'What are the key tradeoffs between REST and GraphQL APIs?');
    cues.emit('message-sent', 'Question sent — both voices begin streaming round 1');
    await window.getByPlaceholder('Waiting for voices\u2026').waitFor({ state: 'visible', timeout: 30_000 });
    await waitForSessionIdle(window);
    await wait(window,3_000);
    cues.emit('round1-complete', 'Round 1 complete — continuation nudge banner appears');

    // Wait for the nudge banner; dwell so viewers can read it
    try {
      const allowBtn = window.getByRole('button', { name: 'Allow' });
      await allowBtn.waitFor({ state: 'visible', timeout: 5_000 });
      await wait(window,4_000); // hold on the amber nudge banner
      cues.emit('nudge-visible', '"Agents have more to say — let them continue?" nudge banner visible with Allow and Dismiss');
      await allowBtn.click();
      await wait(window,500);
      cues.emit('allow-clicked', 'Allow clicked — round 2 begins');
      await window.getByPlaceholder('Waiting for voices\u2026').waitFor({ state: 'visible', timeout: 30_000 });
      await waitForSessionIdle(window);
      await wait(window,3_000);
      cues.emit('round2-complete', 'Round 2 complete');
    } catch {
      // nudge may not appear in mock mode
    }

    await stopRecording();
  } finally {
    try { await app.close(); } catch { /* ignore */ }
  }

  const outputMp4 = path.join(SITE_STATIC, 'videos', 'docs', 'continuation-nudge.mp4');
  compileFramesToMp4(ffmpegBin, framesDir, outputMp4, 15);
  cues.save(path.join(SITE_STATIC, 'videos', 'docs', 'continuation-nudge-cues.json'));
  // Poster at the nudge banner moment — approximately 3s dwell + round 1 duration; use 20s as a safe estimate
  extractPosterFrame(ffmpegBin, outputMp4, path.join(SITE_STATIC, 'images', 'video-posters', 'docs', 'continuation-nudge.webp'), 20);
  assertOutputWithinBudget(outputMp4, 25);
  captured++;
  const mb = (fs.statSync(outputMp4).size / (1024 * 1024)).toFixed(1);
  console.log(`  ✓ videos/docs/continuation-nudge.mp4 (${mb}MB)`);
}


async function captureWalkthrough(ffmpegBin: string): Promise<void> {
  console.log('\n── Track 4: Full walkthrough ────────────────────────────────────  [TRACK=walkthrough]');

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

    await fillOnboarding(window, 'Corey', 'they/them', 'Software engineer exploring AI-assisted development.');
    await wait(window,2_500);
    cues.emit('onboarding-complete', 'Conductor profile set — name Corey, pronouns they/them, software engineer bio');

    // ── Step 2: Settings tour ─────────────────────────────────────────────────

    await window.getByRole('button', { name: /settings/i }).click();
    await wait(window,5_000); // Conductor tab (the default) — viewer reads the filled profile
    cues.emit('settings-conductor-tab', 'Settings → Conductor tab — conductor name (Corey), pronouns (they/them), background bio, and default tone all filled in; voices read this profile to address the user personally and in the right tone');

    await window.getByRole('tab', { name: /^Tones$/i }).click();
    await wait(window,5_000);
    cues.emit('settings-tones-tab', 'Tones tab — preset cards for Professional, Collaborative, Concise, Exploratory, and Devil\'s Advocate; selecting a tone shapes how every voice in a composition communicates; custom tones can be added');

    await window.getByRole('tab', { name: /^System Prompts$/i }).click();
    await wait(window,5_000);
    cues.emit('settings-system-prompts-tab', 'System Prompts tab — reusable instruction templates listed; attach any template to a voice in the composition builder to give it a persistent role, specialty, or set of constraints');

    await window.getByRole('tab', { name: /^General$/i }).click();
    await wait(window,5_000);
    cues.emit('settings-general-tab', 'General tab — light/dark theme toggle and other app-level preferences that apply across all sessions');

    await wait(window,2_000);
    cues.emit('settings-complete', 'Settings tour complete — providers enabled, custom Ollama models added, conductor profile filled; the next section shows how to organize these voices into compositions');

    // ── Providers — detailed walkthrough ──────────────────────────────────────

    await window.getByRole('tab', { name: /^Providers$/i }).click();
    await wait(window,4_000); // dwell on the full provider list before touching anything
    cues.emit('settings-providers-tab', 'Providers tab — all built-in providers listed, none yet enabled');

    // --- Anthropic ---
    // Provider cards now have separate API and CLI toggle rows (no card-level switch).
    // Switch order: nth(0)=Anthropic API, nth(1)=Anthropic CLI,
    //               nth(2)=OpenAI API,    nth(3)=OpenAI CLI,
    //               nth(4)=Gemini API,    nth(5)=Copilot CLI
    const providerSwitches = window.getByRole('switch');
    await providerSwitches.nth(0).click();
    await window.getByText('Saved').first().waitFor({ state: 'visible', timeout: 5_000 });
    await wait(window,4_000); // hold — viewers see the API key section + model list
    cues.emit('anthropic-api-enabled', 'Anthropic API enabled — paste an API key and the model selector appears; choose from Claude Haiku, Sonnet, or Opus for each voice independently');

    // Enable CLI too — shows the command/args fields alongside the API section
    await providerSwitches.nth(1).click();
    await window.getByText('Saved').first().waitFor({ state: 'visible', timeout: 5_000 });
    await wait(window,4_500); // hold — viewer sees CLI command and args fields
    cues.emit('anthropic-cli-mode', 'Anthropic CLI mode also enabled — CLI mode runs the claude command-line tool locally; no API key needed, and it uses whatever model the CLI is configured for');

    // --- OpenAI ---
    // Scroll the OpenAI card into view, then enable it in API mode
    await providerSwitches.nth(2).evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    await wait(window,1_200);
    await providerSwitches.nth(2).click();
    await window.getByText('Saved').first().waitFor({ state: 'visible', timeout: 5_000 });
    await wait(window,3_000); // hold on API mode — show API key badge + model dropdown
    cues.emit('openai-enabled', 'OpenAI enabled in API mode — API key badge confirms the connection; both API mode (key + model picker) and CLI mode (codex CLI) are available for OpenAI');

    // Click Refresh to demonstrate the live model fetch
    try {
      const refreshBtn = window.getByRole('button', { name: /refresh models for openai/i });
      await refreshBtn.waitFor({ state: 'visible', timeout: 3_000 });
      await refreshBtn.click();
      await wait(window,4_500); // watch the model list populate
    } catch { /* no API key or button not found — skip */ }
    await wait(window,3_500); // hold on the populated model dropdown
    cues.emit('openai-models-fetched', 'Model list refreshed from the OpenAI API — if a key is configured, the latest available models populate the picker; cloud model selection stays current without manual updates');

    // --- Gemini ---
    // Scroll down, enable it — Gemini is API-only so there's no CLI toggle to show
    await providerSwitches.nth(4).evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    await wait(window,1_200);
    await providerSwitches.nth(4).click();
    await window.getByText('Saved').first().waitFor({ state: 'visible', timeout: 5_000 });
    await wait(window,4_000); // dwell — viewer sees Gemini has no CLI option
    cues.emit('gemini-enabled', 'Gemini enabled — Gemini is API-only; there is no CLI variant for this provider, which is why only one toggle row appears');

    await wait(window,2_500); // final hold on the configured providers screen

    // ── Custom Providers — add two Ollama-backed providers ────────────────────

    // Scroll the Add Custom Provider button into view
    const addCustomBtn = window.getByRole('button', { name: /Add Custom Provider/i }).first();
    await addCustomBtn.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    await wait(window,2_500); // hold — viewers read the Custom Providers heading
    cues.emit('custom-providers-section', 'Custom Providers section — add any OpenAI-compatible endpoint: Ollama, LM Studio, vLLM, or a private proxy; they appear alongside built-in providers in every composition');

    // Provider 1: Llama 3.2
    await addCustomBtn.click();
    await wait(window,1_000);
    // Scroll the form into view so viewers can see every field being filled
    const nameField1 = window.getByRole('textbox', { name: /^Name/ });
    await nameField1.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    await wait(window,1_500);
    await nameField1.fill('Llama 3.2');
    await wait(window,800);
    await window.getByPlaceholder('http://localhost:11434/v1').fill('http://localhost:11434/v1');
    await wait(window,800);
    await window.getByPlaceholder('llama3.2').fill('llama3.2:1b');
    await wait(window,1_500);
    cues.emit('llama-form-filled', 'Llama 3.2 custom provider form filled — name, base URL pointing to local Ollama at http://localhost:11434/v1, model llama3.2:1b; fully offline, fully private');
    const saveBtn1 = window.getByRole('button', { name: 'Save', exact: true }).first();
    await saveBtn1.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    await wait(window,800);
    await saveBtn1.click();
    await wait(window,2_500); // hold — viewers see the Llama 3.2 card saved
    cues.emit('llama-provider-saved', 'Llama 3.2 custom provider card saved — it now appears in every composition builder alongside Anthropic, OpenAI, and Gemini');

    // Provider 2: Qwen 2.5
    const addCustomBtn2 = window.getByRole('button', { name: /Add Custom Provider/i }).first();
    await addCustomBtn2.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    await wait(window,800);
    await addCustomBtn2.click();
    await wait(window,1_000);
    // Scroll the form into view so viewers can see every field being filled
    const nameField2 = window.getByRole('textbox', { name: /^Name/ });
    await nameField2.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    await wait(window,1_500);
    await nameField2.fill('Qwen 2.5');
    await wait(window,800);
    await window.getByPlaceholder('http://localhost:11434/v1').fill('http://localhost:11434/v1');
    await wait(window,800);
    await window.getByPlaceholder('llama3.2').fill('qwen2.5:0.5b');
    await wait(window,1_500);
    cues.emit('qwen-form-filled', 'Qwen 2.5 form filled with the same Ollama base URL but a different model ID; two local providers, one running server');
    const saveBtn2 = window.getByRole('button', { name: 'Save', exact: true }).first();
    await saveBtn2.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    await wait(window,800);
    await saveBtn2.click();
    await wait(window,3_000); // hold — viewers see both custom provider cards
    cues.emit('qwen-provider-saved', 'Both Ollama providers are listed — cloud APIs and local models are peers in Polyphon; no provider is first-class');

    // ── Step 3: Create three compositions ────────────────────────────────────

    // Composition 1 — broadcast: both voices answer every message in parallel
    await window.getByRole('button', { name: /compositions/i }).click();
    await wait(window,2_000); // hold — viewers see the compositions list
    await window.getByRole('button', { name: 'New Composition', exact: true }).first().click();
    await wait(window,2_500); // hold — viewers see the empty builder appear
    cues.emit('composition-builder-opened-1', 'Composition builder opened for first composition');
    await window.getByPlaceholder('My Composition').fill('Research Panel');
    await wait(window,2_500); // hold — viewers read the name
    cues.emit('composition-named-broadcast', 'Composition named Research Panel — broadcast mode means all voices respond to every message simultaneously');
    await window.getByRole('button', { name: /broadcast/i }).first().click();
    await wait(window,3_000); // hold — viewers see the mode switch to Broadcast
    cues.emit('composition-mode-broadcast', 'Mode set to Broadcast — every message goes to every voice; all voices respond in parallel each round');
    await window.getByRole('button', { name: /prompt me/i }).click();
    await wait(window,3_500);
    cues.emit('composition-continuation-set', 'Continuation policy set to Prompt me — after all voices finish a round, a banner asks whether to continue; Auto would continue without asking, None stops after one round');
    await window.getByRole('button', { name: 'Anthropic' }).first().click();
    await wait(window,3_000); // hold — viewers see the Anthropic voice config form
    await window.getByRole('button', { name: 'Add Voice' }).click();
    await wait(window,2_500); // hold — voice appears in the order list
    cues.emit('composition-anthropic-added', 'Anthropic voice added to Research Panel');
    await window.getByRole('button', { name: 'OpenAI' }).first().click();
    await wait(window,3_000); // hold — viewers see the OpenAI voice config form
    await window.getByRole('button', { name: 'Add Voice' }).click();
    await wait(window,2_500); // hold — both voices listed
    cues.emit('composition-openai-added', 'OpenAI voice added to Research Panel');
    await window.getByRole('button', { name: 'Save Composition' }).click();
    await wait(window,3_000); // hold — viewers see the saved composition
    cues.emit('composition-broadcast-saved', 'Research Panel broadcast composition saved');

    // Composition 2 — conductor: direct messages to individual voices
    await window.getByRole('button', { name: /compositions/i }).click();
    await wait(window,2_000); // hold — viewers see both compositions listed
    await window.getByRole('button', { name: 'New Composition', exact: true }).first().click();
    await wait(window,2_500); // hold — viewers see the empty builder appear
    cues.emit('composition-builder-opened-2', 'Composition builder opened for second composition');
    await window.getByPlaceholder('My Composition').fill('Directed Q&A');
    await wait(window,3_000); // hold — viewers read the name; conductor is the default mode
    cues.emit('composition-named-conductor', 'Composition named "Directed Q&A" — conductor mode is default');
    await window.getByRole('button', { name: 'Anthropic' }).first().click();
    await wait(window,3_000); // hold — viewers see the Anthropic voice config form
    await window.getByRole('button', { name: 'Add Voice' }).click();
    await wait(window,2_500); // hold — voice appears in the order list
    cues.emit('composition-conductor-anthropic-added', 'Anthropic voice added to Directed Q&A');
    await window.getByRole('button', { name: 'OpenAI' }).first().click();
    await wait(window,3_000); // hold — viewers see the OpenAI voice config form
    await window.getByRole('button', { name: 'Add Voice' }).click();
    await wait(window,2_500); // hold — both voices listed
    cues.emit('composition-conductor-openai-added', 'OpenAI voice added to Directed Q&A');
    await window.getByRole('button', { name: 'Save Composition' }).click();
    await wait(window,3_000); // hold — viewers see the saved composition
    cues.emit('composition-conductor-saved', 'Directed Q&A conductor composition saved');

    // Composition 3 — conductor: two local Ollama models
    await window.getByRole('button', { name: /compositions/i }).click();
    await wait(window,2_000); // hold — viewers see all three compositions listed
    await window.getByRole('button', { name: 'New Composition', exact: true }).first().click();
    await wait(window,2_500); // hold — viewers see the empty builder appear
    cues.emit('composition-builder-opened-3', 'Composition builder opened for Ollama Duo composition');
    await window.getByPlaceholder('My Composition').fill('Ollama Duo');
    await wait(window,2_500); // hold — viewers read the name
    cues.emit('composition-named-ollama', 'Composition named "Ollama Duo" — conductor mode');
    await window.getByRole('button', { name: /Llama 3\.2/i }).first().click();
    await wait(window,3_000); // hold — viewers see the Llama 3.2 voice config form
    await window.getByRole('button', { name: 'Add Voice' }).click();
    await wait(window,2_500); // hold — voice appears in the order list
    cues.emit('composition-ollama-llama-added', 'Llama 3.2 local voice added to Ollama Duo');
    await window.getByRole('button', { name: /Qwen 2\.5/i }).first().click();
    await wait(window,3_000); // hold — viewers see the Qwen 2.5 voice config form
    await window.getByRole('button', { name: 'Add Voice' }).click();
    await wait(window,2_500); // hold — both voices listed
    cues.emit('composition-ollama-qwen-added', 'Qwen 2.5 local voice added to Ollama Duo');
    await window.getByRole('button', { name: 'Save Composition' }).click();
    await wait(window,3_000); // hold — viewers see the saved composition
    cues.emit('composition-ollama-saved', 'Ollama Duo composition saved with both local voices');

    // Composition 4 — conductor: mix cloud Anthropic API + local Llama
    await window.getByRole('button', { name: /compositions/i }).click();
    await wait(window,2_000);
    await window.getByRole('button', { name: 'New Composition', exact: true }).first().click();
    await wait(window,2_500);
    cues.emit('composition-builder-opened-4', 'Composition builder opened for fourth composition — mixing a cloud API voice with a local model');
    await window.getByPlaceholder('My Composition').fill('Hybrid Panel');
    await wait(window,2_500);
    cues.emit('composition-named-hybrid', 'Composition named Hybrid Panel — conductor mode, mixing cloud and local providers in one composition');
    await window.getByRole('button', { name: 'Anthropic' }).first().click();
    await wait(window,3_000);
    await window.getByRole('button', { name: 'Add Voice' }).click();
    await wait(window,2_500);
    cues.emit('composition-hybrid-anthropic-added', 'Anthropic API voice added — cloud provider with full model selection');
    await window.getByRole('button', { name: /Llama 3\.2/i }).first().click();
    await wait(window,3_000);
    await window.getByRole('button', { name: 'Add Voice' }).click();
    await wait(window,2_500);
    cues.emit('composition-hybrid-llama-added', 'Llama 3.2 local voice added alongside Anthropic — cloud and local voices in one composition');
    await window.getByRole('button', { name: 'Save Composition' }).click();
    await wait(window,3_000);
    cues.emit('composition-hybrid-saved', 'Hybrid Panel saved — four compositions now listed, showing all major configuration patterns');

    // ── Step 4: Broadcast session — both voices research a topic together ─────

    await window.getByRole('button', { name: /^sessions$/i }).click();
    await wait(window,2_000); // hold — viewers see the sessions list
    await window.getByRole('button', { name: 'New Session', exact: true }).first().click();
    await wait(window,2_500); // hold — viewers see the composition picker
    await window.getByRole('button', { name: /Research Panel/i }).first().waitFor({ state: 'visible', timeout: 10_000 });
    await window.getByRole('button', { name: /Research Panel/i }).first().click();
    await wait(window,2_000); // hold — viewers see the composition selected
    await window.getByPlaceholder('My session').waitFor({ state: 'visible', timeout: 5_000 });
    await window.getByPlaceholder('My session').fill('Research Panel Session');
    await wait(window,2_000); // hold — viewers read the session name
    await window.getByRole('button', { name: 'Start Session' }).click();
    await window.getByPlaceholder('Message the ensemble\u2026').waitFor({ state: 'visible', timeout: 45_000 });
    await wait(window,3_000); // hold — viewers orient to the session view
    cues.emit('session-broadcast-started', 'Research Panel broadcast session started — Anthropic and OpenAI voice panels visible; all voices will respond to every message simultaneously; continuation policy is Prompt me');

    // Round 1 — ask a research question; both voices respond simultaneously
    await sendMessage(window, 'What are the main tradeoffs between microservices and monolithic architectures?');
    await wait(window, 2_500); // separates session-started from round1-sent in VTT
    cues.emit('broadcast-round1-sent', 'Research question sent — both voices streaming their answers in parallel; watch two independent responses appear simultaneously');
    await window.getByPlaceholder('Waiting for voices\u2026').waitFor({ state: 'visible', timeout: 30_000 });
    await waitForSessionIdle(window, 180_000);
    await wait(window,3_000);
    cues.emit('broadcast-round1-complete', 'Round 1 complete — Research Panel Prompt me continuation is active; nudge banner should appear');
    try {
      const allowBtn = window.getByRole('button', { name: 'Allow' });
      await allowBtn.waitFor({ state: 'visible', timeout: 8_000 });
      await wait(window, 5_000); // hold on the nudge banner so viewers can read it
      cues.emit('continuation-nudge-visible',
        'Continuation nudge banner visible — voices have more to say; Allow lets round 2 begin, Dismiss ends the conversation here; this is the Prompt me policy in action');
      await allowBtn.click();
      await wait(window, 1_500);
      cues.emit('continuation-allowed', 'Allow clicked — round 2 begins automatically; voices are streaming their follow-up responses');
      await window.getByPlaceholder('Waiting for voices\u2026').waitFor({ state: 'visible', timeout: 30_000 });
      await waitForSessionIdle(window, 180_000);
      await wait(window,4_000);
      cues.emit('broadcast-round2-complete',
        'Round 2 complete — voices built on each other\'s round 1 responses using the shared conversation history; this is multi-round AI research under conductor control');
    } catch {
      // nudge may not appear if voices don't request continuation
      await wait(window, 2_000);
      cues.emit('broadcast-round2-complete', 'Broadcast session complete — both voices have responded in parallel');
    }

    // ── Step 5: Conductor session — direct different questions to each voice ──

    await window.getByRole('button', { name: /^sessions$/i }).click();
    await wait(window,2_000); // hold — viewers see the sessions list
    await window.getByRole('button', { name: 'New Session', exact: true }).first().click();
    await wait(window,2_500); // hold — viewers see the composition picker
    await window.getByRole('button', { name: /Directed Q&A/i }).first().waitFor({ state: 'visible', timeout: 10_000 });
    await window.getByRole('button', { name: /Directed Q&A/i }).first().click();
    await wait(window,2_000); // hold — viewers see the composition selected
    await window.getByPlaceholder('My session').waitFor({ state: 'visible', timeout: 5_000 });
    await window.getByPlaceholder('My session').fill('Directed Q&A Session');
    await wait(window,2_000); // hold — viewers read the session name
    await window.getByRole('button', { name: 'Start Session' }).click();
    await window.getByPlaceholder('Message the ensemble\u2026').waitFor({ state: 'visible', timeout: 45_000 });
    await wait(window,3_000); // hold — viewers orient to the session view
    cues.emit('session-conductor-started', 'Directed Q&A conductor session started');

    // Direct a question to Anthropic
    await window.getByPlaceholder('Message the ensemble\u2026').click();
    await wait(window,1_000);
    await window.getByPlaceholder('Message the ensemble\u2026').type('@');
    await wait(window,2_000);
    await window.getByPlaceholder('Message the ensemble\u2026').type('A');
    await wait(window,3_500);
    try {
      await window.locator('[role="option"]').first().waitFor({ state: 'visible', timeout: 2_000 });
      await window.locator('[role="option"]').first().click();
      await wait(window,1_500);
    } catch { /* dropdown shape may differ */ }
    cues.emit('directed-anthropic-targeted', 'At-mention picker opened, typing @A to target Anthropic — in conductor mode the at-mention picker lists all voices in the composition');
    await window.getByPlaceholder('Message the ensemble\u2026').type(' What\'s your top tip for a junior developer trying to grow quickly?');
    await wait(window,1_500);
    await window.keyboard.press('Enter');
    await window.getByPlaceholder('Waiting for voices\u2026').waitFor({ state: 'visible', timeout: 30_000 });
    await waitForSessionIdle(window, 180_000);
    await wait(window,4_000);
    cues.emit('directed-anthropic-responded', 'Only Anthropic responded — the other voice stayed completely silent; conductor mode gives precise control over which perspective speaks next');

    // Direct OpenAI to engage with Anthropic's answer
    await window.getByPlaceholder('Message the ensemble\u2026').click();
    await wait(window,1_000);
    await window.getByPlaceholder('Message the ensemble\u2026').type('@');
    await wait(window,2_000);
    await window.getByPlaceholder('Message the ensemble\u2026').type('O');
    await wait(window,3_500);
    try {
      await window.locator('[role="option"]').first().waitFor({ state: 'visible', timeout: 2_000 });
      await window.locator('[role="option"]').first().click();
      await wait(window,1_500);
    } catch { /* dropdown shape may differ */ }
    cues.emit('directed-openai-targeted', 'OpenAI targeted via at-mention to respond to Anthropic\'s answer — the at-mention picker works the same way every time');
    await window.getByPlaceholder('Message the ensemble\u2026').type(' What do you think of that advice? Would you add or change anything?');
    await wait(window,1_500);
    await window.keyboard.press('Enter');
    await window.getByPlaceholder('Waiting for voices\u2026').waitFor({ state: 'visible', timeout: 30_000 });
    await waitForSessionIdle(window, 180_000);
    await wait(window,4_000);
    cues.emit('directed-openai-responded', 'OpenAI replied directly to what Anthropic said — this is orchestrated dialogue between two models, not two parallel monologues');

    // ── Step 6: Ollama Duo — local models with directed questions ─────────────

    await window.getByRole('button', { name: /^sessions$/i }).click();
    await wait(window,2_000); // hold — viewers see the sessions list
    await window.getByRole('button', { name: 'New Session', exact: true }).first().click();
    await wait(window,2_500); // hold — viewers see the composition picker
    await window.getByRole('button', { name: /Ollama Duo/i }).first().waitFor({ state: 'visible', timeout: 10_000 });
    await window.getByRole('button', { name: /Ollama Duo/i }).first().click();
    await wait(window,2_000); // hold — viewers see the composition selected
    await window.getByPlaceholder('My session').waitFor({ state: 'visible', timeout: 5_000 });
    await window.getByPlaceholder('My session').fill('Ollama Duo Session');
    await wait(window,2_000); // hold — viewers read the session name
    await window.getByRole('button', { name: 'Start Session' }).click();
    await window.getByPlaceholder('Message the ensemble\u2026').waitFor({ state: 'visible', timeout: 45_000 });
    await wait(window,3_000); // hold — viewers orient to the session view
    cues.emit('session-ollama-started', 'Ollama Duo session started — both voices are local models running on this machine; no API key, no internet connection required');

    // Direct a simple question to Llama 3.2
    await window.getByPlaceholder('Message the ensemble\u2026').click();
    await wait(window,1_000);
    await window.getByPlaceholder('Message the ensemble\u2026').type('@');
    await wait(window,2_000);
    await window.getByPlaceholder('Message the ensemble\u2026').type('L');
    await wait(window,3_500);
    try {
      await window.locator('[role="option"]').first().waitFor({ state: 'visible', timeout: 2_000 });
      await window.locator('[role="option"]').first().click();
      await wait(window,1_500);
    } catch { /* dropdown shape may differ */ }
    cues.emit('directed-llama-targeted', 'Llama 3.2 targeted with a simple question');
    await window.getByPlaceholder('Message the ensemble\u2026').type(' What is the capital of France?');
    await wait(window,1_500);
    await window.keyboard.press('Enter');
    await window.getByPlaceholder('Waiting for voices\u2026').waitFor({ state: 'visible', timeout: 30_000 });
    await waitForSessionIdle(window, 120_000);
    await wait(window,4_000);
    cues.emit('directed-llama-responded', 'Llama 3.2 answered entirely on local hardware — inference runs on your machine; same interface, no cloud dependency');

    // Direct a simple question to Qwen 2.5
    await window.getByPlaceholder('Message the ensemble\u2026').click();
    await wait(window,1_000);
    await window.getByPlaceholder('Message the ensemble\u2026').type('@');
    await wait(window,2_000);
    await window.getByPlaceholder('Message the ensemble\u2026').type('Q');
    await wait(window,3_500);
    try {
      await window.locator('[role="option"]').first().waitFor({ state: 'visible', timeout: 2_000 });
      await window.locator('[role="option"]').first().click();
      await wait(window,1_500);
    } catch { /* dropdown shape may differ */ }
    cues.emit('directed-qwen-targeted', 'Qwen 2.5 targeted with a different simple question');
    await window.getByPlaceholder('Message the ensemble\u2026').type(' What color is the sky?');
    await wait(window,1_500);
    await window.keyboard.press('Enter');
    await window.getByPlaceholder('Waiting for voices\u2026').waitFor({ state: 'visible', timeout: 30_000 });
    await waitForSessionIdle(window, 120_000);
    await wait(window,4_000);
    cues.emit('directed-qwen-responded', 'Qwen 2.5 answered — two local models, one conversation, completely private; Polyphon is provider-agnostic whether voices are cloud APIs or local models');

    // ── Step 7: Hybrid Panel — mix cloud API + local model ────────────────────

    await window.getByRole('button', { name: /^sessions$/i }).click();
    await wait(window,2_000);
    await window.getByRole('button', { name: 'New Session', exact: true }).first().click();
    await wait(window,2_500);
    await window.getByRole('button', { name: /Hybrid Panel/i }).first().waitFor({ state: 'visible', timeout: 10_000 });
    await window.getByRole('button', { name: /Hybrid Panel/i }).first().click();
    await wait(window,2_000);
    await window.getByPlaceholder('My session').waitFor({ state: 'visible', timeout: 5_000 });
    await window.getByPlaceholder('My session').fill('Hybrid Panel Session');
    await wait(window,2_000);
    await window.getByRole('button', { name: 'Start Session' }).click();
    await window.getByPlaceholder('Message the ensemble\u2026').waitFor({ state: 'visible', timeout: 45_000 });
    await wait(window,3_000);
    cues.emit('session-hybrid-started',
      'Hybrid Panel session started — Anthropic API voice and local Llama voice ready in the same conductor session; mixing cloud and local providers works identically to any other composition');

    try {
      // Direct Anthropic to answer
      await window.getByPlaceholder('Message the ensemble\u2026').click();
      await wait(window,1_000);
      await window.getByPlaceholder('Message the ensemble\u2026').type('@');
      await wait(window,2_000);
      await window.getByPlaceholder('Message the ensemble\u2026').type('A');
      await wait(window,3_500);
      try {
        await window.locator('[role="option"]').first().waitFor({ state: 'visible', timeout: 2_000 });
        await window.locator('[role="option"]').first().click();
        await wait(window,1_500);
      } catch { /* dropdown shape may differ */ }
      cues.emit('hybrid-anthropic-targeted', 'Anthropic API voice targeted in the hybrid session — same at-mention picker, same conductor workflow');
      await window.getByPlaceholder('Message the ensemble\u2026').type(' What makes a good API design?');
      await wait(window,1_500);
      await window.keyboard.press('Enter');
      await window.getByPlaceholder('Waiting for voices\u2026').waitFor({ state: 'visible', timeout: 30_000 });
      await waitForSessionIdle(window, 180_000);
      await wait(window,4_000);
      cues.emit('hybrid-anthropic-responded', 'Anthropic cloud API responded — this voice is using remote inference');

      // Direct Llama to respond
      await window.getByPlaceholder('Message the ensemble\u2026').click();
      await wait(window,1_000);
      await window.getByPlaceholder('Message the ensemble\u2026').type('@');
      await wait(window,2_000);
      await window.getByPlaceholder('Message the ensemble\u2026').type('L');
      await wait(window,3_500);
      try {
        await window.locator('[role="option"]').first().waitFor({ state: 'visible', timeout: 2_000 });
        await window.locator('[role="option"]').first().click();
        await wait(window,1_500);
      } catch { /* dropdown shape may differ */ }
      cues.emit('hybrid-llama-targeted', 'Local Llama voice targeted to add its perspective — same session, same at-mention workflow, but running locally');
      await window.getByPlaceholder('Message the ensemble\u2026').type(' What would you add to that?');
      await wait(window,1_500);
      await window.keyboard.press('Enter');
      await window.getByPlaceholder('Waiting for voices\u2026').waitFor({ state: 'visible', timeout: 30_000 });
      await waitForSessionIdle(window, 120_000);
      await wait(window,4_000);
      cues.emit('hybrid-llama-responded',
        'Local Llama answered — a cloud API voice and a local model voice just had a directed exchange in one session; this is provider-agnostic by design');
    } catch {
      await wait(window, 2_000);
      cues.emit('hybrid-session-complete', 'Hybrid Panel session complete — cloud and local voices in one conductor session');
    }

    await wait(window,3_000);
    cues.emit('closing',
      'All four sessions visible in the sidebar — broadcast for parallel research, conductor for directed dialogue, local-only for privacy, hybrid for mixing cloud and local; one chat, many minds');

    await stopRecording();
  } finally {
    try { await app.close(); } catch { /* ignore */ }
  }

  const outputMp4 = path.join(SITE_STATIC, 'videos', 'home', 'full-walkthrough.mp4');
  compileFramesToMp4(ffmpegBin, framesDir, outputMp4, 15);
  cues.save(path.join(SITE_STATIC, 'videos', 'home', 'full-walkthrough-cues.json'));
  extractPosterFrame(ffmpegBin, outputMp4, path.join(SITE_STATIC, 'images', 'video-posters', 'home', 'full-walkthrough.webp'), 180);
  assertOutputWithinBudget(outputMp4, 100);
  captured++;
  const mb = (fs.statSync(outputMp4).size / (1024 * 1024)).toFixed(1);
  console.log(`  ✓ videos/home/full-walkthrough.mp4 (${mb}MB)`);
}

async function captureCustomProviders(ffmpegBin: string): Promise<void> {
  console.log('\n── Track 5: Custom providers — Ollama ──────────────────────────  [TRACK=custom-providers]');

  const { app, window } = await launchApp({ skipOnboarding: true });
  const framesDir = makeTempDir('polyphon-frames-custom-providers-');
  const cues = new CueEmitter();

  try {
    cues.start();
    const stopRecording = await startFrameRecording(window, framesDir, 15);
    cues.emit('app-open', 'Polyphon is open — navigating to Settings to configure custom AI providers');
    await wait(window,2_000);
    cues.emit('app-launched', 'App open, navigating to Settings Providers tab');

    // ── Step 1: Add first custom provider — Llama 3.2 ────────────────────

    await goToSettingsTab(window, 'Providers');

    // Scroll the Add Custom Provider button into view so viewers see the section
    const addBtn = window.getByRole('button', { name: /Add Custom Provider/i }).first();
    await addBtn.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    await wait(window,2_500); // hold — viewers read the Custom Providers heading
    cues.emit('custom-providers-section', 'Custom Providers section visible');

    await addBtn.click();
    await wait(window,1_000);
    // Scroll the form into view so viewers can see every field being filled
    const nameField1 = window.getByRole('textbox', { name: /^Name/ });
    await nameField1.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    await wait(window,1_500);

    await nameField1.fill('Llama 3.2');
    await wait(window,1_000);
    await window.getByPlaceholder('http://localhost:11434/v1').fill('http://localhost:11434/v1');
    await wait(window,1_000);
    await window.getByPlaceholder('llama3.2').fill('llama3.2:1b');
    await wait(window,2_000);
    cues.emit('llama-form-filled', 'Llama 3.2 form filled — Ollama base URL and model name');

    const saveBtn1 = window.getByRole('button', { name: 'Save', exact: true }).first();
    await saveBtn1.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    await wait(window,800);
    await saveBtn1.click();
    await wait(window,2_500); // hold — viewers see the saved provider card
    cues.emit('llama-provider-saved', 'Llama 3.2 provider saved');

    // ── Step 2: Add second custom provider — Qwen 2.5 ────────────────────

    const addBtn2 = window.getByRole('button', { name: /Add Custom Provider/i }).first();
    await addBtn2.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    await wait(window,1_000);

    await addBtn2.click();
    await wait(window,1_000);
    // Scroll the form into view so viewers can see every field being filled
    const nameField2 = window.getByRole('textbox', { name: /^Name/ });
    await nameField2.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    await wait(window,1_500);

    await nameField2.fill('Qwen 2.5');
    await wait(window,1_000);
    await window.getByPlaceholder('http://localhost:11434/v1').fill('http://localhost:11434/v1');
    await wait(window,1_000);
    await window.getByPlaceholder('llama3.2').fill('qwen2.5:0.5b');
    await wait(window,2_000);
    cues.emit('qwen-form-filled', 'Qwen 2.5 form filled — same Ollama URL, different model');

    const saveBtn2 = window.getByRole('button', { name: 'Save', exact: true }).first();
    await saveBtn2.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    await wait(window,800);
    await saveBtn2.click();
    await wait(window,3_000); // hold — viewers see both provider cards
    cues.emit('qwen-provider-saved', 'Both Ollama providers saved');

    // ── Step 3: Build a directed composition with both ────────────────────

    await openNewComposition(window);
    await window.getByPlaceholder('My Composition').fill('Ollama Duo');
    await wait(window,2_000);

    // Conductor mode is the default — no toggle needed

    // Add Llama 3.2 voice
    await window.getByRole('button', { name: /Llama 3\.2/i }).first().click();
    await wait(window,2_000);
    await window.getByRole('button', { name: 'Add Voice' }).click();
    await wait(window,1_500);

    // Add Qwen 2.5 voice
    await window.getByRole('button', { name: /Qwen 2\.5/i }).first().click();
    await wait(window,2_000);
    await window.getByRole('button', { name: 'Add Voice' }).click();
    await wait(window,1_500);

    await window.getByRole('button', { name: 'Save Composition' }).click();
    await wait(window,2_000);
    cues.emit('composition-saved', 'Ollama Duo conductor composition saved with both local voices');

    // ── Step 4: Start a session and direct easy questions ─────────────────

    await startSessionFromComposition(window, 'Ollama Duo');
    await wait(window,2_500);
    cues.emit('session-started', 'Ollama Duo session started');

    // Ask Llama 3.2 a simple question
    await window.getByPlaceholder('Message the ensemble\u2026').click();
    await wait(window,1_000);
    await window.getByPlaceholder('Message the ensemble\u2026').type('@');
    await wait(window,2_000);
    await window.getByPlaceholder('Message the ensemble\u2026').type('L');
    await wait(window,3_500);
    try {
      await window.locator('[role="option"]').first().waitFor({ state: 'visible', timeout: 2_000 });
      await window.locator('[role="option"]').first().click();
      await wait(window,1_500);
    } catch { /* dropdown shape may differ */ }
    cues.emit('directed-llama-targeted', 'Llama 3.2 targeted');
    await window.getByPlaceholder('Message the ensemble\u2026').type(' What is the capital of France?');
    await wait(window,1_000);
    await window.keyboard.press('Enter');
    await window.getByPlaceholder('Waiting for voices\u2026').waitFor({ state: 'visible', timeout: 30_000 });
    await waitForSessionIdle(window, 120_000);
    await wait(window,3_500);
    cues.emit('directed-llama-responded', 'Llama 3.2 answered');

    // Ask Qwen 2.5 a simple question
    await window.getByPlaceholder('Message the ensemble\u2026').click();
    await wait(window,1_000);
    await window.getByPlaceholder('Message the ensemble\u2026').type('@');
    await wait(window,2_000);
    await window.getByPlaceholder('Message the ensemble\u2026').type('Q');
    await wait(window,3_500);
    try {
      await window.locator('[role="option"]').first().waitFor({ state: 'visible', timeout: 2_000 });
      await window.locator('[role="option"]').first().click();
      await wait(window,1_500);
    } catch { /* dropdown shape may differ */ }
    cues.emit('directed-qwen-targeted', 'Qwen 2.5 targeted');
    await window.getByPlaceholder('Message the ensemble\u2026').type(' What color is the sky?');
    await wait(window,1_000);
    await window.keyboard.press('Enter');
    await window.getByPlaceholder('Waiting for voices\u2026').waitFor({ state: 'visible', timeout: 30_000 });
    await waitForSessionIdle(window, 120_000);
    await wait(window,4_000);
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

const NARRATION_CONTINUATION_NUDGE = `Broadcast mode sends your message to every voice at the same time.
With the "Prompt me" continuation policy, voices don't just stop after one round — when they have more to say, a nudge banner appears asking whether to continue.
Here, both voices respond to a question about API design tradeoffs. Once they finish, the banner asks: let them continue?
Click Allow and a second round begins — voices read each other's answers and build on them.
You stay in control of when the conversation goes deeper.
`;

const NARRATION_WALKTHROUGH = `Polyphon is a desktop app for orchestrating conversations between multiple AI voices.

Settings gives you full control over your setup. The Conductor profile lets voices address you personally — by name, with your pronouns, and in your chosen tone. Tones shape how every voice communicates: Professional for focused answers, Collaborative for expansive exploration, Devil's Advocate to stress-test ideas. System prompt templates let you save reusable instructions and attach them to any voice in a composition.

In Providers, each provider can run in one of two modes. API mode connects to the cloud using your API key and lets you choose the exact model. CLI mode uses a local command-line tool installed on your machine — no key required. Anthropic and OpenAI both support both modes. Gemini is API-only. Custom providers let you connect any OpenAI-compatible endpoint — Ollama, LM Studio, vLLM, or a private proxy. Enter a name, base URL, and model ID and save. Cloud and local providers are peers in every composition.

Compositions are saved, reusable sets of voices. A broadcast composition sends every message to every voice simultaneously — all voices respond in parallel each round. A conductor composition lets you direct each message to a specific voice with the at-mention picker. You can also set a continuation policy: Prompt me means a banner appears after each round asking whether to continue, giving you control over when the conversation goes deeper.

In a broadcast session, ask a research question and every voice answers at the same time. When the round completes and Prompt me is active, a nudge banner appears — click Allow and round two begins, with voices building on each other's answers from round one.

In a conductor session, use the at-mention picker to direct each message to a specific voice. One voice makes a claim; another responds to it directly. Orchestrated dialogue between models, under your control. The same interface works with local models — no cloud required.

Polyphon supports any mix: broadcast, directed, local-only, or hybrid cloud-and-local in the same session. Four compositions, four session types, one interface.

Polyphon: one chat, many minds.
`;

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('Polyphon video capture starting...');
  console.log(`App entry: ${APP_ENTRY}`);

  assertBuildExists();
  const ffmpegBin = assertFfmpegInstalled();
  console.log(`ffmpeg: ${ffmpegBin}`);

  // ── Single-track mode (--track <name>) ───────────────────────────────────
  if (TRACK_ONLY !== null) {
    if (!(VALID_TRACKS as readonly string[]).includes(TRACK_ONLY)) {
      console.error(`\nERROR: Unknown track "${TRACK_ONLY}".`);
      console.error(`Valid tracks: ${VALID_TRACKS.join(', ')}\n`);
      process.exit(1);
    }
    const trackMap: Record<string, () => Promise<void>> = {
      'type-toggle':        async () => { await captureTypeToggle(ffmpegBin);       writeNarrationScript('docs/video-narration/compositions-type-toggle.txt',        NARRATION_TYPE_TOGGLE); },
      'streaming':          async () => { await captureStreaming(ffmpegBin);         writeNarrationScript('docs/video-narration/sessions-streaming.txt',               NARRATION_STREAMING); },
      'at-mention':         async () => { await captureAtMention(ffmpegBin);         writeNarrationScript('docs/video-narration/sessions-at-mention.txt',              NARRATION_AT_MENTION); },
      'continuation-nudge': async () => { await captureContinuationNudge(ffmpegBin); writeNarrationScript('docs/video-narration/continuation-nudge.txt',               NARRATION_CONTINUATION_NUDGE); },
      'custom-providers':   async () => { assertOllamaRunning(); await captureCustomProviders(ffmpegBin); writeNarrationScript('docs/video-narration/custom-providers-ollama.txt', NARRATION_CUSTOM_PROVIDERS); },
      'walkthrough':        async () => { await captureWalkthrough(ffmpegBin);       writeNarrationScript('docs/video-narration/full-walkthrough.txt',                 NARRATION_WALKTHROUGH); },
    };
    console.log(`\n── Running single track: ${TRACK_ONLY} ─────────────────────────────`);
    await trackMap[TRACK_ONLY]();
    console.log(`\n✓ Track "${TRACK_ONLY}" complete. Captured: ${captured}\n`);
    return;
  }

  const runDocs = !WALKTHROUGH_ONLY && !CUSTOM_PROVIDERS_ONLY;
  const runWalkthrough = !DOCS_ONLY && !CUSTOM_PROVIDERS_ONLY;
  const runCustomProviders = CUSTOM_PROVIDERS_ONLY || DOCS_ONLY;

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

    try {
      await captureContinuationNudge(ffmpegBin);
      writeNarrationScript('docs/video-narration/continuation-nudge.txt', NARRATION_CONTINUATION_NUDGE);
    } catch (err) {
      console.error('\nERROR in continuation-nudge capture:', err);
      docErrors.push({ label: 'continuation-nudge', error: err });
      skipped.push({ label: 'continuation-nudge', reason: String(err) });
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

  // ── Custom providers explicit standalone (--custom-providers-only) ──────────

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
    const docsReplacements: Array<{ file: string; placeholder: string; src: string; poster: string }> = [
      {
        file: 'site/content/docs/compositions.md',
        placeholder: 'Voice type toggle — selecting a provider shows the API/CLI toggle with available and unavailable states',
        src: '/videos/docs/compositions-type-toggle.mp4',
        poster: '/images/video-posters/docs/compositions-type-toggle.webp',
      },
      {
        file: 'site/content/docs/sessions.md',
        placeholder: 'Sessions — message streaming — voices respond in parallel with tokens appearing in real time',
        src: '/videos/docs/sessions-streaming.mp4',
        poster: '/images/video-posters/docs/sessions-streaming.webp',
      },
      {
        file: 'site/content/docs/sessions.md',
        placeholder: 'Sessions — @-mention targeting — typing @ opens the voice picker, selecting a voice directs the message',
        src: '/videos/docs/sessions-at-mention.mp4',
        poster: '/images/video-posters/docs/sessions-at-mention.webp',
      },
      {
        file: 'site/content/docs/sessions.md',
        placeholder: 'Continuation policy nudge — show "Prompt me" banner appearing between rounds, user clicking Continue',
        src: '/videos/docs/continuation-nudge.mp4',
        poster: '/images/video-posters/docs/continuation-nudge.webp',
      },
      {
        file: 'site/content/docs/custom-providers.md',
        placeholder: 'Custom provider setup — add Ollama end-to-end: fill form, fetch models, save, launch session',
        src: '/videos/docs/custom-providers-ollama.mp4',
        poster: '/images/video-posters/docs/custom-providers-ollama.webp',
      },
    ];

    for (const { file, placeholder, src, poster } of docsReplacements) {
      const outputPath = path.join(SITE_STATIC, src.slice(1));
      if (!fs.existsSync(outputPath)) {
        skipped.push({ label: file, reason: `capture missing: ${src}` });
        continue;
      }
      const shortcode = poster
        ? `{{< video src="${src}" poster="${poster}" >}}`
        : `{{< video src="${src}" >}}`;
      replacePlaceholder(file, placeholder, shortcode);
    }
  }

  if (runWalkthrough) {
    const walkthroughMp4 = path.join(SITE_STATIC, 'videos', 'home', 'full-walkthrough.mp4');
    if (fs.existsSync(walkthroughMp4)) {
      const walkthroughShortcode = '{{< video src="/videos/home/full-walkthrough.mp4" poster="/images/video-posters/home/full-walkthrough.webp" >}}';
      injectHomepageVideo('site/content/_index.md', walkthroughShortcode);
      injectHomepageVideo('site/content/docs/walkthrough.md', walkthroughShortcode);
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
