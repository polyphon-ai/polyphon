/**
 * Live e2e tests for MCP Server with CLI voices.
 *
 * Tests the full MCP JSON-RPC API against a real headless Polyphon process
 * backed by an Anthropic CLI (claude) voice. All tests skip gracefully when
 * the claude binary is not available.
 *
 * Run via: make test-e2e-mcp-live
 *
 * Sequence:
 *   Phase 1 (GUI)     — launch the full app, check CLI availability, create a
 *                        CLI voice composition, close the app.
 *   Phase 2 (Headless) — spawn --mcp-server --headless against the same data
 *                        dir, then drive the full MCP tool chain over stdio:
 *                        initialize → list_compositions → create_session →
 *                        broadcast → ask → get_history.
 */

import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import electronBin from 'electron';
import fs from 'fs';
import { APP_ENTRY, makeTempDir, launchApp, skipOnboarding } from './helpers';
import { makePause, enableProvider, isCliAvailable, buildCompositionLive } from './helpers/liveHelpers';
import { goToProvidersTab } from './helpers';

// ── JSON-RPC helpers ──────────────────────────────────────────────────────────

interface JsonRpcResponse {
  jsonrpc: string;
  id?: number | null;
  result?: unknown;
  error?: { code: number; message: string };
  method?: string;
}

function mcpRequest(
  proc: ChildProcess,
  id: number,
  method: string,
  params: Record<string, unknown> = {},
): Promise<JsonRpcResponse> {
  return new Promise((resolve, reject) => {
    const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
    let buf = '';

    const onData = (chunk: Buffer | string) => {
      buf += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed) as JsonRpcResponse;
          if (parsed.id === id) {
            proc.stdout?.off('data', onData);
            clearTimeout(timer);
            resolve(parsed);
          }
        } catch {
          // Not JSON or not the response we need — ignore.
        }
      }
    };

    const timer = setTimeout(() => {
      proc.stdout?.off('data', onData);
      reject(new Error(`MCP timeout: no response to "${method}" (id=${id}) within 90 s`));
    }, 90_000);

    proc.stdout?.on('data', onData);
    proc.stdin?.write(msg);
  });
}

function waitForExit(proc: ChildProcess, timeoutMs = 5_000): Promise<void> {
  return new Promise<void>((resolve) => {
    const t = setTimeout(() => {
      proc.kill('SIGKILL');
      resolve();
    }, timeoutMs);
    proc.once('exit', () => {
      clearTimeout(t);
      resolve();
    });
  });
}

/** Build an env block that passes through live credentials so CLI tools work. */
function buildLiveHeadlessEnv(userData: string): Record<string, string> {
  return {
    ...(process.env as Record<string, string>),
    NODE_ENV: 'test',
    POLYPHON_TEST_USER_DATA: userData,
    POLYPHON_E2E: '1',
  };
}

// ── Suite constants ───────────────────────────────────────────────────────────

const COMPOSITION_NAME = 'MCP Live CLI Composition';
const VOICE_NAME = 'Claude CLI';

// ── Suite state ───────────────────────────────────────────────────────────────

let userData: string;
let suiteShouldSkip = false;

let mcpProc: ChildProcess | null = null;
let idCounter = 1;
const nextId = () => idCounter++;

let compositionId: string;
let sessionId: string;

// ── Suite ─────────────────────────────────────────────────────────────────────

