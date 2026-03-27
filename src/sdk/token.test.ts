import { describe, it, expect, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { readLocalToken, defaultUserDataPath, defaultTokenPath } from './token';

describe('readLocalToken', () => {
  it('returns trimmed token from file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'polyphon-test-'));
    const file = path.join(dir, 'api.key');
    fs.writeFileSync(file, '  my-secret-token  \n');
    expect(readLocalToken(file)).toBe('my-secret-token');
    fs.rmSync(dir, { recursive: true });
  });

  it('throws descriptive error for missing file', () => {
    expect(() => readLocalToken('/nonexistent/path/api.key')).toThrow(
      'Polyphon api.key not found at /nonexistent/path/api.key. Is Polyphon running?'
    );
  });

  it('throws descriptive error for whitespace-only file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'polyphon-test-'));
    const file = path.join(dir, 'api.key');
    fs.writeFileSync(file, '   \n   ');
    expect(() => readLocalToken(file)).toThrow(`Polyphon api.key is empty at ${file}`);
    fs.rmSync(dir, { recursive: true });
  });
});

describe('defaultUserDataPath', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('returns linux path with XDG_CONFIG_HOME when set', () => {
    vi.stubEnv('XDG_CONFIG_HOME', '/custom/config');
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    expect(defaultUserDataPath()).toBe('/custom/config/Polyphon');
  });

  it('returns linux path using ~/.config when XDG_CONFIG_HOME is not set', () => {
    vi.stubEnv('XDG_CONFIG_HOME', '');
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    const result = defaultUserDataPath();
    expect(result).toMatch(/\.config[/\\]Polyphon$/);
  });

  it('returns win32 path with APPDATA when set', () => {
    vi.stubEnv('APPDATA', '/AppData/Roaming');
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
    expect(defaultUserDataPath()).toBe('/AppData/Roaming/Polyphon');
  });

  it('returns win32 fallback path when APPDATA is not set', () => {
    vi.stubEnv('APPDATA', '');
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
    const result = defaultUserDataPath();
    expect(result).toMatch(/AppData[/\\]Roaming[/\\]Polyphon$/);
  });
});

describe('defaultTokenPath', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('respects POLYPHON_DATA_DIR env var', () => {
    vi.stubEnv('POLYPHON_DATA_DIR', '/custom/data');
    expect(defaultTokenPath()).toBe('/custom/data/api.key');
  });

  it('calls defaultUserDataPath when POLYPHON_DATA_DIR is not set', () => {
    const saved = process.env['POLYPHON_DATA_DIR'];
    delete process.env['POLYPHON_DATA_DIR'];
    try {
      const result = defaultTokenPath();
      expect(result).toMatch(/api\.key$/);
    } finally {
      if (saved !== undefined) process.env['POLYPHON_DATA_DIR'] = saved;
    }
  });
});

describe('readLocalToken without explicit path', () => {
  it('uses defaultTokenPath when no path provided', () => {
    vi.stubEnv('POLYPHON_DATA_DIR', '/nonexistent/path');
    expect(() => readLocalToken()).toThrow('Is Polyphon running?');
    vi.unstubAllEnvs();
  });
});

describe('defaultUserDataPath darwin', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns macOS Library path on darwin', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
    const result = defaultUserDataPath();
    expect(result).toMatch(/Library[/\\]Application Support[/\\]Polyphon$/);
  });
});
