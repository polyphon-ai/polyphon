import type Database from 'better-sqlite3';

export function up(db: Database.Database): void {
  db.exec('ALTER TABLE provider_configs ADD COLUMN yolo_mode INTEGER NOT NULL DEFAULT 0');
}
