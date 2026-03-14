import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventEmitter } from 'events';

vi.mock('child_process', () => ({
  spawn: vi.fn(),
  spawnSync: vi.fn(),
}));

import { spawn, spawnSync } from 'child_process';
import { copilotProvider } from './copilot';
import type { Message } from '../../../shared/types';
import type { VoiceConfig } from '../Voice';

const mockSpawn = spawn as ReturnType<typeof vi.fn>;
const mockSpawnSync = spawnSync as ReturnType<typeof vi.fn>;

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

function makeMockProcess() {
  const stdout = new EventEmitter() as EventEmitter & { [Symbol.asyncIterator](): AsyncIterator<Buffer> };
  const proc = new EventEmitter() as EventEmitter & {
    stdout: typeof stdout;
    kill: ReturnType<typeof vi.fn>;
  };
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

afterEach(() => { vi.clearAllMocks(); });

describe('CopilotVoice.isAvailable()', () => {
  it('returns true when spawnSync exits with status 0', async () => {
    mockSpawnSync.mockReturnValue({ status: 0, error: undefined });
    const voice = copilotProvider.create(makeConfig());
    expect(await voice.isAvailable()).toBe(true);
  });

  it('returns false when spawnSync has an error', async () => {
    mockSpawnSync.mockReturnValue({ status: null, error: new Error('not found') });
    const voice = copilotProvider.create(makeConfig());
    expect(await voice.isAvailable()).toBe(false);
  });

  it('returns false when spawnSync exits with non-zero status', async () => {
    mockSpawnSync.mockReturnValue({ status: 1, error: undefined });
    const voice = copilotProvider.create(makeConfig());
    expect(await voice.isAvailable()).toBe(false);
  });
});

describe('CopilotVoice.send()', () => {
  it('spawns copilot with -p flag and prompt text', async () => {
    const { proc, emitEnd } = makeMockProcess();
    mockSpawn.mockReturnValue(proc);

    const voice = copilotProvider.create(makeConfig());
    const context: Message[] = [makeMsg({ role: 'conductor', content: 'Hello' })];

    const sendPromise = (async () => {
      for await (const _ of voice.send(makeMsg(), context)) { /* drain */ }
    })();

    emitEnd();
    await sendPromise;

    expect(mockSpawn).toHaveBeenCalledOnce();
    const [cmd, args] = mockSpawn.mock.calls[0] as [string, string[]];
    expect(cmd).toBe('copilot');
    expect(args).toContain('-p');
    expect(args).toContain('--allow-all-tools');
    const promptIndex = args.indexOf('-p');
    expect(args[promptIndex + 1]).toContain('User: Hello');
  });

  it('yields complete lines from stdout', async () => {
    const { proc, emitData, emitEnd } = makeMockProcess();
    mockSpawn.mockReturnValue(proc);

    const voice = copilotProvider.create(makeConfig());

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

    const voice = copilotProvider.create(makeConfig());

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

  it('includes system prompt in the -p argument', async () => {
    const { proc, emitEnd } = makeMockProcess();
    mockSpawn.mockReturnValue(proc);

    const voice = copilotProvider.create(makeConfig());
    voice.setEnsembleSystemPrompt('Be concise.');

    const sendPromise = (async () => {
      for await (const _ of voice.send(makeMsg(), [makeMsg({ role: 'conductor', content: 'Hi' })])) { /* drain */ }
    })();

    emitEnd();
    await sendPromise;

    const args = mockSpawn.mock.calls[0]![1] as string[];
    const promptIndex = args.indexOf('-p');
    expect(args[promptIndex + 1]).toContain('Be concise.');
  });

  it('abort() kills the active process', async () => {
    const { proc, emitEnd } = makeMockProcess();
    mockSpawn.mockReturnValue(proc);

    const voice = copilotProvider.create(makeConfig());
    const gen = voice.send(makeMsg(), [makeMsg({ content: 'Hi' })]);

    const nextPromise = gen[Symbol.asyncIterator]().next();
    voice.abort();
    emitEnd();

    await nextPromise.catch(() => { /* may resolve or reject after kill */ });

    expect(proc.kill).toHaveBeenCalled();
  });
});
