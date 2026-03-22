import type OpenAI from 'openai';
import type { ToolCall, StreamItem } from '../APIVoice';
import type { OpenAIMessage } from '../buildMessages';
import type { ToolDefinition } from '../../tools/types';

export type OpenAIMsg =
  | OpenAIMessage
  | { role: 'assistant'; content: null; tool_calls: OpenAIToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export type OpenAIToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

export async function* streamNoTools(opts: {
  setAbortController: (ac: AbortController | null) => void;
  client: OpenAI;
  model: string;
  messages: OpenAIMessage[];
}): AsyncGenerator<string> {
  const { setAbortController, client, model, messages } = opts;
  const ac = new AbortController();
  setAbortController(ac);
  const stream = client.chat.completions.stream(
    { model, messages },
    { signal: ac.signal },
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
    setAbortController(null);
  }
}

export function serializeOpenAITools(tools: ToolDefinition[]) {
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

export function buildContinueStream(opts: {
  setAbortController: (ac: AbortController | null) => void;
  client: OpenAI;
  model: string;
  messages: OpenAIMsg[];
  tools: ReturnType<typeof serializeOpenAITools>;
}): () => AsyncIterable<StreamItem> {
  return (): AsyncIterable<StreamItem> => {
    const { setAbortController, client, model, messages, tools } = opts;
    return (async function* (): AsyncIterable<StreamItem> {
      const ac = new AbortController();
      setAbortController(ac);

      const toolCallAccumulators: Map<number, { id: string; name: string; args: string }> = new Map();
      let hasToolCalls = false;
      let finishReason: string | null = null;

      const stream = client.chat.completions.stream(
        { model, messages: messages as OpenAIMessage[], tools },
        { signal: ac.signal },
      );

      try {
        for await (const chunk of stream as AsyncIterable<{
          choices: Array<{
            delta: {
              content?: string | null;
              tool_calls?: Array<{
                index: number;
                id?: string;
                function?: { name?: string; arguments?: string };
              }>;
            };
            finish_reason?: string | null;
          }>;
        }>) {
          const choice = chunk.choices[0];
          if (!choice) continue;

          const delta = choice.delta;

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
        setAbortController(null);
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
}
