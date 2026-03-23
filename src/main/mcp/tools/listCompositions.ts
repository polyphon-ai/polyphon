import type Database from 'better-sqlite3';
import { listCompositions } from '../../db/queries/compositions';

interface ListCompositionsResult {
  compositions: Array<{
    id: string;
    name: string;
    mode: string;
    continuationPolicy: string;
    voices: Array<{ id: string; name: string; provider: string }>;
  }>;
}

export function buildListCompositionsTool(db: Database.Database) {
  return async (): Promise<ListCompositionsResult> => {
    const compositions = listCompositions(db, false);
    return {
      compositions: compositions.map((c) => ({
        id: c.id,
        name: c.name,
        mode: c.mode,
        continuationPolicy: c.continuationPolicy,
        voices: c.voices.map((v) => ({
          id: v.id,
          name: v.displayName,
          provider: v.provider,
        })),
      })),
    };
  };
}
