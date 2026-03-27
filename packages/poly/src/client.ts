import net from 'node:net';
import type { JsonRpcRequest, JsonRpcResponse, StreamChunkNotification } from '../../../src/shared/api.js';
import type { ConnectionConfig } from './connect.js';

let requestCounter = 1;
const MAX_LINE_BYTES = 1_100_000;

export class PolyClient {
  private socket: net.Socket | null = null;
  private buf = '';
  private pending = new Map<
    number | string,
    {
      resolve: (res: unknown) => void;
      reject: (err: Error) => void;
      onChunk?: (chunk: StreamChunkNotification) => void;
    }
  >();
  private _connected = false;

  async connect(config: ConnectionConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: config.host, port: config.port }, async () => {
        this.socket = socket;
        this._connected = true;
        socket.setEncoding('utf-8');

        socket.on('data', (chunk: string) => {
          this.buf += chunk;
          let idx: number;
          while ((idx = this.buf.indexOf('\n')) !== -1) {
            const line = this.buf.slice(0, idx);
            this.buf = this.buf.slice(idx + 1);
            if (!line.trim()) continue;
            if (line.length > MAX_LINE_BYTES) {
              socket.destroy(new Error('Server sent line exceeding size limit'));
              return;
            }
            this._handleLine(line);
          }
        });

        socket.on('error', (err) => {
          this._connected = false;
          for (const { reject: r } of this.pending.values()) r(err);
          this.pending.clear();
        });

        socket.on('close', () => {
          this._connected = false;
          for (const { reject: r } of this.pending.values()) {
            r(new Error('Connection closed'));
          }
          this.pending.clear();
        });

        // Authenticate
        try {
          const authResult = await this.call('api.authenticate', { token: config.token });
          if (!authResult.ok) {
            socket.destroy();
            reject(new Error('Authentication failed'));
            return;
          }
          resolve();
        } catch (err) {
          socket.destroy();
          reject(err);
        }
      });

      socket.on('error', (err) => {
        reject(err);
      });
    });
  }

  async call(method: string, params?: unknown): Promise<any> {
    return this._send(method, params);
  }

  async callStreaming(
    method: string,
    params: Record<string, unknown>,
    onChunk: (chunk: StreamChunkNotification) => void,
  ): Promise<any> {
    return this._send(method, { ...params, stream: true }, onChunk);
  }

  private _send(
    method: string,
    params?: unknown,
    onChunk?: (chunk: StreamChunkNotification) => void,
  ): Promise<any> {
    if (!this.socket || !this._connected) {
      return Promise.reject(new Error('Not connected'));
    }
    const id = requestCounter++;
    const request: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onChunk });
      this.socket!.write(JSON.stringify(request) + '\n');
    });
  }

  private _handleLine(line: string): void {
    let msg: any;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }

    // Streaming notification
    if (msg.method === 'stream.chunk' && !msg.id) {
      const chunk = msg as StreamChunkNotification;
      const reqId = chunk.params?.requestId;
      const pending = this.pending.get(reqId);
      if (pending?.onChunk) {
        pending.onChunk(chunk);
      }
      return;
    }

    // Standard response
    const response = msg as JsonRpcResponse;
    const pending = this.pending.get(response.id);
    if (!pending) return;
    this.pending.delete(response.id);

    if (response.error) {
      const err = new Error(response.error.message);
      (err as any).code = response.error.code;
      pending.reject(err);
    } else {
      pending.resolve(response.result);
    }
  }

  close(): void {
    this.socket?.destroy();
    this._connected = false;
  }
}
