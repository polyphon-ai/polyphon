import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('child_process', () => ({
  spawnSync: vi.fn(),
  execFileSync: vi.fn(),
}));

import { spawnSync } from 'child_process';
import { testCliVoice } from './settingsHandlers';

const mockSpawnSync = spawnSync as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('testCliVoice() function-level validation', () => {
  it('throws for command with path separator before spawnSync is called', () => {
    expect(() => testCliVoice('../../evil')).toThrow();
    expect(mockSpawnSync).not.toHaveBeenCalled();
  });

  it('throws for command with shell metacharacter before spawnSync is called', () => {
    expect(() => testCliVoice('cmd;rm')).toThrow();
    expect(mockSpawnSync).not.toHaveBeenCalled();
  });

  it('throws for empty command before spawnSync is called', () => {
    expect(() => testCliVoice('')).toThrow();
    expect(mockSpawnSync).not.toHaveBeenCalled();
  });

  it('proceeds to spawnSync for a valid command', () => {
    mockSpawnSync.mockReturnValue({ status: 0, error: undefined });
    const result = testCliVoice('claude');
    expect(mockSpawnSync).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it('error messages do not echo the invalid command value', () => {
    let message = '';
    try {
      testCliVoice('../../evil');
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).not.toContain('../../evil');
  });
});
