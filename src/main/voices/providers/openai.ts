import { spawnSync } from 'child_process';
import type { Message } from '../../../shared/types';
import { APIVoice } from '../APIVoice';
import { CLIVoice } from '../CLIVoice';
import type { VoiceConfig, VoiceProviderRegistration } from '../Voice';
import { PROVIDER_NAMES } from '../../../shared/constants';
import { resolveApiKey } from '../../utils/env';
import { buildOpenAIMessages } from '../buildMessages';

class OpenAIVoice extends APIVoice {
  readonly provider = PROVIDER_NAMES.OPENAI;

  constructor(config: VoiceConfig) {
    super({ ...config, defaultModel: 'gpt-4o' });
  }

  async *send(_message: Message, context: Message[]): AsyncIterable<string> {
    const { default: OpenAI } = await import('openai');
    const apiKey = resolveApiKey('openai');
    const client = new OpenAI({ apiKey });
    const systemPrompt = this.buildSystemPrompt();
    const messages = buildOpenAIMessages(this.id, context, systemPrompt);

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
}

class CodexVoice extends CLIVoice {
  readonly provider = PROVIDER_NAMES.OPENAI;

  constructor(config: VoiceConfig) {
    super({ ...config, defaultCommand: 'codex' });
  }

  async *send(_message: Message, context: Message[]): AsyncIterable<string> {
    // `codex exec -` reads the prompt from stdin and runs non-interactively
    yield* this.spawnAndStream(this.buildPrompt(context), ['exec', '-']);
  }

  async isAvailable(): Promise<boolean> {
    // codex may exit non-zero for --version; treat as success if any output was produced
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
