import { DatabaseSync } from 'node:sqlite';

export function up(db: DatabaseSync): void {
  const row = db
    .prepare(`SELECT * FROM pragma_table_info('user_profile') WHERE name = 'conductor_avatar'`)
    .get() as { name: string } | undefined;
  if (!row) {
    db.exec(`ALTER TABLE user_profile ADD COLUMN conductor_avatar TEXT NOT NULL DEFAULT ''`);
  }
}
