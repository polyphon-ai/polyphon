import * as net from 'node:net';
import * as events from 'node:events';
import { RpcError } from './errors';
import { RPC_ERROR } from '../shared/api';
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  StreamChunkNotification,
  AuthenticateResult,
  CompositionsListParams,
  CompositionsGetParams,
  CompositionsCreateParams,
  CompositionsUpdateParams,
  CompositionsDeleteParams,
  CompositionsArchiveParams,
  SessionsListParams,
  SessionsGetParams,
  SessionsCreateParams,
  SessionsDeleteParams,
  SessionsRenameParams,
  SessionsArchiveParams,
  SessionsMessagesParams,
  SessionsExportParams,
  SessionsExportResult,
  VoiceBroadcastParams,
  VoiceBroadcastResult,
  VoiceAskParams,
  VoiceAskResult,
  VoiceAbortParams,
  VoiceAbortResult,
  SearchMessagesParams,
  SearchMessagesResult,
  McpSetEnabledParams,
  McpSetEnabledResult,
  McpGetStatusResult,
  ApiGetStatusResult,
  ApiGetSpecResult,
  SettingsGetProviderStatusResult,
  SettingsGetDebugInfoResult,
  SettingsGetUserProfileResult,
} from '../shared/api';
import type {
  Composition,
  Session,
  Message,
} from '../shared/types';

export type ClientState = 'idle' | 'connecting' | 'connected' | 'disconnected';

export interface PolyphonClientOptions {
  host?: string;
  port?: number;
  token: string;
}

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  onChunk?: (params: StreamChunkNotification['params']) => void;
};

/**
 * TCP client for the Polyphon JSON-RPC 2.0 API.
 *
 * **Security note:** Token is transmitted in plaintext over TCP. This client
 * is designed for localhost connections only. Do not use with a remote host without
 * additional transport security.
 */
export class PolyphonClient extends events.EventEmitter {
  private readonly host: string;
  private readonly port: number;
  private readonly token: string;

  private socket: net.Socket | null = null;
  private state: ClientState = 'idle';
  private buffer = '';
  private nextId = 1;
  private pending = new Map<number | string, PendingRequest>();

  constructor(options: PolyphonClientOptions) {
    super();
    this.host = options.host ?? '127.0.0.1';
    this.port = options.port ?? 7432;
    this.token = options.token;
  }

  getState(): ClientState {
    return this.state;
  }

  async connect(): Promise<void> {
    this.state = 'connecting';
    await new Promise<void>((resolve, reject) => {
      const socket = new net.Socket();
      this.socket = socket;

      socket.once('connect', () => {
        socket.on('data', (chunk: Buffer) => this.onData(chunk));
        socket.on('close', () => this.onClose());
        socket.on('error', (err) => this.onSocketError(err));
        resolve();
      });

      socket.once('error', (err) => {
        this.state = 'disconnected';
        reject(err);
      });

      socket.connect(this.port, this.host);
    });

    this.state = 'connected';

    // Authenticate immediately after connect
    try {
      await this.call<AuthenticateResult>('api.authenticate', { token: this.token });
    } catch (err) {
      this.socket?.destroy();
      this.state = 'disconnected';
      throw err;
    }
  }

  disconnect(): void {
    this.socket?.destroy();
  }

