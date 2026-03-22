import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('child_process', () => ({
  spawnSync: vi.fn(),
}));

import { spawnSync } from 'child_process';
import { runCommandTool } from './runCommand';

const mockSpawnSync = spawnSync as ReturnType<typeof vi.fn>;

afterEach(() => vi.clearAllMocks());

describe('runCommandTool.execute()', () => {
  it('returns stdout, stderr, and exit code', async () => {
    mockSpawnSync.mockReturnValue({
      stdout: Buffer.from('hello\n'),
      stderr: Buffer.from(''),
      status: 0,
      error: undefined,
    });

    const result = await runCommandTool.execute({ command: 'echo', args: ['hello'] });
    expect(result).toContain('stdout:\nhello\n');
    expect(result).toContain('exit code: 0');
  });

  it('includes stderr when present', async () => {
    mockSpawnSync.mockReturnValue({
      stdout: Buffer.from(''),
      stderr: Buffer.from('something went wrong'),
      status: 1,
      error: undefined,
    });

    const result = await runCommandTool.execute({ command: 'cmd' });
    expect(result).toContain('stderr:\nsomething went wrong');
    expect(result).toContain('exit code: 1');
  });

  it('returns error message when spawnSync sets error', async () => {
    mockSpawnSync.mockReturnValue({
      stdout: null,
      stderr: null,
      status: null,
      error: new Error('ENOENT: command not found'),
    });

    const result = await runCommandTool.execute({ command: 'nonexistent' });
    expect(result).toContain('Error: ENOENT: command not found');
  });

  it('returns error for empty command', async () => {
    const result = await runCommandTool.execute({ command: '' });
    expect(result).toBe('Error: command is required.');
  });

  it('passes args array to spawnSync', async () => {
    mockSpawnSync.mockReturnValue({ stdout: Buffer.from(''), stderr: Buffer.from(''), status: 0 });

    await runCommandTool.execute({ command: 'git', args: ['log', '--oneline'] });

    expect(mockSpawnSync).toHaveBeenCalledWith('git', ['log', '--oneline'], expect.objectContaining({ timeout: 30_000 }));
  });

  it('passes cwd to spawnSync when provided', async () => {
    mockSpawnSync.mockReturnValue({ stdout: Buffer.from(''), stderr: Buffer.from(''), status: 0 });

    await runCommandTool.execute({ command: 'ls', cwd: '/tmp' });

    expect(mockSpawnSync).toHaveBeenCalledWith('ls', [], expect.objectContaining({ cwd: '/tmp' }));
  });
});
