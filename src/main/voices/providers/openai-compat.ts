import type { Message } from '../../../shared/types';
import { APIVoice, type ToolCall, type StreamItem } from '../APIVoice';
import type { VoiceConfig } from '../Voice';
import { PROVIDER_NAMES } from '../../../shared/constants';
import { buildOpenAIMessages, type OpenAIMessage } from '../buildMessages';
import type { ToolDefinition } from '../../tools/types';

// Extended message type for multi-round tool conversations (same format as OpenAI)
type OpenAICompatMsg =
  | OpenAIMessage
  | { role: 'assistant'; content: null; tool_calls: OpenAIToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

type OpenAIToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

function serializeOpenAITools(tools: ToolDefinition[]) {
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
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
    const baseMessages = buildOpenAIMessages(this.id, context, systemPrompt);

    if (this.enabledTools.length === 0) {
      // Fast path: no tools
      this.abortController = new AbortController();
      const stream = client.chat.completions.stream(
        { model: this.model, messages: baseMessages },
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
      return;
    }

    // Tool path: multi-round conversation (same format as OpenAI)
    const tools = serializeOpenAITools(this.enabledTools);
    const messages: OpenAICompatMsg[] = baseMessages;

    const continueStream = (): AsyncIterable<StreamItem> => {
      const self = this;
      return (async function* (): AsyncIterable<StreamItem> {
        self.abortController = new AbortController();

        const toolCallAccumulators: Map<number, { id: string; name: string; args: string }> = new Map();
        let hasToolCalls = false;
        let finishReason: string | null = null;

        const stream = client.chat.completions.stream(
          { model: self.model, messages: messages as OpenAIMessage[], tools },
          { signal: self.abortController.signal },
        );

        try {
          for await (const chunk of stream) {
            const choice = chunk.choices[0];
            if (!choice) continue;

            const delta = choice.delta as {
              content?: string | null;
              tool_calls?: Array<{
                index: number;
                id?: string;
                function?: { name?: string; arguments?: string };
              }>;
            };

            if (delta.content) {
              yield delta.content;
            }

            if (delta.tool_calls) {
              hasToolCalls = true;
              for (const tc of delta.tool_calls) {
                if (!toolCallAccumulators.has(tc.index)) {
                  toolCallAccumulators.set(tc.index, { id: tc.id ?? '', name: tc.function?.name ?? '', args: '' });
                }
                const acc = toolCallAccumulators.get(tc.index)!;
                if (tc.id) acc.id = tc.id;
                if (tc.function?.name) acc.name = tc.function.name;
                if (tc.function?.arguments) acc.args += tc.function.arguments;
              }
            }

            if (choice.finish_reason) {
              finishReason = choice.finish_reason;
            }
          }
        } catch (err) {
          if (err instanceof Error && (err.name === 'AbortError' || err.name === 'APIUserAbortError')) {
            return;
          }
          throw err;
        } finally {
          self.abortController = null;
        }

        if (hasToolCalls && finishReason === 'tool_calls') {
          const openAIToolCalls: OpenAIToolCall[] = Array.from(toolCallAccumulators.values()).map((acc) => ({
            id: acc.id,
            type: 'function',
            function: { name: acc.name, arguments: acc.args },
          }));
          messages.push({ role: 'assistant', content: null, tool_calls: openAIToolCalls });

          for (const acc of toolCallAccumulators.values()) {
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(acc.args || '{}') as Record<string, unknown>;
            } catch {
              // ignore malformed JSON
            }
            const tc: ToolCall = { id: acc.id, name: acc.name, args };
            yield tc;
          }
        }
      })();
    };

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
