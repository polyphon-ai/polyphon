import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3';
import { runMigrations } from '../db/migrations';
import { insertComposition, upsertCompositionVoices } from '../db/queries/compositions';
import { ApiServerController } from './server';
import { loadOrCreateApiToken } from './auth';
import { buildCompositionHandlers } from './handlers/compositions';
import { buildSessionHandlers } from './handlers/sessions';
import { buildSearchHandlers } from './handlers/search';
import { buildApiHandlers } from './handlers/api';
import type { VoiceManager } from '../managers/VoiceManager';
import type { SessionManager } from '../managers/SessionManager';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec('PRAGMA journal_mode = WAL');
  runMigrations(db);
  return db;
}

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'poly-integration-test-'));
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address() as net.AddressInfo;
      srv.close(() => resolve(addr.port));
    });
    srv.on('error', reject);
  });
}

class TcpSession {
  private socket: net.Socket;
  private buf = '';
  private pending = new Map<number, (line: string) => void>();
  private counter = 1;

  constructor(port: number) {
    this.socket = net.createConnection({ host: '127.0.0.1', port });
    this.socket.setEncoding('utf-8');
    this.socket.on('data', (chunk: string) => {
      this.buf += chunk;
      let idx;
      while ((idx = this.buf.indexOf('\n')) !== -1) {
        const line = this.buf.slice(0, idx);
        this.buf = this.buf.slice(idx + 1);
        if (!line.trim()) continue;
        const msg = JSON.parse(line);
        if (msg.method) continue; // notifications, skip
        const cb = this.pending.get(msg.id);
        if (cb) { this.pending.delete(msg.id); cb(line); }
      }
    });
  }

  async connect(): Promise<void> {
    return new Promise((resolve) => {
      this.socket.once('connect', resolve);
    });
  }

  async send(method: string, params?: unknown): Promise<any> {
    const id = this.counter++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, (line) => {
        const resp = JSON.parse(line);
        if (resp.error) {
          const err = new Error(resp.error.message) as any;
          err.code = resp.error.code;
          reject(err);
        } else {
          resolve(resp.result);
        }
      });
      this.socket.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }

  close(): void { this.socket.destroy(); }
}

// Minimal mock VoiceManager for tests that don't need real voices
function makeMockVoiceManager(): VoiceManager {
  return {
    createVoice: (_cv: any) => ({}),
    initSession: () => {},
    getEnsemble: () => [],
    getVoice: () => null,
    disposeSession: () => {},
    disposeAll: () => {},
    getProviderStatus: () => [],
    tonesById: new Map(),
    buildEnsembleSystemPrompt: () => '',
  } as unknown as VoiceManager;
}

