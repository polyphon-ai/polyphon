import net from 'node:net';
import type { ApiStatus } from '../../shared/types';
import type { DispatchTable, StreamChunkNotification } from './dispatcher';
import { dispatch, makeErrorResponse } from './dispatcher';
import { RPC_ERROR } from '../../shared/api';
import { tokenFingerprint, loadOrCreateApiToken, rotateApiToken } from './auth';
import { logger } from '../utils/logger';

const MAX_LINE_BYTES = 1_000_000; // 1 MB

interface ApiServerOptions {
  port: number;
  host: string;
  tokenPath: string;
  appVersion: string;
  onStatusChanged?: (status: ApiStatus) => void;
}

export class ApiServerController {
  private server: net.Server | null = null;
  private _running = false;
  private _token: string;
  private _startupError: string | undefined;
  private _enabled: boolean;
  private _remoteAccessEnabled: boolean;
  private _port: number;
  private _host: string;
  private _tokenPath: string;
  private _appVersion: string;
  private _dispatchTable: DispatchTable = {};
  private _onStatusChanged?: (status: ApiStatus) => void;
  private _activeConnections: Set<net.Socket> = new Set();

  constructor(options: ApiServerOptions) {
    this._enabled = false;
    this._remoteAccessEnabled = false;
    this._port = options.port;
    this._host = options.host;
    this._tokenPath = options.tokenPath;
    this._appVersion = options.appVersion;
    this._onStatusChanged = options.onStatusChanged;
    this._token = loadOrCreateApiToken(options.tokenPath);
  }

  setDispatchTable(table: DispatchTable): void {
    this._dispatchTable = table;
  }

  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
  }

  setRemoteAccessEnabled(remoteAccess: boolean): void {
    this._remoteAccessEnabled = remoteAccess;
  }

  getToken(): string {
    return this._token;
  }

  getStatus(): ApiStatus {
    return {
      enabled: this._enabled,
      remoteAccessEnabled: this._remoteAccessEnabled,
      running: this._running,
      port: this._port,
      host: this._host,
      tokenFingerprint: tokenFingerprint(this._token),
      version: this._appVersion,
      startupError: this._startupError,
    };
  }

  async start(): Promise<void> {
    if (this._running) return;
    this._startupError = undefined;

    return new Promise((resolve) => {
      const server = net.createServer((socket) => this._handleConnection(socket));
      server.on('error', (err: NodeJS.ErrnoException) => {
        this._running = false;
        this.server = null;
        if (err.code === 'EADDRINUSE') {
          this._startupError = `Port ${this._port} is already in use`;
          logger.error('[api] EADDRINUSE', { port: this._port });
        } else {
          this._startupError = err.message;
          logger.error('[api] server error', err);
        }
        this._onStatusChanged?.(this.getStatus());
        resolve();
      });

      server.listen(this._port, this._host, () => {
        this._running = true;
        this.server = server;
        logger.info('[api] TCP server started', { host: this._host, port: this._port });
        this._onStatusChanged?.(this.getStatus());
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (!this._running) return;
    this._disconnectAll();
    return new Promise((resolve) => {
      this.server?.close(() => {
        this._running = false;
        this.server = null;
        logger.info('[api] TCP server stopped');
        this._onStatusChanged?.(this.getStatus());
        resolve();
      });
    });
  }

  // Restart with potentially new host/port binding
  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  async rotateToken(): Promise<void> {
    this._token = rotateApiToken(this._tokenPath);
    logger.info('[api] token rotated', { fingerprint: tokenFingerprint(this._token) });
    this._disconnectAll();
    this._onStatusChanged?.(this.getStatus());
  }

  updateHostPort(host: string, port: number): void {
    this._host = host;
    this._port = port;
  }

  private _disconnectAll(): void {
    for (const socket of this._activeConnections) {
      try { socket.destroy(); } catch { /* ignore */ }
    }
    this._activeConnections.clear();
  }

  private _handleConnection(socket: net.Socket): void {
    this._activeConnections.add(socket);
    socket.on('close', () => this._activeConnections.delete(socket));

    let authenticated = false;
    let buf = '';

    socket.setEncoding('utf-8');

    socket.on('data', (chunk: string) => {
      buf += chunk;
      let newlineIndex: number;
      // Process all complete lines in the buffer
      while ((newlineIndex = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, newlineIndex);
        buf = buf.slice(newlineIndex + 1);

        if (line.length > MAX_LINE_BYTES) {
          const err = makeErrorResponse(0, RPC_ERROR.PARSE_ERROR, 'Line exceeds 1 MB limit');
          socket.write(JSON.stringify(err) + '\n');
          socket.destroy();
          return;
        }

        if (!line.trim()) continue;

        let request: any;
        try {
          request = JSON.parse(line);
        } catch {
          const err = makeErrorResponse(0, RPC_ERROR.PARSE_ERROR, 'Invalid JSON');
          socket.write(JSON.stringify(err) + '\n');
          socket.destroy();
          return;
        }

        if (!request || typeof request !== 'object' || request.jsonrpc !== '2.0') {
          const err = makeErrorResponse(request?.id ?? 0, RPC_ERROR.INVALID_REQUEST, 'Invalid JSON-RPC request');
          socket.write(JSON.stringify(err) + '\n');
          socket.destroy();
          return;
        }

        const requestId = request.id ?? 0;

        // Authentication gate
        if (!authenticated) {
          if (request.method !== 'api.authenticate') {
            const err = makeErrorResponse(requestId, RPC_ERROR.UNAUTHORIZED, 'Authentication required');
            socket.write(JSON.stringify(err) + '\n');
            socket.destroy();
            return;
          }
          const token = request.params?.token;
          // Constant-time comparison to prevent timing attacks
          if (!token || !constantTimeEqual(token, this._token)) {
            // Do not log the attempted token
            logger.warn('[api] authentication failed', { remoteAddress: socket.remoteAddress });
            const err = makeErrorResponse(requestId, RPC_ERROR.UNAUTHORIZED, 'Invalid token');
            socket.write(JSON.stringify(err) + '\n');
            socket.destroy();
            return;
          }
          authenticated = true;
          const response = { jsonrpc: '2.0' as const, id: requestId, result: { ok: true } };
          socket.write(JSON.stringify(response) + '\n');
          continue;
        }

        // Authenticated dispatch
        const streamCb = (chunk: StreamChunkNotification) => {
          if (!socket.destroyed) {
            socket.write(JSON.stringify(chunk) + '\n');
          }
        };

        // Inject requestId into params for streaming correlation
        const params = request.params ?? {};
        if (typeof params === 'object') {
          (params as any)._requestId = requestId;
        }

        dispatch(this._dispatchTable, { ...request, params }, streamCb).then((response) => {
          if (!socket.destroyed) {
            socket.write(JSON.stringify(response) + '\n');
          }
        }).catch((err) => {
          logger.error('[api] dispatch error', err);
          if (!socket.destroyed) {
            const errResp = makeErrorResponse(requestId, RPC_ERROR.INTERNAL_ERROR, 'Internal error');
            socket.write(JSON.stringify(errResp) + '\n');
          }
        });
      }

      // Check buffer hasn't grown too large (unbounded partial line)
      if (buf.length > MAX_LINE_BYTES) {
        const err = makeErrorResponse(0, RPC_ERROR.PARSE_ERROR, 'Line exceeds 1 MB limit');
        socket.write(JSON.stringify(err) + '\n');
        socket.destroy();
      }
    });

    socket.on('error', (err) => {
      logger.debug('[api] socket error', { error: err.message });
    });
  }
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.equals(bufB);
}
