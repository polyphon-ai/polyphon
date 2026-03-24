/**
 * E2E tests for the TCP API server — full roundtrip through the running Electron app.
 *
 * Launches the app with --api-server to start the TCP JSON-RPC server, connects a
 * raw client, and exercises the entire public method surface: compositions, sessions,
 * voice (broadcast + ask, both streaming and non-streaming), search, and error paths.
 *
 * All voice calls use POLYPHON_MOCK_VOICES=1 so no real provider credentials are needed.
 *
 * All tests are wrapped in a single test.describe.serial block so they share a single
 * Electron instance and TCP session, running sequentially on the same Playwright worker.
 */

import { test, expect } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { _electron as electron } from '@playwright/test';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import electronBin from 'electron';
import { APP_ENTRY, makeTempDir, skipOnboarding } from './helpers';

// ── Port allocation ───────────────────────────────────────────────────────────

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address() as net.AddressInfo;
      srv.close(() => resolve(addr.port));
    });
    srv.on('error', reject);
  });
}

// ── TCP session with streaming support ───────────────────────────────────────

interface StreamChunk {
  requestId: number | string;
  voiceId: string;
  voiceName: string;
  delta: string;
}

interface SendResult {
  result: unknown;
  chunks: StreamChunk[];
}

class TcpSession {
  private socket: net.Socket;
  private buf = '';
  private pending = new Map<
    number,
    { resolve: (v: SendResult) => void; reject: (e: Error) => void; chunks: StreamChunk[] }
  >();
  private counter = 1;

  constructor(readonly port: number) {
    this.socket = net.createConnection({ host: '127.0.0.1', port });
    this.socket.setEncoding('utf-8');
    this.socket.on('data', (chunk: string) => {
      this.buf += chunk;
      let idx: number;
      while ((idx = this.buf.indexOf('\n')) !== -1) {
        const line = this.buf.slice(0, idx);
        this.buf = this.buf.slice(idx + 1);
        if (!line.trim()) continue;
        let msg: any;
        try { msg = JSON.parse(line); } catch { continue; }

        // Streaming notification — correlate by requestId
        if (msg.method === 'stream.chunk' && !msg.id) {
          const reqId = msg.params?.requestId as number;
          this.pending.get(reqId)?.chunks.push(msg.params as StreamChunk);
          continue;
        }

        const pend = this.pending.get(msg.id);
        if (!pend) continue;
        this.pending.delete(msg.id);
        if (msg.error) {
          const err = new Error(msg.error.message) as Error & { code: number };
          err.code = msg.error.code;
          pend.reject(err);
        } else {
          pend.resolve({ result: msg.result, chunks: pend.chunks });
        }
      }
    });
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket.once('connect', resolve);
      this.socket.once('error', reject);
    });
  }

  private _send(method: string, params?: unknown): Promise<SendResult> {
    const id = this.counter++;
    const req = { jsonrpc: '2.0', id, method, params };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, chunks: [] });
      this.socket.write(JSON.stringify(req) + '\n');
    });
  }

  async call(method: string, params?: unknown): Promise<unknown> {
    const { result } = await this._send(method, params);
    return result;
  }

  async callStream(method: string, params: Record<string, unknown>): Promise<SendResult> {
    return this._send(method, { ...params, stream: true });
  }

  close(): void {
    this.socket.destroy();
  }
}

// ── Env builder ───────────────────────────────────────────────────────────────

const SENSITIVE_ENV_PATTERNS = [
  /(^|_)API_KEY$/i,
  /(^|_)(TOKEN|SECRET|PASSWORD)$/i,
];

function buildApiTestEnv(userData: string, port: number): Record<string, string> {
  const scrubbed = Object.fromEntries(
    Object.entries(process.env).filter(
      ([k]) => !SENSITIVE_ENV_PATTERNS.some((p) => p.test(k)),
    ),
  );
  return {
    ...scrubbed,
    NODE_ENV: 'test',
    POLYPHON_TEST_USER_DATA: userData,
    POLYPHON_E2E: '1',
    POLYPHON_MOCK_VOICES: '1',
    POLYPHON_API_PORT: String(port),
  };
}

// ── All TCP tests in one serial group ────────────────────────────────────────

