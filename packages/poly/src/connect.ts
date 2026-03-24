import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
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
    const token = options.token ?? readLocalToken();
    return { host, port, token };
  }

  const token = readLocalToken();
  return { host: '127.0.0.1', port: 7432, token };
}

function readLocalToken(): string {
  const tokenPath = localTokenPath();
  try {
    const content = fs.readFileSync(tokenPath, 'utf-8').trim();
    if (!content) throw new Error('api.key is empty');
    return content;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Could not read local API token from ${tokenPath}: ${msg}\n` +
      'Is Polyphon running with the TCP API server enabled?\n' +
      'Override with POLYPHON_DATA_DIR to point to a non-standard app data directory.',
    );
  }
}

function readTokenFromFile(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8').trim();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not read token from ${filePath}: ${msg}`);
  }
}

export function localTokenPath(): string {
  const dataDir = process.env.POLYPHON_DATA_DIR ?? defaultUserDataPath();
  return path.join(dataDir, 'api.key');
}

function defaultUserDataPath(): string {
  const platform = os.platform();
  const appName = 'Polyphon';
  if (platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', appName);
  } else if (platform === 'win32') {
    const appData = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, appName);
  } else {
    const xdgConfig = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config');
    return path.join(xdgConfig, appName);
  }
}
