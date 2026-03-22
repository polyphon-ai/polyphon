import type Database from 'better-sqlite3';

export function up(db: Database.Database): void {
  db.exec(`ALTER TABLE composition_voices ADD COLUMN enabled_tools TEXT NOT NULL DEFAULT '[]'`);
}
