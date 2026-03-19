import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  scryptSync,
} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface KeyFileUnprotected {
  version: 1;
  wrapping: 'none';
  key: string; // 32-byte hex
}

export interface KeyFilePassword {
  version: 1;
  wrapping: 'password';
  salt: string;       // 32-byte hex
  iv: string;         // 12-byte hex
  ciphertext: string; // 32-byte hex
  authTag: string;    // 16-byte hex
  kdfN?: number;      // scrypt N factor; absent on legacy files means 16384
}

export type KeyFile = KeyFileUnprotected | KeyFilePassword;

const KEY_FILE_NAME = 'polyphon.key.json';

export function generateDbKey(): Buffer {
  return randomBytes(32);
}

const SCRYPT_N = 65536; // OWASP-recommended minimum for stored-secret KDFs

export function wrapWithPassword(
  key: Buffer,
  password: string,
): { salt: string; iv: string; ciphertext: string; authTag: string; kdfN: number } {
  const salt = randomBytes(32);
  const iv = randomBytes(12);
  const wrappingKey = scryptSync(password, salt, 32, { N: SCRYPT_N, r: 8, p: 1, maxmem: 128 * SCRYPT_N * 8 * 2 }) as Buffer;
  const cipher = createCipheriv('aes-256-gcm', wrappingKey, iv);
  const ciphertext = Buffer.concat([cipher.update(key), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    ciphertext: ciphertext.toString('hex'),
    authTag: authTag.toString('hex'),
    kdfN: SCRYPT_N,
  };
}

export function unwrapWithPassword(data: KeyFilePassword, password: string): Buffer {
  const salt = Buffer.from(data.salt, 'hex');
  const iv = Buffer.from(data.iv, 'hex');
  const ciphertext = Buffer.from(data.ciphertext, 'hex');
  const authTag = Buffer.from(data.authTag, 'hex');
  // kdfN is absent on legacy key files written before the N=65536 upgrade;
  // fall back to 16384 so existing users' passwords continue to work.
  const N = data.kdfN ?? 16384;
  const wrappingKey = scryptSync(password, salt, 32, { N, r: 8, p: 1, maxmem: 128 * N * 8 * 2 }) as Buffer;
  const decipher = createDecipheriv('aes-256-gcm', wrappingKey, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function readKeyFile(filePath: string): KeyFile | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as KeyFile & { wrapping: string };
    if (parsed.version !== 1) {
      throw new Error(`Unsupported key file version: ${parsed.version}`);
    }
    if (parsed.wrapping !== 'none' && parsed.wrapping !== 'password') {
      // Unrecognized wrapping (e.g. legacy 'safeStorage') — treat as absent
      return null;
    }
    return parsed as KeyFile;
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

export function writeKeyFileAtomic(filePath: string, file: KeyFile): void {
  const tmpPath = `${filePath}.tmp`;
  const content = JSON.stringify(file, null, 2);
  fs.writeFileSync(tmpPath, content, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmpPath, filePath);
}

export function updateKeyWrapping(userDataPath: string, newFile: KeyFile): void {
  const filePath = path.join(userDataPath, KEY_FILE_NAME);
  writeKeyFileAtomic(filePath, newFile);
  // Verify-after-write: re-read and confirm version parses correctly
  const verify = readKeyFile(filePath);
  if (!verify || verify.version !== 1) {
    throw new Error('Key file verification after write failed');
  }
}

export interface LoadKeyResult {
  key: Buffer;
  keyWasAbsent: boolean;
}

export async function loadOrCreateKey(
  userDataPath: string,
  e2e: boolean,
  createUnlockWindow?: (keyFile: KeyFilePassword) => Promise<Buffer>,
): Promise<LoadKeyResult> {
  if (e2e) {
    // Use a random ephemeral key so that accidentally enabling POLYPHON_E2E on a
    // real data directory does not produce a known-key (all-zeros) data set.
    return { key: randomBytes(32), keyWasAbsent: false };
  }

  const filePath = path.join(userDataPath, KEY_FILE_NAME);
  const fileExists = fs.existsSync(filePath);
  const keyFile = readKeyFile(filePath);

  if (keyFile === null) {
    // Either fresh install (file absent) or unrecognized wrapping (e.g. legacy
    // 'safeStorage'). Only set keyWasAbsent=true when the file was present but
    // unreadable — that means existing encrypted data is now unrecoverable.
    const key = generateDbKey();
    const newFile: KeyFileUnprotected = {
      version: 1,
      wrapping: 'none',
      key: key.toString('hex'),
    };
    writeKeyFileAtomic(filePath, newFile);
    return { key, keyWasAbsent: fileExists };
  }

  if (keyFile.wrapping === 'none') {
    const key = Buffer.from(keyFile.key, 'hex');
    return { key, keyWasAbsent: false };
  }

  // password wrapping — need unlock window
  if (!createUnlockWindow) {
    throw new Error('Password-wrapped key requires unlock window handler');
  }
  const key = await createUnlockWindow(keyFile);
  return { key, keyWasAbsent: false };
}
