import { describe, it, expect, afterEach, vi } from 'vitest';
import { maskApiKey, resolveApiKey, resolveApiKeyStatus } from './env';

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
