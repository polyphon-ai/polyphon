import type Database from 'better-sqlite3';

export function up(db: Database.Database): void {
  db.exec(`ALTER TABLE sessions ADD COLUMN source TEXT NOT NULL DEFAULT 'polyphon'`);
}
