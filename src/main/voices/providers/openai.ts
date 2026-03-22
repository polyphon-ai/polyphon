import { spawnSync } from 'child_process';
import type { Message } from '../../../shared/types';
import { APIVoice, type ToolCall, type StreamItem } from '../APIVoice';
import { CLIVoice } from '../CLIVoice';
import type { VoiceConfig, VoiceProviderRegistration } from '../Voice';
import { PROVIDER_NAMES } from '../../../shared/constants';
import { resolveApiKey } from '../../utils/env';
import { buildOpenAIMessages, type OpenAIMessage } from '../buildMessages';
import type { ToolDefinition } from '../../tools/types';

// Extended message type for multi-round tool conversations
type OpenAIMsg =
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

    // Tool path: multi-round conversation
    const tools = serializeOpenAITools(this.enabledTools);
    const messages: OpenAIMsg[] = baseMessages;

    const continueStream = (): AsyncIterable<StreamItem> => {
      const self = this;
      return (async function* (): AsyncIterable<StreamItem> {
        self.abortController = new AbortController();

        // Accumulate tool call deltas by index
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
          // Build OpenAI tool_calls array for the assistant message
          const openAIToolCalls: OpenAIToolCall[] = Array.from(toolCallAccumulators.values()).map((acc) => ({
            id: acc.id,
            type: 'function',
            function: { name: acc.name, arguments: acc.args },
          }));
          messages.push({ role: 'assistant', content: null, tool_calls: openAIToolCalls });

          // Yield ToolCall objects to signal tool calls to executeToolLoop
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

    // Run initial stream
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