test.describe.serial('API server TCP', () => {
  let app: ElectronApplication;
  let window: Page;
  let sess: TcpSession;
  let userData: string;
  let apiPort: number;

  test.beforeAll(async () => {
    apiPort = await getFreePort();
    userData = makeTempDir();

    app = await electron.launch({
      args: [
        APP_ENTRY,
        '--no-sandbox',
        '--api-server', // start TCP server without persisting the setting
        ...(process.env.CI ? ['--disable-gpu'] : []),
      ],
      env: buildApiTestEnv(userData, apiPort),
    });

    window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await skipOnboarding(window);

    // api.key is written during ApiServerController construction (in app.whenReady).
    // By the time the first window is ready, the file exists and the server is bound.
    const tokenPath = path.join(userData, 'api.key');
    const token = fs.readFileSync(tokenPath, 'utf-8').trim();

    sess = new TcpSession(apiPort);
    await sess.connect();
    const authResult = await sess.call('api.authenticate', { token }) as { ok: boolean };
    expect(authResult.ok).toBe(true);
  });

  test.afterAll(async () => {
    sess?.close();
    const pid = app?.process().pid;
    if (pid != null) {
      try { process.kill(-pid, 'SIGTERM'); } catch { /* already gone */ }
    }
    await app?.close().catch(() => {});
    try { fs.rmSync(userData, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  // ── api.getStatus ───────────────────────────────────────────────────────────

  test('api.getStatus returns running=true with expected fields', async () => {
    const status = await sess.call('api.getStatus') as Record<string, unknown>;
    expect(status.running).toBe(true);
    expect(status.enabled).toBe(true); // --api-server sets enabled=true
    expect(status.port).toBe(apiPort);
    expect(status.host).toBe('127.0.0.1');
    expect(typeof status.tokenFingerprint).toBe('string');
    expect((status.tokenFingerprint as string).length).toBe(8);
    expect(typeof status.version).toBe('string');
    expect(status.startupError).toBeUndefined();
  });

  // ── Compositions ────────────────────────────────────────────────────────────

  let compId: string;
  let broadcastVoiceAId: string;

  test('compositions.list returns empty array initially', async () => {
    const result = await sess.call('compositions.list') as unknown[];
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  test('compositions.create returns composition with voices', async () => {
    const created = await sess.call('compositions.create', {
      name: 'TCP Test Composition',
      mode: 'broadcast',
      continuationPolicy: 'none',
      continuationMaxRounds: 1,
      voices: [
        { provider: 'anthropic', displayName: 'Alpha', order: 0, color: '#6366f1', avatarIcon: 'bot' },
        { provider: 'openai', displayName: 'Beta', order: 1, color: '#ec4899', avatarIcon: 'bot' },
      ],
    }) as any;

    expect(created.name).toBe('TCP Test Composition');
    expect(created.mode).toBe('broadcast');
    expect(typeof created.id).toBe('string');
    expect(Array.isArray(created.voices)).toBe(true);
    expect(created.voices).toHaveLength(2);

    compId = created.id;
    broadcastVoiceAId = created.voices[0].id;
  });

  test('compositions.get returns the composition by id', async () => {
    const fetched = await sess.call('compositions.get', { id: compId }) as any;
    expect(fetched.id).toBe(compId);
    expect(fetched.name).toBe('TCP Test Composition');
    expect(fetched.voices).toHaveLength(2);
  });

  test('compositions.list includes the new composition', async () => {
    const list = await sess.call('compositions.list') as any[];
    expect(list.some((c) => c.id === compId)).toBe(true);
  });

  test('compositions.update renames the composition', async () => {
    const updated = await sess.call('compositions.update', {
      id: compId,
      data: { name: 'Renamed TCP Composition' },
    }) as any;
    expect(updated.name).toBe('Renamed TCP Composition');
    expect(updated.id).toBe(compId);
  });

  test('compositions.archive toggles archived state', async () => {
    await sess.call('compositions.archive', { id: compId, archived: true });
    const defaultList = await sess.call('compositions.list') as any[];
    expect(defaultList.some((c) => c.id === compId)).toBe(false);
    const archivedList = await sess.call('compositions.list', { archived: true }) as any[];
    expect(archivedList.some((c) => c.id === compId)).toBe(true);
    // Unarchive for subsequent tests
    await sess.call('compositions.archive', { id: compId, archived: false });
  });

  test('compositions.get returns NOT_FOUND for unknown id', async () => {
    await expect(
      sess.call('compositions.get', { id: '00000000-0000-0000-0000-000000000001' }),
    ).rejects.toMatchObject({ code: -32002 });
  });

  test('compositions.delete removes the composition', async () => {
    const tmp = await sess.call('compositions.create', {
      name: 'To Delete',
      mode: 'conductor',
      continuationPolicy: 'none',
      continuationMaxRounds: 1,
      voices: [],
    }) as any;
    await sess.call('compositions.delete', { id: tmp.id });
    await expect(
      sess.call('compositions.get', { id: tmp.id }),
    ).rejects.toMatchObject({ code: -32002 });
  });

  // ── Sessions ────────────────────────────────────────────────────────────────

  let sessionCompId: string;
  let sessionId: string;

  test('sessions setup: create a composition for session tests', async () => {
    const comp = await sess.call('compositions.create', {
      name: 'Session Test Composition',
      mode: 'broadcast',
      continuationPolicy: 'none',
      continuationMaxRounds: 1,
      voices: [
        { provider: 'anthropic', displayName: 'Alpha', order: 0, color: '#6366f1', avatarIcon: 'bot' },
      ],
    }) as any;
    sessionCompId = comp.id;
    expect(sessionCompId).toBeTruthy();
  });

  test('sessions.create returns session with composition fields', async () => {
    const session = await sess.call('sessions.create', {
      compositionId: sessionCompId,
      name: 'My TCP Session',
    }) as any;

    expect(session.name).toBe('My TCP Session');
    expect(session.compositionId).toBe(sessionCompId);
    expect(session.mode).toBe('broadcast');
    expect(session.archived).toBe(false);
    expect(typeof session.id).toBe('string');

    sessionId = session.id;
  });

  test('sessions.get returns the session', async () => {
    const fetched = await sess.call('sessions.get', { id: sessionId }) as any;
    expect(fetched.id).toBe(sessionId);
    expect(fetched.name).toBe('My TCP Session');
  });

  test('sessions.list includes the new session', async () => {
    const list = await sess.call('sessions.list') as any[];
    expect(list.some((s) => s.id === sessionId)).toBe(true);
  });

  test('sessions.rename updates the session name', async () => {
    const updated = await sess.call('sessions.rename', {
      id: sessionId,
      name: 'Renamed TCP Session',
    }) as any;
    expect(updated.name).toBe('Renamed TCP Session');
  });

  test('sessions.messages returns empty array before any messages', async () => {
    const messages = await sess.call('sessions.messages', { sessionId }) as unknown[];
    expect(Array.isArray(messages)).toBe(true);
    expect(messages).toHaveLength(0);
  });

  test('sessions.export returns markdown content', async () => {
    const result = await sess.call('sessions.export', { sessionId, format: 'markdown' }) as any;
    expect(result.format).toBe('markdown');
    expect(result.content).toContain('# Renamed TCP Session');
    expect(result.content).toContain('Broadcast');
  });

  test('sessions.export returns JSON content', async () => {
    const result = await sess.call('sessions.export', { sessionId, format: 'json' }) as any;
    expect(result.format).toBe('json');
    const parsed = JSON.parse(result.content as string);
    expect(parsed.session.id).toBe(sessionId);
    expect(Array.isArray(parsed.messages)).toBe(true);
  });

  test('sessions.export returns plaintext content', async () => {
    const result = await sess.call('sessions.export', { sessionId, format: 'plaintext' }) as any;
    expect(result.format).toBe('plaintext');
    expect(result.content).toContain('Renamed TCP Session');
    expect(result.content).toContain('='.repeat(72));
  });

  test('sessions.archive toggles archived state', async () => {
    await sess.call('sessions.archive', { id: sessionId, archived: true });
    const defaultList = await sess.call('sessions.list') as any[];
    expect(defaultList.some((s) => s.id === sessionId)).toBe(false);
    await sess.call('sessions.archive', { id: sessionId, archived: false });
    const unarchivedList = await sess.call('sessions.list') as any[];
    expect(unarchivedList.some((s) => s.id === sessionId)).toBe(true);
  });

  test('sessions.get returns NOT_FOUND for unknown id', async () => {
    await expect(
      sess.call('sessions.get', { id: '00000000-0000-0000-0000-000000000002' }),
    ).rejects.toMatchObject({ code: -32002 });
  });

  test('sessions.delete removes the session', async () => {
    const tmp = await sess.call('sessions.create', { compositionId: sessionCompId }) as any;
    await sess.call('sessions.delete', { id: tmp.id });
    await expect(
      sess.call('sessions.get', { id: tmp.id }),
    ).rejects.toMatchObject({ code: -32002 });
  });

  // ── Voice operations ────────────────────────────────────────────────────────

  let voiceCompId: string;
  let voiceSessionId: string;
  let voiceId: string;

  test('voice setup: create composition and session', async () => {
    const comp = await sess.call('compositions.create', {
      name: 'Voice Test Composition',
      mode: 'broadcast',
      continuationPolicy: 'none',
      continuationMaxRounds: 1,
      voices: [
        { provider: 'anthropic', displayName: 'Aria', order: 0, color: '#6366f1', avatarIcon: 'bot' },
      ],
    }) as any;
    voiceCompId = comp.id;
    voiceId = comp.voices[0].id;

    const session = await sess.call('sessions.create', {
      compositionId: voiceCompId,
      name: 'Voice Test Session',
    }) as any;
    voiceSessionId = session.id;
    expect(voiceSessionId).toBeTruthy();
  });

  test('voice.broadcast (non-streaming) returns conductor + voice messages', async () => {
    const result = await sess.call('voice.broadcast', {
      sessionId: voiceSessionId,
      content: 'Hello from test',
    }) as any;

    expect(Array.isArray(result.messages)).toBe(true);
    expect(result.messages.length).toBeGreaterThanOrEqual(2);

    const conductorMsg = result.messages.find((m: any) => m.role === 'conductor');
    expect(conductorMsg?.content).toBe('Hello from test');

    const voiceMsg = result.messages.find((m: any) => m.role === 'voice');
    // MockVoice returns "Mock response from <name>!"
    expect(voiceMsg?.content).toContain('Mock response from');
  });

  test('voice.broadcast (streaming) emits stream.chunk notifications before final result', async () => {
    const { result, chunks } = await sess.callStream('voice.broadcast', {
      sessionId: voiceSessionId,
      content: 'Stream this',
    });

    const r = result as any;
    expect(Array.isArray(r.messages)).toBe(true);
    // MockVoice yields word-by-word; at least one chunk expected
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(typeof chunk.voiceId).toBe('string');
      expect(typeof chunk.delta).toBe('string');
    }
    const fullText = chunks.map((c) => c.delta).join('');
    expect(fullText).toContain('Mock response from');
  });

  test('voice.ask (non-streaming) returns a single voice message', async () => {
    const result = await sess.call('voice.ask', {
      sessionId: voiceSessionId,
      voiceId,
      content: 'A directed question',
    }) as any;

    expect(result.message).toBeDefined();
    expect(result.message.role).toBe('voice');
    expect(result.message.content).toContain('Mock response from');
  });

  test('voice.ask (streaming) emits chunks then returns message', async () => {
    const { result, chunks } = await sess.callStream('voice.ask', {
      sessionId: voiceSessionId,
      voiceId,
      content: 'Stream this too',
    });

    const r = result as any;
    expect(r.message).toBeDefined();
    expect(chunks.length).toBeGreaterThan(0);
    const fullText = chunks.map((c) => c.delta).join('');
    expect(fullText).toContain('Mock response from');
  });

  test('sessions.messages returns all messages after voice calls', async () => {
    const messages = await sess.call('sessions.messages', { sessionId: voiceSessionId }) as any[];
    expect(messages.length).toBeGreaterThan(2);
    const roles = new Set(messages.map((m: any) => m.role));
    expect(roles.has('conductor')).toBe(true);
    expect(roles.has('voice')).toBe(true);
  });

  test('voice.abort returns {aborted: true}', async () => {
    const result = await sess.call('voice.abort', { sessionId: voiceSessionId }) as any;
    expect(result.aborted).toBe(true);
  });

  test('voice.ask returns NOT_FOUND for unknown voice id', async () => {
    await expect(
      sess.call('voice.ask', {
        sessionId: voiceSessionId,
        voiceId: '00000000-0000-0000-0000-000000000099',
        content: 'hello',
      }),
    ).rejects.toMatchObject({ code: -32002 });
  });

  // ── Search ──────────────────────────────────────────────────────────────────

  let searchSessionId: string;

  test('search setup: seed a session with a message', async () => {
    const comp = await sess.call('compositions.create', {
      name: 'Search Test Comp',
      mode: 'broadcast',
      continuationPolicy: 'none',
      continuationMaxRounds: 1,
      voices: [
        { provider: 'anthropic', displayName: 'Searcher', order: 0, color: '#6366f1', avatarIcon: 'bot' },
      ],
    }) as any;

    const session = await sess.call('sessions.create', {
      compositionId: comp.id,
      name: 'Search Test Session',
    }) as any;
    searchSessionId = session.id;

    await sess.call('voice.broadcast', {
      sessionId: searchSessionId,
      content: 'polyphon e2e search fixture',
    });
  });

  test('search.messages returns results matching the query', async () => {
    const results = await sess.call('search.messages', { query: 'polyphon e2e search' }) as any[];
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    const found = results.find((r: any) => r.sessionId === searchSessionId);
    expect(found).toBeDefined();
    expect(found.snippet).toContain('polyphon');
  });

  test('search.messages scoped to sessionId returns only that session', async () => {
    const results = await sess.call('search.messages', {
      query: 'polyphon e2e search',
      sessionId: searchSessionId,
    }) as any[];
    expect(Array.isArray(results)).toBe(true);
    for (const r of results) {
      expect(r.sessionId).toBe(searchSessionId);
    }
  });

  test('search.messages returns empty for unmatched query', async () => {
    const results = await sess.call('search.messages', {
      query: 'xyzzy-no-match-e2e-marker',
    }) as any[];
    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(0);
  });

  // ── Settings & MCP ──────────────────────────────────────────────────────────

  test('settings.getProviderStatus returns array with provider and apiKeyStatus', async () => {
    const statuses = await sess.call('settings.getProviderStatus') as any[];
    expect(Array.isArray(statuses)).toBe(true);
    for (const s of statuses) {
      expect(typeof s.provider).toBe('string');
      expect(s.apiKeyStatus).toBeDefined();
    }
  });

  test('settings.getDebugInfo returns appVersion, platform, arch', async () => {
    const info = await sess.call('settings.getDebugInfo') as any;
    expect(typeof info.appVersion).toBe('string');
    expect(typeof info.platform).toBe('string');
    expect(typeof info.arch).toBe('string');
  });

  test('mcp.getStatus returns status object', async () => {
    const status = await sess.call('mcp.getStatus') as any;
    expect(typeof status.enabled).toBe('boolean');
    expect(typeof status.running).toBe('boolean');
  });

  // ── Error handling (each uses a fresh raw socket) ───────────────────────────

  function openRawSocket(): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
      const sock = net.createConnection({ host: '127.0.0.1', port: apiPort });
      sock.setEncoding('utf-8');
      sock.once('connect', () => resolve(sock));
      sock.once('error', reject);
    });
  }

  function readLine(sock: net.Socket): Promise<string> {
    return new Promise((resolve) => {
      let buf = '';
      const onData = (chunk: string) => {
        buf += chunk;
        const idx = buf.indexOf('\n');
        if (idx !== -1) {
          sock.off('data', onData);
          resolve(buf.slice(0, idx));
        }
      };
      sock.on('data', onData);
    });
  }

  test('wrong token returns UNAUTHORIZED (-32001)', async () => {
    const badToken = 'badc0de'.repeat(9) + 'aa'; // 64 hex chars
    const sock = await openRawSocket();
    sock.write(
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'api.authenticate', params: { token: badToken } }) + '\n',
    );
    const line = await readLine(sock);
    const resp = JSON.parse(line);
    expect(resp.error?.code).toBe(-32001);
    // The attempted token must not appear in the error response
    expect(JSON.stringify(resp)).not.toContain(badToken);
    sock.destroy();
  });

  test('unauthenticated request returns UNAUTHORIZED (-32001)', async () => {
    const sock = await openRawSocket();
    sock.write(
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'compositions.list' }) + '\n',
    );
    const line = await readLine(sock);
    const resp = JSON.parse(line);
    expect(resp.error?.code).toBe(-32001);
    sock.destroy();
  });

  test('malformed JSON returns PARSE_ERROR (-32700)', async () => {
    const sock = await openRawSocket();
    sock.write('not valid json\n');
    const line = await readLine(sock);
    const resp = JSON.parse(line);
    expect(resp.error?.code).toBe(-32700);
    sock.destroy();
  });

  test('unknown method returns METHOD_NOT_FOUND (-32601)', async () => {
    const token = fs.readFileSync(path.join(userData, 'api.key'), 'utf-8').trim();
    const sock = await openRawSocket();
    sock.write(
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'api.authenticate', params: { token } }) + '\n',
    );
    await readLine(sock); // consume auth response
    sock.write(
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'no.such.method' }) + '\n',
    );
    const line = await readLine(sock);
    const resp = JSON.parse(line);
    expect(resp.error?.code).toBe(-32601);
    sock.destroy();
  });

  test('missing required params returns INVALID_PARAMS (-32602)', async () => {
    const token = fs.readFileSync(path.join(userData, 'api.key'), 'utf-8').trim();
    const sock = await openRawSocket();
    sock.write(
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'api.authenticate', params: { token } }) + '\n',
    );
    await readLine(sock);
    // compositions.create requires a name
    sock.write(
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'compositions.create', params: {} }) + '\n',
    );
    const line = await readLine(sock);
    const resp = JSON.parse(line);
    expect(resp.error?.code).toBe(-32602);
    sock.destroy();
  });
});
