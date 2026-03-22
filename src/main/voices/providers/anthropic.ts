import type { Message } from '../../../shared/types';
import { APIVoice, type ToolCall, type StreamItem } from '../APIVoice';
import { CLIVoice } from '../CLIVoice';
import type { VoiceConfig, VoiceProviderRegistration } from '../Voice';
import { PROVIDER_NAMES } from '../../../shared/constants';
import { resolveApiKey } from '../../utils/env';
import type { ToolDefinition } from '../../tools/types';

type ApiMessage = { role: 'user' | 'assistant'; content: string };

// Extended message type for multi-round tool conversations
type AnthropicMsg =
  | { role: 'user' | 'assistant'; content: string }
  | { role: 'assistant'; content: AnthropicContentBlock[] }
  | { role: 'user'; content: AnthropicToolResultBlock[] };

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> };

type AnthropicToolResultBlock = { type: 'tool_result'; tool_use_id: string; content: string };

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

function serializeAnthropicTools(tools: ToolDefinition[]) {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: {
      type: t.parameters.type,
      properties: t.parameters.properties,
      required: t.parameters.required,
    },
  }));
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
    const baseMessages = buildMessages(this.id, context);
    const systemPrompt = this.buildSystemPrompt();

    if (this.enabledTools.length === 0) {
      // Fast path: no tools
      this.abortController = new AbortController();
      const stream = client.messages.stream(
        {
          model: this.model,
          max_tokens: 4096,
          ...(systemPrompt ? { system: systemPrompt } : {}),
          messages: baseMessages,
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
      return;
    }

    // Tool path: multi-round conversation
    const tools = serializeAnthropicTools(this.enabledTools);
    const messages: AnthropicMsg[] = baseMessages;

    const continueStream = (): AsyncIterable<StreamItem> => {
      const self = this;
      return (async function* (): AsyncIterable<StreamItem> {
        self.abortController = new AbortController();
        const stream = client.messages.stream(
          {
            model: self.model,
            max_tokens: 4096,
            ...(systemPrompt ? { system: systemPrompt } : {}),
            messages: messages as ApiMessage[],
            tools,
          },
          { signal: self.abortController.signal },
        );

        const textParts: string[] = [];
        const toolUseBlocks: Array<{ id: string; name: string; inputJson: string }> = [];
        let currentToolUse: { id: string; name: string; inputJson: string } | null = null;

        try {
          for await (const event of stream) {
            if (event.type === 'content_block_start') {
              const block = event.content_block as { type: string; id?: string; name?: string };
              if (block.type === 'tool_use' && block.id && block.name) {
                currentToolUse = { id: block.id, name: block.name, inputJson: '' };
              }
            } else if (event.type === 'content_block_delta') {
              const delta = event.delta as { type: string; text?: string; partial_json?: string };
              if (delta.type === 'text_delta' && delta.text) {
                textParts.push(delta.text);
                yield delta.text;
              } else if (delta.type === 'input_json_delta' && currentToolUse && delta.partial_json) {
                currentToolUse.inputJson += delta.partial_json;
              }
            } else if (event.type === 'content_block_stop') {
              if (currentToolUse) {
                toolUseBlocks.push(currentToolUse);
                currentToolUse = null;
              }
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

        if (toolUseBlocks.length > 0) {
          // Build and append the assistant turn with all content blocks
          const content: AnthropicContentBlock[] = [];
          if (textParts.length > 0) {
            content.push({ type: 'text', text: textParts.join('') });
          }
          for (const tb of toolUseBlocks) {
            let input: Record<string, unknown> = {};
            try {
              input = JSON.parse(tb.inputJson || '{}') as Record<string, unknown>;
            } catch {
              // ignore malformed JSON
            }
            content.push({ type: 'tool_use', id: tb.id, name: tb.name, input });
          }
          messages.push({ role: 'assistant', content });

          // Yield ToolCall objects to signal tool calls to executeToolLoop
          for (const tb of toolUseBlocks) {
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(tb.inputJson || '{}') as Record<string, unknown>;
            } catch {
              // ignore malformed JSON
            }
            const tc: ToolCall = { id: tb.id, name: tb.name, args };
            yield tc;
          }
        }
      })();
    };

    // Run initial stream to get first response + potential tool calls
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
        const toolResultBlock: AnthropicToolResultBlock = {
          type: 'tool_result',
          tool_use_id: tc.id,
          content: result,
        };
        messages.push({ role: 'user', content: [toolResultBlock] });
      };

      yield* this.executeToolLoop(initialCalls, this.enabledTools, appendMessages, continueStream);
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
