// Duplicated from src/shared/api.ts and src/shared/types.ts — poly must not import from src/

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse<T = unknown> {
  jsonrpc: '2.0';
  id: number | string;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}

export interface StreamChunkNotification {
  jsonrpc: '2.0';
  method: 'stream.chunk';
  params: {
    requestId: number | string;
    voiceId: string;
    voiceName: string;
    delta: string;
  };
}

export interface ApiStatus {
  enabled: boolean;
  remoteAccessEnabled: boolean;
  running: boolean;
  port: number;
  host: string;
  tokenFingerprint: string;
  version: string;
  startupError?: string;
}

export interface Composition {
  id: string;
  name: string;
  mode: 'conductor' | 'broadcast';
  continuationPolicy: 'none' | 'prompt' | 'auto';
  continuationMaxRounds: number;
  voices: CompositionVoice[];
  createdAt: number;
  updatedAt: number;
  archived: boolean;
}

export interface CompositionVoice {
  id: string;
  compositionId: string;
  provider: string;
  model?: string;
  displayName: string;
  order: number;
  color: string;
  avatarIcon: string;
  enabledTools?: string[];
}

export interface Session {
  id: string;
  compositionId: string;
  name: string;
  mode: 'conductor' | 'broadcast';
  continuationPolicy: 'none' | 'prompt' | 'auto';
  continuationMaxRounds: number;
  createdAt: number;
  updatedAt: number;
  archived: boolean;
  workingDir: string | null;
  sandboxedToWorkingDir: boolean;
}

export interface Message {
  id: string;
  sessionId: string;
  role: 'conductor' | 'voice' | 'system';
  voiceId: string | null;
  voiceName: string | null;
  content: string;
  timestamp: number;
  roundIndex: number;
}

export interface ProviderStatus {
  provider: string;
  apiKeyStatus: {
    status: 'specific' | 'fallback' | 'none';
    varName?: string;
    maskedKey?: string;
  };
}

export interface McpStatus {
  enabled: boolean;
  running: boolean;
  headless: boolean;
  transport: 'stdio';
}

export interface SearchResult {
  messageId: string;
  sessionId: string;
  sessionName: string;
  role: 'conductor' | 'voice' | 'system';
  voiceName: string | null;
  snippet: string;
  timestamp: number;
  archived: boolean;
}

export type ApiGetSpecResult = Record<string, unknown>;

export const RPC_ERROR = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  UNAUTHORIZED: -32001,
  NOT_FOUND: -32002,
  PORT_CONFLICT: -32003,
} as const;
