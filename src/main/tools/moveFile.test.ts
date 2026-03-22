import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('fs');

import { renameSync, copyFileSync, unlinkSync, statSync, mkdirSync } from 'fs';
import { moveFileTool } from './moveFile';

const mockRenameSync = renameSync as ReturnType<typeof vi.fn>;
const mockCopyFileSync = copyFileSync as ReturnType<typeof vi.fn>;
const mockUnlinkSync = unlinkSync as ReturnType<typeof vi.fn>;
const mockStatSync = statSync as ReturnType<typeof vi.fn>;

afterEach(() => vi.clearAllMocks());

function makeStat() {
  return { isDirectory: () => false, isSymbolicLink: () => false };
}

describe('moveFileTool.execute()', () => {
  it('calls renameSync and returns success message', async () => {
    mockStatSync.mockReturnValueOnce(makeStat());

    const result = await moveFileTool.execute({ source: '/tmp/a.txt', destination: '/tmp/b.txt' });
    expect(mockRenameSync).toHaveBeenCalledWith(expect.stringContaining('a.txt'), expect.stringContaining('b.txt'));
    expect(result).toContain('Moved to');
  });

  it('falls back to copy+delete on EXDEV error', async () => {
    mockStatSync.mockReturnValueOnce(makeStat());
    const exdevErr = Object.assign(new Error('EXDEV'), { code: 'EXDEV' });
    mockRenameSync.mockImplementationOnce(() => { throw exdevErr; });

    const result = await moveFileTool.execute({ source: '/dev/a.txt', destination: '/tmp/b.txt' });
    expect(mockCopyFileSync).toHaveBeenCalled();
    expect(mockUnlinkSync).toHaveBeenCalled();
    expect(result).toContain('Moved to');
  });

  it('returns error when source does not exist', async () => {
    mockStatSync.mockImplementation(() => { throw new Error('ENOENT'); });

    const result = await moveFileTool.execute({ source: '/tmp/missing.txt', destination: '/tmp/b.txt' });
    expect(result).toContain('Error: source file not found');
  });

  it('returns error when source and destination are the same', async () => {
    const result = await moveFileTool.execute({ source: '/tmp/a.txt', destination: '/tmp/a.txt' });
    expect(result).toContain('Error: source and destination are the same path.');
  });
});
