/**
 * E2E tests for MCP Server support.
 *
 * Two test areas:
 * 1. Headless MCP server: launch with --mcp-server --headless, connect a minimal
 *    JSON-RPC client over stdio, verify polyphon_list_compositions returns a
 *    structured response.
 * 2. Settings toggle: in GUI mode, enable the MCP Server toggle and verify the
 *    "Running" status indicator appears.
 *
 * The module-level beforeAll/afterAll follows the same pattern used by
 * compositions.spec.ts and other tests in this directory to guarantee a single
 * shared Electron instance across all tests in this file.
 */

import { test, expect } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import electronBin from 'electron';
import os from 'os';
import fs from 'fs';
import { APP_ENTRY, makeTempDir, launchMockApp, skipOnboarding } from './helpers';

// ── Shared GUI app (Settings toggle tests) ───────────────────────────────────

let app: ElectronApplication;
let window: Page;

test.beforeAll(async () => {
  app = await launchMockApp();
  window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  await skipOnboarding(window);
});

test.afterAll(async () => {
  await app.close().catch(() => {});
});

// ── JSON-RPC / MCP helpers ────────────────────────────────────────────────────

interface JsonRpcResponse {
  jsonrpc: string;
  id?: number | null;
  result?: unknown;
  error?: { code: number; message: string };
  method?: string; // notifications
}

/**
 * Send a single JSON-RPC request to `proc.stdin` and wait for the matching
 * response on `proc.stdout`. Responses are newline-delimited JSON.
 */
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
          // Not JSON or not the response we're waiting for — ignore.
        }
      }
    };

    const timer = setTimeout(() => {
      proc.stdout?.off('data', onData);
      reject(new Error(`MCP timeout: no response to "${method}" (id=${id}) within 20 s`));
    }, 20_000);

    proc.stdout?.on('data', onData);
    proc.stdin?.write(msg);
  });
}

/** Wait for a child process to exit, with a SIGKILL fallback after `timeoutMs`. */
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

/** Build a minimal env block for headless tests — no credentials, no noise. */
function buildHeadlessEnv(userData: string): Record<string, string> {
  return {
    HOME: process.env.HOME ?? os.homedir(),
    PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
    NODE_ENV: 'test',
    POLYPHON_TEST_USER_DATA: userData,
    POLYPHON_E2E: '1',
    ...(process.env.TMPDIR ? { TMPDIR: process.env.TMPDIR } : {}),
  };
}

// ── Headless MCP server ───────────────────────────────────────────────────────

test.describe('MCP headless server', () => {
  test('polyphon_list_compositions returns structured JSON over stdio', async () => {
    const userData = makeTempDir();
    let proc: ChildProcess | null = null;

    try {
      // Spawn Electron directly so we own stdin/stdout without Playwright's CDP
      // infrastructure. electron.launch() expects a BrowserWindow for its CDP
      // connection; headless mode never creates one, so we bypass Playwright here.
      proc = spawn(
        electronBin as unknown as string,
        [
          APP_ENTRY,
          '--no-sandbox',
          '--mcp-server',
          '--headless',
          ...(process.env.CI ? ['--disable-gpu'] : []),
        ],
        {
          env: buildHeadlessEnv(userData),
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );

      // Consume stderr so it doesn't buffer-stall the process.
      proc.stderr?.resume();

      // ── 1. Initialize ─────────────────────────────────────────────────────
      const initResp = await mcpRequest(proc, 1, 'initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'polyphon-e2e', version: '1.0.0' },
      });

      expect(initResp.error).toBeUndefined();
      const initResult = initResp.result as Record<string, unknown>;
      expect(initResult).toHaveProperty('serverInfo');
      const serverInfo = initResult.serverInfo as Record<string, string>;
      expect(serverInfo.name).toBe('polyphon');

      // Acknowledge initialization (notification — no response expected).
      proc.stdin?.write(
        JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n',
      );

      // ── 2. List tools ─────────────────────────────────────────────────────
      const toolsResp = await mcpRequest(proc, 2, 'tools/list');

      expect(toolsResp.error).toBeUndefined();
      const toolsResult = toolsResp.result as { tools: { name: string }[] };
      const toolNames = toolsResult.tools.map((t) => t.name);

      expect(toolNames).toContain('polyphon_list_compositions');
      expect(toolNames).toContain('polyphon_create_session');
      expect(toolNames).toContain('polyphon_broadcast');
      expect(toolNames).toContain('polyphon_ask');
      expect(toolNames).toContain('polyphon_get_history');

      // ── 3. Call polyphon_list_compositions ────────────────────────────────
      const callResp = await mcpRequest(proc, 3, 'tools/call', {
        name: 'polyphon_list_compositions',
        arguments: {},
      });

      expect(callResp.error).toBeUndefined();
      const callResult = callResp.result as {
        content: { type: string; text: string }[];
        isError?: boolean;
      };
      expect(callResult.isError).toBeFalsy();
      expect(callResult.content).toHaveLength(1);
      expect(callResult.content[0].type).toBe('text');

      const payload = JSON.parse(callResult.content[0].text) as {
        compositions: unknown[];
      };
      expect(payload).toHaveProperty('compositions');
      expect(Array.isArray(payload.compositions)).toBe(true);
      // Fresh DB — no compositions seeded — result is an empty array.
      expect(payload.compositions).toHaveLength(0);
    } finally {
      proc?.kill('SIGTERM');
      // Wait for the process to release file handles before wiping the temp dir.
      if (proc) await waitForExit(proc);
      fs.rmSync(userData, { recursive: true, force: true });
    }
  });
});

// ── Settings MCP toggle (GUI mode) ────────────────────────────────────────────

async function goToMcpTab(): Promise<void> {
  await window.getByRole('button', { name: /settings/i }).click();
  await window.getByRole('tab', { name: /^mcp server$/i }).click();
}

test.describe('MCP Settings toggle', () => {
  test('MCP Server section is present in Settings', async () => {
    await goToMcpTab();
    await expect(window.getByRole('heading', { name: 'MCP Server' })).toBeVisible();
    await expect(window.getByText(/expose polyphon as an mcp tool server/i).first()).toBeVisible();
  });

  test('toggle is off and no Running badge by default', async () => {
    await goToMcpTab();
    const toggle = window.getByRole('switch');
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(window.getByText('Running')).not.toBeVisible();
  });

  test('enabling toggle shows Running status and connect instructions', async () => {
    await goToMcpTab();
    const toggle = window.getByRole('switch');
    await toggle.click();
    // Wait for the IPC round-trip + server start to reflect in the UI.
    await expect(window.getByText('Running')).toBeVisible({ timeout: 10_000 });
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    // Connect instructions are shown when the server is running.
    await expect(window.getByText('polyphon --mcp-server --headless')).toBeVisible();
    // Disable so the next test starts from a clean state.
    await toggle.click();
    await expect(window.getByText('Running')).not.toBeVisible({ timeout: 10_000 });
  });

  test('disabling toggle removes Running badge', async () => {
    await goToMcpTab();
    const toggle = window.getByRole('switch');
    // Enable the server first.
    await toggle.click();
    await expect(window.getByText('Running')).toBeVisible({ timeout: 10_000 });
    // Now disable it.
    await toggle.click();
    await expect(window.getByText('Running')).not.toBeVisible({ timeout: 10_000 });
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
  });
});
