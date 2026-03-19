import type { Message } from '../../../shared/types';
import { APIVoice } from '../APIVoice';
import type { VoiceConfig } from '../Voice';
import { PROVIDER_NAMES } from '../../../shared/constants';

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

export class OpenAICompatVoice extends APIVoice {
  readonly provider = PROVIDER_NAMES.OPENAI_COMPAT;
  private readonly baseUrl: string;
  private readonly apiKeyEnvVar: string | null;

  constructor(config: VoiceConfig & { baseUrl: string; apiKeyEnvVar: string | null }) {
    super({ ...config, defaultModel: config.model ?? '' });
    this.baseUrl = config.baseUrl;
    this.apiKeyEnvVar = config.apiKeyEnvVar;
  }

  async *send(_message: Message, context: Message[]): AsyncIterable<string> {
    const { default: OpenAI } = await import('openai');
    const apiKey = this.apiKeyEnvVar
      ? (process.env[this.apiKeyEnvVar]?.trim() ?? 'no-key')
      : 'no-key';
    const client = new OpenAI({ apiKey, baseURL: this.baseUrl });
    const systemPrompt = this.buildSystemPrompt();
    const messages = buildMessages(this.id, context, systemPrompt);

    this.abortController = new AbortController();
    const stream = client.chat.completions.stream(
      { model: this.model, messages },
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
    if (!this.apiKeyEnvVar) return true;
    return !!process.env[this.apiKeyEnvVar]?.trim();
  }
}
