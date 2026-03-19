import { DatabaseSync } from 'node:sqlite';

export function up(db: DatabaseSync): void {
  db.exec('ALTER TABLE provider_configs ADD COLUMN yolo_mode INTEGER NOT NULL DEFAULT 0');
}
