import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface Remote {
  name: string;
  host: string;
  port?: number;
  tokenFile: string;
}

type RemotesFile = Record<string, Omit<Remote, 'name'>>;

function remotesPath(): string {
  return path.join(os.homedir(), '.config', 'poly', 'remotes.json');
}

function loadRemotes(): RemotesFile {
  try {
    const content = fs.readFileSync(remotesPath(), 'utf-8');
    return JSON.parse(content) as RemotesFile;
  } catch {
    return {};
  }
}

function saveRemotes(remotes: RemotesFile): void {
  const filePath = remotesPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(remotes, null, 2) + '\n', 'utf-8');
}

export function loadRemote(name: string): Remote | null {
  const remotes = loadRemotes();
  const r = remotes[name];
  if (!r) return null;
  return { name, ...r };
}

export function listRemotes(): Remote[] {
  const remotes = loadRemotes();
  return Object.entries(remotes).map(([name, r]) => ({ name, ...r }));
}

export function addRemote(remote: Remote): void {
  const remotes = loadRemotes();
  remotes[remote.name] = { host: remote.host, port: remote.port, tokenFile: remote.tokenFile };
  saveRemotes(remotes);
}

export function removeRemote(name: string): boolean {
  const remotes = loadRemotes();
  if (!remotes[name]) return false;
  delete remotes[name];
  saveRemotes(remotes);
  return true;
}
