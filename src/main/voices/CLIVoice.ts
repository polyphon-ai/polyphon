import type { ChildProcess } from 'child_process';
import type { Message } from '../../shared/types';
import type { Voice, VoiceConfig } from './Voice';

// Base class for all CLI-backed voices (claude, codex, gemini, etc.).
// Spawns a subprocess and streams stdout back as tokens.
export abstract class CLIVoice implements Voice {
  readonly id: string;
  readonly name: string;
  readonly type = 'cli' as const;
  abstract readonly provider: string;
  readonly color: string;
  readonly avatarIcon: string;
  readonly toneOverride: string | undefined;
  protected readonly cliCommand: string;
  protected readonly cliArgs: string[];
  protected readonly systemPrompt: string | undefined;
  protected ensembleSystemPrompt = '';

  private activeProcess: ChildProcess | null = null;

  constructor(config: VoiceConfig & { defaultCommand: string }) {
    this.id = config.id;
    this.name = config.displayName;
    this.color = config.color;
    this.avatarIcon = config.avatarIcon;
    this.toneOverride = config.toneOverride;
    this.cliCommand = config.cliCommand ?? config.defaultCommand;
    this.cliArgs = config.cliArgs ?? [];
    this.systemPrompt = config.systemPrompt;
  }

  abstract send(message: Message, context: Message[]): AsyncIterable<string>;
  abstract isAvailable(): Promise<boolean>;

  abort(): void {
    if (this.activeProcess) {
      this.activeProcess.kill();
      this.activeProcess = null;
    }
  }

  setEnsembleSystemPrompt(prompt: string): void {
    this.ensembleSystemPrompt = prompt;
  }

  protected buildSystemPrompt(): string {
    return [this.ensembleSystemPrompt, this.systemPrompt].filter(Boolean).join('\n\n');
  }

  protected setActiveProcess(proc: ChildProcess): void {
    this.activeProcess = proc;
  }

  protected clearActiveProcess(): void {
    this.activeProcess = null;
  }
}
