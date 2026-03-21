import { autoUpdater } from 'electron-updater';
import { app } from 'electron';
import semver from 'semver';
import type { BrowserWindow } from 'electron';
import type { DatabaseSync } from 'node:sqlite';
import { logger } from './logger';
import { IPC } from '../../shared/constants';
import { getUpdatePreferences, getUpdateChannel } from '../db/queries/userProfile';
import type { UpdateInfo, UpdateChannel } from '../../shared/types';

// Cached update info — set when an update is detected and not dismissed.
// getCachedUpdateInfo() exposes it so the update:get-state handler can return it
// even if the check completed before the renderer registered its onAvailable listener.
let cachedUpdateInfo: UpdateInfo | null = null;

export function getCachedUpdateInfo(): UpdateInfo | null {
  return cachedUpdateInfo;
}

// Test isolation — reset module-level state between tests.
export function _resetForTests(): void {
  cachedUpdateInfo = null;
  manualCheck = false;
  downloading = false;
}

// Flag to bypass dismissal prefs when the user explicitly triggers a check.
let manualCheck = false;

// Tracks whether a download is in progress so errors can be surfaced to the renderer.
let downloading = false;

// If the running app is itself a prerelease, always allow prerelease updates
// regardless of the user's channel preference. The stable/preview distinction
// is only meaningful once stable releases exist.
function resolveAllowPrerelease(channel: UpdateChannel): boolean {
  const installedVersion = app.getVersion();
  if (semver.prerelease(installedVersion)) return true;
  return channel === 'preview';
}

// Stored reference to the active window so changeChannel can use it.
let activeWin: BrowserWindow | null = null;
let activeDb: DatabaseSync | null = null;

export function setupAutoUpdater(db: DatabaseSync, win: BrowserWindow): void {
  if (process.env.POLYPHON_E2E) return;

  activeWin = win;
  activeDb = db;

  const channel = getUpdateChannel(db);

  autoUpdater.logger = null;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = resolveAllowPrerelease(channel);
  autoUpdater.forceDevUpdateConfig = !app.isPackaged;

  autoUpdater.on('update-available', (info) => {
    const version = info.version;

    if (!manualCheck) {
      const prefs = getUpdatePreferences(db);
      if (version === prefs.dismissedUpdateVersion) return;
      if (Date.now() < prefs.updateRemindAfter) return;
    }
    manualCheck = false;

    cachedUpdateInfo = { version };
    win.webContents.send(IPC.UPDATE_AVAILABLE, { version });
  });

  autoUpdater.on('update-not-available', () => {
    manualCheck = false;
  });

  autoUpdater.on('download-progress', (progress) => {
    win.webContents.send(IPC.UPDATE_DOWNLOAD_PROGRESS, {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    downloading = false;
    win.webContents.send(IPC.UPDATE_READY_TO_INSTALL, { version: info.version });
  });

  autoUpdater.on('error', (err) => {
    manualCheck = false;
    logger.error('[autoUpdater] error', err);
    if (downloading) {
      downloading = false;
      win.webContents.send(IPC.UPDATE_ERROR, { message: err.message ?? 'Download failed' });
    }
  });

  // Startup check — fire-and-forget; errors are non-fatal
  autoUpdater.checkForUpdates().catch((err) => {
    logger.debug('[autoUpdater] startup check failed', err);
  });
}

// Called when the user changes their update channel preference.
// Clears any stale update notification and re-checks with the new setting.
export function changeChannel(channel: UpdateChannel): void {
  autoUpdater.allowPrerelease = resolveAllowPrerelease(channel);
  cachedUpdateInfo = null;

  autoUpdater.checkForUpdates().catch((err) => {
    logger.debug('[autoUpdater] channel-change check failed', err);
  });
}

// Manual on-demand check — bypasses dismissal preferences.
export async function checkForUpdateNow(): Promise<UpdateInfo | null> {
  try {
    manualCheck = true;
    await autoUpdater.checkForUpdates();
    return cachedUpdateInfo;
  } catch {
    manualCheck = false;
    logger.debug('[autoUpdater] manual check failed');
    return null;
  }
}

export async function downloadUpdate(): Promise<void> {
  downloading = true;
  await autoUpdater.downloadUpdate();
}

export function quitAndInstall(): void {
  autoUpdater.quitAndInstall(false, false);
}
