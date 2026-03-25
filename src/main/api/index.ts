import path from 'node:path';
import { app } from 'electron';
import type Database from 'better-sqlite3';
import type { VoiceManager } from '../managers/VoiceManager';
import type { SessionManager } from '../managers/SessionManager';
import type { McpServerController } from '../mcp/server';
import type { ApiStatus } from '../../shared/types';
import { DEFAULT_API_PORT, APP_SETTING_KEYS } from '../../shared/constants';
import { getBooleanSetting } from '../db/queries/appSettings';
import { ApiServerController } from './server';
import { getLocalTokenPath } from './auth';
import { buildApiHandlers } from './handlers/api';
import { buildCompositionHandlers } from './handlers/compositions';
import { buildSessionHandlers } from './handlers/sessions';
import { buildVoiceHandlers } from './handlers/voice';
import { buildSearchHandlers } from './handlers/search';
import { buildSettingsHandlers } from './handlers/settings';
import { buildMcpHandlers } from './handlers/mcp';

export type { ApiStatus };

export interface ApiStartOptions {
  db: Database.Database;
  voiceManager: VoiceManager;
  sessionManager: SessionManager;
  mcpController: McpServerController | null;
  userDataPath: string;
  appVersion: string;
  onStatusChanged?: (status: ApiStatus) => void;
}

export function createApiController(options: ApiStartOptions): ApiServerController {
  const { db, voiceManager, sessionManager, mcpController, userDataPath, appVersion } = options;

  const remoteAccessEnabled = getBooleanSetting(db, APP_SETTING_KEYS.API_REMOTE_ACCESS_ENABLED, false);
  const host = remoteAccessEnabled ? '0.0.0.0' : '127.0.0.1';
  const port = parseInt(process.env.POLYPHON_API_PORT ?? '', 10) || DEFAULT_API_PORT;
  const tokenPath = getLocalTokenPath(userDataPath);

  const controller = new ApiServerController({
    port,
    host,
    tokenPath,
    appVersion,
    onStatusChanged: options.onStatusChanged,
  });

  controller.setRemoteAccessEnabled(remoteAccessEnabled);

  const dispatchTable = {
    ...buildApiHandlers(() => controller.getStatus(), appVersion),
    ...buildCompositionHandlers(db),
    ...buildSessionHandlers(db, voiceManager),
    ...buildVoiceHandlers(db, voiceManager, sessionManager),
    ...buildSearchHandlers(db),
    ...buildSettingsHandlers(),
    ...buildMcpHandlers(db, mcpController),
  };

  controller.setDispatchTable(dispatchTable);
  return controller;
}
