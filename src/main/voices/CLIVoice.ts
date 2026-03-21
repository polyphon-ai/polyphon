import { spawn, spawnSync, type ChildProcess } from 'child_process';
import type { Message } from '../../shared/types';
import type { Voice, VoiceConfig } from './Voice';
import { requireCliCommand } from '../ipc/validate';
import { logger } from '../utils/logger';

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
  protected workingDir: string | null;
  protected readonly systemPrompt: string | undefined;
  protected ensembleSystemPrompt = '';

  private activeProcess: ChildProcess | null = null;

  constructor(config: VoiceConfig & { defaultCommand: string }) {
    this.id = config.id;
    this.name = config.displayName;
    this.color = config.color;
    this.avatarIcon = config.avatarIcon;
    this.toneOverride = config.toneOverride;
    const cliCommand = config.cliCommand ?? config.defaultCommand;
    // CLI voices are intentionally user-configured to run local binaries. This
    // validation prevents shell metacharacter injection and path traversal —
    // it does not prevent execution of any binary on PATH by name, which is
    // by design and equivalent to the user running the command themselves.
    requireCliCommand(cliCommand, 'cliCommand');
    this.cliCommand = cliCommand;
    this.cliArgs = config.cliArgs ?? [];
    this.workingDir = config.workingDir ?? null;
    this.systemPrompt = config.systemPrompt;
  }

  abstract send(message: Message, context: Message[]): AsyncIterable<string>;

  async isAvailable(): Promise<boolean> {
    const result = spawnSync(this.cliCommand, ['--version'], { timeout: 3000, encoding: 'utf8' });
    return !result.error && result.status === 0;
  }

  abort(): void {
    if (this.activeProcess) {
      logger.debug('CLI voice aborting', { command: this.cliCommand, voiceId: this.id });
      this.activeProcess.kill();
      this.activeProcess = null;
    }
  }

  setEnsembleSystemPrompt(prompt: string): void {
    this.ensembleSystemPrompt = prompt;
  }

  setWorkingDir(dir: string | null): void {
    this.workingDir = dir;
  }

  protected buildSystemPrompt(): string {
    return [this.ensembleSystemPrompt, this.systemPrompt].filter(Boolean).join('\n\n');
  }

  protected buildPrompt(context: Message[]): string {
    const parts: string[] = [];
    const systemPrompt = this.buildSystemPrompt();
    if (systemPrompt) { parts.push(systemPrompt); parts.push(''); }
    for (const msg of context) {
      if (msg.role === 'conductor') {
        parts.push(`User: ${msg.content.trim() || 'Please continue.'}`);
      } else {
        parts.push(`${msg.voiceName ?? 'Assistant'}: ${msg.content}`);
      }
    }
    return parts.join('\n');
  }

  protected async *spawnAndStream(prompt: string, extraArgs: string[]): AsyncIterable<string> {
    logger.debug('CLI voice spawning', { command: this.cliCommand, voiceId: this.id, workingDir: this.workingDir });
    const proc = spawn(this.cliCommand, [...this.cliArgs, ...extraArgs], {
      stdio: ['pipe', 'pipe', 'pipe'],
      ...(this.workingDir ? { cwd: this.workingDir } : {}),
    });
    this.setActiveProcess(proc);
    try {
      proc.stdin.write(prompt);
      proc.stdin.end();
      let buffer = '';
      for await (const chunk of proc.stdout) {
        buffer += (chunk as Buffer).toString('utf8');
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) { if (line) yield line + '\n'; }
      }
      if (buffer) yield buffer;
      logger.debug('CLI voice process exited', { command: this.cliCommand, voiceId: this.id });
    } finally {
      this.clearActiveProcess();
    }
  }

  protected setActiveProcess(proc: ChildProcess): void {
    this.activeProcess = proc;
  }

  protected clearActiveProcess(): void {
    this.activeProcess = null;
  }
}
