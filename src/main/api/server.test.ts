import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ApiServerController } from './server';
import { loadOrCreateApiToken } from './auth';

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'poly-server-test-'));
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

async function connectAndRead(
  port: number,
  lines: string[],
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port }, () => {
      socket.setEncoding('utf-8');
    });
    const received: string[] = [];
    let buf = '';
    socket.on('data', (chunk: string) => {
      buf += chunk;
      let idx;
      while ((idx = buf.indexOf('\n')) !== -1) {
        received.push(buf.slice(0, idx));
        buf = buf.slice(idx + 1);
      }
      if (received.length >= lines.length) {
        socket.destroy();
      }
    });
    socket.on('close', () => resolve(received));
    socket.on('error', (err: NodeJS.ErrnoException) => {
      // EPIPE/ECONNRESET means the server closed the connection — treat as close
      if (err.code === 'EPIPE' || err.code === 'ECONNRESET') {
        resolve(received);
      } else {
        reject(err);
      }
    });
    for (const line of lines) {
      socket.write(line + '\n');
    }
    setTimeout(() => { socket.destroy(); resolve(received); }, 2000);
  });
}

describe('ApiServerController', () => {
  let dir: string;
  let tokenPath: string;
  let token: string;
  let port: number;
  let controller: ApiServerController;

  beforeEach(async () => {
    dir = tempDir();
    tokenPath = path.join(dir, 'api.key');
    token = loadOrCreateApiToken(tokenPath);
    port = await getFreePort();
    controller = new ApiServerController({
      port,
      host: '127.0.0.1',
      tokenPath,
      appVersion: '0.0.0-test',
    });
    controller.setDispatchTable({
      'ping': async () => ({ pong: true }),
    });
    await controller.start();
  });

  afterEach(async () => {
    await controller.stop();
    try { fs.rmSync(dir, { recursive: true }); } catch { /* ignore */ }
  });

  it('returns running=true after start', () => {
    expect(controller.getStatus().running).toBe(true);
  });

  it('rejects pre-auth method with -32001 and closes connection', async () => {
    const lines = await connectAndRead(port, [
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping', params: {} }),
    ]);
    const resp = JSON.parse(lines[0]!);
    expect(resp.error?.code).toBe(-32001);
  });

  it('rejects wrong token with -32001', async () => {
    const lines = await connectAndRead(port, [
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'api.authenticate', params: { token: 'wrongtoken' } }),
    ]);
    const resp = JSON.parse(lines[0]!);
    expect(resp.error?.code).toBe(-32001);
  });

  it('authenticates with correct token and dispatches methods', async () => {
    const lines = await connectAndRead(port, [
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'api.authenticate', params: { token } }),
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'ping', params: {} }),
    ]);
    expect(JSON.parse(lines[0]!).result?.ok).toBe(true);
    expect(JSON.parse(lines[1]!).result?.pong).toBe(true);
  });

  it('returns -32601 for unknown method', async () => {
    const lines = await connectAndRead(port, [
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'api.authenticate', params: { token } }),
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'nonexistent', params: {} }),
    ]);
    expect(JSON.parse(lines[1]!).error?.code).toBe(-32601);
  });

  it('rejects invalid JSON with -32700 and closes connection', async () => {
    const lines = await connectAndRead(port, ['not-json-at-all\n']);
    const resp = JSON.parse(lines[0]!);
    expect(resp.error?.code).toBe(-32700);
  });

  it('rejects line exceeding 1MB with -32700', async () => {
    const bigLine = 'x'.repeat(1_100_000);
    const lines = await connectAndRead(port, [bigLine]);
    const resp = JSON.parse(lines[0]!);
    expect(resp.error?.code).toBe(-32700);
  });

  it('stop sets running=false', async () => {
    await controller.stop();
    expect(controller.getStatus().running).toBe(false);
  });

  it('EADDRINUSE sets startupError', async () => {
    const ctrl2 = new ApiServerController({
      port,
      host: '127.0.0.1',
      tokenPath,
      appVersion: '0.0.0-test',
    });
    await ctrl2.start();
    expect(ctrl2.getStatus().running).toBe(false);
    expect(ctrl2.getStatus().startupError).toContain(String(port));
  });
});
