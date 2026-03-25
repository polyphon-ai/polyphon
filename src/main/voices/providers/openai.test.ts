import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventEmitter } from 'events';

const mockCompletionsStream = vi.fn();

vi.mock('openai', () => {
  return {
    default: function MockOpenAI() {
      return { chat: { completions: { stream: mockCompletionsStream } } };
    },
  };
});

vi.mock('../../utils/env', () => ({
  resolveApiKey: vi.fn(),
}));

vi.mock('child_process', () => ({
  spawn: vi.fn(),
  spawnSync: vi.fn(),
}));

import { spawn, spawnSync } from 'child_process';
import { resolveApiKey } from '../../utils/env';
import { openaiProvider } from './openai';
import type { Message } from '../../../shared/types';
import type { VoiceConfig } from '../Voice';

const mockSpawn = spawn as ReturnType<typeof vi.fn>;
const mockSpawnSync = spawnSync as ReturnType<typeof vi.fn>;

const mockResolveApiKey = resolveApiKey as ReturnType<typeof vi.fn>;

function makeConfig(overrides: Partial<VoiceConfig> = {}): VoiceConfig {
  return {
    id: 'voice-1',
    displayName: 'Test Voice',
    color: '#fff',
    avatarIcon: 'star',
    ...overrides,
  };
}

function makeMsg(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg-1',
    sessionId: 'session-1',
    role: 'conductor',
    voiceId: null,
    voiceName: null,
    content: 'Hello',
    timestamp: 1000,
    roundIndex: 0,
    ...overrides,
  };
}

function makeChunk(content: string | null | undefined) {
  return { choices: [{ delta: { content } }] };
}

