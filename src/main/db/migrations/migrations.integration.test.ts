import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations, applyMigration } from './index';
import { initFieldEncryption, _resetForTests } from '../../security/fieldEncryption';
import { up as migration002 } from './002_add_update_preferences';

// Builds an in-memory DB that looks like a v6 production database:
// all tables present, schema_version = 6, but missing the columns added
// by migrations 007 (sessions.working_dir) and 008 (user_profile.prefer_markdown).
function makeV6Database(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(`
    CREATE TABLE schema_version (version INTEGER NOT NULL);
    CREATE TABLE compositions (
      id TEXT PRIMARY KEY, name TEXT NOT NULL,
      mode TEXT NOT NULL CHECK(mode IN ('conductor','broadcast')),
      continuation_policy TEXT NOT NULL CHECK(continuation_policy IN ('none','prompt','auto')),
      continuation_max_rounds INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE composition_voices (
      id TEXT PRIMARY KEY, composition_id TEXT NOT NULL, provider TEXT NOT NULL,
      model TEXT, cli_command TEXT, cli_args TEXT, display_name TEXT NOT NULL,
      system_prompt TEXT, sort_order INTEGER NOT NULL, color TEXT NOT NULL,
      avatar_icon TEXT NOT NULL, custom_provider_id TEXT, tone_override TEXT,
      system_prompt_template_id TEXT
    );
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY, composition_id TEXT NOT NULL, name TEXT NOT NULL,
      mode TEXT NOT NULL CHECK(mode IN ('conductor','broadcast')),
      continuation_policy TEXT NOT NULL CHECK(continuation_policy IN ('none','prompt','auto')),
      continuation_max_rounds INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE messages (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL, role TEXT NOT NULL,
      voice_id TEXT, voice_name TEXT, content TEXT NOT NULL,
      timestamp INTEGER NOT NULL, round_index INTEGER NOT NULL, metadata TEXT
    );
    CREATE TABLE provider_configs (
      id TEXT PRIMARY KEY, provider TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
      voice_type TEXT NOT NULL DEFAULT 'api', default_model TEXT,
      cli_command TEXT, cli_args TEXT, yolo_mode INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      UNIQUE(provider, voice_type)
    );
    CREATE TABLE custom_providers (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
      base_url TEXT NOT NULL, api_key_env_var TEXT, default_model TEXT,
      deleted INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE tones (
      id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, description TEXT NOT NULL,
      is_builtin INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE system_prompt_templates (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, content TEXT NOT NULL,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE user_profile (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      conductor_name TEXT NOT NULL DEFAULT '',
      pronouns TEXT NOT NULL DEFAULT '',
      conductor_context TEXT NOT NULL DEFAULT '',
      default_tone TEXT NOT NULL DEFAULT 'collaborative',
      conductor_color TEXT NOT NULL DEFAULT '',
      conductor_avatar TEXT NOT NULL DEFAULT '',
      dismissed_update_version TEXT NOT NULL DEFAULT '',
      update_remind_after INTEGER NOT NULL DEFAULT 0,
      update_channel TEXT NOT NULL DEFAULT 'stable',
      updated_at INTEGER NOT NULL
    );
    INSERT INTO schema_version (version) VALUES (6);
    INSERT INTO user_profile (id, conductor_name, pronouns, conductor_context, default_tone,
      conductor_color, conductor_avatar, dismissed_update_version, update_remind_after,
      update_channel, updated_at)
    VALUES (1, '', '', '', 'collaborative', '', '', '', 0, 'stable', 0);
  `);
  return db;
}

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
    expect(row.version).toBe(8);
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
    expect(row.version).toBe(8);
  });
});

describe('incremental migration from v6', () => {
  beforeEach(() => { initFieldEncryption(TEST_KEY); });
  afterEach(() => { _resetForTests(); });

  it('applies migrations 007 and 008, advancing schema_version to 8', () => {
    const db = makeV6Database();
    runMigrations(db);
    const row = db.prepare('SELECT version FROM schema_version').get() as { version: number };
    expect(row.version).toBe(8);
  });

  it('adds working_dir column to sessions', () => {
    const db = makeV6Database();
    runMigrations(db);
    const cols = db.prepare('PRAGMA table_info(sessions)').all() as { name: string }[];
    expect(cols.map((c) => c.name)).toContain('working_dir');
  });

  it('adds prefer_markdown column to user_profile', () => {
    const db = makeV6Database();
    runMigrations(db);
    const cols = db.prepare('PRAGMA table_info(user_profile)').all() as { name: string }[];
    expect(cols.map((c) => c.name)).toContain('prefer_markdown');
  });
});

