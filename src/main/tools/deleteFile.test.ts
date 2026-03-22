import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('fs');

import { unlinkSync, statSync } from 'fs';
import { deleteFileTool } from './deleteFile';

const mockUnlinkSync = unlinkSync as ReturnType<typeof vi.fn>;
const mockStatSync = statSync as ReturnType<typeof vi.fn>;

afterEach(() => vi.clearAllMocks());

describe('deleteFileTool.execute()', () => {
  it('calls unlinkSync and returns success', async () => {
    mockStatSync.mockReturnValueOnce({ isDirectory: () => false });

    const result = await deleteFileTool.execute({ path: '/tmp/file.txt' });
    expect(mockUnlinkSync).toHaveBeenCalled();
    expect(result).toContain('Deleted');
  });

  it('returns error when path is a directory', async () => {
    mockStatSync.mockReturnValueOnce({ isDirectory: () => true });

    const result = await deleteFileTool.execute({ path: '/tmp/mydir' });
    expect(result).toContain('is a directory');
    expect(mockUnlinkSync).not.toHaveBeenCalled();
  });

  it('returns error when file does not exist', async () => {
    mockStatSync.mockImplementation(() => { throw new Error('ENOENT'); });

    const result = await deleteFileTool.execute({ path: '/tmp/missing.txt' });
    expect(result).toContain('Error: file not found');
  });

  it('returns error when unlinkSync fails', async () => {
    mockStatSync.mockReturnValueOnce({ isDirectory: () => false });
    mockUnlinkSync.mockImplementationOnce(() => { throw new Error('permission denied'); });

    const result = await deleteFileTool.execute({ path: '/tmp/file.txt' });
    expect(result).toContain('Error: permission denied');
  });
});