async function* makeAsyncIterable(chunks: unknown[]) {
  for (const c of chunks) yield c;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('OpenAIVoice.isAvailable()', () => {
  it('returns true when POLYPHON_OPENAI_API_KEY is set', async () => {
    mockResolveApiKey.mockReturnValue('sk-openai-test');
    const voice = openaiProvider.create(makeConfig());
    expect(await voice.isAvailable()).toBe(true);
  });

  it('returns false when resolveApiKey throws', async () => {
    mockResolveApiKey.mockImplementation(() => {
      throw new Error('No API key found');
    });
    const voice = openaiProvider.create(makeConfig());
    expect(await voice.isAvailable()).toBe(false);
  });
});

describe('OpenAIVoice.send()', () => {
  it('yields delta content from stream chunks', async () => {
    mockResolveApiKey.mockReturnValue('sk-openai-test');
    mockCompletionsStream.mockReturnValue(
      makeAsyncIterable([makeChunk('Hello'), makeChunk(' world')]),
    );

    const voice = openaiProvider.create(makeConfig());
    const tokens: string[] = [];
    for await (const t of voice.send(makeMsg(), [makeMsg({ content: 'Hi' })])) tokens.push(t);

    expect(tokens).toEqual(['Hello', ' world']);
  });

  it('skips chunks with null or undefined delta content', async () => {
    mockResolveApiKey.mockReturnValue('sk-openai-test');
    mockCompletionsStream.mockReturnValue(
      makeAsyncIterable([
        makeChunk(null),
        makeChunk('ok'),
        makeChunk(undefined),
        { choices: [] },
      ]),
    );

    const voice = openaiProvider.create(makeConfig());
    const tokens: string[] = [];
    for await (const t of voice.send(makeMsg(), [makeMsg({ content: 'Hi' })])) tokens.push(t);

    expect(tokens).toEqual(['ok']);
  });

  it('prepends system message to messages array when ensemble prompt is set', async () => {
    mockResolveApiKey.mockReturnValue('sk-openai-test');
    mockCompletionsStream.mockReturnValue(makeAsyncIterable([]));

    const voice = openaiProvider.create(makeConfig());
    voice.setEnsembleSystemPrompt('You are an assistant.');
    for await (const _ of voice.send(makeMsg(), [makeMsg({ content: 'Hi' })])) { /* drain */ }

    const callArgs = mockCompletionsStream.mock.calls[0]![0];
    expect(callArgs.messages[0]).toEqual({ role: 'system', content: 'You are an assistant.' });
  });

  it('does not include system message when ensemble prompt is empty', async () => {
    mockResolveApiKey.mockReturnValue('sk-openai-test');
    mockCompletionsStream.mockReturnValue(makeAsyncIterable([]));

    const voice = openaiProvider.create(makeConfig());
    for await (const _ of voice.send(makeMsg(), [makeMsg({ content: 'Hi' })])) { /* drain */ }

    const callArgs = mockCompletionsStream.mock.calls[0]![0];
    const hasSystem = callArgs.messages.some((m: { role: string }) => m.role === 'system');
    expect(hasSystem).toBe(false);
  });

  it('maps conductor to user, own voiceId to assistant, other voice to user with [Name] prefix', async () => {
    mockResolveApiKey.mockReturnValue('sk-openai-test');
    mockCompletionsStream.mockReturnValue(makeAsyncIterable([]));

    const voice = openaiProvider.create(makeConfig({ id: 'voice-1' }));
    const context: Message[] = [
      makeMsg({ role: 'conductor', voiceId: null, voiceName: null, content: 'Question?' }),
      makeMsg({ role: 'voice', voiceId: 'voice-1', voiceName: 'Me', content: 'My answer' }),
      makeMsg({ role: 'voice', voiceId: 'voice-2', voiceName: 'Other', content: 'Their answer' }),
    ];
    for await (const _ of voice.send(makeMsg(), context)) { /* drain */ }

    const callArgs = mockCompletionsStream.mock.calls[0]![0];
    expect(callArgs.messages).toEqual([
      { role: 'user', content: 'Question?' },
      { role: 'assistant', content: 'My answer' },
      { role: 'user', content: '[Other]: Their answer' },
    ]);
  });

  it('merges consecutive same-role messages', async () => {
    mockResolveApiKey.mockReturnValue('sk-openai-test');
    mockCompletionsStream.mockReturnValue(makeAsyncIterable([]));

    const voice = openaiProvider.create(makeConfig({ id: 'voice-1' }));
    const context: Message[] = [
      makeMsg({ role: 'conductor', content: 'First' }),
      makeMsg({ role: 'conductor', content: 'Second' }),
      makeMsg({ role: 'voice', voiceId: 'voice-1', voiceName: 'Me', content: 'Reply' }),
    ];
    for await (const _ of voice.send(makeMsg(), context)) { /* drain */ }

    const callArgs = mockCompletionsStream.mock.calls[0]![0];
    expect(callArgs.messages).toEqual([
      { role: 'user', content: 'First\nSecond' },
      { role: 'assistant', content: 'Reply' },
    ]);
  });

  it('swallows AbortError without rethrowing', async () => {
    mockResolveApiKey.mockReturnValue('sk-openai-test');
    const abortErr = new Error('aborted');
    abortErr.name = 'AbortError';
    async function* throwingStream() {
      throw abortErr;
      yield;
    }
    mockCompletionsStream.mockReturnValue(throwingStream());

    const voice = openaiProvider.create(makeConfig());
    // Must await properly — expect(asyncFn).not.toThrow() does not await the Promise
    for await (const _ of voice.send(makeMsg(), [makeMsg({ content: 'Hi' })])) { /* drain */ }
  });

  it('swallows APIUserAbortError without rethrowing', async () => {
    mockResolveApiKey.mockReturnValue('sk-openai-test');
    const abortErr = new Error('user aborted');
    abortErr.name = 'APIUserAbortError';
    async function* throwingStream() {
      throw abortErr;
      yield;
    }
    mockCompletionsStream.mockReturnValue(throwingStream());

    const voice = openaiProvider.create(makeConfig());
    // Must await properly — expect(asyncFn).not.toThrow() does not await the Promise
    for await (const _ of voice.send(makeMsg(), [makeMsg({ content: 'Hi' })])) { /* drain */ }
  });
});


function makeMockProcess() {
  const stdout = new EventEmitter() as EventEmitter & { [Symbol.asyncIterator](): AsyncIterator<Buffer> };
  const stdin = { write: vi.fn(), end: vi.fn() };
  const proc = new EventEmitter() as EventEmitter & {
    stdin: typeof stdin;
    stdout: typeof stdout;
    kill: ReturnType<typeof vi.fn>;
  };
  proc.stdin = stdin;
  proc.stdout = stdout;
  proc.kill = vi.fn();

  const chunks: Buffer[] = [];
  let resolveNext: ((val: IteratorResult<Buffer>) => void) | null = null;
  let done = false;

  stdout.on('data', (chunk: Buffer) => {
    if (resolveNext) {
      const r = resolveNext;
      resolveNext = null;
      r({ value: chunk, done: false });
    } else {
      chunks.push(chunk);
    }
  });

  stdout[Symbol.asyncIterator] = function () {
    return {
      next(): Promise<IteratorResult<Buffer>> {
        if (chunks.length > 0) {
          return Promise.resolve({ value: chunks.shift()!, done: false });
        }
        if (done) {
          return Promise.resolve({ value: undefined as unknown as Buffer, done: true });
        }
        return new Promise((resolve) => { resolveNext = resolve; });
      },
      return(): Promise<IteratorResult<Buffer>> {
        done = true;
        return Promise.resolve({ value: undefined as unknown as Buffer, done: true });
      },
    };
  };

  function emitData(text: string) { stdout.emit('data', Buffer.from(text)); }
  function emitEnd() {
    done = true;
    if (resolveNext) {
      const r = resolveNext;
      resolveNext = null;
      r({ value: undefined as unknown as Buffer, done: true });
    }
  }

  return { proc, emitData, emitEnd };
}

describe('OpenAIVoice tool serialization', () => {
  it('sends tools array in correct OpenAI format when enabledTools is set', async () => {
    mockResolveApiKey.mockReturnValue('sk-openai-test');
    // First response: single tool call that yields [tool: read_file]
    // Second response: final text confirming the API was called with tool format
    mockCompletionsStream
      .mockReturnValueOnce(makeAsyncIterable([
        { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call1', function: { name: 'read_file', arguments: '{"path":"/tmp/f"}' } }] }, finish_reason: null }] },
        { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
      ]))
      .mockReturnValueOnce(makeAsyncIterable([]));

    const voice = openaiProvider.create(makeConfig({ enabledTools: ['read_file'] }));
    for await (const _ of voice.send(makeMsg(), [makeMsg({ content: 'Hi' })])) { /* drain */ }

    // Verify first call had tools in correct OpenAI format
    expect(mockCompletionsStream.mock.calls.length).toBeGreaterThanOrEqual(1);
    const callArgs = mockCompletionsStream.mock.calls[0]![0];
    expect(Array.isArray(callArgs.tools)).toBe(true);
    expect(callArgs.tools).toHaveLength(1);
    const tool = callArgs.tools[0];
    expect(tool.type).toBe('function');
    expect(tool.function.name).toBe('read_file');
    expect(tool.function.parameters).toBeDefined();
    expect(tool.function.parameters.type).toBe('object');
  });

  it('does not send tools when enabledTools is empty', async () => {
    mockResolveApiKey.mockReturnValue('sk-openai-test');
    mockCompletionsStream.mockReturnValue(makeAsyncIterable([]));

    const voice = openaiProvider.create(makeConfig());
    for await (const _ of voice.send(makeMsg(), [makeMsg({ content: 'Hi' })])) { /* drain */ }

    const callArgs = mockCompletionsStream.mock.calls[0]![0];
    expect(callArgs.tools).toBeUndefined();
  });

  it('yields [tool: name] token when tool_calls detected in stream', async () => {
    mockResolveApiKey.mockReturnValue('sk-openai-test');
    // First response: tool call
    mockCompletionsStream
      .mockReturnValueOnce(makeAsyncIterable([
        { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call1', function: { name: 'read_file', arguments: '' } }] }, finish_reason: null }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"path":"/tmp/f"}' } }] }, finish_reason: null }] },
        { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
      ]))
      // Follow-up response: final text
      .mockReturnValueOnce(makeAsyncIterable([
        { choices: [{ delta: { content: 'Done.' }, finish_reason: null }] },
        { choices: [{ delta: {}, finish_reason: 'stop' }] },
      ]));

    const voice = openaiProvider.create(makeConfig({ enabledTools: ['read_file'] }));
    const tokens: string[] = [];
    for await (const t of voice.send(makeMsg(), [makeMsg({ content: 'Hi' })])) {
      tokens.push(t);
    }

    expect(tokens).toContain('[tool: read_file]');
    expect(tokens).toContain('Done.');
  });
});

