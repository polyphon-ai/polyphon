import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../db/migrations';
import { insertComposition } from '../../db/queries/compositions';
import { insertSession } from '../../db/queries/sessions';
import { buildAskTool } from './ask';
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
const VOICE_ID_A = '00000000-0000-0000-0000-000000000010';
const VOICE_ID_B = '00000000-0000-0000-0000-000000000011';

function makeCompositionWithTwoVoices(): Composition {
  return {
    id: COMP_ID,
    name: 'Test',
    mode: 'broadcast',
    continuationPolicy: 'none',
    continuationMaxRounds: 1,
    voices: [
      {
        id: VOICE_ID_A,
        compositionId: COMP_ID,
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        displayName: 'Alice',
        order: 0,
        color: '#6366f1',
        avatarIcon: 'star',
        enabledTools: [],
      },
      {
        id: VOICE_ID_B,
        compositionId: COMP_ID,
        provider: 'openai',
        model: 'gpt-4o',
        displayName: 'Bob',
        order: 1,
        color: '#ec4899',
        avatarIcon: 'circle',
        enabledTools: [],
      },
    ],
    createdAt: 0,
    updatedAt: 0,
    archived: false,
  };
}

function makeDuplicateNameComposition(): Composition {
  return {
    id: COMP_ID,
    name: 'Test',
    mode: 'broadcast',
    continuationPolicy: 'none',
    continuationMaxRounds: 1,
    voices: [
      {
        id: VOICE_ID_A,
        compositionId: COMP_ID,
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        displayName: 'Alice',
        order: 0,
        color: '#6366f1',
        avatarIcon: 'star',
        enabledTools: [],
      },
      {
        id: VOICE_ID_B,
        compositionId: COMP_ID,
        provider: 'openai',
        model: 'gpt-4o',
        displayName: 'Alice',
        order: 1,
        color: '#ec4899',
        avatarIcon: 'circle',
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

describe('ask tool', () => {
  let db: Database.Database;

  beforeEach(() => {
    process.env.POLYPHON_MOCK_VOICES = '1';
    db = makeDb();
  });

  afterEach(() => {
    db.close();
    delete process.env.POLYPHON_MOCK_VOICES;
  });

  it('directs a question to the named voice', async () => {
    insertComposition(db, makeCompositionWithTwoVoices());
    insertSession(db, makeSession());

    const vm = new VoiceManager(db);
    const sm = new SessionManager(vm);
    const handler = buildAskTool(db, vm, sm);

    const result = await handler({ sessionId: SESS_ID, content: 'Hi Alice', voiceName: 'Alice' });
    expect(result.voiceName).toBe('Alice');
    expect(typeof result.content).toBe('string');
  });

  it('throws for an unknown voice name', async () => {
    insertComposition(db, makeCompositionWithTwoVoices());
    insertSession(db, makeSession());

    const vm = new VoiceManager(db);
    const sm = new SessionManager(vm);
    const handler = buildAskTool(db, vm, sm);

    await expect(
      handler({ sessionId: SESS_ID, content: 'Hi', voiceName: 'Charlie' }),
    ).rejects.toThrow('Voice not found');
  });

  it('returns a structured error for duplicate voice names', async () => {
    insertComposition(db, makeDuplicateNameComposition());
    insertSession(db, makeSession());

    const vm = new VoiceManager(db);
    const sm = new SessionManager(vm);
    const handler = buildAskTool(db, vm, sm);

    await expect(
      handler({ sessionId: SESS_ID, content: 'Hi', voiceName: 'Alice' }),
    ).rejects.toThrow('Multiple voices share the name');
  });

  it('throws for unknown session', async () => {
    insertComposition(db, makeCompositionWithTwoVoices());

    const vm = new VoiceManager(db);
    const sm = new SessionManager(vm);
    const handler = buildAskTool(db, vm, sm);

    await expect(
      handler({ sessionId: '00000000-0000-0000-0000-000000000099', content: 'Hi', voiceName: 'Alice' }),
    ).rejects.toThrow('Session not found');
  });
});
