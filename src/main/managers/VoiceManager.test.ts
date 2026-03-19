import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

vi.mock('child_process', () => ({
  spawn: vi.fn(),
  spawnSync: vi.fn(),
}));

vi.mock('../db/queries/providerConfigs', () => ({
  listProviderConfigs: vi.fn(),
}));

import { spawn } from 'child_process';
import { listProviderConfigs } from '../db/queries/providerConfigs';
import { VoiceManager } from './VoiceManager';
import { PROVIDER_NAMES, PROVIDER_METADATA } from '../../shared/constants';
import type { CompositionVoice, Message } from '../../shared/types';
import type { DatabaseSync } from 'node:sqlite';

const mockSpawn = spawn as ReturnType<typeof vi.fn>;
const mockListProviderConfigs = listProviderConfigs as ReturnType<typeof vi.fn>;

function makeCliVoice(provider: string, overrides: Partial<CompositionVoice> = {}): CompositionVoice {
  return {
    id: 'voice-1',
    compositionId: 'comp-1',
    provider,
    displayName: 'Test Voice',
    color: '#fff',
    avatarIcon: 'star',
    order: 0,
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
        return new Promise((resolve) => {
          resolveNext = resolve;
        });
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

function makeProviderConfig(provider: string, yoloMode: boolean) {
  return {
    id: 'pc-1',
    provider,
    enabled: true,
    voiceType: 'cli' as const,
    defaultModel: null,
    cliCommand: null,
    cliArgs: null,
    yoloMode,
    createdAt: 1000,
    updatedAt: 1000,
  };
}

// Drain the send() generator without caring about tokens
async function drainSend(voice: ReturnType<VoiceManager['createVoice']>, emitEnd: () => void) {
  const gen = voice.send(makeMsg(), []);
  const drainPromise = (async () => {
    for await (const _ of gen) { /* drain */ }
  })();
  emitEnd();
  await drainPromise;
}

describe('VoiceManager.createVoice — yolo mode flag injection', () => {
  let vm: VoiceManager;

  beforeEach(() => {
    vi.clearAllMocks();
    vm = new VoiceManager();
  });

  function loadConfig(provider: string, yoloMode: boolean) {
    mockListProviderConfigs.mockReturnValue([makeProviderConfig(provider, yoloMode)]);
    vm.loadProviderConfigs({} as DatabaseSync);
  }

  it('appends --dangerously-skip-permissions for anthropic CLI when yolo mode is enabled', async () => {
    loadConfig(PROVIDER_NAMES.ANTHROPIC, true);
    const { proc, emitEnd } = makeMockProcess();
    mockSpawn.mockReturnValue(proc);

    // cliCommand required to select CLIVoice path in the anthropic provider factory
    const voice = vm.createVoice(makeCliVoice(PROVIDER_NAMES.ANTHROPIC, { cliCommand: 'claude' }));
    await drainSend(voice, emitEnd);

    const spawnArgs = mockSpawn.mock.calls[0]![1] as string[];
    expect(spawnArgs).toContain(PROVIDER_METADATA[PROVIDER_NAMES.ANTHROPIC]!.yoloFlag);
  });

  it('does not append yolo flag for anthropic CLI when yolo mode is disabled', async () => {
    loadConfig(PROVIDER_NAMES.ANTHROPIC, false);
    const { proc, emitEnd } = makeMockProcess();
    mockSpawn.mockReturnValue(proc);

    const voice = vm.createVoice(makeCliVoice(PROVIDER_NAMES.ANTHROPIC, { cliCommand: 'claude' }));
    await drainSend(voice, emitEnd);

    const spawnArgs = mockSpawn.mock.calls[0]![1] as string[];
    expect(spawnArgs).not.toContain(PROVIDER_METADATA[PROVIDER_NAMES.ANTHROPIC]!.yoloFlag);
  });

  it('appends --dangerously-bypass-approvals-and-sandbox for openai (codex) when yolo mode is enabled', async () => {
    loadConfig(PROVIDER_NAMES.OPENAI, true);
    const { proc, emitEnd } = makeMockProcess();
    mockSpawn.mockReturnValue(proc);

    // cliCommand required to select CodexVoice path in the openai provider factory
    const voice = vm.createVoice(makeCliVoice(PROVIDER_NAMES.OPENAI, { cliCommand: 'codex' }));
    await drainSend(voice, emitEnd);

    const spawnArgs = mockSpawn.mock.calls[0]![1] as string[];
    expect(spawnArgs).toContain(PROVIDER_METADATA[PROVIDER_NAMES.OPENAI]!.yoloFlag);
  });

  it('does not append yolo flag for openai when yolo mode is disabled', async () => {
    loadConfig(PROVIDER_NAMES.OPENAI, false);
    const { proc, emitEnd } = makeMockProcess();
    mockSpawn.mockReturnValue(proc);

    const voice = vm.createVoice(makeCliVoice(PROVIDER_NAMES.OPENAI, { cliCommand: 'codex' }));
    await drainSend(voice, emitEnd);

    const spawnArgs = mockSpawn.mock.calls[0]![1] as string[];
    expect(spawnArgs).not.toContain(PROVIDER_METADATA[PROVIDER_NAMES.OPENAI]!.yoloFlag);
  });

  it('appends --allow-all for copilot when yolo mode is enabled', async () => {
    loadConfig(PROVIDER_NAMES.COPILOT, true);
    const { proc, emitEnd } = makeMockProcess();
    mockSpawn.mockReturnValue(proc);

    const voice = vm.createVoice(makeCliVoice(PROVIDER_NAMES.COPILOT));
    await drainSend(voice, emitEnd);

    const spawnArgs = mockSpawn.mock.calls[0]![1] as string[];
    expect(spawnArgs).toContain(PROVIDER_METADATA[PROVIDER_NAMES.COPILOT]!.yoloFlag);
  });

  it('does not append yolo flag for copilot when yolo mode is disabled', async () => {
    loadConfig(PROVIDER_NAMES.COPILOT, false);
    const { proc, emitEnd } = makeMockProcess();
    mockSpawn.mockReturnValue(proc);

    const voice = vm.createVoice(makeCliVoice(PROVIDER_NAMES.COPILOT));
    await drainSend(voice, emitEnd);

    const spawnArgs = mockSpawn.mock.calls[0]![1] as string[];
    expect(spawnArgs).not.toContain(PROVIDER_METADATA[PROVIDER_NAMES.COPILOT]!.yoloFlag);
  });

  it('appends yolo flag after pre-existing cliArgs', async () => {
    loadConfig(PROVIDER_NAMES.ANTHROPIC, true);
    const { proc, emitEnd } = makeMockProcess();
    mockSpawn.mockReturnValue(proc);

    const voice = vm.createVoice(makeCliVoice(PROVIDER_NAMES.ANTHROPIC, { cliCommand: 'claude', cliArgs: ['--verbose'] }));
    await drainSend(voice, emitEnd);

    const spawnArgs = mockSpawn.mock.calls[0]![1] as string[];
    const verboseIdx = spawnArgs.indexOf('--verbose');
    const yoloIdx = spawnArgs.indexOf(PROVIDER_METADATA[PROVIDER_NAMES.ANTHROPIC]!.yoloFlag!);
    expect(verboseIdx).toBeGreaterThanOrEqual(0);
    expect(yoloIdx).toBeGreaterThan(verboseIdx);
  });

  it('does not inject a flag when no providerCLIConfig is loaded', async () => {
    // No loadProviderConfigs call — providerCLIConfigs is empty
    const { proc, emitEnd } = makeMockProcess();
    mockSpawn.mockReturnValue(proc);

    const voice = vm.createVoice(makeCliVoice(PROVIDER_NAMES.ANTHROPIC, { cliCommand: 'claude' }));
    await drainSend(voice, emitEnd);

    const spawnArgs = mockSpawn.mock.calls[0]![1] as string[];
    expect(spawnArgs).not.toContain(PROVIDER_METADATA[PROVIDER_NAMES.ANTHROPIC]!.yoloFlag);
  });
});
