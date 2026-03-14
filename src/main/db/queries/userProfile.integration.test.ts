import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../migrations';
import { getUserProfile, upsertUserProfile } from './userProfile';

function createTestDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA journal_mode = WAL');
  runMigrations(db);
  return db;
}

describe('userProfile queries', () => {
  let db: DatabaseSync;

  beforeEach(() => { db = createTestDb(); });
  afterEach(() => { db.close(); });

  it('getUserProfile returns default profile when no row exists', () => {
    // migration004 seeds a row — delete it to exercise the fallback code path
    db.exec('DELETE FROM user_profile');
    const profile = getUserProfile(db);
    expect(profile).toEqual({
      conductorName: '',
      pronouns: '',
      conductorContext: '',
      defaultTone: 'collaborative',
      conductorColor: '',
      conductorAvatar: '',
      updatedAt: 0,
    });
  });

  it('upsertUserProfile inserts and returns profile with provided fields', () => {
    const result = upsertUserProfile(db, {
      conductorName: 'Ada',
      pronouns: 'she/her',
      conductorContext: 'Software engineer',
      defaultTone: 'professional',
      conductorColor: '',
      conductorAvatar: '',
    });
    expect(result.conductorName).toBe('Ada');
    expect(result.pronouns).toBe('she/her');
    expect(result.conductorContext).toBe('Software engineer');
    expect(result.defaultTone).toBe('professional');
  });

  it('getUserProfile retrieves the previously upserted profile', () => {
    upsertUserProfile(db, {
      conductorName: 'Ada',
      pronouns: 'she/her',
      conductorContext: 'Software engineer',
      defaultTone: 'professional',
      conductorColor: '',
      conductorAvatar: '',
    });
    const profile = getUserProfile(db);
    expect(profile.conductorName).toBe('Ada');
    expect(profile.pronouns).toBe('she/her');
    expect(profile.conductorContext).toBe('Software engineer');
    expect(profile.defaultTone).toBe('professional');
  });

  it('upsertUserProfile replaces profile on second call (only ever 1 row)', () => {
    upsertUserProfile(db, {
      conductorName: 'Ada',
      pronouns: 'she/her',
      conductorContext: 'First context',
      defaultTone: 'professional',
      conductorColor: '',
      conductorAvatar: '',
    });
    upsertUserProfile(db, {
      conductorName: 'Boaz',
      pronouns: 'he/him',
      conductorContext: 'Second context',
      defaultTone: 'concise',
      conductorColor: '#6366f1',
      conductorAvatar: '',
    });
    const profile = getUserProfile(db);
    expect(profile.conductorName).toBe('Boaz');
    expect(profile.pronouns).toBe('he/him');
    expect(profile.conductorContext).toBe('Second context');
    expect(profile.defaultTone).toBe('concise');
    expect(profile.conductorColor).toBe('#6366f1');
    const rowCount = (db.prepare('SELECT COUNT(*) as c FROM user_profile').get() as { c: number }).c;
    expect(rowCount).toBe(1);
  });

  it('upsertUserProfile sets a positive updatedAt timestamp', () => {
    const before = Date.now();
    const result = upsertUserProfile(db, {
      conductorName: 'Ada',
      pronouns: '',
      conductorContext: '',
      defaultTone: 'collaborative',
      conductorColor: '',
      conductorAvatar: '',
    });
    const after = Date.now();
    expect(result.updatedAt).toBeGreaterThan(0);
    expect(result.updatedAt).toBeGreaterThanOrEqual(before);
    expect(result.updatedAt).toBeLessThanOrEqual(after);
  });

  it.each([
    'professional',
    'concise',
    'exploratory',
    'teaching',
  ] as const)('tone preset "%s" round-trips correctly', (tone) => {
    upsertUserProfile(db, { conductorName: '', pronouns: '', conductorContext: '', defaultTone: tone, conductorColor: '', conductorAvatar: '' });
    const profile = getUserProfile(db);
    expect(profile.defaultTone).toBe(tone);
  });
});