describe('CodexVoice.send()', () => {
  it('spawns "codex exec -" and writes prompt to stdin', async () => {
    const { proc, emitEnd } = makeMockProcess();
    mockSpawn.mockReturnValue(proc);

    const voice = openaiProvider.create(makeConfig({ cliCommand: 'codex' }));
    const context: Message[] = [makeMsg({ role: 'conductor', content: 'Hello' })];

    const sendPromise = (async () => {
      for await (const _ of voice.send(makeMsg(), context)) { /* drain */ }
    })();

    emitEnd();
    await sendPromise;

    expect(mockSpawn).toHaveBeenCalledOnce();
    const [cmd, args] = mockSpawn.mock.calls[0] as [string, string[]];
    expect(cmd).toBe('codex');
    expect(args).toContain('exec');
    expect(args).toContain('-');
    expect(proc.stdin.write).toHaveBeenCalledOnce();
    const written = proc.stdin.write.mock.calls[0]![0] as string;
    expect(written).toContain('Hello');
  });

  it('yields complete lines from stdout', async () => {
    const { proc, emitData, emitEnd } = makeMockProcess();
    mockSpawn.mockReturnValue(proc);

    const voice = openaiProvider.create(makeConfig({ cliCommand: 'codex' }));

    const sendPromise = (async () => {
      const tokens: string[] = [];
      for await (const t of voice.send(makeMsg(), [makeMsg({ content: 'Hi' })])) tokens.push(t);
      return tokens;
    })();

    emitData('line one\nline two\n');
    emitEnd();
    const tokens = await sendPromise;

    expect(tokens).toEqual(['line one\n', 'line two\n']);
  });

  it('yields remaining buffer content after stream ends', async () => {
    const { proc, emitData, emitEnd } = makeMockProcess();
    mockSpawn.mockReturnValue(proc);

    const voice = openaiProvider.create(makeConfig({ cliCommand: 'codex' }));

    const sendPromise = (async () => {
      const tokens: string[] = [];
      for await (const t of voice.send(makeMsg(), [makeMsg({ content: 'Hi' })])) tokens.push(t);
      return tokens;
    })();

    emitData('no newline at end');
    emitEnd();
    const tokens = await sendPromise;

    expect(tokens).toContain('no newline at end');
  });

  it('includes system prompt in stdin content', async () => {
    const { proc, emitEnd } = makeMockProcess();
    mockSpawn.mockReturnValue(proc);

    const voice = openaiProvider.create(makeConfig({ cliCommand: 'codex' }));
    voice.setEnsembleSystemPrompt('Be concise.');

    const sendPromise = (async () => {
      for await (const _ of voice.send(makeMsg(), [makeMsg({ role: 'conductor', content: 'Hi' })])) { /* drain */ }
    })();

    emitEnd();
    await sendPromise;

    const written = proc.stdin.write.mock.calls[0]![0] as string;
    expect(written).toContain('Be concise.');
  });

  it('abort() kills the active process', async () => {
    const { proc, emitEnd } = makeMockProcess();
    mockSpawn.mockReturnValue(proc);

    const voice = openaiProvider.create(makeConfig({ cliCommand: 'codex' }));
    const gen = voice.send(makeMsg(), [makeMsg({ content: 'Hi' })]);

    const nextPromise = gen[Symbol.asyncIterator]().next();
    voice.abort();
    emitEnd();

    await nextPromise.catch(() => { /* may resolve or reject after kill */ });

    expect(proc.kill).toHaveBeenCalled();
  });

  it('passes cliArgs to spawn', async () => {
    const { proc, emitEnd } = makeMockProcess();
    mockSpawn.mockReturnValue(proc);

    const voice = openaiProvider.create(makeConfig({ cliCommand: 'codex', cliArgs: ['--model', 'o4-mini'] }));

    const sendPromise = (async () => {
      for await (const _ of voice.send(makeMsg(), [])) { /* drain */ }
    })();

    emitEnd();
    await sendPromise;

    const spawnArgs = mockSpawn.mock.calls[0]![1] as string[];
    expect(spawnArgs).toContain('--model');
    expect(spawnArgs).toContain('o4-mini');
  });
});

