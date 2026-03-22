import { DatabaseSync } from 'node:sqlite';

export function up(db: DatabaseSync): void {
  db.exec(`ALTER TABLE composition_voices ADD COLUMN enabled_tools TEXT NOT NULL DEFAULT '[]'`);
}
