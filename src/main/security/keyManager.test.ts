import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  generateDbKey,
  wrapWithSafeStorage,
  unwrapWithSafeStorage,
  wrapWithPassword,
  unwrapWithPassword,
  readKeyFile,
  writeKeyFileAtomic,
  loadOrCreateKey,
  type KeyFileSafeStorage,
  type KeyFilePassword,
} from './keyManager';

// Minimal safeStorage stub that XORs each byte for reversibility
const makeSafeStorage = () => ({
  isEncryptionAvailable: () => true,
  encryptString: (s: string) => {
    const buf = Buffer.from(s, 'utf8');
    buf.forEach((byte, i) => { buf[i] = byte ^ 0x42; });
    return buf;
  },
  decryptString: (b: Buffer) => {
    const copy = Buffer.from(b);
    copy.forEach((byte, i) => { copy[i] = byte ^ 0x42; });
    return copy.toString('utf8');
  },
});

describe('generateDbKey', () => {
  it('returns a 32-byte buffer', () => {
    const key = generateDbKey();
    expect(key.length).toBe(32);
  });

  it('returns unique keys', () => {
    expect(generateDbKey().toString('hex')).not.toBe(generateDbKey().toString('hex'));
  });
});

describe('safeStorage wrap/unwrap', () => {
  it('round-trips the key byte-for-byte', () => {
    const ss = makeSafeStorage();
    const key = generateDbKey();
    const b64 = wrapWithSafeStorage(key, ss);
    const recovered = unwrapWithSafeStorage(b64, ss);
    expect(recovered.toString('hex')).toBe(key.toString('hex'));
  });
});

describe('password wrap/unwrap', () => {
  it('round-trips with correct password', () => {
    const key = generateDbKey();
    const data = wrapWithPassword(key, 'hunter2');
    const recovered = unwrapWithPassword(
      { version: 1, wrapping: 'password', linuxNoticeDismissed: false, ...data },
      'hunter2',
    );
    expect(recovered.toString('hex')).toBe(key.toString('hex'));
  });

  it('throws with wrong password', () => {
    const key = generateDbKey();
    const data = wrapWithPassword(key, 'correct');
    expect(() =>
      unwrapWithPassword(
        { version: 1, wrapping: 'password', linuxNoticeDismissed: false, ...data },
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
    fs.writeFileSync(p, JSON.stringify({ version: 99, wrapping: 'safeStorage' }));
    expect(() => readKeyFile(p)).toThrow('version');
  });

  it('writes and reads back a key file', () => {
    const file: KeyFileSafeStorage = {
      version: 1,
      wrapping: 'safeStorage',
      encryptedKey: 'abc==',
      linuxNoticeDismissed: false,
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

  it('e2e mode returns ephemeral 32-byte key without touching filesystem', async () => {
    const ss = makeSafeStorage();
    const result = await loadOrCreateKey(tmpDir, ss, true);
    expect(result.key.length).toBe(32);
    expect(result.keyWasAbsent).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, 'polyphon.key.json'))).toBe(false);
  });

  it('creates key file on first run', async () => {
    const ss = makeSafeStorage();
    const result = await loadOrCreateKey(tmpDir, ss, false);
    expect(result.key.length).toBe(32);
    expect(result.keyWasAbsent).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'polyphon.key.json'))).toBe(true);
  });

  it('loads same key on second run', async () => {
    const ss = makeSafeStorage();
    const first = await loadOrCreateKey(tmpDir, ss, false);
    const second = await loadOrCreateKey(tmpDir, ss, false);
    expect(second.key.toString('hex')).toBe(first.key.toString('hex'));
    expect(second.keyWasAbsent).toBe(false);
  });

  it('password wrapping calls createUnlockWindow', async () => {
    const ss = makeSafeStorage();
    const key = generateDbKey();
    const wrapped = wrapWithPassword(key, 'pass');
    const keyFile: KeyFilePassword = {
      version: 1,
      wrapping: 'password',
      linuxNoticeDismissed: false,
      ...wrapped,
    };
    const { writeKeyFileAtomic: write } = await import('./keyManager');
    write(path.join(tmpDir, 'polyphon.key.json'), keyFile);

    const mockUnlock = async (_kf: KeyFilePassword) => key;
    const result = await loadOrCreateKey(tmpDir, ss, false, mockUnlock);
    expect(result.key.toString('hex')).toBe(key.toString('hex'));
  });
});
