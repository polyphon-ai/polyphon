import type Database from 'better-sqlite3';
import type { Message } from '../../../shared/types';
import type { HandlerFn, StreamCallback } from '../dispatcher';
import { RpcError } from '../dispatcher';
import { RPC_ERROR } from '../../../shared/api';
import type { VoiceManager } from '../../managers/VoiceManager';
import type { SessionManager } from '../../managers/SessionManager';
import { getSession } from '../../db/queries/sessions';
import { insertMessage } from '../../db/queries/messages';
import { requireId, requireString } from '../../ipc/validate';
import { ensureSessionInitialized } from '../../mcp/headless';
import { generateId } from '../../utils';
import { logger } from '../../utils/logger';

const MAX_CONTENT = 50000;

export function buildVoiceHandlers(
  db: Database.Database,
  voiceManager: VoiceManager,
  sessionManager: SessionManager,
): Record<string, HandlerFn> {
  return {
    'voice.broadcast': async (params, streamCb: StreamCallback) => {
      const sessionId = requireId(params?.sessionId, 'sessionId');
      const content = requireString(params?.content, 'content', MAX_CONTENT);
      const stream = params?.stream === true;
      const requestId = params?._requestId ?? 0;

      const session = getSession(db, sessionId);
      if (!session) throw new RpcError(RPC_ERROR.NOT_FOUND, `Session not found: ${sessionId}`);

      await ensureSessionInitialized(db, voiceManager, session);

      const conductorMessage: Message = {
        id: generateId(),
        sessionId,
        role: 'conductor',
        voiceId: null,
        voiceName: null,
        content,
        timestamp: Date.now(),
        roundIndex: 0,
      };
      insertMessage(db, conductorMessage);

      logger.debug('[api] voice.broadcast starting', { sessionId, stream });

      let messages: Message[];
      if (stream) {
        messages = await sessionManager.runStreamingBroadcastRound(
          db,
          session,
          conductorMessage,
          (voiceId, voiceName, token) => {
            streamCb({
              jsonrpc: '2.0',
              method: 'stream.chunk',
              params: { requestId, voiceId, voiceName, delta: token },
            });
          },
        );
      } else {
        messages = await sessionManager.runHeadlessBroadcastRound(db, session, conductorMessage);
      }

      logger.debug('[api] voice.broadcast complete', { sessionId });
      return { messages: [conductorMessage, ...messages] };
    },

    'voice.ask': async (params, streamCb: StreamCallback) => {
      const sessionId = requireId(params?.sessionId, 'sessionId');
      const voiceId = requireId(params?.voiceId, 'voiceId');
      const content = requireString(params?.content, 'content', MAX_CONTENT);
      const stream = params?.stream === true;
      const requestId = params?._requestId ?? 0;

      const session = getSession(db, sessionId);
      if (!session) throw new RpcError(RPC_ERROR.NOT_FOUND, `Session not found: ${sessionId}`);

      await ensureSessionInitialized(db, voiceManager, session);

      const voice = voiceManager.getVoice(sessionId, voiceId);
      if (!voice) throw new RpcError(RPC_ERROR.NOT_FOUND, `Voice not found: ${voiceId}`);

      const conductorMessage: Message = {
        id: generateId(),
        sessionId,
        role: 'conductor',
        voiceId: null,
        voiceName: null,
        content,
        timestamp: Date.now(),
        roundIndex: 0,
      };
      insertMessage(db, conductorMessage);

      logger.debug('[api] voice.ask starting', { sessionId, voiceId, stream });

      let message: Message | null;
      if (stream) {
        message = await sessionManager.runStreamingDirectedRound(
          db,
          session,
          conductorMessage,
          voiceId,
          (vId, voiceName, token) => {
            streamCb({
              jsonrpc: '2.0',
              method: 'stream.chunk',
              params: { requestId, voiceId: vId, voiceName, delta: token },
            });
          },
        );
      } else {
        message = await sessionManager.runHeadlessDirectedRound(db, session, conductorMessage, voiceId);
      }

      logger.debug('[api] voice.ask complete', { sessionId, voiceId });
      return { message };
    },

    'voice.abort': async (params) => {
      const sessionId = requireId(params?.sessionId, 'sessionId');
      voiceManager.disposeSession(sessionId);
      logger.debug('[api] voice.abort', { sessionId });
      return { aborted: true };
    },
  };
}
