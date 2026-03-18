import { app } from 'electron';
import type { BrowserWindow } from 'electron';
import type { DatabaseSync } from 'node:sqlite';
import { IPC } from '../../shared/constants';
import type { UpdateInfo } from '../../shared/types';
import { isNewerVersion } from './version';
import { getUpdatePreferences } from '../db/queries/userProfile';

// Module-level cache — set once per startup; never mutated after checkForUpdate runs.
// getCachedUpdateInfo() exposes it so the update:get-state handler can return it
// even if the check completed before the renderer registered its onAvailable listener.
let cachedUpdateInfo: UpdateInfo | null = null;

export function getCachedUpdateInfo(): UpdateInfo | null {
  return cachedUpdateInfo;
}

// Test isolation — reset module-level cache between tests.
export function _resetForTests(): void { cachedUpdateInfo = null; }

const GITHUB_RELEASES_URL = 'https://api.github.com/repos/polyphon-ai/releases/releases/latest';
const MAX_TAG_NAME_LENGTH = 30;
const STRICT_VERSION_RE = /^\d+\.\d+\.\d+$/;

// Single fetch-layer gate: validates the three fields consumed downstream (draft,
// prerelease, tag_name) before any version string reaches further code. Downstream
// logic (isNewerVersion, cache, IPC) only ever sees a validated "X.Y.Z" string.
function parseReleaseVersion(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const r = payload as Record<string, unknown>;
  if (typeof r.draft !== 'boolean') return null;
  if (typeof r.prerelease !== 'boolean') return null;
  if (r.draft || r.prerelease) return null;
  if (typeof r.tag_name !== 'string') return null;
  if (r.tag_name.length > MAX_TAG_NAME_LENGTH) return null;
  const version = r.tag_name.startsWith('v') ? r.tag_name.slice(1) : r.tag_name;
  return STRICT_VERSION_RE.test(version) ? version : null;
}

// Manual on-demand check — bypasses dismissal preferences, clears and resets the cache.
// Returns UpdateInfo if a newer release is available, null otherwise.
export async function checkForUpdateNow(win: BrowserWindow): Promise<UpdateInfo | null> {
  try {
    const currentVersion = app.getVersion();
    const response = await fetch(
      GITHUB_RELEASES_URL,
      { headers: { 'User-Agent': `polyphon/${currentVersion}` }, signal: AbortSignal.timeout(10000) },
    );

    if (!response.ok) return null;

    const data = await response.json() as unknown;
    const latestVersion = parseReleaseVersion(data);
    if (!latestVersion) return null;

    if (!isNewerVersion(currentVersion, latestVersion)) {
      cachedUpdateInfo = null;
      return null;
    }

    cachedUpdateInfo = { version: latestVersion };
    win.webContents.send(IPC.UPDATE_AVAILABLE, cachedUpdateInfo);
    return cachedUpdateInfo;
  } catch {
    if (!app.isPackaged) {
      console.log('[updateChecker] manual check failed (silenced in production)');
    }
    return null;
  }
}

export async function checkForUpdate(db: DatabaseSync, win: BrowserWindow, now = Date.now()): Promise<void> {
  if (process.env.POLYPHON_E2E) return;

  try {
    const currentVersion = app.getVersion();
    const response = await fetch(
      GITHUB_RELEASES_URL,
      { headers: { 'User-Agent': `polyphon/${currentVersion}` }, signal: AbortSignal.timeout(10000) },
    );

    if (!response.ok) return;

    const data = await response.json() as unknown;
    const latestVersion = parseReleaseVersion(data);
    if (!latestVersion) return;

    if (!isNewerVersion(currentVersion, latestVersion)) return;

    const prefs = getUpdatePreferences(db);

    if (latestVersion === prefs.dismissedUpdateVersion) return;
    if (now < prefs.updateRemindAfter) return;

    cachedUpdateInfo = { version: latestVersion };
    win.webContents.send(IPC.UPDATE_AVAILABLE, cachedUpdateInfo);
  } catch {
    if (!app.isPackaged) {
      console.log('[updateChecker] check failed (silenced in production)');
    }
  }
}
