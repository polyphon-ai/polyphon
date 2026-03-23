import { ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import type Database from 'better-sqlite3';
import { IPC, APP_SETTING_KEYS } from '../../shared/constants';
import { getBooleanSetting, setBooleanSetting } from '../db/queries/appSettings';
import type { McpServerController } from '../mcp/server';
import { logger } from '../utils/logger';

export function registerMcpHandlers(
  db: Database.Database,
  mcpController: McpServerController,
  win: BrowserWindow | null,
): void {
  ipcMain.handle(IPC.MCP_GET_STATUS, () => {
    return mcpController.getStatus();
  });

  ipcMain.handle(IPC.MCP_SET_ENABLED, async (_event, enabled: unknown) => {
    if (typeof enabled !== 'boolean') {
      logger.warn('[mcp] MCP_SET_ENABLED: invalid argument', { enabled });
      return;
    }
    setBooleanSetting(db, APP_SETTING_KEYS.MCP_ENABLED, enabled);
    mcpController.setEnabled(enabled);

    if (enabled) {
      await mcpController.start();
    } else {
      await mcpController.stop();
    }

    const status = mcpController.getStatus();
    win?.webContents.send(IPC.MCP_STATUS_CHANGED, status);
    return status;
  });
}
