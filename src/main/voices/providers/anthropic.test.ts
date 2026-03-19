import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventEmitter } from 'events';

const mockMessagesStream = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: function MockAnthropic() {
      return { messages: { stream: mockMessagesStream } };
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

import { spawn } from 'child_process';
import { resolveApiKey } from '../../utils/env';
import { anthropicProvider } from './anthropic';
import type { Message } from '../../../shared/types';
import type { VoiceConfig } from '../Voice';

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

async function* makeAsyncIterable(events: unknown[]) {
  for (const e of events) yield e;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('AnthropicVoice.isAvailable()', () => {
  it('returns true when POLYPHON_ANTHROPIC_API_KEY is set', async () => {
    mockResolveApiKey.mockReturnValue('sk-ant-test');
    const voice = anthropicProvider.create(makeConfig());
    expect(await voice.isAvailable()).toBe(true);
  });

  it('returns false when resolveApiKey throws', async () => {
    mockResolveApiKey.mockImplementation(() => {
      throw new Error('No API key found');
    });
    const voice = anthropicProvider.create(makeConfig());
    expect(await voice.isAvailable()).toBe(false);
  });
});

describe('AnthropicVoice.send()', () => {
  it('yields text from text_delta events', async () => {
    mockResolveApiKey.mockReturnValue('sk-ant-test');
    mockMessagesStream.mockReturnValue(
      makeAsyncIterable([
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: ' world' } },
      ]),
    );

    const voice = anthropicProvider.create(makeConfig());
    const context = [makeMsg({ role: 'conductor', content: 'Hi' })];
    const tokens: string[] = [];
    for await (const t of voice.send(makeMsg(), context)) tokens.push(t);

    expect(tokens).toEqual(['Hello', ' world']);
  });

  it('skips non-text-delta events', async () => {
    mockResolveApiKey.mockReturnValue('sk-ant-test');
    mockMessagesStream.mockReturnValue(
      makeAsyncIterable([
        { type: 'message_start', message: {} },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'ok' } },
        { type: 'message_stop' },
      ]),
    );

    const voice = anthropicProvider.create(makeConfig());
    const tokens: string[] = [];
    for await (const t of voice.send(makeMsg(), [makeMsg({ content: 'Hi' })])) tokens.push(t);

    expect(tokens).toEqual(['ok']);
  });

  it('maps conductor role to user, own voiceId to assistant, other voice to user with [Name] prefix', async () => {
    mockResolveApiKey.mockReturnValue('sk-ant-test');
    mockMessagesStream.mockReturnValue(makeAsyncIterable([]));

    const voice = anthropicProvider.create(makeConfig({ id: 'voice-1' }));
    const context: Message[] = [
      makeMsg({ role: 'conductor', voiceId: null, voiceName: null, content: 'Question?' }),
      makeMsg({ role: 'voice', voiceId: 'voice-1', voiceName: 'Me', content: 'My answer' }),
      makeMsg({ role: 'voice', voiceId: 'voice-2', voiceName: 'Other', content: 'Their answer' }),
    ];
    for await (const _ of voice.send(makeMsg(), context)) { /* drain */ }

    const callArgs = mockMessagesStream.mock.calls[0]![0];
    expect(callArgs.messages).toEqual([
      { role: 'user', content: 'Question?' },
      { role: 'assistant', content: 'My answer' },
      { role: 'user', content: '[Other]: Their answer' },
    ]);
  });

  it('merges consecutive same-role messages', async () => {
    mockResolveApiKey.mockReturnValue('sk-ant-test');
    mockMessagesStream.mockReturnValue(makeAsyncIterable([]));

    const voice = anthropicProvider.create(makeConfig({ id: 'voice-1' }));
    const context: Message[] = [
      makeMsg({ role: 'conductor', content: 'First' }),
      makeMsg({ role: 'conductor', content: 'Second' }),
      makeMsg({ role: 'voice', voiceId: 'voice-1', voiceName: 'Me', content: 'Reply' }),
    ];
    for await (const _ of voice.send(makeMsg(), context)) { /* drain */ }

    const callArgs = mockMessagesStream.mock.calls[0]![0];
    expect(callArgs.messages).toEqual([
      { role: 'user', content: 'First\nSecond' },
      { role: 'assistant', content: 'Reply' },
    ]);
  });

  it('includes system prompt when setEnsembleSystemPrompt is called', async () => {
    mockResolveApiKey.mockReturnValue('sk-ant-test');
    mockMessagesStream.mockReturnValue(makeAsyncIterable([]));

    const voice = anthropicProvider.create(makeConfig());
    voice.setEnsembleSystemPrompt('You are helpful.');
    for await (const _ of voice.send(makeMsg(), [makeMsg({ content: 'Hi' })])) { /* drain */ }

    const callArgs = mockMessagesStream.mock.calls[0]![0];
    expect(callArgs.system).toBe('You are helpful.');
  });

  it('omits system prompt when ensemble prompt is empty', async () => {
    mockResolveApiKey.mockReturnValue('sk-ant-test');
    mockMessagesStream.mockReturnValue(makeAsyncIterable([]));

    const voice = anthropicProvider.create(makeConfig());
    for await (const _ of voice.send(makeMsg(), [makeMsg({ content: 'Hi' })])) { /* drain */ }

    const callArgs = mockMessagesStream.mock.calls[0]![0];
    expect(callArgs.system).toBeUndefined();
  });

  it('swallows AbortError without rethrowing', async () => {
    mockResolveApiKey.mockReturnValue('sk-ant-test');
    const abortErr = new Error('aborted');
    abortErr.name = 'AbortError';
    async function* throwingStream() {
      throw abortErr;
      yield;
    }
    mockMessagesStream.mockReturnValue(throwingStream());

    const voice = anthropicProvider.create(makeConfig());
    await expect(async () => {
      for await (const _ of voice.send(makeMsg(), [makeMsg({ content: 'Hi' })])) { /* drain */ }
    }).not.toThrow();
  });

  it('swallows APIUserAbortError without rethrowing', async () => {
    mockResolveApiKey.mockReturnValue('sk-ant-test');
    const abortErr = new Error('user aborted');
    abortErr.name = 'APIUserAbortError';
    async function* throwingStream() {
      throw abortErr;
      yield;
    }
    mockMessagesStream.mockReturnValue(throwingStream());

    const voice = anthropicProvider.create(makeConfig());
    await expect(async () => {
      for await (const _ of voice.send(makeMsg(), [makeMsg({ content: 'Hi' })])) { /* drain */ }
    }).not.toThrow();
  });

  it('rethrows non-abort errors', async () => {
    mockResolveApiKey.mockReturnValue('sk-ant-test');
    const networkErr = new Error('network failure');
    async function* throwingStream() {
      throw networkErr;
      yield;
    }
    mockMessagesStream.mockReturnValue(throwingStream());

    const voice = anthropicProvider.create(makeConfig());
    await expect(async () => {
      for await (const _ of voice.send(makeMsg(), [makeMsg({ content: 'Hi' })])) { /* drain */ }
    }).rejects.toThrow('network failure');
  });

  it('uses "Please continue." for empty conductor messages', async () => {
    mockResolveApiKey.mockReturnValue('sk-ant-test');
    mockMessagesStream.mockReturnValue(makeAsyncIterable([]));

    const voice = anthropicProvider.create(makeConfig({ id: 'voice-1' }));
    const context: Message[] = [
      makeMsg({ role: 'conductor', voiceId: null, voiceName: null, content: '' }),
    ];
    for await (const _ of voice.send(makeMsg(), context)) { /* drain */ }

    const callArgs = mockMessagesStream.mock.calls[0]![0];
    expect(callArgs.messages[0]!.content).toBe('Please continue.');
  });
});


