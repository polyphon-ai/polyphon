/**
 * Retakes only the first-launch onboarding screenshot.
 * Usage: npx tsx scripts/retake-first-launch.ts
 */
import path from 'path';
import fs from 'fs';
import os from 'os';
import { _electron as electron } from '@playwright/test';
import sharp from 'sharp';

const REPO_ROOT = path.join(__dirname, '..');
const SITE_STATIC = path.join(REPO_ROOT, 'site', 'static');
const APP_ENTRY = path.join(REPO_ROOT, '.vite', 'build', 'main.js');

if (!fs.existsSync(APP_ENTRY)) {
  console.error(`ERROR: ${APP_ENTRY} not found. Run "npm run build:e2e" first.`);
  process.exit(1);
}

async function main(): Promise<void> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'polyphon-ss-'));

  const app = await electron.launch({
    args: [APP_ENTRY, '--no-sandbox'],
    env: {
      ...(process.env as Record<string, string>),
      NODE_ENV: 'test',
      POLYPHON_TEST_USER_DATA: tmpDir,
      POLYPHON_E2E: '1',
      POLYPHON_SHOW_WINDOW: '1',
    },
  });

  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');

  // Wait for the onboarding modal
  const skipBtn = window.getByRole('button', { name: /skip for now/i });
  await skipBtn.waitFor({ state: 'visible', timeout: 10_000 });

  // Fill name
  await window.getByPlaceholder('e.g. Alex').fill('Alex');
  await window.waitForTimeout(200);

  // Select they/them pronouns
  await window.locator('select').selectOption('they/them');
  await window.waitForTimeout(150);

  // Capture
  const outputPath = 'images/screenshots/home/first-launch.webp';
  const absPath = path.join(SITE_STATIC, outputPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });

  const pngBuffer = await window.screenshot({ fullPage: false });
  await sharp(pngBuffer).webp({ quality: 85 }).toFile(absPath);

  const kb = Math.round(fs.statSync(absPath).size / 1024);
  console.log(`✓ ${outputPath} (${kb}KB)`);

  await app.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

main().catch((err) => { console.error(err); process.exit(1); });
