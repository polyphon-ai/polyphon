import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/test-userData' },
}));

vi.mock('electron-log/main', () => ({
  default: {
    initialize: vi.fn(),
    create: vi.fn(() => ({
      initialize: vi.fn(),
      transports: { file: {}, console: {} },
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    })),
    transports: { file: {}, console: {}, ipc: {}, remote: {} },
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import { SENSITIVE_LOG_KEYS, sanitizeValue, sanitizeLogArgs } from './logger';

describe('SENSITIVE_LOG_KEYS', () => {
  const expectedSnake = [
    'content', 'metadata',
    'conductor_name', 'pronouns', 'conductor_context', 'conductor_avatar',
    'base_url',
    'system_prompt', 'cli_args', 'cli_command',
    'description',
  ];
  const expectedCamel = [
    'conductorName', 'conductorContext', 'conductorAvatar',
    'baseUrl', 'systemPrompt', 'cliArgs', 'cliCommand',
  ];
  const expectedExtras = ['apiKey', 'api_key', 'authorization', 'Authorization', 'x-api-key', 'x-goog-api-key'];

  for (const key of [...expectedSnake, ...expectedCamel, ...expectedExtras]) {
    it(`contains '${key}'`, () => {
      expect(SENSITIVE_LOG_KEYS.has(key)).toBe(true);
    });
  }
});

describe('sanitizeValue — strings', () => {
  it('passes plain strings through', () => {
    expect(sanitizeValue('hello')).toBe('hello');
  });

  it('redacts sk- API keys', () => {
    expect(sanitizeValue('sk-proj-abc')).toBe('[REDACTED]');
  });

  it('redacts sk-ant- keys', () => {
    expect(sanitizeValue('sk-ant-api03-xyz')).toBe('[REDACTED]');
  });

  it('redacts AIza keys', () => {
    expect(sanitizeValue('AIzaSyABC')).toBe('[REDACTED]');
  });

  it('redacts Bearer tokens', () => {
    const result = sanitizeValue('Bearer ghp_abc123') as string;
    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain('ghp_abc123');
  });

  it('redacts github_pat_ tokens', () => {
    expect(sanitizeValue('github_pat_XYZ')).toBe('[REDACTED]');
  });

  it('redacts ghp_ tokens', () => {
    expect(sanitizeValue('ghp_ABC')).toBe('[REDACTED]');
  });
});

describe('sanitizeValue — PII key redaction', () => {
  it('redacts conductorName', () => {
    expect(sanitizeValue({ conductorName: 'Alice' })).toEqual({ conductorName: '[REDACTED]' });
  });
  it('redacts conductor_name', () => {
    expect(sanitizeValue({ conductor_name: 'Alice' })).toEqual({ conductor_name: '[REDACTED]' });
  });
  it('redacts pronouns', () => {
    expect(sanitizeValue({ pronouns: 'she/her' })).toEqual({ pronouns: '[REDACTED]' });
  });
  it('redacts conductorContext', () => {
    expect(sanitizeValue({ conductorContext: 'I am...' })).toEqual({ conductorContext: '[REDACTED]' });
  });
  it('redacts conductor_context', () => {
    expect(sanitizeValue({ conductor_context: 'I am...' })).toEqual({ conductor_context: '[REDACTED]' });
  });
  it('redacts conductorAvatar', () => {
    expect(sanitizeValue({ conductorAvatar: 'data:...' })).toEqual({ conductorAvatar: '[REDACTED]' });
  });
  it('redacts conductor_avatar', () => {
    expect(sanitizeValue({ conductor_avatar: 'data:...' })).toEqual({ conductor_avatar: '[REDACTED]' });
  });
  it('redacts content', () => {
    expect(sanitizeValue({ content: 'message text' })).toEqual({ content: '[REDACTED]' });
  });
  it('redacts metadata', () => {
    expect(sanitizeValue({ metadata: '{}' })).toEqual({ metadata: '[REDACTED]' });
  });
  it('redacts base_url', () => {
    expect(sanitizeValue({ base_url: 'http://...' })).toEqual({ base_url: '[REDACTED]' });
  });
  it('redacts baseUrl', () => {
    expect(sanitizeValue({ baseUrl: 'http://...' })).toEqual({ baseUrl: '[REDACTED]' });
  });
  it('redacts systemPrompt', () => {
    expect(sanitizeValue({ systemPrompt: 'You are...' })).toEqual({ systemPrompt: '[REDACTED]' });
  });
  it('redacts system_prompt', () => {
    expect(sanitizeValue({ system_prompt: 'You are...' })).toEqual({ system_prompt: '[REDACTED]' });
  });
  it('redacts cliArgs', () => {
    expect(sanitizeValue({ cliArgs: '--flag' })).toEqual({ cliArgs: '[REDACTED]' });
  });
  it('redacts cli_args', () => {
    expect(sanitizeValue({ cli_args: '--flag' })).toEqual({ cli_args: '[REDACTED]' });
  });
  it('redacts cliCommand', () => {
    expect(sanitizeValue({ cliCommand: 'claude' })).toEqual({ cliCommand: '[REDACTED]' });
  });
  it('redacts cli_command', () => {
    expect(sanitizeValue({ cli_command: 'claude' })).toEqual({ cli_command: '[REDACTED]' });
  });
  it('redacts description', () => {
    expect(sanitizeValue({ description: 'A tone desc' })).toEqual({ description: '[REDACTED]' });
  });
  it('redacts apiKey', () => {
    expect(sanitizeValue({ apiKey: 'sk-...' })).toEqual({ apiKey: '[REDACTED]' });
  });
  it('redacts authorization', () => {
    expect(sanitizeValue({ authorization: 'Bearer ...' })).toEqual({ authorization: '[REDACTED]' });
  });
});

describe('sanitizeValue — safe keys not redacted', () => {
  it('leaves safe fields unchanged', () => {
    const input = { sessionId: 'abc', provider: 'anthropic', model: 'claude-3-5', role: 'voice' };
    expect(sanitizeValue(input)).toEqual(input);
  });
});

describe('sanitizeValue — structural cases', () => {
  it('redacts nested sensitive keys', () => {
    expect(sanitizeValue({ voice: { systemPrompt: 'secret', model: 'gpt-4o' } })).toEqual({
      voice: { systemPrompt: '[REDACTED]', model: 'gpt-4o' },
    });
  });

  it('handles arrays with mixed objects and strings', () => {
    expect(sanitizeValue([{ conductorName: 'Alice' }, 'hello'])).toEqual([
      { conductorName: '[REDACTED]' },
      'hello',
    ]);
  });

  it('hits depth limit at level 6', () => {
    // Build object nested 7 levels deep: { a: { a: { a: { a: { a: { a: { a: 'deep' }}}}}}}
    const deep = { a: { a: { a: { a: { a: { a: { a: 'deep' } } } } } } };
    const result = sanitizeValue(deep) as { a: { a: { a: { a: { a: { a: unknown } } } } } };
    expect(result.a.a.a.a.a.a).toBe('[DEPTH LIMIT]');
  });

  it('handles circular references without throwing', () => {
    const o: Record<string, unknown> = {};
    o.self = o;
    expect(() => sanitizeValue(o)).not.toThrow();
    const result = sanitizeValue(o) as Record<string, unknown>;
    expect(result.self).toBe('[Circular]');
  });

  it('serializes Error without stack', () => {
    const err = new Error('hello');
    const result = sanitizeValue(err) as Record<string, unknown>;
    expect(result.name).toBe('Error');
    expect(result.message).toBe('hello');
    expect(result.stack).toBeUndefined();
  });

  it('serializes Buffer with length', () => {
    expect(sanitizeValue(Buffer.from('abc'))).toBe('[BUFFER length=3]');
  });

  it('serializes Map', () => {
    const m = new Map([['a', 1], ['b', 2]]);
    expect(sanitizeValue(m)).toBe('[Map size=2]');
  });

  it('serializes Set', () => {
    const s = new Set([1, 2, 3]);
    expect(sanitizeValue(s)).toBe('[Set size=3]');
  });

  it('serializes Date to ISO string', () => {
    const d = new Date('2024-01-01T00:00:00.000Z');
    expect(sanitizeValue(d)).toBe('2024-01-01T00:00:00.000Z');
  });

  it('serializes class instances to [ClassName]', () => {
    class Foo {}
    expect(sanitizeValue(new Foo())).toBe('[Foo]');
  });

  it('passes through numbers', () => {
    expect(sanitizeValue(42)).toBe(42);
  });

  it('passes through booleans', () => {
    expect(sanitizeValue(true)).toBe(true);
  });

  it('passes through null', () => {
    expect(sanitizeValue(null)).toBeNull();
  });

  it('passes through undefined', () => {
    expect(sanitizeValue(undefined)).toBeUndefined();
  });
});

describe('sanitizeValue — non-mutation', () => {
  it('does not mutate caller objects', () => {
    const o = { conductorName: 'Alice' };
    sanitizeValue(o);
    expect(o.conductorName).toBe('Alice');
  });
});

describe('sanitizeLogArgs', () => {
  it('sanitizes all args in array', () => {
    const result = sanitizeLogArgs(['hello', { conductorName: 'Alice' }]);
    expect(result).toEqual(['hello', { conductorName: '[REDACTED]' }]);
  });
});
