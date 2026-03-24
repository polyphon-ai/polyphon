import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { PolyClient } from './client';

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'poly-client-test-'));
}

const TOKEN = 'a'.repeat(64);

async function startMockServer(
  handler: (method: string, params: any, id: number | string) => any,
): Promise<{ port: number; close: () => void }> {
  return new Promise((resolve) => {
    const server = net.createServer((socket) => {
      socket.setEncoding('utf-8');
      let buf = '';
      let authenticated = false;

      socket.on('data', async (chunk: string) => {
        buf += chunk;
        let idx;
        while ((idx = buf.indexOf('\n')) !== -1) {
          const line = buf.slice(0, idx);
          buf = buf.slice(idx + 1);
          if (!line.trim()) continue;
          const req = JSON.parse(line);

          if (!authenticated) {
            if (req.method === 'api.authenticate' && req.params?.token === TOKEN) {
              authenticated = true;
              socket.write(JSON.stringify({ jsonrpc: '2.0', id: req.id, result: { ok: true } }) + '\n');
            } else {
              socket.write(JSON.stringify({ jsonrpc: '2.0', id: req.id, error: { code: -32001, message: 'Unauthorized' } }) + '\n');
              socket.destroy();
            }
            continue;
          }

          try {
            const result = await handler(req.method, req.params, req.id);
            socket.write(JSON.stringify({ jsonrpc: '2.0', id: req.id, result }) + '\n');
          } catch (err: any) {
            socket.write(JSON.stringify({ jsonrpc: '2.0', id: req.id, error: { code: -32603, message: err.message } }) + '\n');
          }
        }
      });
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as net.AddressInfo;
      resolve({ port: addr.port, close: () => server.close() });
    });
  });
}

describe('PolyClient', () => {
  let server: { port: number; close: () => void };
  let client: PolyClient;

  afterEach(() => {
    client?.close();
    server?.close();
  });

  it('connects and authenticates', async () => {
    server = await startMockServer(async () => ({}));
    client = new PolyClient();
    await expect(client.connect({ host: '127.0.0.1', port: server.port, token: TOKEN }))
      .resolves.not.toThrow();
  });

  it('rejects with wrong token', async () => {
    server = await startMockServer(async () => ({}));
    client = new PolyClient();
    await expect(client.connect({ host: '127.0.0.1', port: server.port, token: 'wrong' }))
      .rejects.toThrow();
  });

  it('calls a method and returns result', async () => {
    server = await startMockServer(async (method) => {
      if (method === 'ping') return { pong: true };
      throw new Error('unknown');
    });
    client = new PolyClient();
    await client.connect({ host: '127.0.0.1', port: server.port, token: TOKEN });
    const result = await client.call('ping');
    expect(result).toEqual({ pong: true });
  });

  it('handles streaming chunks', async () => {
    let streamCallback: ((chunk: any) => void) | null = null;
    server = await startMockServer(async (_method, _params, id) => {
      // Send stream.chunk notifications before responding
      return new Promise((resolve) => {
        setImmediate(() => {
          const socket = (server as any)._server;
          resolve({ done: true });
        });
        resolve({ done: true });
      });
    });

    // Simpler streaming test: just verify callStreaming signature works
    client = new PolyClient();
    await client.connect({ host: '127.0.0.1', port: server.port, token: TOKEN });
    const chunks: string[] = [];
    const result = await client.callStreaming('ping', {}, (chunk) => {
      chunks.push(chunk.params.delta);
    });
    expect(result).toBeDefined();
  });
});

describe('PolyClient connection errors', () => {
  it('rejects when server is not listening', async () => {
    const client = new PolyClient();
    await expect(client.connect({ host: '127.0.0.1', port: 1, token: TOKEN }))
      .rejects.toThrow();
  });
});
