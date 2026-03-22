import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('fs');

import { copyFileSync, statSync } from 'fs';
import { copyFileTool } from './copyFile';

const mockCopyFileSync = copyFileSync as ReturnType<typeof vi.fn>;
const mockStatSync = statSync as ReturnType<typeof vi.fn>;

afterEach(() => vi.clearAllMocks());

describe('copyFileTool.execute()', () => {
  it('calls copyFileSync and returns success', async () => {
    mockStatSync.mockReturnValueOnce({ isDirectory: () => false });

    const result = await copyFileTool.execute({ source: '/tmp/a.txt', destination: '/tmp/b.txt' });
    expect(mockCopyFileSync).toHaveBeenCalledWith(
      expect.stringContaining('a.txt'),
      expect.stringContaining('b.txt'),
    );
    expect(result).toContain('Copied to');
  });

  it('returns error when source does not exist', async () => {
    mockStatSync.mockImplementation(() => { throw new Error('ENOENT'); });

    const result = await copyFileTool.execute({ source: '/tmp/missing.txt', destination: '/tmp/b.txt' });
    expect(result).toContain('Error: source file not found');
  });

  it('returns error when copyFileSync fails', async () => {
    mockStatSync.mockReturnValueOnce({ isDirectory: () => false });
    mockCopyFileSync.mockImplementationOnce(() => { throw new Error('permission denied'); });

    const result = await copyFileTool.execute({ source: '/tmp/a.txt', destination: '/no-perm/b.txt' });
    expect(result).toContain('Error: permission denied');
  });
});
