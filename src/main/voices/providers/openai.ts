import OpenAI from 'openai';
import { spawn, spawnSync } from 'child_process';
import type { Message } from '../../../shared/types';
import { APIVoice } from '../APIVoice';
import { CLIVoice } from '../CLIVoice';
import type { VoiceConfig, VoiceProviderRegistration } from '../Voice';
import { PROVIDER_NAMES } from '../../../shared/constants';
import { resolveApiKey } from '../../utils/env';

type ApiMessage = { role: 'user' | 'assistant' | 'system'; content: string };

function buildMessages(voiceId: string, context: Message[], systemPrompt: string): ApiMessage[] {
  const result: ApiMessage[] = [];

  if (systemPrompt) {
    result.push({ role: 'system', content: systemPrompt });
  }

  const raw: { role: 'user' | 'assistant'; content: string }[] = context
    .filter((msg) => msg.content.trim() !== '' || msg.role === 'conductor')
    .map((msg) => {
      if (msg.role === 'conductor') {
        const content = msg.content.trim() || 'Please continue.';
        return { role: 'user' as const, content };
      }
      if (msg.voiceId === voiceId) {
        return { role: 'assistant' as const, content: msg.content };
      }
      return { role: 'user' as const, content: `[${msg.voiceName}]: ${msg.content}` };
    });

  // Merge consecutive same-role messages
  const merged: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const msg of raw) {
    const last = merged[merged.length - 1];
    if (last && last.role === msg.role) {
      last.content += '\n' + msg.content;
    } else {
      merged.push({ ...msg });
    }
  }

  result.push(...merged);
  return result;
}

class OpenAIVoice extends APIVoice {
  readonly provider = PROVIDER_NAMES.OPENAI;

  constructor(config: VoiceConfig) {
    super({ ...config, defaultModel: 'gpt-4o' });
  }

  async *send(_message: Message, context: Message[]): AsyncIterable<string> {
    const apiKey = resolveApiKey('openai');
    const client = new OpenAI({ apiKey });
    const systemPrompt = this.buildSystemPrompt();
    const messages = buildMessages(this.id, context, systemPrompt);

    this.abortController = new AbortController();
    const stream = client.chat.completions.stream(
      {
        model: this.model,
        messages,
      },
      { signal: this.abortController.signal },
    );

    try {
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) yield delta;
      }
    } catch (err) {
      if (err instanceof Error && (err.name === 'AbortError' || err.name === 'APIUserAbortError')) {
        return;
      }
      throw err;
    } finally {
      this.abortController = null;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      resolveApiKey('openai');
      return true;
    } catch {
      return false;
    }
  }
}

function buildPrompt(context: Message[], systemPrompt: string): string {
  const parts: string[] = [];
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

class CodexVoice extends CLIVoice {
  readonly provider = PROVIDER_NAMES.OPENAI;

  constructor(config: VoiceConfig) {
    super({ ...config, defaultCommand: 'codex' });
  }

  async *send(_message: Message, context: Message[]): AsyncIterable<string> {
    const prompt = buildPrompt(context, this.buildSystemPrompt());
    // `codex exec -` reads the prompt from stdin and runs non-interactively
    const proc = spawn(this.cliCommand, [...this.cliArgs, 'exec', '-'], {
      stdio: ['pipe', 'pipe', 'pipe'],
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
    } finally {
      this.clearActiveProcess();
    }
  }

  async isAvailable(): Promise<boolean> {
    const result = spawnSync(this.cliCommand, ['--version'], { timeout: 3000, encoding: 'utf8' });
    return !result.error && (result.status === 0 || !!(result.stdout || result.stderr));
  }
}

export const openaiProvider: VoiceProviderRegistration = {
  provider: PROVIDER_NAMES.OPENAI,
  type: 'api',
  create: (config: VoiceConfig) =>
    config.cliCommand ? new CodexVoice(config) : new OpenAIVoice(config),
};
