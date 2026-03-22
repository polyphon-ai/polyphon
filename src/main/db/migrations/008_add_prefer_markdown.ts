import type Database from 'better-sqlite3';

export function up(db: Database.Database): void {
  db.exec(`ALTER TABLE user_profile ADD COLUMN prefer_markdown INTEGER NOT NULL DEFAULT 1`);
}
