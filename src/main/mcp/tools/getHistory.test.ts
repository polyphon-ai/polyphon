import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../db/migrations';
import { insertSession } from '../../db/queries/sessions';
import { insertMessage } from '../../db/queries/messages';
import { buildGetHistoryTool } from './getHistory';
import { generateId } from '../../utils';
import type { Session, Message } from '../../../shared/types';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec('PRAGMA journal_mode = WAL');
  runMigrations(db);
  return db;
}

const SESS_ID = '00000000-0000-0000-0000-000000000001';

function makeSession(): Session {
  return {
    id: SESS_ID,
    compositionId: '00000000-0000-0000-0000-000000000002',
    name: 'Test',
    mode: 'broadcast',
    continuationPolicy: 'none',
    continuationMaxRounds: 1,
    createdAt: 0,
    updatedAt: 0,
    archived: false,
    workingDir: null,
    sandboxedToWorkingDir: false,
  };
}

function makeMessage(content: string): Message {
  return {
    id: generateId(),
    sessionId: SESS_ID,
    role: 'conductor',
    voiceId: null,
    voiceName: null,
    content,
    timestamp: Date.now(),
    roundIndex: 1,
  };
}

describe('getHistory tool', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeDb();
    insertSession(db, makeSession());
  });

  afterEach(() => {
    db.close();
  });

  it('returns the session and messages', async () => {
    insertMessage(db, makeMessage('Hello'));
    const handler = buildGetHistoryTool(db);
    const result = await handler({ sessionId: SESS_ID });
    expect(result.session.id).toBe(SESS_ID);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]!.content).toBe('Hello');
  });

  it('throws for unknown session', async () => {
    const handler = buildGetHistoryTool(db);
    await expect(
      handler({ sessionId: '00000000-0000-0000-0000-000000000099' }),
    ).rejects.toThrow('Session not found');
  });

  it('applies the limit to return only the most recent messages', async () => {
    for (let i = 0; i < 5; i++) {
      insertMessage(db, makeMessage(`msg ${i}`));
    }
    const handler = buildGetHistoryTool(db);
    const result = await handler({ sessionId: SESS_ID, limit: 3 });
    expect(result.messages).toHaveLength(3);
  });

  it('throws for invalid limit', async () => {
    const handler = buildGetHistoryTool(db);
    await expect(handler({ sessionId: SESS_ID, limit: 0 })).rejects.toThrow('positive integer');
    await expect(handler({ sessionId: SESS_ID, limit: -1 })).rejects.toThrow('positive integer');
    await expect(handler({ sessionId: SESS_ID, limit: 'ten' })).rejects.toThrow('positive integer');
  });
});
