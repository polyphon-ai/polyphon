import type { Message } from '../../shared/types';
import type { Voice, VoiceConfig } from './Voice';
import { resolveApiKey } from '../utils/env';
import { resolveTools, type ToolDefinition } from '../tools/index';
import { logger } from '../utils/logger';

const MAX_TOOL_ROUNDS = 10;

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

// A stream item is either a text token (string) or a detected tool call.
// Providers yield ToolCall objects at the end of a streaming response when
// tool use is detected. executeToolLoop uses this to drive the multi-round loop.
export type StreamItem = string | ToolCall;

// Base class for all API-backed voices (Anthropic, OpenAI, Gemini, etc.).
// Subclass per provider, or use the provider registration pattern instead.
export abstract class APIVoice implements Voice {
  readonly id: string;
  readonly name: string;
  readonly type = 'api' as const;
  abstract readonly provider: string;
  readonly color: string;
  readonly avatarIcon: string;
  readonly toneOverride: string | undefined;
  protected readonly model: string;
  protected readonly systemPrompt: string | undefined;
  protected enabledTools: ToolDefinition[];
  protected ensembleSystemPrompt = '';
  protected abortController: AbortController | null = null;
  private readonly rawToolNames: string[];

  constructor(config: VoiceConfig & { defaultModel: string }) {
    this.id = config.id;
    this.name = config.displayName;
    this.color = config.color;
    this.avatarIcon = config.avatarIcon;
    this.toneOverride = config.toneOverride;
    this.model = config.model ?? config.defaultModel;
    this.systemPrompt = config.systemPrompt;
    this.rawToolNames = config.enabledTools ?? [];
    this.enabledTools = resolveTools(this.rawToolNames);
  }

  abstract send(message: Message, context: Message[]): AsyncIterable<string>;

  async isAvailable(): Promise<boolean> {
    try {
      resolveApiKey(this.provider);
      return true;
    } catch {
      return false;
    }
  }

  abort(): void {
    this.abortController?.abort();
    this.abortController = null;
  }

  setEnsembleSystemPrompt(prompt: string): void {
    this.ensembleSystemPrompt = prompt;
  }

  applyWorkingDir(workingDir: string): void {
    this.enabledTools = resolveTools(this.rawToolNames, workingDir, false);
  }

  applySandbox(sandboxDir: string): void {
    this.enabledTools = resolveTools(this.rawToolNames, sandboxDir, true);
  }

  protected buildSystemPrompt(): string {
    return [this.ensembleSystemPrompt, this.systemPrompt].filter(Boolean).join('\n\n');
  }

  // Executes tool calls, yields [tool: name] tokens, and drives the multi-round
  // tool-use loop. Called from provider send() when tool calls are detected.
  //
  // - toolCalls: tool calls from the initial or prior response
  // - tools: resolved tool definitions to execute against
  // - appendMessages: provider-specific callback to append tool results to the
  //   in-memory message array (called once per tool call with its result)
  // - continueStream: factory that sends the follow-up provider request and
  //   returns a StreamItem iterable (strings = text tokens; ToolCall = new calls)
  // - maxRounds: hard cap; emits an error token and stops if exceeded
  protected async *executeToolLoop(
    toolCalls: ToolCall[],
    tools: ToolDefinition[],
    appendMessages: (tc: ToolCall, result: string) => void,
    continueStream: () => AsyncIterable<StreamItem>,
    maxRounds = MAX_TOOL_ROUNDS,
  ): AsyncIterable<string> {
    let pendingCalls = toolCalls;

    for (let round = 0; round < maxRounds; round++) {
      if (pendingCalls.length === 0) break;

      for (const tc of pendingCalls) {
        const tool = tools.find((t) => t.name === tc.name);
        if (!tool) continue;

        logger.debug('tool:execute', { name: tc.name, voiceId: this.id });
        yield `[tool: ${tc.name}]`;

        let result: string;
        try {
          result = await tool.execute(tc.args);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn('tool:error', { name: tc.name, voiceId: this.id, error: msg });
          result = `Error: ${msg}`;
        }

        appendMessages(tc, result);
      }

      const nextCalls: ToolCall[] = [];
      for await (const item of continueStream()) {
        if (typeof item === 'string') {
          yield item;
        } else {
          nextCalls.push(item);
        }
      }

      pendingCalls = nextCalls;
    }

    if (pendingCalls.length > 0) {
      logger.warn('tool:max-rounds', { voiceId: this.id, rounds: maxRounds });
      yield `\n[tool loop exceeded ${maxRounds} rounds — stopping]`;
    }
  }
}
