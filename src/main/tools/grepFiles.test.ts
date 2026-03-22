import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('fs');

import { readdirSync, readFileSync, statSync } from 'fs';
import { grepFilesTool } from './grepFiles';

const mockReaddirSync = readdirSync as ReturnType<typeof vi.fn>;
const mockReadFileSync = readFileSync as ReturnType<typeof vi.fn>;
const mockStatSync = statSync as ReturnType<typeof vi.fn>;

afterEach(() => vi.resetAllMocks());

function makeStat(opts: { isDirectory?: boolean; isSymbolicLink?: boolean } = {}) {
  return {
    isDirectory: () => opts.isDirectory ?? false,
    isSymbolicLink: () => opts.isSymbolicLink ?? false,
  };
}

describe('grepFilesTool.execute()', () => {
  it('returns matching lines with file:line: content format', async () => {
    mockStatSync.mockReturnValueOnce(makeStat({ isDirectory: true })); // dir check
    mockReaddirSync.mockReturnValueOnce(['app.ts']);
    mockStatSync.mockReturnValueOnce(makeStat()); // app.ts is file
    mockReadFileSync.mockReturnValueOnce(Buffer.from('line one\nhello world\nline three'));

    const result = await grepFilesTool.execute({ pattern: 'hello', directory: '/src' });
    expect(result).toContain('app.ts:2: hello world');
  });

  it('is case-insensitive by default', async () => {
    mockStatSync.mockReturnValueOnce(makeStat({ isDirectory: true }));
    mockReaddirSync.mockReturnValueOnce(['f.ts']);
    mockStatSync.mockReturnValueOnce(makeStat());
    mockReadFileSync.mockReturnValueOnce(Buffer.from('HELLO WORLD'));

    const result = await grepFilesTool.execute({ pattern: 'hello', directory: '/src' });
    expect(result).toContain('f.ts:1: HELLO WORLD');
  });

  it('respects case_sensitive flag', async () => {
    mockStatSync.mockReturnValueOnce(makeStat({ isDirectory: true }));
    mockReaddirSync.mockReturnValueOnce(['f.ts']);
    mockStatSync.mockReturnValueOnce(makeStat());
    mockReadFileSync.mockReturnValueOnce(Buffer.from('HELLO WORLD'));

    const result = await grepFilesTool.execute({ pattern: 'hello', directory: '/src', case_sensitive: 'true' });
    expect(result).toBe('No matches found.');
  });

  it('returns "No matches found." when nothing matches', async () => {
    mockStatSync.mockReturnValueOnce(makeStat({ isDirectory: true }));
    mockReaddirSync.mockReturnValueOnce(['f.ts']);
    mockStatSync.mockReturnValueOnce(makeStat());
    mockReadFileSync.mockReturnValueOnce(Buffer.from('nothing here'));

    const result = await grepFilesTool.execute({ pattern: 'xyz123', directory: '/src' });
    expect(result).toBe('No matches found.');
  });

  it('returns error for invalid regex', async () => {
    mockStatSync.mockReturnValueOnce(makeStat({ isDirectory: true }));

    const result = await grepFilesTool.execute({ pattern: '[invalid', directory: '/src' });
    expect(result).toContain('Error: invalid regular expression');
  });

  it('returns error for missing directory', async () => {
    mockStatSync.mockImplementation(() => { throw new Error('ENOENT'); });

    const result = await grepFilesTool.execute({ pattern: 'foo', directory: '/nope' });
    expect(result).toContain('Error:');
  });
});
