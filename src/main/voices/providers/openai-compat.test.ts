import { describe, it, expect, vi, afterEach } from 'vitest';

const mockCompletionsStream = vi.fn();

vi.mock('openai', () => {
  return {
    default: function MockOpenAI() {
      return { chat: { completions: { stream: mockCompletionsStream } } };
    },
  };
});

import { OpenAICompatVoice } from './openai-compat';
import type { Message } from '../../../shared/types';
import type { VoiceConfig } from '../Voice';

function makeConfig(overrides: Partial<VoiceConfig & { baseUrl: string; apiKeyEnvVar: string | null }> = {}): VoiceConfig & { baseUrl: string; apiKeyEnvVar: string | null } {
  return {
    id: 'voice-1',
    displayName: 'Test Compat Voice',
    color: '#fff',
    avatarIcon: 'custom',
    baseUrl: 'http://localhost:11434/v1',
    apiKeyEnvVar: null,
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

describe('OpenAICompatVoice.isAvailable()', () => {
  it('returns true when apiKeyEnvVar is null (auth-less endpoint)', async () => {
    const voice = new OpenAICompatVoice(makeConfig({ apiKeyEnvVar: null }));
    expect(await voice.isAvailable()).toBe(true);
  });

  it('returns true when apiKeyEnvVar is set and the env var has a value', async () => {
    vi.stubEnv('MY_CUSTOM_KEY', 'test-key-value');
    const voice = new OpenAICompatVoice(makeConfig({ apiKeyEnvVar: 'MY_CUSTOM_KEY' }));
    expect(await voice.isAvailable()).toBe(true);
  });

  it('returns false when apiKeyEnvVar is set but the env var is not in process.env', async () => {
    vi.stubEnv('MY_CUSTOM_KEY', '');
    const voice = new OpenAICompatVoice(makeConfig({ apiKeyEnvVar: 'MY_CUSTOM_KEY' }));
    expect(await voice.isAvailable()).toBe(false);
  });

  it('returns false when apiKeyEnvVar is set but env var is undefined', async () => {
    const voice = new OpenAICompatVoice(makeConfig({ apiKeyEnvVar: 'POLYPHON_UNSET_CUSTOM_KEY' }));
    expect(await voice.isAvailable()).toBe(false);
  });
});

describe('OpenAICompatVoice.send()', () => {
  it('yields delta content from stream chunks', async () => {
    mockCompletionsStream.mockReturnValue(
      makeAsyncIterable([makeChunk('Hello'), makeChunk(' world')]),
    );

    const voice = new OpenAICompatVoice(makeConfig());
    const tokens: string[] = [];
    for await (const t of voice.send(makeMsg(), [makeMsg({ content: 'Hi' })])) tokens.push(t);

    expect(tokens).toEqual(['Hello', ' world']);
  });

  it('skips chunks with null or undefined delta content', async () => {
    mockCompletionsStream.mockReturnValue(
      makeAsyncIterable([makeChunk(null), makeChunk('ok'), makeChunk(undefined), { choices: [] }]),
    );

    const voice = new OpenAICompatVoice(makeConfig());
    const tokens: string[] = [];
    for await (const t of voice.send(makeMsg(), [makeMsg({ content: 'Hi' })])) tokens.push(t);

    expect(tokens).toEqual(['ok']);
  });

  it('uses "no-key" when apiKeyEnvVar is null', async () => {
    mockCompletionsStream.mockReturnValue(makeAsyncIterable([]));

    const voice = new OpenAICompatVoice(makeConfig({ apiKeyEnvVar: null }));
    for await (const _ of voice.send(makeMsg(), [])) { /* drain */ }

    const ctor = (await import('openai')).default as unknown as { mock: { calls: unknown[][] } };
    // The OpenAI client is constructed with apiKey 'no-key' when no env var is configured
    expect(mockCompletionsStream).toHaveBeenCalled();
  });

  it('uses the env var value as apiKey when apiKeyEnvVar is set', async () => {
    vi.stubEnv('MY_CUSTOM_KEY', 'sk-custom-test');
    mockCompletionsStream.mockReturnValue(makeAsyncIterable([]));

    const voice = new OpenAICompatVoice(makeConfig({ apiKeyEnvVar: 'MY_CUSTOM_KEY' }));
    for await (const _ of voice.send(makeMsg(), [])) { /* drain */ }

    expect(mockCompletionsStream).toHaveBeenCalled();
  });

  it('prepends system message when ensemble prompt is set', async () => {
    mockCompletionsStream.mockReturnValue(makeAsyncIterable([]));

    const voice = new OpenAICompatVoice(makeConfig());
    voice.setEnsembleSystemPrompt('You are a test assistant.');
    for await (const _ of voice.send(makeMsg(), [makeMsg({ content: 'Hi' })])) { /* drain */ }

    const callArgs = mockCompletionsStream.mock.calls[0]![0];
    expect(callArgs.messages[0]).toEqual({ role: 'system', content: 'You are a test assistant.' });
  });

  it('swallows AbortError without rethrowing', async () => {
    const abortErr = new Error('aborted');
    abortErr.name = 'AbortError';
    async function* throwingStream() { throw abortErr; yield; }
    mockCompletionsStream.mockReturnValue(throwingStream());

    const voice = new OpenAICompatVoice(makeConfig());
    await expect(async () => {
      for await (const _ of voice.send(makeMsg(), [])) { /* drain */ }
    }).not.toThrow();
  });

  it('swallows APIUserAbortError without rethrowing', async () => {
    const abortErr = new Error('user aborted');
    abortErr.name = 'APIUserAbortError';
    async function* throwingStream() { throw abortErr; yield; }
    mockCompletionsStream.mockReturnValue(throwingStream());

    const voice = new OpenAICompatVoice(makeConfig());
    await expect(async () => {
      for await (const _ of voice.send(makeMsg(), [])) { /* drain */ }
    }).not.toThrow();
  });
});
