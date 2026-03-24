import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadOrCreateApiToken, rotateApiToken, getLocalTokenPath, tokenFingerprint } from './auth';

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'poly-auth-test-'));
}

describe('auth', () => {
  let dir: string;
  let tokenPath: string;

  beforeEach(() => {
    dir = tempDir();
    tokenPath = getLocalTokenPath(dir);
  });

  afterEach(() => {
    try { fs.rmSync(dir, { recursive: true }); } catch { /* ignore */ }
  });

  it('generates a new token on first call', () => {
    const token = loadOrCreateApiToken(tokenPath);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns the same token on subsequent loads', () => {
    const t1 = loadOrCreateApiToken(tokenPath);
    const t2 = loadOrCreateApiToken(tokenPath);
    expect(t1).toBe(t2);
  });

  it('writes token file with 0o600 mode on POSIX', () => {
    if (os.platform() === 'win32') return;
    loadOrCreateApiToken(tokenPath);
    const stat = fs.statSync(tokenPath);
    const mode = stat.mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('rotates to a new token', () => {
    const t1 = loadOrCreateApiToken(tokenPath);
    const t2 = rotateApiToken(tokenPath);
    expect(t2).toMatch(/^[0-9a-f]{64}$/);
    expect(t2).not.toBe(t1);
  });

  it('rotated token is persisted', () => {
    rotateApiToken(tokenPath);
    const t = loadOrCreateApiToken(tokenPath);
    expect(t).toMatch(/^[0-9a-f]{64}$/);
  });

  it('regenerates if file has wrong format', () => {
    fs.writeFileSync(tokenPath, 'not-a-valid-token');
    const token = loadOrCreateApiToken(tokenPath);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns last 8 chars as fingerprint', () => {
    const token = '0'.repeat(56) + 'abcdef12';
    expect(tokenFingerprint(token)).toBe('abcdef12');
  });

  it('getLocalTokenPath returns path ending in api.key', () => {
    const p = getLocalTokenPath('/some/path');
    expect(p).toContain('api.key');
    expect(path.basename(p)).toBe('api.key');
  });
});
