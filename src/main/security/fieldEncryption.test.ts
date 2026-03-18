import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  initFieldEncryption,
  _resetForTests,
  encryptField,
  decryptField,
  DECRYPTION_FAILED_SENTINEL,
} from './fieldEncryption';

const TEST_KEY = Buffer.alloc(32);

describe('fieldEncryption', () => {
  beforeEach(() => {
    initFieldEncryption(TEST_KEY);
  });

  afterEach(() => {
    _resetForTests();
  });

  it('round-trips plaintext through encrypt/decrypt', () => {
    const original = 'Hello, world!';
    expect(decryptField(encryptField(original))).toBe(original);
  });

  it('produces ENC:v1: prefix', () => {
    expect(encryptField('test')).toMatch(/^ENC:v1:/);
  });

  it('produces unique ciphertext each call (random IV)', () => {
    const a = encryptField('same');
    const b = encryptField('same');
    expect(a).not.toBe(b);
  });

  it('returns null for null input', () => {
    expect(decryptField(null)).toBeNull();
  });

  it('returns raw value for non-ENC input (legacy plaintext fallback)', () => {
    expect(decryptField('plaintext value')).toBe('plaintext value');
  });

  it('returns DECRYPTION_FAILED_SENTINEL when ENC:v1: prefix present but wrong key', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const encrypted = encryptField('secret');
    _resetForTests();
    initFieldEncryption(Buffer.alloc(32, 0xff)); // different key
    expect(decryptField(encrypted)).toBe(DECRYPTION_FAILED_SENTINEL);
    spy.mockRestore();
  });

  it('returns DECRYPTION_FAILED_SENTINEL for tampered authTag', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const encrypted = encryptField('secret');
    // Flip last byte (authTag area)
    const b64 = encrypted.slice('ENC:v1:'.length);
    const buf = Buffer.from(b64, 'base64');
    buf[buf.length - 1] = (buf[buf.length - 1] as number) ^ 0xff;
    const tampered = `ENC:v1:${buf.toString('base64')}`;
    expect(decryptField(tampered)).toBe(DECRYPTION_FAILED_SENTINEL);
    spy.mockRestore();
  });

  it('throws if encryptField called before init', () => {
    _resetForTests();
    expect(() => encryptField('x')).toThrow('not initialized');
  });

  it('throws if initFieldEncryption called twice', () => {
    expect(() => initFieldEncryption(TEST_KEY)).toThrow('called twice');
  });
});