  private onData(chunk: Buffer): void {
    this.buffer += chunk.toString('utf8');
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        this.handleMessage(JSON.parse(trimmed) as JsonRpcResponse | StreamChunkNotification);
      } catch {
        // ignore malformed frames
      }
    }
  }

  private handleMessage(msg: JsonRpcResponse | StreamChunkNotification): void {
    // Stream chunk notification has no id
    if ('method' in msg && msg.method === 'stream.chunk') {
      const notification = msg as StreamChunkNotification;
      const req = this.pending.get(notification.params.requestId);
      if (req?.onChunk) {
        req.onChunk(notification.params);
      }
      return;
    }

    const response = msg as JsonRpcResponse;
    const req = this.pending.get(response.id);
    if (!req) return;

    this.pending.delete(response.id);
    if (response.error) {
      req.reject(new RpcError(response.error.code, response.error.message, response.error.data));
    } else {
      req.resolve(response.result);
    }
  }

  private onClose(): void {
    this.state = 'disconnected';
    const err = new RpcError(RPC_ERROR.INTERNAL_ERROR, 'Client is disconnected.');
    for (const req of this.pending.values()) {
      req.reject(err);
    }
    this.pending.clear();
    this.emit('disconnect');
  }

  private onSocketError(err: Error): void {
    // Socket errors are handled; close event will follow
    this.emit('error', err);
  }

  private call<T>(method: string, params?: unknown, onChunk?: (params: StreamChunkNotification['params']) => void): Promise<T> {
    const state = this.state;
    if (state === 'idle') {
      throw new RpcError(RPC_ERROR.INTERNAL_ERROR, 'Not connected. Call connect() first.');
    }
    if (state === 'disconnected') {
      throw new RpcError(RPC_ERROR.INTERNAL_ERROR, 'Client is disconnected.');
    }

    const id = this.nextId++;
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      ...(params !== undefined ? { params } : {}),
    };

    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
        onChunk,
      });
      this.socket!.write(JSON.stringify(request) + '\n');
    });
  }

  // ---- api ----

  getApiStatus(): Promise<ApiGetStatusResult> {
    return this.call('api.getStatus');
  }

  getApiSpec(): Promise<ApiGetSpecResult> {
    return this.call('api.getSpec');
  }

  // ---- compositions ----

  compositions(params?: CompositionsListParams): Promise<Composition[]> {
    return this.call('compositions.list', params);
  }

  getComposition(params: CompositionsGetParams): Promise<Composition> {
    return this.call('compositions.get', params);
  }

  createComposition(params: CompositionsCreateParams): Promise<Composition> {
    return this.call('compositions.create', params);
  }

  updateComposition(params: CompositionsUpdateParams): Promise<Composition> {
    return this.call('compositions.update', params);
  }

  deleteComposition(params: CompositionsDeleteParams): Promise<void> {
    return this.call('compositions.delete', params);
  }

  archiveComposition(params: CompositionsArchiveParams): Promise<Composition> {
    return this.call('compositions.archive', params);
  }

  // ---- sessions ----

  sessions(params?: SessionsListParams): Promise<Session[]> {
    return this.call('sessions.list', params);
  }

  getSession(params: SessionsGetParams): Promise<Session> {
    return this.call('sessions.get', params);
  }

  createSession(compositionId: string, source: string, extra?: Omit<SessionsCreateParams, 'compositionId' | 'source'>): Promise<Session> {
    return this.call('sessions.create', { compositionId, source, ...extra });
  }

  deleteSession(params: SessionsDeleteParams): Promise<void> {
    return this.call('sessions.delete', params);
  }

  renameSession(params: SessionsRenameParams): Promise<Session> {
    return this.call('sessions.rename', params);
  }

  archiveSession(params: SessionsArchiveParams): Promise<Session> {
    return this.call('sessions.archive', params);
  }

  getMessages(params: SessionsMessagesParams): Promise<Message[]> {
    return this.call('sessions.messages', params);
  }

  exportSession(params: SessionsExportParams): Promise<SessionsExportResult> {
    return this.call('sessions.export', params);
  }

  // ---- voice ----

  broadcast(
    params: VoiceBroadcastParams,
    onChunk?: (chunk: StreamChunkNotification['params']) => void,
  ): Promise<VoiceBroadcastResult> {
    const callParams: VoiceBroadcastParams = onChunk
      ? { ...params, stream: true }
      : params;
    return this.call('voice.broadcast', callParams, onChunk);
  }

  ask(
    params: VoiceAskParams,
    onChunk?: (chunk: StreamChunkNotification['params']) => void,
  ): Promise<VoiceAskResult> {
    const callParams: VoiceAskParams = onChunk
      ? { ...params, stream: true }
      : params;
    return this.call('voice.ask', callParams, onChunk);
  }

  abort(params: VoiceAbortParams): Promise<VoiceAbortResult> {
    return this.call('voice.abort', params);
  }

  // ---- search ----

  searchMessages(params: SearchMessagesParams): Promise<SearchMessagesResult> {
    return this.call('search.messages', params);
  }

  // ---- mcp ----

  getMcpStatus(): Promise<McpGetStatusResult> {
    return this.call('mcp.getStatus');
  }

  setMcpEnabled(params: McpSetEnabledParams): Promise<McpSetEnabledResult> {
    return this.call('mcp.setEnabled', params);
  }

  // ---- settings ----

  getProviderStatus(): Promise<SettingsGetProviderStatusResult> {
    return this.call('settings.getProviderStatus');
  }

  getDebugInfo(): Promise<SettingsGetDebugInfoResult> {
    return this.call('settings.getDebugInfo');
  }

  getUserProfile(): Promise<SettingsGetUserProfileResult> {
    return this.call('settings.getUserProfile');
  }
}
