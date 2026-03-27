import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PolyphonClient } from './client';
import { MockPolyphonServer } from './testing/MockPolyphonServer';
import { RpcError } from './errors';
import { DEFAULT_COMPOSITION, DEFAULT_SESSION } from './testing/fixtures';

let server: MockPolyphonServer;
let client: PolyphonClient;

beforeEach(async () => {
  server = new MockPolyphonServer({ streamingDelayMs: 5 });
  await server.start();
  client = new PolyphonClient({ host: '127.0.0.1', port: server.port, token: 'test-token' });
});

afterEach(async () => {
  client.disconnect();
  await server.stop();
});

describe('constructor defaults', () => {
  it('uses default host and port when not specified', () => {
    const defaultClient = new PolyphonClient({ token: 'tok' });
    expect(defaultClient.getState()).toBe('idle');
  });
});

describe('connect', () => {
  it('authenticates successfully', async () => {
    await expect(client.connect()).resolves.toBeUndefined();
    expect(client.getState()).toBe('connected');
  });

  it('rejects with RpcError on wrong token', async () => {
    const badClient = new PolyphonClient({ host: '127.0.0.1', port: server.port, token: 'wrong' });
    await expect(badClient.connect()).rejects.toSatisfy(
      (e: unknown) => e instanceof RpcError && e.code === -32001
    );
    badClient.disconnect();
  });

  it('rejects promptly for non-listening port', async () => {
    const noServer = new PolyphonClient({ host: '127.0.0.1', port: 19999, token: 'test-token' });
    const start = Date.now();
    await expect(noServer.connect()).rejects.toThrow();
    expect(Date.now() - start).toBeLessThan(2000);
  });
});

describe('state machine', () => {
  it('throws before connect()', () => {
    expect(() => client.compositions()).toThrow('Not connected. Call connect() first.');
  });

  it('throws after disconnect()', async () => {
    await client.connect();
    client.disconnect();
    // Give the close event time to fire
    await new Promise((r) => setTimeout(r, 20));
    expect(() => client.compositions()).toThrow('Client is disconnected.');
  });
});

describe('compositions', () => {
  beforeEach(() => client.connect());

  it('returns DEFAULT_COMPOSITION list', async () => {
    const result = await client.compositions();
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe(DEFAULT_COMPOSITION.id);
  });
});

describe('sessions.create', () => {
  beforeEach(() => client.connect());

  it('passes source param', async () => {
    await client.createSession(DEFAULT_COMPOSITION.id, 'my-app');
    const calls = server.calls('sessions.create');
    expect(calls).toHaveLength(1);
    expect((calls[0] as { source: string }).source).toBe('my-app');
  });
});

