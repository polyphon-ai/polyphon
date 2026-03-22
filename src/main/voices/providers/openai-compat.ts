import type { Message } from '../../../shared/types';
import { APIVoice, type ToolCall } from '../APIVoice';
import type { VoiceConfig } from '../Voice';
import { PROVIDER_NAMES } from '../../../shared/constants';
import { buildOpenAIMessages } from '../buildMessages';
import { type OpenAIMsg, serializeOpenAITools, buildContinueStream, streamNoTools } from './openaiStreamUtils';

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
    const baseMessages = buildOpenAIMessages(this.id, context, systemPrompt);

    if (this.enabledTools.length === 0) {
      yield* streamNoTools({
        setAbortController: (ac) => { this.abortController = ac; },
        client,
        model: this.model,
        messages: baseMessages,
      });
      return;
    }

    // Tool path: multi-round conversation (same format as OpenAI)
    const tools = serializeOpenAITools(this.enabledTools);
    const messages: OpenAIMsg[] = baseMessages;

    const continueStream = buildContinueStream({
      setAbortController: (ac) => { this.abortController = ac; },
      client,
      model: this.model,
      messages,
      tools,
    });

    const initialCalls: ToolCall[] = [];
    for await (const item of continueStream()) {
      if (typeof item === 'string') {
        yield item;
      } else {
        initialCalls.push(item);
      }
    }

    if (initialCalls.length > 0) {
      const appendMessages = (tc: ToolCall, result: string): void => {
        messages.push({ role: 'tool', tool_call_id: tc.id, content: result });
      };

      yield* this.executeToolLoop(initialCalls, this.enabledTools, appendMessages, continueStream);
    }
  }

  async isAvailable(): Promise<boolean> {
    if (!this.apiKeyEnvVar) return true;
    return !!process.env[this.apiKeyEnvVar]?.trim();
  }
}
