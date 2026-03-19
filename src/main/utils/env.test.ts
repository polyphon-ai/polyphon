import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('electron-log/main', () => ({
  default: {
    initialize: vi.fn(),
    create: vi.fn(() => ({
      initialize: vi.fn(),
      transports: { file: {}, console: {} },
      error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(),
    })),
    transports: { file: {}, console: {}, ipc: {}, remote: {} },
    error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(),
  },
}));

import { maskApiKey, resolveApiKey, resolveApiKeyStatus, parseNulEnvBlock, SHELL_ENV_MAX_LEN, ENV_VALUE_MAX_BYTES } from './env';
import { logger } from './logger';

describe('maskApiKey', () => {
  it('masks a normal key with first 3 and last 3 chars', () => {
    expect(maskApiKey('sk-ant-abcXYZ')).toBe('sk-...XYZ');
  });

  it('returns ... for keys shorter than 7 chars', () => {
    expect(maskApiKey('abc')).toBe('...');
    expect(maskApiKey('abcdef')).toBe('...');
  });

  it('masks exactly 7 chars (first 3 + ... + last 3)', () => {
    expect(maskApiKey('abcdefg')).toBe('abc...efg');
  });
});

describe('resolveApiKey', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('resolves the specific POLYPHON_ prefixed key', () => {
    vi.stubEnv('POLYPHON_ANTHROPIC_API_KEY', 'specific-key-value');
    expect(resolveApiKey('anthropic')).toBe('specific-key-value');
  });

  it('trims whitespace from the resolved key', () => {
    vi.stubEnv('POLYPHON_ANTHROPIC_API_KEY', '  trimmed  ');
    expect(resolveApiKey('anthropic')).toBe('trimmed');
  });

  it('falls back to the provider key when POLYPHON_ key is absent', () => {
    vi.stubEnv('POLYPHON_ANTHROPIC_API_KEY', '');
    vi.stubEnv('ANTHROPIC_API_KEY', 'fallback-key-value');
    expect(resolveApiKey('anthropic')).toBe('fallback-key-value');
  });

  it('prefers the specific POLYPHON_ key over the fallback', () => {
    vi.stubEnv('POLYPHON_ANTHROPIC_API_KEY', 'specific');
    vi.stubEnv('ANTHROPIC_API_KEY', 'fallback');
    expect(resolveApiKey('anthropic')).toBe('specific');
  });

  it('throws with a helpful message when neither key is set', () => {
    // Use a fake provider name guaranteed not to have env vars set
    expect(() => resolveApiKey('nonexistent-provider-xyz')).toThrow(
      'No API key found for provider "nonexistent-provider-xyz"',
    );
  });

  it('handles hyphenated provider names (normalises to SNAKE_CASE)', () => {
    vi.stubEnv('POLYPHON_OPENAI_COMPAT_API_KEY', 'compat-key');
    expect(resolveApiKey('openai-compat')).toBe('compat-key');
  });
});

// ---------------------------------------------------------------------------
// parseNulEnvBlock
// ---------------------------------------------------------------------------

