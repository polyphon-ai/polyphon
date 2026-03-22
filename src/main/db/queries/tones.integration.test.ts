import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../migrations';
import { listTones, getTone, createTone, updateTone, deleteTone } from './tones';
import { upsertUserProfile } from './userProfile';
import { insertComposition } from './compositions';
import type { Composition, CompositionVoice } from '../../../shared/types';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec('PRAGMA journal_mode = WAL');
  runMigrations(db);
  return db;
}

function makeCompositionWithTone(toneId: string): Composition {
  const voiceId = `v-${toneId}`;
  return {
    id: `comp-${toneId}`,
    name: 'Test',
    mode: 'broadcast',
    continuationPolicy: 'none',
    continuationMaxRounds: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    archived: false,
    voices: [
      {
        id: voiceId,
        compositionId: `comp-${toneId}`,
        provider: 'anthropic',
        displayName: 'Test Voice',
        toneOverride: toneId,
        order: 0,
        color: '#000',
        avatarIcon: 'anthropic',
      } as CompositionVoice,
    ],
  };
}

describe('tones queries', () => {
  let db: Database.Database;

  beforeEach(() => { db = createTestDb(); });
  afterEach(() => { db.close(); });

  it('seeds 5 built-in tones on migration', () => {
    const tones = listTones(db);
    expect(tones.length).toBeGreaterThanOrEqual(5);
    const builtins = tones.filter((t) => t.isBuiltin);
    expect(builtins).toHaveLength(5);
    expect(builtins.map((t) => t.id)).toContain('professional');
    expect(builtins.map((t) => t.id)).toContain('collaborative');
    expect(builtins.map((t) => t.id)).toContain('concise');
    expect(builtins.map((t) => t.id)).toContain('exploratory');
    expect(builtins.map((t) => t.id)).toContain('teaching');
  });

  it('built-in tones are ordered by sort_order', () => {
    const tones = listTones(db).filter((t) => t.isBuiltin);
    const orders = tones.map((t) => t.sortOrder);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it('creates a custom tone', () => {
    const tone = createTone(db, { name: 'Casual', description: 'Laid-back and friendly.' });
    expect(tone.id).toBeTruthy();
    expect(tone.name).toBe('Casual');
    expect(tone.description).toBe('Laid-back and friendly.');
    expect(tone.isBuiltin).toBe(false);
  });

  it('retrieves a tone by id', () => {
    const created = createTone(db, { name: 'Casual', description: 'Laid-back.' });
    const retrieved = getTone(db, created.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe(created.id);
  });

  it('returns null for unknown id', () => {
    expect(getTone(db, 'nonexistent')).toBeNull();
  });

  it('updates name and description of a custom tone', () => {
    const tone = createTone(db, { name: 'Original', description: 'Original desc.' });
    const updated = updateTone(db, tone.id, { name: 'Updated', description: 'New desc.' });
    expect(updated.name).toBe('Updated');
    expect(updated.description).toBe('New desc.');
  });

  it('updates a built-in tone', () => {
    const updated = updateTone(db, 'professional', { name: 'Pro', description: 'Short and sharp.' });
    expect(updated.name).toBe('Pro');
    expect(updated.description).toBe('Short and sharp.');
    expect(updated.isBuiltin).toBe(true);
  });

  it('deletes a custom tone', () => {
    const tone = createTone(db, { name: 'Temp', description: 'Temp.' });
    deleteTone(db, tone.id);
    expect(getTone(db, tone.id)).toBeNull();
  });

  it('deletes a built-in tone', () => {
    deleteTone(db, 'professional');
    expect(getTone(db, 'professional')).toBeNull();
  });

  it('rejects duplicate tone names with UNIQUE constraint', () => {
    createTone(db, { name: 'Unique', description: 'Desc.' });
    expect(() => createTone(db, { name: 'Unique', description: 'Other.' })).toThrow();
  });

  it('deleteTone resets user_profile.default_tone to the first remaining tone when referencing deleted tone', () => {
    const tone = createTone(db, { name: 'Custom', description: 'Custom.' });
    upsertUserProfile(db, {
      conductorName: '',
      pronouns: '',
      conductorContext: '',
      defaultTone: tone.id,
      conductorColor: '',
      conductorAvatar: '',
      preferMarkdown: true,
    });
    const firstRemaining = listTones(db).find((t) => t.id !== tone.id)!;
    deleteTone(db, tone.id);
    const profile = db.prepare('SELECT default_tone FROM user_profile WHERE id = 1').get() as { default_tone: string } | undefined;
    expect(profile?.default_tone).toBe(firstRemaining.id);
  });

  it('deleteTone clears tone_override on composition_voices referencing the deleted tone', () => {
    const tone = createTone(db, { name: 'Custom', description: 'Custom.' });
    insertComposition(db, makeCompositionWithTone(tone.id));
    deleteTone(db, tone.id);
    const rows = db.prepare(`SELECT tone_override FROM composition_voices WHERE tone_override = ?`).all(tone.id) as unknown[];
    expect(rows).toHaveLength(0);
  });

  it('INSERT OR IGNORE prevents re-seeding built-in tones on repeated runs', () => {
    const before = getTone(db, 'professional')!;
    runMigrations(db);
    const after = getTone(db, 'professional')!;
    expect(after.name).toBe(before.name);
    expect(after.createdAt).toBe(before.createdAt);
  });
});
