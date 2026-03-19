import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  generateDbKey,
  wrapWithPassword,
  unwrapWithPassword,
  readKeyFile,
  writeKeyFileAtomic,
  loadOrCreateKey,
  type KeyFileUnprotected,
  type KeyFilePassword,
} from './keyManager';

describe('generateDbKey', () => {
  it('returns a 32-byte buffer', () => {
    const key = generateDbKey();
    expect(key.length).toBe(32);
  });

  it('returns unique keys', () => {
    expect(generateDbKey().toString('hex')).not.toBe(generateDbKey().toString('hex'));
  });
});

describe('password wrap/unwrap', () => {
  it('round-trips with correct password', () => {
    const key = generateDbKey();
    const data = wrapWithPassword(key, 'hunter2');
    const recovered = unwrapWithPassword(
      { version: 1, wrapping: 'password', ...data },
      'hunter2',
    );
    expect(recovered.toString('hex')).toBe(key.toString('hex'));
  });

  it('throws with wrong password', () => {
    const key = generateDbKey();
    const data = wrapWithPassword(key, 'correct');
    expect(() =>
      unwrapWithPassword(
        { version: 1, wrapping: 'password', ...data },
        'wrong',
      ),
    ).toThrow();
  });
});

describe('readKeyFile / writeKeyFileAtomic', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'polyphon-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null for missing file', () => {
    expect(readKeyFile(path.join(tmpDir, 'missing.json'))).toBeNull();
  });

  it('throws on unsupported version', () => {
    const p = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(p, JSON.stringify({ version: 99, wrapping: 'none', key: 'abc' }));
    expect(() => readKeyFile(p)).toThrow('version');
  });

  it('returns null for legacy safeStorage wrapping', () => {
    const p = path.join(tmpDir, 'legacy.json');
    fs.writeFileSync(p, JSON.stringify({ version: 1, wrapping: 'safeStorage', encryptedKey: 'abc==' }));
    expect(readKeyFile(p)).toBeNull();
  });

  it('writes and reads back an unprotected key file', () => {
    const file: KeyFileUnprotected = {
      version: 1,
      wrapping: 'none',
      key: generateDbKey().toString('hex'),
    };
    const p = path.join(tmpDir, 'key.json');
    writeKeyFileAtomic(p, file);
    const read = readKeyFile(p);
    expect(read).toEqual(file);
  });
});

describe('loadOrCreateKey', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'polyphon-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('e2e mode persists key to isolated test dir and returns 32-byte key', async () => {
    const result = await loadOrCreateKey(tmpDir, true);
    expect(result.key.length).toBe(32);
    expect(result.keyWasAbsent).toBe(false);
    // Key is written to the isolated test dir so restart-persistence tests can
    // decrypt messages across app restarts without touching the real user data dir.
    expect(fs.existsSync(path.join(tmpDir, 'polyphon.key.json'))).toBe(true);
  });

  it('e2e mode returns the same key on second call (restart persistence)', async () => {
    const first = await loadOrCreateKey(tmpDir, true);
    const second = await loadOrCreateKey(tmpDir, true);
    expect(second.key.toString('hex')).toBe(first.key.toString('hex'));
    expect(second.keyWasAbsent).toBe(false);
  });

  it('creates unprotected key file on first run without triggering absent warning', async () => {
    const result = await loadOrCreateKey(tmpDir, false);
    expect(result.key.length).toBe(32);
    expect(result.keyWasAbsent).toBe(false);
    const keyFile = readKeyFile(path.join(tmpDir, 'polyphon.key.json'));
    expect(keyFile?.wrapping).toBe('none');
  });

  it('loads same key on second run', async () => {
    const first = await loadOrCreateKey(tmpDir, false);
    const second = await loadOrCreateKey(tmpDir, false);
    expect(second.key.toString('hex')).toBe(first.key.toString('hex'));
    expect(second.keyWasAbsent).toBe(false);
  });

  it('treats legacy safeStorage key file as absent and generates new key', async () => {
    const p = path.join(tmpDir, 'polyphon.key.json');
    fs.writeFileSync(p, JSON.stringify({ version: 1, wrapping: 'safeStorage', encryptedKey: 'abc==' }));
    const result = await loadOrCreateKey(tmpDir, false);
    expect(result.key.length).toBe(32);
    expect(result.keyWasAbsent).toBe(true);
    const keyFile = readKeyFile(p);
    expect(keyFile?.wrapping).toBe('none');
  });

  it('password wrapping calls createUnlockWindow', async () => {
    const key = generateDbKey();
    const wrapped = wrapWithPassword(key, 'pass');
    const keyFile: KeyFilePassword = {
      version: 1,
      wrapping: 'password',
      ...wrapped,
    };
    const { writeKeyFileAtomic: write } = await import('./keyManager');
    write(path.join(tmpDir, 'polyphon.key.json'), keyFile);

    const mockUnlock = async (_kf: KeyFilePassword) => key;
    const result = await loadOrCreateKey(tmpDir, false, mockUnlock);
    expect(result.key.toString('hex')).toBe(key.toString('hex'));
  });
});
