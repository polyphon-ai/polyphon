import * as net from 'node:net';
import {
  DEFAULT_COMPOSITION,
  DEFAULT_SESSION,
  DEFAULT_MESSAGES,
  DEFAULT_PROFILE,
} from './fixtures';
import type { Composition, Session, Message } from '../../shared/types';
import type {
  JsonRpcRequest,
  McpGetStatusResult,
} from '../../shared/api';
import { RPC_ERROR } from '../../shared/api';

export interface MockPolyphonServerOptions {
  token?: string;
  streamingDelayMs?: number;
  responseTemplate?: (voiceName: string, content: string) => string;
}

type SimulatedError = { code: number; message: string };

export class MockPolyphonServer {
  private readonly token: string;
  private readonly streamingDelayMs: number;
  private readonly responseTemplate: (voiceName: string, content: string) => string;

  private server: net.Server | null = null;
  private sockets: Set<net.Socket> = new Set();
  private _port: number | null = null;

  private callLog: Map<string, unknown[]> = new Map();
  private simulatedErrors: Map<string, SimulatedError> = new Map();

  // mutable state
  private mcpEnabled = false;

  constructor(options: MockPolyphonServerOptions = {}) {
    this.token = options.token ?? 'test-token';
    this.streamingDelayMs = options.streamingDelayMs ?? 20;
    this.responseTemplate = options.responseTemplate ??
      ((voiceName, content) => `${voiceName}: ${content.slice(0, 50)}`);
  }

  get port(): number {
    if (this._port === null) throw new Error('MockPolyphonServer is not started');
    return this._port;
  }

  async start(): Promise<void> {
    this.clearCalls();
    this.server = net.createServer((socket) => {
      this.sockets.add(socket);
      socket.on('close', () => this.sockets.delete(socket));
      this.handleConnection(socket);
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.listen(0, '127.0.0.1', () => {
        const addr = this.server!.address();
        this._port = (addr as net.AddressInfo).port;
        resolve();
      });
      this.server!.once('error', reject);
    });
  }

  async stop(): Promise<void> {
    for (const socket of this.sockets) {
      socket.destroy();
    }
    this.sockets.clear();
    await new Promise<void>((resolve, reject) => {
      if (!this.server) return resolve();
      this.server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    this.server = null;
    this._port = null;
  }

  calls(method: string): unknown[] {
    return this.callLog.get(method) ?? [];
  }

  clearCalls(): void {
    this.callLog.clear();
    this.simulatedErrors.clear();
  }

  simulateError(method: string, code: number, message: string): void {
    this.simulatedErrors.set(method, { code, message });
  }

  private logCall(method: string, params: unknown): void {
    const existing = this.callLog.get(method) ?? [];
    existing.push(params);
    this.callLog.set(method, existing);
  }

  private handleConnection(socket: net.Socket): void {
    let buffer = '';
    let authenticated = false;

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let req: JsonRpcRequest;
        try {
          req = JSON.parse(trimmed) as JsonRpcRequest;
        } catch {
          this.sendError(socket, null, RPC_ERROR.PARSE_ERROR, 'Parse error');
          continue;
        }

        if (req.method !== 'api.authenticate' && !authenticated) {
          this.sendError(socket, req.id, RPC_ERROR.UNAUTHORIZED, 'Unauthorized');
          continue;
        }

        this.dispatch(socket, req, (isAuthenticated: boolean) => {
          authenticated = isAuthenticated;
        }).catch(() => {
          // errors already sent to socket
        });
      }
    });

