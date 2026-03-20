import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../migrations';
import { initFieldEncryption, _resetForTests } from '../../security/fieldEncryption';
import { listSessions, getSession, insertSession, deleteSession, archiveSession, listSessionsByCompositionId } from './sessions';
import type { Session } from '../../../shared/types';

const TEST_KEY = Buffer.alloc(32);

function createTestDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA journal_mode = WAL');
  runMigrations(db);
  return db;
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'sess-1',
    compositionId: 'comp-1',
    name: 'Test Session',
    mode: 'broadcast',
    continuationPolicy: 'none',
    continuationMaxRounds: 1,
    createdAt: 1000,
    updatedAt: 1000,
    archived: false,
    workingDir: null,
    ...overrides,
  };
}

describe('sessions queries', () => {
  let db: DatabaseSync;

  beforeEach(() => { initFieldEncryption(TEST_KEY); db = createTestDb(); });
  afterEach(() => { db.close(); _resetForTests(); });

  it('insertSession + getSession round-trip', () => {
    const session = makeSession();
    insertSession(db, session);
    const retrieved = getSession(db, 'sess-1');
    expect(retrieved).toEqual(session);
  });

  it('getSession returns null for unknown id', () => {
    expect(getSession(db, 'nonexistent')).toBeNull();
  });

  it('listSessions returns all sessions ordered by created_at DESC', () => {
    insertSession(db, makeSession({ id: 'a', name: 'Older', createdAt: 100, updatedAt: 100 }));
    insertSession(db, makeSession({ id: 'b', name: 'Newer', createdAt: 200, updatedAt: 200 }));
    const sessions = listSessions(db);
    expect(sessions).toHaveLength(2);
    expect(sessions[0]!.id).toBe('b');
    expect(sessions[1]!.id).toBe('a');
  });

  it('deleteSession removes the session', () => {
    insertSession(db, makeSession());
    deleteSession(db, 'sess-1');
    expect(getSession(db, 'sess-1')).toBeNull();
  });

  it('preserves all Session fields through round-trip', () => {
    const session = makeSession({
      mode: 'conductor',
      continuationPolicy: 'auto',
      continuationMaxRounds: 3,
    });
    insertSession(db, session);
    const retrieved = getSession(db, session.id);
    expect(retrieved?.mode).toBe('conductor');
    expect(retrieved?.continuationPolicy).toBe('auto');
    expect(retrieved?.continuationMaxRounds).toBe(3);
  });

  it('round-trips a non-null workingDir', () => {
    const session = makeSession({ id: 'sess-wd', workingDir: '/Users/corey/projects/my-app' });
    insertSession(db, session);
    const retrieved = getSession(db, 'sess-wd');
    expect(retrieved?.workingDir).toBe('/Users/corey/projects/my-app');
  });

  it('round-trips a null workingDir', () => {
    const session = makeSession({ id: 'sess-no-wd', workingDir: null });
    insertSession(db, session);
    const retrieved = getSession(db, 'sess-no-wd');
    expect(retrieved?.workingDir).toBeNull();
  });
});

describe('archiveSession', () => {
  let db: DatabaseSync;

  beforeEach(() => { initFieldEncryption(TEST_KEY); db = createTestDb(); });
  afterEach(() => { db.close(); _resetForTests(); });

  it('sets archived=true on the session', () => {
    insertSession(db, makeSession({ id: 'sess-arc-1' }));
    archiveSession(db, 'sess-arc-1', true);
    const retrieved = getSession(db, 'sess-arc-1');
    expect(retrieved?.archived).toBe(true);
  });

  it('unarchives a session (sets archived=false)', () => {
    insertSession(db, makeSession({ id: 'sess-arc-2' }));
    archiveSession(db, 'sess-arc-2', true);
    archiveSession(db, 'sess-arc-2', false);
    const retrieved = getSession(db, 'sess-arc-2');
    expect(retrieved?.archived).toBe(false);
  });

  it('listSessions(db, false) does not return archived sessions by default', () => {
    insertSession(db, makeSession({ id: 'active-1', createdAt: 100, updatedAt: 100 }));
    insertSession(db, makeSession({ id: 'archived-1', createdAt: 200, updatedAt: 200 }));
    archiveSession(db, 'archived-1', true);
    const sessions = listSessions(db, false);
    expect(sessions.map((s) => s.id)).toContain('active-1');
    expect(sessions.map((s) => s.id)).not.toContain('archived-1');
  });

  it('listSessions(db, true) returns only archived sessions', () => {
    insertSession(db, makeSession({ id: 'active-2', createdAt: 100, updatedAt: 100 }));
    insertSession(db, makeSession({ id: 'archived-2', createdAt: 200, updatedAt: 200 }));
    archiveSession(db, 'archived-2', true);
    const sessions = listSessions(db, true);
    expect(sessions.map((s) => s.id)).toContain('archived-2');
    expect(sessions.map((s) => s.id)).not.toContain('active-2');
  });
});

describe('listSessionsByCompositionId', () => {
  let db: DatabaseSync;

  beforeEach(() => { initFieldEncryption(TEST_KEY); db = createTestDb(); });
  afterEach(() => { db.close(); _resetForTests(); });

  it('returns only sessions with matching compositionId', () => {
    insertSession(db, makeSession({ id: 'sess-c1-a', compositionId: 'comp-x', createdAt: 100, updatedAt: 100 }));
    insertSession(db, makeSession({ id: 'sess-c1-b', compositionId: 'comp-x', createdAt: 200, updatedAt: 200 }));
    insertSession(db, makeSession({ id: 'sess-c2', compositionId: 'comp-y', createdAt: 300, updatedAt: 300 }));
    const results = listSessionsByCompositionId(db, 'comp-x');
    expect(results).toHaveLength(2);
    expect(results.map((s) => s.id)).toContain('sess-c1-a');
    expect(results.map((s) => s.id)).toContain('sess-c1-b');
    expect(results.map((s) => s.id)).not.toContain('sess-c2');
  });

  it('returns empty array when no sessions match compositionId', () => {
    insertSession(db, makeSession({ id: 'sess-other', compositionId: 'comp-z' }));
    const results = listSessionsByCompositionId(db, 'comp-nonexistent');
    expect(results).toHaveLength(0);
  });
});
