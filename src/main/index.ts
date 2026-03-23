import { app, BrowserWindow } from 'electron';
import path from 'path';
import os from 'node:os';
import { registerIpcHandlers } from './ipc';
import type { EncryptionContext } from './ipc/settingsHandlers';
import { getDb, closeDb } from './db';
import { logger, initDebugFromFlag, addSensitiveValue, suppressConsoleTransport } from './utils/logger';
import { VoiceManager } from './managers/VoiceManager';
import { SessionManager } from './managers/SessionManager';
import { setupAutoUpdater } from './utils/updateChecker';
import { loadOrCreateKey } from './security/keyManager';
import { createUnlockWindow } from './security/unlockWindow';
import { installCsp } from './security/csp';
import { IPC, APP_SETTING_KEYS } from '../shared/constants';
import { SCHEMA_VERSION } from './db/schema';
import { getBooleanSetting } from './db/queries/appSettings';
import { createMcpController } from './mcp/index';

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', err);
});
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', reason);
});

// Parse CLI flags
const argv = process.argv.slice(1);
const isMcpServer = argv.includes('--mcp-server');
const isHeadless = argv.includes('--headless');

// In MCP server mode, suppress console log transport to avoid stdout contamination.
if (isMcpServer) {
  suppressConsoleTransport();
}

// In test mode, isolate all Electron storage (localStorage, session data, etc.)
// to the same temp directory used for the SQLite DB, preventing state leaks between tests.
if (process.env.POLYPHON_TEST_USER_DATA) {
  app.setPath('userData', process.env.POLYPHON_TEST_USER_DATA);
}

// Prevent Chromium from creating a "{AppName} Safe Storage" keychain entry on macOS.
// Chromium uses OS-level key storage to encrypt its own internal data (cookies,
// localStorage) — this is separate from Electron's safeStorage API but triggers the
// same keychain prompt. 'basic' tells it to use plaintext storage instead, which is
// consistent with our own key-management approach (file-permission-based, not keychain).
app.commandLine.appendSwitch('password-store', 'basic');

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
  initDebugFromFlag();
  const cpus = os.cpus();
  logger.info('Polyphon starting', {
  app: { version: app.getVersion(), schemaVersion: SCHEMA_VERSION },
  system: { os: `${os.type()} ${process.getSystemVersion()}`, platform: process.platform, arch: process.arch, electron: process.versions.electron },
  hardware: { cpu: `${cpus[0]?.model ?? 'unknown'} (${cpus.length} cores)`, memoryGb: (os.totalmem() / 1024 ** 3).toFixed(1) },
  flags: { mcpServer: isMcpServer, headless: isHeadless },
});

  const e2e = process.env.POLYPHON_E2E === '1';
  const userDataPath = app.getPath('userData');

  // Headless mode: if DB is password-protected, require POLYPHON_DB_PASSWORD env var.
  if (isHeadless) {
    const dbPassword = process.env.POLYPHON_DB_PASSWORD ?? '';
    if (dbPassword) {
      addSensitiveValue(dbPassword);
    }
    // Key loading in headless mode — on failure, exit immediately.
    const { key, keyWasAbsent } = await loadOrCreateKey(
      userDataPath,
      e2e,
      async () => {
        // Headless mode: no interactive unlock. Check env var.
        if (!dbPassword) {
          process.stderr.write(
            'polyphon: database is password-protected. Set POLYPHON_DB_PASSWORD to the database password.\n',
          );
          process.exit(1);
        }
        return Buffer.from(dbPassword);
      },
    );

    if (keyWasAbsent) {
      logger.warn('[headless] Encryption key was absent; new key generated. Previously encrypted data is unrecoverable.');
    }

    const keyHex = key.toString('hex');
    const db = getDb(keyHex);
    const voiceManager = new VoiceManager(db);
    const sessionManager = new SessionManager(voiceManager);

    const mcpEnabled = getBooleanSetting(db, APP_SETTING_KEYS.MCP_ENABLED, false);
    const mcpController = createMcpController({
      db,
      voiceManager,
      sessionManager,
      enabled: true,
      headless: true,
      onClose: () => {
        logger.info('[headless] MCP stdio closed, quitting');
        app.quit();
      },
    });

    await mcpController.start();
    logger.info('Polyphon headless MCP server started');

    app.on('before-quit', () => {
      logger.info('Polyphon headless shutting down');
      voiceManager.disposeAll();
    });
    app.on('will-quit', () => {
      closeDb();
    });
    return;
  }

  // GUI mode startup (including optional MCP server)

  // Install CSP once, before any window is created, so the policy is in place
  // before the renderer loads any content.
  installCsp();

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

  // Register DB passphrase value for log redaction (derived from password-wrap).
  const dbPassword = process.env.POLYPHON_DB_PASSWORD ?? '';
  if (dbPassword) addSensitiveValue(dbPassword);

  const keyHex = key.toString('hex');
  const db = getDb(keyHex);
  const voiceManager = new VoiceManager(db);
  const sessionManager = new SessionManager(voiceManager);

  // MCP controller for GUI mode (optional)
  const mcpEnabled = getBooleanSetting(db, APP_SETTING_KEYS.MCP_ENABLED, false);
  const shouldStartMcp = isMcpServer || mcpEnabled;

  const mcpController = createMcpController({
    db,
    voiceManager,
    sessionManager,
    enabled: mcpEnabled,
    headless: false,
    onStatusChanged: (status) => {
      const wins = BrowserWindow.getAllWindows();
      for (const w of wins) {
        w.webContents.send(IPC.MCP_STATUS_CHANGED, status);
      }
    },
  });

  const encCtx: EncryptionContext = { userDataPath, dbKey: key, e2e };
  registerIpcHandlers(db, voiceManager, sessionManager, encCtx, mcpController);
  const win = createWindow();
  logger.info('Main window created');
  setupAutoUpdater(db, win);

  if (shouldStartMcp) {
    await mcpController.start();
    logger.info('MCP server started in GUI mode');
  }

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
