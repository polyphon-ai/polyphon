import { describe, it, expect, vi, afterEach } from 'vitest';

const mockGenerateContentStream = vi.fn();
const mockGetGenerativeModel = vi.fn(() => ({
  generateContentStream: mockGenerateContentStream,
}));

vi.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: function MockGoogleGenerativeAI() {
      return { getGenerativeModel: mockGetGenerativeModel };
    },
  };
});

vi.mock('../../utils/env', () => ({
  resolveApiKey: vi.fn(),
}));

import { resolveApiKey } from '../../utils/env';
import { geminiProvider } from './gemini';
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

async function* makeAsyncIterable(chunks: { text: () => string }[]) {
  for (const c of chunks) yield c;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('GeminiVoice.isAvailable()', () => {
  it('returns true when POLYPHON_GEMINI_API_KEY is set', async () => {
    mockResolveApiKey.mockReturnValue('gemini-key-test');
    const voice = geminiProvider.create(makeConfig());
    expect(await voice.isAvailable()).toBe(true);
  });

  it('returns false when resolveApiKey throws', async () => {
    mockResolveApiKey.mockImplementation(() => {
      throw new Error('No API key found');
    });
    const voice = geminiProvider.create(makeConfig());
    expect(await voice.isAvailable()).toBe(false);
  });
});

describe('GeminiVoice.send()', () => {
  it('yields text from stream chunks', async () => {
    mockResolveApiKey.mockReturnValue('gemini-key-test');
    mockGenerateContentStream.mockResolvedValue({
      stream: makeAsyncIterable([{ text: () => 'Hello' }, { text: () => ' world' }]),
    });

    const voice = geminiProvider.create(makeConfig());
    const tokens: string[] = [];
    for await (const t of voice.send(makeMsg(), [makeMsg({ content: 'Hi' })])) tokens.push(t);

    expect(tokens).toEqual(['Hello', ' world']);
  });

  it('skips empty text chunks', async () => {
    mockResolveApiKey.mockReturnValue('gemini-key-test');
    mockGenerateContentStream.mockResolvedValue({
      stream: makeAsyncIterable([
        { text: () => '' },
        { text: () => 'ok' },
        { text: () => '' },
      ]),
    });

    const voice = geminiProvider.create(makeConfig());
    const tokens: string[] = [];
    for await (const t of voice.send(makeMsg(), [makeMsg({ content: 'Hi' })])) tokens.push(t);

    expect(tokens).toEqual(['ok']);
  });

  it('maps conductor to role:user, own voiceId to role:model, other voice to role:user with [Name] prefix', async () => {
    mockResolveApiKey.mockReturnValue('gemini-key-test');
    mockGenerateContentStream.mockResolvedValue({ stream: makeAsyncIterable([]) });

    const voice = geminiProvider.create(makeConfig({ id: 'voice-1' }));
    const context: Message[] = [
      makeMsg({ role: 'conductor', voiceId: null, voiceName: null, content: 'Question?' }),
      makeMsg({ role: 'voice', voiceId: 'voice-1', voiceName: 'Me', content: 'My answer' }),
      makeMsg({ role: 'voice', voiceId: 'voice-2', voiceName: 'Other', content: 'Their answer' }),
    ];
    for await (const _ of voice.send(makeMsg(), context)) { /* drain */ }

    const callArgs = mockGenerateContentStream.mock.calls[0]![0];
    expect(callArgs.contents).toEqual([
      { role: 'user', parts: [{ text: 'Question?' }] },
      { role: 'model', parts: [{ text: 'My answer' }] },
      { role: 'user', parts: [{ text: '[Other]: Their answer' }] },
    ]);
  });

  it('merges consecutive same-role messages', async () => {
    mockResolveApiKey.mockReturnValue('gemini-key-test');
    mockGenerateContentStream.mockResolvedValue({ stream: makeAsyncIterable([]) });

    const voice = geminiProvider.create(makeConfig({ id: 'voice-1' }));
    const context: Message[] = [
      makeMsg({ role: 'conductor', content: 'First' }),
      makeMsg({ role: 'conductor', content: 'Second' }),
      makeMsg({ role: 'voice', voiceId: 'voice-1', voiceName: 'Me', content: 'Reply' }),
    ];
    for await (const _ of voice.send(makeMsg(), context)) { /* drain */ }

    const callArgs = mockGenerateContentStream.mock.calls[0]![0];
    expect(callArgs.contents).toEqual([
      { role: 'user', parts: [{ text: 'First\nSecond' }] },
      { role: 'model', parts: [{ text: 'Reply' }] },
    ]);
  });

  it('uses systemInstruction when ensemble prompt is set', async () => {
    mockResolveApiKey.mockReturnValue('gemini-key-test');
    mockGenerateContentStream.mockResolvedValue({ stream: makeAsyncIterable([]) });

    const voice = geminiProvider.create(makeConfig());
    voice.setEnsembleSystemPrompt('Be concise.');
    for await (const _ of voice.send(makeMsg(), [makeMsg({ content: 'Hi' })])) { /* drain */ }

    const getModelArgs = (mockGetGenerativeModel.mock.calls as unknown[][])[0]![0];
    expect((getModelArgs as { systemInstruction?: string }).systemInstruction).toBe('Be concise.');
  });

  it('omits systemInstruction when ensemble prompt is empty', async () => {
    mockResolveApiKey.mockReturnValue('gemini-key-test');
    mockGenerateContentStream.mockResolvedValue({ stream: makeAsyncIterable([]) });

    const voice = geminiProvider.create(makeConfig());
    for await (const _ of voice.send(makeMsg(), [makeMsg({ content: 'Hi' })])) { /* drain */ }

    const getModelArgs = (mockGetGenerativeModel.mock.calls as unknown[][])[0]![0];
    expect((getModelArgs as { systemInstruction?: string }).systemInstruction).toBeUndefined();
  });

  it('swallows AbortError without rethrowing', async () => {
    mockResolveApiKey.mockReturnValue('gemini-key-test');
    const abortErr = new Error('aborted');
    abortErr.name = 'AbortError';
    mockGenerateContentStream.mockRejectedValue(abortErr);

    const voice = geminiProvider.create(makeConfig());
    await expect(async () => {
      for await (const _ of voice.send(makeMsg(), [makeMsg({ content: 'Hi' })])) { /* drain */ }
    }).not.toThrow();
  });
});
