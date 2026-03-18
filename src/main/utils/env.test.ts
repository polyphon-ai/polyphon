import { describe, it, expect, afterEach, vi } from 'vitest';
import { maskApiKey, resolveApiKey, resolveApiKeyStatus, parseEnvBlock, parseNulEnvBlock, SHELL_ENV_MAX_LEN, ENV_VALUE_MAX_BYTES } from './env';

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
    vi.stubEnv('POLYPHON_CLAUDE_CODE_API_KEY', 'cli-key');
    expect(resolveApiKey('claude-code')).toBe('cli-key');
  });
});

describe('parseEnvBlock', () => {
  afterEach(() => {
    delete process.env['KEY'];
    delete process.env['KEY2'];
    delete process.env['MY_KEY'];
    delete process.env['MY_KEY2'];
  });

  it('happy path: merges standard uppercase keys and returns true', () => {
    const result = parseEnvBlock('KEY=value\nKEY2=value2\n');
    expect(result).toBe(true);
    expect(process.env['KEY']).toBe('value');
    expect(process.env['KEY2']).toBe('value2');
  });

  it('empty block: no writes, no crash, returns true', () => {
    const result = parseEnvBlock('');
    expect(result).toBe(true);
  });

  it('key with lowercase letters: not written, returns true, warns with key name', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = parseEnvBlock('my_key=value');
    expect(result).toBe(true);
    expect(process.env['my_key']).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('my_key'));
    warnSpy.mockRestore();
  });

  it('key with dot: not written, returns true', () => {
    const result = parseEnvBlock('MY.KEY=value');
    expect(result).toBe(true);
    expect(process.env['MY.KEY']).toBeUndefined();
  });

  it('key with space: not written, returns true', () => {
    const result = parseEnvBlock('MY KEY=value');
    expect(result).toBe(true);
    expect(process.env['MY KEY']).toBeUndefined();
  });

  it('empty key (line starts with =): skipped, returns true', () => {
    const before = { ...process.env };
    const result = parseEnvBlock('=value');
    expect(result).toBe(true);
    // no new keys should have been added
    expect(Object.keys(process.env).length).toBe(Object.keys(before).length);
  });

  it('no = in line: skipped, no crash, returns true', () => {
    const result = parseEnvBlock('NOEQUALS');
    expect(result).toBe(true);
    expect(process.env['NOEQUALS']).toBeUndefined();
  });

  it('value exactly at limit: written, returns true', () => {
    const value = 'A'.repeat(ENV_VALUE_MAX_BYTES);
    const result = parseEnvBlock(`KEY=${value}`);
    expect(result).toBe(true);
    expect(process.env['KEY']).toBe(value);
  });

  it('value over limit: not written, returns true, warns with key name', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const value = 'A'.repeat(ENV_VALUE_MAX_BYTES + 1);
    const result = parseEnvBlock(`KEY=${value}`);
    expect(result).toBe(true);
    expect(process.env['KEY']).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('KEY'));
    warnSpy.mockRestore();
  });

  it('multi-= value: splits on first = only, returns true', () => {
    const result = parseEnvBlock('KEY=a=b=c');
    expect(result).toBe(true);
    expect(process.env['KEY']).toBe('a=b=c');
  });

  it('empty value: written as empty string, returns true', () => {
    const result = parseEnvBlock('KEY=');
    expect(result).toBe(true);
    expect(process.env['KEY']).toBe('');
  });

  it('size cap: no writes, returns false, console.warn called with "size cap"', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const block = 'A'.repeat(SHELL_ENV_MAX_LEN + 1);
    const result = parseEnvBlock(block);
    expect(result).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('size cap'));
    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// parseNulEnvBlock
// ---------------------------------------------------------------------------

describe('parseNulEnvBlock', () => {
  afterEach(() => {
    delete process.env['KEY'];
    delete process.env['KEY2'];
  });

  it('parses NUL-terminated entries from env -0 output', () => {
    const block = 'KEY=value\0KEY2=value2\0';
    expect(parseNulEnvBlock(block)).toBe(true);
    expect(process.env['KEY']).toBe('value');
    expect(process.env['KEY2']).toBe('value2');
  });

  it('handles values containing newlines (which would break delimiter approach)', () => {
    const block = 'KEY=line1\nline2\0';
    expect(parseNulEnvBlock(block)).toBe(true);
    expect(process.env['KEY']).toBe('line1\nline2');
  });

  it('handles values containing the old delimiter string', () => {
    const block = 'KEY=_POLYPHON_ENV_DELIM_\0';
    expect(parseNulEnvBlock(block)).toBe(true);
    expect(process.env['KEY']).toBe('_POLYPHON_ENV_DELIM_');
  });

  it('applies the same key filter as parseEnvBlock', () => {
    const block = 'my_key=value\0';
    expect(parseNulEnvBlock(block)).toBe(true);
    expect(process.env['my_key']).toBeUndefined();
  });

  it('applies the same value length cap as parseEnvBlock', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const value = 'A'.repeat(ENV_VALUE_MAX_BYTES + 1);
    expect(parseNulEnvBlock(`KEY=${value}\0`)).toBe(true);
    expect(process.env['KEY']).toBeUndefined();
    warnSpy.mockRestore();
  });

  it('returns false and warns when block exceeds size cap', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const block = 'A'.repeat(SHELL_ENV_MAX_LEN + 1);
    expect(parseNulEnvBlock(block)).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('size cap'));
    warnSpy.mockRestore();
  });

  it('empty block: no crash, returns true', () => {
    expect(parseNulEnvBlock('')).toBe(true);
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
