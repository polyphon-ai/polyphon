/**
 * Minimal OpenAI-compatible HTTP server for e2e testing.
 *
 * Implements:
 *   GET  /v1/models              → { object: 'list', data: [{ id: 'mock-model', ... }] }
 *   POST /v1/chat/completions    → SSE stream yielding MOCK_COMPLETION_TEXT
 *
 * The server binds to 127.0.0.1 on a random port (`:0`). Localhost is explicitly
 * allowed by `requireExternalUrl` in validate.ts (only RFC 1918 LAN addresses are
 * blocked), so custom providers can point at this server without validation errors.
 */

import http from 'http';

export const MOCK_COMPLETION_TEXT = 'Hello from mock server';
const MOCK_MODEL_ID = 'mock-model';

export interface MockOpenAIServer {
  port: number;
  baseUrl: string;
  stop: () => Promise<void>;
}

export async function startMockOpenAIServer(): Promise<MockOpenAIServer> {
  const server = http.createServer((req, res) => {
    const url = req.url ?? '';

    if (req.method === 'GET' && url === '/v1/models') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          object: 'list',
          data: [{ id: MOCK_MODEL_ID, object: 'model', created: 0, owned_by: 'mock' }],
        }),
      );
      return;
    }

    if (req.method === 'POST' && url === '/v1/chat/completions') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      const words = MOCK_COMPLETION_TEXT.split(' ');
      let i = 0;

      const sendNext = () => {
        if (i < words.length) {
          const content = words[i]! + (i < words.length - 1 ? ' ' : '');
          const chunk = {
            id: 'mock-chunk',
            object: 'chat.completion.chunk',
            choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: null }],
          };
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
          i++;
          setTimeout(sendNext, 20);
        } else {
          const doneChunk = {
            id: 'mock-chunk',
            object: 'chat.completion.chunk',
            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
          };
          res.write(`data: ${JSON.stringify(doneChunk)}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();
        }
      };

      sendNext();
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  const port = address.port;

  return {
    port,
    baseUrl: `http://127.0.0.1:${port}/v1`,
    stop: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}
