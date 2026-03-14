import type { DatabaseSync } from 'node:sqlite';

export function up(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS build_expiry (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      last_known_good_time INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
}
