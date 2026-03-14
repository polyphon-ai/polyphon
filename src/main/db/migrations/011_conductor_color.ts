import { DatabaseSync } from 'node:sqlite';

export function up(db: DatabaseSync): void {
  // Guard: only run ALTER if the column doesn't already exist (fresh installs have it from CREATE_TABLES_SQL)
  const row = db
    .prepare(`SELECT * FROM pragma_table_info('user_profile') WHERE name = 'conductor_color'`)
    .get() as { name: string } | undefined;
  if (!row) {
    db.exec(`ALTER TABLE user_profile ADD COLUMN conductor_color TEXT NOT NULL DEFAULT ''`);
  }
}
