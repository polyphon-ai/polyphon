import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../migrations';
import { initFieldEncryption, _resetForTests } from '../../security/fieldEncryption';
import {
  listCompositions,
  getComposition,
  insertComposition,
  updateComposition,
  deleteComposition,
  upsertCompositionVoices,
} from './compositions';
import type { Composition, CompositionVoice } from '../../../shared/types';

const TEST_KEY = Buffer.alloc(32);

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

  beforeEach(() => { initFieldEncryption(TEST_KEY); db = createTestDb(); });
  afterEach(() => { db.close(); _resetForTests(); });

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

  it('stores system_prompt, cli_args, and cli_command as ENC:v1: ciphertext', () => {
    const comp = makeComposition({
      voices: [makeVoice({ id: 'v-enc', systemPrompt: 'Secret prompt', cliCommand: 'claude', cliArgs: ['--verbose'] })],
    });
    insertComposition(db, comp);
    const row = db.prepare('SELECT system_prompt, cli_args, cli_command FROM composition_voices WHERE id = ?').get('v-enc') as { system_prompt: string; cli_args: string; cli_command: string };
    expect(row.system_prompt).toMatch(/^ENC:v1:/);
    expect(row.cli_args).toMatch(/^ENC:v1:/);
    expect(row.cli_command).toMatch(/^ENC:v1:/);
  });

  it('decrypts system_prompt, cli_args, and cli_command back to original values', () => {
    const comp = makeComposition({
      voices: [makeVoice({ id: 'v-enc', systemPrompt: 'Secret prompt', cliCommand: 'claude', cliArgs: ['--verbose'] })],
    });
    insertComposition(db, comp);
    const retrieved = getComposition(db, 'comp-1');
    expect(retrieved!.voices[0]!.systemPrompt).toBe('Secret prompt');
    expect(retrieved!.voices[0]!.cliArgs).toEqual(['--verbose']);
    expect(retrieved!.voices[0]!.cliCommand).toBe('claude');
  });

  it('reads legacy plaintext system_prompt, cli_args, and cli_command without error', () => {
    const comp = makeComposition({ voices: [] });
    insertComposition(db, comp);
    db.prepare('INSERT INTO composition_voices (id, composition_id, provider, model, cli_command, cli_args, display_name, system_prompt, sort_order, color, avatar_icon) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run('legacy-v', 'comp-1', 'anthropic', 'claude-opus-4-6', 'claude', '["--flag"]', 'Legacy', 'Legacy system prompt', 0, '#000', 'star');
    const retrieved = getComposition(db, 'comp-1');
    expect(retrieved!.voices[0]!.systemPrompt).toBe('Legacy system prompt');
    expect(retrieved!.voices[0]!.cliArgs).toEqual(['--flag']);
    expect(retrieved!.voices[0]!.cliCommand).toBe('claude');
  });
});
