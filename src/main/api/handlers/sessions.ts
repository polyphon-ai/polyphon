import type Database from 'better-sqlite3';
import type { HandlerFn } from '../dispatcher';
import { RpcError } from '../dispatcher';
import { RPC_ERROR } from '../../../shared/api';
import {
  listSessions,
  getSession,
  insertSession,
  deleteSession,
  renameSession,
  archiveSession,
} from '../../db/queries/sessions';
import { listMessages } from '../../db/queries/messages';
import { requireId } from '../../ipc/validate';
import { generateId } from '../../utils';
import type { VoiceManager } from '../../managers/VoiceManager';
import { getComposition } from '../../db/queries/compositions';
import { getUserProfile } from '../../db/queries/userProfile';

export function buildSessionHandlers(
  db: Database.Database,
  voiceManager: VoiceManager,
): Record<string, HandlerFn> {
  return {
    'sessions.list': async (params) => {
      const archived = params?.archived === true;
      return listSessions(db, archived);
    },

    'sessions.get': async (params) => {
      const id = requireId(params?.id, 'id');
      const session = getSession(db, id);
      if (!session) throw new RpcError(RPC_ERROR.NOT_FOUND, `Session not found: ${id}`);
      return session;
    },

    'sessions.create': async (params) => {
      if (!params?.compositionId) throw new RpcError(RPC_ERROR.INVALID_PARAMS, 'compositionId is required');
      if (!params?.source || typeof params.source !== 'string' || !params.source.trim()) {
        throw new RpcError(RPC_ERROR.INVALID_PARAMS, 'source is required');
      }
      const compositionId = requireId(params.compositionId, 'compositionId');
      const source = params.source.trim().slice(0, 64);
      const composition = getComposition(db, compositionId);
      if (!composition) throw new RpcError(RPC_ERROR.NOT_FOUND, `Composition not found: ${compositionId}`);

      const now = Date.now();
      const name = typeof params.name === 'string' && params.name.trim()
        ? params.name.trim().slice(0, 120)
        : `Session ${new Date(now).toLocaleDateString()}`;
      const workingDir = typeof params.workingDir === 'string' ? params.workingDir : null;
      const sandboxedToWorkingDir = params.sandboxedToWorkingDir === true;

      const session = {
        id: generateId(),
        compositionId,
        name,
        mode: composition.mode,
        continuationPolicy: composition.continuationPolicy,
        continuationMaxRounds: composition.continuationMaxRounds,
        createdAt: now,
        updatedAt: now,
        archived: false,
        workingDir,
        sandboxedToWorkingDir,
        source,
      };
      insertSession(db, session);

      const voices = composition.voices.map((cv) => voiceManager.createVoice(cv));
      const profile = getUserProfile(db);
      voiceManager.initSession(session.id, voices, session.mode, profile, workingDir, sandboxedToWorkingDir);

      return session;
    },

    'sessions.delete': async (params) => {
      const id = requireId(params?.id, 'id');
      deleteSession(db, id);
      return { ok: true };
    },

    'sessions.rename': async (params) => {
      const id = requireId(params?.id, 'id');
      if (typeof params?.name !== 'string' || !params.name.trim()) {
        throw new RpcError(RPC_ERROR.INVALID_PARAMS, 'name is required');
      }
      const session = renameSession(db, id, params.name.trim().slice(0, 120));
      if (!session) throw new RpcError(RPC_ERROR.NOT_FOUND, `Session not found: ${id}`);
      return session;
    },

    'sessions.archive': async (params) => {
      const id = requireId(params?.id, 'id');
      const archived = params?.archived === true;
      archiveSession(db, id, archived);
      return { ok: true };
    },

    'sessions.messages': async (params) => {
      const sessionId = requireId(params?.sessionId, 'sessionId');
      if (!getSession(db, sessionId)) throw new RpcError(RPC_ERROR.NOT_FOUND, `Session not found: ${sessionId}`);
      return listMessages(db, sessionId);
    },

    'sessions.export': async (params) => {
      const sessionId = requireId(params?.sessionId, 'sessionId');
      const format = params?.format;
      if (format !== 'markdown' && format !== 'json' && format !== 'plaintext') {
        throw new RpcError(RPC_ERROR.INVALID_PARAMS, 'format must be markdown, json, or plaintext');
      }
      const session = getSession(db, sessionId);
      if (!session) throw new RpcError(RPC_ERROR.NOT_FOUND, `Session not found: ${sessionId}`);
      const messages = listMessages(db, sessionId);
      const exportedAt = new Date().toISOString();

      let content: string;
      if (format === 'json') {
        content = JSON.stringify({ session, exportedAt, messages }, null, 2);
      } else if (format === 'markdown') {
        const modeLabel = session.mode === 'conductor' ? 'Directed' : 'Broadcast';
        const lines: string[] = [
          `# ${session.name}`, '',
          `- **Mode:** ${modeLabel}`,
          `- **Exported:** ${exportedAt}`, '', '---', '',
        ];
        for (const msg of messages) {
          if (msg.role === 'system') { lines.push(`> _${msg.content}_`, ''); continue; }
          const speaker = msg.role === 'conductor' ? 'You' : (msg.voiceName ?? msg.voiceId ?? 'Voice');
          lines.push(`**${speaker}** · ${new Date(msg.timestamp).toISOString()}`, '', msg.content, '', '---', '');
        }
        content = lines.join('\n');
      } else {
        const divider = '='.repeat(72);
        const lines: string[] = [
          `Session: ${session.name}`, `Mode: ${session.mode === 'conductor' ? 'Directed' : 'Broadcast'}`,
          `Exported: ${exportedAt}`, divider, '',
        ];
        for (const msg of messages) {
          if (msg.role === 'system') { lines.push(`[system] ${msg.content}`, ''); continue; }
          const speaker = msg.role === 'conductor' ? 'You' : (msg.voiceName ?? msg.voiceId ?? 'Voice');
          lines.push(`[${new Date(msg.timestamp).toISOString()}] ${speaker}:`, msg.content, '');
        }
        content = lines.join('\n');
      }
      return { content, format };
    },
  };
}
