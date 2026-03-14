import type { TonePreset } from './types';

// Color palette for voices and the conductor — used in VoiceSelector and ConductorProfile
export const PRESET_COLORS = [
  '#6366f1', // indigo
  '#ec4899', // pink
  '#10b981', // green
  '#f59e0b', // amber
  '#3b82f6', // blue
  '#ef4444', // red
] as const;

export const PRESET_COLOR_NAMES: Record<string, string> = {
  '#6b7280': 'gray',
  '#6366f1': 'indigo',
  '#ec4899': 'pink',
  '#10b981': 'green',
  '#f59e0b': 'amber',
  '#3b82f6': 'blue',
  '#ef4444': 'red',
};

export const TONE_PRESETS: Record<TonePreset, { label: string; description: string }> = {
  professional: {
    label: 'Professional',
    description: 'Formal and precise. Cite sources where relevant. Minimal filler.',
  },
  collaborative: {
    label: 'Collaborative',
    description: 'Peer-to-peer tone. Think out loud. Push back respectfully when you disagree.',
  },
  concise: {
    label: 'Concise',
    description: 'Keep answers short unless asked for depth. No preamble or padding.',
  },
  exploratory: {
    label: 'Exploratory',
    description: 'Open-ended and curious. Tangents are welcome. Brainstorming mode.',
  },
  teaching: {
    label: 'Teaching',
    description: 'Explain your reasoning. I want to understand, not just get answers.',
  },
};

// IPC channel names — kebab-case, namespaced by domain
export const IPC = {
  SESSION_CREATE: 'session:create',
  SESSION_LIST: 'session:list',
  SESSION_GET: 'session:get',
  SESSION_DELETE: 'session:delete',

  VOICE_SEND: 'voice:send',
  VOICE_ABORT: 'voice:abort',
  VOICE_AVAILABLE: 'voice:available',

  // Streamed events (main → renderer)
  VOICE_PENDING: 'voice:pending', // suffixed with `:${sessionId}` at runtime — request dispatched, awaiting first token
  VOICE_TOKEN: 'voice:token', // suffixed with `:${sessionId}` at runtime
  VOICE_DONE: 'voice:done', // suffixed with `:${sessionId}` at runtime
  VOICE_ERROR: 'voice:error', // suffixed with `:${sessionId}` at runtime

  COMPOSITION_CREATE: 'composition:create',
  COMPOSITION_LIST: 'composition:list',
  COMPOSITION_GET: 'composition:get',
  COMPOSITION_UPDATE: 'composition:update',
  COMPOSITION_DELETE: 'composition:delete',
  COMPOSITION_ARCHIVE: 'composition:archive',

  SETTINGS_GET_PROVIDER_STATUS: 'settings:getProviderStatus',
  SETTINGS_TEST_CLI_VOICE: 'settings:testCliVoice',
  SETTINGS_SAVE_PROVIDER_CONFIG: 'settings:saveProviderConfig',
  SETTINGS_GET_PROVIDER_CONFIG: 'settings:getProviderConfig',
  SETTINGS_FETCH_MODELS: 'settings:fetchModels',
  SETTINGS_GET_USER_PROFILE: 'settings:getUserProfile',
  SETTINGS_SAVE_USER_PROFILE: 'settings:saveUserProfile',
  SETTINGS_UPLOAD_CONDUCTOR_AVATAR: 'settings:uploadConductorAvatar',
  SETTINGS_PICK_AVATAR_FILE: 'settings:pickAvatarFile',

  SETTINGS_CUSTOM_PROVIDER_LIST: 'settings:customProvider:list',
  SETTINGS_CUSTOM_PROVIDER_CREATE: 'settings:customProvider:create',
  SETTINGS_CUSTOM_PROVIDER_UPDATE: 'settings:customProvider:update',
  SETTINGS_CUSTOM_PROVIDER_DELETE: 'settings:customProvider:delete',
  SETTINGS_CUSTOM_PROVIDER_FETCH_MODELS: 'settings:customProvider:fetchModels',

  SETTINGS_TONE_LIST: 'settings:tone:list',
  SETTINGS_TONE_CREATE: 'settings:tone:create',
  SETTINGS_TONE_UPDATE: 'settings:tone:update',
  SETTINGS_TONE_DELETE: 'settings:tone:delete',

  SETTINGS_SYSTEM_PROMPT_TEMPLATE_LIST: 'settings:systemPromptTemplate:list',
  SETTINGS_SYSTEM_PROMPT_TEMPLATE_CREATE: 'settings:systemPromptTemplate:create',
  SETTINGS_SYSTEM_PROMPT_TEMPLATE_UPDATE: 'settings:systemPromptTemplate:update',
  SETTINGS_SYSTEM_PROMPT_TEMPLATE_DELETE: 'settings:systemPromptTemplate:delete',

  SETTINGS_PROBE_MODEL: 'settings:probeModel',

  SESSION_RENAME: 'session:rename',
  SESSION_ARCHIVE: 'session:archive',

  SESSION_CONTINUATION_PROMPT: 'session:continuation-prompt',
  SESSION_NO_TARGET: 'session:no-target', // suffixed with `:${sessionId}` at runtime
  SESSION_MESSAGES_LIST: 'session:messages:list',

  EXPIRY_CHECK: 'expiry:check',
  SHELL_OPEN_EXTERNAL: 'shell:openExternal',
} as const;

export const CONTINUATION_MAX_ROUNDS_LIMIT = 3;

export const PROVIDER_NAMES = {
  ANTHROPIC: 'anthropic',
  OPENAI: 'openai',
  GEMINI: 'gemini',
  CLAUDE_CODE: 'claude-code',
  GEMINI_CLI: 'gemini-cli',
  COPILOT: 'copilot',
  OPENAI_COMPAT: 'openai-compat',
} as const;

export type VoiceType = 'api' | 'cli';

export interface ProviderMetadata {
  name: string;
  supportedTypes: ReadonlyArray<VoiceType>;
  defaultModels: ReadonlyArray<string>;
  defaultCliCommand: string | null;
  defaultVoiceType: VoiceType;
  color: string;
}

export const PROVIDER_METADATA: Readonly<Record<string, ProviderMetadata>> = {
  anthropic: {
    name: 'Anthropic',
    supportedTypes: ['api', 'cli'],
    defaultModels: ['claude-sonnet-4-5', 'claude-opus-4-6', 'claude-haiku-4-5-20251001'],
    defaultCliCommand: 'claude',
    defaultVoiceType: 'api',
    color: '#D4763B',
  },
  openai: {
    name: 'OpenAI',
    supportedTypes: ['api', 'cli'],
    defaultModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1-nano', 'gpt-4-turbo'],
    defaultCliCommand: 'codex',
    defaultVoiceType: 'api',
    color: '#10A37F',
  },
  gemini: {
    name: 'Gemini',
    supportedTypes: ['api'],
    defaultModels: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro'],
    defaultCliCommand: null,
    defaultVoiceType: 'api',
    color: '#4285F4',
  },
  copilot: {
    name: 'Copilot',
    supportedTypes: ['cli'],
    defaultModels: [],
    defaultCliCommand: 'copilot',
    defaultVoiceType: 'cli',
    color: '#0969DA',
  },
} as const;

// Ordered list of providers shown in Settings
export const SETTINGS_PROVIDERS = ['anthropic', 'openai', 'gemini', 'copilot'] as const;
