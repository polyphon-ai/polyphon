import type Database from 'better-sqlite3';
import type { HandlerFn } from '../dispatcher';
import { RpcError } from '../dispatcher';
import { RPC_ERROR } from '../../../shared/api';
import {
  listCompositions,
  getComposition,
  insertComposition,
  updateComposition,
  deleteComposition,
  archiveComposition,
  upsertCompositionVoices,
} from '../../db/queries/compositions';
import { requireId } from '../../ipc/validate';
import { generateId } from '../../utils';

export function buildCompositionHandlers(db: Database.Database): Record<string, HandlerFn> {
  return {
    'compositions.list': async (params) => {
      const archived = params?.archived === true;
      return listCompositions(db, archived);
    },

    'compositions.get': async (params) => {
      const id = requireId(params?.id, 'id');
      const composition = getComposition(db, id);
      if (!composition) throw new RpcError(RPC_ERROR.NOT_FOUND, `Composition not found: ${id}`);
      return composition;
    },

    'compositions.create': async (params) => {
      if (!params || typeof params.name !== 'string') {
        throw new RpcError(RPC_ERROR.INVALID_PARAMS, 'name is required');
      }
      const now = Date.now();
      const id = generateId();
      const composition = {
        id,
        name: params.name.slice(0, 120),
        mode: (params.mode === 'broadcast' ? 'broadcast' : 'conductor') as 'conductor' | 'broadcast',
        continuationPolicy: (['none', 'prompt', 'auto'].includes(params.continuationPolicy) ? params.continuationPolicy : 'none') as 'none' | 'prompt' | 'auto',
        continuationMaxRounds: typeof params.continuationMaxRounds === 'number' ? Math.min(Math.max(1, Math.floor(params.continuationMaxRounds)), 10) : 1,
        voices: [],
        createdAt: now,
        updatedAt: now,
        archived: false,
      };
      insertComposition(db, composition);
      const voices = Array.isArray(params.voices) ? params.voices : [];
      const compositionVoices = voices.map((v: any, i: number) => ({
        id: generateId(),
        compositionId: id,
        provider: String(v.provider ?? ''),
        model: v.model ? String(v.model) : undefined,
        cliCommand: v.cliCommand ? String(v.cliCommand) : undefined,
        cliArgs: Array.isArray(v.cliArgs) ? v.cliArgs.map(String) : undefined,
        displayName: String(v.displayName ?? `Voice ${i + 1}`),
        systemPrompt: v.systemPrompt ? String(v.systemPrompt) : undefined,
        toneOverride: v.toneOverride ? String(v.toneOverride) : undefined,
        systemPromptTemplateId: v.systemPromptTemplateId ? String(v.systemPromptTemplateId) : undefined,
        order: typeof v.order === 'number' ? v.order : i,
        color: String(v.color ?? '#6366f1'),
        avatarIcon: String(v.avatarIcon ?? 'bot'),
        customProviderId: v.customProviderId ? String(v.customProviderId) : undefined,
        enabledTools: Array.isArray(v.enabledTools) ? v.enabledTools.map(String) : [],
      }));
      if (compositionVoices.length > 0) upsertCompositionVoices(db, compositionVoices);
      return getComposition(db, id);
    },

    'compositions.update': async (params) => {
      const id = requireId(params?.id, 'id');
      if (!getComposition(db, id)) throw new RpcError(RPC_ERROR.NOT_FOUND, `Composition not found: ${id}`);
      const data = params?.data ?? {};
      updateComposition(db, id, data);
      if (Array.isArray(data.voices)) {
        const compositionVoices = data.voices.map((v: any, i: number) => ({
          id: v.id ?? generateId(),
          compositionId: id,
          provider: String(v.provider ?? ''),
          model: v.model ? String(v.model) : undefined,
          cliCommand: v.cliCommand ? String(v.cliCommand) : undefined,
          cliArgs: Array.isArray(v.cliArgs) ? v.cliArgs.map(String) : undefined,
          displayName: String(v.displayName ?? `Voice ${i + 1}`),
          systemPrompt: v.systemPrompt ? String(v.systemPrompt) : undefined,
          toneOverride: v.toneOverride ? String(v.toneOverride) : undefined,
          systemPromptTemplateId: v.systemPromptTemplateId ? String(v.systemPromptTemplateId) : undefined,
          order: typeof v.order === 'number' ? v.order : i,
          color: String(v.color ?? '#6366f1'),
          avatarIcon: String(v.avatarIcon ?? 'bot'),
          customProviderId: v.customProviderId ? String(v.customProviderId) : undefined,
          enabledTools: Array.isArray(v.enabledTools) ? v.enabledTools.map(String) : [],
        }));
        if (compositionVoices.length > 0) upsertCompositionVoices(db, compositionVoices);
      }
      return getComposition(db, id);
    },

    'compositions.delete': async (params) => {
      const id = requireId(params?.id, 'id');
      deleteComposition(db, id);
      return { ok: true };
    },

    'compositions.archive': async (params) => {
      const id = requireId(params?.id, 'id');
      const archived = params?.archived === true;
      archiveComposition(db, id, archived);
      return { ok: true };
    },
  };
}
