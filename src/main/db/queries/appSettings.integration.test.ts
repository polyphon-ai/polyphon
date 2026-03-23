import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../migrations';
import { getSetting, setSetting, getBooleanSetting, setBooleanSetting } from './appSettings';

describe('appSettings queries', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA journal_mode = WAL');
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('getSetting returns null for a missing key', () => {
    expect(getSetting(db, 'nonexistent')).toBeNull();
  });

  it('setSetting and getSetting round-trip a string value', () => {
    setSetting(db, 'test_key', 'hello');
    expect(getSetting(db, 'test_key')).toBe('hello');
  });

  it('setSetting overwrites an existing key', () => {
    setSetting(db, 'test_key', 'first');
    setSetting(db, 'test_key', 'second');
    expect(getSetting(db, 'test_key')).toBe('second');
  });

  it('getBooleanSetting returns fallback for missing key', () => {
    expect(getBooleanSetting(db, 'missing', false)).toBe(false);
    expect(getBooleanSetting(db, 'missing', true)).toBe(true);
  });

  it('setBooleanSetting and getBooleanSetting round-trip true', () => {
    setBooleanSetting(db, 'flag', true);
    expect(getBooleanSetting(db, 'flag', false)).toBe(true);
  });

  it('setBooleanSetting and getBooleanSetting round-trip false', () => {
    setBooleanSetting(db, 'flag', false);
    expect(getBooleanSetting(db, 'flag', true)).toBe(false);
  });

  it('multiple keys are independent', () => {
    setSetting(db, 'key_a', 'alpha');
    setSetting(db, 'key_b', 'beta');
    expect(getSetting(db, 'key_a')).toBe('alpha');
    expect(getSetting(db, 'key_b')).toBe('beta');
  });
});
