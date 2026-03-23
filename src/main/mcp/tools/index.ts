import type Database from 'better-sqlite3';
import type { VoiceManager } from '../../managers/VoiceManager';
import type { SessionManager } from '../../managers/SessionManager';
import { buildListCompositionsTool } from './listCompositions';
import { buildCreateSessionTool } from './createSession';
import { buildBroadcastTool } from './broadcast';
import { buildAskTool } from './ask';
import { buildGetHistoryTool } from './getHistory';

export interface McpToolDeps {
  db: Database.Database;
  voiceManager: VoiceManager;
  sessionManager: SessionManager;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type McpToolHandler = (input: any) => Promise<unknown>;

export interface McpTool {
  name: string;
  description: string;
  inputSchema: object;
  handler: McpToolHandler;
}

export function buildMcpTools(deps: McpToolDeps): McpTool[] {
  const { db, voiceManager, sessionManager } = deps;

  return [
    {
      name: 'polyphon_list_compositions',
      description: 'List all available (non-archived) compositions with their voices.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
      handler: buildListCompositionsTool(db),
    },
    {
      name: 'polyphon_create_session',
      description: 'Create a new session from a composition.',
      inputSchema: {
        type: 'object',
        properties: {
          compositionId: { type: 'string', description: 'UUID of the composition' },
          name: { type: 'string', description: 'Optional session name' },
          workingDir: { type: 'string', description: 'Optional absolute path to a working directory' },
          sandboxedToWorkingDir: { type: 'boolean', description: 'If true, file operations are restricted to workingDir' },
        },
        required: ['compositionId'],
      },
      handler: buildCreateSessionTool(db, voiceManager),
    },
    {
      name: 'polyphon_broadcast',
      description: 'Send a message to all voices in a session and return their responses.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'UUID of the session' },
          content: { type: 'string', description: 'Message content to broadcast' },
        },
        required: ['sessionId', 'content'],
      },
      handler: buildBroadcastTool(db, voiceManager, sessionManager),
    },
    {
      name: 'polyphon_ask',
      description: 'Send a message to a specific named voice in a session and return its response.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'UUID of the session' },
          content: { type: 'string', description: 'Message content' },
          voiceName: { type: 'string', description: 'Display name of the voice to address' },
        },
        required: ['sessionId', 'content', 'voiceName'],
      },
      handler: buildAskTool(db, voiceManager, sessionManager),
    },
    {
      name: 'polyphon_get_history',
      description: 'Get the conversation history for a session.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'UUID of the session' },
          limit: { type: 'integer', description: 'Optional maximum number of messages to return (most recent first)' },
        },
        required: ['sessionId'],
      },
      handler: buildGetHistoryTool(db),
    },
  ];
}
