import { RPC_ERROR } from '../../shared/api';
import type { JsonRpcRequest, JsonRpcResponse, StreamChunkNotification } from '../../shared/api';

export type { JsonRpcRequest, JsonRpcResponse, StreamChunkNotification };

export type StreamCallback = (chunk: StreamChunkNotification) => void;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type HandlerFn = (params: any, streamCb: StreamCallback) => Promise<unknown>;

export interface DispatchTable {
  [method: string]: HandlerFn;
}

export function makeErrorResponse(id: number | string, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function makeSuccessResponse(id: number | string, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

export async function dispatch(
  table: DispatchTable,
  request: JsonRpcRequest,
  streamCb: StreamCallback,
): Promise<JsonRpcResponse> {
  const handler = table[request.method];
  if (!handler) {
    return makeErrorResponse(request.id, RPC_ERROR.METHOD_NOT_FOUND, `Method not found: ${request.method}`);
  }
  try {
    const result = await handler(request.params ?? {}, streamCb);
    return makeSuccessResponse(request.id, result);
  } catch (err: unknown) {
    if (err instanceof RpcError) {
      return makeErrorResponse(request.id, err.code, err.message);
    }
    const message = err instanceof Error ? err.message : String(err);
    return makeErrorResponse(request.id, RPC_ERROR.INTERNAL_ERROR, message);
  }
}

export class RpcError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}
