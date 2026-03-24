import { ipcMain, BrowserWindow } from 'electron';
import type Database from 'better-sqlite3';
import { IPC, APP_SETTING_KEYS, DEFAULT_API_PORT } from '../../shared/constants';
import { getBooleanSetting, setBooleanSetting } from '../db/queries/appSettings';
import type { ApiServerController } from '../api/server';
import { logger } from '../utils/logger';

export function registerApiHandlers(
  db: Database.Database,
  apiController: ApiServerController,
  win: BrowserWindow | null,
): void {
  ipcMain.handle(IPC.API_GET_STATUS, () => {
    return apiController.getStatus();
  });

  ipcMain.handle(IPC.API_GET_TOKEN, () => {
    return apiController.getToken();
  });

  ipcMain.handle(IPC.API_SET_ENABLED, async (_event, enabled: unknown) => {
    if (typeof enabled !== 'boolean') {
      logger.warn('[api] API_SET_ENABLED: invalid argument', { enabled });
      return apiController.getStatus();
    }
    setBooleanSetting(db, APP_SETTING_KEYS.API_ENABLED, enabled);
    apiController.setEnabled(enabled);

    if (enabled) {
      await apiController.start();
    } else {
      await apiController.stop();
    }

    const status = apiController.getStatus();
    win?.webContents.send(IPC.API_STATUS_CHANGED, status);
    return status;
  });

  ipcMain.handle(IPC.API_SET_REMOTE_ACCESS, async (_event, remoteAccess: unknown) => {
    if (typeof remoteAccess !== 'boolean') {
      logger.warn('[api] API_SET_REMOTE_ACCESS: invalid argument', { remoteAccess });
      return apiController.getStatus();
    }
    setBooleanSetting(db, APP_SETTING_KEYS.API_REMOTE_ACCESS_ENABLED, remoteAccess);

    const port = parseInt(process.env.POLYPHON_API_PORT ?? '', 10) || DEFAULT_API_PORT;
    const host = remoteAccess ? '0.0.0.0' : '127.0.0.1';
    apiController.setRemoteAccessEnabled(remoteAccess);
    apiController.updateHostPort(host, port);

    const wasRunning = apiController.getStatus().running;
    if (wasRunning) {
      await apiController.restart();
    }

    const status = apiController.getStatus();
    win?.webContents.send(IPC.API_STATUS_CHANGED, status);
    return status;
  });

  ipcMain.handle(IPC.API_ROTATE_TOKEN, async () => {
    await apiController.rotateToken();
    const status = apiController.getStatus();
    win?.webContents.send(IPC.API_STATUS_CHANGED, status);
    return status;
  });
}
