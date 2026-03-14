import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from './index';

describe('runMigrations (fresh install)', () => {
  it('creates all tables and sets schema_version to 1', () => {
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
      'build_expiry',
    ];

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[];
    const tableNames = tables.map((t) => t.name);

    for (const name of expectedTables) {
      expect(tableNames).toContain(name);
    }

    const row = db.prepare('SELECT version FROM schema_version').get() as { version: number };
    expect(row.version).toBe(1);
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
    expect(row.version).toBe(1);
  });
});