describe('CodexVoice yolo mode', () => {
  it('does NOT include --dangerously-bypass-approvals-and-sandbox when yoloMode is false', async () => {
    const { proc, emitEnd } = makeMockProcess();
    mockSpawn.mockReturnValue(proc);

    const voice = openaiProvider.create(makeConfig({ cliCommand: 'codex', yoloMode: false }));
    const sendPromise = (async () => { for await (const _ of voice.send(makeMsg(), [])) {} })();
    emitEnd();
    await sendPromise;

    const spawnArgs = mockSpawn.mock.calls[0]![1] as string[];
    expect(spawnArgs).not.toContain('--dangerously-bypass-approvals-and-sandbox');
    expect(spawnArgs).toEqual(['exec', '-']);
  });

  it('places --dangerously-bypass-approvals-and-sandbox after exec but before - when yoloMode is true', async () => {
    const { proc, emitEnd } = makeMockProcess();
    mockSpawn.mockReturnValue(proc);

    const voice = openaiProvider.create(makeConfig({ cliCommand: 'codex', yoloMode: true }));
    const sendPromise = (async () => { for await (const _ of voice.send(makeMsg(), [])) {} })();
    emitEnd();
    await sendPromise;

    const spawnArgs = mockSpawn.mock.calls[0]![1] as string[];
    expect(spawnArgs).toContain('exec');
    expect(spawnArgs).toContain('--dangerously-bypass-approvals-and-sandbox');
    expect(spawnArgs).toContain('-');
    // Correct order: exec → --dangerously-bypass-approvals-and-sandbox → -
    const idxExec = spawnArgs.indexOf('exec');
    const idxFlag = spawnArgs.indexOf('--dangerously-bypass-approvals-and-sandbox');
    const idxStdin = spawnArgs.lastIndexOf('-');
    expect(idxExec).toBeLessThan(idxFlag);
    expect(idxFlag).toBeLessThan(idxStdin);
  });
});

describe('CodexVoice constructor validation (base-class guard via CodexVoice)', () => {
  it('throws for cliCommand with shell metacharacter', () => {
    expect(() => openaiProvider.create(makeConfig({ cliCommand: 'cmd;rm' }))).toThrow();
  });

  it('accepts valid cliCommand and creates CodexVoice', () => {
    expect(() => openaiProvider.create(makeConfig({ cliCommand: 'codex' }))).not.toThrow();
  });
});
