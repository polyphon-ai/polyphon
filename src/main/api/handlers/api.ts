import type { HandlerFn } from '../dispatcher';
import { RpcError } from '../dispatcher';
import { RPC_ERROR } from '../../../shared/api';
import type { ApiStatus } from '../../../shared/types';

export function buildApiHandlers(
  getStatus: () => ApiStatus,
): Record<string, HandlerFn> {
  return {
    // api.authenticate is handled directly in server.ts before dispatch
    // This handler exists for documentation/completeness but is never called through the normal dispatch path
    'api.authenticate': async (_params) => {
      // If this is called through dispatch, authentication already succeeded.
      return { ok: true };
    },

    'api.getStatus': async () => {
      return getStatus();
    },
  };
}

