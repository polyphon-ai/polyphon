import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../migrations';
import {
  listCompositions,
  getComposition,
  insertComposition,
  updateComposition,
  deleteComposition,
  upsertCompositionVoices,
} from './compositions';
import type { Composition, CompositionVoice } from '../../../shared/types';

function createTestDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA journal_mode = WAL');
  runMigrations(db);
  return db;
}

function makeVoice(overrides: Partial<CompositionVoice> = {}): CompositionVoice {
  return {
    id: 'v-1',
    compositionId: 'comp-1',
    provider: 'anthropic',
    model: 'claude-opus-4-6',
    displayName: 'Alice',
    systemPrompt: 'You are Alice',
    order: 0,
    color: '#D4763B',
    avatarIcon: 'star',
    ...overrides,
  };
}

function makeComposition(overrides: Partial<Composition> = {}): Composition {
  return {
    id: 'comp-1',
    name: 'Test Composition',
    mode: 'broadcast',
    continuationPolicy: 'none',
    continuationMaxRounds: 1,
    voices: [makeVoice()],
    createdAt: 1000,
    updatedAt: 1000,
    archived: false,
    ...overrides,
  };
}

describe('compositions queries', () => {
  let db: DatabaseSync;

  beforeEach(() => { db = createTestDb(); });
  afterEach(() => { db.close(); });

  it('insertComposition + getComposition round-trip with voices', () => {
    const comp = makeComposition();
    insertComposition(db, comp);
    const retrieved = getComposition(db, 'comp-1');
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe('comp-1');
    expect(retrieved!.name).toBe('Test Composition');
    expect(retrieved!.voices).toHaveLength(1);
    expect(retrieved!.voices[0]!.displayName).toBe('Alice');
  });

  it('getComposition returns null for unknown id', () => {
    expect(getComposition(db, 'nonexistent')).toBeNull();
  });

  it('voices are ordered by sort_order', () => {
    const comp = makeComposition({
      voices: [
        makeVoice({ id: 'v2', displayName: 'Bob', order: 1 }),
        makeVoice({ id: 'v1', displayName: 'Alice', order: 0 }),
      ],
    });
    insertComposition(db, comp);
    const retrieved = getComposition(db, 'comp-1');
    expect(retrieved!.voices[0]!.displayName).toBe('Alice');
    expect(retrieved!.voices[1]!.displayName).toBe('Bob');
  });

  it('serializes cliArgs as JSON', () => {
    const comp = makeComposition({
      voices: [
        makeVoice({
          provider: 'claude-code',
          cliCommand: 'claude',
          cliArgs: ['--verbose', '--no-stream'],
          model: undefined,
        }),
      ],
    });
    insertComposition(db, comp);
    const retrieved = getComposition(db, 'comp-1');
    expect(retrieved!.voices[0]!.cliArgs).toEqual(['--verbose', '--no-stream']);
  });

  it('listCompositions returns all compositions', () => {
    insertComposition(db, makeComposition({ id: 'c1', name: 'One', createdAt: 100, updatedAt: 100, voices: [makeVoice({ compositionId: 'c1' })] }));
    insertComposition(db, makeComposition({ id: 'c2', name: 'Two', createdAt: 200, updatedAt: 200, voices: [makeVoice({ id: 'v2', compositionId: 'c2' })] }));
    expect(listCompositions(db)).toHaveLength(2);
  });

  it('updateComposition updates specified fields', () => {
    insertComposition(db, makeComposition());
    updateComposition(db, 'comp-1', { name: 'Renamed', continuationPolicy: 'auto' });
    const updated = getComposition(db, 'comp-1');
    expect(updated!.name).toBe('Renamed');
    expect(updated!.continuationPolicy).toBe('auto');
    expect(updated!.mode).toBe('broadcast');
  });

  it('deleteComposition removes composition and cascades to voices', () => {
    insertComposition(db, makeComposition());
    deleteComposition(db, 'comp-1');
    expect(getComposition(db, 'comp-1')).toBeNull();
    // Verify voices are also deleted
    const voiceCount = db
      .prepare('SELECT COUNT(*) as n FROM composition_voices WHERE composition_id = ?')
      .get('comp-1') as { n: number };
    expect(voiceCount.n).toBe(0);
  });

  it('upsertCompositionVoices replaces all voices for a composition', () => {
    insertComposition(db, makeComposition());
    const newVoices: CompositionVoice[] = [
      makeVoice({ id: 'new-v1', displayName: 'NewAlice', order: 0 }),
      makeVoice({ id: 'new-v2', displayName: 'NewBob', order: 1 }),
    ];
    upsertCompositionVoices(db, newVoices);
    const retrieved = getComposition(db, 'comp-1');
    expect(retrieved!.voices).toHaveLength(2);
    expect(retrieved!.voices[0]!.displayName).toBe('NewAlice');
    expect(retrieved!.voices[1]!.displayName).toBe('NewBob');
  });
});
