import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('fs');

import { readdirSync, statSync } from 'fs';
import { searchFilesTool } from './searchFiles';

const mockReaddirSync = readdirSync as ReturnType<typeof vi.fn>;
const mockStatSync = statSync as ReturnType<typeof vi.fn>;

afterEach(() => vi.clearAllMocks());

function makeStat(opts: { isDirectory?: boolean; isSymbolicLink?: boolean } = {}) {
  return {
    isDirectory: () => opts.isDirectory ?? false,
    isSymbolicLink: () => opts.isSymbolicLink ?? false,
  };
}

describe('searchFilesTool.execute()', () => {
  it('returns matching files', async () => {
    mockStatSync.mockReturnValueOnce(makeStat({ isDirectory: true })); // root dir check
    mockReaddirSync.mockReturnValueOnce(['foo.ts', 'bar.md']);
    mockStatSync.mockReturnValueOnce(makeStat()); // foo.ts
    mockStatSync.mockReturnValueOnce(makeStat()); // bar.md

    const result = await searchFilesTool.execute({ pattern: '*.ts', directory: '/project' });
    expect(result).toContain('foo.ts');
    expect(result).not.toContain('bar.md');
  });

  it('returns "No files found." when nothing matches', async () => {
    mockStatSync.mockReturnValueOnce(makeStat({ isDirectory: true }));
    mockReaddirSync.mockReturnValueOnce(['readme.md']);
    mockStatSync.mockReturnValueOnce(makeStat());

    const result = await searchFilesTool.execute({ pattern: '*.ts', directory: '/project' });
    expect(result).toBe('No files found.');
  });

  it('skips symlinks', async () => {
    mockStatSync.mockReturnValueOnce(makeStat({ isDirectory: true }));
    mockReaddirSync.mockReturnValueOnce(['link.ts']);
    mockStatSync.mockReturnValueOnce(makeStat({ isSymbolicLink: true }));

    const result = await searchFilesTool.execute({ pattern: '*.ts', directory: '/project' });
    expect(result).toBe('No files found.');
  });

  it('recurses into subdirectories', async () => {
    mockStatSync.mockReturnValueOnce(makeStat({ isDirectory: true })); // root check
    mockReaddirSync.mockReturnValueOnce(['src']); // root entries
    mockStatSync.mockReturnValueOnce(makeStat({ isDirectory: true })); // src is dir
    mockReaddirSync.mockReturnValueOnce(['index.ts']); // src entries
    mockStatSync.mockReturnValueOnce(makeStat()); // index.ts

    const result = await searchFilesTool.execute({ pattern: '*.ts', directory: '/project' });
    expect(result).toContain('index.ts');
  });

  it('returns error for missing directory', async () => {
    mockStatSync.mockImplementation(() => { throw new Error('ENOENT'); });

    const result = await searchFilesTool.execute({ pattern: '*.ts', directory: '/nope' });
    expect(result).toContain('Error:');
  });

  it('returns error for missing pattern', async () => {
    const result = await searchFilesTool.execute({ pattern: '' });
    expect(result).toBe('Error: pattern is required.');
  });
});
