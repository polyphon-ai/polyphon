import type { Message } from '../../shared/types';

// The central abstraction — every voice provider implements this interface.
// The orchestration layer (SessionManager) never knows whether it is talking
// to an API or a CLI subprocess.
export interface Voice {
  readonly id: string;
  readonly name: string;
  readonly type: 'api' | 'cli';
  readonly provider: string; // e.g. "anthropic", "openai", "copilot"
  readonly color: string;
  readonly avatarIcon: string;
  readonly toneOverride?: string; // tone ID (preset key or UUID); overrides conductor default_tone when set

  send(message: Message, context: Message[]): AsyncIterable<string>;
  isAvailable(): Promise<boolean>;
  abort(): void;
  setEnsembleSystemPrompt(prompt: string): void;
}

// Configuration passed to a provider's factory function
export interface VoiceConfig {
  id: string;
  displayName: string;
  color: string;
  avatarIcon: string;
  systemPrompt?: string;
  toneOverride?: string;
  // API voices
  model?: string;
  // CLI voices
  cliCommand?: string;
  cliArgs?: string[];
  workingDir?: string | null;
  // OpenAI-compatible custom providers
  baseUrl?: string;
  apiKeyEnvVar?: string | null;
  // Filesystem tools (API voices only; CLI voices ignore this)
  enabledTools?: string[];
  // CLI voices: skip confirmation prompts and sandbox restrictions
  yoloMode?: boolean;
}

// A provider registration — one per provider file in providers/
export interface VoiceProviderRegistration {
  readonly provider: string;
  readonly type: 'api' | 'cli';
  create(config: VoiceConfig): Voice;
}