    socket.on('error', () => {
      // swallow socket errors in tests
    });
  }

  private sendError(socket: net.Socket, id: number | string | null, code: number, message: string): void {
    const frame = JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n';
    if (!socket.destroyed) socket.write(frame);
  }

  private sendResult(socket: net.Socket, id: number | string, result: unknown): void {
    const frame = JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n';
    if (!socket.destroyed) socket.write(frame);
  }

  private sendNotification(socket: net.Socket, method: string, params: unknown): void {
    const frame = JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n';
    if (!socket.destroyed) socket.write(frame);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async dispatch(
    socket: net.Socket,
    req: JsonRpcRequest,
    setAuthenticated: (v: boolean) => void,
  ): Promise<void> {
    const { id, method, params } = req;
    this.logCall(method, params);

    // Check simulated error (single-use)
    const simError = this.simulatedErrors.get(method);
    if (simError) {
      this.simulatedErrors.delete(method);
      this.sendError(socket, id, simError.code, simError.message);
      return;
    }

    switch (method) {
      case 'api.authenticate': {
        const p = params as { token: string };
        if (p?.token !== this.token) {
          this.sendError(socket, id, RPC_ERROR.UNAUTHORIZED, 'Unauthorized');
          return;
        }
        setAuthenticated(true);
        this.sendResult(socket, id, { ok: true });
        return;
      }

      case 'api.getStatus': {
        this.sendResult(socket, id, {
          enabled: true,
          remoteAccessEnabled: false,
          running: true,
          port: this._port ?? 7432,
          host: '127.0.0.1',
          tokenFingerprint: 'abcd1234',
          version: '0.12.0',
          activeConnections: 1,
        });
        return;
      }

      case 'api.getSpec': {
        this.sendResult(socket, id, {
          openrpc: '1.2.4',
          info: { title: 'Polyphon API', version: '0.12.0', description: 'Polyphon JSON-RPC API' },
          servers: [],
          methods: [],
          components: { schemas: {} },
        });
        return;
      }

      case 'compositions.list': {
        this.sendResult(socket, id, [DEFAULT_COMPOSITION]);
        return;
      }

      case 'compositions.get': {
        const p = params as { id: string };
        if (p?.id !== DEFAULT_COMPOSITION.id) {
          this.sendError(socket, id, RPC_ERROR.NOT_FOUND, 'Composition not found');
          return;
        }
        this.sendResult(socket, id, DEFAULT_COMPOSITION);
        return;
      }

      case 'compositions.create': {
        const p = params as Partial<Composition>;
        const created: Composition = {
          id: `comp-${Date.now()}`,
          name: p.name ?? 'New Composition',
          mode: p.mode ?? 'broadcast',
          continuationPolicy: p.continuationPolicy ?? 'none',
          continuationMaxRounds: p.continuationMaxRounds ?? 1,
          voices: (p.voices as Composition['voices']) ?? [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          archived: false,
        };
        this.sendResult(socket, id, created);
        return;
      }

      case 'compositions.update': {
        this.sendResult(socket, id, { ...DEFAULT_COMPOSITION, updatedAt: Date.now() });
        return;
      }

      case 'compositions.delete': {
        this.sendResult(socket, id, null);
        return;
      }

      case 'compositions.archive': {
        const p = params as { id: string; archived: boolean };
        this.sendResult(socket, id, { ...DEFAULT_COMPOSITION, archived: p.archived });
        return;
      }

      case 'sessions.list': {
        this.sendResult(socket, id, [DEFAULT_SESSION]);
        return;
      }

      case 'sessions.get': {
        const p = params as { id: string };
        if (p?.id !== DEFAULT_SESSION.id) {
          this.sendError(socket, id, RPC_ERROR.NOT_FOUND, 'Session not found');
          return;
        }
        this.sendResult(socket, id, DEFAULT_SESSION);
        return;
      }

      case 'sessions.create': {
        const p = params as Partial<Session>;
        const created: Session = {
          id: `session-${Date.now()}`,
          compositionId: p.compositionId ?? DEFAULT_COMPOSITION.id,
          name: p.name ?? 'New Session',
          mode: 'broadcast',
          continuationPolicy: 'none',
          continuationMaxRounds: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          archived: false,
          workingDir: null,
          sandboxedToWorkingDir: false,
          source: p.source ?? 'test',
        };
        this.sendResult(socket, id, created);
        return;
      }

      case 'sessions.delete': {
        this.sendResult(socket, id, null);
        return;
      }

      case 'sessions.rename': {
        const p = params as { id: string; name: string };
        this.sendResult(socket, id, { ...DEFAULT_SESSION, name: p.name });
        return;
      }

      case 'sessions.archive': {
        const p = params as { id: string; archived: boolean };
        this.sendResult(socket, id, { ...DEFAULT_SESSION, archived: p.archived });
        return;
      }

      case 'sessions.messages': {
        this.sendResult(socket, id, DEFAULT_MESSAGES);
        return;
      }

      case 'sessions.export': {
        const p = params as { sessionId: string; format: string };
        this.sendResult(socket, id, {
          content: DEFAULT_MESSAGES.map((m) => `${m.voiceName ?? 'Conductor'}: ${m.content}`).join('\n'),
          format: p.format,
        });
        return;
      }

      case 'voice.broadcast': {
        const p = params as { sessionId: string; content: string; stream?: boolean };
        const messages: Message[] = [
          {
            id: `msg-cond-${Date.now()}`,
            sessionId: p.sessionId,
            role: 'conductor',
            voiceId: null,
            voiceName: null,
            content: p.content,
            timestamp: Date.now(),
            roundIndex: 0,
          },
        ];

        for (const voice of DEFAULT_COMPOSITION.voices) {
          const responseText = this.responseTemplate(voice.displayName, p.content);
          if (p.stream) {
            // Stream word-by-word, then send final result
            const words = responseText.split(' ');
            for (const word of words) {
              await this.delay(this.streamingDelayMs);
              this.sendNotification(socket, 'stream.chunk', {
                requestId: id,
                voiceId: voice.id,
                voiceName: voice.displayName,
                delta: word + ' ',
              });
            }
          }
          messages.push({
            id: `msg-voice-${voice.id}-${Date.now()}`,
            sessionId: p.sessionId,
            role: 'voice',
            voiceId: voice.id,
            voiceName: voice.displayName,
            content: responseText,
            timestamp: Date.now(),
            roundIndex: 0,
          });
        }

        this.sendResult(socket, id, { messages });
        return;
      }

      case 'voice.ask': {
        const p = params as { sessionId: string; voiceId: string; content: string; stream?: boolean };
        const voice = DEFAULT_COMPOSITION.voices.find((v) => v.id === p.voiceId)
          ?? DEFAULT_COMPOSITION.voices[0]!;
        const responseText = this.responseTemplate(voice.displayName, p.content);

        if (p.stream) {
          const words = responseText.split(' ');
          for (const word of words) {
            await this.delay(this.streamingDelayMs);
            this.sendNotification(socket, 'stream.chunk', {
              requestId: id,
              voiceId: voice.id,
              voiceName: voice.displayName,
              delta: word + ' ',
            });
          }
        }

        const message: Message = {
          id: `msg-${Date.now()}`,
          sessionId: p.sessionId,
          role: 'voice',
          voiceId: voice.id,
          voiceName: voice.displayName,
          content: responseText,
          timestamp: Date.now(),
          roundIndex: 0,
        };
        this.sendResult(socket, id, { message });
        return;
      }

      case 'voice.abort': {
        this.sendResult(socket, id, { aborted: true });
        return;
      }

      case 'search.messages': {
        const p = params as { query: string };
        const results = DEFAULT_MESSAGES
          .filter((m) => m.content.toLowerCase().includes(p.query.toLowerCase()))
          .map((m) => ({
            messageId: m.id,
            sessionId: m.sessionId,
            sessionName: DEFAULT_SESSION.name,
            role: m.role,
            voiceName: m.voiceName,
            snippet: m.content.slice(0, 100),
            timestamp: m.timestamp,
            archived: false,
          }));
        this.sendResult(socket, id, results);
        return;
      }

      case 'mcp.getStatus': {
        const status: McpGetStatusResult = {
          enabled: this.mcpEnabled,
          running: this.mcpEnabled,
          headless: false,
          transport: 'stdio',
        };
        this.sendResult(socket, id, status);
        return;
      }

      case 'mcp.setEnabled': {
        const p = params as { enabled: boolean };
        this.mcpEnabled = p.enabled;
        const status: McpGetStatusResult = {
          enabled: this.mcpEnabled,
          running: this.mcpEnabled,
          headless: false,
          transport: 'stdio',
        };
        this.sendResult(socket, id, status);
        return;
      }

      case 'settings.getProviderStatus': {
        this.sendResult(socket, id, []);
        return;
      }

      case 'settings.getDebugInfo': {
        this.sendResult(socket, id, {
          appVersion: '0.12.0',
          schemaVersion: 1,
          platform: 'darwin',
          arch: 'arm64',
        });
        return;
      }

      case 'settings.getUserProfile': {
        this.sendResult(socket, id, DEFAULT_PROFILE);
        return;
      }

      default: {
        this.sendError(socket, id, RPC_ERROR.METHOD_NOT_FOUND, `Method not found: ${method}`);
        return;
      }
    }
  }
}
