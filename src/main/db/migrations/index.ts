import type Database from 'better-sqlite3';
import { TONE_PRESETS } from '../../../shared/constants';
import { CREATE_TABLES_SQL, SCHEMA_VERSION } from '../schema';
import { up as migration002 } from './002_add_update_preferences';
import { up as migration003 } from './003_encrypt_conductor_avatar';
import { up as migration004 } from './004_encrypt_tones_metadata_cli_command';
import { up as migration005 } from './005_add_yolo_mode';
import { up as migration006 } from './006_add_update_channel';
import { up as migration007 } from './007_add_session_working_dir';
import { up as migration008 } from './008_add_prefer_markdown';
import { up as migration009 } from './009_add_enabled_tools';
import { up as migration010 } from './010_add_session_sandbox';
import { up as migration011 } from './011_sqlcipher_transition';
import { up as migration012 } from './012_add_messages_fts';
import { up as migration013 } from './013_add_app_settings';

const SAMPLE_TEMPLATES: Array<[string, string, string]> = [
  [
    'sample-devils-advocate',
    "Devil's Advocate",
    `You are a devil's advocate. Your role is to challenge assumptions, question conclusions, and present the strongest possible counterarguments to whatever is being proposed. You do not necessarily believe the positions you argue — your goal is to stress-test ideas and expose weaknesses so the group can build more robust thinking. Be direct and pointed, not combative.`,
  ],
  [
    'sample-socratic-guide',
    'Socratic Guide',
    `You are a Socratic guide. Rather than providing direct answers, ask probing questions that help the conversation surface its own insights. Challenge assumptions gently, expose gaps in reasoning, and guide the group toward deeper understanding. When you do offer a perspective, frame it as a question or hypothesis rather than a conclusion.`,
  ],
  [
    'sample-creative-brainstormer',
    'Creative Brainstormer',
    `You are a creative brainstormer. Generate bold, unconventional ideas without filtering for feasibility. Quantity and diversity matter more than polish. Build on others' ideas with "yes, and..." energy. Avoid evaluating or critiquing during ideation — your job is to expand the possibility space as wide as possible.`,
  ],
  [
    'sample-pragmatic-implementer',
    'Pragmatic Implementer',
    `You are a pragmatic implementer. Your focus is on what can actually be done. Translate ideas into concrete next steps, surface practical constraints, and flag risks early. When the conversation drifts into the abstract, bring it back to: "What would we actually do, and how?"`,
  ],
  [
    'sample-domain-expert',
    'Domain Expert',
    `You are a domain expert and technical analyst. Provide precise, well-reasoned answers grounded in established knowledge. Cite relevant concepts, patterns, or prior art when applicable. Acknowledge the limits of your knowledge clearly. Prioritize accuracy over speed — if something is uncertain, say so and explain why.`,
  ],
];

// Runs a single migration atomically: the migration's DDL and the schema_version
// bump commit together. If the process crashes after DDL but before a prior
// COMMIT, the transaction is rolled back by SQLite and the migration re-runs
// cleanly on next startup.
//
// Crash-recovery exception: if the DDL already ran (a "duplicate column name"
// error), the column exists but the version was never bumped. In that case we
// treat the migration as applied and commit the version bump anyway.
// Any other error rolls back and re-throws.
export function applyMigration(
  db: Database.Database,
  targetVersion: number,
  currentVersion: number,
  up: (db: Database.Database) => void,
): void {
  if (currentVersion >= targetVersion) return;

  db.exec('BEGIN');
  try {
    up(db);
  } catch (err: any) {
    if (typeof err?.message === 'string' && err.message.includes('duplicate column name')) {
      // DDL already applied from a partial run — fall through to commit the version bump.
    } else {
      db.exec('ROLLBACK');
      throw err;
    }
  }
  db.prepare('UPDATE schema_version SET version = ?').run(targetVersion);
  db.exec('COMMIT');
}

export function runMigrations(db: Database.Database): void {
  db.exec(CREATE_TABLES_SQL);

  const now = Date.now();

  // Seed data — INSERT OR IGNORE so safe to re-run on every startup.
  const tonePresets: Array<[string, string, string, number]> = [
    ['professional', TONE_PRESETS.professional.label, TONE_PRESETS.professional.description, 1],
    ['collaborative', TONE_PRESETS.collaborative.label, TONE_PRESETS.collaborative.description, 2],
    ['concise', TONE_PRESETS.concise.label, TONE_PRESETS.concise.description, 3],
    ['exploratory', TONE_PRESETS.exploratory.label, TONE_PRESETS.exploratory.description, 4],
    ['teaching', TONE_PRESETS.teaching.label, TONE_PRESETS.teaching.description, 5],
  ];

  const insertTone = db.prepare(`
    INSERT OR IGNORE INTO tones (id, name, description, is_builtin, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, 1, ?, ?, ?)
  `);
  for (const [id, name, description, sortOrder] of tonePresets) {
    insertTone.run(id, name, description, sortOrder, now, now);
  }

  const insertTemplate = db.prepare(`
    INSERT OR IGNORE INTO system_prompt_templates (id, name, content, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const [id, name, content] of SAMPLE_TEMPLATES) {
    insertTemplate.run(id, name, content, now, now);
  }

  db.prepare(`
    INSERT OR IGNORE INTO user_profile (id, conductor_name, pronouns, conductor_context, default_tone, conductor_color, conductor_avatar, updated_at)
    VALUES (1, '', '', '', 'collaborative', '', '', ?)
  `).run(now);

  const row = db.prepare('SELECT version FROM schema_version LIMIT 1').get() as
    | { version: number }
    | undefined;

  if (row === undefined) {
    // Fresh install — CREATE_TABLES_SQL already reflects the complete schema.
    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(SCHEMA_VERSION);
    return;
  }

  // Existing database — apply any pending migrations, each atomically.
  const currentVersion = row.version;
  const apply = (v: number, up: (db: Database.Database) => void) => applyMigration(db, v, currentVersion, up);

  apply(2, migration002);
  apply(3, migration003);
  apply(4, migration004);
  apply(5, migration005);
  apply(6, migration006);
  apply(7, migration007);
  apply(8, migration008);
  apply(9, migration009);
  apply(10, migration010);
  apply(11, migration011);
  apply(12, migration012);
  apply(13, migration013);
}
