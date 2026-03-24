import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { resolveConnection, localTokenPath } from './connect';

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'poly-connect-test-'));
}

const FAKE_TOKEN = 'b'.repeat(64);

describe('resolveConnection', () => {
  let dir: string;
  let origEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    dir = tempDir();
    origEnv = { ...process.env };
    // Clear relevant env vars
    delete process.env.POLYPHON_HOST;
    delete process.env.POLYPHON_PORT;
    delete process.env.POLYPHON_TOKEN;
    delete process.env.POLYPHON_TOKEN_FILE;
    delete process.env.POLYPHON_DATA_DIR;
  });

  afterEach(() => {
    process.env = origEnv;
    try { fs.rmSync(dir, { recursive: true }); } catch { /* ignore */ }
  });

  it('reads token from POLYPHON_DATA_DIR override', () => {
    process.env.POLYPHON_DATA_DIR = dir;
    const tokenPath = path.join(dir, 'api.key');
    fs.writeFileSync(tokenPath, FAKE_TOKEN, 'utf-8');
    const config = resolveConnection({});
    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(7432);
    expect(config.token).toBe(FAKE_TOKEN);
  });

  it('uses POLYPHON_HOST + POLYPHON_TOKEN for remote', () => {
    process.env.POLYPHON_HOST = 'remote.example.com';
    process.env.POLYPHON_PORT = '8000';
    process.env.POLYPHON_TOKEN = FAKE_TOKEN;
    const config = resolveConnection({});
    expect(config.host).toBe('remote.example.com');
    expect(config.port).toBe(8000);
    expect(config.token).toBe(FAKE_TOKEN);
  });

  it('reads token from POLYPHON_TOKEN_FILE when POLYPHON_HOST is set', () => {
    const tokenFile = path.join(dir, 'my-token.key');
    fs.writeFileSync(tokenFile, FAKE_TOKEN, 'utf-8');
    process.env.POLYPHON_HOST = 'some.host';
    process.env.POLYPHON_TOKEN_FILE = tokenFile;
    const config = resolveConnection({});
    expect(config.token).toBe(FAKE_TOKEN);
  });

  it('throws when POLYPHON_HOST set but no token', () => {
    process.env.POLYPHON_HOST = 'some.host';
    expect(() => resolveConnection({})).toThrow(/token/i);
  });

  it('throws when local api.key is missing', () => {
    process.env.POLYPHON_DATA_DIR = dir; // dir has no api.key
    expect(() => resolveConnection({})).toThrow(/api.key/i);
  });

  it('poly error output does not contain token value', () => {
    process.env.POLYPHON_HOST = 'some.host';
    // No token provided — should throw, but error message must not contain any sensitive info
    let errorMessage = '';
    try {
      resolveConnection({});
    } catch (err: any) {
      errorMessage = err.message ?? '';
    }
    // Ensure error is thrown and doesn't contain a real token value
    expect(errorMessage).not.toBe('');
    expect(errorMessage).not.toContain(FAKE_TOKEN);
  });
});

describe('localTokenPath', () => {
  it('uses POLYPHON_DATA_DIR override', () => {
    const orig = process.env.POLYPHON_DATA_DIR;
    process.env.POLYPHON_DATA_DIR = '/custom/path';
    const p = localTokenPath();
    expect(p).toBe('/custom/path/api.key');
    if (orig !== undefined) process.env.POLYPHON_DATA_DIR = orig;
    else delete process.env.POLYPHON_DATA_DIR;
  });
});
