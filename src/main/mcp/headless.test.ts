import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { ensureSessionInitialized } from './headless';
import { VoiceManager } from '../managers/VoiceManager';
import { runMigrations } from '../db/migrations';
import { insertSession } from '../db/queries/sessions';
import { insertComposition } from '../db/queries/compositions';
import type { Session, Composition } from '../../shared/types';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec('PRAGMA journal_mode = WAL');
  runMigrations(db);
  return db;
}

function makeComposition(id: string): Composition {
  return {
    id,
    name: 'Test Composition',
    mode: 'broadcast',
    continuationPolicy: 'none',
    continuationMaxRounds: 1,
    voices: [
      {
        id: `voice-1-${id}`,
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

function makeSession(id: string, compositionId: string): Session {
  return {
    id,
    compositionId,
    name: 'Test Session',
    mode: 'broadcast',
    continuationPolicy: 'none',
    continuationMaxRounds: 1,
    createdAt: 0,
    updatedAt: 0,
    archived: false,
    workingDir: null,
    sandboxedToWorkingDir: false,
      source: 'polyphon',
  };
}

describe('ensureSessionInitialized', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeDb();
    process.env.POLYPHON_MOCK_VOICES = '1';
  });

  afterEach(() => {
    db.close();
    delete process.env.POLYPHON_MOCK_VOICES;
  });

  it('initializes session from DB when VoiceManager has no ensemble', async () => {
    const compId = '00000000-0000-0000-0000-000000000001';
    const sessId = '00000000-0000-0000-0000-000000000002';
    const comp = makeComposition(compId);
    insertComposition(db, comp);

    const session = makeSession(sessId, compId);
    insertSession(db, session);

    const vm = new VoiceManager(db);
    expect(vm.getEnsemble(sessId)).toHaveLength(0);

    await ensureSessionInitialized(db, vm, session);

    expect(vm.getEnsemble(sessId)).toHaveLength(1);
  });

  it('does not re-initialize a session that already has an ensemble', async () => {
    const compId = '00000000-0000-0000-0000-000000000003';
    const sessId = '00000000-0000-0000-0000-000000000004';
    const comp = makeComposition(compId);
    insertComposition(db, comp);

    const session = makeSession(sessId, compId);
    insertSession(db, session);

    const vm = new VoiceManager(db);
    const createVoiceSpy = vi.spyOn(vm, 'createVoice');

    // First call — initializes
    await ensureSessionInitialized(db, vm, session);
    expect(createVoiceSpy).toHaveBeenCalledOnce();

    // Second call — skips
    await ensureSessionInitialized(db, vm, session);
    expect(createVoiceSpy).toHaveBeenCalledOnce();
  });
});