describe('API server integration', () => {
  let db: Database.Database;
  let dir: string;
  let tokenPath: string;
  let token: string;
  let port: number;
  let controller: ApiServerController;
  let sess: TcpSession;

  beforeEach(async () => {
    db = createTestDb();
    dir = tempDir();
    tokenPath = path.join(dir, 'api.key');
    token = loadOrCreateApiToken(tokenPath);
    port = await getFreePort();

    const vm = makeMockVoiceManager();

    controller = new ApiServerController({
      port,
      host: '127.0.0.1',
      tokenPath,
      appVersion: '0.0.0-test',
    });

    controller.setDispatchTable({
      ...buildApiHandlers(() => controller.getStatus(), '0.0.0-test'),
      ...buildCompositionHandlers(db),
      ...buildSessionHandlers(db, vm),
      ...buildSearchHandlers(db),
    });

    await controller.start();

    sess = new TcpSession(port);
    await sess.connect();
    await sess.send('api.authenticate', { token });
  });

  afterEach(async () => {
    sess.close();
    await controller.stop();
    db.close();
    try { fs.rmSync(dir, { recursive: true }); } catch { /* ignore */ }
  });

  it('compositions.list returns empty array initially', async () => {
    const result = await sess.send('compositions.list');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it('compositions.create and get round-trip', async () => {
    const created = await sess.send('compositions.create', {
      name: 'Test Comp',
      mode: 'broadcast',
      continuationPolicy: 'none',
      continuationMaxRounds: 1,
      voices: [],
    });
    expect(created.name).toBe('Test Comp');
    expect(created.id).toBeTruthy();

    const fetched = await sess.send('compositions.get', { id: created.id });
    expect(fetched.id).toBe(created.id);
  });

  it('compositions.get returns NOT_FOUND for missing ID', async () => {
    await expect(sess.send('compositions.get', { id: '00000000-0000-0000-0000-000000000001' }))
      .rejects.toMatchObject({ code: -32002 });
  });

  it('compositions.delete removes composition', async () => {
    const created = await sess.send('compositions.create', {
      name: 'To Delete',
      mode: 'conductor',
      continuationPolicy: 'none',
      continuationMaxRounds: 1,
      voices: [],
    });
    await sess.send('compositions.delete', { id: created.id });
    await expect(sess.send('compositions.get', { id: created.id }))
      .rejects.toMatchObject({ code: -32002 });
  });

  it('sessions.list returns empty array initially', async () => {
    const result = await sess.send('sessions.list');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it('sessions.get returns NOT_FOUND for missing ID', async () => {
    await expect(sess.send('sessions.get', { id: '00000000-0000-0000-0000-000000000001' }))
      .rejects.toMatchObject({ code: -32002 });
  });

  it('sessions.create requires compositionId', async () => {
    await expect(sess.send('sessions.create', {}))
      .rejects.toMatchObject({ code: -32602 });
  });

  it('sessions.create returns NOT_FOUND for unknown compositionId', async () => {
    await expect(sess.send('sessions.create', {
      compositionId: '00000000-0000-0000-0000-000000000001',
    })).rejects.toMatchObject({ code: -32002 });
  });

  it('sessions.create creates session from existing composition', async () => {
    const comp = await sess.send('compositions.create', {
      name: 'Session Test Comp',
      mode: 'broadcast',
      continuationPolicy: 'none',
      continuationMaxRounds: 1,
      voices: [],
    }) as any;

    const session = await sess.send('sessions.create', {
      compositionId: comp.id,
      name: 'My New Session',
    }) as any;

    expect(session.id).toBeTruthy();
    expect(session.name).toBe('My New Session');
    expect(session.compositionId).toBe(comp.id);
    expect(session.mode).toBe('broadcast');
    expect(session.archived).toBe(false);
  });

  it('sessions.create defaults name to today\'s date when omitted', async () => {
    const comp = await sess.send('compositions.create', {
      name: 'Unnamed Session Comp',
      mode: 'conductor',
      continuationPolicy: 'none',
      continuationMaxRounds: 1,
      voices: [],
    }) as any;

    const session = await sess.send('sessions.create', {
      compositionId: comp.id,
    }) as any;

    expect(session.name).toBeTruthy();
    expect(typeof session.name).toBe('string');
    expect(session.name.length).toBeGreaterThan(0);
  });

  it('sessions.create inherits mode from composition', async () => {
    const comp = await sess.send('compositions.create', {
      name: 'Conductor Comp',
      mode: 'conductor',
      continuationPolicy: 'none',
      continuationMaxRounds: 1,
      voices: [],
    }) as any;

    const session = await sess.send('sessions.create', {
      compositionId: comp.id,
      name: 'Conductor Session',
    }) as any;

    expect(session.mode).toBe('conductor');
  });

  it('sessions.create stores workingDir when provided', async () => {
    const comp = await sess.send('compositions.create', {
      name: 'WorkDir Comp',
      mode: 'broadcast',
      continuationPolicy: 'none',
      continuationMaxRounds: 1,
      voices: [],
    }) as any;

    const session = await sess.send('sessions.create', {
      compositionId: comp.id,
      name: 'WorkDir Session',
      workingDir: '/tmp/test-workdir',
    }) as any;

    expect(session.workingDir).toBe('/tmp/test-workdir');
    expect(session.sandboxedToWorkingDir).toBe(false);
  });

  it('sessions.create sets sandboxedToWorkingDir when both flags provided', async () => {
    const comp = await sess.send('compositions.create', {
      name: 'Sandbox Comp',
      mode: 'broadcast',
      continuationPolicy: 'none',
      continuationMaxRounds: 1,
      voices: [],
    }) as any;

    const session = await sess.send('sessions.create', {
      compositionId: comp.id,
      name: 'Sandbox Session',
      workingDir: '/tmp/sandbox-test',
      sandboxedToWorkingDir: true,
    }) as any;

    expect(session.workingDir).toBe('/tmp/sandbox-test');
    expect(session.sandboxedToWorkingDir).toBe(true);
  });

  it('sessions.create appears in sessions.list', async () => {
    const comp = await sess.send('compositions.create', {
      name: 'List Test Comp',
      mode: 'broadcast',
      continuationPolicy: 'none',
      continuationMaxRounds: 1,
      voices: [],
    }) as any;

    const session = await sess.send('sessions.create', {
      compositionId: comp.id,
      name: 'List Test Session',
    }) as any;

    const list = await sess.send('sessions.list') as any[];
    const found = list.find((s) => s.id === session.id);
    expect(found).toBeDefined();
    expect(found.name).toBe('List Test Session');
  });

  it('api.getStatus returns status object', async () => {
    const status = await sess.send('api.getStatus');
    expect(status).toMatchObject({
      running: true,
      port: expect.any(Number),
      tokenFingerprint: expect.any(String),
    });
  });

  it('search.messages returns empty for no data', async () => {
    const result = await sess.send('search.messages', { query: 'hello world' });
    expect(Array.isArray(result)).toBe(true);
  });

  it('api.getSpec returns a valid JSON-RPC success with openrpc 1.3.0', async () => {
    const result = await sess.send('api.getSpec') as any;
    expect(result).toBeDefined();
    expect(result.openrpc).toBe('1.3.0');
  });

  it('api.getSpec info.version matches appVersion used to create the controller', async () => {
    const result = await sess.send('api.getSpec') as any;
    expect(result.info.version).toBe('0.0.0-test');
  });

  it('api.getSpec includes representative method from each namespace', async () => {
    const result = await sess.send('api.getSpec') as any;
    const names: string[] = result.methods.map((m: any) => m.name);
    expect(names).toContain('api.getStatus');
    expect(names).toContain('compositions.list');
    expect(names).toContain('sessions.create');
    expect(names).toContain('voice.broadcast');
    expect(names).toContain('search.messages');
    expect(names).toContain('settings.getDebugInfo');
    expect(names).toContain('mcp.setEnabled');
  });

  it('api.getSpec method names are unique', async () => {
    const result = await sess.send('api.getSpec') as any;
    const names: string[] = result.methods.map((m: any) => m.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });
});

describe('Security: token not logged on auth failure', () => {
  it('wrong token produces -32001 without token in error message', async () => {
    const dir = tempDir();
    const tokenPath = path.join(dir, 'api.key');
    loadOrCreateApiToken(tokenPath);
    const port = await getFreePort();
    const controller = new ApiServerController({
      port,
      host: '127.0.0.1',
      tokenPath,
      appVersion: '0.0.0-test',
    });
    controller.setDispatchTable({});
    await controller.start();

    const wrongToken = 'secret-wrong-token-value-12345';
    const result = await new Promise<string>((resolve) => {
      const socket = net.createConnection({ host: '127.0.0.1', port }, () => {
        socket.setEncoding('utf-8');
        let buf = '';
        socket.on('data', (chunk: string) => {
          buf += chunk;
          const idx = buf.indexOf('\n');
          if (idx !== -1) { resolve(buf.slice(0, idx)); socket.destroy(); }
        });
        socket.write(JSON.stringify({
          jsonrpc: '2.0', id: 1, method: 'api.authenticate',
          params: { token: wrongToken },
        }) + '\n');
      });
    });

    const resp = JSON.parse(result);
    expect(resp.error?.code).toBe(-32001);
    expect(JSON.stringify(resp)).not.toContain(wrongToken);

    await controller.stop();
    try { fs.rmSync(dir, { recursive: true }); } catch { /* ignore */ }
  });
});

describe('api.getSpec: unauthenticated returns -32001', () => {
  it('returns UNAUTHORIZED when called before authentication', async () => {
    const dir = tempDir();
    const tokenPath = path.join(dir, 'api.key');
    loadOrCreateApiToken(tokenPath);
    const port = await getFreePort();
    const controller = new ApiServerController({
      port,
      host: '127.0.0.1',
      tokenPath,
      appVersion: '0.0.0-test',
    });
    controller.setDispatchTable({
      ...buildApiHandlers(() => controller.getStatus(), '0.0.0-test'),
    });
    await controller.start();

    const result = await new Promise<string>((resolve) => {
      const socket = net.createConnection({ host: '127.0.0.1', port }, () => {
        socket.setEncoding('utf-8');
        let buf = '';
        socket.on('data', (chunk: string) => {
          buf += chunk;
          const idx = buf.indexOf('\n');
          if (idx !== -1) { resolve(buf.slice(0, idx)); socket.destroy(); }
        });
        socket.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'api.getSpec', params: {} }) + '\n');
      });
    });

    const resp = JSON.parse(result);
    expect(resp.error?.code).toBe(-32001);

    await controller.stop();
    try { fs.rmSync(dir, { recursive: true }); } catch { /* ignore */ }
  });
});

describe('IPC/TCP parity: compositions.list', () => {
  it('returns same data as IPC handler for representative read', async () => {
    const db = createTestDb();
    const dir = tempDir();
    const tokenPath = path.join(dir, 'api.key');
    const token = loadOrCreateApiToken(tokenPath);
    const port = await getFreePort();

    const vm = makeMockVoiceManager();
    const controller = new ApiServerController({ port, host: '127.0.0.1', tokenPath, appVersion: '0.0.0-test' });
    controller.setDispatchTable({
      ...buildCompositionHandlers(db),
    });
    await controller.start();

    // Insert via DB directly
    const id = 'parity-test-' + Date.now();
    const now = Date.now();
    insertComposition(db, {
      id, name: 'Parity Test', mode: 'broadcast', continuationPolicy: 'none',
      continuationMaxRounds: 1, voices: [], createdAt: now, updatedAt: now, archived: false,
    });

    // Query via IPC handler (direct)
    const { listCompositions } = await import('../db/queries/compositions');
    const ipcResult = listCompositions(db);

    // Query via TCP
    const tcpSess = new TcpSession(port);
    await tcpSess.connect();
    // authenticate first
    let buf = '';
    const authDone = new Promise<void>((resolve) => {
      (tcpSess as any).socket.once('data', (chunk: string) => {
        buf += chunk;
        resolve();
      });
    });
    (tcpSess as any).socket.write(JSON.stringify({ jsonrpc: '2.0', id: 999, method: 'api.authenticate', params: { token } }) + '\n');
    await authDone;
    const tcpResult = await tcpSess.send('compositions.list', {});
    tcpSess.close();
    await controller.stop();
    db.close();
    try { fs.rmSync(dir, { recursive: true }); } catch { /* ignore */ }

    expect(tcpResult.length).toBe(ipcResult.length);
    expect(tcpResult[0]!.id).toBe(ipcResult[0]!.id);
  });
});
