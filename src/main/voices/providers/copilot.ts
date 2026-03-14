import { spawn, spawnSync } from 'child_process';
import type { Message } from '../../../shared/types';
import { CLIVoice } from '../CLIVoice';
import type { VoiceConfig, VoiceProviderRegistration } from '../Voice';
import { PROVIDER_NAMES } from '../../../shared/constants';

function buildPrompt(context: Message[], systemPrompt: string): string {
  const parts: string[] = [];

  if (systemPrompt) {
    parts.push(systemPrompt);
    parts.push('');
  }

  for (const msg of context) {
    if (msg.role === 'conductor') {
      const content = msg.content.trim() || 'Please continue.';
      parts.push(`User: ${content}`);
    } else {
      const speaker = msg.voiceName ?? 'Assistant';
      parts.push(`${speaker}: ${msg.content}`);
    }
  }

  return parts.join('\n');
}

class CopilotVoice extends CLIVoice {
  readonly provider = PROVIDER_NAMES.COPILOT;

  constructor(config: VoiceConfig) {
    super({ ...config, defaultCommand: 'copilot' });
  }

  async *send(_message: Message, context: Message[]): AsyncIterable<string> {
    const systemPrompt = this.buildSystemPrompt();
    const prompt = buildPrompt(context, systemPrompt);

    // copilot uses -p/--prompt for non-interactive mode; --allow-all-tools
    // prevents tool-confirmation prompts from blocking the process.
    const proc = spawn(
      this.cliCommand,
      [...this.cliArgs, '-p', prompt, '--allow-all-tools'],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    this.setActiveProcess(proc);

    try {
      let buffer = '';
      for await (const chunk of proc.stdout) {
        buffer += (chunk as Buffer).toString('utf8');
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (line) yield line + '\n';
        }
      }
      if (buffer) yield buffer;
    } finally {
      this.clearActiveProcess();
    }
  }

  async isAvailable(): Promise<boolean> {
    const result = spawnSync(this.cliCommand, ['--version'], {
      timeout: 3000,
      encoding: 'utf8',
    });
    return !result.error && result.status === 0;
  }
}

export const copilotProvider: VoiceProviderRegistration = {
  provider: PROVIDER_NAMES.COPILOT,
  type: 'cli',
  create: (config: VoiceConfig) => new CopilotVoice(config),
};
