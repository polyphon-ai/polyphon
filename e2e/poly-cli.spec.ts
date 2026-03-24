/**
 * E2E tests for the poly CLI binary against a running Electron app.
 *
 * Launches the app with --api-server and POLYPHON_MOCK_VOICES=1, seeds data
 * via a TCP JSON-RPC client, then spawns the poly CLI as a subprocess and
 * asserts stdout/stderr content and exit codes.
 *
 * No real API credentials are required. Skips gracefully if the CLI binary
 * has not been built yet (run `cd packages/poly && npm run build` first).
 *
 * Runs as part of: make test-e2e
 * Isolated target:  make test-e2e-poly-cli
 */

import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { _electron as electron } from '@playwright/test';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import electronBin from 'electron';
import { APP_ENTRY, makeTempDir, skipOnboarding } from './helpers';

// ── CLI binary ────────────────────────────────────────────────────────────────

const POLY_BIN = path.resolve(__dirname, '..', 'packages', 'poly', 'dist', 'index.js');

// ── Minimal TCP client for seeding data ───────────────────────────────────────

class TcpClient {
  private socket: net.Socket;
  private buf = '';
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private counter = 1;

  constructor(port: number) {
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
        // Ignore streaming notifications — not needed for seeding
        if (!msg.id) continue;
        const pend = this.pending.get(msg.id as number);
        if (!pend) continue;
        this.pending.delete(msg.id as number);
        if (msg.error) {
          pend.reject(new Error(msg.error.message));
        } else {
          pend.resolve(msg.result);
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

  call(method: string, params?: unknown): Promise<any> {
    const id = this.counter++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }

  close(): void {
    this.socket.destroy();
  }
}

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

// ── CLI subprocess helper ─────────────────────────────────────────────────────

interface PolyResult { stdout: string; stderr: string; exitCode: number }

function runPoly(args: string[], cliEnv: Record<string, string>): Promise<PolyResult> {
  return new Promise((resolve) => {
    const proc = spawn(process.execPath, [POLY_BIN, ...args], {
      env: { ...process.env, ...cliEnv },
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('close', (code: number | null) => {
      resolve({ stdout, stderr, exitCode: code ?? 0 });
    });
  });
}

// ── Shared state ──────────────────────────────────────────────────────────────

let polyCLIAvailable = false;
let app: ElectronApplication;
let window: Page;
let tcpClient: TcpClient;
let userData: string;
let apiPort: number;
let cliEnv: Record<string, string>;

let compId: string;
let voiceId: string;
let sessionId: string;

// ── Suite ─────────────────────────────────────────────────────────────────────

test.describe.serial('poly CLI', () => {
  test.beforeAll(async () => {
    polyCLIAvailable = fs.existsSync(POLY_BIN);
    if (!polyCLIAvailable) return;

    apiPort = await getFreePort();
    userData = makeTempDir();

    app = await electron.launch({
      args: [
        APP_ENTRY,
        '--no-sandbox',
        '--api-server',
        ...(process.env.CI ? ['--disable-gpu'] : []),
      ],
      env: {
        ...Object.fromEntries(
          Object.entries(process.env).filter(
            ([k]) => !/((^|_)(API_KEY|TOKEN|SECRET|PASSWORD)$)/i.test(k),
          ),
        ),
        NODE_ENV: 'test',
        POLYPHON_TEST_USER_DATA: userData,
        POLYPHON_E2E: '1',
        POLYPHON_MOCK_VOICES: '1',
        POLYPHON_API_PORT: String(apiPort),
      },
    });

    window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await skipOnboarding(window);

    // Read auth token written by ApiServerController during app startup
    const tokenPath = path.join(userData, 'api.key');
    const token = fs.readFileSync(tokenPath, 'utf-8').trim();

    // Env vars used by every poly subprocess in this suite
    cliEnv = {
      POLYPHON_HOST: '127.0.0.1',
      POLYPHON_PORT: String(apiPort),
      POLYPHON_TOKEN_FILE: tokenPath,
    };

    // Seed: create composition with one voice
    tcpClient = new TcpClient(apiPort);
    await tcpClient.connect();
    await tcpClient.call('api.authenticate', { token });

    const comp = await tcpClient.call('compositions.create', {
      name: 'Poly CLI Test Composition',
      mode: 'broadcast',
      continuationPolicy: 'none',
      continuationMaxRounds: 1,
      voices: [
        { provider: 'anthropic', displayName: 'Oracle', order: 0, color: '#6366f1', avatarIcon: 'bot' },
      ],
    }) as any;
    compId = comp.id;
    voiceId = comp.voices[0].id;

    // Seed: create session
    const session = await tcpClient.call('sessions.create', {
      compositionId: compId,
      name: 'Poly CLI Test Session',
    }) as any;
    sessionId = session.id;

    // Seed: one broadcast so messages and search have content
    await tcpClient.call('voice.broadcast', {
      sessionId,
      content: 'polyphon cli seed message',
    });
  });

  test.afterAll(async () => {
    tcpClient?.close();
    await app?.close().catch(() => {});
    try { fs.rmSync(userData, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  test.beforeEach(() => {
    test.skip(!polyCLIAvailable, `poly CLI binary not found at ${POLY_BIN} — run: cd packages/poly && npm run build`);
  });

  // ── status ────────────────────────────────────────────────────────────────

  test('poly status (human) shows running server and providers', async () => {
    const { stdout, exitCode } = await runPoly(['status'], cliEnv);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('API Server:');
    expect(stdout).toContain('✓ Running on');
    expect(stdout).toContain(`127.0.0.1:${apiPort}`);
    expect(stdout).toContain('MCP Server:');
    expect(stdout).toContain('Providers:');
  });

  test('poly status --format json returns parseable object with correct fields', async () => {
    const { stdout, exitCode } = await runPoly(['status', '--format', 'json'], cliEnv);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.api.running).toBe(true);
    expect(parsed.api.enabled).toBe(true);
    expect(parsed.api.port).toBe(apiPort);
    expect(parsed.api.host).toBe('127.0.0.1');
    expect(Array.isArray(parsed.providers)).toBe(true);
    expect(typeof parsed.mcp.enabled).toBe('boolean');
  });

  // ── compositions ──────────────────────────────────────────────────────────

  test('poly compositions list (human) shows seeded composition', async () => {
    const { stdout, exitCode } = await runPoly(['compositions', 'list'], cliEnv);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Poly CLI Test Composition');
    expect(stdout).toContain(compId);
  });

  test('poly compositions get --format json returns composition by id', async () => {
    const { stdout, exitCode } = await runPoly(
      ['compositions', 'get', compId, '--format', 'json'],
      cliEnv,
    );
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.id).toBe(compId);
    expect(parsed.name).toBe('Poly CLI Test Composition');
    expect(parsed.mode).toBe('broadcast');
    expect(Array.isArray(parsed.voices)).toBe(true);
    expect(parsed.voices[0].displayName).toBe('Oracle');
  });

  test('poly compositions get exits 1 for unknown id', async () => {
    const { exitCode, stderr } = await runPoly(
      ['compositions', 'get', '00000000-0000-0000-0000-000000000001'],
      cliEnv,
    );
    expect(exitCode).toBe(1);
    expect(stderr.length).toBeGreaterThan(0);
  });

  // ── sessions ──────────────────────────────────────────────────────────────

  test('poly sessions list (human) shows seeded session', async () => {
    const { stdout, exitCode } = await runPoly(['sessions', 'list'], cliEnv);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Poly CLI Test Session');
    expect(stdout).toContain(sessionId);
  });

  test('poly sessions get --format json returns session by id', async () => {
    const { stdout, exitCode } = await runPoly(
      ['sessions', 'get', sessionId, '--format', 'json'],
      cliEnv,
    );
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.id).toBe(sessionId);
    expect(parsed.name).toBe('Poly CLI Test Session');
    expect(parsed.compositionId).toBe(compId);
  });

  test('poly sessions messages (human) shows seeded messages', async () => {
    const { stdout, exitCode } = await runPoly(
      ['sessions', 'messages', sessionId],
      cliEnv,
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain('polyphon cli seed message');
    // MockVoice always responds; at least one voice line expected
    expect(stdout).toContain('Mock response from');
  });

  test('poly sessions export returns markdown with session name', async () => {
    const { stdout, exitCode } = await runPoly(
      ['sessions', 'export', sessionId],
      cliEnv,
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Poly CLI Test Session');
    // Markdown export includes a heading
    expect(stdout).toMatch(/^#\s/m);
  });

  // ── run (broadcast) ───────────────────────────────────────────────────────

  test('poly run (human) prints voice response', async () => {
    const { stdout, exitCode } = await runPoly(
      ['run', '--session', sessionId, '--prompt', 'Hello from poly run'],
      cliEnv,
    );
    expect(exitCode).toBe(0);
    // Human format: [VoiceName]\n<content>
    expect(stdout).toContain('[Oracle]');
    expect(stdout).toContain('Mock response from Oracle');
  });

  test('poly run --format json returns messages array', async () => {
    const { stdout, exitCode } = await runPoly(
      ['run', '--session', sessionId, '--prompt', 'Hello json', '--format', 'json'],
      cliEnv,
    );
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(Array.isArray(parsed.messages)).toBe(true);
    const voiceMsg = parsed.messages.find((m: any) => m.role === 'voice');
    expect(voiceMsg).toBeDefined();
    expect(voiceMsg.content).toContain('Mock response from');
  });

  test('poly run --stream writes tokens to stdout', async () => {
    const { stdout, stderr, exitCode } = await runPoly(
      ['run', '--session', sessionId, '--prompt', 'Stream test', '--stream'],
      cliEnv,
    );
    expect(exitCode).toBe(0);
    // Streaming: voice label goes to stderr, tokens to stdout
    expect(stderr).toContain('[Oracle]');
    expect(stdout).toContain('Mock response from');
  });

  test('poly run exits 1 when --session is missing', async () => {
    const { exitCode, stderr } = await runPoly(
      ['run', '--prompt', 'No session'],
      cliEnv,
    );
    expect(exitCode).toBe(1);
    expect(stderr.length).toBeGreaterThan(0);
  });

  // ── ask (directed) ────────────────────────────────────────────────────────

  test('poly ask (human) prints voice label and response', async () => {
    const { stdout, exitCode } = await runPoly(
      ['ask', '--session', sessionId, '--voice', voiceId, '--prompt', 'Direct question'],
      cliEnv,
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain('[Oracle]');
    expect(stdout).toContain('Mock response from Oracle');
  });

  test('poly ask --format json returns message object', async () => {
    const { stdout, exitCode } = await runPoly(
      ['ask', '--session', sessionId, '--voice', voiceId, '--prompt', 'JSON ask', '--format', 'json'],
      cliEnv,
    );
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.message).toBeDefined();
    expect(parsed.message.role).toBe('voice');
    expect(parsed.message.content).toContain('Mock response from');
  });

  test('poly ask --stream writes tokens to stdout', async () => {
    const { stdout, exitCode } = await runPoly(
      ['ask', '--session', sessionId, '--voice', voiceId, '--prompt', 'Stream ask', '--stream'],
      cliEnv,
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Mock response from');
  });

  test('poly ask exits 1 for unknown voice id', async () => {
    const { exitCode, stderr } = await runPoly(
      ['ask', '--session', sessionId, '--voice', '00000000-0000-0000-0000-000000000099', '--prompt', 'hi'],
      cliEnv,
    );
    expect(exitCode).toBe(1);
    expect(stderr.length).toBeGreaterThan(0);
  });

  // ── search ────────────────────────────────────────────────────────────────

  test('poly search (human) finds seeded message', async () => {
    const { stdout, exitCode } = await runPoly(
      ['search', 'polyphon cli seed'],
      cliEnv,
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain('polyphon');
    expect(stdout).toContain('Poly CLI Test Session');
  });

  test('poly search --format json returns results array', async () => {
    const { stdout, exitCode } = await runPoly(
      ['search', 'polyphon cli seed', '--format', 'json'],
      cliEnv,
    );
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed[0].snippet).toContain('polyphon');
  });

  test('poly search returns empty for unmatched query', async () => {
    const { stdout, exitCode } = await runPoly(
      ['search', 'xyzzy-no-match-poly-cli-e2e'],
      cliEnv,
    );
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe('No results found.');
  });
});
