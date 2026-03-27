import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';

export function defaultUserDataPath(): string {
  const platform = process.platform;
  if (platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Polyphon');
  } else if (platform === 'win32') {
    const appData = process.env['APPDATA'];
    if (appData) {
      return path.join(appData, 'Polyphon');
    }
    return path.join(os.homedir(), 'AppData', 'Roaming', 'Polyphon');
  } else {
    // Linux and others — respect XDG_CONFIG_HOME
    const xdgConfig = process.env['XDG_CONFIG_HOME'];
    if (xdgConfig) {
      return path.join(xdgConfig, 'Polyphon');
    }
    return path.join(os.homedir(), '.config', 'Polyphon');
  }
}

export function defaultTokenPath(): string {
  const dataDir = process.env['POLYPHON_DATA_DIR'] ?? defaultUserDataPath();
  return path.join(dataDir, 'api.key');
}

export function readLocalToken(tokenPath?: string): string {
  const filePath = tokenPath ?? defaultTokenPath();
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    throw new Error(`Polyphon api.key not found at ${filePath}. Is Polyphon running?`);
  }
  const trimmed = content.trim();
  if (trimmed === '') {
    throw new Error(`Polyphon api.key is empty at ${filePath}`);
  }
  return trimmed;
}
