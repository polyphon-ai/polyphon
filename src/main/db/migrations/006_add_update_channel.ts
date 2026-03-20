import { DatabaseSync } from 'node:sqlite';

export function up(db: DatabaseSync): void {
  db.exec("ALTER TABLE user_profile ADD COLUMN update_channel TEXT NOT NULL DEFAULT 'stable'");
}
