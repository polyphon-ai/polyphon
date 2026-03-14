import { DatabaseSync } from 'node:sqlite';
import { TONE_PRESETS } from '../../../shared/constants';

export function up(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tones (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      is_builtin INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS system_prompt_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Guard: only run ALTER if the column doesn't already exist (fresh installs have it from CREATE_TABLES_SQL)
  const row = db
    .prepare(`SELECT * FROM pragma_table_info('composition_voices') WHERE name = 'system_prompt_template_id'`)
    .get() as { name: string } | undefined;
  if (!row) {
    db.exec(`ALTER TABLE composition_voices ADD COLUMN system_prompt_template_id TEXT`);
  }

  const now = Date.now();
  const presets: Array<[string, string, string, number]> = [
    ['professional', TONE_PRESETS.professional.label, TONE_PRESETS.professional.description, 1],
    ['collaborative', TONE_PRESETS.collaborative.label, TONE_PRESETS.collaborative.description, 2],
    ['concise', TONE_PRESETS.concise.label, TONE_PRESETS.concise.description, 3],
    ['exploratory', TONE_PRESETS.exploratory.label, TONE_PRESETS.exploratory.description, 4],
    ['teaching', TONE_PRESETS.teaching.label, TONE_PRESETS.teaching.description, 5],
  ];

  const insert = db.prepare(`
    INSERT OR IGNORE INTO tones (id, name, description, is_builtin, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, 1, ?, ?, ?)
  `);
  for (const [id, name, description, sortOrder] of presets) {
    insert.run(id, name, description, sortOrder, now, now);
  }
}
