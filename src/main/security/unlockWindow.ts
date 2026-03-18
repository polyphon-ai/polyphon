import { BrowserWindow, ipcMain, app } from 'electron';
import path from 'node:path';
import { IPC } from '../../shared/constants';
import { unwrapWithPassword, type KeyFilePassword } from './keyManager';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

export function createUnlockWindow(keyFile: KeyFilePassword): { window: BrowserWindow; unlockPromise: Promise<Buffer> } {
  const win = new BrowserWindow({
    width: 400,
    height: 300,
    resizable: false,
    center: true,
    frame: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });

  const unlockUrl = (() => {
    if (typeof MAIN_WINDOW_VITE_DEV_SERVER_URL !== 'undefined' && MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      return `${MAIN_WINDOW_VITE_DEV_SERVER_URL}?view=unlock`;
    }
    return `file://${path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)}?view=unlock`;
  })();

  win.loadURL(unlockUrl);

  const unlockPromise = new Promise<Buffer>((resolve) => {
    ipcMain.handle(IPC.ENCRYPTION_UNLOCK_ATTEMPT, (_event, password: string) => {
      try {
        const key = unwrapWithPassword(keyFile, password);
        // Remove handler before resolving so it's not called again
        ipcMain.removeHandler(IPC.ENCRYPTION_UNLOCK_ATTEMPT);
        resolve(key);
        return { ok: true };
      } catch {
        return { ok: false, error: 'Incorrect password' };
      }
    });
  });

  // Allow the user to quit from the unlock window
  win.on('close', () => {
    app.quit();
  });

  return { window: win, unlockPromise };
}
