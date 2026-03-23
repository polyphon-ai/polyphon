// Core domain types shared between main and renderer processes.
// These are plain serializable data shapes — no class instances cross the IPC boundary.

export type TonePreset =
  | 'professional'
  | 'collaborative'
  | 'concise'
  | 'exploratory'
  | 'teaching';

export interface ToneDefinition {
  id: string;
  name: string;
  description: string;
  isBuiltin: boolean;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface SystemPromptTemplate {
  id: string;
  name: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface UserProfile {
  conductorName: string; // how voices address the user
  pronouns: string; // preferred pronouns (e.g. "she/her", "they/them")
  conductorContext: string; // free-form personal background textarea
  defaultTone: string; // tone ID (preset key or UUID)
  conductorColor: string; // hex color shown in conversation (empty = default gray)
  conductorAvatar: string; // base64 data URL of resized avatar image (empty = use icon)
  preferMarkdown: boolean; // inject "prefer markdown" instruction into ensemble system prompt
  updatedAt: number;
}

interface Voice {
  id: string;
  name: string;
  type: 'api' | 'cli';
  provider: string; // e.g. "anthropic", "openai", "copilot"
  color: string; // assigned per session for UI differentiation
  avatarIcon: string; // icon identifier for the UI

  send(message: Message, context: Message[]): AsyncIterable<string>;
  isAvailable(): Promise<boolean>;
  abort(): void;
}

export interface Message {
  id: string;
  sessionId: string;
  role: 'conductor' | 'voice' | 'system';
  voiceId: string | null; // null when role is "conductor"
  voiceName: string | null;
  content: string;
  timestamp: number;
  roundIndex: number; // which round this message belongs to
  metadata?: Record<string, unknown>;
}

export interface Composition {
  id: string;
  name: string;
  mode: 'conductor' | 'broadcast';
  continuationPolicy: 'none' | 'prompt' | 'auto';
  continuationMaxRounds: number; // 1–3, only relevant when policy is "auto"
  voices: CompositionVoice[]; // ordered array
  createdAt: number;
  updatedAt: number;
  archived: boolean;
}

export interface CompositionVoice {
  id: string;
  compositionId: string;
  provider: string;
  model?: string; // for API voices
  cliCommand?: string; // for CLI voices (e.g. "claude", "codex")
  cliArgs?: string[];
  displayName: string;
  systemPrompt?: string; // voice-specific prompt (merged with ensemble prefix)
  toneOverride?: string; // tone ID (preset key or UUID); overrides conductor's default_tone when set
  systemPromptTemplateId?: string; // references system_prompt_templates.id; overrides inline systemPrompt
  order: number; // position in broadcast round order
  color: string;
  avatarIcon: string;
  customProviderId?: string; // for 'openai-compat' provider voices
  enabledTools?: string[]; // tool names from AVAILABLE_TOOLS; API voices only
}

export interface CustomProvider {
  id: string;
  name: string;
  slug: string;
  baseUrl: string;
  apiKeyEnvVar: string | null;
  defaultModel: string | null;
  deleted: boolean;
  createdAt: number;
  updatedAt: number;
}

// Returned over IPC with resolved API key status
export interface CustomProviderWithStatus extends CustomProvider {
  apiKeyStatus: ApiKeyStatus | null; // null when apiKeyEnvVar is null/empty
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

// Settings — provider configuration persisted to SQLite
export interface ProviderConfig {
  id: string;
  provider: string;
  enabled: boolean;
  voiceType: 'api' | 'cli';
  defaultModel: string | null;
  cliCommand: string | null;
  cliArgs: string | null;
  yoloMode: boolean;
  createdAt: number;
  updatedAt: number;
}

// API key resolution result — masked in main process before crossing IPC
export type ApiKeyStatus =
  | { status: 'specific'; varName: string; maskedKey: string }
  | { status: 'fallback'; varName: string; maskedKey: string }
  | { status: 'none'; specificVar: string; fallbackVar: string };

// Full provider status sent to renderer
export interface ProviderStatus {
  provider: string;
  apiKeyStatus: ApiKeyStatus;
}

// CLI voice test result
export interface CliTestResult {
  success: boolean;
  path?: string;
  error?: string;
}

// Model list fetch result
export interface ModelsResult {
  models: string[];
  error?: string;
}

export type UpdateChannel = 'stable' | 'preview';

export interface UpdateInfo {
  version: string;
}

export interface UpdateDownloadProgress {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}

export interface EncryptionStatus {
  mode: 'none' | 'password' | 'e2e-test';
  passwordSet: boolean;
}

export interface DebugInfo {
  appVersion: string;
  schemaVersion: number;
  platform: string;
  arch: string;
}

// Serializable voice descriptor — sent over IPC, not the full Voice instance
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

export interface VoiceDescriptor {
  id: string;
  name: string;
  type: 'api' | 'cli';
  provider: string;
  color: string;
  avatarIcon: string;
  side: 'left' | 'right'; // assigned at session load time; stays fixed for the session
}