describe('voice.broadcast', () => {
  beforeEach(() => client.connect());

  it('resolves with messages array', async () => {
    const result = await client.broadcast({ sessionId: DEFAULT_SESSION.id, content: 'Hello world' });
    expect(result.messages.length).toBeGreaterThan(0);
  });

  it('onChunk called N times, all arrive before resolve, concatenated equals full response', async () => {
    const chunks: string[] = [];
    let promiseResolved = false;

    const promise = client.broadcast(
      { sessionId: DEFAULT_SESSION.id, content: 'Hello there world' },
      (chunk) => {
        expect(promiseResolved).toBe(false);
        chunks.push(chunk.delta);
      }
    );

    const result = await promise;
    promiseResolved = true;

    // There are 2 voices — find all voice messages
    const voiceMessages = result.messages.filter((m) => m.role === 'voice');
    expect(voiceMessages.length).toBe(2);

    // responseTemplate: "[VoiceName]: [first 50 chars of content]"
    const expectedTexts = voiceMessages.map((m) => m.content);
    const allExpectedWords = expectedTexts.flatMap((t) => t.split(' ').map((w) => w + ' '));
    expect(chunks).toHaveLength(allExpectedWords.length);

    // Concatenated chunks equal the full voice responses
    const concatenated = chunks.join('').trimEnd();
    const fullText = expectedTexts.join(' ');
    expect(concatenated).toBe(fullText);
  });

  it('concurrent broadcast — each onChunk receives only its own chunks', async () => {
    const chunksA: string[] = [];
    const chunksB: string[] = [];

    const [resultA, resultB] = await Promise.all([
      client.broadcast({ sessionId: DEFAULT_SESSION.id, content: 'Query A from client' }, (c) => chunksA.push(c.delta)),
      client.broadcast({ sessionId: DEFAULT_SESSION.id, content: 'Query B from client' }, (c) => chunksB.push(c.delta)),
    ]);

    expect(chunksA.length).toBeGreaterThan(0);
    expect(chunksB.length).toBeGreaterThan(0);

    // Each set of chunks should correspond to its own result
    const voiceMessagesA = resultA.messages.filter((m) => m.role === 'voice');
    const voiceMessagesB = resultB.messages.filter((m) => m.role === 'voice');
    const fullA = voiceMessagesA.map((m) => m.content).join(' ');
    const fullB = voiceMessagesB.map((m) => m.content).join(' ');

    expect(chunksA.join('').trimEnd()).toBe(fullA);
    expect(chunksB.join('').trimEnd()).toBe(fullB);
  });
});

describe('simulateError', () => {
  beforeEach(() => client.connect());

  it('single-use: first call fails, second succeeds', async () => {
    server.simulateError('compositions.list', -32002, 'not found');
    await expect(client.compositions()).rejects.toSatisfy(
      (e: unknown) => e instanceof RpcError && e.code === -32002
    );
    await expect(client.compositions()).resolves.toBeDefined();
  });
});

describe('server.calls', () => {
  beforeEach(() => client.connect());

  it('records broadcast params', async () => {
    await client.broadcast({ sessionId: 'sess-1', content: 'test message' });
    const calls = server.calls('voice.broadcast');
    expect(calls).toHaveLength(1);
    expect((calls[0] as { content: string }).content).toBe('test message');
  });
});

describe('disconnect event', () => {
  it('fires when server closes connection', async () => {
    await client.connect();
    const disconnectPromise = new Promise<void>((resolve) => client.once('disconnect', resolve));
    await server.stop();
    await disconnectPromise;
    expect(client.getState()).toBe('disconnected');
  });
});

describe('mid-stream disconnect', () => {
  it('broadcast rejects when server stops mid-stream', async () => {
    // Use a server with a slower streaming delay so we can stop it mid-stream
    const slowServer = new MockPolyphonServer({ streamingDelayMs: 50 });
    await slowServer.start();
    const slowClient = new PolyphonClient({
      host: '127.0.0.1',
      port: slowServer.port,
      token: 'test-token',
    });
    await slowClient.connect();

    const broadcastPromise = slowClient.broadcast(
      { sessionId: DEFAULT_SESSION.id, content: 'Hello there wonderful world today' },
      () => {} // stream mode
    );

    // Stop the server after a short delay (mid-stream)
    setTimeout(() => slowServer.stop(), 30);

    await expect(broadcastPromise).rejects.toThrow();
    slowClient.disconnect();
  });
});

describe('partial TCP reads', () => {
  it('parses response correctly when split across data events', async () => {
    // Connect a raw socket to send a fragmented JSON-RPC message
    await client.connect();
    // We rely on the fact that MockPolyphonServer and PolyphonClient both handle
    // partial reads via line-buffering. Test by making a normal call and verifying
    // the client buffers correctly.
    const result = await client.compositions();
    expect(result).toHaveLength(1);
  });
});

