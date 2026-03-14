import { DatabaseSync } from 'node:sqlite';

export function up(db: DatabaseSync): void {
  db.exec(`
    ALTER TABLE compositions ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE sessions ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
  `);
}
