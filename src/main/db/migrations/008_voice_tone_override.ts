import { DatabaseSync } from 'node:sqlite';

export function up(db: DatabaseSync): void {
  db.exec(`ALTER TABLE composition_voices ADD COLUMN tone_override TEXT`);
}
