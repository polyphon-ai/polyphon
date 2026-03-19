import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { logger } from '../utils/logger';

export const DECRYPTION_FAILED_SENTINEL = '\u0000[decryption-failed]\u0000';

const PREFIX = 'ENC:v1:';

let _key: Buffer | null = null;

export function initFieldEncryption(key: Buffer): void {
  if (_key !== null) {
    throw new Error('initFieldEncryption called twice; call _resetForTests() between uses');
  }
  _key = key;
}

export function _resetForTests(): void {
  _key = null;
}

export function encryptField(value: string): string {
  if (!_key) throw new Error('Field encryption not initialized');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', _key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, encrypted, authTag]);
  return `${PREFIX}${combined.toString('base64')}`;
}

export function decryptField(value: string | null): string | null {
  if (value === null || value === undefined) return null;
  if (!value.startsWith(PREFIX)) return value;

  if (!_key) throw new Error('Field encryption not initialized');

  try {
    const combined = Buffer.from(value.slice(PREFIX.length), 'base64');
    const iv = combined.subarray(0, 12);
    const authTag = combined.subarray(combined.length - 16);
    const ciphertext = combined.subarray(12, combined.length - 16);
    const decipher = createDecipheriv('aes-256-gcm', _key, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(ciphertext) + decipher.final('utf8');
  } catch (err) {
    logger.error('[security] decryptField failed', err);
    return DECRYPTION_FAILED_SENTINEL;
  }
}
