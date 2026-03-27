import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as net from 'node:net';
import { MockPolyphonServer } from './MockPolyphonServer';
import { DEFAULT_COMPOSITION } from './fixtures';

// Low-level TCP helper
async function rawConnect(port: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port }, () => resolve(socket));
    socket.once('error', reject);
  });
}

function send(socket: net.Socket, obj: unknown): void {
  socket.write(JSON.stringify(obj) + '\n');
}

async function recv(socket: net.Socket): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let buf = '';
    const onData = (chunk: Buffer) => {
      buf += chunk.toString('utf8');
      const idx = buf.indexOf('\n');
      if (idx !== -1) {
        socket.removeListener('data', onData);
        resolve(JSON.parse(buf.slice(0, idx)));
      }
    };
    socket.on('data', onData);
    socket.once('error', reject);
    socket.once('close', () => reject(new Error('Socket closed before response')));
  });
}

async function recvMany(socket: net.Socket, count: number): Promise<unknown[]> {
  const results: unknown[] = [];
  return new Promise((resolve, reject) => {
    let buf = '';
    const onData = (chunk: Buffer) => {
      buf += chunk.toString('utf8');
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim()) {
          results.push(JSON.parse(line));
          if (results.length >= count) {
            socket.removeListener('data', onData);
            resolve(results);
          }
        }
      }
    };
    socket.on('data', onData);
    socket.once('error', reject);
    socket.once('close', () => {
      if (results.length >= count) resolve(results);
      else reject(new Error(`Socket closed after ${results.length}/${count} messages`));
    });
  });
}

async function authenticate(socket: net.Socket): Promise<void> {
  send(socket, { jsonrpc: '2.0', id: 0, method: 'api.authenticate', params: { token: 'test-token' } });
  const resp = await recv(socket) as { result?: { ok: boolean } };
  if (!resp.result?.ok) throw new Error('Auth failed');
}

let server: MockPolyphonServer;

beforeEach(async () => {
  server = new MockPolyphonServer({ streamingDelayMs: 5 });
  await server.start();
});

afterEach(async () => {
  await server.stop();
});

describe('authentication', () => {
  it('unauthenticated request returns -32001', async () => {
    const socket = await rawConnect(server.port);
    send(socket, { jsonrpc: '2.0', id: 1, method: 'compositions.list' });
    const resp = await recv(socket) as { error: { code: number } };
    expect(resp.error.code).toBe(-32001);
    socket.destroy();
  });

  it('correct auth returns { ok: true }', async () => {
    const socket = await rawConnect(server.port);
    send(socket, { jsonrpc: '2.0', id: 1, method: 'api.authenticate', params: { token: 'test-token' } });
    const resp = await recv(socket) as { result: { ok: boolean } };
    expect(resp.result.ok).toBe(true);
    socket.destroy();
  });

  it('wrong token returns -32001', async () => {
    const socket = await rawConnect(server.port);
    send(socket, { jsonrpc: '2.0', id: 1, method: 'api.authenticate', params: { token: 'wrong' } });
    const resp = await recv(socket) as { error: { code: number } };
    expect(resp.error.code).toBe(-32001);
    socket.destroy();
  });
});

describe('compositions', () => {
  it('compositions.list returns valid array', async () => {
    const socket = await rawConnect(server.port);
    await authenticate(socket);
    send(socket, { jsonrpc: '2.0', id: 2, method: 'compositions.list' });
    const resp = await recv(socket) as { result: unknown[] };
    expect(Array.isArray(resp.result)).toBe(true);
    expect(resp.result.length).toBeGreaterThan(0);
    socket.destroy();
  });
});

describe('sessions.get', () => {
  it('unknown id returns -32002', async () => {
    const socket = await rawConnect(server.port);
    await authenticate(socket);
    send(socket, { jsonrpc: '2.0', id: 3, method: 'sessions.get', params: { id: 'unknown-id' } });
    const resp = await recv(socket) as { error: { code: number } };
    expect(resp.error.code).toBe(-32002);
    socket.destroy();
  });
});

