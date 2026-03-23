import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import path from 'node:path';
import os from 'node:os';
import { runMigrations } from '../../db/migrations';
import { insertComposition } from '../../db/queries/compositions';
import { buildCreateSessionTool } from './createSession';
import { VoiceManager } from '../../managers/VoiceManager';
import type { Composition } from '../../../shared/types';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec('PRAGMA journal_mode = WAL');
  runMigrations(db);
  return db;
}

const COMP_ID = '00000000-0000-0000-0000-000000000001';

function makeComposition(): Composition {
  return {
    id: COMP_ID,
    name: 'Test',
    mode: 'broadcast',
    continuationPolicy: 'none',
    continuationMaxRounds: 1,
    voices: [
      {
        id: '00000000-0000-0000-0000-000000000010',
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

describe('createSession tool', () => {
  let db: Database.Database;
  let vm: VoiceManager;

  beforeEach(() => {
    db = makeDb();
    vm = new VoiceManager(db);
    process.env.POLYPHON_MOCK_VOICES = '1';
    insertComposition(db, makeComposition());
  });

  afterEach(() => {
    db.close();
    delete process.env.POLYPHON_MOCK_VOICES;
  });

  it('creates a session and returns it', async () => {
    const handler = buildCreateSessionTool(db, vm);
    const result = await handler({ compositionId: COMP_ID });
    expect(result.session.compositionId).toBe(COMP_ID);
    expect(result.session.name).toBe('MCP Session');
  });

  it('uses the provided name', async () => {
    const handler = buildCreateSessionTool(db, vm);
    const result = await handler({ compositionId: COMP_ID, name: 'My Session' });
    expect(result.session.name).toBe('My Session');
  });

  it('throws for unknown composition', async () => {
    const handler = buildCreateSessionTool(db, vm);
    await expect(
      handler({ compositionId: '00000000-0000-0000-0000-000000000099' }),
    ).rejects.toThrow('Composition not found');
  });

  it('throws when workingDir is not absolute', async () => {
    const handler = buildCreateSessionTool(db, vm);
    await expect(
      handler({ compositionId: COMP_ID, workingDir: 'relative/path' }),
    ).rejects.toThrow('absolute');
  });

  it('throws when workingDir does not exist', async () => {
    const handler = buildCreateSessionTool(db, vm);
    await expect(
      handler({ compositionId: COMP_ID, workingDir: '/definitely/does/not/exist/xyz' }),
    ).rejects.toThrow('does not exist');
  });

  it('accepts a valid existing workingDir', async () => {
    const handler = buildCreateSessionTool(db, vm);
    const result = await handler({ compositionId: COMP_ID, workingDir: os.tmpdir() });
    expect(result.session.workingDir).toBe(path.resolve(os.tmpdir()));
  });
});
