import type { Message } from '../../shared/types';
import type { Voice, VoiceConfig } from './Voice';

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
  abstract isAvailable(): Promise<boolean>;

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
