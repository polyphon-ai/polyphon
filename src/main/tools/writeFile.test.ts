import { describe, it, expect, vi, afterEach } from 'vitest';
import { writeFileTool } from './writeFile';

vi.mock('fs');

import { writeFileSync, renameSync, mkdirSync, existsSync } from 'fs';
const mockWriteFileSync = writeFileSync as ReturnType<typeof vi.fn>;
const mockRenameSync = renameSync as ReturnType<typeof vi.fn>;
const mockMkdirSync = mkdirSync as ReturnType<typeof vi.fn>;
const mockExistsSync = existsSync as ReturnType<typeof vi.fn>;

afterEach(() => {
  vi.clearAllMocks();
});

describe('write_file tool', () => {
  it('writes content atomically via temp file and rename', async () => {
    mockExistsSync.mockReturnValue(true); // parent dir exists
    mockWriteFileSync.mockReturnValue(undefined);
    mockRenameSync.mockReturnValue(undefined);

    const result = await writeFileTool.execute({ path: '/tmp/out.txt', content: 'hello' });

    expect(mockWriteFileSync).toHaveBeenCalledOnce();
    const [tmpPath, content] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(tmpPath).toContain('.tmp.');
    expect(content).toBe('hello');

    expect(mockRenameSync).toHaveBeenCalledOnce();
    const [from, to] = mockRenameSync.mock.calls[0] as [string, string];
    expect(from).toBe(tmpPath);
    expect(to).toMatch(/\/tmp\/out\.txt$/);

    expect(result).toContain('Written successfully');
  });

  it('creates parent directory when it does not exist', async () => {
    mockExistsSync.mockReturnValue(false); // parent dir missing
    mockMkdirSync.mockReturnValue(undefined);
    mockWriteFileSync.mockReturnValue(undefined);
    mockRenameSync.mockReturnValue(undefined);

    await writeFileTool.execute({ path: '/tmp/newdir/out.txt', content: 'data' });

    expect(mockMkdirSync).toHaveBeenCalledOnce();
  });

  it('does not create parent directory when it already exists', async () => {
    mockExistsSync.mockReturnValue(true);
    mockWriteFileSync.mockReturnValue(undefined);
    mockRenameSync.mockReturnValue(undefined);

    await writeFileTool.execute({ path: '/tmp/out.txt', content: 'data' });

    expect(mockMkdirSync).not.toHaveBeenCalled();
  });

  it('returns sanitized error on write failure (no absolute path in message)', async () => {
    mockExistsSync.mockReturnValue(true);
    const err = new Error('EACCES: permission denied, open \'/secret/path/out.txt.tmp.123\'');
    mockWriteFileSync.mockImplementation(() => { throw err; });

    const result = await writeFileTool.execute({ path: '/secret/path/out.txt', content: 'x' });

    expect(result).toContain('Error writing');
    expect(result).not.toContain('/secret/path');
  });

  it('returns error string when writeFileSync throws non-Error', async () => {
    mockExistsSync.mockReturnValue(true);
    mockWriteFileSync.mockImplementation(() => { throw 'raw string'; });
    const result = await writeFileTool.execute({ path: '/tmp/out.txt', content: 'x' });
    expect(result).toContain('unknown error');
  });

  it('resolves relative paths', async () => {
    mockExistsSync.mockReturnValue(true);
    mockWriteFileSync.mockReturnValue(undefined);
    mockRenameSync.mockReturnValue(undefined);

    await writeFileTool.execute({ path: 'relative/out.txt', content: 'data' });

    const [tmpPath] = mockWriteFileSync.mock.calls[0] as [string];
    expect(tmpPath).toMatch(/^\//);
  });
});
