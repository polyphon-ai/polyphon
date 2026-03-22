import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchUrlTool } from './fetchUrl';

afterEach(() => vi.restoreAllMocks());

function makeFetchResponse(body: string, opts: { ok?: boolean; status?: number } = {}): Response {
  return {
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    arrayBuffer: async () => {
      const encoder = new TextEncoder();
      return encoder.encode(body).buffer as ArrayBuffer;
    },
  } as unknown as Response;
}

describe('fetchUrlTool.execute()', () => {
  it('fetches and returns response text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeFetchResponse('<html>Hello</html>')));

    const result = await fetchUrlTool.execute({ url: 'https://example.com' });
    expect(result).toBe('<html>Hello</html>');
  });

  it('truncates large responses at 50 KB', async () => {
    const big = 'x'.repeat(60 * 1024);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeFetchResponse(big)));

    const result = await fetchUrlTool.execute({ url: 'https://example.com' });
    expect(result).toContain('... (response truncated at 50 KB)');
    expect(result.length).toBeLessThan(big.length);
  });

  it('rejects non-http schemes', async () => {
    const result = await fetchUrlTool.execute({ url: 'ftp://example.com/file' });
    expect(result).toContain('unsupported scheme');
  });

  it('returns error for invalid URL', async () => {
    const result = await fetchUrlTool.execute({ url: 'not-a-url' });
    expect(result).toContain('Error: invalid URL');
  });

  it('returns error for empty url', async () => {
    const result = await fetchUrlTool.execute({ url: '' });
    expect(result).toBe('Error: url is required.');
  });

  it('returns timeout error on AbortError', async () => {
    const abortErr = new Error('aborted');
    abortErr.name = 'AbortError';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortErr));

    const result = await fetchUrlTool.execute({ url: 'https://slow.example.com' });
    expect(result).toContain('timed out');
  });

  it('returns error on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network failure')));

    const result = await fetchUrlTool.execute({ url: 'https://down.example.com' });
    expect(result).toContain('Error: network failure');
  });
});