test.describe.serial('MCP live — CLI voices', () => {
  test.beforeAll(async () => {
    userData = makeTempDir();

    const app: ElectronApplication = await launchApp({
      POLYPHON_TEST_USER_DATA: userData,
      POLYPHON_SHOW_WINDOW: '1',
    });
    const win: Page = await app.firstWindow();
    await win.waitForLoadState('domcontentloaded');
    await skipOnboarding(win);

    const { pause, longPause } = makePause(win);
    await pause();

    const claudeAvailable = await isCliAvailable(win, 'claude');
    if (!claudeAvailable) {
      suiteShouldSkip = true;
      await app.close().catch(() => {});
      return;
    }

    await enableProvider(win, 'anthropic', 'cli');

    // Navigate to Settings so SettingsPage mounts and calls load(), which
    // refreshes providerConfigs in the Zustand store. VoiceSelector reads from
    // that store — without this step the Anthropic provider button won't appear.
    await goToProvidersTab(win);
    await pause();

    await buildCompositionLive(
      win,
      pause,
      longPause,
      COMPOSITION_NAME,
      [{ providerId: 'anthropic', voiceType: 'cli', displayName: VOICE_NAME }],
      { mode: 'broadcast', continuationPolicy: 'none' },
    );

    await app.close().catch(() => {});
  });

  test.afterAll(async () => {
    mcpProc?.kill('SIGTERM');
    if (mcpProc) await waitForExit(mcpProc);
    fs.rmSync(userData, { recursive: true, force: true });
  });

  // ── 1. Initialize ─────────────────────────────────────────────────────────

  test('initialize MCP server', async () => {
    if (suiteShouldSkip) {
      test.skip(true, 'claude CLI binary not found');
      return;
    }

    mcpProc = spawn(
      electronBin as unknown as string,
      [
        APP_ENTRY,
        '--no-sandbox',
        '--mcp-server',
        '--headless',
        ...(process.env.CI ? ['--disable-gpu'] : []),
      ],
      {
        env: buildLiveHeadlessEnv(userData),
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );

    mcpProc.stderr?.resume();

    const resp = await mcpRequest(mcpProc, nextId(), 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'polyphon-e2e-live', version: '1.0.0' },
    });

    expect(resp.error).toBeUndefined();
    const result = resp.result as Record<string, unknown>;
    expect((result.serverInfo as Record<string, string>).name).toBe('polyphon');

    mcpProc.stdin?.write(
      JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n',
    );
  });

  // ── 2. List compositions ──────────────────────────────────────────────────

  test('polyphon_list_compositions returns the CLI composition', async () => {
    if (suiteShouldSkip || !mcpProc) {
      test.skip(true, 'prerequisites missing');
      return;
    }

    const resp = await mcpRequest(mcpProc, nextId(), 'tools/call', {
      name: 'polyphon_list_compositions',
      arguments: {},
    });

    expect(resp.error).toBeUndefined();
    const result = resp.result as { content: { type: string; text: string }[]; isError?: boolean };
    expect(result.isError).toBeFalsy();

    const payload = JSON.parse(result.content[0].text) as {
      compositions: Array<{ id: string; name: string }>;
    };
    expect(Array.isArray(payload.compositions)).toBe(true);

    const comp = payload.compositions.find((c) => c.name === COMPOSITION_NAME);
    expect(comp).toBeDefined();
    compositionId = comp!.id;
  });

  // ── 3. Create session ─────────────────────────────────────────────────────

  test('polyphon_create_session creates a session from the CLI composition', async () => {
    if (suiteShouldSkip || !mcpProc || !compositionId) {
      test.skip(true, 'prerequisites missing');
      return;
    }

    const resp = await mcpRequest(mcpProc, nextId(), 'tools/call', {
      name: 'polyphon_create_session',
      arguments: { compositionId, name: 'MCP Live CLI Session' },
    });

    expect(resp.error).toBeUndefined();
    const result = resp.result as { content: { type: string; text: string }[]; isError?: boolean };
    expect(result.isError).toBeFalsy();

    const payload = JSON.parse(result.content[0].text) as {
      session: { id: string; name: string };
    };
    expect(payload.session.name).toBe('MCP Live CLI Session');
    sessionId = payload.session.id;
  });

  // ── 4. Broadcast ──────────────────────────────────────────────────────────

  test('polyphon_broadcast gets a real response from Claude CLI', async () => {
    if (suiteShouldSkip || !mcpProc || !sessionId) {
      test.skip(true, 'prerequisites missing');
      return;
    }

    const resp = await mcpRequest(mcpProc, nextId(), 'tools/call', {
      name: 'polyphon_broadcast',
      arguments: {
        sessionId,
        content: 'Reply in exactly one sentence and include the word "mcp".',
      },
    });

    expect(resp.error).toBeUndefined();
    const result = resp.result as { content: { type: string; text: string }[]; isError?: boolean };
    expect(result.isError).toBeFalsy();

    const payload = JSON.parse(result.content[0].text) as {
      responses: Array<{ voiceName: string; content: string }>;
      roundIndex: number;
    };
    expect(Array.isArray(payload.responses)).toBe(true);
    expect(payload.responses.length).toBeGreaterThan(0);
    expect(payload.responses[0].voiceName).toBe(VOICE_NAME);
    expect(payload.responses[0].content.length).toBeGreaterThan(0);
    expect(typeof payload.roundIndex).toBe('number');
  });

  // ── 5. Ask ────────────────────────────────────────────────────────────────

  test('polyphon_ask targets Claude CLI by name and gets a response', async () => {
    if (suiteShouldSkip || !mcpProc || !sessionId) {
      test.skip(true, 'prerequisites missing');
      return;
    }

    const resp = await mcpRequest(mcpProc, nextId(), 'tools/call', {
      name: 'polyphon_ask',
      arguments: {
        sessionId,
        voiceName: VOICE_NAME,
        content: 'Reply in exactly one sentence and include the word "directed".',
      },
    });

    expect(resp.error).toBeUndefined();
    const result = resp.result as { content: { type: string; text: string }[]; isError?: boolean };
    expect(result.isError).toBeFalsy();

    const payload = JSON.parse(result.content[0].text) as {
      voiceName: string;
      content: string;
      roundIndex: number;
    };
    expect(payload.voiceName).toBe(VOICE_NAME);
    expect(payload.content.length).toBeGreaterThan(0);
    expect(typeof payload.roundIndex).toBe('number');
  });

  // ── 6. Get history ────────────────────────────────────────────────────────

  test('polyphon_get_history returns conductor and voice messages', async () => {
    if (suiteShouldSkip || !mcpProc || !sessionId) {
      test.skip(true, 'prerequisites missing');
      return;
    }

    const resp = await mcpRequest(mcpProc, nextId(), 'tools/call', {
      name: 'polyphon_get_history',
      arguments: { sessionId, limit: 20 },
    });

    expect(resp.error).toBeUndefined();
    const result = resp.result as { content: { type: string; text: string }[]; isError?: boolean };
    expect(result.isError).toBeFalsy();

    const payload = JSON.parse(result.content[0].text) as {
      session: { id: string };
      messages: Array<{ role: string; content: string }>;
    };
    expect(payload.session.id).toBe(sessionId);
    expect(Array.isArray(payload.messages)).toBe(true);

    // broadcast + ask = 2 conductor messages + 2 voice responses at minimum
    expect(payload.messages.length).toBeGreaterThanOrEqual(4);

    const voiceMessages = payload.messages.filter((m) => m.role === 'voice');
    expect(voiceMessages.length).toBeGreaterThanOrEqual(2);
    voiceMessages.forEach((m) => expect(m.content.length).toBeGreaterThan(0));
  });
});
