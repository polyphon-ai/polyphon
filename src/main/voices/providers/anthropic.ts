import type { Message } from '../../../shared/types';
import { APIVoice } from '../APIVoice';
import { CLIVoice } from '../CLIVoice';
import type { VoiceConfig, VoiceProviderRegistration } from '../Voice';
import { PROVIDER_NAMES } from '../../../shared/constants';
import { resolveApiKey } from '../../utils/env';

type ApiMessage = { role: 'user' | 'assistant'; content: string };

function buildMessages(voiceId: string, context: Message[]): ApiMessage[] {
  const raw: ApiMessage[] = context
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
  const merged: ApiMessage[] = [];
  for (const msg of raw) {
    const last = merged[merged.length - 1];
    if (last && last.role === msg.role) {
      last.content += '\n' + msg.content;
    } else {
      merged.push({ ...msg });
    }
  }

  return merged;
}

class AnthropicVoice extends APIVoice {
  readonly provider = PROVIDER_NAMES.ANTHROPIC;

  constructor(config: VoiceConfig) {
    super({ ...config, defaultModel: 'claude-opus-4-6' });
  }

  async *send(_message: Message, context: Message[]): AsyncIterable<string> {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const apiKey = resolveApiKey('anthropic');
    const client = new Anthropic({ apiKey });
    const messages = buildMessages(this.id, context);
    const systemPrompt = this.buildSystemPrompt();

    this.abortController = new AbortController();
    const stream = client.messages.stream(
      {
        model: this.model,
        max_tokens: 4096,
        ...(systemPrompt ? { system: systemPrompt } : {}),
        messages,
      },
      { signal: this.abortController.signal },
    );

    try {
      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          yield event.delta.text;
        }
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

class AnthropicCLIVoice extends CLIVoice {
  readonly provider = PROVIDER_NAMES.ANTHROPIC;

  constructor(config: VoiceConfig) {
    super({ ...config, defaultCommand: 'claude' });
  }

  async *send(_message: Message, context: Message[]): AsyncIterable<string> {
    yield* this.spawnAndStream(this.buildPrompt(context), ['--print']);
  }
}

export const anthropicProvider: VoiceProviderRegistration = {
  provider: PROVIDER_NAMES.ANTHROPIC,
  type: 'api',
  create: (config: VoiceConfig) =>
    config.cliCommand ? new AnthropicCLIVoice(config) : new AnthropicVoice(config),
};