describe('crash-recovery: DDL already applied but schema_version not updated', () => {
  beforeEach(() => { initFieldEncryption(TEST_KEY); });
  afterEach(() => { _resetForTests(); });

  it('recovers when both v7 and v8 columns exist but schema_version is still 6', () => {
    const db = makeV6Database();
    // Simulate a crash after migrations 007 and 008 applied their DDL but before
    // schema_version was updated — exactly the state of the user's production DB.
    db.exec('ALTER TABLE sessions ADD COLUMN working_dir TEXT');
    db.exec('ALTER TABLE user_profile ADD COLUMN prefer_markdown INTEGER NOT NULL DEFAULT 1');

    runMigrations(db);

    const row = db.prepare('SELECT version FROM schema_version').get() as { version: number };
    expect(row.version).toBe(8);
  });

  it('does not throw and leaves data intact during recovery', () => {
    const db = makeV6Database();
    db.exec('ALTER TABLE sessions ADD COLUMN working_dir TEXT');
    db.exec('ALTER TABLE user_profile ADD COLUMN prefer_markdown INTEGER NOT NULL DEFAULT 1');
    db.prepare(
      `INSERT INTO sessions (id, composition_id, name, mode, continuation_policy,
        continuation_max_rounds, created_at, updated_at, archived)
       VALUES ('s1', 'c1', 'Test', 'broadcast', 'none', 1, 0, 0, 0)`
    ).run();

    expect(() => runMigrations(db)).not.toThrow();

    const session = db.prepare('SELECT working_dir FROM sessions WHERE id = ?').get('s1') as
      | { working_dir: string | null }
      | undefined;
    expect(session?.working_dir).toBeNull();
  });

});

describe('applyMigration — atomic transaction behaviour', () => {
  beforeEach(() => { initFieldEncryption(TEST_KEY); });
  afterEach(() => { _resetForTests(); });

  it('commits DDL and version bump together on success', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('CREATE TABLE schema_version (version INTEGER NOT NULL)');
    db.exec('INSERT INTO schema_version (version) VALUES (0)');
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)');

    applyMigration(db, 1, 0, (d) => {
      d.exec('ALTER TABLE t ADD COLUMN foo TEXT');
    });

    const row = db.prepare('SELECT version FROM schema_version').get() as { version: number };
    expect(row.version).toBe(1);
    const cols = db.prepare('PRAGMA table_info(t)').all() as { name: string }[];
    expect(cols.map((c) => c.name)).toContain('foo');
  });

  it('skips migration and leaves version unchanged when already at target', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('CREATE TABLE schema_version (version INTEGER NOT NULL)');
    db.exec('INSERT INTO schema_version (version) VALUES (5)');

    applyMigration(db, 5, 5, () => {
      throw new Error('should not run');
    });

    const row = db.prepare('SELECT version FROM schema_version').get() as { version: number };
    expect(row.version).toBe(5);
  });

  it('rolls back and re-throws on non-duplicate-column errors', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('CREATE TABLE schema_version (version INTEGER NOT NULL)');
    db.exec('INSERT INTO schema_version (version) VALUES (0)');

    expect(() =>
      applyMigration(db, 1, 0, () => {
        throw new Error('unexpected migration failure');
      })
    ).toThrow('unexpected migration failure');

    // Version must not have advanced — the transaction was rolled back.
    const row = db.prepare('SELECT version FROM schema_version').get() as { version: number };
    expect(row.version).toBe(0);
  });

  it('commits version bump on duplicate-column error (crash recovery)', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('CREATE TABLE schema_version (version INTEGER NOT NULL)');
    db.exec('INSERT INTO schema_version (version) VALUES (0)');
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, foo TEXT)');

    // Simulate a migration that tries to add a column that already exists.
    applyMigration(db, 1, 0, (d) => {
      d.exec('ALTER TABLE t ADD COLUMN foo TEXT'); // duplicate — already there
    });

    const row = db.prepare('SELECT version FROM schema_version').get() as { version: number };
    expect(row.version).toBe(1);
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
