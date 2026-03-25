import { spawnSync } from 'child_process';
import type { Message } from '../../../shared/types';
import { APIVoice, type ToolCall } from '../APIVoice';
import { CLIVoice } from '../CLIVoice';
import type { VoiceConfig, VoiceProviderRegistration } from '../Voice';
import { PROVIDER_NAMES } from '../../../shared/constants';
import { resolveApiKey } from '../../utils/env';
import { buildOpenAIMessages } from '../buildMessages';
import { type OpenAIMsg, serializeOpenAITools, buildContinueStream, streamNoTools } from './openaiStreamUtils';

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
      yield* streamNoTools({
        setAbortController: (ac) => { this.abortController = ac; },
        client,
        model: this.model,
        messages: baseMessages,
      });
      return;
    }

    // Tool path: multi-round conversation
    const tools = serializeOpenAITools(this.enabledTools);
    const messages: OpenAIMsg[] = baseMessages;

    const continueStream = buildContinueStream({
      setAbortController: (ac) => { this.abortController = ac; },
      client,
      model: this.model,
      messages,
      tools,
    });

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
    // --dangerously-bypass-approvals-and-sandbox must come after the `exec` subcommand
    const extraArgs = ['exec'];
    if (this.yoloMode) extraArgs.push('--dangerously-bypass-approvals-and-sandbox');
    extraArgs.push('-');
    yield* this.spawnAndStream(this.buildPrompt(context), extraArgs);
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
