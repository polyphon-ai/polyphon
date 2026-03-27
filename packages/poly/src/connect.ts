import fs from 'node:fs';
import { readLocalToken as sdkReadLocalToken, defaultTokenPath } from '../../../src/sdk/token.js';
import { loadRemote } from './remotes.js';

export interface ConnectionConfig {
  host: string;
  port: number;
  token: string;
}

export function resolveConnection(options: {
  remote?: string;
  host?: string;
  port?: number;
  token?: string;
}): ConnectionConfig {
  // 1. Named remote
  if (options.remote) {
    const remote = loadRemote(options.remote);
    if (!remote) {
      throw new Error(`Remote "${options.remote}" not found. Run: poly remote list`);
    }
    return {
      host: remote.host,
      port: remote.port ?? 7432,
      token: readTokenFromFile(remote.tokenFile),
    };
  }

  // 2. Env vars (POLYPHON_HOST set → remote mode)
  if (process.env.POLYPHON_HOST) {
    const host = process.env.POLYPHON_HOST;
    const port = parseInt(process.env.POLYPHON_PORT ?? '7432', 10) || 7432;
    let token = process.env.POLYPHON_TOKEN ?? '';
    if (!token && process.env.POLYPHON_TOKEN_FILE) {
      token = readTokenFromFile(process.env.POLYPHON_TOKEN_FILE);
    }
    if (!token) {
      throw new Error(
        'POLYPHON_HOST is set but no token provided. Set POLYPHON_TOKEN or POLYPHON_TOKEN_FILE.',
      );
    }
    return { host, port, token };
  }

  // 3. Local default — read api.key from userData
  if (options.host) {
    const host = options.host;
    const port = options.port ?? 7432;
    const token = options.token ?? sdkReadLocalToken();
    return { host, port, token };
  }

  const token = sdkReadLocalToken();
  return { host: '127.0.0.1', port: 7432, token };
}

function readTokenFromFile(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8').trim();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not read token from ${filePath}: ${msg}`);
  }
}

export { defaultTokenPath as localTokenPath };
