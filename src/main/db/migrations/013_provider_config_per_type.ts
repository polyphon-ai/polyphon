import { DatabaseSync } from 'node:sqlite';

// v12 → v13: change provider_configs unique constraint from (provider) to (provider, voice_type)
// This allows one config row per provider+type combination so API and CLI can each be
// independently enabled and configured.
export function up(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE provider_configs_new (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      voice_type TEXT NOT NULL CHECK(voice_type IN ('api', 'cli')) DEFAULT 'api',
      default_model TEXT,
      cli_command TEXT,
      cli_args TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(provider, voice_type)
    );

    INSERT INTO provider_configs_new
      SELECT id, provider, enabled, voice_type, default_model, cli_command, cli_args, created_at, updated_at
      FROM provider_configs;

    DROP TABLE provider_configs;
    ALTER TABLE provider_configs_new RENAME TO provider_configs;
  `);
}