describe('parseNulEnvBlock', () => {
  afterEach(() => {
    delete process.env['KEY'];
    delete process.env['KEY2'];
    delete process.env['MY_KEY'];
    delete process.env['MY_KEY2'];
    delete process.env['NOEQUALS'];
  });

  it('happy path: merges standard uppercase keys and returns true', () => {
    const block = 'KEY=value\0KEY2=value2\0';
    expect(parseNulEnvBlock(block)).toBe(true);
    expect(process.env['KEY']).toBe('value');
    expect(process.env['KEY2']).toBe('value2');
  });

  it('empty block: no writes, no crash, returns true', () => {
    expect(parseNulEnvBlock('')).toBe(true);
  });

  it('key with lowercase letters: not written, returns true, warns with key name', () => {
    const debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => {});
    const result = parseNulEnvBlock('my_key=value\0');
    expect(result).toBe(true);
    expect(process.env['my_key']).toBeUndefined();
    expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining('non-standard'), expect.objectContaining({ key: 'my_key' }));
    debugSpy.mockRestore();
  });

  it('key with dot: not written, returns true', () => {
    const result = parseNulEnvBlock('MY.KEY=value\0');
    expect(result).toBe(true);
    expect(process.env['MY.KEY']).toBeUndefined();
  });

  it('key with space: not written, returns true', () => {
    const result = parseNulEnvBlock('MY KEY=value\0');
    expect(result).toBe(true);
    expect(process.env['MY KEY']).toBeUndefined();
  });

  it('empty key (entry starts with =): skipped, returns true', () => {
    const before = { ...process.env };
    const result = parseNulEnvBlock('=value\0');
    expect(result).toBe(true);
    expect(Object.keys(process.env).length).toBe(Object.keys(before).length);
  });

  it('no = in entry: skipped, no crash, returns true', () => {
    const result = parseNulEnvBlock('NOEQUALS\0');
    expect(result).toBe(true);
    expect(process.env['NOEQUALS']).toBeUndefined();
  });

  it('value exactly at limit: written, returns true', () => {
    const value = 'A'.repeat(ENV_VALUE_MAX_BYTES);
    const result = parseNulEnvBlock(`KEY=${value}\0`);
    expect(result).toBe(true);
    expect(process.env['KEY']).toBe(value);
  });

  it('value over limit: not written, returns true, warns with key name', () => {
    const debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => {});
    const value = 'A'.repeat(ENV_VALUE_MAX_BYTES + 1);
    const result = parseNulEnvBlock(`KEY=${value}\0`);
    expect(result).toBe(true);
    expect(process.env['KEY']).toBeUndefined();
    expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining('oversized'), expect.objectContaining({ key: 'KEY' }));
    debugSpy.mockRestore();
  });

  it('multi-= value: splits on first = only, returns true', () => {
    const result = parseNulEnvBlock('KEY=a=b=c\0');
    expect(result).toBe(true);
    expect(process.env['KEY']).toBe('a=b=c');
  });

  it('empty value: written as empty string, returns true', () => {
    const result = parseNulEnvBlock('KEY=\0');
    expect(result).toBe(true);
    expect(process.env['KEY']).toBe('');
  });

  it('size cap: no writes, returns false, logger.debug called with "size cap"', () => {
    const debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => {});
    const block = 'A'.repeat(SHELL_ENV_MAX_LEN + 1);
    const result = parseNulEnvBlock(block);
    expect(result).toBe(false);
    expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining('size cap'));
    debugSpy.mockRestore();
  });

  it('handles values containing newlines (NUL delimited is immune to this)', () => {
    const block = 'KEY=line1\nline2\0';
    expect(parseNulEnvBlock(block)).toBe(true);
    expect(process.env['KEY']).toBe('line1\nline2');
  });

  it('handles values containing the old delimiter string', () => {
    const block = 'KEY=_POLYPHON_ENV_DELIM_\0';
    expect(parseNulEnvBlock(block)).toBe(true);
    expect(process.env['KEY']).toBe('_POLYPHON_ENV_DELIM_');
  });
});

describe('resolveApiKeyStatus', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('returns status=specific when POLYPHON_ key is set', () => {
    vi.stubEnv('POLYPHON_ANTHROPIC_API_KEY', 'sk-ant-abc123xyz456');
    const result = resolveApiKeyStatus('anthropic');
    expect(result.status).toBe('specific');
    expect((result as Extract<typeof result, { status: 'specific' }>).varName).toBe('POLYPHON_ANTHROPIC_API_KEY');
    // maskedKey should be present on specific/fallback results
    if (result.status === 'specific') {
      expect(result.maskedKey).toBe('sk-...456');
    }
  });

  it('returns status=fallback when only the provider key is set', () => {
    vi.stubEnv('POLYPHON_ANTHROPIC_API_KEY', '');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-abc123xyz456');
    const result = resolveApiKeyStatus('anthropic');
    expect(result.status).toBe('fallback');
    expect((result as Extract<typeof result, { status: 'fallback' }>).varName).toBe('ANTHROPIC_API_KEY');
    if (result.status === 'fallback') {
      expect(result.maskedKey).toBe('sk-...456');
    }
  });

  it('returns status=none when no key is set', () => {
    const result = resolveApiKeyStatus('nonexistent-provider-xyz');
    expect(result.status).toBe('none');
    if (result.status === 'none') {
      expect(result.specificVar).toBe('POLYPHON_NONEXISTENT_PROVIDER_XYZ_API_KEY');
      expect(result.fallbackVar).toBe('NONEXISTENT_PROVIDER_XYZ_API_KEY');
    }
  });

  it('does not throw even when no key is found', () => {
    expect(() => resolveApiKeyStatus('nonexistent-xyz')).not.toThrow();
  });
});
