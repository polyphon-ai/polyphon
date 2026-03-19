import { app, BrowserWindow } from 'electron';
import path from 'path';
import { registerIpcHandlers } from './ipc';
import type { EncryptionContext } from './ipc/settingsHandlers';
import { getDb, closeDb } from './db';
import { loadShellEnv } from './utils/env';
import { logger } from './utils/logger';
import { VoiceManager } from './managers/VoiceManager';
import { SessionManager } from './managers/SessionManager';
import { checkForUpdate } from './utils/updateChecker';
import { loadOrCreateKey } from './security/keyManager';
import { initFieldEncryption } from './security/fieldEncryption';
import { createUnlockWindow } from './security/unlockWindow';
import { installCsp } from './security/csp';
import { IPC } from '../shared/constants';

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', err);
});
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', reason);
});

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
    // POLYPHON_HIDE_WINDOW=1 forces hidden even when POLYPHON_E2E is unset
    // (used by encryption tests that need real key manager behaviour).
    show: (!process.env.POLYPHON_E2E && !process.env.POLYPHON_HIDE_WINDOW) || !!process.env.POLYPHON_SHOW_WINDOW,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });

  // HIGH-001: Deny all popup/window-open requests from renderer content.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // HIGH-001: Block any navigation away from the app origin. External links must
  // go through the shell:openExternal allowlist path in IPC handlers.
  win.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    if (process.env.POLYPHON_DEVTOOLS) {
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
  logger.info('Polyphon starting', { version: app.getVersion(), platform: process.platform });

  // Install CSP once, before any window is created, so the policy is in place
  // before the renderer loads any content.
  installCsp();

  const e2e = process.env.POLYPHON_E2E === '1';
  const userDataPath = app.getPath('userData');

  // Resolve the database key before opening the DB. For password-wrapped keys
  // this shows an unlock window and awaits the user's password.
  const { key, keyWasAbsent } = await loadOrCreateKey(
    userDataPath,
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
  voiceManager.loadProviderConfigs(db);
  voiceManager.loadTones(db);
  voiceManager.loadSystemPromptTemplates(db);
  const sessionManager = new SessionManager(voiceManager);

  const encCtx: EncryptionContext = { userDataPath, dbKey: key, e2e };
  registerIpcHandlers(db, voiceManager, sessionManager, encCtx);
  const win = createWindow();
  logger.info('Main window created');
  checkForUpdate(db, win);

  // After the renderer finishes loading, send any one-time push notifications.
  win.webContents.once('did-finish-load', () => {
    if (e2e) return;

    // Warn if the key was absent (key file missing or unrecognized on a non-fresh install).
    if (keyWasAbsent) {
      logger.warn('Encryption key was absent; a new key was generated. Previously encrypted data is unrecoverable.');
      win.webContents.send(IPC.ENCRYPTION_KEY_REGENERATED_WARNING);
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // Abort all active CLI voice subprocesses before the app exits so no orphaned
  // child processes keep the process group alive.
  app.on('before-quit', () => {
    logger.info('Polyphon shutting down');
    voiceManager.disposeAll();
  });
});

app.on('window-all-closed', () => {
  // macOS convention: stay running until explicitly quit (Cmd+Q or dock menu).
});

app.on('will-quit', () => {
  closeDb();
});
