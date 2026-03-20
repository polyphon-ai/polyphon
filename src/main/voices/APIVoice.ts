import type { Message } from '../../shared/types';
import type { Voice, VoiceConfig } from './Voice';
import { resolveApiKey } from '../utils/env';

// Base class for all API-backed voices (Anthropic, OpenAI, Gemini, etc.).
// Subclass per provider, or use the provider registration pattern instead.
export abstract class APIVoice implements Voice {
  readonly id: string;
  readonly name: string;
  readonly type = 'api' as const;
  abstract readonly provider: string;
  readonly color: string;
  readonly avatarIcon: string;
  readonly toneOverride: string | undefined;
  protected readonly model: string;
  protected readonly systemPrompt: string | undefined;
  protected ensembleSystemPrompt = '';
  protected abortController: AbortController | null = null;

  constructor(config: VoiceConfig & { defaultModel: string }) {
    this.id = config.id;
    this.name = config.displayName;
    this.color = config.color;
    this.avatarIcon = config.avatarIcon;
    this.toneOverride = config.toneOverride;
    this.model = config.model ?? config.defaultModel;
    this.systemPrompt = config.systemPrompt;
  }

  abstract send(message: Message, context: Message[]): AsyncIterable<string>;

  async isAvailable(): Promise<boolean> {
    try {
      resolveApiKey(this.provider);
      return true;
    } catch {
      return false;
    }
  }

  abort(): void {
    this.abortController?.abort();
    this.abortController = null;
  }

  setEnsembleSystemPrompt(prompt: string): void {
    this.ensembleSystemPrompt = prompt;
  }

  protected buildSystemPrompt(): string {
    return [this.ensembleSystemPrompt, this.systemPrompt].filter(Boolean).join('\n\n');
  }
}
