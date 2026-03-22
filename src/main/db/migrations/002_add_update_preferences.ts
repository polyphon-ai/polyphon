import type Database from 'better-sqlite3';

export function up(db: Database.Database): void {
  db.exec(`ALTER TABLE user_profile ADD COLUMN dismissed_update_version TEXT NOT NULL DEFAULT ''`);
  db.exec(`ALTER TABLE user_profile ADD COLUMN update_remind_after INTEGER NOT NULL DEFAULT 0`);
}
