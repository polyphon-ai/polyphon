import { DatabaseSync } from 'node:sqlite';

export function up(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_profile (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      conductor_name TEXT NOT NULL DEFAULT '',
      conductor_context TEXT NOT NULL DEFAULT '',
      default_tone TEXT NOT NULL DEFAULT 'collaborative',
      updated_at INTEGER NOT NULL
    );

    INSERT OR IGNORE INTO user_profile (id, conductor_name, conductor_context, default_tone, updated_at)
    VALUES (1, '', '', 'collaborative', ${Date.now()});
  `);
}
