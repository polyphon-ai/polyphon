import { DatabaseSync } from 'node:sqlite';

export function up(db: DatabaseSync): void {
  db.exec(`ALTER TABLE user_profile ADD COLUMN dismissed_update_version TEXT NOT NULL DEFAULT ''`);
  db.exec(`ALTER TABLE user_profile ADD COLUMN update_remind_after INTEGER NOT NULL DEFAULT 0`);
}
