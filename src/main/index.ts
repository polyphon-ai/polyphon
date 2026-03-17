import { app, BrowserWindow, safeStorage } from 'electron';
import path from 'path';
import started from 'electron-squirrel-startup';
import { registerIpcHandlers } from './ipc';
import type { EncryptionContext } from './ipc/settingsHandlers';
import { getDb, closeDb } from './db';
import { loadShellEnv } from './utils/env';
import { VoiceManager } from './managers/VoiceManager';
import { SessionManager } from './managers/SessionManager';
import { checkForUpdate } from './utils/updateChecker';
import { loadOrCreateKey, readKeyFile } from './security/keyManager';
import { initFieldEncryption } from './security/fieldEncryption';
import { createUnlockWindow } from './security/unlockWindow';
import { installCsp } from './security/csp';
import { IPC } from '../shared/constants';

// Handle Squirrel startup events on Windows
if (started) app.quit();

// In test mode, isolate all Electron storage (localStorage, session data, etc.)
// to the same temp directory used for the SQLite DB, preventing state leaks between tests.
if (process.env.POLYPHON_TEST_USER_DATA) {
  app.setPath('userData', process.env.POLYPHON_TEST_USER_DATA);
}

// Vite injects these globals during build
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    // In e2e test mode, keep the window hidden so it doesn't steal focus.
    // Pass POLYPHON_SHOW_WINDOW=1 to override (e.g. live/visual test runs).
    show: !process.env.POLYPHON_E2E || !!process.env.POLYPHON_SHOW_WINDOW,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    if (!process.env.POLYPHON_NO_DEVTOOLS) {
      win.webContents.openDevTools();
    }
  } else {
    win.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  return win;
}

app.whenReady().then(async () => {
  // Load shell-exported env vars before anything else so API keys set in
  // ~/.zshrc, ~/.bashrc, etc. are visible regardless of how the app launched.
  loadShellEnv();

  // Install CSP once, before any window is created, so the policy is in place
  // before the renderer loads any content.
  installCsp();

  const e2e = process.env.POLYPHON_E2E === '1';
  const userDataPath = app.getPath('userData');

  // Resolve the database key before opening the DB. For password-wrapped keys
  // this shows an unlock window and awaits the user's password.
  const { key, keyWasAbsent } = await loadOrCreateKey(
    userDataPath,
    safeStorage,
    e2e,
    async (keyFile) => {
      const { window: unlockWin, unlockPromise } = createUnlockWindow(keyFile);
      const resolvedKey = await unlockPromise;
      // Destroy the window without triggering the close→app.quit() handler.
      unlockWin.destroy();
      return resolvedKey;
    },
  );

  initFieldEncryption(key);

  const db = getDb();
  const voiceManager = new VoiceManager();
  voiceManager.loadCustomProviders(db);
  voiceManager.loadTones(db);
  voiceManager.loadSystemPromptTemplates(db);
  const sessionManager = new SessionManager(voiceManager);

  const encCtx: EncryptionContext = { userDataPath, dbKey: key, e2e };
  registerIpcHandlers(db, voiceManager, sessionManager, encCtx);
  const win = createWindow();
  checkForUpdate(db, win);

  // After the renderer finishes loading, send any one-time push notifications.
  win.webContents.once('did-finish-load', () => {
    if (e2e) return;

    // Warn if the key was absent (key file missing on a non-fresh install).
    if (keyWasAbsent) {
      win.webContents.send(IPC.ENCRYPTION_KEY_REGENERATED_WARNING);
    }

    // Notify Linux users whose safeStorage backend is basic_text with no password.
    const safeStorageTyped = safeStorage as typeof safeStorage & { getSelectedStorageBackend?(): string };
    if (
      safeStorage.isEncryptionAvailable() &&
      safeStorageTyped.getSelectedStorageBackend?.() === 'basic_text'
    ) {
      const keyFilePath = path.join(userDataPath, 'polyphon.key.json');
      const keyFile = readKeyFile(keyFilePath);
      if (keyFile?.wrapping === 'safeStorage' && !keyFile.linuxNoticeDismissed) {
        win.webContents.send(IPC.ENCRYPTION_LINUX_NOTICE);
      }
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // Abort all active CLI voice subprocesses before the app exits so no orphaned
  // child processes keep the process group alive (relevant on Linux/Windows).
  app.on('before-quit', () => {
    voiceManager.disposeAll();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  closeDb();
});
