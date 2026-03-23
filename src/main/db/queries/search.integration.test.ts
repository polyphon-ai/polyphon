import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../migrations';
import { insertSession, archiveSession } from './sessions';
import { insertMessage } from './messages';
import { searchMessages } from './search';
import type { Message, Session } from '../../../shared/types';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
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
    sandboxedToWorkingDir: false,
    ...overrides,
  };
}

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg-1',
    sessionId: 'sess-1',
    role: 'conductor',
    voiceId: null,
    voiceName: null,
    content: 'Hello world',
    timestamp: 2000,
    roundIndex: 1,
    ...overrides,
  };
}

describe('searchMessages', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    insertSession(db, makeSession());
  });

  afterEach(() => {
    db.close();
  });

  it('returns empty array for query shorter than 2 chars', () => {
    insertMessage(db, makeMessage());
    expect(searchMessages(db, '')).toEqual([]);
    expect(searchMessages(db, 'a')).toEqual([]);
    expect(searchMessages(db, ' ')).toEqual([]);
  });

  it('returns empty array for FTS operator-only query', () => {
    insertMessage(db, makeMessage({ content: 'foo bar' }));
    expect(searchMessages(db, 'AND')).toEqual([]);
    expect(searchMessages(db, 'OR')).toEqual([]);
    expect(searchMessages(db, 'NOT')).toEqual([]);
  });

  it('returns matching messages for basic query', () => {
    insertMessage(db, makeMessage({ id: 'a', content: 'The quick brown fox' }));
    insertMessage(db, makeMessage({ id: 'b', content: 'Nothing relevant here' }));
    const results = searchMessages(db, 'quick');
    expect(results).toHaveLength(1);
    expect(results[0]!.messageId).toBe('a');
    expect(results[0]!.sessionId).toBe('sess-1');
    expect(results[0]!.sessionName).toBe('Test Session');
  });

  it('returns results for multi-term query', () => {
    insertMessage(db, makeMessage({ id: 'a', content: 'machine learning algorithms' }));
    insertMessage(db, makeMessage({ id: 'b', content: 'deep learning concepts' }));
    const results = searchMessages(db, 'learning');
    expect(results).toHaveLength(2);
  });

  it('scopes results to sessionId when provided', () => {
    insertSession(db, makeSession({ id: 'sess-2', name: 'Other Session' }));
    insertMessage(db, makeMessage({ id: 'a', sessionId: 'sess-1', content: 'polyphon search' }));
    insertMessage(db, makeMessage({ id: 'b', sessionId: 'sess-2', content: 'polyphon found it' }));

    const all = searchMessages(db, 'polyphon');
    expect(all).toHaveLength(2);

    const scoped = searchMessages(db, 'polyphon', 'sess-1');
    expect(scoped).toHaveLength(1);
    expect(scoped[0]!.sessionId).toBe('sess-1');
  });

  it('excludes archived sessions', () => {
    insertSession(db, makeSession({ id: 'archived-sess', name: 'Archived' }));
    archiveSession(db, 'archived-sess', true);
    insertMessage(db, makeMessage({ id: 'a', sessionId: 'sess-1', content: 'findme' }));
    insertMessage(db, makeMessage({ id: 'b', sessionId: 'archived-sess', content: 'findme' }));
    const results = searchMessages(db, 'findme');
    expect(results).toHaveLength(1);
    expect(results[0]!.sessionId).toBe('sess-1');
  });

  it('snippet contains mark tags around the match', () => {
    insertMessage(db, makeMessage({ id: 'a', content: 'the elephant remembers everything' }));
    const results = searchMessages(db, 'elephant');
    expect(results).toHaveLength(1);
    expect(results[0]!.snippet).toContain('<mark>');
    expect(results[0]!.snippet).toContain('</mark>');
  });

  it('searches voice_name field', () => {
    insertMessage(db, makeMessage({
      id: 'a',
      role: 'voice',
      voiceName: 'SpecialVoice',
      content: 'some analysis output',
    }));
    const results = searchMessages(db, 'SpecialVoice');
    expect(results).toHaveLength(1);
    expect(results[0]!.voiceName).toBe('SpecialVoice');
  });

  it('does not throw on FTS operator inputs — returns empty array', () => {
    insertMessage(db, makeMessage({ content: 'hello world' }));
    expect(() => searchMessages(db, 'hello AND')).not.toThrow();
    expect(() => searchMessages(db, '"')).not.toThrow();
    expect(() => searchMessages(db, 'foo*bar')).not.toThrow();
  });

  it('insert trigger keeps FTS in sync', () => {
    insertMessage(db, makeMessage({ id: 'new', content: 'freshly inserted term' }));
    const results = searchMessages(db, 'freshly');
    expect(results).toHaveLength(1);
    expect(results[0]!.messageId).toBe('new');
  });

  it('delete trigger removes message from FTS index', () => {
    insertMessage(db, makeMessage({ id: 'del', content: 'to be deleted phrase' }));
    expect(searchMessages(db, 'deleted')).toHaveLength(1);

    db.prepare('DELETE FROM messages WHERE id = ?').run('del');
    expect(searchMessages(db, 'deleted')).toHaveLength(0);
  });

  it('update trigger moves match to new content', () => {
    insertMessage(db, makeMessage({ id: 'upd', content: 'original content here' }));
    expect(searchMessages(db, 'original')).toHaveLength(1);
    expect(searchMessages(db, 'updated')).toHaveLength(0);

    db.prepare('UPDATE messages SET content = ? WHERE id = ?').run('updated content here', 'upd');
    expect(searchMessages(db, 'original')).toHaveLength(0);
    expect(searchMessages(db, 'updated')).toHaveLength(1);
  });

  it('session-scoped results are ordered by timestamp ASC (oldest first)', () => {
    insertMessage(db, makeMessage({ id: 'c', content: 'polyphon ordering test', timestamp: 3000 }));
    insertMessage(db, makeMessage({ id: 'a', content: 'polyphon ordering test', timestamp: 1000 }));
    insertMessage(db, makeMessage({ id: 'b', content: 'polyphon ordering test', timestamp: 2000 }));
    const results = searchMessages(db, 'ordering', 'sess-1');
    expect(results.map((r) => r.messageId)).toEqual(['a', 'b', 'c']);
  });

  it('global (unscoped) results span all sessions', () => {
    insertSession(db, makeSession({ id: 'sess-2', name: 'Second Session' }));
    insertMessage(db, makeMessage({ id: 'x', sessionId: 'sess-1', content: 'crosssession unique term' }));
    insertMessage(db, makeMessage({ id: 'y', sessionId: 'sess-2', content: 'crosssession unique term' }));
    const results = searchMessages(db, 'crosssession');
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.sessionId)).toEqual(expect.arrayContaining(['sess-1', 'sess-2']));
  });

  it('result shape includes all expected fields', () => {
    insertMessage(db, makeMessage({
      id: 'shape-test',
      role: 'voice',
      voiceName: 'Aria',
      content: 'fieldcheck present',
      timestamp: 9999,
    }));
    const [r] = searchMessages(db, 'fieldcheck');
    expect(r).toMatchObject({
      messageId: 'shape-test',
      sessionId: 'sess-1',
      sessionName: 'Test Session',
      role: 'voice',
      voiceName: 'Aria',
      timestamp: 9999,
      archived: false,
    });
    expect(typeof r!.snippet).toBe('string');
  });
});
