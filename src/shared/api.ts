// JSON-RPC 2.0 envelope types and all TCP API method request/response shapes.
// These types are importable by the poly CLI (duplicated into packages/poly/src/types.ts).

// ---- JSON-RPC envelope ----

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
  error?: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

// Streaming notification (no id — not a request/response)
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

// ---- Error codes ----

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

// ---- Method parameter + result shapes ----

// api.authenticate
export interface AuthenticateParams {
  token: string;
}
export interface AuthenticateResult {
  ok: boolean;
}

// api.getStatus
export type ApiGetStatusResult = import('./types').ApiStatus;

// compositions.list
export interface CompositionsListParams {
  archived?: boolean;
}

// compositions.get
export interface CompositionsGetParams {
  id: string;
}

// compositions.create — data shape mirrors Composition minus generated fields
export interface CompositionsCreateParams {
  name: string;
  mode: 'conductor' | 'broadcast';
  continuationPolicy: 'none' | 'prompt' | 'auto';
  continuationMaxRounds: number;
  voices: Array<{
    provider: string;
    model?: string;
    cliCommand?: string;
    cliArgs?: string[];
    displayName: string;
    systemPrompt?: string;
    toneOverride?: string;
    systemPromptTemplateId?: string;
    order: number;
    color: string;
    avatarIcon: string;
    customProviderId?: string;
    enabledTools?: string[];
  }>;
}

// compositions.update
export interface CompositionsUpdateParams {
  id: string;
  data: Partial<CompositionsCreateParams>;
}

// compositions.delete
export interface CompositionsDeleteParams {
  id: string;
}

// compositions.archive
export interface CompositionsArchiveParams {
  id: string;
  archived: boolean;
}

// sessions.list
export interface SessionsListParams {
  archived?: boolean;
}

// sessions.get
export interface SessionsGetParams {
  id: string;
}

// sessions.create
export interface SessionsCreateParams {
  compositionId: string;
  source: string;
  name?: string;
  workingDir?: string | null;
  sandboxedToWorkingDir?: boolean;
}

// sessions.delete
export interface SessionsDeleteParams {
  id: string;
}

// sessions.rename
export interface SessionsRenameParams {
  id: string;
  name: string;
}

// sessions.archive
export interface SessionsArchiveParams {
  id: string;
  archived: boolean;
}

// sessions.messages
export interface SessionsMessagesParams {
  sessionId: string;
}

// sessions.export
export interface SessionsExportParams {
  sessionId: string;
  format: 'markdown' | 'json' | 'plaintext';
}
export interface SessionsExportResult {
  content: string;
  format: string;
}

// voice.broadcast
export interface VoiceBroadcastParams {
  sessionId: string;
  content: string;
  stream?: boolean;
}
export interface VoiceBroadcastResult {
  messages: import('./types').Message[];
}

// voice.ask
export interface VoiceAskParams {
  sessionId: string;
  voiceId: string;
  content: string;
  stream?: boolean;
}
export interface VoiceAskResult {
  message: import('./types').Message;
}

// voice.abort
export interface VoiceAbortParams {
  sessionId: string;
}
export interface VoiceAbortResult {
  aborted: boolean;
}

// search.messages
export interface SearchMessagesParams {
  query: string;
  sessionId?: string;
}
export type SearchMessagesResult = import('./types').SearchResult[];

// settings.getProviderStatus
// Extends ProviderStatus with CLI availability, resolved at request time.
export type SettingsProviderStatus = import('./types').ProviderStatus & {
  cliStatus: import('./types').CliStatus | null;
};
export type SettingsGetProviderStatusResult = SettingsProviderStatus[];

// settings.getDebugInfo
export type SettingsGetDebugInfoResult = import('./types').DebugInfo;

// settings.getUserProfile
export interface SettingsGetUserProfileResult {
  conductorName: string;
  conductorColor: string;
  conductorAvatar: string;
  pronouns: string;
}

// mcp.getStatus
export type McpGetStatusResult = import('./types').McpStatus;

// mcp.setEnabled
export interface McpSetEnabledParams {
  enabled: boolean;
}
export type McpSetEnabledResult = import('./types').McpStatus;

// api.getSpec
export interface OpenRpcSpec {
  openrpc: string;
  info: { title: string; version: string; description: string };
  servers: Array<{ name: string; url: string; description?: string }>;
  methods: Array<{
    name: string;
    summary: string;
    description: string;
    params: Array<{ name: string; description: string; required: boolean; schema: Record<string, unknown> }>;
    result: { name: string; description?: string; schema: Record<string, unknown> };
  }>;
  components: { schemas: Record<string, unknown> };
}
export type ApiGetSpecResult = OpenRpcSpec;