describe('AnthropicCLIVoice constructor validation (base-class guard via AnthropicCLIVoice)', () => {
  it('throws for cliCommand with path separator', () => {
    expect(() => anthropicProvider.create(makeConfig({ cliCommand: '../../evil' }))).toThrow();
  });

  it('accepts valid cliCommand and creates AnthropicCLIVoice', () => {
    expect(() => anthropicProvider.create(makeConfig({ cliCommand: 'claude' }))).not.toThrow();
  });
});

describe('AnthropicCLIVoice.send()', () => {
  const mockSpawn = spawn as ReturnType<typeof vi.fn>;

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

    function emitEnd() {
      done = true;
      if (resolveNext) {
        const r = resolveNext;
        resolveNext = null;
        r({ value: undefined as unknown as Buffer, done: true });
      }
    }

    return { proc, emitEnd };
  }

  it('passes cliArgs to spawn', async () => {
    const { proc, emitEnd } = makeMockProcess();
    mockSpawn.mockReturnValue(proc);

    const voice = anthropicProvider.create(makeConfig({ cliCommand: 'claude', cliArgs: ['--model', 'claude-opus-4-6'] }));

    const sendPromise = (async () => {
      for await (const _ of voice.send(makeMsg(), [])) { /* drain */ }
    })();

    emitEnd();
    await sendPromise;

    const spawnArgs = mockSpawn.mock.calls[0]![1] as string[];
    expect(spawnArgs).toContain('--model');
    expect(spawnArgs).toContain('claude-opus-4-6');
  });
});
