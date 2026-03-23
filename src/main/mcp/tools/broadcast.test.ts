import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../db/migrations';
import { insertComposition } from '../../db/queries/compositions';
import { insertSession } from '../../db/queries/sessions';
import { buildBroadcastTool } from './broadcast';
import { VoiceManager } from '../../managers/VoiceManager';
import { SessionManager } from '../../managers/SessionManager';
import type { Composition, Session } from '../../../shared/types';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec('PRAGMA journal_mode = WAL');
  runMigrations(db);
  return db;
}

const COMP_ID = '00000000-0000-0000-0000-000000000001';
const SESS_ID = '00000000-0000-0000-0000-000000000002';
const VOICE_ID = '00000000-0000-0000-0000-000000000010';

function makeComposition(): Composition {
  return {
    id: COMP_ID,
    name: 'Test',
    mode: 'broadcast',
    continuationPolicy: 'none',
    continuationMaxRounds: 1,
    voices: [
      {
        id: VOICE_ID,
        compositionId: COMP_ID,
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

function makeSession(): Session {
  return {
    id: SESS_ID,
    compositionId: COMP_ID,
    name: 'Test Session',
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

describe('broadcast tool', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeDb();
    process.env.POLYPHON_MOCK_VOICES = '1';
    insertComposition(db, makeComposition());
    insertSession(db, makeSession());
  });

  afterEach(() => {
    db.close();
    delete process.env.POLYPHON_MOCK_VOICES;
  });

  it('broadcasts to all voices and returns responses', async () => {
    const vm = new VoiceManager(db);
    const sm = new SessionManager(vm);
    const handler = buildBroadcastTool(db, vm, sm);

    const result = await handler({ sessionId: SESS_ID, content: 'Hello' });
    expect(result.responses).toHaveLength(1);
    expect(result.responses[0]!.voiceName).toBe('Alice');
    expect(typeof result.responses[0]!.content).toBe('string');
    expect(result.roundIndex).toBeGreaterThan(0);
  });

  it('throws for unknown session', async () => {
    const vm = new VoiceManager(db);
    const sm = new SessionManager(vm);
    const handler = buildBroadcastTool(db, vm, sm);

    await expect(
      handler({ sessionId: '00000000-0000-0000-0000-000000000099', content: 'Hello' }),
    ).rejects.toThrow('Session not found');
  });

  it('throws for invalid sessionId', async () => {
    const vm = new VoiceManager(db);
    const sm = new SessionManager(vm);
    const handler = buildBroadcastTool(db, vm, sm);

    await expect(handler({ sessionId: 'not-a-uuid', content: 'Hello' })).rejects.toThrow();
  });
});
