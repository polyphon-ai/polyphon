import type Database from 'better-sqlite3';

export function up(db: Database.Database): void {
  db.exec('ALTER TABLE sessions ADD COLUMN sandboxed_to_working_dir INTEGER NOT NULL DEFAULT 0');
}
