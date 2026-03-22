import { DatabaseSync } from 'node:sqlite';

export function up(db: DatabaseSync): void {
  db.exec('ALTER TABLE sessions ADD COLUMN sandboxed_to_working_dir INTEGER NOT NULL DEFAULT 0');
}
