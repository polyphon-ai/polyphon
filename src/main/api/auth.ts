import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { logger } from '../utils/logger';

const TOKEN_FILE_NAME = 'api.key';
const TOKEN_BYTES = 32;

export function getLocalTokenPath(userDataPath: string): string {
  return path.join(userDataPath, TOKEN_FILE_NAME);
}

export function tokenFingerprint(tokenHex: string): string {
  return tokenHex.slice(-8);
}

export function loadOrCreateApiToken(tokenPath: string): string {
  try {
    if (fs.existsSync(tokenPath)) {
      const content = fs.readFileSync(tokenPath, 'utf-8').trim();
      if (/^[0-9a-f]{64}$/i.test(content)) {
        return content;
      }
      logger.warn('[api] api.key exists but has unexpected format — regenerating');
    }
  } catch (err) {
    logger.warn('[api] error reading api.key — regenerating', err);
  }

  return generateAndSaveToken(tokenPath);
}

export function rotateApiToken(tokenPath: string): string {
  return generateAndSaveToken(tokenPath);
}

function generateAndSaveToken(tokenPath: string): string {
  const token = crypto.randomBytes(TOKEN_BYTES).toString('hex');
  const tmp = tokenPath + '.tmp.' + process.pid;
  try {
    fs.writeFileSync(tmp, token, { encoding: 'utf-8', mode: 0o600 });
    fs.renameSync(tmp, tokenPath);
    // Ensure mode is correct even after rename (rename may inherit parent dir perms on some systems)
    if (os.platform() !== 'win32') {
      fs.chmodSync(tokenPath, 0o600);
    }
    logger.info('[api] api.key written', { fingerprint: tokenFingerprint(token) });
    return token;
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    throw err;
  }
}
