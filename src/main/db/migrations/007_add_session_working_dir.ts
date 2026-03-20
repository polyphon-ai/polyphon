import { DatabaseSync } from 'node:sqlite';

export function up(db: DatabaseSync): void {
  db.exec(`ALTER TABLE sessions ADD COLUMN working_dir TEXT`);
}
