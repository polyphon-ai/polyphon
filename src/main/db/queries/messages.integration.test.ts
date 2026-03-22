import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../migrations';
import { initFieldEncryption, _resetForTests } from '../../security/fieldEncryption';
import { insertSession } from './sessions';
import { listMessages, insertMessage, deleteMessagesBySession } from './messages';
import type { Message, Session } from '../../../shared/types';

const TEST_KEY = Buffer.alloc(32);

function createTestDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA journal_mode = WAL');
  runMigrations(db);
  return db;
}

function makeSession(): Session {
  return {
    id: 'sess-1',
    compositionId: 'comp-1',
    name: 'Test',
    mode: 'broadcast',
    continuationPolicy: 'none',
    continuationMaxRounds: 1,
    createdAt: 1000,
    updatedAt: 1000,
    archived: false,
    workingDir: null,
    sandboxedToWorkingDir: false,
  };
}

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg-1',
    sessionId: 'sess-1',
    role: 'conductor',
    voiceId: null,
    voiceName: null,
    content: 'Hello',
    timestamp: 2000,
    roundIndex: 1,
    ...overrides,
  };
}

describe('messages queries', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    initFieldEncryption(TEST_KEY);
    db = createTestDb();
    insertSession(db, makeSession());
  });

  afterEach(() => {
    db.close();
    _resetForTests();
  });

  it('insertMessage + listMessages round-trip', () => {
    insertMessage(db, makeMessage());
    const messages = listMessages(db, 'sess-1');
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      id: 'msg-1',
      sessionId: 'sess-1',
      role: 'conductor',
      content: 'Hello',
    });
  });

  it('listMessages orders by timestamp ASC', () => {
    insertMessage(db, makeMessage({ id: 'a', timestamp: 3000 }));
    insertMessage(db, makeMessage({ id: 'b', timestamp: 1000 }));
    insertMessage(db, makeMessage({ id: 'c', timestamp: 2000 }));
    const messages = listMessages(db, 'sess-1');
    expect(messages.map((m) => m.id)).toEqual(['b', 'c', 'a']);
  });

  it('listMessages only returns messages for the given session', () => {
    const session2 = makeSession();
    session2.id = 'sess-2';
    insertSession(db, session2);
    insertMessage(db, makeMessage({ id: 'a', sessionId: 'sess-1' }));
    insertMessage(db, makeMessage({ id: 'b', sessionId: 'sess-2' }));
    expect(listMessages(db, 'sess-1')).toHaveLength(1);
    expect(listMessages(db, 'sess-2')).toHaveLength(1);
  });

  it('serializes and deserializes metadata', () => {
    const meta = { provider: 'anthropic', tokens: 42 };
    insertMessage(db, makeMessage({ metadata: meta }));
    const [msg] = listMessages(db, 'sess-1');
    expect(msg!.metadata).toEqual(meta);
  });

  it('handles null metadata', () => {
    insertMessage(db, makeMessage({ metadata: undefined }));
    const [msg] = listMessages(db, 'sess-1');
    expect(msg!.metadata).toBeUndefined();
  });

  it('stores voice messages with voiceId and voiceName', () => {
    insertMessage(
      db,
      makeMessage({
        role: 'voice',
        voiceId: 'v-1',
        voiceName: 'Alice',
      }),
    );
    const [msg] = listMessages(db, 'sess-1');
    expect(msg!.role).toBe('voice');
    expect(msg!.voiceId).toBe('v-1');
    expect(msg!.voiceName).toBe('Alice');
  });

  it('stores system messages with role system', () => {
    insertMessage(db, makeMessage({ id: 'sys-1', role: 'system', voiceId: null, voiceName: null }));
    const [msg] = listMessages(db, 'sess-1');
    expect(msg!.role).toBe('system');
    expect(msg!.id).toBe('sys-1');
  });

  it('deleteMessagesBySession removes all messages for session', () => {
    insertMessage(db, makeMessage({ id: 'a' }));
    insertMessage(db, makeMessage({ id: 'b' }));
    deleteMessagesBySession(db, 'sess-1');
    expect(listMessages(db, 'sess-1')).toHaveLength(0);
  });

  it('stores content as ENC:v1: ciphertext in the database', () => {
    insertMessage(db, makeMessage({ content: 'Secret message' }));
    const row = db.prepare('SELECT content FROM messages WHERE id = ?').get('msg-1') as { content: string };
    expect(row.content).toMatch(/^ENC:v1:/);
  });

  it('decrypts ENC:v1: content back to original value', () => {
    insertMessage(db, makeMessage({ content: 'Secret message' }));
    const [msg] = listMessages(db, 'sess-1');
    expect(msg!.content).toBe('Secret message');
  });

  it('reads legacy plaintext content without error (migration fallback)', () => {
    db.prepare('INSERT INTO messages (id, session_id, role, voice_id, voice_name, content, timestamp, round_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run('legacy-1', 'sess-1', 'conductor', null, null, 'Plaintext legacy content', 9999, 0);
    const messages = listMessages(db, 'sess-1');
    const legacy = messages.find((m) => m.id === 'legacy-1');
    expect(legacy!.content).toBe('Plaintext legacy content');
  });
});
