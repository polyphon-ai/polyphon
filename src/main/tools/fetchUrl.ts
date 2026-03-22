import type { ToolDefinition } from './types';

const MAX_RESPONSE_BYTES = 50 * 1024;
const TIMEOUT_MS = 10_000;

export const fetchUrlTool: ToolDefinition = {
  name: 'fetch_url',
  description:
    'Fetch the content of a URL via HTTP GET and return the response body as text. Only http and https schemes are supported.',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The URL to fetch. Must use http or https scheme.',
      },
    },
    required: ['url'],
  },
  async execute(args) {
    const rawUrl = String(args['url'] ?? '').trim();
    if (!rawUrl) return 'Error: url is required.';

    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return `Error: invalid URL: ${rawUrl}`;
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return `Error: unsupported scheme "${parsed.protocol}" — only http and https are allowed.`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(rawUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const truncated = bytes.length > MAX_RESPONSE_BYTES;
      const slice = truncated ? bytes.slice(0, MAX_RESPONSE_BYTES) : bytes;
      const text = new TextDecoder('utf-8', { fatal: false }).decode(slice);
      return truncated ? `${text}\n... (response truncated at 50 KB)` : text;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === 'AbortError') {
        return 'Error: request timed out after 10 seconds.';
      }
      return `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};
