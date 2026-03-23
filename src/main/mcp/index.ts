import type Database from 'better-sqlite3';
import type { VoiceManager } from '../managers/VoiceManager';
import type { SessionManager } from '../managers/SessionManager';
import type { McpStatus } from '../../shared/types';
import { McpServerController } from './server';
import { buildMcpTools } from './tools/index';

export type { McpStatus };

export interface McpStartOptions {
  db: Database.Database;
  voiceManager: VoiceManager;
  sessionManager: SessionManager;
  enabled: boolean;
  headless: boolean;
  onStatusChanged?: (status: McpStatus) => void;
  onClose?: () => void;
}

export function createMcpController(options: McpStartOptions): McpServerController {
  const tools = buildMcpTools({
    db: options.db,
    voiceManager: options.voiceManager,
    sessionManager: options.sessionManager,
  });

  return new McpServerController(tools, options.enabled, options.headless, {
    onStatusChanged: options.onStatusChanged,
    onClose: options.onClose,
  });
}
