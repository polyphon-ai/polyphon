import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../db/migrations';
import { insertComposition, archiveComposition } from '../../db/queries/compositions';
import { buildListCompositionsTool } from './listCompositions';
import type { Composition } from '../../../shared/types';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec('PRAGMA journal_mode = WAL');
  runMigrations(db);
  return db;
}

function makeComposition(id: string, name: string): Composition {
  return {
    id,
    name,
    mode: 'broadcast',
    continuationPolicy: 'none',
    continuationMaxRounds: 1,
    voices: [
      {
        id: `voice-${id}`,
        compositionId: id,
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        displayName: 'Alice',
        order: 0,
        color: '#6366f1',
        avatarIcon: 'star',
        enabledTools: [],
      },
    ],
    createdAt: 0,
    updatedAt: 0,
    archived: false,
  };
}

describe('listCompositions tool', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeDb();
  });

  afterEach(() => {
    db.close();
  });

  it('returns empty array when no compositions exist', async () => {
    const handler = buildListCompositionsTool(db);
    const result = await handler();
    expect(result.compositions).toHaveLength(0);
  });

  it('returns non-archived compositions', async () => {
    insertComposition(db, makeComposition('00000000-0000-0000-0000-000000000001', 'Alpha'));
    const handler = buildListCompositionsTool(db);
    const result = await handler();
    expect(result.compositions).toHaveLength(1);
    expect(result.compositions[0]!.name).toBe('Alpha');
  });

  it('excludes archived compositions', async () => {
    insertComposition(db, makeComposition('00000000-0000-0000-0000-000000000002', 'Active'));
    insertComposition(db, makeComposition('00000000-0000-0000-0000-000000000003', 'Archived'));
    archiveComposition(db, '00000000-0000-0000-0000-000000000003', true);
    const handler = buildListCompositionsTool(db);
    const result = await handler();
    expect(result.compositions).toHaveLength(1);
    expect(result.compositions[0]!.name).toBe('Active');
  });

  it('returns voice summaries', async () => {
    insertComposition(db, makeComposition('00000000-0000-0000-0000-000000000004', 'Comp'));
    const handler = buildListCompositionsTool(db);
    const result = await handler();
    expect(result.compositions[0]!.voices).toHaveLength(1);
    expect(result.compositions[0]!.voices[0]!.name).toBe('Alice');
    expect(result.compositions[0]!.voices[0]!.provider).toBe('anthropic');
  });
});