describe('simulateError', () => {
  it('single-use: first call gets error, second succeeds', async () => {
    server.simulateError('compositions.list', -32099, 'test error');
    const socket = await rawConnect(server.port);
    await authenticate(socket);

    send(socket, { jsonrpc: '2.0', id: 4, method: 'compositions.list' });
    const resp1 = await recv(socket) as { error: { code: number } };
    expect(resp1.error.code).toBe(-32099);

    send(socket, { jsonrpc: '2.0', id: 5, method: 'compositions.list' });
    const resp2 = await recv(socket) as { result: unknown[] };
    expect(Array.isArray(resp2.result)).toBe(true);
    socket.destroy();
  });

  it('error for method A does not affect method B', async () => {
    server.simulateError('sessions.list', -32099, 'test error');
    const socket = await rawConnect(server.port);
    await authenticate(socket);

    send(socket, { jsonrpc: '2.0', id: 6, method: 'compositions.list' });
    const resp = await recv(socket) as { result: unknown[] };
    expect(Array.isArray(resp.result)).toBe(true);
    socket.destroy();
  });

  it('clearCalls() resets pending simulated errors', async () => {
    server.simulateError('compositions.list', -32099, 'test error');
    server.clearCalls();
    const socket = await rawConnect(server.port);
    await authenticate(socket);

    send(socket, { jsonrpc: '2.0', id: 7, method: 'compositions.list' });
    const resp = await recv(socket) as { result: unknown[] };
    expect(Array.isArray(resp.result)).toBe(true);
    socket.destroy();
  });
});

describe('voice.broadcast streaming', () => {
  it('stream.chunk frames arrive before final result; chunk count matches word count; concat equals full response', async () => {
    const socket = await rawConnect(server.port);
    await authenticate(socket);

    // We have 2 voices; each produces "VoiceName: [first 50 chars]"
    // "Claude: Hello there world" splits into words
    const content = 'Hello there world';
    const voices = DEFAULT_COMPOSITION.voices;
    const totalWords = voices.reduce((acc, v) => {
      const response = `${v.displayName}: ${content.slice(0, 50)}`;
      return acc + response.split(' ').length;
    }, 0);

    // totalWords stream.chunk notifications + 1 final result
    const totalFrames = totalWords + 1;
    send(socket, { jsonrpc: '2.0', id: 8, method: 'voice.broadcast', params: { sessionId: 'sess-1', content, stream: true } });

    const frames = await recvMany(socket, totalFrames);

    const chunks = frames.filter((f) => (f as { method?: string }).method === 'stream.chunk') as Array<{
      params: { delta: string; voiceName: string };
    }>;
    const resultFrame = frames.find((f) => (f as { result?: unknown }).result !== undefined) as {
      result: { messages: Array<{ role: string; content: string; voiceName: string | null }> };
    } | undefined;

    // All chunks arrive before the final result
    const resultIndex = frames.indexOf(resultFrame!);
    const lastChunkIndex = Math.max(...chunks.map((c) => frames.indexOf(c)));
    expect(lastChunkIndex).toBeLessThan(resultIndex);

    // Chunk count matches word count
    expect(chunks.length).toBe(totalWords);

    // Concatenated deltas equal full voice response text
    const concatenated = chunks.map((c) => c.params.delta).join('').trimEnd();
    const voiceMessages = resultFrame!.result.messages.filter((m) => m.role === 'voice');
    const fullText = voiceMessages.map((m) => m.content).join(' ');
    expect(concatenated).toBe(fullText);

    socket.destroy();
  });
});

describe('mcp state', () => {
  it('mcp.setEnabled stateful toggle works', async () => {
    const socket = await rawConnect(server.port);
    await authenticate(socket);

    send(socket, { jsonrpc: '2.0', id: 9, method: 'mcp.setEnabled', params: { enabled: true } });
    const resp1 = await recv(socket) as { result: { enabled: boolean } };
    expect(resp1.result.enabled).toBe(true);

    send(socket, { jsonrpc: '2.0', id: 10, method: 'mcp.setEnabled', params: { enabled: false } });
    const resp2 = await recv(socket) as { result: { enabled: boolean } };
    expect(resp2.result.enabled).toBe(false);

    socket.destroy();
  });
});

describe('stop() while response in progress', () => {
  it('server closes cleanly', async () => {
    const slowServer = new MockPolyphonServer({ streamingDelayMs: 50 });
    await slowServer.start();
    const socket = await rawConnect(slowServer.port);

    send(socket, { jsonrpc: '2.0', id: 0, method: 'api.authenticate', params: { token: 'test-token' } });
    await recv(socket);

    send(socket, {
      jsonrpc: '2.0', id: 11, method: 'voice.broadcast',
      params: { sessionId: 'sess-1', content: 'This is a long content message to stream', stream: true },
    });

    // Stop before streaming completes
    setTimeout(() => slowServer.stop(), 20);

    await new Promise<void>((resolve) => {
      socket.once('close', resolve);
      socket.once('error', () => resolve());
    });
    // Just verify we get here without hanging
  });
});
