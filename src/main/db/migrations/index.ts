import { DatabaseSync } from 'node:sqlite';
import { CREATE_TABLES_SQL, SCHEMA_VERSION } from '../schema';
import { up as migration003 } from './003_system_message_role';
import { up as migration004 } from './004_user_profile';
import { up as migration005 } from './005_archived';
import { up as migration006 } from './006_pronouns';
import { up as migration007 } from './007_custom_providers';
import { up as migration008 } from './008_voice_tone_override';
import { up as migration009 } from './009_tones_and_templates';
import { up as migration010 } from './010_sample_system_prompt_templates';
import { up as migration011 } from './011_conductor_color';
import { up as migration012 } from './012_conductor_avatar';
import { up as migration013 } from './013_provider_config_per_type';
import { up as migration014 } from './014_build_expiry';

export function runMigrations(db: DatabaseSync): void {
  db.exec(CREATE_TABLES_SQL);

  const row = db
    .prepare('SELECT version FROM schema_version LIMIT 1')
    .get() as { version: number } | undefined;

  const currentVersion = row?.version ?? 0;

  if (currentVersion === 1) {
    // v1 → v2: add cli_args column that wasn't in the original schema
    db.exec(`ALTER TABLE provider_configs ADD COLUMN cli_args TEXT`);
  }

  if (currentVersion <= 2) {
    // v2 → v3: expand messages.role CHECK to include 'system'
    migration003(db);
  }

  if (currentVersion <= 3) {
    // v3 → v4: add user_profile table
    migration004(db);
  }

  if (row !== undefined && currentVersion <= 4) {
    // v4 → v5: add archived column to compositions and sessions
    // Skip on fresh installs — CREATE_TABLES_SQL already includes the column.
    migration005(db);
  }

  if (row !== undefined && currentVersion <= 5) {
    // v5 → v6: add pronouns column to user_profile
    // Skip on fresh installs — CREATE_TABLES_SQL already includes the column.
    migration006(db);
  }

  if (row !== undefined && currentVersion <= 6) {
    // v6 → v7: add custom_providers table + custom_provider_id column on composition_voices
    // Skip on fresh installs — CREATE_TABLES_SQL already includes both.
    migration007(db);
  }

  if (row !== undefined && currentVersion <= 7) {
    // v7 → v8: add tone_override column to composition_voices
    // Skip on fresh installs — CREATE_TABLES_SQL already includes the column.
    migration008(db);
  }

  if (currentVersion <= 8) {
    // v8 → v9: add tones + system_prompt_templates tables; add system_prompt_template_id to composition_voices; seed built-in tones
    // Runs on fresh installs too (tables are created with IF NOT EXISTS; column guard is in the migration).
    migration009(db);
  }

  if (currentVersion <= 9) {
    // v9 → v10: seed sample system prompt templates
    // Runs on fresh installs too (INSERT OR IGNORE is safe to re-run).
    migration010(db);
  }

  if (row !== undefined && currentVersion <= 10) {
    // v10 → v11: add conductor_color column to user_profile
    // Skip on fresh installs — CREATE_TABLES_SQL already includes the column.
    migration011(db);
  }

  if (row !== undefined && currentVersion <= 11) {
    // v11 → v12: add conductor_avatar column to user_profile
    // Skip on fresh installs — CREATE_TABLES_SQL already includes the column.
    migration012(db);
  }

  if (row !== undefined && currentVersion <= 12) {
    // v12 → v13: change provider_configs unique constraint from (provider) to (provider, voice_type)
    // Skip on fresh installs — CREATE_TABLES_SQL already has the composite unique.
    migration013(db);
  }

  if (row !== undefined && currentVersion <= 13) {
    // v13 → v14: add build_expiry table for anti-clock-rollback expiry floor
    // Skip on fresh installs — CREATE_TABLES_SQL already includes the table.
    migration014(db);
  }

  if (row === undefined) {
    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(SCHEMA_VERSION);
  } else if (currentVersion < SCHEMA_VERSION) {
    db.prepare('UPDATE schema_version SET version = ?').run(SCHEMA_VERSION);
  }
}
