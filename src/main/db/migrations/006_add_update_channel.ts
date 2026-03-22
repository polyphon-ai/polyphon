import type Database from 'better-sqlite3';

export function up(db: Database.Database): void {
  db.exec("ALTER TABLE user_profile ADD COLUMN update_channel TEXT NOT NULL DEFAULT 'stable'");
}
