import { describe, it, expect } from 'vitest';
import {
  requireId,
  requireString,
  requireNonEmptyString,
  requireEnum,
  coerceBoolean,
  requireInteger,
  requireCliCommand,
  requireUrl,
  requireArray,
  requireObject,
  requireMessageShape,
  requireCompositionData,
  requirePartialCompositionData,
  requireUserProfileShape,
  requireAvatarValue,
  UUID_RE,
  CLI_COMMAND_RE,
  MAX_AVATAR,
} from './validate';

const VALID_UUID = '12345678-1234-1234-1234-123456789abc';
const VALID_UUID_2 = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

// ---------------------------------------------------------------------------
// requireId
// ---------------------------------------------------------------------------

describe('requireId', () => {
  it('accepts a valid UUID', () => {
    expect(requireId(VALID_UUID, 'id')).toBe(VALID_UUID);
  });

  it('accepts an uppercase UUID', () => {
    expect(requireId(VALID_UUID.toUpperCase(), 'id')).toBe(VALID_UUID.toUpperCase());
  });

  it('throws for empty string', () => {
    expect(() => requireId('', 'id')).toThrow('Invalid id: must be a valid UUID');
  });

  it('throws for null', () => {
    expect(() => requireId(null, 'id')).toThrow('Invalid id: must be a valid UUID');
  });

  it('throws for undefined', () => {
    expect(() => requireId(undefined, 'id')).toThrow('Invalid id: must be a valid UUID');
  });

  it('throws for short non-UUID "comp-1"', () => {
    expect(() => requireId('comp-1', 'id')).toThrow('Invalid id: must be a valid UUID');
  });

  it('throws for "not-a-uuid"', () => {
    expect(() => requireId('not-a-uuid', 'id')).toThrow('Invalid id: must be a valid UUID');
  });

  it('includes the field name in the error', () => {
    expect(() => requireId('bad', 'compositionId')).toThrow('Invalid compositionId: must be a valid UUID');
  });

  it('UUID_RE export matches valid UUIDs', () => {
    expect(UUID_RE.test(VALID_UUID)).toBe(true);
    expect(UUID_RE.test('not-a-uuid')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// requireString
// ---------------------------------------------------------------------------

describe('requireString', () => {
  it('accepts a valid string', () => {
    expect(requireString('hello', 'name', 100)).toBe('hello');
  });

  it('accepts an empty string', () => {
    expect(requireString('', 'name', 100)).toBe('');
  });

  it('accepts a string at exactly maxLength characters', () => {
    const str = 'a'.repeat(100);
    expect(requireString(str, 'name', 100)).toBe(str);
  });

  it('throws for a string one over maxLength', () => {
    const str = 'a'.repeat(101);
    expect(() => requireString(str, 'name', 100)).toThrow('name exceeds maximum length of 100');
  });

  it('throws for non-string (number)', () => {
    expect(() => requireString(42, 'name', 100)).toThrow('Invalid name: must be a string');
  });

  it('throws for null', () => {
    expect(() => requireString(null, 'name', 100)).toThrow('Invalid name: must be a string');
  });
});

// ---------------------------------------------------------------------------
// requireNonEmptyString
// ---------------------------------------------------------------------------

describe('requireNonEmptyString', () => {
  it('accepts a non-empty string', () => {
    expect(requireNonEmptyString('hello', 'name', 100)).toBe('hello');
  });

  it('throws for empty string', () => {
    expect(() => requireNonEmptyString('', 'name', 100)).toThrow('name is required');
  });

  it('throws for whitespace-only string', () => {
    expect(() => requireNonEmptyString('   ', 'name', 100)).toThrow('name is required');
  });

  it('throws for over-length string', () => {
    const str = 'a'.repeat(101);
    expect(() => requireNonEmptyString(str, 'name', 100)).toThrow('name exceeds maximum length of 100');
  });
});

// ---------------------------------------------------------------------------
// requireEnum
// ---------------------------------------------------------------------------

describe('requireEnum', () => {
  const modes = ['conductor', 'broadcast'] as const;

  it('accepts a valid enum value', () => {
    expect(requireEnum('broadcast', 'mode', modes)).toBe('broadcast');
  });

  it('throws for an invalid value with all options in message', () => {
    expect(() => requireEnum('roundrobin', 'mode', modes)).toThrow(
      'Invalid mode: must be one of: conductor, broadcast',
    );
  });

  it('throws for null', () => {
    expect(() => requireEnum(null, 'mode', modes)).toThrow('Invalid mode: must be one of:');
  });

  it('includes all allowed values in error message', () => {
    const policies = ['none', 'prompt', 'auto'] as const;
    expect(() => requireEnum('always', 'continuationPolicy', policies)).toThrow(
      'must be one of: none, prompt, auto',
    );
  });
});

// ---------------------------------------------------------------------------
// coerceBoolean
// ---------------------------------------------------------------------------

describe('coerceBoolean', () => {
  it('passes through true', () => {
    expect(coerceBoolean(true, 'archived')).toBe(true);
  });

  it('passes through false', () => {
    expect(coerceBoolean(false, 'archived')).toBe(false);
  });

  it('coerces 1 to true', () => {
    expect(coerceBoolean(1, 'archived')).toBe(true);
  });

  it('coerces "1" to true', () => {
    expect(coerceBoolean('1', 'archived')).toBe(true);
  });

  it('coerces "true" to true', () => {
    expect(coerceBoolean('true', 'archived')).toBe(true);
  });

  it('coerces 0 to false', () => {
    expect(coerceBoolean(0, 'archived')).toBe(false);
  });

  it('coerces "0" to false', () => {
    expect(coerceBoolean('0', 'archived')).toBe(false);
  });

  it('coerces "false" to false', () => {
    expect(coerceBoolean('false', 'archived')).toBe(false);
  });

  it('coerces undefined to false', () => {
    expect(coerceBoolean(undefined, 'archived')).toBe(false);
  });

  it('coerces null to false', () => {
    expect(coerceBoolean(null, 'archived')).toBe(false);
  });

  it('throws for "yes"', () => {
    expect(() => coerceBoolean('yes', 'archived')).toThrow('Invalid archived: must be a boolean');
  });

  it('throws for an object', () => {
    expect(() => coerceBoolean({}, 'archived')).toThrow('Invalid archived: must be a boolean');
  });

  it('throws for an array', () => {
    expect(() => coerceBoolean([], 'archived')).toThrow('Invalid archived: must be a boolean');
  });
});

// ---------------------------------------------------------------------------
// requireInteger
// ---------------------------------------------------------------------------

describe('requireInteger', () => {
  it('accepts an integer within range', () => {
    expect(requireInteger(2, 'rounds', 1, 3)).toBe(2);
  });

  it('accepts the minimum boundary value', () => {
    expect(requireInteger(1, 'rounds', 1, 3)).toBe(1);
  });

  it('accepts the maximum boundary value', () => {
    expect(requireInteger(3, 'rounds', 1, 3)).toBe(3);
  });

  it('throws for value below min', () => {
    expect(() => requireInteger(0, 'rounds', 1, 3)).toThrow('must be an integer between 1 and 3');
  });

  it('throws for value above max', () => {
    expect(() => requireInteger(4, 'rounds', 1, 3)).toThrow('must be an integer between 1 and 3');
  });

  it('throws for a float', () => {
    expect(() => requireInteger(1.5, 'rounds', 1, 3)).toThrow('must be an integer');
  });

  it('throws for a string', () => {
    expect(() => requireInteger('2', 'rounds', 1, 3)).toThrow('must be an integer');
  });
});

// ---------------------------------------------------------------------------
// requireCliCommand
// ---------------------------------------------------------------------------

describe('requireCliCommand', () => {
  it('accepts "claude"', () => {
    expect(requireCliCommand('claude', 'command')).toBe('claude');
  });

  it('accepts "codex"', () => {
    expect(requireCliCommand('codex', 'command')).toBe('codex');
  });

  it('accepts "node.exe"', () => {
    expect(requireCliCommand('node.exe', 'command')).toBe('node.exe');
  });

  it('accepts "my-tool_v2"', () => {
    expect(requireCliCommand('my-tool_v2', 'command')).toBe('my-tool_v2');
  });

  it('accepts single character "a"', () => {
    expect(requireCliCommand('a', 'command')).toBe('a');
  });

  it('throws for "../../evil"', () => {
    expect(() => requireCliCommand('../../evil', 'command')).toThrow(
      'must contain only alphanumeric characters, dots, hyphens, or underscores',
    );
  });

  it('throws for "cmd;rm"', () => {
    expect(() => requireCliCommand('cmd;rm', 'command')).toThrow(
      'must contain only alphanumeric characters',
    );
  });

  it('throws for "cmd with spaces"', () => {
    expect(() => requireCliCommand('cmd with spaces', 'command')).toThrow(
      'must contain only alphanumeric characters',
    );
  });

  it('throws for empty string', () => {
    expect(() => requireCliCommand('', 'command')).toThrow('command is required');
  });

  it('CLI_COMMAND_RE export matches valid commands', () => {
    expect(CLI_COMMAND_RE.test('claude')).toBe(true);
    expect(CLI_COMMAND_RE.test('../../evil')).toBe(false);
    expect(CLI_COMMAND_RE.test('cmd with spaces')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// requireUrl
// ---------------------------------------------------------------------------

describe('requireUrl', () => {
  const protocols = ['http:', 'https:'];

  it('accepts an https URL', () => {
    expect(requireUrl('https://example.com', 'baseUrl', protocols)).toBe('https://example.com');
  });

  it('accepts an http URL', () => {
    expect(requireUrl('http://localhost:11434', 'baseUrl', protocols)).toBe('http://localhost:11434');
  });

  it('throws for ftp:// URL', () => {
    expect(() => requireUrl('ftp://example.com', 'baseUrl', protocols)).toThrow(
      'Invalid baseUrl: must be a valid http or https URL',
    );
  });

  it('throws for non-string', () => {
    expect(() => requireUrl(42, 'baseUrl', protocols)).toThrow('Invalid baseUrl: must be a string');
  });

  it('throws for unparseable string', () => {
    expect(() => requireUrl('not a url', 'baseUrl', protocols)).toThrow(
      'Invalid baseUrl: must be a valid http or https URL',
    );
  });

  it('throws for file:// URL', () => {
    expect(() => requireUrl('file:///etc/passwd', 'baseUrl', protocols)).toThrow(
      'Invalid baseUrl: must be a valid http or https URL',
    );
  });
});

// ---------------------------------------------------------------------------
// requireArray / requireObject
// ---------------------------------------------------------------------------

describe('requireArray', () => {
  it('accepts an array', () => {
    expect(requireArray([1, 2, 3], 'items')).toEqual([1, 2, 3]);
  });

  it('accepts an empty array', () => {
    expect(requireArray([], 'items')).toEqual([]);
  });

  it('throws for a non-array', () => {
    expect(() => requireArray('not-array', 'items')).toThrow('Invalid items: must be an array');
  });

  it('throws for null', () => {
    expect(() => requireArray(null, 'items')).toThrow('Invalid items: must be an array');
  });
});

describe('requireObject', () => {
  it('accepts a plain object', () => {
    const obj = { a: 1 };
    expect(requireObject(obj, 'data')).toBe(obj);
  });

  it('throws for an array', () => {
    expect(() => requireObject([1, 2], 'data')).toThrow('Invalid data: must be an object');
  });

  it('throws for null', () => {
    expect(() => requireObject(null, 'data')).toThrow('Invalid data: must be an object');
  });

  it('throws for a string', () => {
    expect(() => requireObject('string', 'data')).toThrow('Invalid data: must be an object');
  });
});

// ---------------------------------------------------------------------------
// requireMessageShape
// ---------------------------------------------------------------------------

describe('requireMessageShape', () => {
  function makeMsg(overrides: Record<string, unknown> = {}) {
    return {
      id: VALID_UUID,
      sessionId: VALID_UUID_2,
      role: 'conductor',
      voiceId: null,
      voiceName: null,
      content: 'Hello',
      roundIndex: 0,
      timestamp: 2000,
      ...overrides,
    };
  }

  it('accepts a valid message shape', () => {
    const msg = makeMsg();
    expect(() => requireMessageShape(msg)).not.toThrow();
  });

  it('accepts voiceId: null and voiceName: null', () => {
    expect(() => requireMessageShape(makeMsg({ voiceId: null, voiceName: null }))).not.toThrow();
  });

  it('accepts timestamp: 0', () => {
    expect(() => requireMessageShape(makeMsg({ timestamp: 0 }))).not.toThrow();
  });

  it('accepts roundIndex: -1', () => {
    expect(() => requireMessageShape(makeMsg({ roundIndex: -1 }))).not.toThrow();
  });

  it('throws for non-UUID id', () => {
    expect(() => requireMessageShape(makeMsg({ id: 'msg-1' }))).toThrow(
      'Invalid message.id: must be a valid UUID',
    );
  });

  it('throws for non-UUID sessionId', () => {
    expect(() => requireMessageShape(makeMsg({ sessionId: 'sess-1' }))).toThrow(
      'Invalid message.sessionId: must be a valid UUID',
    );
  });

  it('throws for invalid role', () => {
    expect(() => requireMessageShape(makeMsg({ role: 'admin' }))).toThrow(
      'Invalid message.role: must be one of: conductor, voice, system',
    );
  });

  it('accepts empty content (continuation messages have no user text)', () => {
    expect(() => requireMessageShape(makeMsg({ content: '' }))).not.toThrow();
  });

  it('returns the value as Message', () => {
    const msg = makeMsg();
    const result = requireMessageShape(msg);
    expect(result).toBe(msg);
  });
});

// ---------------------------------------------------------------------------
// requireCompositionData
// ---------------------------------------------------------------------------

describe('requireCompositionData', () => {
  function makeVoice(overrides: Record<string, unknown> = {}) {
    return {
      provider: 'anthropic',
      displayName: 'Alice',
      order: 0,
      color: '#fff',
      avatarIcon: 'bot',
      ...overrides,
    };
  }

  function makeData(overrides: Record<string, unknown> = {}) {
    return {
      name: 'My Composition',
      mode: 'broadcast',
      continuationPolicy: 'none',
      continuationMaxRounds: 1,
      voices: [makeVoice()],
      ...overrides,
    };
  }

  it('accepts valid composition data', () => {
    expect(() => requireCompositionData(makeData())).not.toThrow();
  });

  it('accepts continuationMaxRounds: 3 (boundary max)', () => {
    expect(() => requireCompositionData(makeData({ continuationMaxRounds: 3 }))).not.toThrow();
  });

  it('accepts continuationMaxRounds: 1 (boundary min)', () => {
    expect(() => requireCompositionData(makeData({ continuationMaxRounds: 1 }))).not.toThrow();
  });

  it('throws for continuationMaxRounds: 4 (> 3)', () => {
    expect(() => requireCompositionData(makeData({ continuationMaxRounds: 4 }))).toThrow(
      'must be an integer between 1 and 3',
    );
  });

  it('throws for invalid mode', () => {
    expect(() => requireCompositionData(makeData({ mode: 'roundrobin' }))).toThrow(
      'Invalid mode: must be one of: conductor, broadcast',
    );
  });

  it('throws for invalid continuationPolicy', () => {
    expect(() => requireCompositionData(makeData({ continuationPolicy: 'always' }))).toThrow(
      'Invalid continuationPolicy: must be one of: none, prompt, auto',
    );
  });

  it('throws for empty name', () => {
    expect(() => requireCompositionData(makeData({ name: '' }))).toThrow('name is required');
  });
});

// ---------------------------------------------------------------------------
// requirePartialCompositionData — same rules as requireCompositionData for shared fields
// ---------------------------------------------------------------------------

describe('requirePartialCompositionData', () => {
  it('accepts an empty object (all fields optional)', () => {
    expect(() => requirePartialCompositionData({})).not.toThrow();
  });

  it('applies the same name rule as requireCompositionData', () => {
    expect(() => requirePartialCompositionData({ name: '' })).toThrow('name is required');
    expect(() => requirePartialCompositionData({ name: 'valid' })).not.toThrow();
  });

  it('applies the same mode rule as requireCompositionData', () => {
    expect(() => requirePartialCompositionData({ mode: 'roundrobin' })).toThrow(
      'Invalid mode: must be one of: conductor, broadcast',
    );
    expect(() => requirePartialCompositionData({ mode: 'broadcast' })).not.toThrow();
  });

  it('applies the same continuationPolicy rule as requireCompositionData', () => {
    expect(() => requirePartialCompositionData({ continuationPolicy: 'always' })).toThrow(
      'Invalid continuationPolicy',
    );
    expect(() => requirePartialCompositionData({ continuationPolicy: 'auto' })).not.toThrow();
  });

  it('applies the same continuationMaxRounds rule as requireCompositionData', () => {
    expect(() => requirePartialCompositionData({ continuationMaxRounds: 4 })).toThrow(
      'must be an integer between 1 and 3',
    );
    expect(() => requirePartialCompositionData({ continuationMaxRounds: 3 })).not.toThrow();
  });

  it('skips validation for fields not present in the object', () => {
    // mode would be invalid if checked, but it's not present so no throw
    expect(() => requirePartialCompositionData({ name: 'valid' })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// requireUserProfileShape
// ---------------------------------------------------------------------------

describe('requireUserProfileShape', () => {
  function makeProfile(overrides: Record<string, unknown> = {}) {
    return {
      conductorName: 'Alice',
      pronouns: 'she/her',
      conductorContext: 'I am a developer',
      defaultTone: 'collaborative',
      conductorColor: '#aabbcc',
      conductorAvatar: '',
      ...overrides,
    };
  }

  it('accepts a valid profile', () => {
    expect(() => requireUserProfileShape(makeProfile())).not.toThrow();
  });

  it('accepts empty conductorName (optional)', () => {
    expect(() => requireUserProfileShape(makeProfile({ conductorName: '' }))).not.toThrow();
  });

  it('accepts empty conductorAvatar (no avatar set)', () => {
    expect(() => requireUserProfileShape(makeProfile({ conductorAvatar: '' }))).not.toThrow();
  });

  it('throws for empty defaultTone', () => {
    expect(() => requireUserProfileShape(makeProfile({ defaultTone: '' }))).toThrow(
      'defaultTone is required',
    );
  });

  it('throws for non-string conductorName', () => {
    expect(() => requireUserProfileShape(makeProfile({ conductorName: 42 }))).toThrow(
      'Invalid conductorName: must be a string',
    );
  });
});

// ---------------------------------------------------------------------------
// requireAvatarValue
// ---------------------------------------------------------------------------

describe('requireAvatarValue', () => {
  it('accepts empty string (avatar removal)', () => {
    expect(requireAvatarValue('', 'conductorAvatar')).toBe('');
  });

  it('accepts a png data URI', () => {
    expect(requireAvatarValue('data:image/png;base64,abc', 'conductorAvatar')).toBe(
      'data:image/png;base64,abc',
    );
  });

  it('accepts a jpeg data URI', () => {
    expect(requireAvatarValue('data:image/jpeg;base64,abc', 'conductorAvatar')).toBe(
      'data:image/jpeg;base64,abc',
    );
  });

  it('accepts a gif data URI', () => {
    expect(requireAvatarValue('data:image/gif;base64,abc', 'conductorAvatar')).toBe(
      'data:image/gif;base64,abc',
    );
  });

  it('accepts a webp data URI', () => {
    expect(requireAvatarValue('data:image/webp;base64,/9k=', 'conductorAvatar')).toBe(
      'data:image/webp;base64,/9k=',
    );
  });

  it('throws for a filesystem path', () => {
    expect(() => requireAvatarValue('/etc/passwd', 'conductorAvatar')).toThrow(
      'conductorAvatar must be a valid image data URI or empty string',
    );
  });

  it('throws for an http URL', () => {
    expect(() => requireAvatarValue('https://evil.com/img.png', 'conductorAvatar')).toThrow(
      'conductorAvatar must be a valid image data URI or empty string',
    );
  });

  it('throws for a non-image data URI', () => {
    expect(() => requireAvatarValue('data:text/html;base64,abc', 'conductorAvatar')).toThrow(
      'conductorAvatar must be a valid image data URI or empty string',
    );
  });

  it('throws for a data URI missing ;base64,', () => {
    expect(() => requireAvatarValue('data:image/png', 'conductorAvatar')).toThrow(
      'conductorAvatar must be a valid image data URI or empty string',
    );
  });

  it('throws for a number', () => {
    expect(() => requireAvatarValue(123, 'conductorAvatar')).toThrow(
      'Invalid conductorAvatar: must be a string',
    );
  });

  it('throws for a string exceeding MAX_AVATAR bytes', () => {
    const oversized = 'data:image/png;base64,' + 'A'.repeat(MAX_AVATAR);
    expect(() => requireAvatarValue(oversized, 'conductorAvatar')).toThrow(
      `conductorAvatar exceeds maximum length of ${MAX_AVATAR}`,
    );
  });

  it('throws for application/json data URI', () => {
    expect(() => requireAvatarValue('data:application/json;base64,abc', 'conductorAvatar')).toThrow(
      'conductorAvatar must be a valid image data URI or empty string',
    );
  });
});

// ---------------------------------------------------------------------------
// Error messages must not echo untrusted values
// ---------------------------------------------------------------------------

describe('error message safety', () => {
  const secret = 'super-secret-payload-xyz';

  it('requireId error does not echo the invalid value', () => {
    try {
      requireId(secret, 'id');
    } catch (err) {
      expect((err as Error).message).not.toContain(secret);
    }
  });

  it('requireEnum error does not echo the invalid value', () => {
    try {
      requireEnum(secret, 'mode', ['conductor', 'broadcast'] as const);
    } catch (err) {
      expect((err as Error).message).not.toContain(secret);
    }
  });

  it('requireCliCommand error does not echo the invalid value', () => {
    try {
      requireCliCommand(secret, 'command');
    } catch (err) {
      expect((err as Error).message).not.toContain(secret);
    }
  });
});