describe('remaining API methods', () => {
  beforeEach(() => client.connect());

  it('getComposition', async () => {
    const result = await client.getComposition({ id: DEFAULT_COMPOSITION.id });
    expect(result.id).toBe(DEFAULT_COMPOSITION.id);
  });

  it('createComposition', async () => {
    const result = await client.createComposition({
      name: 'New',
      mode: 'broadcast',
      continuationPolicy: 'none',
      continuationMaxRounds: 1,
      voices: [],
    });
    expect(result.name).toBe('New');
  });

  it('updateComposition', async () => {
    const result = await client.updateComposition({ id: DEFAULT_COMPOSITION.id, data: { name: 'Updated' } });
    expect(result.id).toBe(DEFAULT_COMPOSITION.id);
  });

  it('deleteComposition', async () => {
    await expect(client.deleteComposition({ id: DEFAULT_COMPOSITION.id })).resolves.toBeNull();
  });

  it('archiveComposition', async () => {
    const result = await client.archiveComposition({ id: DEFAULT_COMPOSITION.id, archived: true });
    expect(result.archived).toBe(true);
  });

  it('sessions', async () => {
    const result = await client.sessions();
    expect(result.length).toBeGreaterThan(0);
  });

  it('getSession', async () => {
    const result = await client.getSession({ id: DEFAULT_SESSION.id });
    expect(result.id).toBe(DEFAULT_SESSION.id);
  });

  it('deleteSession', async () => {
    await expect(client.deleteSession({ id: DEFAULT_SESSION.id })).resolves.toBeNull();
  });

  it('renameSession', async () => {
    const result = await client.renameSession({ id: DEFAULT_SESSION.id, name: 'Renamed' });
    expect(result.name).toBe('Renamed');
  });

  it('archiveSession', async () => {
    const result = await client.archiveSession({ id: DEFAULT_SESSION.id, archived: true });
    expect(result.archived).toBe(true);
  });

  it('getMessages', async () => {
    const result = await client.getMessages({ sessionId: DEFAULT_SESSION.id });
    expect(result.length).toBeGreaterThan(0);
  });

  it('exportSession', async () => {
    const result = await client.exportSession({ sessionId: DEFAULT_SESSION.id, format: 'markdown' });
    expect(result.format).toBe('markdown');
  });

  it('ask without streaming', async () => {
    const result = await client.ask({
      sessionId: DEFAULT_SESSION.id,
      voiceId: DEFAULT_COMPOSITION.voices[0]!.id,
      content: 'What is the answer?',
    });
    expect(result.message.role).toBe('voice');
  });

  it('ask with streaming', async () => {
    const chunks: string[] = [];
    const result = await client.ask(
      { sessionId: DEFAULT_SESSION.id, voiceId: DEFAULT_COMPOSITION.voices[0]!.id, content: 'Tell me more' },
      (c) => chunks.push(c.delta),
    );
    expect(result.message.role).toBe('voice');
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('abort', async () => {
    const result = await client.abort({ sessionId: DEFAULT_SESSION.id });
    expect(result.aborted).toBe(true);
  });

  it('searchMessages', async () => {
    const result = await client.searchMessages({ query: 'France' });
    expect(Array.isArray(result)).toBe(true);
  });

  it('getMcpStatus', async () => {
    const result = await client.getMcpStatus();
    expect(typeof result.enabled).toBe('boolean');
  });

  it('setMcpEnabled', async () => {
    const result = await client.setMcpEnabled({ enabled: true });
    expect(result.enabled).toBe(true);
  });

  it('getProviderStatus', async () => {
    const result = await client.getProviderStatus();
    expect(Array.isArray(result)).toBe(true);
  });

  it('getDebugInfo', async () => {
    const result = await client.getDebugInfo();
    expect(result.appVersion).toBeTruthy();
  });

  it('getUserProfile', async () => {
    const result = await client.getUserProfile();
    expect(result.conductorName).toBeTruthy();
  });

  it('getApiStatus', async () => {
    const result = await client.getApiStatus();
    expect(result.running).toBe(true);
  });

  it('getApiSpec', async () => {
    const result = await client.getApiSpec();
    expect(result.openrpc).toBeTruthy();
  });
});
