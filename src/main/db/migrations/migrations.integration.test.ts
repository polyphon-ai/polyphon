import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from './index';
import { initFieldEncryption, _resetForTests } from '../../security/fieldEncryption';
import { up as migration002 } from './002_add_update_preferences';

const TEST_KEY = Buffer.alloc(32);

describe('runMigrations (fresh install)', () => {
  beforeEach(() => { initFieldEncryption(TEST_KEY); });
  afterEach(() => { _resetForTests(); });

  it('creates all tables and sets schema_version to current', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA journal_mode = WAL');

    runMigrations(db);

    const expectedTables = [
      'schema_version',
      'compositions',
      'composition_voices',
      'sessions',
      'messages',
      'provider_configs',
      'custom_providers',
      'tones',
      'system_prompt_templates',
      'user_profile',
    ];

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[];
    const tableNames = tables.map((t) => t.name);

    for (const name of expectedTables) {
      expect(tableNames).toContain(name);
    }

    const row = db.prepare('SELECT version FROM schema_version').get() as { version: number };
    expect(row.version).toBe(7);
  });

  it('seeds built-in tones', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA journal_mode = WAL');

    runMigrations(db);

    const tones = db
      .prepare('SELECT id FROM tones WHERE is_builtin = 1 ORDER BY sort_order')
      .all() as { id: string }[];
    expect(tones.map((t) => t.id)).toEqual([
      'professional',
      'collaborative',
      'concise',
      'exploratory',
      'teaching',
    ]);
  });

  it('seeds sample system prompt templates', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA journal_mode = WAL');

    runMigrations(db);

    const templates = db
      .prepare('SELECT id FROM system_prompt_templates ORDER BY id')
      .all() as { id: string }[];
    expect(templates).toHaveLength(5);
  });

  it('is idempotent — running twice does not fail or duplicate data', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA journal_mode = WAL');

    runMigrations(db);
    runMigrations(db);

    const tones = db.prepare('SELECT id FROM tones WHERE is_builtin = 1').all();
    expect(tones).toHaveLength(5);

    const templates = db.prepare('SELECT id FROM system_prompt_templates').all();
    expect(templates).toHaveLength(5);

    const row = db.prepare('SELECT version FROM schema_version').get() as { version: number };
    expect(row.version).toBe(7);
  });
});

describe('migration 002 — update preferences', () => {
  beforeEach(() => { initFieldEncryption(TEST_KEY); });
  afterEach(() => { _resetForTests(); });

  it('runs cleanly on a v1 in-memory DB and adds new columns', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA journal_mode = WAL');

    // Simulate a v1 database (schema without the new columns)
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_profile (
        id INTEGER PRIMARY KEY CHECK(id = 1),
        conductor_name TEXT NOT NULL DEFAULT '',
        pronouns TEXT NOT NULL DEFAULT '',
        conductor_context TEXT NOT NULL DEFAULT '',
        default_tone TEXT NOT NULL DEFAULT 'collaborative',
        conductor_color TEXT NOT NULL DEFAULT '',
        conductor_avatar TEXT NOT NULL DEFAULT '',
        updated_at INTEGER NOT NULL
      );
    `);
    db.exec(`INSERT INTO user_profile (id, conductor_name, pronouns, conductor_context, default_tone, conductor_color, conductor_avatar, updated_at) VALUES (1, '', '', '', 'collaborative', '', '', 0)`);

    migration002(db);

    const row = db
      .prepare('SELECT dismissed_update_version, update_remind_after FROM user_profile WHERE id = 1')
      .get() as { dismissed_update_version: string; update_remind_after: number };

    expect(row.dismissed_update_version).toBe('');
    expect(row.update_remind_after).toBe(0);
  });

  it('fresh install via runMigrations includes the new columns', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA journal_mode = WAL');

    runMigrations(db);

    const row = db
      .prepare('SELECT dismissed_update_version, update_remind_after FROM user_profile WHERE id = 1')
      .get() as { dismissed_update_version: string; update_remind_after: number };

    expect(row.dismissed_update_version).toBe('');
    expect(row.update_remind_after).toBe(0);
  });
});
