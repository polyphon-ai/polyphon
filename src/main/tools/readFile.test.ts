import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileTool } from './readFile';

vi.mock('fs');

import { readFileSync } from 'fs';
const mockReadFileSync = readFileSync as ReturnType<typeof vi.fn>;

afterEach(() => {
  vi.clearAllMocks();
});

describe('read_file tool', () => {
  it('returns file content for a normal UTF-8 file', async () => {
    mockReadFileSync.mockReturnValue(Buffer.from('hello world'));
    const result = await readFileTool.execute({ path: '/tmp/test.txt' });
    expect(result).toBe('hello world');
  });

  it('returns error string for binary/non-UTF-8 files', async () => {
    // A buffer with invalid UTF-8 sequence
    mockReadFileSync.mockReturnValue(Buffer.from([0xff, 0xfe, 0x00, 0x01]));
    const result = await readFileTool.execute({ path: '/tmp/binary.bin' });
    expect(result).toBe('Binary or non-UTF-8 file; cannot read as text.');
  });

  it('truncates at 50 KB and appends truncation note', async () => {
    const bigBuffer = Buffer.alloc(51 * 1024, 'a');
    mockReadFileSync.mockReturnValue(bigBuffer);
    const result = await readFileTool.execute({ path: '/tmp/big.txt' });
    expect(result).toContain('... (truncated at 50 KB)');
    // Content should be ~50 KB, not 51 KB
    expect(result.length).toBeLessThan(51 * 1024 + 100);
  });

  it('does not append truncation note when file is exactly 50 KB', async () => {
    const exactBuffer = Buffer.alloc(50 * 1024, 'a');
    mockReadFileSync.mockReturnValue(exactBuffer);
    const result = await readFileTool.execute({ path: '/tmp/exact.txt' });
    expect(result).not.toContain('truncated');
  });

  it('returns sanitized error on missing file (no absolute path)', async () => {
    const err = new Error('ENOENT: no such file or directory, open \'/some/secret/path/file.txt\'');
    err.message = 'ENOENT: no such file or directory, open \'/some/secret/path/file.txt\'';
    mockReadFileSync.mockImplementation(() => { throw err; });
    const result = await readFileTool.execute({ path: '/some/secret/path/file.txt' });
    expect(result).toContain('Error reading');
    expect(result).not.toContain('/some/secret/path');
  });

  it('resolves relative paths', async () => {
    mockReadFileSync.mockReturnValue(Buffer.from('content'));
    await readFileTool.execute({ path: 'relative/path.txt' });
    // readFileSync should be called with an absolute path (resolve was applied)
    const calledPath = mockReadFileSync.mock.calls[0]![0] as string;
    expect(calledPath).toMatch(/^\//);
  });

  it('returns error string when readFileSync throws non-Error', async () => {
    mockReadFileSync.mockImplementation(() => { throw 'some string error'; });
    const result = await readFileTool.execute({ path: '/tmp/test.txt' });
    expect(result).toContain('unknown error');
  });
});
