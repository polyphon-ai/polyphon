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

interface GitHubRelease {
  tag_name: string;
  prerelease: boolean;
  draft: boolean;
}

// Manual on-demand check — bypasses dismissal preferences, clears and resets the cache.
// Returns UpdateInfo if a newer release is available, null otherwise.
export async function checkForUpdateNow(win: BrowserWindow): Promise<UpdateInfo | null> {
  try {
    const currentVersion = app.getVersion();
    const response = await fetch(
      'https://api.github.com/repos/polyphon-ai/releases/releases/latest',
      { headers: { 'User-Agent': `polyphon/${currentVersion}` } },
    );

    if (!response.ok) return null;

    const release = await response.json() as GitHubRelease;

    if (release.draft || release.prerelease) return null;

    const rawTag = release.tag_name ?? '';
    const latestVersion = rawTag.startsWith('v') ? rawTag.slice(1) : rawTag;

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
      'https://api.github.com/repos/polyphon-ai/releases/releases/latest',
      { headers: { 'User-Agent': `polyphon/${currentVersion}` } },
    );

    if (!response.ok) return;

    const release = await response.json() as GitHubRelease;

    if (release.draft || release.prerelease) return;

    const rawTag = release.tag_name ?? '';
    const latestVersion = rawTag.startsWith('v') ? rawTag.slice(1) : rawTag;

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
