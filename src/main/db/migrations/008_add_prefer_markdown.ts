import { DatabaseSync } from 'node:sqlite';

export function up(db: DatabaseSync): void {
  db.exec(`ALTER TABLE user_profile ADD COLUMN prefer_markdown INTEGER NOT NULL DEFAULT 1`);
}
