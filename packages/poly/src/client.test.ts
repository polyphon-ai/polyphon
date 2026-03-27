import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PolyphonClient } from '../../../src/sdk/index.js';
import { MockPolyphonServer, DEFAULT_COMPOSITION, DEFAULT_SESSION } from '../../../src/sdk/testing/index.js';

const TOKEN = 'test-token';

describe('poly SDK integration', () => {
  let server: MockPolyphonServer;
  let client: PolyphonClient;

  beforeEach(async () => {
    server = new MockPolyphonServer({ token: TOKEN, streamingDelayMs: 0 });
    await server.start();
    client = new PolyphonClient({ port: server.port, token: TOKEN });
    await client.connect();
  });

  afterEach(async () => {
    client.disconnect();
    await server.stop();
  });

  it('lists compositions', async () => {
    const comps = await client.compositions();
    expect(comps).toHaveLength(1);
    expect(comps[0].id).toBe(DEFAULT_COMPOSITION.id);
  });

  it('lists sessions', async () => {
    const sessions = await client.sessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe(DEFAULT_SESSION.id);
  });

  it('broadcasts a message and returns voice responses', async () => {
    const result = await client.broadcast({ sessionId: DEFAULT_SESSION.id, content: 'hello' });
    expect(result.messages).toHaveLength(DEFAULT_COMPOSITION.voices.length);
  });

  it('streams broadcast chunks', async () => {
    const chunks: string[] = [];
    await client.broadcast(
      { sessionId: DEFAULT_SESSION.id, content: 'hello' },
      (chunk) => chunks.push(chunk.delta),
    );
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('asks a specific voice', async () => {
    const voiceId = DEFAULT_COMPOSITION.voices[0].id;
    const result = await client.ask({ sessionId: DEFAULT_SESSION.id, voiceId, content: 'hello' });
    expect(result.message).toBeDefined();
    expect(result.message.voiceId).toBe(voiceId);
  });

  it('rejects connection with wrong token', async () => {
    const badClient = new PolyphonClient({ port: server.port, token: 'wrong' });
    await expect(badClient.connect()).rejects.toThrow();
  });

  it('returns RpcError on simulated server error', async () => {
    server.simulateError('compositions.list', -32000, 'something went wrong');
    await expect(client.compositions()).rejects.toThrow('something went wrong');
  });
});
