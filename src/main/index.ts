import { app, BrowserWindow } from 'electron';
import path from 'path';
import started from 'electron-squirrel-startup';
import { registerIpcHandlers } from './ipc';
import { getDb, closeDb } from './db';
import { loadShellEnv } from './utils/env';
import { VoiceManager } from './managers/VoiceManager';
import { SessionManager } from './managers/SessionManager';
import { checkForUpdate } from './utils/updateChecker';

// Handle Squirrel startup events on Windows
if (started) app.quit();

// The SUID sandbox cannot be configured inside an AppImage (chrome-sandbox
// extracts to /tmp and cannot be made setuid-root by a normal user).
// Disable it on Linux so the app launches without requiring root ownership.
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('no-sandbox');
}

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

  const db = getDb();
  const voiceManager = new VoiceManager();
  voiceManager.loadCustomProviders(db);
  voiceManager.loadTones(db);
  voiceManager.loadSystemPromptTemplates(db);
  const sessionManager = new SessionManager(voiceManager);

  registerIpcHandlers(db, voiceManager, sessionManager);
  const win = createWindow();
  checkForUpdate(db, win);

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
