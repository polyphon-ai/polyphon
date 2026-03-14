import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { fetchModelsForProvider } from './settingsHandlers';

// Inject test API keys so resolveApiKey succeeds without real credentials
beforeAll(() => {
  process.env.POLYPHON_ANTHROPIC_API_KEY = 'test-anthropic-key';
  process.env.POLYPHON_OPENAI_API_KEY = 'test-openai-key';
  process.env.POLYPHON_GEMINI_API_KEY = 'test-gemini-key';
});

afterAll(() => {
  delete process.env.POLYPHON_ANTHROPIC_API_KEY;
  delete process.env.POLYPHON_OPENAI_API_KEY;
  delete process.env.POLYPHON_GEMINI_API_KEY;
});

beforeEach(() => {
  vi.restoreAllMocks();
});

function mockFetch(body: unknown, ok = true, status = ok ? 200 : 400) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok, status, json: async () => body }),
  );
}

describe('fetchModelsForProvider — anthropic', () => {
  it('returns model ids from the Anthropic models endpoint', async () => {
    mockFetch({
      data: [
        { id: 'claude-opus-4-6' },
        { id: 'claude-sonnet-4-5' },
        { id: 'claude-haiku-4-5-20251001' },
      ],
    });

    const result = await fetchModelsForProvider('anthropic');
    expect(result.error).toBeUndefined();
    expect(result.models).toEqual([
      'claude-opus-4-6',
      'claude-sonnet-4-5',
      'claude-haiku-4-5-20251001',
    ]);
  });

  it('calls the correct endpoint with required headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await fetchModelsForProvider('anthropic');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/models',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-api-key': 'test-anthropic-key',
          'anthropic-version': '2023-06-01',
        }),
      }),
    );
  });

  it('returns an error when the API responds with a non-ok status', async () => {
    mockFetch({ error: 'Unauthorized' }, false, 401);

    const result = await fetchModelsForProvider('anthropic');
    expect(result.models).toEqual([]);
    expect(result.error).toContain('401');
  });
});

describe('fetchModelsForProvider — openai', () => {
  it('returns only gpt/o-series model ids, sorted', async () => {
    mockFetch({
      data: [
        { id: 'gpt-4o' },
        { id: 'gpt-4o-mini' },
        { id: 'o3-mini' },
        { id: 'whisper-1' },
        { id: 'text-embedding-3-large' },
        { id: 'dall-e-3' },
      ],
    });

    const result = await fetchModelsForProvider('openai');
    expect(result.error).toBeUndefined();
    expect(result.models).toContain('gpt-4o');
    expect(result.models).toContain('gpt-4o-mini');
    expect(result.models).toContain('o3-mini');
    expect(result.models).not.toContain('whisper-1');
    expect(result.models).not.toContain('text-embedding-3-large');
    expect(result.models).not.toContain('dall-e-3');
  });

  it('calls the OpenAI endpoint with Bearer auth', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await fetchModelsForProvider('openai');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/models',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-openai-key',
        }),
      }),
    );
  });

  it('returns an error when the API responds with a non-ok status', async () => {
    mockFetch({}, false, 429);

    const result = await fetchModelsForProvider('openai');
    expect(result.models).toEqual([]);
    expect(result.error).toContain('429');
  });
});

describe('fetchModelsForProvider — gemini', () => {
  it('returns only generateContent models with prefix stripped', async () => {
    mockFetch({
      models: [
        {
          name: 'models/gemini-2.5-flash',
          supportedGenerationMethods: ['generateContent', 'countTokens'],
        },
        {
          name: 'models/gemini-2.5-pro',
          supportedGenerationMethods: ['generateContent'],
        },
        {
          name: 'models/embedding-001',
          supportedGenerationMethods: ['embedContent'],
        },
      ],
    });

    const result = await fetchModelsForProvider('gemini');
    expect(result.error).toBeUndefined();
    expect(result.models).toContain('gemini-2.5-flash');
    expect(result.models).toContain('gemini-2.5-pro');
    expect(result.models).not.toContain('embedding-001');
    expect(result.models).not.toContain('models/gemini-2.5-flash');
  });

  it('filters out models whose description contains "deprecated"', async () => {
    mockFetch({
      models: [
        {
          name: 'models/gemini-2.5-flash',
          supportedGenerationMethods: ['generateContent'],
        },
        {
          name: 'models/gemini-2.0-flash',
          description: 'Deprecated. Use gemini-2.5-flash instead.',
          supportedGenerationMethods: ['generateContent'],
        },
      ],
    });

    const result = await fetchModelsForProvider('gemini');
    expect(result.models).toContain('gemini-2.5-flash');
    expect(result.models).not.toContain('gemini-2.0-flash');
  });

  it('filters out versioned variants when a bare alias exists', async () => {
    mockFetch({
      models: [
        {
          name: 'models/gemini-2.5-flash',
          supportedGenerationMethods: ['generateContent'],
        },
        {
          name: 'models/gemini-2.5-flash-001',
          supportedGenerationMethods: ['generateContent'],
        },
        {
          name: 'models/gemini-2.5-pro',
          supportedGenerationMethods: ['generateContent'],
        },
      ],
    });

    const result = await fetchModelsForProvider('gemini');
    expect(result.models).toContain('gemini-2.5-flash');
    expect(result.models).not.toContain('gemini-2.5-flash-001');
    expect(result.models).toContain('gemini-2.5-pro');
  });

  it('calls the Gemini endpoint with the API key as a query param', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ models: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await fetchModelsForProvider('gemini');

    const calledUrl = fetchMock.mock.calls[0]![0] as string;
    expect(calledUrl).toContain('https://generativelanguage.googleapis.com/v1beta/models');
    expect(calledUrl).toContain('key=test-gemini-key');
  });

  it('returns an error when the API responds with a non-ok status', async () => {
    mockFetch({}, false, 403);

    const result = await fetchModelsForProvider('gemini');
    expect(result.models).toEqual([]);
    expect(result.error).toContain('403');
  });
});

describe('fetchModelsForProvider — edge cases', () => {
  it('returns an error for unsupported providers', async () => {
    const result = await fetchModelsForProvider('copilot');
    expect(result.models).toEqual([]);
    expect(result.error).toContain('not supported');
  });

  it('returns an error when no API key is configured', async () => {
    delete process.env.POLYPHON_ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    const result = await fetchModelsForProvider('anthropic');
    expect(result.models).toEqual([]);
    expect(result.error).toContain('No API key found');

    // Restore for other tests
    process.env.POLYPHON_ANTHROPIC_API_KEY = 'test-anthropic-key';
  });

  it('returns an error when fetch throws (network failure)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const result = await fetchModelsForProvider('anthropic');
    expect(result.models).toEqual([]);
    expect(result.error).toContain('Network error');
  });
});
