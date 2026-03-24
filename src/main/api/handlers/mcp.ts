import type Database from 'better-sqlite3';
import type { HandlerFn } from '../dispatcher';
import type { McpServerController } from '../../mcp/server';
import { APP_SETTING_KEYS } from '../../../shared/constants';
import { setBooleanSetting } from '../../db/queries/appSettings';
import { logger } from '../../utils/logger';

export function buildMcpHandlers(
  db: Database.Database,
  mcpController: McpServerController | null,
): Record<string, HandlerFn> {
  return {
    'mcp.getStatus': async () => {
      if (!mcpController) return { enabled: false, running: false, headless: false, transport: 'stdio' };
      return mcpController.getStatus();
    },

    'mcp.setEnabled': async (params) => {
      const enabled = params?.enabled === true;
      if (!mcpController) return { enabled: false, running: false, headless: false, transport: 'stdio' };
      setBooleanSetting(db, APP_SETTING_KEYS.MCP_ENABLED, enabled);
      mcpController.setEnabled(enabled);
      if (enabled) {
        await mcpController.start();
      } else {
        await mcpController.stop();
      }
      logger.info('[api] mcp.setEnabled', { enabled });
      return mcpController.getStatus();
    },
  };
}
