import { describe, it, expect, vi, afterEach } from 'vitest';
import { listDirectoryTool } from './listDirectory';

vi.mock('fs');

import { readdirSync, lstatSync } from 'fs';
const mockReaddirSync = readdirSync as ReturnType<typeof vi.fn>;
const mockLstatSync = lstatSync as ReturnType<typeof vi.fn>;

function makeStatDir(isSymlink = false) {
  return {
    isDirectory: () => true,
    isSymbolicLink: () => isSymlink,
  };
}

function makeStatFile(isSymlink = false) {
  return {
    isDirectory: () => false,
    isSymbolicLink: () => isSymlink,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('list_directory tool', () => {
  it('returns (empty directory) for empty dir', async () => {
    mockLstatSync.mockReturnValue(makeStatDir());
    mockReaddirSync.mockReturnValue([]);
    const result = await listDirectoryTool.execute({ path: '/tmp/empty' });
    expect(result).toBe('(empty directory)');
  });

  it('lists files in alphabetical order', async () => {
    mockLstatSync.mockImplementation((p: string) => {
      if (p === '/tmp/dir') return makeStatDir();
      return makeStatFile();
    });
    mockReaddirSync.mockImplementation((p: string) => {
      if (p === '/tmp/dir') return ['z.txt', 'a.txt', 'm.txt'];
      return [];
    });
    const result = await listDirectoryTool.execute({ path: '/tmp/dir' });
    const lines = result.split('\n');
    expect(lines).toEqual(['a.txt', 'm.txt', 'z.txt']);
  });

  it('truncates at 500 entries and appends truncation note', async () => {
    const manyFiles = Array.from({ length: 600 }, (_, i) => `file${i}.txt`);
    mockLstatSync.mockImplementation((p: string) => {
      if (p === '/tmp/big') return makeStatDir();
      return makeStatFile();
    });
    mockReaddirSync.mockImplementation((p: string) => {
      if (p === '/tmp/big') return manyFiles;
      return [];
    });
    const result = await listDirectoryTool.execute({ path: '/tmp/big' });
    const lines = result.split('\n');
    // Last line should be the truncation note
    expect(lines[lines.length - 1]).toBe('... (listing truncated)');
    // Exactly 500 entries + 1 truncation line
    expect(lines.length).toBe(501);
  });

  it('respects max depth of 3', async () => {
    // Set up a directory tree 4 levels deep
    // /root → /root/d1 → /root/d1/d2 → /root/d1/d2/d3 → /root/d1/d2/d3/d4
    mockLstatSync.mockImplementation((p: string) => {
      if (p.endsWith('file.txt')) return makeStatFile();
      return makeStatDir();
    });
    mockReaddirSync.mockImplementation((p: string) => {
      if (p === '/root') return ['d1', 'file.txt'];
      if (p === '/root/d1') return ['d2'];
      if (p === '/root/d1/d2') return ['d3'];
      if (p === '/root/d1/d2/d3') return ['d4'];
      if (p === '/root/d1/d2/d3/d4') return ['deep.txt'];
      return [];
    });
    const result = await listDirectoryTool.execute({ path: '/root' });
    // d4 is at depth 4 — should not appear
    expect(result).not.toContain('d4');
    expect(result).not.toContain('deep.txt');
    // d3 is at depth 3 — should appear as a directory entry
    expect(result).toContain('d1/d2/d3');
  });

  it('skips symlinked directories', async () => {
    mockLstatSync.mockImplementation((p: string) => {
      if (p === '/tmp/dir') return makeStatDir();
      if (p === '/tmp/dir/link') return makeStatDir(true); // symlink
      if (p === '/tmp/dir/real.txt') return makeStatFile();
      return makeStatFile();
    });
    mockReaddirSync.mockImplementation((p: string) => {
      if (p === '/tmp/dir') return ['link', 'real.txt'];
      return [];
    });
    const result = await listDirectoryTool.execute({ path: '/tmp/dir' });
    expect(result).not.toContain('link');
    expect(result).toContain('real.txt');
  });

  it('skips permission-denied entries silently', async () => {
    mockLstatSync.mockImplementation((p: string) => {
      if (p === '/tmp/dir') return makeStatDir();
      if (p === '/tmp/dir/denied.txt') throw new Error('EACCES: permission denied');
      return makeStatFile();
    });
    mockReaddirSync.mockImplementation((p: string) => {
      if (p === '/tmp/dir') return ['denied.txt', 'ok.txt'];
      return [];
    });
    const result = await listDirectoryTool.execute({ path: '/tmp/dir' });
    expect(result).not.toContain('denied.txt');
    expect(result).toContain('ok.txt');
  });

  it('returns error for non-directory path', async () => {
    mockLstatSync.mockReturnValue(makeStatFile());
    const result = await listDirectoryTool.execute({ path: '/tmp/file.txt' });
    expect(result).toContain('not a directory');
  });

  it('returns sanitized error for missing directory', async () => {
    mockLstatSync.mockImplementation(() => {
      throw new Error('ENOENT: no such file or directory, stat \'/secret/path\'');
    });
    const result = await listDirectoryTool.execute({ path: '/secret/path' });
    expect(result).toContain('Error');
    expect(result).not.toContain('/secret/path');
  });

  it('resolves relative paths', async () => {
    mockLstatSync.mockReturnValue(makeStatDir());
    mockReaddirSync.mockReturnValue(['a.txt']);
    mockLstatSync.mockImplementation((p: string) => {
      if (typeof p === 'string' && p.endsWith('a.txt')) return makeStatFile();
      return makeStatDir();
    });
    await listDirectoryTool.execute({ path: 'relative/dir' });
    // First call to lstatSync should be with an absolute path
    const firstCall = mockLstatSync.mock.calls[0]![0] as string;
    expect(firstCall).toMatch(/^\//);
  });
});
